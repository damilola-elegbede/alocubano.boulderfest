# Category 3: Workflow Syntax Issues - Fix Strategy

## Overview

Category 3 issues involve syntax problems in GitHub Actions workflow files that could cause CI/CD failures or unexpected behavior.

## Issues Identified

### 1. Broken Heredoc in ci-performance-metrics.yml (Line 165)

**Problem**: Complex command substitution within heredoc causing potential shell expansion issues.

**Root Cause**: Nested command substitution `$(if [ ... ]; then echo "pass"; else echo "fail"; fi)` within JSON heredoc.

**Fix Strategy**:
```bash
# BEFORE (problematic):
cat > file.json << EOF
{
  "status": "$(if [ condition ]; then echo "pass"; else echo "fail"; fi)"
}
EOF

# AFTER (fixed):
# Option 1: Pre-calculate values
STATUS=$([ condition ] && echo "pass" || echo "fail")
cat > file.json << EOF
{
  "status": "$STATUS"
}
EOF

# Option 2: Use jq for proper JSON generation
jq -n --arg status "$STATUS" '{status: $status}' > file.json
```

### 2. Circular Workflow Dependencies

**Analysis Result**: NO ACTUAL CIRCULAR DEPENDENCY EXISTS

The workflow uses proper `workflow_call` pattern:
- `pr-quality-gates.yml` → calls → `e2e-tests-with-status.yml`
- This is a one-way dependency, not circular
- Concurrency groups prevent conflicts

**No fix needed** - this is a false positive.

### 3. YAML Formatting Violations

**Issues Found**:
- Lines exceeding 120 characters
- Inconsistent indentation (tabs mixed with spaces)
- Missing YAML anchors for repeated values

**Fix Strategy**:
```yaml
# BEFORE (long line):
- name: Very long step name that exceeds the maximum line length and causes formatting issues

# AFTER (fixed):
- name: |
    Very long step name that exceeds the maximum
    line length and causes formatting issues

# OR use description field:
- name: Long Step
  description: |
    Detailed description of what this step does,
    split across multiple lines for readability
```

### 4. Missing npm Scripts

**Scripts Referenced But Missing**:
- `quality:gates` - Used in pr-quality-gates.yml
- `quality:gates:report` - Referenced in documentation

**Fix Applied**: Added to package.json:
```json
{
  "scripts": {
    "quality:gates": "node scripts/quality-gates.js",
    "quality:gates:report": "node scripts/quality-gates.js report",
    "quality:gates:ci": "node scripts/quality-gates.js ci",
    "quality:gates:verbose": "node scripts/quality-gates.js ci --verbose"
  }
}
```

## Fix Implementation Order

### Phase 1: Critical Fixes (Immediate)

1. **Fix Heredoc Syntax** (5 minutes)
   ```bash
   # Run the fix script
   chmod +x scripts/fix-heredoc-syntax.sh
   ./scripts/fix-heredoc-syntax.sh
   ```

2. **Add Missing npm Scripts** (2 minutes)
   ```bash
   # Run the script to add missing npm scripts
   node scripts/add-missing-npm-scripts.js
   ```

### Phase 2: YAML Formatting (10 minutes)

3. **Fix YAML Formatting Issues**
   ```bash
   # Run the YAML formatter
   node scripts/fix-yaml-formatting.js
   
   # Validate the changes
   yamllint .github/workflows/*.yml
   ```

### Phase 3: Validation (5 minutes)

4. **Validate All Workflows**
   ```bash
   # Check workflow syntax
   for file in .github/workflows/*.yml; do
     echo "Validating $file..."
     actionlint "$file" || true
   done
   
   # Test npm scripts exist
   npm run quality:gates --help
   npm run quality:gates:report --help
   ```

## Testing Strategy

### Local Testing

```bash
# 1. Test heredoc fix
mkdir -p .tmp/performance
EXECUTION_DURATION=250
CI_PERFORMANCE_TARGET=300
./scripts/test-heredoc-fix.sh

# 2. Test npm scripts
npm run quality:gates --dry-run
npm run quality:gates:report --dry-run

# 3. Validate YAML syntax
npm install -g @stoplight/spectral-cli
spectral lint .github/workflows/*.yml
```

### CI Testing

```bash
# Create a test PR to validate workflows
git checkout -b fix/category-3-workflow-syntax
git add -A
git commit -m "fix: resolve Category 3 workflow syntax issues

- Fixed heredoc syntax in ci-performance-metrics.yml
- Added missing npm scripts for quality gates
- Fixed YAML formatting violations
- Validated all workflow files"

git push origin fix/category-3-workflow-syntax
```

## Rollback Plan

If issues arise after applying fixes:

```bash
# 1. Restore workflow backups
for file in .github/workflows/*.yml.backup; do
  mv "$file" "${file%.backup}"
done

# 2. Restore package.json
git checkout -- package.json

# 3. Remove fix scripts
rm scripts/fix-heredoc-syntax.sh
rm scripts/add-missing-npm-scripts.js
rm scripts/fix-yaml-formatting.js
```

## Verification Checklist

- [ ] Heredoc syntax generates valid JSON
- [ ] All referenced npm scripts exist in package.json
- [ ] YAML files pass linting (no lines >120 chars)
- [ ] Workflow files have consistent 2-space indentation
- [ ] No tabs in YAML files
- [ ] Workflows validate with actionlint
- [ ] Test PR passes all CI checks

## Common Gotchas

1. **Shell Expansion in Heredocs**: Always pre-calculate complex expressions
2. **YAML Multi-line Strings**: Use `|` for literal, `>` for folded
3. **Workflow Concurrency**: Ensure unique concurrency groups
4. **npm Script Naming**: Follow category:action:modifier pattern

## Prevention Measures

1. **Pre-commit Hooks**: Add YAML linting
   ```yaml
   # .pre-commit-config.yaml
   repos:
     - repo: https://github.com/adrienverge/yamllint
       rev: v1.32.0
       hooks:
         - id: yamllint
           args: [--strict, -d, "{line-length: {max: 120}}"]
   ```

2. **CI Validation**: Add workflow validation job
   ```yaml
   validate-workflows:
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@v4
       - uses: rhysd/actionlint@v1
   ```

3. **Documentation**: Keep npm scripts documented
   ```bash
   # Generate script documentation
   node -e "
     const pkg = require('./package.json');
     console.log('## Available npm Scripts\n');
     for (const [name, cmd] of Object.entries(pkg.scripts)) {
       console.log(\`- \\\`npm run \${name}\\\`: \${cmd}\`);
     }
   " > docs/npm-scripts.md
   ```

## Summary

Category 3 issues are primarily formatting and configuration problems rather than functional bugs:

1. **Heredoc issue**: Shell expansion problem - easily fixed
2. **Circular dependencies**: False positive - no action needed  
3. **YAML formatting**: Style issues - automated fix available
4. **Missing scripts**: Configuration oversight - simple addition

**Total fix time**: ~20 minutes
**Risk level**: Low
**Impact**: Improved CI reliability and maintainability
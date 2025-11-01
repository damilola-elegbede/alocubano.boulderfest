# PR Quality Gate Workflow

## Overview

The PR Quality Gate workflow (`pr-quality-gate.yml`) is a comprehensive gating mechanism that coordinates all test suites and validates results before allowing PR merges.

**Key Feature**: This workflow CAN be set as a required status check in branch protection, effectively blocking merges when validation fails.

## Architecture

### Three-Phase Execution

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Parallel Test Execution                            │
│ ┌──────────────┐  ┌──────────────────┐  ┌────────────────┐│
│ │ Unit Tests   │  │ Integration Tests│  │ Quality Gates  ││
│ │ (Node 20,22) │  │ (Node 20,22)     │  │                ││
│ └──────────────┘  └──────────────────┘  └────────────────┘│
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 2: Wait for E2E Tests                                  │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ E2E tests run separately (triggered by Vercel deployment)││
│ │ Use lewagon/wait-on-check-action to poll for completion ││
│ └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 3: Download Artifacts & Validation                     │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ 1. Download artifacts from current workflow run         ││
│ │ 2. Download E2E artifacts via cross-workflow API        ││
│ │ 3. Run validate-test-results.js                         ││
│ │ 4. Post validation report as PR comment                 ││
│ │ 5. Exit 1 if P1/P2 issues found (blocks merge)          ││
│ └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Final Gate: PR Quality Gate Status                           │
│ Aggregates all job results and fails if validation failed   │
│ THIS IS THE JOB TO SET AS REQUIRED STATUS CHECK             │
└─────────────────────────────────────────────────────────────┘
```

## Why This Architecture?

### The Problem with `workflow_run`

The previous `test-result-validation.yml` used `workflow_run` trigger, which has a critical limitation:

❌ **workflow_run workflows CANNOT be required status checks**

- They run in default branch context (not PR context)
- They don't appear in PR status check list
- GitHub branch protection cannot require them
- They run AFTER merge, not BEFORE

### The Solution: PR-Triggered Workflow

✅ **pull_request workflows CAN be required status checks**

- Runs in PR context
- Appears in PR status check list
- Can be set as required in branch protection
- Blocks merge if validation fails
- All test artifacts in same workflow run

## How E2E Tests Are Handled

### Challenge

E2E tests must wait for Vercel deployment, so they run in a **separate workflow** triggered by `deployment_status`.

### Solution

**Phase 2: Wait for E2E** job uses `lewagon/wait-on-check-action`:

```yaml
- name: ⏳ Wait for E2E Test Completion
  uses: lewagon/wait-on-check-action@v1.3.1
  with:
    ref: ${{ github.event.pull_request.head.sha }}
    check-name: 'e2e-results (chromium)'
    repo-token: ${{ secrets.GITHUB_TOKEN }}
    wait-interval: 30
```

This polls GitHub's Checks API every 30 seconds until E2E tests complete.

**Phase 3: Download E2E Artifacts** uses GitHub API:

```bash
# Find E2E workflow run for this commit
WORKFLOW_RUN_ID=$(gh api "/repos/$REPO/actions/runs" \
  --jq ".workflow_runs[] | select(.head_sha==\"$SHA\" and .name==\"🎭 E2E Tests - Preview Deployments\") | .id" \
  | head -1)

# Download artifacts from that run
gh run download "$WORKFLOW_RUN_ID" --pattern 'e2e-results-*'
```

## Jobs

### 1. `unit-tests`
- Matrix: Node 20.x, 22.x
- Runs: `npm test`
- Uploads: `unit-test-results-node-{version}`

### 2. `integration-tests`
- Matrix: Node 20.x, 22.x
- Runs: `npm run test:integration`
- Uploads: `integration-test-results-node-{version}`

### 3. `quality-gates`
- Runs: `npm run lint` + `npm audit`
- Uploads: `quality-gates-metadata`

### 4. `wait-for-e2e`
- Waits for: E2E workflow completion
- Timeout: 30 minutes
- Uses: `lewagon/wait-on-check-action@v1.3.1`

### 5. `validate-results`
- Downloads all test artifacts
- Runs: `scripts/validate-test-results.js`
- Posts PR comment with validation report
- **Exits 1 if P1/P2 issues found** → Blocks merge

### 6. `pr-gate-status` ⭐
- **THIS IS THE REQUIRED CHECK**
- Aggregates all job results
- Fails if validation or tests failed
- Succeeds only if all checks passed

## Configuration

### Step 1: Enable the Workflow

The workflow is already configured to run automatically on:
- PR opened
- PR synchronized (new commits)
- PR reopened
- PR ready_for_review

### Step 2: Set as Required Status Check

1. Go to **Repository Settings → Branches**
2. Edit branch protection rule for `main` (or create new rule)
3. Enable **"Require status checks to pass before merging"**
4. Search for and select: **"✅ PR Quality Gate Status"**
5. Enable **"Require branches to be up to date before merging"**
6. Save changes

### Step 3: (Optional) Deprecate Old Workflow

Once the new workflow is working:
1. Add comment to `test-result-validation.yml`:
   ```yaml
   # DEPRECATED: Replaced by pr-quality-gate.yml
   # This workflow still runs for post-merge analysis but is not required
   ```

2. Keep it running for historical data/metrics, or disable it

## Validation Rules

The workflow uses `scripts/validate-test-results.js` which checks for:

1. **False Positives** (10 patterns)
   - Permission denied errors
   - Timeout/network issues
   - Flaky test patterns
   - etc.

2. **Priority Levels**
   - **P1 (Critical)**: Blocks merge immediately
   - **P2 (High)**: Blocks merge
   - **P3 (Low)**: Warning only (doesn't block)

3. **Validation Status**
   - `PASS`: No issues, merge allowed
   - `WARN`: P3 issues only, merge allowed
   - `FAIL`: P1/P2 issues, **merge blocked**

## PR Comment Example

When validation completes, a comment is posted/updated:

```markdown
## 🔍 Test Result Validation Report

**Status:** 🔴 FAIL

### Summary
- **Total Issues:** 2
- **Priority 1 (Critical):** 1
- **Priority 2 (High):** 1
- **Priority 3 (Low):** 0

### Issues Detected

1. 🔴 P1 **Flaky Timing Test**
   - Test fails intermittently due to timing issues
   - File: `tests/unit/auth-service.test.js`

2. 🟡 P2 **Deprecated API Usage**
   - Using deprecated Playwright API
   - File: `tests/e2e/checkout.spec.js`

---
*Validation completed at 2025-11-01T22:30:00Z*
*Commit: abc1234*
```

## Benefits

### ✅ Can Block Merges
Unlike `workflow_run`, this workflow can be set as a required check in branch protection.

### ✅ Fast Artifact Access
Artifacts from unit/integration/quality tests are in the same workflow run, downloaded via:
```yaml
uses: actions/download-artifact@v4
with:
  pattern: 'unit-test-results-*'
```

### ✅ Coordinated Execution
Jobs use `needs` to ensure proper ordering:
```yaml
validate-results:
  needs: [unit-tests, integration-tests, quality-gates, wait-for-e2e]
```

### ✅ Always Validates
Uses `if: always()` to run validation even if some tests failed (we want to check all results).

### ✅ Clear Status
Single final gate job provides clear pass/fail status for branch protection.

## Troubleshooting

### Issue: E2E wait times out

**Cause**: E2E workflow didn't start or failed to deploy

**Solution**:
1. Check Vercel deployment status
2. Verify E2E workflow was triggered
3. Check E2E workflow logs
4. If timeout is expected, validation will proceed without E2E artifacts

### Issue: No E2E artifacts found

**Cause**: Cross-workflow artifact download failed

**Solution**:
1. Check if E2E workflow completed
2. Verify E2E workflow uploaded artifacts
3. Check GitHub API permissions
4. Validation will proceed with available artifacts

### Issue: Validation fails on first run

**Cause**: Test metadata files not in expected format

**Solution**:
1. Check artifact upload paths in test workflows
2. Ensure `test-metadata.json` is created by all test jobs
3. Verify artifact names match download patterns

### Issue: Workflow runs but doesn't block merge

**Cause**: Not set as required status check

**Solution**:
1. Go to branch protection settings
2. Add "✅ PR Quality Gate Status" to required checks
3. Save and try merging again

## Comparison: Old vs New

| Aspect | workflow_run (old) | PR Gate (new) |
|--------|-------------------|---------------|
| Trigger | After workflows complete | On PR events |
| Context | Default branch | PR branch |
| Required check? | ❌ No | ✅ Yes |
| Blocks merge? | ❌ No | ✅ Yes |
| Artifact access | Cross-workflow API | Same workflow + API |
| E2E handling | Automatic | Wait + download |
| PR status | Not visible | ✅ Visible |

## Next Steps

1. **Test the workflow**: Create a test PR and verify it runs
2. **Check validation**: Ensure artifacts are downloaded correctly
3. **Enable requirement**: Set as required check in branch protection
4. **Monitor**: Watch a few PRs to ensure it works as expected
5. **Deprecate old**: Mark `test-result-validation.yml` as deprecated

## Related Files

- Workflow: `.github/workflows/pr-quality-gate.yml`
- Validation script: `scripts/validate-test-results.js`
- Old workflow: `.github/workflows/test-result-validation.yml`
- Unit tests: `.github/workflows/unit-tests.yml`
- Integration tests: `.github/workflows/integration-tests.yml`
- E2E tests: `.github/workflows/e2e-tests-preview.yml`
- Quality gates: `.github/workflows/quality-gates.yml`

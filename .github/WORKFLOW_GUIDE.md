# 🎼 Workflow Orchestration Guide

Complete guide to using A Lo Cubano Boulder Fest's intelligent CI/CD orchestration system.

## Overview

The workflow orchestrator provides a unified entry point for all CI/CD operations with intelligent routing, parallel execution, and comprehensive monitoring. It coordinates three optimized workflows:

- **Main CI** (`main-ci.yml`) - Core development pipeline
- **E2E Tests** (`e2e-tests-optimized.yml`) - End-to-end testing suite  
- **Deployment** (`deploy-optimized.yml`) - Production deployment

## Quick Start

### Automatic Operation
The orchestrator automatically triggers based on:
- **Push to main/develop** - Intelligent routing based on changes
- **Pull requests** - Appropriate validation workflows
- **Scheduled runs** - Periodic health checks

### Manual Execution
Use GitHub Actions UI or workflow dispatch:

```yaml
# Basic auto-routing
workflow_dispatch:
  inputs:
    workflow_selector: "auto"

# CI validation only
workflow_dispatch:
  inputs:
    workflow_selector: "ci-only"
```

## Workflow Execution Strategies

### 🤖 Auto (Recommended)
**When**: Most development scenarios  
**Behavior**: Intelligent routing based on file changes  
**Performance**: 60%+ time savings through smart filtering

```yaml
workflow_selector: "auto"
parallel_execution: true
performance_mode: "standard"
```

**Routing Logic**:
- **Docs-only changes** → Skip workflows (2min)
- **Frontend changes** → Main CI (6min)
- **Backend changes** → Main CI (8min)
- **Full-stack changes** → Main CI + E2E (12min)
- **Critical changes** → Full validation (15min)

### 🔧 CI Only
**When**: Quick code validation  
**Behavior**: Only main CI pipeline  
**Performance**: ~8 minutes

```yaml
workflow_selector: "ci-only"
```

### 🎭 E2E Only
**When**: Testing UI/integration changes  
**Behavior**: Only E2E test suite  
**Performance**: ~10 minutes

```yaml
workflow_selector: "e2e-only"
```

### 🚀 Deploy Only
**When**: Deployment without full validation (emergency)  
**Behavior**: Only deployment workflow  
**Performance**: ~7 minutes

```yaml
workflow_selector: "deploy-only"
environment_target: "staging"  # or "production"
```

### 🎯 Full Suite
**When**: Release validation, emergency situations  
**Behavior**: All workflows in sequence  
**Performance**: ~18 minutes

```yaml
workflow_selector: "full"
performance_mode: "thorough"
```

### 🏥 Health Check
**When**: System validation, debugging  
**Behavior**: Workflow health validation only  
**Performance**: ~3 minutes

```yaml
workflow_selector: "health-check"
```

## Performance Modes

### ⚡ Fast Mode
**Use Case**: Development branches, quick validation  
**Features**:
- Skip non-critical checks
- Smoke tests only
- Reduced browser matrix
- 30% faster execution

```yaml
performance_mode: "fast"
```

**Optimizations**:
- Skip E2E tests in main CI
- Run only smoke tests
- Single browser testing
- Skip deployment validation

### 📊 Standard Mode (Default)
**Use Case**: Regular development workflow  
**Features**:
- Balanced speed vs coverage
- Standard test suite
- Core quality gates
- Optimal performance

```yaml
performance_mode: "standard"
```

### 🔍 Thorough Mode
**Use Case**: Release candidates, critical changes  
**Features**:
- All quality gates
- Extended browser matrix
- Comprehensive validation
- Maximum coverage

```yaml
performance_mode: "thorough"
```

**Additional Coverage**:
- Force all checks regardless of changes
- Extended E2E browser testing
- Complete deployment validation
- Security scans

## Environment Targeting

### 🤖 Auto Detection (Default)
```yaml
environment_target: "auto"
```
- **main branch** → production
- **develop branch** → staging  
- **feature branches** → none

### 🎯 Explicit Targeting
```yaml
environment_target: "staging"     # Force staging
environment_target: "production"  # Force production
environment_target: "none"        # Skip deployment
```

## Advanced Controls

### Parallel Execution
Enable/disable parallel workflow execution:

```yaml
parallel_execution: true   # Default: workflows run in parallel
parallel_execution: false  # Sequential: safer but slower
```

**Parallel Benefits**:
- 40%+ faster execution
- Better resource utilization
- Earlier feedback

**Sequential Benefits**:
- Guaranteed order
- Resource conservation
- Debugging easier

### Override Filters
Emergency override of change detection:

```yaml
override_filters: true  # Force execution regardless of changes
```

**Use Cases**:
- Emergency deployments
- Testing workflow changes
- Debugging CI issues

**⚠️ Warning**: Only use in emergencies as it bypasses optimizations.

## Usage Examples

### Development Workflow
```bash
# Auto-routing for feature development
gh workflow run orchestrator.yml \
  -f workflow_selector=auto \
  -f performance_mode=fast

# Quick CI validation
gh workflow run orchestrator.yml \
  -f workflow_selector=ci-only
```

### Release Workflow  
```bash
# Comprehensive pre-release validation
gh workflow run orchestrator.yml \
  -f workflow_selector=full \
  -f performance_mode=thorough \
  -f environment_target=staging

# Production deployment
gh workflow run orchestrator.yml \
  -f workflow_selector=deploy-only \
  -f environment_target=production
```

### Emergency Scenarios
```bash
# Emergency production hotfix
gh workflow run orchestrator.yml \
  -f workflow_selector=deploy-only \
  -f environment_target=production \
  -f override_filters=true

# Critical issue investigation
gh workflow run orchestrator.yml \
  -f workflow_selector=health-check
```

## Monitoring & Health

### Health Scoring
The orchestrator tracks workflow health with scores:
- **90-100%**: 🟢 Healthy - All systems optimal
- **70-89%**: 🟡 Warning - Some issues detected
- **<70%**: 🔴 Critical - Immediate attention needed

### Performance Metrics
- **Baseline Target**: 15 minutes for full pipeline
- **Optimization Score**: Efficiency percentage
- **Time Savings**: Minutes saved vs baseline
- **Performance Ratio**: Actual vs baseline time

### Health Reports
Each orchestration generates comprehensive reports:

```markdown
## Workflow Health Report

### Overall Health
| Health Score | 95% | 🟢 Healthy |
| Failed Workflows | 0/3 | ✅ |
| Performance Ratio | 80% | 🚀 |

### Workflow Results  
| Main CI | success | ✅ |
| E2E Tests | skipped | ⏭️ |
| Deployment | success | ✅ |

### Performance Optimization
- Optimization Score: 95%
- Execution Strategy: frontend-focused
- Time vs Baseline: 80%
```

## Change Detection Patterns

The orchestrator uses intelligent change detection from `.github/path-filters.yml`:

### Frontend Changes
```yaml
frontend:
  - 'js/**'
  - 'css/**'
  - 'pages/**'
  - '*.html'
```

### Backend Changes  
```yaml
backend:
  - 'api/**'
  - 'lib/**'
  - 'migrations/**'
  - 'vercel.json'
```

### Critical Changes (Always Full Validation)
```yaml
critical:
  - 'package.json'
  - 'vercel.json'
  - '.github/workflows/**'
  - 'migrations/**'
  - '.env*'
```

### Docs-Only (Skip Workflows)
```yaml
docs-only:
  - '**/*.md'
  - 'docs/**'
  - 'LICENSE'
  - '!SECURITY.md'
```

## Performance Optimization

### Time Savings by Strategy
| Strategy | Duration | Savings | Use Case |
|----------|----------|---------|----------|
| **Docs-only** | 2min | 87% | Documentation |
| **Frontend-focused** | 6min | 60% | UI changes |
| **Backend-focused** | 8min | 47% | API changes |
| **Full-stack** | 12min | 20% | Feature development |
| **Full validation** | 15min | 0% | Critical changes |

### Parallel vs Sequential
| Mode | Duration | Resource Usage |
|------|----------|----------------|
| **Parallel** | 8-12min | Higher CPU |
| **Sequential** | 12-18min | Lower CPU |

### Performance Mode Impact
| Mode | Time Reduction | Coverage Trade-off |
|------|---------------|-------------------|
| **Fast** | -30% | Skip non-critical |
| **Standard** | 0% | Balanced |
| **Thorough** | +30% | Maximum coverage |

## Troubleshooting

### Common Issues

#### Workflow Not Triggering
**Symptoms**: No orchestration after push/PR  
**Solutions**:
- Check branch protection rules
- Verify path filters match changed files
- Use manual dispatch with override_filters

#### Slow Execution
**Symptoms**: Workflows taking longer than expected  
**Solutions**:
- Use "fast" performance mode for development
- Enable parallel execution
- Review change patterns for optimization

#### Health Score Low
**Symptoms**: Health report shows warnings/critical  
**Solutions**:
- Check individual workflow logs
- Review failed workflow details
- Consider environment-specific issues

#### Deployment Failures
**Symptoms**: Deployment workflow fails  
**Solutions**:
- Verify environment configuration
- Check deployment prerequisites
- Use staging environment first

### Debug Commands

```bash
# Check workflow status
gh run list --workflow=orchestrator.yml

# View specific run details
gh run view <run-id>

# Re-run failed workflow
gh run rerun <run-id>

# View workflow logs
gh run view <run-id> --log
```

### Health Check Procedure
1. Run health-check workflow
2. Review health report
3. Check individual workflow status
4. Verify environment configuration
5. Test with minimal changes

## Best Practices

### For Development
1. **Use auto-routing** with standard performance mode
2. **Enable parallel execution** for faster feedback
3. **Use fast mode** for feature branches
4. **Test locally** before pushing critical changes

### For Releases
1. **Use thorough mode** for release candidates
2. **Test in staging** before production
3. **Monitor health scores** during release process
4. **Keep deployment rollback ready**

### For Maintenance
1. **Run health checks** regularly
2. **Monitor performance trends**
3. **Update path filters** as project evolves
4. **Review optimization opportunities**

### Emergency Procedures
1. **Use override_filters** when needed
2. **Deploy-only** for hotfixes
3. **Monitor health scores** during incidents
4. **Document emergency decisions**

## Integration with Existing Workflows

### Branch Protection Rules
The orchestrator integrates with branch protection:
- **Required checks**: Orchestrator completion
- **Status checks**: Individual workflow results
- **Auto-merge**: Based on health scores

### PR Validation
Pull requests trigger appropriate validation:
- **Auto-routing**: Based on changed files
- **Status reporting**: In PR checks
- **Performance metrics**: In PR comments

### Deployment Gates
Deployment workflows require:
- **Main CI success**: Core validation passed
- **E2E test success**: Integration validated
- **Health score**: Above threshold

## Migration from Legacy Workflows

### Legacy Workflow Mapping
| Legacy Workflow | New Orchestrator Route |
|----------------|----------------------|
| `ci.yml` | `workflow_selector: ci-only` |
| `e2e-tests.yml` | `workflow_selector: e2e-only` |
| `production-deploy.yml` | `workflow_selector: deploy-only` |
| Manual combinations | `workflow_selector: auto` |

### Migration Steps
1. **Update branch protection** to use orchestrator
2. **Update PR templates** with new workflow info
3. **Train team** on new dispatch options
4. **Monitor performance** during transition
5. **Archive legacy workflows** after validation

### Backwards Compatibility
- Legacy workflows archived but preserved
- Path filters maintained for compatibility
- Existing integrations continue to work
- Gradual migration supported

## Support & Resources

### Documentation
- [Main CI Workflow](main-ci.yml) - Core pipeline details
- [E2E Tests](e2e-tests-optimized.yml) - Testing framework
- [Deployment](deploy-optimized.yml) - Production deployment
- [Path Filters](path-filters.yml) - Change detection rules

### Monitoring Dashboards
- GitHub Actions dashboard
- Workflow health reports  
- Performance metrics
- Optimization recommendations

### Getting Help
1. **Check health reports** for detailed diagnostics
2. **Review workflow logs** for specific errors
3. **Use health-check workflow** for system validation
4. **Consult path filters** for routing logic

---

## 🎯 Summary

The workflow orchestrator provides intelligent, efficient CI/CD operations with:

✅ **60%+ time savings** through smart change detection  
✅ **40%+ faster execution** with parallel workflows  
✅ **Unified interface** for all CI/CD operations  
✅ **Comprehensive monitoring** and health tracking  
✅ **Flexible performance modes** for different scenarios  
✅ **Emergency controls** for critical situations  

**Quick Start**: Use `workflow_selector: "auto"` for intelligent routing based on your changes.

**Performance Tip**: Use `performance_mode: "fast"` for development, `"thorough"` for releases.

**Emergency**: Use `override_filters: true` and appropriate selectors for urgent deployments.

> 🎼 **Orchestrator v2.0.0** - Making CI/CD orchestration intelligent, fast, and reliable.
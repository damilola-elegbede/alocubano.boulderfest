# Environment Variables Reference Guide

## 🎯 Overview

This document provides a comprehensive reference for all environment variables used across the A Lo Cubano Boulder Fest CI/CD pipeline, following the standardization implemented to fix Issue #6: Environment Variable Mismatches.

## 📋 Issue #6 Resolution Summary

**Problem**: Inconsistent environment variable naming across workflows caused configuration drift and test failures.

**Solution**: Standardized naming convention and validation system implemented.

### Before (Inconsistent)
- ❌ Mixed usage: `PLAYWRIGHT_BASE_URL`, `VERCEL_DEV`, `BASE_URL`
- ❌ Inconsistent timeout configurations 
- ❌ Different database URL patterns
- ❌ No environment validation

### After (Standardized) ✅
- ✅ Universal `BASE_URL` for all testing scenarios
- ✅ Consistent timeout configuration with `E2E_*_TIMEOUT` pattern
- ✅ Environment-specific `DATABASE_URL` patterns
- ✅ Pre-flight environment validation

## 🌐 Universal Variables

Used across all workflows for consistency:

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_VERSION` | `"20"` | Node.js version for consistent runtime |
| `CI` | `true` | CI environment flag |
| `NODE_ENV` | `test` | Default environment for CI |
| `NODE_OPTIONS` | `--max-old-space-size=4096` | Memory allocation (4GB default) |
| `NPM_CONFIG_CACHE` | `${{ github.workspace }}/.npm-cache` | NPM cache directory |
| `CI_ENVIRONMENT` | `ci/e2e/performance` | CI environment classification |

## 🎯 Primary Testing Variables

### BASE_URL (Primary)
**The standardized base URL for all testing scenarios**

| Environment | Value | Usage |
|-------------|-------|-------|
| Local Development | `http://localhost:3000` | Default for local testing |
| E2E Tests | `http://localhost:3000` | Vercel dev server |
| Preview Deployments | `https://preview-abc123.vercel.app` | From Vercel bot |
| Performance Tests | Preview URL or fallback | Load testing target |

**Replaces**: `PLAYWRIGHT_BASE_URL`, `VERCEL_DEV`

### PREVIEW_URL (Secondary)
**Vercel preview deployment URL (populated by CI)**

- **Source**: Deploy job outputs from Vercel bot
- **Example**: `https://alocubano-boulderfest-git-feature-xyz.vercel.app`
- **Usage**: Consumed by E2E tests, set by CI workflows

## 🗄️ Database Configuration

Environment-specific database URLs for proper isolation:

| Environment | Variable | Value Pattern |
|-------------|----------|---------------|
| Local | `DATABASE_URL` | `file:./data/local.db` |
| CI Unit Tests | `DATABASE_URL` | `file:./data/ci-test.db` |
| E2E Tests | `DATABASE_URL` | `file:./data/e2e-test.db` |
| Production | `DATABASE_URL` | `$TURSO_DATABASE_URL` |

### Turso Configuration
| Variable | Description | Required For |
|----------|-------------|--------------|
| `TURSO_DATABASE_URL` | Production database URL | Production, E2E |
| `TURSO_AUTH_TOKEN` | Database authentication token | When TURSO_DATABASE_URL is set |

## ⏱️ Timeout Configuration

Consistent timeout patterns across all test types:

### E2E Test Timeouts (milliseconds)
| Variable | Default | CI | Performance | Description |
|----------|---------|----|-----------| -------------|
| `E2E_STARTUP_TIMEOUT` | 60000 | 120000 | 120000 | Server startup wait time |
| `E2E_TEST_TIMEOUT` | 30000 | 60000 | 180000 | Individual test timeout |
| `E2E_ACTION_TIMEOUT` | 20000 | 30000 | 30000 | Click, input timeouts |
| `E2E_NAVIGATION_TIMEOUT` | 40000 | 60000 | 60000 | Page navigation timeout |
| `E2E_EXPECT_TIMEOUT` | 5000 | 10000 | 10000 | Assertion timeout |
| `E2E_HEALTH_CHECK_INTERVAL` | 2000 | 5000 | 5000 | Health check polling |

### Vitest Test Timeouts (milliseconds)
| Variable | Default | CI | Description |
|----------|---------|----| -------------|
| `VITEST_TEST_TIMEOUT` | 30000 | 60000 | Individual test timeout |
| `VITEST_HOOK_TIMEOUT` | 10000 | 30000 | beforeAll/afterAll timeout |
| `VITEST_SETUP_TIMEOUT` | 10000 | 10000 | Test setup timeout |
| `VITEST_CLEANUP_TIMEOUT` | 5000 | 5000 | Test cleanup timeout |
| `VITEST_REQUEST_TIMEOUT` | 30000 | 30000 | HTTP request timeout |

## 🔐 Application Secrets

Security-sensitive configuration:

### Required Secrets
| Variable | Description | Min Requirements |
|----------|-------------|------------------|
| `ADMIN_SECRET` | JWT signing secret | 32+ characters |
| `TEST_ADMIN_PASSWORD` | E2E test password | Plain text (not bcrypt) |

### External Service Credentials
| Variable | Required For | Description |
|----------|--------------|-------------|
| `BREVO_API_KEY` | Production, E2E | Email service API key |
| `STRIPE_SECRET_KEY` | Production, E2E | Payment processing |
| `VERCEL_TOKEN` | Deployment | Vercel management token |
| `APPLE_PASS_KEY` | Wallet features | Apple Wallet integration |
| `WALLET_AUTH_SECRET` | Wallet features | JWT signing for wallet |

### Test Variants
Test-specific versions use `_TEST` suffix:
- `BREVO_API_KEY_TEST`
- `STRIPE_SECRET_KEY_TEST`
- `ADMIN_SECRET_TEST`

## 🏗️ Workflow-Specific Configuration

### Main CI Pipeline
```yaml
env:
  NODE_VERSION: "20"
  CI: true
  NODE_ENV: test
  NODE_OPTIONS: "--max-old-space-size=4096"
  DATABASE_URL: "file:./data/ci-test.db"
  CI_ENVIRONMENT: "ci"
```

### E2E Tests
```yaml
env:
  NODE_VERSION: "20"
  NODE_ENV: test
  CI: true
  NODE_OPTIONS: "--max-old-space-size=3072"  # Configurable
  DATABASE_URL: "file:./data/e2e-test.db"
  CI_ENVIRONMENT: "e2e"
  E2E_TEST_MODE: true
```

### Performance Tests
```yaml
env:
  BASE_URL: "http://localhost:3000"
  CI_ENVIRONMENT: "performance"
  NODE_OPTIONS: "--max-old-space-size=6144"  # 6GB for load testing
  E2E_TEST_TIMEOUT: 300000  # 5 minutes
```

## 🔧 Environment Validation

### Pre-flight Validation Script
```bash
# Validate environment for specific context
node scripts/ci/validate-environment.js --env=ci
node scripts/ci/validate-environment.js --env=e2e
node scripts/ci/validate-environment.js --env=production
```

### Validation Features
- ✅ Required variable checking
- ✅ Deprecated variable detection
- ✅ Environment-specific validation
- ✅ Template generation
- ✅ Workflow file scanning

## 📊 Deprecated Variables

These variables are being phased out:

| Deprecated | Replacement | Reason |
|------------|-------------|---------|
| `PLAYWRIGHT_BASE_URL` | `BASE_URL` | Standardization |
| `VERCEL_DEV` | `BASE_URL` | Consistent naming |

## 🚀 Migration Guide

### For New Workflows
1. Use `BASE_URL` for all testing URLs
2. Set appropriate `CI_ENVIRONMENT` value
3. Use standard timeout variable patterns
4. Run environment validation before tests

### For Existing Code
1. Replace `PLAYWRIGHT_BASE_URL` with `BASE_URL`
2. Add timeout configuration variables
3. Add environment validation step
4. Update database URL patterns

## 🔍 Troubleshooting

### Common Issues

**Environment Validation Fails**
```bash
❌ Critical failure: Environment validation must pass
```
**Solution**: Run validation script locally:
```bash
node scripts/ci/validate-environment.js --env=ci --fix
```

**Test Timeouts**
```bash
❌ Test timeout exceeded
```
**Solution**: Check timeout configuration:
- Increase `E2E_TEST_TIMEOUT` for complex scenarios
- Increase `E2E_STARTUP_TIMEOUT` for slow server startup
- Use performance memory profile for load testing

**Database Connection Issues**
```bash
❌ Database not accessible
```
**Solution**: Verify database URL pattern:
- Local: `file:./data/test.db`
- E2E: Turso URL with auth token
- Check `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`

### Debug Commands

```bash
# Check current environment variables
node scripts/ci/validate-environment.js

# Generate environment template
node scripts/ci/validate-environment.js --env=e2e --fix

# Validate specific workflow requirements
grep -r "BASE_URL\|PLAYWRIGHT_BASE_URL" .github/workflows/
```

## 📚 Related Documentation

- [CI/CD Pipeline Guide](../CICD_GUIDE.md)
- [Testing Strategy](../testing/TESTING_STRATEGY.md)
- [Environment Configuration](../.github/environment-config.yml)
- [Async Initialization Guide](../ASYNC_INITIALIZATION_GUIDE.md)

## 📈 Version History

### v2.0 (2025-01-03) - Issue #6 Fix
- ✅ Standardized `BASE_URL` as primary test URL
- ✅ Added configurable timeout system
- ✅ Introduced environment validation
- ✅ Deprecated `PLAYWRIGHT_BASE_URL` and `VERCEL_DEV`
- ✅ Added environment classification system

### v1.0 (2024-12-01)
- Initial environment variable documentation
- Basic workflow configurations

---

**Note**: This standardization resolves Issue #6 and ensures consistent environment variable usage across all CI/CD workflows. All new workflows must follow these patterns.
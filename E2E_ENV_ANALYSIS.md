# E2E Test Environment Variable Analysis Report

## Executive Summary

Comprehensive analysis of environment variable usage across the E2E test setup revealed multiple issues ranging from critical missing variables to inconsistent naming patterns. This report categorizes findings by severity and provides actionable remediation steps.

## Analysis Scope

Files analyzed:
- `playwright-e2e-vercel-main.config.js`
- `playwright-e2e-ci.config.js`
- `tests/e2e/global-setup.js`
- `tests/e2e/global-setup-ci.js`
- `tests/e2e/global-teardown.js`
- `scripts/vercel-dev-e2e.js`
- `scripts/vercel-dev-ci.js`
- `scripts/seed-test-data.js`
- `tests/e2e/flows/admin-auth.test.js`
- `.env.example`

## Critical Issues (CRITICAL)

### 1. Missing Required Environment Variables in CI
**Severity**: CRITICAL
**Location**: All Playwright configs and CI scripts
**Issue**: The following variables are referenced but not guaranteed to be set:
- `TURSO_DATABASE_URL` - Required for E2E tests, exits if missing
- `TURSO_AUTH_TOKEN` - Required for E2E tests, exits if missing
- `TEST_ADMIN_PASSWORD` - Has fallback but may cause auth test failures
- `ADMIN_SECRET` - Has fallback but may cause security issues
- `ADMIN_PASSWORD` - Referenced but not always provided

**Impact**: E2E tests will fail immediately on startup without Turso credentials

### 2. Port Configuration Inconsistency
**Severity**: CRITICAL
**Location**: Multiple config files
**Issue**: Inconsistent use of `DYNAMIC_PORT` vs `PORT`:
- `playwright-e2e-vercel-main.config.js`: Uses `DYNAMIC_PORT || PORT || 3000`
- `playwright-e2e-ci.config.js`: Uses `DYNAMIC_PORT || PORT || '3000'`
- `scripts/vercel-dev-ci.js`: Uses `DYNAMIC_PORT || PORT || '3000'`
- `webServer.env` in configs: Sets both `PORT` and `DYNAMIC_PORT` to same value

**Impact**: Potential port conflicts in parallel CI execution

## High Priority Issues (HIGH)

### 3. Vercel Token Not Passed Through
**Severity**: HIGH
**Location**: `playwright-e2e-vercel-main.config.js`
**Issue**: `VERCEL_TOKEN` is referenced in CI config but not in main config
**Missing Variables**:
- `VERCEL_TOKEN` - Not passed to webServer.env in main config
- `VERCEL_ORG_ID` - Referenced in CI but not main
- `VERCEL_PROJECT_ID` - Referenced in CI but not main

**Impact**: May cause authentication issues with Vercel in CI environment

### 4. Service API Keys Not Consistently Handled
**Severity**: HIGH
**Location**: `playwright-e2e-ci.config.js`
**Issue**: Service keys have empty string fallbacks:
```javascript
BREVO_API_KEY: process.env.BREVO_API_KEY || '',
STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
APPLE_PASS_KEY: process.env.APPLE_PASS_KEY || '',
```

**Impact**: Tests requiring these services will fail silently with empty credentials

### 5. No Secret Masking Verification
**Severity**: HIGH
**Location**: All files
**Issue**: No explicit masking of sensitive environment variables in logs
**Sensitive Variables at Risk**:
- `TURSO_AUTH_TOKEN`
- `ADMIN_SECRET`
- `ADMIN_PASSWORD`
- `STRIPE_SECRET_KEY`
- `BREVO_API_KEY`
- `VERCEL_TOKEN`

**Impact**: Potential exposure of secrets in CI logs

## Medium Priority Issues (MEDIUM)

### 6. Inconsistent Test Mode Flags
**Severity**: MEDIUM
**Location**: Multiple files
**Issue**: Different test mode flags used inconsistently:
- `E2E_TEST_MODE` - Set in some configs, not others
- `TEST_DATABASE_RESET_ALLOWED` - Only in global-setup.js
- `SKIP_DATABASE_INIT` - Only in vercel-dev-e2e.js
- `VERCEL_DEV_STARTUP` - Inconsistently used

**Impact**: May cause different behavior between local and CI environments

### 7. Missing Environment Variables in Global Setup
**Severity**: MEDIUM
**Location**: `tests/e2e/global-setup.js`
**Issue**: Minimal setup compared to CI version:
```javascript
// global-setup.js only sets:
process.env.E2E_TEST_MODE = 'true';
process.env.TEST_DATABASE_RESET_ALLOWED = 'true';

// But global-setup-ci.js validates many more variables
```

**Impact**: Different behavior between local and CI test runs

### 8. Hardcoded Fallback Values
**Severity**: MEDIUM
**Location**: Various files
**Issue**: Hardcoded test credentials in multiple places:
- `TEST_ADMIN_PASSWORD`: 'test-password' (multiple locations)
- `ADMIN_SECRET`: 'test-admin-secret-key-minimum-32-characters'
- `ADMIN_EMAIL`: 'admin@e2etest.com' (in seed-test-data.js)

**Impact**: May mask configuration issues, security risk if deployed

## Low Priority Issues (LOW)

### 9. Unused Environment Variables
**Severity**: LOW
**Location**: Various configs
**Issue**: Variables set but not used:
- `PLAYWRIGHT_BROWSER` - Referenced in global-setup-ci.js but not used
- `ALL_BROWSERS` - Checked but could be better named
- `GOOGLE_WALLET_ISSUER_ID` - Set in CI config but not main

**Impact**: Code clutter, potential confusion

### 10. Inconsistent Boolean Environment Variables
**Severity**: LOW
**Location**: Multiple files
**Issue**: Boolean values stored as strings:
```javascript
ADVANCED_SCENARIOS: ADVANCED_SCENARIOS ? 'true' : 'false'
CI: process.env.CI || 'false'
E2E_TEST_MODE: 'true'
```

**Impact**: Requires string comparison instead of boolean checks

### 11. Missing Debug/Logging Configuration
**Severity**: LOW
**Location**: Main config vs CI config
**Issue**: CI config has logging variables not in main:
- `DEBUG_PORT`
- `LOG_LEVEL`
- `FORCE_COLOR`
- `NO_UPDATE_NOTIFIER`

**Impact**: Less visibility into issues in non-CI environments

## Recommendations

### Immediate Actions (Fix Now)

1. **Create Environment Variable Validation Script**
```javascript
// scripts/validate-e2e-env.js
const required = ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'];
const missing = required.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.error(`Missing required variables: ${missing.join(', ')}`);
  process.exit(1);
}
```

2. **Standardize Port Configuration**
- Always use `DYNAMIC_PORT` as primary
- Fallback to `PORT` then to default
- Document the precedence clearly

3. **Add Secret Masking**
```javascript
// In startup logs
console.log(`TURSO_AUTH_TOKEN: ${process.env.TURSO_AUTH_TOKEN ? '***' : 'not set'}`);
```

### Short-term Improvements

1. **Create .env.e2e.example**
- Document all E2E-specific variables
- Include required vs optional markers
- Add comments for each variable's purpose

2. **Consolidate Environment Setup**
- Move all env setup to a single module
- Use consistent fallback patterns
- Validate early and fail fast

3. **Add Environment Report**
```javascript
// At startup, log environment state
console.log('E2E Environment Configuration:');
console.log('  Required Variables:');
console.log(`    TURSO_DATABASE_URL: ${process.env.TURSO_DATABASE_URL ? 'SET' : 'MISSING'}`);
// etc...
```

### Long-term Improvements

1. **Environment Schema Validation**
- Use a schema validator (e.g., joi, zod)
- Define required vs optional variables
- Type checking for values

2. **Secrets Management**
- Integrate with GitHub Secrets properly
- Use secret scanning tools
- Implement rotation policies

3. **Configuration as Code**
- Move to a structured config file
- Version control test configurations
- Support multiple environment profiles

## Summary Statistics

- **Total Unique Environment Variables**: 45+
- **Critical Issues**: 2
- **High Priority Issues**: 3
- **Medium Priority Issues**: 3
- **Low Priority Issues**: 3
- **Variables with Fallbacks**: 25
- **Variables without Fallbacks**: 20
- **Sensitive Variables at Risk**: 6

## Action Items

1. [ ] Add Turso credentials to CI secrets (CRITICAL)
2. [ ] Standardize port variable usage (CRITICAL)
3. [ ] Add VERCEL_TOKEN to main config (HIGH)
4. [ ] Implement secret masking (HIGH)
5. [ ] Remove hardcoded fallbacks for API keys (HIGH)
6. [ ] Create comprehensive .env.e2e.example (MEDIUM)
7. [ ] Align global-setup files (MEDIUM)
8. [ ] Add environment validation script (MEDIUM)
9. [ ] Clean up unused variables (LOW)
10. [ ] Standardize boolean handling (LOW)

## Appendix: Complete Environment Variable List

### Required for E2E Tests
- `TURSO_DATABASE_URL` - Turso database connection string
- `TURSO_AUTH_TOKEN` - Turso authentication token

### Required for Admin Tests
- `TEST_ADMIN_PASSWORD` - Plain text password for E2E admin tests
- `ADMIN_SECRET` - JWT signing secret (min 32 chars)
- `ADMIN_PASSWORD` - Bcrypt hashed admin password

### Service Integration (Optional but Required for Specific Tests)
- `BREVO_API_KEY` - Email service API key
- `STRIPE_SECRET_KEY` - Payment processing key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook validation
- `APPLE_PASS_KEY` - Apple Wallet pass generation
- `GOOGLE_WALLET_ISSUER_ID` - Google Wallet configuration

### CI/CD Configuration
- `VERCEL_TOKEN` - Vercel authentication
- `VERCEL_ORG_ID` - Vercel organization ID
- `VERCEL_PROJECT_ID` - Vercel project ID
- `CI` - CI environment flag
- `DYNAMIC_PORT` - Dynamic port allocation (3000-3005)
- `PORT` - Fallback port configuration

### Test Configuration
- `E2E_TEST_MODE` - E2E test mode flag
- `TEST_DATABASE_RESET_ALLOWED` - Allow database reset
- `SKIP_DATABASE_INIT` - Skip database initialization
- `VERCEL_DEV_STARTUP` - Vercel dev startup mode
- `ADVANCED_SCENARIOS` - Enable advanced test scenarios
- `PERFORMANCE_TESTING` - Enable performance tests
- `ACCESSIBILITY_TESTING` - Enable accessibility tests
- `SECURITY_TESTING` - Enable security tests

### Development/Debug
- `NODE_ENV` - Environment (test/development/production)
- `DEBUG_PORT` - Debug port for logging
- `LOG_LEVEL` - Logging verbosity
- `FORCE_COLOR` - Terminal color output
- `NO_UPDATE_NOTIFIER` - Disable update notifications
# E2E Test Secret Validation System

## Overview

The E2E test secret validation system provides comprehensive validation of environment variables and secrets required for end-to-end testing. It validates secrets at both the global setup level and individual test file level, providing clear feedback about missing or misconfigured credentials.

## Key Features

- **🚨 Fail-Fast Validation**: Tests immediately abort if critical secrets are missing
- **📊 Structured Reporting**: Clear categorization of secrets (CRITICAL, REQUIRED, OPTIONAL)
- **🔍 Intelligent Detection**: Automatically determines required secrets based on test types
- **⚠️ Graceful Degradation**: Non-critical tests can run with mocked services
- **🎯 Helpful Guidance**: Provides URLs and instructions for obtaining missing credentials
- **🔧 Easy Debugging**: Standalone validation tool for troubleshooting

## Secret Categories

### CRITICAL
Secrets required for basic E2E test functionality:
- `NODE_ENV` - Node environment (test/development)
- `E2E_TEST_MODE` - E2E test mode flag

### REQUIRED
Secrets needed for core functionality:
- `TEST_ADMIN_PASSWORD` - Plain text admin password for E2E tests
- `ADMIN_SECRET` - JWT signing secret (minimum 32 characters)
- `ADMIN_PASSWORD` - Bcrypt hashed admin password for production (optional in test mode)
- `TURSO_DATABASE_URL` - Production-like database URL (optional, falls back to SQLite)
- `TURSO_AUTH_TOKEN` - Database authentication token

### SERVICE_INTEGRATION
Secrets for external service integration (optional, graceful degradation):
- **Email (Brevo)**: `BREVO_API_KEY`, `BREVO_NEWSLETTER_LIST_ID`, `BREVO_WEBHOOK_SECRET`
- **Payment (Stripe)**: `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- **Wallet Passes**: `APPLE_PASS_KEY`, `WALLET_AUTH_SECRET`, `GOOGLE_WALLET_ISSUER_ID`

### CI/CD
Secrets for continuous integration environments:
- `CI` - CI environment flag (auto-detected)
- `GITHUB_TOKEN` - GitHub API token for CI operations
- `VERCEL_TOKEN` - Vercel authentication token
- `VERCEL_ORG_ID` - Vercel organization ID
- `VERCEL_PROJECT_ID` - Vercel project ID

### GOOGLE_SERVICES
Secrets for Google integrations (optional):
- `GOOGLE_DRIVE_API_KEY` - Google Drive API key for gallery
- `GOOGLE_DRIVE_FOLDER_ID` - Gallery images folder ID
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` - Service account email
- `GOOGLE_PRIVATE_KEY` - Service account private key

### RUNTIME
Runtime configuration:
- `PORT` / `DYNAMIC_PORT` - Server port for testing
- `PLAYWRIGHT_BASE_URL` - Base URL for tests
- `PREVIEW_URL` - Vercel preview deployment URL

## Usage

### Global Setup Validation

The secret validation runs automatically during E2E test global setup:

```javascript
// In global-setup-preview.js and global-setup-ci.js
import { validateSecrets } from './secret-validator.js';

const secretValidation = validateSecrets({
  testTypes: ['basic', 'admin', 'preview', 'ci'],
  ci: true,
  strict: false
});

if (!secretValidation.passed) {
  console.error('❌ SECRET VALIDATION FAILED - ABORTING TESTS');
  process.exit(1);
}
```

### Individual Test File Validation

Add secret validation to specific test files:

```javascript
import { skipTestIfSecretsUnavailable, warnIfOptionalSecretsUnavailable } from '../helpers/test-setup.js';

test.describe('Admin Authentication', () => {
  // Skip entire test suite if required secrets missing
  const shouldSkip = skipTestIfSecretsUnavailable(['admin', 'security'], 'admin-auth.test.js');
  
  if (shouldSkip) {
    test.skip('Skipping admin authentication tests due to missing required secrets');
    return;
  }
  
  // Warn about optional secrets (tests run with mocks)
  const secretWarnings = warnIfOptionalSecretsUnavailable(['admin'], 'admin-auth.test.js');
  
  // ... rest of tests
});
```

### Manual Validation

Test secret configuration manually:

```bash
# Run complete secret validation
npm run test:e2e:secrets

# Or run directly
node scripts/test-secret-validation.js
```

## Validation Output Example

```
🚨 E2E TEST STARTUP - SECRET VALIDATION
========================================
Checking secrets for test types: basic, admin, email

Checking 29 secrets...

✅ Found 5 secrets:
   - NODE_ENV (test)
   - E2E_TEST_MODE (true)
   - GITHUB_TOKEN (ghp_***Mxr3)
   - TEST_ADMIN_PASSWORD (***ord)
   - ADMIN_SECRET (xyz***789)

❌ Missing 3 CRITICAL secrets:
   - BREVO_API_KEY
     Brevo (SendinBlue) API key for email functionality
     Get it from: https://developers.brevo.com/
   - STRIPE_SECRET_KEY
     Stripe secret key for backend processing
     Get it from: https://dashboard.stripe.com/apikeys
   - TURSO_DATABASE_URL
     Turso database URL for production-like testing
     Get it from: https://turso.tech/

📊 Secrets by category:
   ✅ CRITICAL: 2/2 configured
   ⚠️ REQUIRED: 2/5 configured
   ❌ SERVICE_INTEGRATION: 0/9 configured
   ✅ CICD: 1/5 configured
   ❌ GOOGLE_SERVICES: 0/4 configured
   ✅ RUNTIME: 0/4 configured

💡 RECOMMENDATIONS:
   ⚠️ Set TURSO_DATABASE_URL for production-like testing
   ⚠️ Set BREVO_API_KEY for email functionality (optional)
   ⚠️ Set STRIPE_SECRET_KEY for payment testing (optional)

✅ SECRET VALIDATION PASSED
========================================
```

## Configuration Files

### Core Files

- `tests/e2e/secret-validator.js` - Main validation logic
- `tests/e2e/helpers/test-setup.js` - Individual test file helpers
- `tests/e2e/global-setup-preview.js` - Preview deployment setup with validation
- `tests/e2e/global-setup-ci.js` - CI environment setup with validation
- `scripts/test-secret-validation.js` - Standalone validation tool

### Integration Points

- `playwright.config.js` - Shows secret validation preview in configuration output
- `package.json` - Includes npm scripts for manual validation

## Environment Variable Setup

### Required for All Tests

```bash
# Basic test environment
NODE_ENV=test
E2E_TEST_MODE=true

# Admin authentication
TEST_ADMIN_PASSWORD=your-test-password
ADMIN_SECRET=your-32-character-or-longer-secret
```

### Optional for Production-like Testing

```bash
# Database
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-auth-token

# Email service
BREVO_API_KEY=your-brevo-api-key
BREVO_NEWSLETTER_LIST_ID=123

# Payment processing
STRIPE_SECRET_KEY=sk_test_your-stripe-key

# CI/CD
VERCEL_TOKEN=your-vercel-token
GITHUB_TOKEN=ghp_your-github-token
```

## Test Type Detection

The system automatically determines required secrets based on test file names:

- `admin-*.test.js` → Requires admin secrets
- `*-email-*.test.js`, `*newsletter*.test.js` → Requires email secrets
- `*payment*.test.js`, `*checkout*.test.js` → Requires payment secrets
- `*wallet*.test.js`, `*ticket*.test.js` → Requires wallet secrets
- `*gallery*.test.js` → Requires Google Drive secrets

## Error Handling

### Critical Secret Missing
- Tests immediately abort with exit code 1
- Clear error message explains which secrets are missing
- Provides helpful URLs for obtaining credentials

### Optional Secret Missing
- Tests continue with warning
- Mock services used instead of real APIs
- Degraded functionality clearly communicated

### Invalid Secret Format
- Validation catches common format issues (URL format, minimum length, etc.)
- Specific error messages guide correction

## Troubleshooting

### Common Issues

1. **Tests skip unexpectedly**
   - Check `npm run test:e2e:secrets` output
   - Verify environment variables are set correctly
   - Ensure `.env.local` is properly configured

2. **Admin tests fail**
   - Verify `TEST_ADMIN_PASSWORD` is set (plain text)
   - Verify `ADMIN_SECRET` is at least 32 characters
   - Check that `ADMIN_PASSWORD` is bcrypt hashed (production only)

3. **Database connection issues**
   - Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` for production-like testing
   - Tests will fall back to SQLite if Turso credentials missing

4. **Service integration failures**
   - Check specific service credentials (Brevo, Stripe, etc.)
   - Tests should gracefully degrade to mocks if credentials missing
   - Look for warning messages in test output

### Debug Commands

```bash
# Validate all secrets
npm run test:e2e:secrets

# Check specific test file requirements
node -e "import('./tests/e2e/helpers/test-setup.js').then(m => console.log(m.validateSecretsForTestFile('admin-auth.test.js')))"

# Test with minimal secrets
NODE_ENV=test E2E_TEST_MODE=true TEST_ADMIN_PASSWORD=test ADMIN_SECRET=test-secret-that-is-32-characters-long npm run test:e2e:secrets
```

## Best Practices

1. **Set required secrets first**: `NODE_ENV`, `E2E_TEST_MODE`, `TEST_ADMIN_PASSWORD`, `ADMIN_SECRET`
2. **Use production-like database**: Set Turso credentials for realistic testing
3. **Gradual integration**: Add service credentials as needed for specific test scenarios
4. **Monitor warnings**: Optional missing secrets are logged for awareness
5. **Use validation tool**: Run `npm run test:e2e:secrets` before committing changes

## Implementation Details

The validation system uses a layered approach:

1. **Global Setup**: Validates all secrets before any tests run
2. **Test File Setup**: Individual files can add specific validation
3. **Runtime Checking**: Graceful degradation for optional services
4. **Clear Communication**: Structured output guides developers

This ensures tests fail fast when critical configuration is missing while allowing flexible development workflows with partial credential sets.
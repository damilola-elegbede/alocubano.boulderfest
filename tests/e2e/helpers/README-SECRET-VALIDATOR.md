# E2E Secret Validator System

The secret validator provides comprehensive secret validation for E2E tests, ensuring all required secrets are properly configured before test execution begins.

## Overview

The secret validation system:

1. **Validates ALL secrets** at E2E test startup
2. **Logs clearly** which secrets are found vs missing
3. **Fails fast** if any required secret is missing
4. **Enables graceful degradation** for optional services
5. **Integrates automatically** with E2E global setup

## Required Output Format

```
🔐 SECRET VALIDATION REPORT
============================
✅ FOUND: ADMIN_PASSWORD (bcrypt hash (60 chars))
✅ FOUND: TURSO_DATABASE_URL (libsql://a...o.io)
❌ MISSING: BREVO_API_KEY - Brevo email service API key
❌ MISSING: GOOGLE_PRIVATE_KEY - Google Drive API key for gallery
============================
FATAL: 2 required secrets missing. Tests cannot proceed.
```

## Required Secrets

These secrets **MUST** be present or E2E tests will fail immediately:

- **TURSO_DATABASE_URL**: Production database URL (format: `libsql://...`)
- **TURSO_AUTH_TOKEN**: Database authentication token (50+ chars)
- **ADMIN_PASSWORD**: bcrypt hashed password (starts with `$2b$` or `$2a$`)
- **ADMIN_SECRET**: JWT signing secret (32+ chars minimum)
- **TEST_ADMIN_PASSWORD**: Plain text admin password for E2E tests (8+ chars)

## Optional Secrets

These secrets enable additional features but tests can proceed without them:

### Email Services
- **BREVO_API_KEY**: Email service API key (starts with `xkeysib-`)
- **BREVO_NEWSLETTER_LIST_ID**: Newsletter list ID (numeric)
- **BREVO_WEBHOOK_SECRET**: Webhook validation secret (10+ chars)

### Payment Processing  
- **STRIPE_SECRET_KEY**: Payment processing key (starts with `sk_test_` or `sk_live_`)
- **STRIPE_PUBLISHABLE_KEY**: Frontend payment key (starts with `pk_test_` or `pk_live_`)
- **STRIPE_WEBHOOK_SECRET**: Payment webhook secret (starts with `whsec_`)

### Google Drive Integration
- **GOOGLE_DRIVE_API_KEY**: Google Drive API key (30+ chars)
- **GOOGLE_DRIVE_FOLDER_ID**: Google Drive folder ID (10+ chars)

### Wallet Passes
- **APPLE_PASS_KEY**: Apple Wallet signing key (base64, 100+ chars)
- **WALLET_AUTH_SECRET**: Wallet JWT signing secret (32+ chars)

### Development & CI
- **VERCEL_TOKEN**: Vercel deployment token (20+ chars)
- **VERCEL_ORG_ID**: Vercel organization ID (10+ chars)
- **GITHUB_TOKEN**: GitHub API token (starts with `ghp_` or `github_pat_`)
- **INTERNAL_API_KEY**: Internal API authentication (16+ chars)

## Usage

### Automatic Integration

The secret validator automatically runs before **ALL** E2E tests via global setup:

- **Preview deployments**: `global-setup-preview.js`
- **CI environments**: `global-setup-ci.js`  
- **Local testing**: `global-setup.js`

### Manual Testing

Test the secret validator independently:

```bash
# Run the demo script to see validation in action
node tests/e2e/helpers/secret-validator-demo.js

# Or add to package.json as:
# "test:secrets": "node tests/e2e/helpers/secret-validator-demo.js"
npm run test:secrets
```

### Programmatic Usage

```javascript
import { initializeSecretValidation } from './tests/e2e/helpers/secret-validator.js';

// Initialize and validate all secrets
const result = initializeSecretValidation();

if (!result.success) {
  console.error('Secret validation failed:', result.error.message);
  process.exit(1);
}

// Access availability flags
console.log('Brevo API available:', result.flags.BREVO_API_AVAILABLE);
console.log('Stripe API available:', result.flags.STRIPE_API_AVAILABLE);
```

## Graceful Degradation

When optional secrets are missing, the system enables graceful degradation:

### Automatic Environment Flags

The validator sets availability flags for each service:

```bash
# Individual service flags
BREVO_API_KEY_AVAILABLE=true
STRIPE_SECRET_KEY_AVAILABLE=false
GOOGLE_DRIVE_API_KEY_AVAILABLE=false

# Service group flags
BREVO_API_AVAILABLE=true          # All Brevo secrets present
STRIPE_API_AVAILABLE=false        # Missing Stripe secrets  
GOOGLE_DRIVE_API_AVAILABLE=false  # Missing Google Drive secrets
WALLET_PASSES_AVAILABLE=false     # Missing wallet secrets
```

### Test Behavior

Tests can check these flags to enable graceful degradation:

```javascript
// In E2E tests
if (process.env.BREVO_API_AVAILABLE === 'true') {
  // Run real email tests
  await testNewsletterSubscription();
} else {
  // Skip or use mock data
  console.log('Skipping email tests - Brevo API not available');
}
```

## Secret Security Features

### Smart Value Masking

The validator masks sensitive values in logs:

- **Database URLs**: `libsql://test...io` (shows start/end)
- **API Keys**: `xkeysib-...D824IdwY` (shows prefix/suffix) 
- **bcrypt hashes**: `bcrypt hash (60 chars)` (shows type/length)
- **JWT secrets**: `nhE3UT...(44 chars)` (shows start/length)
- **Passwords**: `****(13 chars)` (completely masked)

### Format Validation

Each secret type has specific validation rules:

- **Turso URLs**: Must start with `libsql://`
- **bcrypt passwords**: Must start with `$2b$` or `$2a$`
- **Brevo keys**: Must start with `xkeysib-`
- **Stripe keys**: Must match `sk_test_`, `sk_live_`, `pk_test_`, `pk_live_` patterns
- **GitHub tokens**: Must start with `ghp_` or `github_pat_`

## Integration Points

### E2E Global Setup

The validator integrates at the **very beginning** of E2E test execution:

```javascript
async function globalSetupPreview() {
  console.log('🚀 Global E2E Setup - Preview Deployment Mode');
  
  // Step 0: Validate secrets before proceeding
  const secretValidation = initializeSecretValidation();
  
  if (!secretValidation.success) {
    throw new Error('❌ Secret validation failed - cannot proceed');
  }
  
  // Continue with test setup...
}
```

### Unit Test Coverage

The secret validator has comprehensive unit test coverage (19 tests):

```bash
npm run test:unit -- tests/unit/utils/secret-validator.test.js
```

Tests cover:
- ✅ Secret validation logic
- ✅ Report generation
- ✅ Graceful degradation flags  
- ✅ Error handling
- ✅ Format validation
- ✅ Value masking

## Troubleshooting

### Common Issues

**❌ "Required secrets missing" error**
- Solution: Configure missing secrets in `.env.local`
- Check: Run the demo script to see exactly which secrets are missing

**❌ "Invalid secret format" error**  
- Solution: Ensure secrets match expected format patterns
- Check: Review format validation rules above

**❌ Import errors in tests**
- Solution: Verify the secret validator file exists and imports are correct
- Check: Run `node tests/e2e/helpers/secret-validator-demo.js`

### Debug Information

The validator provides detailed debugging information:

```
🔧 Debugging Information:
   GitHub Repository: owner/repo
   PR Number: 123  
   Commit SHA: abc123
   GitHub Token: Available
   Vercel Token: Missing
   Vercel Org ID: Missing
```

## Environment Configuration

Add missing secrets to `.env.local`:

```bash
# Required secrets
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-auth-token
ADMIN_PASSWORD=$2b$10$your-bcrypt-hash
ADMIN_SECRET=your-jwt-secret-32-chars-minimum  
TEST_ADMIN_PASSWORD=your-test-password

# Optional secrets (for full functionality)
BREVO_API_KEY=xkeysib-your-api-key
STRIPE_SECRET_KEY=sk_test_your-stripe-key
GOOGLE_DRIVE_API_KEY=your-google-api-key
# ... etc
```

## Development Workflow

1. **Development**: Run demo script to check secret status
2. **Testing**: E2E tests automatically validate secrets at startup
3. **CI/CD**: Secret validation prevents deployment with missing required secrets
4. **Production**: Only required secrets needed; optional services degrade gracefully

The secret validator ensures robust, secure, and reliable E2E testing across all environments.
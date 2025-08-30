# Brevo Email Test Cleanup Guide

This guide explains how to use the Brevo email cleanup system to ensure E2E tests don't pollute production email lists.

## Overview

The Brevo cleanup system provides comprehensive cleanup functionality for test data in Brevo, ensuring that:

- Test emails are automatically identified and tracked
- Production subscriber lists remain clean
- E2E tests can run safely without affecting real users
- Cleanup happens automatically after tests complete
- Rate limiting is handled gracefully
- Safety checks prevent deletion of real subscribers

## Key Components

### 1. Brevo Cleanup Helper (`tests/e2e/helpers/brevo-cleanup.js`)

The main cleanup utility that provides:

- **Email Pattern Recognition**: Automatically identifies test emails by patterns
- **Email Tracking**: Tracks test emails used during E2E tests
- **Cleanup Operations**: Removes test contacts from Brevo lists
- **Rate Limiting**: Handles Brevo API rate limits gracefully
- **Safety Checks**: Prevents deletion of real subscribers
- **Test Mode Support**: Simulates operations when in test mode

### 2. Global Teardown Integration

The cleanup system is automatically integrated into the E2E test teardown process (`tests/e2e/global-teardown.js`), ensuring cleanup happens after all tests complete.

### 3. Test Scripts and Commands

Several npm scripts are available for managing Brevo cleanup:

```bash
# Test the cleanup system
npm run brevo:cleanup:test

# Perform full cleanup
npm run brevo:cleanup

# Clean only tracked emails
npm run brevo:cleanup:tracked

# View cleanup statistics
npm run brevo:cleanup:stats
```

## Usage in Tests

### Basic Usage

```javascript
import { trackTestEmail, isTestEmail } from '../helpers/brevo-cleanup.js';
import { generateTestEmail } from '../helpers/test-isolation.js';

test('newsletter subscription test', async ({ page }) => {
  // Generate unique test email
  const testEmail = generateTestEmail(test.info().title, 'newsletter');
  
  // Track email for cleanup
  trackTestEmail(testEmail, { 
    testTitle: test.info().title,
    purpose: 'newsletter',
    source: 'e2e_test',
    expectsNewsletterSignup: true
  });
  
  // Use email in test...
  await page.fill('#email', testEmail);
  // ... rest of test
});
```

### Advanced Usage

```javascript
import { 
  trackTestEmail, 
  cleanupTestEmails, 
  performBrevoTestCleanup,
  getBrevoCleanupStats 
} from '../helpers/brevo-cleanup.js';

// Track multiple emails
const emails = [
  'e2e_test_1@e2etest.example.com',
  'e2e_test_2@e2etest.example.com'
];

emails.forEach(email => {
  trackTestEmail(email, {
    testTitle: 'bulk_test',
    purpose: 'newsletter',
    source: 'bulk_signup_test'
  });
});

// Manual cleanup if needed
const cleanupResults = await cleanupTestEmails({
  removeFromLists: true,
  deleteContacts: false
});

// Full cleanup including list scanning
const fullResults = await performBrevoTestCleanup({
  cleanTrackedEmails: true,
  cleanAllLists: true,
  newsletterListId: 1,
  ticketHoldersListId: 2
});
```

## Email Pattern Recognition

The system automatically identifies test emails using these patterns:

### Test Domains
- `@e2etest.example.com`
- `@test.example.com`
- `@example.com`
- `@test.com`
- `@playwright.test`
- `@automation.test`

### Test Prefixes
- `e2e_`
- `test_`
- `playwright_`
- `automation_`
- `dummy_`
- `mock_`

### Example Test Emails
```javascript
// These will be identified as test emails:
'e2e_test_123@e2etest.example.com'    // ✅
'test_user@example.com'                // ✅
'playwright_automation@test.com'       // ✅
'dummy_user@test.example.com'          // ✅

// These will NOT be identified as test emails:
'john.smith@gmail.com'                 // ❌
'customer@company.org'                 // ❌
'user@realdomain.net'                  // ❌
```

## Configuration

### Environment Variables

The cleanup system respects these environment variables:

```bash
# Test mode control
E2E_TEST_MODE=true                    # Force test mode (simulated operations)
NODE_ENV=test                         # Enable test mode

# Brevo API configuration
BREVO_API_KEY=your_api_key           # Brevo API key (if not set, enables test mode)
BREVO_NEWSLETTER_LIST_ID=1           # Newsletter list ID for cleanup
BREVO_TICKET_HOLDERS_LIST_ID=2       # Ticket holders list ID for cleanup
```

### Test Mode vs Production Mode

**Test Mode** (default for E2E tests):
- Operations are simulated and logged
- No actual Brevo API calls are made
- Safe for development and CI environments
- Enabled when `E2E_TEST_MODE=true` or `NODE_ENV=test` or no `BREVO_API_KEY`

**Production Mode**:
- Real Brevo API calls are made
- Actual cleanup operations occur
- Use with caution in production environments
- Only enabled when all conditions are met and explicit configuration is provided

## Safety Features

### 1. Pattern-Based Identification
Only emails matching test patterns are processed for cleanup.

### 2. Recent Data Focus
The system focuses on recent data (last 48 hours) to avoid affecting old legitimate data.

### 3. Conservative Cleanup
Default behavior is to unsubscribe rather than delete contacts completely.

### 4. Rate Limiting
Built-in rate limiting respects Brevo API limits:
- Max 10 requests per second
- Max 300 requests per minute
- Automatic retry with backoff

### 5. Error Handling
Comprehensive error handling with detailed logging and graceful degradation.

## Cleanup Operations

### 1. Tracked Email Cleanup
Cleans up emails that were explicitly tracked during tests:

```bash
npm run brevo:cleanup:tracked
```

### 2. List-Based Cleanup
Scans Brevo lists for test contacts and removes them:

```bash
# This is included in full cleanup
npm run brevo:cleanup
```

### 3. Full Cleanup
Comprehensive cleanup of all test data:

```bash
npm run brevo:cleanup
```

## Monitoring and Debugging

### View Statistics
```bash
npm run brevo:cleanup:stats
```

Example output:
```json
{
  "trackedEmails": 5,
  "cleanupLog": [
    {
      "action": "unsubscribe",
      "email": "e2e_test@e2etest.example.com",
      "timestamp": "2025-01-21T10:30:00.000Z",
      "mock": true
    }
  ],
  "isTestMode": true,
  "initialized": true
}
```

### Test the System
```bash
npm run brevo:cleanup:test
```

This runs comprehensive tests of:
- Email pattern recognition
- Email tracking functionality
- Cleanup operations
- Error handling

## Integration with E2E Tests

The cleanup system is automatically integrated with the E2E test lifecycle:

### 1. Global Setup
The system initializes when E2E tests start.

### 2. Test Execution
Tests track emails using `trackTestEmail()` function.

### 3. Global Teardown
After all tests complete, cleanup runs automatically:

```javascript
// In global-teardown.js
const brevoResult = await performBrevoTestCleanup({
  cleanTrackedEmails: true,
  cleanAllLists: true,
  newsletterListId: process.env.BREVO_NEWSLETTER_LIST_ID || 1,
  ticketHoldersListId: process.env.BREVO_TICKET_HOLDERS_LIST_ID || 2
});
```

## Best Practices

### 1. Always Track Test Emails
```javascript
// ✅ Good - track emails used in tests
const testEmail = generateTestEmail(test.info().title, 'purpose');
trackTestEmail(testEmail, { /* metadata */ });

// ❌ Bad - using test emails without tracking
await page.fill('#email', 'test@example.com');
```

### 2. Use Descriptive Metadata
```javascript
trackTestEmail(email, {
  testTitle: test.info().title,
  purpose: 'newsletter_signup',
  source: 'contact_page_test',
  expectsNewsletterSignup: true,
  timestamp: Date.now()
});
```

### 3. Test in Safe Environments
Always ensure test mode is enabled in development and CI:

```bash
# In .env.local or CI configuration
E2E_TEST_MODE=true
```

### 4. Monitor Cleanup Results
Check cleanup logs and statistics after test runs:

```bash
npm run brevo:cleanup:stats
```

### 5. Handle Failures Gracefully
The cleanup system is designed to be non-fatal - test failures won't prevent cleanup from running.

## Troubleshooting

### Common Issues

**1. Cleanup Not Running**
- Check that `E2E_TEST_MODE` is properly configured
- Verify global teardown is executing
- Check for errors in cleanup logs

**2. Real API Calls in Tests**
- Ensure `E2E_TEST_MODE=true` is set
- Verify `NODE_ENV=test` or no `BREVO_API_KEY` for automatic test mode

**3. Rate Limiting Errors**
- The system handles rate limits automatically
- Check for network connectivity issues
- Verify API key permissions

**4. Pattern Recognition Issues**
- Use the test script to verify patterns: `npm run brevo:cleanup:test --patterns-only`
- Ensure test emails follow expected patterns
- Check that `isTestEmail()` returns true for your test emails

### Debugging Commands

```bash
# Test pattern recognition only
node scripts/test-brevo-cleanup.js --patterns-only

# Show environment configuration
node scripts/test-brevo-cleanup.js --env-info

# Run full test suite
npm run brevo:cleanup:test

# Check current statistics
npm run brevo:cleanup:stats
```

## API Reference

### Core Functions

#### `trackTestEmail(email, metadata)`
Tracks an email for cleanup.

**Parameters:**
- `email` (string): Email address to track
- `metadata` (object): Optional metadata about the email

**Example:**
```javascript
trackTestEmail('test@e2etest.example.com', {
  testTitle: 'Newsletter Test',
  purpose: 'subscription',
  source: 'contact_page'
});
```

#### `isTestEmail(email)`
Checks if an email matches test patterns.

**Parameters:**
- `email` (string): Email address to check

**Returns:** `boolean`

#### `cleanupTestEmails(options)`
Cleans up tracked test emails.

**Parameters:**
- `options.removeFromLists` (boolean): Remove from lists (default: true)
- `options.deleteContacts` (boolean): Delete contacts completely (default: false)

**Returns:** Promise with cleanup results

#### `performBrevoTestCleanup(options)`
Performs comprehensive cleanup of all test data.

**Parameters:**
- `options.cleanTrackedEmails` (boolean): Clean tracked emails
- `options.cleanAllLists` (boolean): Clean test contacts from lists
- `options.newsletterListId` (number): Newsletter list ID
- `options.ticketHoldersListId` (number): Ticket holders list ID

**Returns:** Promise with cleanup results

#### `getBrevoCleanupStats()`
Returns current cleanup statistics.

**Returns:** Object with statistics

## Contributing

When adding new test patterns or cleanup functionality:

1. Update `BREVO_TEST_PATTERNS` in the cleanup helper
2. Add tests to verify pattern recognition
3. Update this documentation
4. Test thoroughly in development environment first

## Security Considerations

- Never run cleanup against production Brevo data without explicit configuration
- Always use test mode in development and CI environments
- Verify email patterns thoroughly before adding new ones
- Monitor cleanup operations in production environments
- Use conservative cleanup settings (unsubscribe vs delete) by default
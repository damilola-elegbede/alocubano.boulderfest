# E2E Test Data Guide

This guide explains how to use the deterministic test data seeding system for E2E tests.

## Overview

The E2E test data seeding system provides:
- **Deterministic data**: Same IDs and values every time for consistent testing
- **Multiple profiles**: Minimal, standard, and full test data sets
- **Idempotent operations**: Safe to run multiple times
- **Fast execution**: Optimized for CI/CD pipelines
- **Easy access**: Helper functions for tests to access seeded data

## Quick Start

### Automatic Seeding (Recommended)

Test data is automatically seeded when you run E2E tests:

```bash
npm run test:e2e
```

The global setup will:
1. Reset the database to a clean state
2. Run migrations
3. Seed deterministic test data
4. Make data available to all tests

### Manual Seeding

You can also manually seed test data during development:

```bash
# Standard profile (recommended)
npm run setup:e2e-data

# Minimal profile (just admin user)
npm run setup:e2e-data:minimal

# Full profile (all test scenarios)
npm run setup:e2e-data:full

# Show configuration info
npm run setup:e2e-data:info
```

## Seeding Profiles

### Minimal Profile
- 1 admin session for authentication tests
- Use when you only need to test admin functionality

### Standard Profile (Default)
- 1 admin session
- 2 transactions (weekend package, single Saturday)
- 3 tickets (2 weekend, 1 Saturday)
- 2 email subscribers (active, unsubscribed)
- 2 registrations
- Gallery mock data references

### Full Profile
- Everything from standard profile
- Additional Sunday ticket with check-in status
- Bounced email subscriber
- More comprehensive test scenarios

## Using Test Data in Tests

Import the test data helper functions:

```javascript
import { 
  getTestAdmin, 
  getTestTicket, 
  getTestSubscriber,
  getTestQRCode,
  validateTestDataAvailable
} from './helpers/test-data-helper.js';
```

### Admin Authentication Tests

```javascript
test('admin login', async ({ page }) => {
  // Ensure test data is available
  validateTestDataAvailable();
  
  // Get admin credentials
  const admin = getTestAdmin();
  
  await page.goto('/admin');
  await page.fill('#email', admin.email);
  await page.fill('#password', admin.password);
  await page.click('#login');
  
  await expect(page.locator('.admin-dashboard')).toBeVisible();
});
```

### Ticket Validation Tests

```javascript
test('ticket QR code validation', async ({ page }) => {
  // Get a test ticket
  const ticket = getTestTicket('weekend');
  
  await page.goto('/admin/checkin');
  await page.fill('#qr-code', ticket.validation_code);
  await page.click('#validate');
  
  await expect(page.locator('.validation-success')).toBeVisible();
  await expect(page.locator('.attendee-name')).toHaveText(
    `${ticket.attendee_first_name} ${ticket.attendee_last_name}`
  );
});
```

### Newsletter Tests

```javascript
test('newsletter subscription', async ({ page }) => {
  // Get test subscriber data
  const subscriber = getTestSubscriber('active');
  
  // Test unsubscribe functionality
  await page.goto(`/unsubscribe?email=${subscriber.email}`);
  await page.click('#unsubscribe-confirm');
  
  await expect(page.locator('.unsubscribe-success')).toBeVisible();
});
```

## Test Data Constants

All seeded data uses deterministic values:

```javascript
import { getTestConstants, getTestValues } from './helpers/test-data-helper.js';

const constants = getTestConstants();
// constants.ADMIN_EMAIL = 'admin@e2etest.com'
// constants.TEST_ADMIN_PASSWORD = 'test-password'
// constants.TEST_PREFIX = 'E2E_TEST_'

const values = getTestValues();
// values.eventId = 'alocubano-boulderfest-2026'
// values.prices.weekend = 7500 (cents)
```

## Available Helper Functions

### Authentication
- `getTestAdmin()` - Get admin credentials and session token
- `getTestEmails()` - Get all test email addresses

### Tickets & Transactions  
- `getTestTicket(type)` - Get specific ticket type ('weekend', 'saturday', 'sunday')
- `getTestTickets(type?)` - Get all tickets or filter by type
- `getTestTransaction(index)` - Get transaction by index
- `getTestQRCode(type)` - Get QR code for ticket validation

### Email & Registration
- `getTestSubscriber(status)` - Get subscriber by status ('active', 'unsubscribed', 'bounced')  
- `getTestRegistration(index)` - Get registration by index

### Gallery & Other
- `getTestGalleryData()` - Get mock gallery data
- `getTestValues()` - Get deterministic test values (prices, dates, IDs)

### Utilities
- `validateTestDataAvailable()` - Ensure test data is properly seeded
- `logAvailableTestData()` - Debug helper to see what data is available
- `waitForTestData(timeout)` - Wait for test data to be available

## Deterministic Data Details

### Admin User
- **Email**: `admin@e2etest.com`
- **Password**: `test-password` 
- **Session Token**: Generated deterministically

### Tickets
| Type | Price | Email | QR Code |
|------|--------|--------|---------|
| weekend | $75.00 | ticket-buyer@e2etest.com | E2E_TEST_QR_xxx |
| saturday | $50.00 | saturday-buyer@e2etest.com | E2E_TEST_QR_xxx |
| sunday | $50.00 | sunday-buyer@e2etest.com | E2E_TEST_QR_xxx |

### Email Subscribers
- `active-subscriber@e2etest.com` (active)
- `unsubscribed@e2etest.com` (unsubscribed)
- `bounced-subscriber@e2etest.com` (bounced) - full profile only

### Timestamps
All timestamps are deterministic, starting from `2026-01-01T00:00:00Z` with incremental offsets.

## Troubleshooting

### Test Data Not Available
If tests fail with "test data not found" errors:

1. Check that global-setup.js ran successfully
2. Verify database connection
3. Manually run seeding: `npm run setup:e2e-data`
4. Check logs for seeding errors

### Database Connection Issues
If seeding fails with database errors:

1. Verify TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in .env.local
2. For local development, you can leave these empty to use SQLite
3. Check that migrations are applied: `npm run migrate:status`
4. Reset database if needed: `npm run db:reset`

### Debugging Test Data
```javascript
import { logAvailableTestData } from './helpers/test-data-helper.js';

test.beforeEach(() => {
  // Debug what test data is available
  logAvailableTestData();
});
```

## Best Practices

1. **Always validate data availability** at the start of tests
2. **Use helper functions** instead of hardcoding values
3. **Test with deterministic data** for consistent results
4. **Reset between test runs** to ensure clean state
5. **Use appropriate profile** for your test scenario
6. **Don't modify seeded data** in tests - it affects other tests

## Integration with CI/CD

The seeding system is optimized for CI/CD:
- Fast execution (typically < 1 second)
- Deterministic results for consistent builds
- Error handling with fallbacks
- Comprehensive logging for debugging

Environment requirements:
- `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` for production-like testing
- `TEST_ADMIN_PASSWORD` for admin authentication tests

## Advanced Usage

### Custom Test Data
If you need additional test data beyond the seeded profiles:

```javascript
import { getDatabaseClient } from '../../api/lib/database.js';

test('custom data scenario', async ({ page }) => {
  const client = await getDatabaseClient();
  
  // Add custom test data (clean up in test teardown)
  await client.execute(`
    INSERT INTO custom_table (id, data) VALUES (?, ?)
  `, ['custom-test-id', 'test-data']);
  
  // Run your test
  
  // Clean up
  await client.execute(`
    DELETE FROM custom_table WHERE id = ?
  `, ['custom-test-id']);
});
```

### Extending the Seeder
To add new test data types, modify `scripts/seed-test-data.js`:

1. Add new seeding method
2. Update the main `seedData()` method
3. Add helper functions to `test-data-helper.js`
4. Update this documentation
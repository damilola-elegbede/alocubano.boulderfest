# Database Cleanup for E2E Tests

## Overview

The database cleanup system ensures deterministic E2E testing by automatically removing test data after test execution. It provides comprehensive cleanup functions that identify and remove test data based on patterns while preserving the database schema and production data.

## Features

- **🎯 Smart Pattern Recognition**: Automatically identifies test data using email patterns, names, and timestamps
- **🔒 Safe Operation**: Preserves production data, only removes identifiable test data
- **💾 Transaction Support**: Atomic cleanup operations with rollback on failure
- **🧹 Comprehensive Coverage**: Cleans all database tables (email_subscribers, transactions, registrations, payment_events, email_events, email_audit_log)
- **🔍 Dry Run Mode**: Preview what would be cleaned without making changes
- **📊 Statistics**: View cleanup statistics and data analysis
- **⚡ Automatic Integration**: Runs automatically after E2E tests via global teardown

## Test Data Identification Patterns

### Email Patterns
- `test@example.com`, `@test.com`, `@example.com`
- `e2e-test`, `playwright-test`, `automation-test`
- `testuser`, `dummy@`, `+test@`

### Name Patterns  
- `test user`, `john doe`, `jane doe`
- `e2e test`, `playwright`, `automation`, `dummy`

### Transaction Patterns
- `test_transaction_`, `e2e_`, `playwright_`
- `cs_test_`, `pi_test_` (Stripe test prefixes)

### Temporal Patterns
- Data created within the last 24 hours (configurable)

## Usage

### NPM Scripts

```bash
# Clean test data (safe - only removes test patterns)
npm run db:cleanup:test

# Preview what would be cleaned (recommended first)
npm run db:cleanup:dry-run

# Show database statistics
npm run db:cleanup:stats

# Full cleanup (DANGER - removes ALL data)
npm run db:cleanup:full
```

### Manual Script Usage

```bash
# Basic test data cleanup
node scripts/database-cleanup.js

# Preview cleanup
node scripts/database-cleanup.js --dry-run

# Show statistics
node scripts/database-cleanup.js --stats

# Clean specific tables only
node scripts/database-cleanup.js --tables=email_subscribers,transactions

# Full cleanup with preview
node scripts/database-cleanup.js --mode=full --dry-run

# Get help
node scripts/database-cleanup.js --help
```

### Programmatic Usage

```javascript
import { cleanTestData, getCleanupStats } from './tests/e2e/helpers/database-cleanup.js';

// Clean test data
const result = await cleanTestData({
  tables: ['all'], // or ['email_subscribers', 'transactions']
  useTransaction: true,
  dryRun: false
});

// Get statistics
const stats = await getCleanupStats({ testDataOnly: true });
console.log(`Found ${stats.totalTestData} test records to clean`);
```

## Integration with E2E Tests

### Automatic Cleanup

The cleanup system is automatically integrated with E2E tests:

```javascript
// tests/e2e/global-teardown.js
import { cleanTestData } from './helpers/database-cleanup.js';

async function globalTeardown() {
  // Automatic cleanup after all E2E tests
  await cleanTestData({
    tables: ['all'],
    useTransaction: true,
    dryRun: false
  });
}
```

### Manual Cleanup in Tests

```javascript
import { cleanEmailSubscribers } from '../helpers/database-cleanup.js';

test('newsletter subscription', async () => {
  // Your test code...
  
  // Clean up specific test data
  await cleanEmailSubscribers(client, { onlyTestData: true });
});
```

## Configuration

### Environment Variables

The cleanup system works with existing database configuration:

```env
# Production/Staging database (Turso)
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-auth-token

# Development database (SQLite)
# Uses file:data/development.db automatically
```

### Test Data Patterns

Customize patterns by editing `tests/e2e/helpers/database-cleanup.js`:

```javascript
const TEST_DATA_PATTERNS = {
  emailPatterns: [
    'test@example.com',
    '@test.com',
    // Add your patterns...
  ],
  namePatterns: [
    'test user',
    // Add your patterns...
  ],
  transactionPatterns: [
    'cs_test_',
    // Add your patterns...
  ]
};
```

## Database Tables Cleaned

| Table | Purpose | Cleanup Strategy |
|-------|---------|------------------|
| `email_subscribers` | Newsletter subscriptions | Email/name pattern + recency |
| `email_events` | Email interaction tracking | Via subscriber relationship |
| `email_audit_log` | Email system audit trail | Recency-based (24 hours) |
| `transactions` | Payment transactions | Email/transaction ID patterns |
| `registrations` | Ticket registrations | Email/name pattern + recency |
| `payment_events` | Payment audit trail | Transaction ID patterns |

## Safety Features

### Pattern-Based Safety
- Only removes data matching test patterns
- Production data with real user patterns is preserved
- Multiple pattern types for comprehensive identification

### Transaction Safety
- All operations wrapped in transactions
- Automatic rollback on failure
- Atomic operations across multiple tables

### Dry Run Mode
- Preview operations without making changes
- Shows exactly what would be cleaned
- Recommended for new pattern testing

### Error Handling
- Graceful handling of missing tables
- Comprehensive error logging
- Fallback mechanisms for different environments

## Monitoring and Debugging

### Statistics View
```bash
npm run db:cleanup:stats
```

Shows:
- Total records per table
- Estimated test data per table
- Overall database health

### Verbose Logging
The cleanup system provides detailed logging:
- Records found and cleaned per table
- Transaction status
- Error details with timestamps
- Performance metrics

## Best Practices

### 1. Always Preview First
```bash
# See what would be cleaned
npm run db:cleanup:dry-run
```

### 2. Use Test Patterns Consistently
- Use `test@example.com` for test emails
- Use `e2e-test-` prefix for automated tests
- Use `Test User` for test names

### 3. Monitor Cleanup Results
```bash
# Check what was cleaned
npm run db:cleanup:test 2>&1 | grep "Cleaned"
```

### 4. Customize for Your Needs
- Add project-specific test patterns
- Adjust time windows for recency checks
- Configure table-specific cleanup logic

### 5. Test in Development
- Verify patterns catch your test data
- Ensure production data is preserved
- Test cleanup performance with real data volumes

## Troubleshooting

### No Data Cleaned
- Check if test data matches patterns
- Verify database connection
- Ensure tables exist and have proper schema

### Too Much Data Cleaned
- Review and refine test patterns
- Use dry run mode to preview
- Check time-based filters

### Performance Issues
- Use table-specific cleanup instead of 'all'
- Disable transactions for large cleanups
- Consider cleanup frequency

### Connection Errors
- Verify database URL and auth token
- Check network connectivity for remote databases
- Ensure database server is running

## Example Workflows

### Local Development
```bash
# Daily cleanup of test data
npm run db:cleanup:test

# Before important testing
npm run db:cleanup:dry-run
npm run db:cleanup:stats
```

### CI/CD Pipeline
```bash
# Automatic in E2E test teardown (already configured)
# Manual cleanup if needed:
npm run db:cleanup:test
```

### Production Maintenance
```bash
# NEVER run full cleanup in production
# Only use test data cleanup with careful review:
npm run db:cleanup:dry-run  # Preview first
npm run db:cleanup:test     # Only if safe
```

## Files

- `tests/e2e/helpers/database-cleanup.js` - Main cleanup functionality
- `tests/e2e/global-teardown.js` - E2E test integration
- `scripts/database-cleanup.js` - Standalone cleanup script
- `tests/database-cleanup.test.js` - Comprehensive test suite
- `package.json` - NPM scripts for cleanup operations

## Support

For issues or questions:
1. Check the test suite (`tests/database-cleanup.test.js`) for usage examples
2. Review the comprehensive logging output for debugging
3. Use dry run mode to understand behavior
4. Examine the pattern matching logic for customization
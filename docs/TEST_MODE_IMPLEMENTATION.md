# Test Mode Implementation Guide

This document describes the comprehensive test mode support implementation for the A Lo Cubano Boulder Fest system, enabling safe testing in production environments.

## Overview

The test mode system provides:
- **Automatic test mode detection** from environment variables and Stripe session metadata
- **Test data isolation** with proper flagging and filtering via `is_test` column
- **Comprehensive test data management** including cleanup capabilities
- **Audit trail support** for test operations
- **Equal validation security** - test transactions undergo same validation as production

## Components Implemented

### 1. Database Migration (`migrations/024_test_mode_support.sql`)

**Already Exists** - Comprehensive migration that adds:

- `is_test` columns to `transactions`, `tickets`, and `transaction_items` tables
- High-performance indexes for test mode queries
- Test data cleanup audit table (`test_data_cleanup_log`)
- Data integrity triggers ensuring test mode consistency
- Statistical views for production vs test data analysis
- Test data cleanup candidate identification views

### 2. Test Mode Utilities (`lib/test-mode-utils.js`)

**New** - Core utility module providing:

#### Test Mode Detection
```javascript
import { isTestMode, getTestModeFlag } from './test-mode-utils.js';

// Environment-based detection
const testMode = isTestMode(); // true/false
const testFlag = getTestModeFlag(); // 1/0 for database

// Request-based detection
const testMode = isTestMode(req); // Checks headers too
```

**Detection Methods:**
- `NODE_ENV === 'test'`
- `CI === 'true'`
- `E2E_TEST_MODE === 'true'`
- `INTEGRATION_TEST_MODE === 'true'`
- `VERCEL_ENV === 'preview'`
- Request headers: `x-test-mode`, `x-e2e-test`, `x-integration-test`

#### Test Mode Metadata
```javascript
import { createTestModeMetadata } from './test-mode-utils.js';

// Creates metadata for test records
const metadata = createTestModeMetadata(req, {
  source: 'webhook',
  session_id: 'cs_test_123'
});
// Returns: { is_test: 1, test_env: 'ci', test_source: 'webhook', ... }
```

#### Test Mode Filtering
```javascript
import { createTestModeFilter } from './test-mode-utils.js';

// Auto-detects test mode and creates appropriate WHERE clause
const filter = createTestModeFilter('t', null, req);
const sql = `SELECT * FROM tickets t WHERE status = ?${filter.sql}`;
const args = ['valid', ...filter.args];
```

#### Stripe Session Processing
```javascript
import { extractTestModeFromStripeSession } from './test-mode-utils.js';

const testInfo = extractTestModeFromStripeSession(stripeSession);
// Returns: { is_test: 0|1, stripe_test_mode: boolean, metadata_test_mode: boolean }
```

### 3. Updated Transaction Service (`lib/transaction-service.js`)

**Enhanced** with test mode support:

#### Transaction Creation
- Detects test mode from Stripe sessions (livemode flag and metadata)
- Adds `is_test` flag to transaction records
- Includes test mode metadata in order data
- Logs test mode operations for debugging
- **Security**: Test transactions undergo the same validation as production transactions

#### Example Usage
```javascript
// Webhook processing
const transaction = await transactionService.createFromStripeSession(session, req);
// Automatically handles test mode detection and flagging

// Customer queries with test filtering
const transactions = await transactionService.getCustomerTransactions(email, req);
// Returns only appropriate data based on test mode
```

#### New Methods
- `getAllTransactions(options, req)` - with test mode filtering
- `getTransactionStatistics(req)` - breakdown by test/production

### 4. Updated Ticket Service (`lib/ticket-service.js`)

**Enhanced** with test mode support:

#### Ticket Creation
- Inherits test mode from parent transaction
- Validates test mode consistency
- Marks tickets with `is_test` flag from transaction
- Logs test mode operations
- **Security**: All validation rules apply equally to test and production transactions

#### Example Usage
```javascript
// Create tickets from transaction
const tickets = await ticketService.createTicketsFromTransaction(transaction, lineItems, req);
// Automatically inherits test mode from transaction

// Query tickets with test filtering
const userTickets = await ticketService.getTicketsByEmail(email, req);
// Returns filtered results based on test mode
```

#### New Methods
- `getTicketStatistics(req)` - breakdown by test/production
- `getAllTickets(options, req)` - with test mode filtering and pagination
- `cleanupTestTickets(criteria)` - for scheduled cleanup operations

### 5. Updated Test Data Factory (`lib/test-data-factory.js`)

**Enhanced** to use test mode:

- All created transactions marked with `is_test = 1`
- All created tickets marked with `is_test = 1`
- Test-aware naming with TEST- prefixes
- Comprehensive test metadata in records

## Usage Patterns

### For API Endpoints

```javascript
import { isTestMode, logTestModeOperation } from '../lib/test-mode-utils.js';

export default async function handler(req, res) {
  // Log test mode operations
  logTestModeOperation('payment_processing', {
    amount: req.body.amount,
    customer: req.body.customer_email
  }, req);

  // Create transaction with test mode support
  const transaction = await transactionService.createFromStripeSession(session, req);

  // Response includes test mode indicator
  res.json({
    success: true,
    transaction_id: transaction.uuid,
    is_test: transaction.is_test
  });
}
```

### For Admin Queries

```javascript
// Get production-only data
const productionTransactions = await transactionService.getAllTransactions({
  includeTestData: false
}, null);

// Get all data (test + production) in test environment
const allTransactions = await transactionService.getAllTransactions({}, req);

// Get test mode statistics
const stats = await transactionService.getTransactionStatistics();
console.log(`Production: ${stats.production_transactions}, Test: ${stats.test_transactions}`);
```

### For Test Cleanup

```javascript
import { createTestDataCleanupCriteria } from '../lib/test-mode-utils.js';

// Create cleanup criteria
const criteria = createTestDataCleanupCriteria({
  max_age_days: 7,
  exclude_recent_hours: 2,
  max_records: 500
});

// Clean up old test tickets
const result = await ticketService.cleanupTestTickets({
  max_age_days: 7,
  exclude_recent_hours: 2,
  max_records: 100,
  dry_run: false
});

console.log(`Cleaned up ${result.tickets_deleted} test tickets`);
```

## Database Schema Updates

### Tables Enhanced

1. **transactions**
   - Added: `is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1))`

2. **tickets**
   - Added: `is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1))`

3. **transaction_items**
   - Added: `is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1))`

### New Tables

1. **test_data_cleanup_log**
   - Tracks all test data cleanup operations
   - Provides audit trail for compliance
   - Stores cleanup criteria and results

### Indexes Added

High-performance indexes for test mode queries:
- `idx_transactions_test_mode`
- `idx_tickets_test_mode`
- `idx_transaction_items_test_mode`
- Plus many more optimized for specific query patterns

### Views Added

1. **v_data_mode_statistics** - Production vs test data breakdown
2. **v_test_cleanup_history** - Test cleanup operation history
3. **v_active_test_data** - Summary of current test data
4. **v_test_data_cleanup_candidates** - Identifies data ready for cleanup

## Testing

Comprehensive unit tests in `tests/unit/test-mode-utils.test.js`:
- ✅ 24 tests covering all utility functions
- ✅ Environment variable detection
- ✅ Request header detection
- ✅ Test-aware naming
- ✅ Metadata creation
- ✅ Consistency validation
- ✅ Filtering logic
- ✅ Stripe session processing

## Environment Variables

### Test Mode Detection
- `NODE_ENV=test`
- `CI=true`
- `E2E_TEST_MODE=true`
- `INTEGRATION_TEST_MODE=true`
- `VERCEL_ENV=preview`

### Test Mode Configuration
- `TEST_DATA_CLEANUP_ENABLED` (default: true)
- `TEST_DATA_CLEANUP_AGE_DAYS` (default: 30)
- `TEST_DATA_CLEANUP_BATCH_SIZE` (default: 100)
- `TEST_MODE_LOGGING` (default: true)
- `TEST_MODE_STRICT` (default: false)

## Benefits

1. **Safe Testing in Production**
   - Test data is clearly marked and isolated
   - Production queries automatically exclude test data
   - Test operations are logged for debugging

2. **Automatic Test Mode Detection**
   - Works seamlessly with CI/CD pipelines
   - Supports E2E testing on preview deployments
   - Handles multiple test environment patterns

3. **Data Integrity**
   - Database triggers ensure test mode consistency
   - Validation prevents test mode mismatches
   - Comprehensive audit trails

4. **Performance Optimized**
   - Dedicated indexes for test mode queries
   - Efficient filtering reduces query overhead
   - Minimal impact on production operations

5. **Maintenance Ready**
   - Built-in cleanup capabilities for old test data
   - Statistical views for monitoring
   - Compliance-ready audit logging

## Security Behavior

### Validation Consistency

**Critical**: The `is_test` flag is used **only for data organization and cleanup**, NOT for bypassing security validation.

```javascript
// ✅ CORRECT: Test flag marks data for cleanup
const isTestTransaction = testModeInfo.is_test === 1;

// ❌ REMOVED: Test transactions NO LONGER bypass validation
// const shouldBypassValidation = testModeInfo.is_test === 1;
```

**All transactions undergo the same validation regardless of test mode:**
- ✅ Ticket availability checks (sold count, capacity limits)
- ✅ Price validation (2% tolerance for rounding)
- ✅ Transaction amount verification
- ✅ Stripe session integrity checks
- ✅ Payment status validation
- ✅ Customer information validation

**Purpose of `is_test` flag:**
- Mark transactions/tickets for cleanup
- Filter admin dashboard views
- Provide test data statistics
- Support integration test isolation
- Enable test data export/analysis

**Does NOT affect:**
- Security validation logic
- Price verification
- Capacity enforcement
- Fraud detection
- Payment processing rules

This ensures that integration tests accurately reflect production behavior and catch validation issues before deployment.

## Future Enhancements

1. **Scheduled Cleanup Service**
   - Automated cleanup of old test data
   - Configurable retention policies
   - Email notifications for cleanup results

2. **Test Mode Dashboard**
   - Real-time test data statistics
   - Cleanup operation monitoring
   - Test mode configuration management

3. **Advanced Filtering**
   - Test data visibility controls per user role
   - Custom test data retention policies
   - Test data export capabilities

This implementation provides a robust foundation for safe testing in production while maintaining data integrity and performance.
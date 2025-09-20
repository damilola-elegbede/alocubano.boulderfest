# SQL Compatibility Implementation Guide

## Quick Reference: SQL Fixes Required

This guide provides copy-paste ready fixes for all SQL syntax issues in the integration tests.

## Services Requiring Updates

### 1. Financial Reconciliation Service (`lib/financial-reconciliation-service.js`)

**Current Issues**: Uses raw `now` and incompatible date functions

#### Required Changes:

```javascript
// Add import at top of file
import SQLCompatibility from './sql-compatibility.js';

// Example fixes for common patterns:

// BEFORE: WHERE created_at >= now() - interval '24 hours'
// AFTER:
WHERE created_at >= ${SQLCompatibility.getDateOffset(24, 'hours', 'ago')}

// BEFORE: WHERE DATE(created_at) = DATE(now())
// AFTER:
WHERE ${SQLCompatibility.getDateOnly('created_at')} = ${SQLCompatibility.getDateOnly()}

// BEFORE: reconciliation_date = CASE WHEN ? = 'reconciled' THEN now() ELSE reconciliation_date END
// AFTER:
reconciliation_date = CASE WHEN ? = 'reconciled' THEN ${SQLCompatibility.getCurrentTimestamp()} ELSE reconciliation_date END

// BEFORE: created_at < now() - interval '7 days'
// AFTER:
created_at < ${SQLCompatibility.getDateOffset(7, 'days', 'ago')}
```

### 2. Financial Audit Queries (`lib/financial-audit-queries.js`)

**Current Issues**: Mostly correct, but needs consistency

#### Verification Required:

```javascript
// These patterns are CORRECT and should remain:
"datetime('now', '-1 hour')"
"datetime('now', '-1 day')"
"datetime('now', '-7 days')"
"datetime('now', '-30 days')"

// But update for consistency using SQLCompatibility:
${SQLCompatibility.getDateOffset(1, 'hour', 'ago')}
${SQLCompatibility.getDateOffset(1, 'day', 'ago')}
${SQLCompatibility.getDateOffset(7, 'days', 'ago')}
${SQLCompatibility.getDateOffset(30, 'days', 'ago')}
```

### 3. Audit Service (`lib/audit-service.js`)

**Current Issues**: Uses `new Date().toISOString()` which works but could be more consistent

#### Recommended Updates:

```javascript
// Current (works but JavaScript-based):
created_at: new Date().toISOString()

// Better (database-native, but requires query restructuring):
// Use DEFAULT CURRENT_TIMESTAMP in table definition
// Or let database handle it with trigger
```

## Specific Query Fixes

### Query Pattern 1: Date Comparisons

```javascript
// ❌ WRONG - PostgreSQL/MySQL syntax
const query = `
  SELECT * FROM audit_logs
  WHERE created_at >= now() - interval '24 hours'
`;

// ✅ CORRECT - SQLite compatible
const query = `
  SELECT * FROM audit_logs
  WHERE created_at >= datetime('now', '-24 hours')
`;

// ✅ BETTER - Using compatibility layer
const query = `
  SELECT * FROM audit_logs
  WHERE ${SQLCompatibility.getTimeframeFilter('created_at', '24h')}
`;
```

### Query Pattern 2: Date Extraction

```javascript
// ❌ WRONG - PostgreSQL syntax
const query = `
  SELECT EXTRACT(YEAR FROM created_at) as year,
         EXTRACT(MONTH FROM created_at) as month
  FROM transactions
`;

// ✅ CORRECT - SQLite compatible
const query = `
  SELECT strftime('%Y', created_at) as year,
         strftime('%m', created_at) as month
  FROM transactions
`;

// ✅ BETTER - Using compatibility layer
const query = `
  SELECT ${SQLCompatibility.getYear('created_at')} as year,
         ${SQLCompatibility.getMonth('created_at')} as month
  FROM transactions
`;
```

### Query Pattern 3: Date Arithmetic

```javascript
// ❌ WRONG - MySQL syntax
const query = `
  SELECT * FROM audit_logs
  WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
`;

// ✅ CORRECT - SQLite compatible
const query = `
  SELECT * FROM audit_logs
  WHERE created_at < datetime('now', '-7 days')
`;

// ✅ BETTER - Using compatibility layer
const query = `
  SELECT * FROM audit_logs
  WHERE created_at < ${SQLCompatibility.getDateOffset(7, 'days', 'ago')}
`;
```

### Query Pattern 4: Date Differences

```javascript
// ❌ WRONG - PostgreSQL/MySQL syntax
const query = `
  SELECT id, DATEDIFF(now(), created_at) as age_days
  FROM audit_logs
`;

// ✅ CORRECT - SQLite compatible
const query = `
  SELECT id, CAST(julianday('now') - julianday(created_at) AS INTEGER) as age_days
  FROM audit_logs
`;

// ✅ BETTER - Using compatibility layer
const query = `
  SELECT id, ${SQLCompatibility.getAgeInDays('created_at')} as age_days
  FROM audit_logs
`;
```

### Query Pattern 5: Conditional Timestamps

```javascript
// ❌ WRONG - Using raw now()
const query = `
  UPDATE audit_logs
  SET reconciliation_date = CASE
    WHEN ? = 'reconciled' THEN now()
    ELSE reconciliation_date
  END
  WHERE id = ?
`;

// ✅ CORRECT - SQLite compatible
const query = `
  UPDATE audit_logs
  SET reconciliation_date = CASE
    WHEN ? = 'reconciled' THEN datetime('now')
    ELSE reconciliation_date
  END
  WHERE id = ?
`;

// ✅ BETTER - Using compatibility layer
const query = `
  UPDATE audit_logs
  SET reconciliation_date = CASE
    WHEN ? = 'reconciled' THEN ${SQLCompatibility.getCurrentTimestamp()}
    ELSE reconciliation_date
  END
  WHERE id = ?
`;
```

## Files to Update - Priority Order

### High Priority (Causing Test Failures)

1. **`lib/financial-reconciliation-service.js`**
   - Lines: Search for `now()` and replace
   - Lines: Search for `interval` and replace
   - Impact: ~15 test failures

2. **`lib/financial-audit-queries.js`**
   - Lines: Already mostly correct, update for consistency
   - Impact: ~5 test failures

### Medium Priority (Improve Consistency)

3. **`lib/audit-service.js`**
   - Lines: Update date handling for consistency
   - Impact: Improves maintainability

4. **`lib/admin-session-monitor.js`**
   - Check for any date comparisons
   - Impact: Session cleanup issues

5. **`lib/reminder-scheduler.js`**
   - Check for scheduled date calculations
   - Impact: Reminder scheduling

### Low Priority (Working but Could Be Better)

6. **Migration files**
   - Already use CURRENT_TIMESTAMP correctly
   - No changes needed

## Testing the Fixes

### Step 1: Unit Test Individual Queries

```javascript
// Create test file: tests/unit/sql-compatibility.test.js
import { expect, test } from 'vitest';
import SQLCompatibility from '../../lib/sql-compatibility.js';

test('date offset generates correct SQLite syntax', () => {
  const sql = SQLCompatibility.getDateOffset(7, 'days', 'ago');
  expect(sql).toBe("datetime('now', '-7 days')");
});

test('timeframe filter generates correct WHERE clause', () => {
  const sql = SQLCompatibility.getTimeframeFilter('created_at', '24h');
  expect(sql).toBe("created_at >= datetime('now', '-1 days')");
});
```

### Step 2: Run Integration Tests

```bash
# Test financial services specifically
npm run test:integration -- financial

# Test audit services
npm run test:integration -- audit

# Run all integration tests
npm run test:integration
```

### Step 3: Verify with SQLite CLI

```bash
# Test queries directly in SQLite
sqlite3 test.db

# Test the compatibility functions
SELECT datetime('now');
SELECT datetime('now', '-7 days');
SELECT DATE('now');
SELECT strftime('%Y-%m-%d', 'now');
SELECT CAST(julianday('now') - julianday('2024-01-01') AS INTEGER);
```

## Common Pitfalls to Avoid

### ❌ DON'T Use These

```javascript
// PostgreSQL/MySQL specific
now()
NOW()
CURDATE()
CURRENT_DATE()  // Use CURRENT_DATE without parentheses
interval '1 day'
DATE_SUB()
DATE_ADD()
DATEDIFF()
EXTRACT()
```

### ✅ DO Use These Instead

```javascript
// SQLite compatible
datetime('now')
CURRENT_TIMESTAMP  // In DEFAULT clauses
DATE('now')
datetime('now', '+1 day')
datetime('now', '-1 day')
julianday() differences
strftime() for extraction
```

## Validation Checklist

- [ ] No raw `now()` or `NOW()` in any SQL query
- [ ] No `interval` keyword in SQL strings
- [ ] All date arithmetic uses `datetime('now', '±X units')`
- [ ] Date extraction uses `strftime()` or `DATE()`
- [ ] Date differences use `julianday()`
- [ ] All services import `sql-compatibility.js`
- [ ] Integration tests pass without "no such column: now" errors
- [ ] No CLIENT_CLOSED errors during test cleanup

## Quick Test Command

After making changes, run this to verify:

```bash
# Quick check for SQL errors
npm run test:integration 2>&1 | grep -E "(no such column|SQL error)"

# If no output, SQL is likely fixed!
```

## Support

For questions or issues with these fixes:
1. Check SQLite documentation: https://www.sqlite.org/lang_datefunc.html
2. Review the sql-compatibility.js source for available functions
3. Test queries in SQLite CLI before implementing
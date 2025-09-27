# Order Number System

## Overview

The A Lo Cubano Boulder Fest order number system generates unique, sequential order identifiers for all transactions. The system uses a human-readable format with separate sequences for production and test transactions to ensure clear identification and prevent conflicts.

## Format Specification

### Production Format

```
ALCBF-YYYY-NNNNN
```

**Components**:
- `ALCBF`: A Lo Cubano Boulder Fest prefix
- `YYYY`: 4-digit year (e.g., 2026)
- `NNNNN`: 5-digit zero-padded sequence number

**Examples**:
- `ALCBF-2026-00001` (First order of 2026)
- `ALCBF-2026-00542` (542nd order of 2026)
- `ALCBF-2027-00001` (First order of 2027)

### Test Format

```
TEST-YYYY-NNNNN
```

**Components**:
- `TEST`: Test transaction prefix
- `YYYY`: 4-digit year
- `NNNNN`: 5-digit zero-padded sequence starting at 90000

**Examples**:
- `TEST-2026-90001` (First test order of 2026)
- `TEST-2026-90234` (234th test order of 2026)

## Technical Implementation

### Database Schema

The system uses an `order_sequences` table to track sequential numbers:

```sql
CREATE TABLE IF NOT EXISTS order_sequences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sequence_key TEXT UNIQUE NOT NULL,
  last_number INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_order_sequences_key ON order_sequences(sequence_key);
```

### Sequence Keys

Sequence keys combine prefix and year for separate tracking:

- **Production**: `ALCBF-2026`, `ALCBF-2027`, etc.
- **Test**: `TEST-2026`, `TEST-2027`, etc.

### Generation Logic

```javascript
/**
 * Generate unique order ID with database sequence tracking
 * @param {boolean} isTest - Whether this is a test order
 * @returns {Promise<string>} Order ID in format PREFIX-YYYY-XXXXX
 */
async generateOrderId(isTest = false) {
  const year = new Date().getFullYear();
  const prefix = isTest ? 'TEST' : 'ALCBF';
  const sequenceKey = `${prefix}-${year}`;
  const startNumber = isTest ? 90000 : 1;

  // Atomic increment operation
  const result = await db.execute({
    sql: `UPDATE order_sequences
          SET last_number = last_number + 1
          WHERE sequence_key = ?
          RETURNING last_number`,
    args: [sequenceKey]
  });

  // If no existing sequence, create new one
  if (result.rows.length === 0) {
    await db.execute({
      sql: `INSERT INTO order_sequences (sequence_key, last_number)
            VALUES (?, ?)`,
      args: [sequenceKey, startNumber]
    });
    nextNumber = startNumber;
  } else {
    nextNumber = result.rows[0].last_number;
  }

  // Format with zero-padding
  const formattedNumber = String(nextNumber).padStart(5, '0');
  return `${prefix}-${year}-${formattedNumber}`;
}
```

## Thread Safety and Concurrency

### Database-Level Atomicity

The system ensures thread safety through database-level atomic operations:

1. **UPDATE with RETURNING**: Single atomic operation to increment and retrieve
2. **Unique Constraints**: Prevent duplicate sequence keys
3. **Transaction Isolation**: SQLite/Turso handle concurrent access

### Race Condition Prevention

```javascript
// Atomic increment prevents race conditions
const result = await db.execute({
  sql: `UPDATE order_sequences
        SET last_number = last_number + 1
        WHERE sequence_key = ?
        RETURNING last_number`,
  args: [sequenceKey]
});
```

### Fallback Mechanism

If the database table doesn't exist (pre-migration), the system uses a timestamp-based fallback:

```javascript
// Fallback for systems without migration
const timestamp = Date.now();
const random = Math.floor(Math.random() * 10000);
const uniqueComponent = `${timestamp}${random}`.slice(-5);
const fallbackId = `${prefix}-${year}-${uniqueComponent}`;
```

## Integration Points

### Transaction Service Integration

Order IDs are generated during transaction creation:

```javascript
import { generateOrderId } from './order-id-generator.js';

// In transaction creation
const orderId = await generateOrderId(isTestTransaction);
const transaction = await transactionService.create({
  orderId,
  stripeSessionId,
  // ... other fields
});
```

### Stripe Integration

Order IDs appear in Stripe metadata and checkout sessions:

```javascript
// Stripe session creation
const session = await stripe.checkout.sessions.create({
  metadata: {
    orderId: generatedOrderId,
    testMode: isTest ? 'true' : 'false'
  },
  // ... other session config
});
```

### Email Integration

Order IDs are displayed in confirmation emails:

```html
<h2>Order Confirmation</h2>
<p><strong>Order Number:</strong> {{orderId}}</p>
<p>Your tickets for A Lo Cubano Boulder Fest 2026</p>
```

## Migration Requirements

### Database Migration

Create the `order_sequences` table with migration:

```sql
-- Migration: 025_add_order_sequences.sql
CREATE TABLE IF NOT EXISTS order_sequences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sequence_key TEXT UNIQUE NOT NULL,
  last_number INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_order_sequences_key ON order_sequences(sequence_key);

-- Initialize current year sequences if needed
INSERT OR IGNORE INTO order_sequences (sequence_key, last_number)
VALUES
  ('ALCBF-2026', 0),
  ('TEST-2026', 90000);
```

### Existing Data Migration

For systems with existing transactions, backfill order IDs:

```sql
-- Backfill existing transactions with order IDs
UPDATE transactions
SET order_id = 'ALCBF-2026-' || printf('%05d', row_number() OVER (ORDER BY created_at))
WHERE order_id IS NULL
  AND test_mode = 0;

UPDATE transactions
SET order_id = 'TEST-2026-' || printf('%05d', 90000 + row_number() OVER (ORDER BY created_at))
WHERE order_id IS NULL
  AND test_mode = 1;
```

## Validation and Parsing

### Format Validation

```javascript
/**
 * Validate order ID format
 * @param {string} orderId - Order ID to validate
 * @returns {boolean} True if valid format
 */
function isValidOrderIdFormat(orderId) {
  const pattern = /^(ALCBF|TEST)-\d{4}-\d{5}$/;
  return pattern.test(orderId);
}
```

### Order ID Parsing

```javascript
/**
 * Parse order ID to extract components
 * @param {string} orderId - Order ID to parse
 * @returns {Object|null} Parsed components or null if invalid
 */
function parseOrderId(orderId) {
  const match = orderId.match(/^(ALCBF|TEST)-(\d{4})-(\d{5})$/);
  if (!match) return null;

  return {
    prefix: match[1],           // 'ALCBF' or 'TEST'
    year: parseInt(match[2]),   // 2026
    sequence: parseInt(match[3]), // 542
    isTest: match[1] === 'TEST'
  };
}

// Example usage
const parsed = parseOrderId('ALCBF-2026-00542');
console.log(parsed);
// Output: { prefix: 'ALCBF', year: 2026, sequence: 542, isTest: false }
```

## Testing Strategy

### Unit Tests

```javascript
describe('Order ID Generator', () => {
  test('should generate production order ID', async () => {
    const orderId = await generateOrderId(false);
    expect(orderId).toMatch(/^ALCBF-\d{4}-\d{5}$/);
    expect(orderId).toContain('2026'); // Current year
  });

  test('should generate test order ID', async () => {
    const orderId = await generateOrderId(true);
    expect(orderId).toMatch(/^TEST-\d{4}-\d{5}$/);
    expect(orderId).toContain('9000'); // Test prefix
  });

  test('should generate sequential numbers', async () => {
    const id1 = await generateOrderId(false);
    const id2 = await generateOrderId(false);

    const seq1 = parseInt(id1.split('-')[2]);
    const seq2 = parseInt(id2.split('-')[2]);

    expect(seq2).toBe(seq1 + 1);
  });
});
```

### Integration Tests

```javascript
test('should create transaction with order ID', async () => {
  const session = createMockStripeSession();
  const transaction = await transactionService.createFromStripeSession(session);

  expect(transaction.orderId).toBeDefined();
  expect(transaction.orderId).toMatch(/^ALCBF-\d{4}-\d{5}$/);
});
```

### Load Testing

```javascript
// Test concurrent order generation
test('should handle concurrent order creation', async () => {
  const promises = Array(100).fill().map(() => generateOrderId(false));
  const orderIds = await Promise.all(promises);

  // All order IDs should be unique
  const uniqueIds = new Set(orderIds);
  expect(uniqueIds.size).toBe(100);
});
```

## Performance Considerations

### Database Performance

- **Single Table**: Minimal overhead with indexed lookups
- **Atomic Operations**: No table locks, just row-level updates
- **Index Usage**: `sequence_key` index for fast lookups

### Memory Usage

- **Stateless**: No in-memory sequence tracking
- **Minimal Storage**: Each sequence entry uses ~50 bytes
- **Garbage Collection**: Old year sequences can be archived

### Scalability

- **Horizontal Scaling**: Database-backed sequences work across multiple instances
- **Sequence Limits**: 99,999 orders per year per type (expandable to 6+ digits if needed)
- **Year Rollover**: Automatic new sequence creation for new years

## Monitoring and Analytics

### Sequence Monitoring

```javascript
// Get current sequence status
async function getSequenceStatus(year, isTest = false) {
  const prefix = isTest ? 'TEST' : 'ALCBF';
  const sequenceKey = `${prefix}-${year}`;

  const result = await db.execute({
    sql: 'SELECT last_number FROM order_sequences WHERE sequence_key = ?',
    args: [sequenceKey]
  });

  return {
    sequenceKey,
    lastNumber: result.rows[0]?.last_number || 0,
    capacity: isTest ? 10000 : 99999, // Max orders for the year
    utilization: (result.rows[0]?.last_number || 0) / (isTest ? 10000 : 99999)
  };
}
```

### Analytics Queries

```sql
-- Order volume by year
SELECT
  sequence_key,
  last_number as total_orders,
  created_at
FROM order_sequences
ORDER BY sequence_key;

-- Growth tracking
SELECT
  substr(sequence_key, -4) as year,
  sum(case when sequence_key like 'ALCBF%' then last_number else 0 end) as production_orders,
  sum(case when sequence_key like 'TEST%' then last_number - 90000 else 0 end) as test_orders
FROM order_sequences
GROUP BY substr(sequence_key, -4)
ORDER BY year;
```

## Error Handling

### Common Error Scenarios

1. **Database Connection Failure**
   ```javascript
   try {
     const orderId = await generateOrderId();
   } catch (error) {
     // Use fallback timestamp-based ID
     const fallbackId = generateFallbackOrderId();
   }
   ```

2. **Sequence Overflow** (unlikely but handled)
   ```javascript
   if (nextNumber > 99999) {
     throw new Error(`Order sequence overflow for ${sequenceKey}`);
   }
   ```

3. **Year Transition**
   ```javascript
   // Automatic new sequence creation for new years
   if (result.rows.length === 0) {
     await createNewYearSequence(sequenceKey, startNumber);
   }
   ```

### Recovery Procedures

**Manual Sequence Reset**:
```sql
-- Reset sequence if needed (CAUTION: Only use in development)
UPDATE order_sequences
SET last_number = 0
WHERE sequence_key = 'TEST-2026';
```

**Sequence Gap Analysis**:
```sql
-- Find gaps in order sequences (should be rare)
SELECT
  t1.order_id,
  t2.order_id as next_order_id,
  (substr(t2.order_id, -5) - substr(t1.order_id, -5)) as gap
FROM transactions t1
JOIN transactions t2 ON t2.id = (
  SELECT id FROM transactions
  WHERE id > t1.id AND order_id LIKE 'ALCBF-%'
  LIMIT 1
)
WHERE substr(t2.order_id, -5) - substr(t1.order_id, -5) > 1;
```

## Security Considerations

### Order ID Privacy

- **No Sensitive Data**: Order IDs contain no personal information
- **Predictable Sequences**: Sequential nature is acceptable for order tracking
- **Public Display**: Safe to show in emails, receipts, and customer service

### Access Control

- **Generation**: Only server-side transaction creation can generate order IDs
- **Validation**: Client-side validation for format checking only
- **Lookup**: Order IDs used for customer service and admin queries

## Future Enhancements

### Planned Features

1. **Custom Prefixes**: Event-specific prefixes (e.g., `SPRING-2026-00001`)
2. **Sequence Pooling**: Pre-allocate sequence blocks for high-volume periods
3. **Archive Management**: Automatic archiving of old year sequences
4. **Analytics Dashboard**: Real-time order volume and sequence status
5. **Multi-Event Support**: Separate sequences for different events

### Format Evolution

Future format versions might include:
- **Check Digits**: Luhn algorithm for order ID validation
- **Event Codes**: Multi-character event identifiers
- **Regional Codes**: Geographic or venue-specific prefixes

The current format is designed to be forward-compatible with these enhancements.
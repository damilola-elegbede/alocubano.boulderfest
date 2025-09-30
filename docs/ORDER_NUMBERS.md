# Order Number System

## Overview

The A Lo Cubano Boulder Fest order number system generates unique, sequential order identifiers for all transactions. The system uses a human-readable format with separate sequences for production and test transactions to ensure clear identification and prevent conflicts.

## Format Specification

### Production Format

```
ALO-YYYY-NNNN
```

**Components**:
- `ALO`: A Lo Cubano prefix
- `YYYY`: 4-digit year (e.g., 2026)
- `NNNN`: 4-digit zero-padded sequence number

**Examples**:
- `ALO-2026-0001` (First order of 2026)
- `ALO-2026-0542` (542nd order of 2026)
- `ALO-2027-0001` (First order of 2027)

### Test Format

```
TEST-YYYY-NNNN
```

**Components**:
- `TEST`: Test transaction prefix
- `YYYY`: 4-digit year
- `NNNN`: 4-digit zero-padded sequence starting at 9000

**Examples**:
- `TEST-2026-9001` (First test order of 2026)
- `TEST-2026-9234` (234th test order of 2026)

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

- **Production**: `ALO-2026`, `ALO-2027`, etc.
- **Test**: `TEST-2026`, `TEST-2027`, etc.

### Generation Logic

```javascript
/**
 * Generate unique order ID with database sequence tracking
 * @param {boolean} isTest - Whether this is a test order
 * @returns {Promise<string>} Order ID in format PREFIX-YYYY-XXXX
 */
async generateOrderId(isTest = false) {
  const year = new Date().getFullYear();
  const prefix = isTest ? 'TEST' : 'ALO';
  const sequenceKey = `${prefix}-${year}`;
  const startNumber = isTest ? 9000 : 1;

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

  // Format with zero-padding (4 digits)
  const formattedNumber = String(nextNumber).padStart(4, '0');
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
const uniqueComponent = `${timestamp}${random}`.slice(-4);
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
  ('ALO-2026', 0),
  ('TEST-2026', 9000);
```

### Existing Data Migration

For systems with existing transactions, backfill order IDs:

```sql
-- Backfill existing transactions with order IDs
UPDATE transactions
SET order_id = 'ALO-2026-' || printf('%04d', row_number() OVER (ORDER BY created_at))
WHERE order_id IS NULL
  AND test_mode = 0;

UPDATE transactions
SET order_id = 'TEST-2026-' || printf('%04d', 9000 + row_number() OVER (ORDER BY created_at))
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
  const pattern = /^(ALO|TEST)-\d{4}-\d{4}$/;
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
  const match = orderId.match(/^(ALO|TEST)-(\d{4})-(\d{4})$/);
  if (!match) return null;

  return {
    prefix: match[1],           // 'ALO' or 'TEST'
    year: parseInt(match[2]),   // 2026
    sequence: parseInt(match[3]), // 542
    isTest: match[1] === 'TEST'
  };
}

// Example usage
const parsed = parseOrderId('ALO-2026-0542');
console.log(parsed);
// Output: { prefix: 'ALO', year: 2026, sequence: 542, isTest: false }
```

## Testing Strategy

### Unit Tests

```javascript
describe('Order ID Generator', () => {
  test('should generate production order ID', async () => {
    const orderId = await generateOrderId(false);
    expect(orderId).toMatch(/^ALO-\d{4}-\d{4}$/);
    expect(orderId).toContain('2026'); // Current year
  });

  test('should generate test order ID', async () => {
    const orderId = await generateOrderId(true);
    expect(orderId).toMatch(/^TEST-\d{4}-\d{4}$/);
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
  expect(transaction.orderId).toMatch(/^ALO-\d{4}-\d{4}$/);
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
- **Sequence Limits**: 9,999 orders per year per type (expandable to 5+ digits if needed)
- **Year Rollover**: Automatic new sequence creation for new years

## Monitoring and Analytics

### Sequence Monitoring

```javascript
// Get current sequence status
async function getSequenceStatus(year, isTest = false) {
  const prefix = isTest ? 'TEST' : 'ALO';
  const sequenceKey = `${prefix}-${year}`;

  const result = await db.execute({
    sql: 'SELECT last_number FROM order_sequences WHERE sequence_key = ?',
    args: [sequenceKey]
  });

  return {
    sequenceKey,
    lastNumber: result.rows[0]?.last_number || 0,
    capacity: isTest ? 1000 : 9999, // Max orders for the year
    utilization: (result.rows[0]?.last_number || 0) / (isTest ? 1000 : 9999)
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
  sum(case when sequence_key like 'ALO%' then last_number else 0 end) as production_orders,
  sum(case when sequence_key like 'TEST%' then last_number - 9000 else 0 end) as test_orders
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
   if (nextNumber > 9999) {
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
  (substr(t2.order_id, -4) - substr(t1.order_id, -4)) as gap
FROM transactions t1
JOIN transactions t2 ON t2.id = (
  SELECT id FROM transactions
  WHERE id > t1.id AND order_id LIKE 'ALO-%'
  LIMIT 1
)
WHERE substr(t2.order_id, -4) - substr(t1.order_id, -4) > 1;
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

1. **Custom Prefixes**: Event-specific prefixes (e.g., `SPRING-2026-0001`)
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

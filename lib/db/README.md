# Payment System Database

Complete database setup for the A Lo Cubano Boulder Fest payment system, optimized for Vercel Postgres and serverless environments.

## Overview

This database system provides:
- **Secure order management** with customer data and order items
- **Payment processing** with Stripe and PayPal support
- **Webhook idempotency** for reliable payment event handling
- **Refund management** with full audit trails
- **Analytics and reporting** with pre-built queries
- **Performance optimization** for serverless environments

## Quick Start

### 1. Environment Setup

Create a `.env` file with your database configuration:

```env
# Database (Required)
POSTGRES_URL=postgres://username:password@host:port/database
POSTGRES_PRISMA_URL=postgres://username:password@host:port/database?pgbouncer=true
POSTGRES_URL_NON_POOLING=postgres://username:password@host:port/database

# Payment Providers (Optional for database-only usage)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
```

### 2. Install Dependencies

```bash
npm install pg
```

### 3. Run Migrations

```bash
# Check migration status
npm run db:migrate:status

# Run migrations (dry run first)
npm run db:migrate:dry-run

# Apply migrations
npm run db:migrate
```

### 4. Initialize Database Connection

```javascript
import db from './lib/db/index.js';

// Initialize connection
await db.init();

// Check health
const health = await db.health();
console.log('Database status:', health.status);
```

## Database Schema

### Core Tables

- **`customers`** - Customer information with GDPR compliance
- **`orders`** - Order records with status tracking
- **`order_items`** - Individual ticket items with attendee info
- **`payments`** - Payment records with provider integration
- **`refunds`** - Refund tracking and status
- **`webhook_events`** - Webhook idempotency and audit
- **`payment_audit_log`** - Complete audit trail

### Enums and Types

```sql
-- Order/Payment Status
'pending', 'processing', 'completed', 'failed', 'refunded', 'partially_refunded', 'cancelled'

-- Payment Providers
'stripe', 'paypal'

-- Ticket Types
'full_festival', 'day_pass', 'workshop_only', 'social_only', 'vip'
```

## Usage Examples

### Creating Orders

```javascript
import db from './lib/db/index.js';

// Create order with customer and items
const order = await db.orders.create(
  {
    eventId: 'alocubano-2026',
    eventName: 'A Lo Cubano Boulder Fest 2026',
    eventDate: '2026-05-15',
    currency: 'USD'
  },
  {
    email: 'customer@example.com',
    firstName: 'John',
    lastName: 'Doe',
    phone: '+1-555-0123'
  },
  [
    {
      ticketType: 'full_festival',
      quantity: 2,
      unitPriceCents: 15000,
      totalPriceCents: 30000,
      attendeeFirstName: 'John',
      attendeeLastName: 'Doe',
      attendeeEmail: 'john@example.com'
    }
  ]
);

console.log('Order created:', order.order_number);
```

### Processing Payments

```javascript
// Create payment record
const payment = await db.payments.create({
  orderId: order.id,
  provider: 'stripe',
  providerPaymentId: 'pi_1234567890',
  amountCents: 32624, // Including taxes and fees
  currency: 'USD',
  status: 'completed'
});

// Update order status
await db.orders.updateStatus(order.id, 'completed');
```

### Webhook Handling

```javascript
// Record webhook for idempotency
const event = await db.webhooks.record({
  provider: 'stripe',
  providerEventId: 'evt_1234567890',
  eventType: 'payment_intent.succeeded',
  payload: webhookPayload
});

// Check if already processed
const existing = await db.webhooks.getExisting('stripe', 'evt_1234567890');
if (existing) {
  console.log('Webhook already processed');
  return;
}
```

### Analytics and Reporting

```javascript
// Revenue analytics
const revenue = await db.analytics.revenue(
  '2026-01-01',  // dateFrom
  '2026-12-31',  // dateTo
  'month'        // groupBy
);

// Order statistics
const stats = await db.orders.stats({
  dateFrom: '2026-05-01',
  dateTo: '2026-05-31'
});

// Ticket breakdown
const ticketStats = await db.items.revenue({
  eventId: 'alocubano-2026'
});
```

### Customer Service Queries

```javascript
// Search orders
const results = await db.orders.search({
  customerEmail: 'john@example.com',
  status: 'completed'
});

// Get customer order history
const orders = await db.orders.getByCustomer('john@example.com');

// Get order summary
const summary = await db.orders.summary(orderId);
```

## API Structure

### Database Client

```javascript
import { query, queryOne, queryMany, transaction } from './lib/db/client.js';

// Basic queries
const result = await query('SELECT * FROM orders WHERE id = $1', [orderId]);
const order = await queryOne('SELECT * FROM orders WHERE id = $1', [orderId]);
const orders = await queryMany('SELECT * FROM orders LIMIT 10');

// Transactions
await transaction(async (client) => {
  const order = await client.queryOne('INSERT INTO orders (...) RETURNING *', [...]);
  const items = await client.queryMany('INSERT INTO order_items (...) RETURNING *', [...]);
  return { order, items };
});
```

### Models

- **`OrdersModel`** - Complete order management
- **`OrderItemsModel`** - Ticket and attendee management  
- **`PaymentsModel`** - Payment processing and refunds
- **`WebhookEventsModel`** - Webhook idempotency

### Query Helpers

- **`OrderQueries`** - Optimized order queries
- **`PaymentQueries`** - Payment analytics and monitoring
- **`AnalyticsQueries`** - Business intelligence queries
- **`PerformanceQueries`** - Database optimization queries
- **`HealthQueries`** - System health monitoring

## Performance Optimizations

### Indexes

All critical queries are optimized with appropriate indexes:

```sql
-- Order lookups
CREATE INDEX idx_orders_email ON orders(customer_email);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at);

-- Payment processing
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_provider ON payments(provider, provider_payment_id);

-- Webhook idempotency
CREATE INDEX idx_webhook_events_provider ON webhook_events(provider, provider_event_id);
```

### Connection Pooling

Optimized for Vercel serverless with:
- Connection pool management
- Automatic connection cleanup
- Query timeout handling
- Error recovery

### Query Optimization

- Pre-built common queries
- Efficient joins and aggregations
- Pagination support
- Full-text search capabilities

## Security Features

### Data Protection

- **No sensitive payment data stored** (PCI compliance)
- **Encrypted provider-specific data** using JSONB
- **Audit logging** for all transactions
- **GDPR compliance** fields and data retention

### Access Control

```sql
-- Row-level security (can be enabled)
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
```

### Validation

- Input validation on all operations
- SQL injection prevention
- Type checking and constraints
- Business rule enforcement

## Monitoring and Health Checks

### Health Check Endpoint

```javascript
app.get('/api/health/database', async (req, res) => {
  const health = await db.health();
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});
```

### Performance Monitoring

```javascript
// Get database statistics
const stats = await db.getStats();

// Analyze slow queries
const slowQueries = await PerformanceQueries.getSlowQueries(10);

// Check index usage
const indexStats = await PerformanceQueries.getIndexStats();
```

## Migration Management

### Running Migrations

```bash
# Check status
npm run db:migrate:status

# Dry run (safe)
npm run db:migrate:dry-run

# Apply migrations
npm run db:migrate

# Reset (dangerous!)
npm run db:migrate:reset
```

### Migration Files

Migrations are stored in `/migrations/` directory:
- `payment-schema.sql` - Initial schema
- Add new migrations as `001-feature-name.sql`, `002-another-feature.sql`, etc.

### Migration Features

- **Idempotency** - Safe to run multiple times
- **Rollback support** - Track changes for rollback
- **Validation** - Prevent modified migrations
- **Locking** - Prevent concurrent migrations

## Error Handling

### Custom Error Types

```javascript
import { DatabaseError, ConnectionError, QueryError } from './lib/db/client.js';

try {
  await db.orders.create(orderData);
} catch (error) {
  if (error instanceof DatabaseError) {
    console.log('Database error:', error.code);
  }
}
```

### Error Categories

- **`CONNECTION_ERROR`** - Database connectivity issues
- **`DUPLICATE_ENTRY`** - Unique constraint violations
- **`FOREIGN_KEY_VIOLATION`** - Referential integrity errors
- **`NOT_NULL_VIOLATION`** - Required field violations
- **`VALIDATION_ERROR`** - Business rule violations

## Testing

### Unit Tests

```javascript
import db from './lib/db/index.js';

describe('Orders', () => {
  test('should create order', async () => {
    const order = await db.orders.create(orderData, customerData, items);
    expect(order.order_number).toMatch(/^ALB-\d{8}-\d{4}$/);
  });
});
```

### Integration Tests

```javascript
// Test complete payment flow
const order = await db.orders.create(...);
const payment = await db.payments.create(...);
await db.webhooks.record(...);
const finalOrder = await db.orders.get(order.id);
expect(finalOrder.status).toBe('completed');
```

## Deployment

### Vercel Integration

Add to `vercel.json`:

```json
{
  "functions": {
    "api/orders/*.js": { "maxDuration": 30 },
    "api/payments/*.js": { "maxDuration": 30 },
    "api/webhooks/*.js": { "maxDuration": 30 }
  },
  "env": {
    "POSTGRES_URL": "@postgres-url",
    "POSTGRES_PRISMA_URL": "@postgres-prisma-url"
  }
}
```

### Build Process

```bash
# Pre-deployment checks
npm run lint
npm run test
npm run db:migrate:dry-run

# Deploy with migrations
npm run db:migrate
npm run build
vercel deploy
```

## Troubleshooting

### Common Issues

1. **Connection Timeouts**
   - Check POSTGRES_URL format
   - Verify network connectivity
   - Review connection pool settings

2. **Migration Failures**
   - Check migration file syntax
   - Verify database permissions
   - Review constraint violations

3. **Performance Issues**
   - Analyze slow queries
   - Check index usage
   - Review connection pool metrics

### Debug Mode

```javascript
// Enable debug logging
const result = await db.query(sql, params, { debug: true });
```

### Support

- Check `/examples/database-usage.js` for complete examples
- Review error logs in Vercel dashboard
- Use `npm run db:migrate:status` for migration issues

## Contributing

When adding new features:

1. **Create migration files** for schema changes
2. **Update models** with new CRUD operations
3. **Add query helpers** for common operations
4. **Include tests** for new functionality
5. **Update documentation** and examples

This database system is designed to be robust, scalable, and maintainable for the festival's payment processing needs.
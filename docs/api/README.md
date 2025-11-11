# API Documentation

## Overview

This document describes the API architecture for A Lo Cubano Boulder Fest website, built on Vercel serverless functions with a focus on simplicity and reliability.

## Architecture Principles

### Async Service Pattern

All async services use the Promise-Based Lazy Singleton pattern to prevent race conditions:

```javascript
// Required pattern for all async services
class AsyncService {
  constructor() {
    this.instance = null;
    this.initialized = false;
    this.initializationPromise = null;
  }

  async ensureInitialized() {
    if (this.initialized && this.instance) {
      return this.instance; // Fast path
    }

    if (this.initializationPromise) {
      return this.initializationPromise; // Wait for existing
    }

    this.initializationPromise = this._performInitialization();

    try {
      return await this.initializationPromise;
    } catch (error) {
      this.initializationPromise = null; // Enable retry
      throw error;
    }
  }
}
```

### API Handler Pattern

```javascript
import { getDatabaseClient } from "./lib/database.js";

export default async function handler(req, res) {
  const client = await getDatabaseClient(); // Always await initialization
  const result = await client.execute("SELECT * FROM table");
  res.json(result.rows);
}
```

### Database Batch Operations & Transaction Patterns

#### Two-Step Parent-Child Insert Pattern

When inserting parent and child records, always use a two-step pattern with the `RETURNING` clause:

```javascript
// ✅ CORRECT: Two-step pattern with RETURNING
const db = await getDatabaseClient();

// STEP 1: Insert parent record and get its ID
const parentResult = await db.execute({
  sql: `INSERT INTO transactions (...) VALUES (...) RETURNING id`,
  args: [...]
});
const transactionId = parentResult.rows[0].id;

// STEP 2: Build batch operations for child records using the parent ID
const batchOperations = [];
for (const item of items) {
  batchOperations.push({
    sql: `INSERT INTO tickets (..., transaction_id, ...) VALUES (?, ?, ...)`,
    args: [ticketId, transactionId, ...]  // Direct ID reference
  });
}

// STEP 3: Execute child inserts atomically
await db.batch(batchOperations);
```

#### Anti-Pattern: Subqueries in Batch Operations

**DO NOT** use subqueries to reference recently-inserted rows within the same batch:

```javascript
// ❌ INCORRECT: Subquery for uncommitted row in same batch
const batchOperations = [];

// Add parent insert
batchOperations.push({
  sql: `INSERT INTO transactions (...) VALUES (...)`,
  args: [transactionUuid, ...]
});

// Add child insert with subquery
batchOperations.push({
  sql: `INSERT INTO tickets (..., transaction_id, ...)
        VALUES (..., (SELECT id FROM transactions WHERE uuid = ?), ...)`,
  args: [ticketId, transactionUuid, ...]  // Subquery fails!
});

// Execute batch - WILL FAIL
await db.batch(batchOperations);
```

**Why This Fails:**
- Batch operations are executed atomically
- The parent INSERT hasn't been committed when the subquery runs
- SQLite cannot see the uncommitted parent row
- Results in cryptic errors like "no such table" or "not found"

#### Best Practices

1. **Use RETURNING Clause**: Always use `RETURNING id` when inserting parent records
2. **Direct ID References**: Use the returned ID directly in child inserts (no subqueries)
3. **Separate Steps**: Insert parents first, then children in a separate batch
4. **Atomic Updates**: Group related child operations in a single batch for atomicity
5. **Dual-Key Design**: Follow the Foreign Key Pattern (see CLAUDE.md):
   - Parent table: `id INTEGER PRIMARY KEY AUTOINCREMENT` (for FKs)
   - Parent table: `uuid TEXT UNIQUE` (for business logic)
   - Child tables: Reference `parent.id` (INTEGER FK, not UUID)

#### Example: Manual Ticket Creation

```javascript
// Correct implementation from manual-ticket-creation-service.js

// STEP 1: Insert transaction with RETURNING
const txResult = await db.execute({
  sql: `INSERT INTO transactions (...) VALUES (...) RETURNING id`,
  args: [...]
});
const transactionId = txResult.rows[0].id;

// STEP 2: Build ticket batch using transactionId
const batchOps = [];
for (const item of validatedItems) {
  batchOps.push({
    sql: `INSERT INTO tickets (..., transaction_id) VALUES (?, ?, ...)`,
    args: [ticketId, transactionId, ...]  // ✅ Direct reference
  });
}

// STEP 3: Execute ticket batch
await db.batch(batchOps);
```

#### Performance Considerations

- **RETURNING Support**: Fully supported by SQLite/Turso (used in production since 2024)
- **Batch Atomicity**: `db.batch()` executes all operations atomically
- **Transaction Safety**: Failures trigger automatic rollback
- **Race Conditions**: Atomic batch operations prevent concurrent modification issues

#### Related Patterns

- **Sold Count Updates**: Prepend counter updates to batch before ticket inserts
- **Order Number Generation**: Use `RETURNING` with UPDATE for atomic increments
- **Registration Tokens**: Create after parent transaction for referential integrity

## API Endpoints

### Email Services

**Email Confirmation Features**:

- **Order confirmations**: Sent for all completed purchases
- **Donation acknowledgment**: Includes donation count, total amount, and tiered thank you messages
- **Registration reminders**: Automated reminders for incomplete ticket registrations
- **Newsletter subscriptions**: Opt-in via Brevo integration

#### Newsletter Subscription

- **Endpoint**: `POST /api/email/subscribe`
- **Purpose**: Subscribe users to newsletter via Brevo
- **Request**: `{ email: string }`
- **Response**: `{ success: boolean, message: string }`

#### Newsletter Unsubscribe

- **Endpoint**: `GET|POST /api/email/unsubscribe`
- **Purpose**: Unsubscribe users with secure token
- **Query**: `?token=<unsubscribe_token>`
- **Response**: HTML page confirming unsubscription

#### Brevo Webhook

- **Endpoint**: `POST /api/email/brevo-webhook`
- **Purpose**: Process Brevo email events
- **Authentication**: HMAC signature validation
- **Events**: delivered, opened, clicked, bounced, etc.

### Payment Services

#### Create Checkout Session

- **Endpoint**: `POST /api/payments/create-checkout-session`
- **Purpose**: Create Stripe checkout session for ticket purchases and/or donations
- **Request**:

  ```json
  {
    "items": [
      {
        "ticketType": "full-pass|friday|saturday|sunday|donation",
        "quantity": number,
        "price": number,
        "isDonation": boolean,
        "type": "ticket|donation"
      }
    ]
  }
  ```

- **Response**:

  ```json
  {
    "sessionId": "string",
    "url": "string",
    "orderId": "ALO-2026-0001"
  }
  ```

- **Features**:
  - **Mixed orders**: Can include both tickets and donations in single checkout
  - **Donation support**: Items with `isDonation: true` are tracked as donations
  - **Order tracking**: Order number includes both tickets and donations
  - **Email confirmation**: Includes donation acknowledgment for orders with donations

#### Stripe Webhook

- **Endpoint**: `POST /api/payments/stripe-webhook`
- **Purpose**: Handle Stripe payment events
- **Authentication**: Stripe signature validation
- **Events**: payment_intent.succeeded, checkout.session.completed

#### Checkout Success

- **Endpoint**: `GET /api/payments/checkout-success`
- **Purpose**: Handle post-payment redirect
- **Query**: `?session_id=<stripe_session_id>`
- **Response**: HTML success page with ticket details

### QR Code Services

#### Generate QR Code

- **Endpoint**: `GET /api/qr/generate`
- **Purpose**: Generate QR code PNG image for tickets
- **Query**: `?token=<jwt_token>`
- **Response**: Binary PNG image (300x300px)
- **Cache**: 24-hour HTTP cache headers (server-side caching)
- **Authentication**: JWT token validation
- **Error Codes**:
  - `400`: Invalid or missing token
  - `405`: Method not allowed (non-GET)
  - `429`: Rate limit exceeded
  - `500`: QR generation failure

**Note**: The 24-hour HTTP cache is distinct from the client-side 7-day localStorage/Service Worker cache. See [Performance Optimization](/docs/PERFORMANCE_OPTIMIZATION.md) for details on the dual cache architecture.

### Ticket Services

#### Get Ticket Details

- **Endpoint**: `GET /api/tickets/[ticketId]`
- **Purpose**: Retrieve ticket information
- **Response**:

  ```json
  {
    "id": "string",
    "ticketType": "string",
    "purchaseDate": "ISO string",
    "qrToken": "string",
    "qrImageUrl": "string",
    "status": "active|used|expired|cancelled|transferred",
    "validation_status": "valid|invalid|expired|revoked",
    "orderId": "ALO-2026-0001"
  }
  ```

**Status Fields Explained**:

- **status**: User-facing ticket status (displayed to customers)
  - `active`: Ticket is active and ready to use
  - `used`: Ticket has been validated/scanned at event
  - `expired`: Ticket is past the event date
  - `cancelled`: Ticket was cancelled and refunded
  - `transferred`: Ticket ownership was transferred

- **validation_status**: Internal validation state (used for QR validation logic)
  - `valid`: Ticket can be validated at entry
  - `invalid`: Ticket validation is blocked
  - `expired`: Ticket is expired (event ended)
  - `revoked`: Ticket was revoked (security/fraud)

#### Validate Ticket

- **Endpoint**: `POST /api/tickets/validate`
- **Purpose**: Validate QR code at event entrance or display ticket details
- **Request**:

  ```json
  {
    "token": "jwt_token_string",
    "validateOnly": true
  }
  ```

- **Response**:

  ```json
  {
    "valid": true,
    "ticket": {
      "id": "string",
      "type": "string",
      "attendeeName": "string",
      "batchTokens": ["array_of_related_tokens"]
    }
  }
  ```

- **Enhanced Features**:
  - JWT token support for secure validation
  - `validateOnly` flag to prevent scan count increment
  - Batch token support for multi-ticket purchases

- **Error Codes**:
  - `400`: Malformed token or invalid input format
  - `401`: Invalid or expired token (authentication failure)
  - `404`: Ticket not found in database
  - `409`: Ticket locked due to maximum scans exceeded (conflict state)
  - `410`: Event has permanently ended (resource gone)
  - `423`: Ticket temporarily locked (locked resource state)
  - `429`: Rate limit exceeded (too many requests)

#### Register Ticket

- **Endpoint**: `POST /api/tickets/register`
- **Purpose**: Register attendee information for ticket
- **Request**:

  ```json
  {
    "ticketId": "string",
    "name": "string",
    "email": "string",
    "dietaryRestrictions": "string"
  }
  ```

#### Apple Wallet Pass

- **Endpoint**: `GET /api/tickets/apple-wallet/[ticketId]`
- **Purpose**: Generate Apple Wallet pass file
- **Response**: Binary `.pkpass` file
- **Authentication**: JWT-based wallet authentication
- **Features**:
  - Dynamic pass generation with ticket details
  - Branding images and festival colors
  - QR code integration for event entry

#### Google Wallet Pass

- **Endpoint**: `GET /api/tickets/google-wallet/[ticketId]`
- **Purpose**: Generate Google Wallet pass URL
- **Response**:

  ```json
  {
    "url": "https://pay.google.com/gp/v/save/..."
  }
  ```

- **Authentication**: JWT-based wallet authentication
- **Features**:
  - Web-based pass delivery
  - Real-time pass updates
  - Cross-platform compatibility

### Registration Services

#### Get Registration Status

- **Endpoint**: `GET /api/registration/[token]`
- **Purpose**: Get registration status for all tickets in purchase
- **Response**:

  ```json
  {
    "tickets": [
      {
        "id": "string",
        "registered": boolean,
        "registrationData": object
      }
    ]
  }
  ```

#### Batch Registration

- **Endpoint**: `POST /api/registration/batch`
- **Purpose**: Register multiple tickets at once
- **Request**:

  ```json
  {
    "token": "string",
    "registrations": [
      {
        "ticketId": "string",
        "name": "string",
        "email": "string",
        "dietaryRestrictions": "string"
      }
    ]
  }
  ```

#### Registration Health Check

- **Endpoint**: `GET /api/registration/health`
- **Purpose**: Verify registration system status
- **Response**: `{ status: "healthy", database: "connected" }`

### Admin Services

#### Admin Login

- **Endpoint**: `POST /api/admin/login`
- **Purpose**: Authenticate admin users
- **Request**: `{ password: string }`
- **Response**: `{ success: boolean, token: string }`
- **Authentication**: bcrypt password verification

#### Admin Dashboard

- **Endpoint**: `GET /api/admin/dashboard`
- **Purpose**: Get dashboard statistics
- **Authentication**: JWT token required
- **Response**:

  ```json
  {
    "totalTickets": number,
    "totalRevenue": number,
    "registrationRate": number,
    "recentActivity": array,
    "orderMetrics": {
      "totalOrders": number,
      "averageOrderValue": number,
      "ordersByType": object
    }
  }
  ```

#### Admin Registrations

- **Endpoint**: `GET /api/admin/registrations`
- **Purpose**: List all ticket registrations
- **Authentication**: JWT token required
- **Query**: `?page=1&limit=50`
- **Response**: `{ registrations: array, total: number }`

#### Admin Donations Dashboard

- **Endpoint**: `GET /api/admin/donations`
- **Purpose**: Retrieve all donations with filtering and analytics
- **Authentication**: Admin JWT session required
- **Query Parameters**:

  ```javascript
  {
    startDate?: string,    // ISO date format (YYYY-MM-DD)
    endDate?: string,      // ISO date format (YYYY-MM-DD)
    minAmount?: number,    // Minimum donation amount filter
    maxAmount?: number,    // Maximum donation amount filter
    status?: string        // completed|pending|refunded
  }
  ```

- **Response**:

  ```json
  {
    "donations": [
      {
        "id": number,
        "transaction_id": number,
        "order_number": "string",
        "amount": number,
        "donor_email": "string",
        "donor_name": "string",
        "created_at": "ISO string",
        "created_at_mt": "Mountain Time formatted string",
        "status": "completed|pending|refunded",
        "payment_method": "string",
        "stripe_payment_intent": "string"
      }
    ],
    "summary": {
      "total_amount": number,
      "count": number,
      "average_amount": number,
      "largest_donation": number,
      "smallest_donation": number
    },
    "timezone": "America/Denver"
  }
  ```

- **Error Codes**:
  - `401`: Unauthorized (no valid admin session)
  - `403`: Forbidden (invalid admin session)
  - `500`: Server error

### Donations Services

#### Donation Processing

Donations are processed through the payment flow with the following characteristics:

**Donation Item Structure**:

```json
{
  "ticketType": "donation",
  "quantity": 1,
  "price": number,
  "isDonation": true,
  "type": "donation"
}
```

**Key Features**:

- **Flexible amounts**: Donors can choose any amount
- **Combined orders**: Donations can be included with ticket purchases
- **Email notifications**: Donors receive confirmation emails with donation acknowledgment
- **Thank you messages**: Customized by donation amount tier:
  - `< $50`: Standard thank you
  - `$50-$99`: Enhanced appreciation
  - `≥ $100`: Premium recognition with community impact message

**Order Processing**:

1. Donations are included in the Stripe checkout session
2. Payment webhook creates donation records in database
3. Email confirmation includes donation details and thank you message
4. Admin dashboard displays donation analytics

**Database Schema**:

Donations are stored in the `donations` table with the following structure:

```sql
CREATE TABLE donations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'completed',
  FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);
```

**Integration Points**:

- **Payment Flow**: `POST /api/payments/create-checkout-session` accepts donation items
- **Webhook Processing**: `POST /api/payments/stripe-webhook` creates donation records
- **Email Service**: Confirmation emails include donation count and total
- **Admin Dashboard**: `GET /api/admin/donations` provides donation analytics

### Gallery Services

#### Get Photos

- **Endpoint**: `GET /api/gallery`
- **Purpose**: Retrieve photos from Google Drive
- **Query**: `?year=2023&limit=50&offset=0`
- **Response**:

  ```json
  {
    "photos": [
      {
        "id": "string",
        "name": "string",
        "thumbnailUrl": "string",
        "webViewLink": "string",
        "year": number
      }
    ]
  }
  ```

#### Get Available Years

- **Endpoint**: `GET /api/gallery/years`
- **Purpose**: Get list of years with photos
- **Response**: `{ years: [2023, 2024, 2025] }`

#### Featured Photos

- **Endpoint**: `GET /api/featured-photos`
- **Purpose**: Get curated featured photos
- **Response**: `{ photos: array, count: number }`

### Health Check Services

#### General Health Check

- **Endpoint**: `GET /api/health/check`
- **Purpose**: Verify application health
- **Response**:

  ```json
  {
    "status": "healthy",
    "timestamp": "ISO string",
    "services": {
      "database": "connected",
      "email": "configured",
      "payments": "configured",
      "qrGeneration": "operational",
      "walletPasses": "configured"
    }
  }
  ```

#### Database Health Check

- **Endpoint**: `GET /api/health/database`
- **Purpose**: Verify database connectivity
- **Response**: `{ status: "connected", type: "turso|sqlite" }`

## New Features Documentation

### QR Code Generation

The QR code generation system provides secure, cacheable PNG images:

- **JWT Authentication**: Secure token-based validation
- **High Performance**: 300x300px optimized PNG images
- **Cache Headers**: 24-hour browser caching
- **Error Correction**: Medium level (15%) for reliability
- **Email Compatible**: Direct embedding in email templates

### Order Number System

Sequential order tracking with format `ALO-YYYY-NNNN`:

- **Production Orders**: `ALO-2026-0001`, `ALO-2026-0002`, etc.
- **Test Orders**: `TEST-2026-9001`, `TEST-2026-9002`, etc.
- **Database Sequences**: Thread-safe atomic increments
- **Year Separation**: Independent sequences per year
- **Fallback Support**: Timestamp-based IDs if database unavailable

### Enhanced Wallet Passes

Comprehensive mobile wallet integration:

- **Apple Wallet**: `.pkpass` files with certificate signing
- **Google Wallet**: Web-based pass URLs with JWT authentication
- **Dynamic Generation**: Real-time pass creation with ticket details
- **Branding Integration**: Festival colors and logos
- **QR Code Integration**: Seamless event entry validation

### Performance Optimizations

Advanced caching and loading strategies:

- **QR Code Caching**: Dual cache architecture
  - **HTTP Cache**: 24-hour server-side browser cache
  - **Client Cache**: 7-day localStorage + Service Worker cache
- **Service Worker**: Background caching for offline support
- **Lazy Loading**: Intersection Observer for wallet components
- **Progressive Enhancement**: Skeleton UI during loading
- **Retry Logic**: Exponential backoff for network failures

## Database Configuration

### Development (SQLite)

```javascript
// Local development with SQLite
const client = createClient({
  url: 'file:./data/festival.db'
});
```

### Production (Turso)

```javascript
// Production with Turso
const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});
```

## Error Handling

### Standard Error Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "User-friendly error message",
    "details": "Technical details for debugging"
  }
}
```

### HTTP Status Codes

| Code | Usage |
|------|-------|
| 200 | Success |
| 201 | Created (new resource) |
| 400 | Bad Request (validation error or malformed input) |
| 401 | Unauthorized (authentication failure, expired token) |
| 403 | Forbidden (admin only) |
| 404 | Not Found (resource does not exist) |
| 405 | Method Not Allowed |
| 409 | Conflict (maximum scans exceeded, ticket locked) |
| 410 | Gone (event permanently ended) |
| 423 | Locked (resource temporarily locked) |
| 429 | Rate Limited (too many requests) |
| 500 | Internal Server Error |

**Status Code Semantics**:

- **400**: Use for malformed requests, invalid token format, or validation errors
- **401**: Use for authentication failures, expired tokens, or invalid credentials
- **404**: Use when a ticket or resource is not found in the database
- **409**: Use for conflict states (e.g., ticket locked due to max scans)
- **410**: Use when the event has permanently ended (resource is gone forever)
- **423**: Use when a ticket is temporarily locked (may be unlocked later)
- **429**: Use when rate limits are exceeded

## Security

### Authentication

- **Admin endpoints**: JWT tokens with bcrypt password verification
- **Webhook endpoints**: HMAC signature validation
- **Wallet passes**: JWT authentication for secure pass generation
- **QR codes**: JWT token validation for image generation

### Input Validation

- **Email validation**: RFC 5322 compliant
- **SQL injection prevention**: Parameterized queries only
- **XSS protection**: Input sanitization and output encoding
- **Rate limiting**: Implemented on all public endpoints

## Performance

### Response Time Targets

| Endpoint Type | Target | Typical |
|---------------|--------|---------|
| Health checks | < 50ms | ~20ms |
| Database reads | < 100ms | ~50ms |
| Database writes | < 200ms | ~100ms |
| QR generation | < 150ms | ~75ms |
| Wallet passes | < 300ms | ~200ms |
| External API calls | < 1000ms | ~500ms |

### Caching Strategy

**QR Code Dual Cache Architecture:**

The system implements two independent cache layers for QR codes:

1. **HTTP Cache (Server-Side)**: 24-hour browser cache

   - Controlled by API response headers: `Cache-Control: public, max-age=86400`
   - Cacheable by CDN and proxy servers
   - Reduces server load for repeated requests
   - Applies to direct API endpoint calls

2. **Client Cache (Client-Side)**: 7-day localStorage + Service Worker cache
   - Managed by `qr-cache-manager.js` client-side service
   - Provides offline access and faster loading
   - Independent of HTTP cache expiration
   - Requires manual invalidation or cache clearing

**Important Note**: These cache layers work independently. The HTTP cache controls browser and CDN caching for 24 hours, while the client cache provides additional performance benefits through localStorage and Service Worker caching for 7 days. To force a fresh QR code, use the `Cache-Control: no-cache` request header to bypass HTTP cache, or clear client-side cache via `qrCacheManager.clearCache()`.

**Other Caching:**

- **Dynamic content**: No caching (real-time data)
- **Images**: CDN caching via Google Drive
- **Database connections**: Connection pooling via Turso

**Note**: See [Performance Optimization](/docs/PERFORMANCE_OPTIMIZATION.md) for detailed information on cache layer interactions and invalidation strategies.

## Monitoring

### Key Metrics

- **Response times**: P50, P95, P99 latencies
- **Error rates**: 4xx and 5xx response percentages
- **Database performance**: Query execution times
- **Cache performance**: Hit rates and efficiency
- **QR generation**: Success rates and timing
- **Wallet adoption**: Pass generation and usage
- **Rate limiting**: QR scan rate limits and throttling
- **External service health**: Stripe, Brevo, Google Drive availability
- **Donation metrics**: Total donations, average amount, donor conversion rates

### Alerting

- **Critical errors**: 5xx responses > 1%
- **High latency**: P95 > 1000ms
- **Database issues**: Connection failures
- **Cache misses**: Hit rate < 80%
- **Rate limit breaches**: Unusual QR scan patterns
- **External service outages**: Payment or email failures

### QR Scan Rate Limit Monitoring

Monitor these specific metrics for QR code scanning:

- **Rate limit triggers**: Track 429 responses from `/api/qr/generate`
- **Scan patterns**: Identify unusual burst patterns
- **User impact**: Monitor legitimate users affected by rate limits
- **Threshold tuning**: Adjust rate limits based on usage patterns
- **IP-based tracking**: Identify potential abuse sources

**Recommended Actions**:

- Set alerts for sustained 429 response rates > 5%
- Implement progressive rate limit increases for verified users
- Log rate limit violations for security analysis
- Consider implementing CAPTCHA for suspicious patterns

## Development Guidelines

### Adding New Endpoints

1. **Follow async service pattern**: Use Promise-Based Lazy Singleton
2. **Implement error handling**: Standard error format
3. **Add input validation**: Sanitize all inputs
4. **Write tests**: Unit tests for logic, E2E for integration
5. **Document endpoint**: Update this README
6. **Consider caching**: Implement appropriate cache headers
7. **Add monitoring**: Include performance tracking

### Database Migrations

1. **Create migration file**: `/migrations/XXX_description.sql`
2. **Test locally**: Run migration on development database
3. **Deploy**: Migrations run automatically on deployment
4. **Document rollback**: Add rollback procedures for critical migrations

#### Migration 037 Rollback Strategy

Migration 037 introduced the transaction-based reminder system. If rollback is required:

**Rollback SQL**:

```sql
-- Drop reminder tracking tables
DROP TABLE IF EXISTS reminder_execution_log;
DROP TABLE IF EXISTS reminder_schedule;

-- Remove transaction reminder columns
ALTER TABLE transactions DROP COLUMN IF EXISTS reminder_sent_count;
ALTER TABLE transactions DROP COLUMN IF EXISTS last_reminder_sent_at;
ALTER TABLE transactions DROP COLUMN IF EXISTS next_reminder_at;

-- Remove registration_completed_at if added by migration
ALTER TABLE transactions DROP COLUMN IF EXISTS registration_completed_at;
```

**Rollback Procedure**:

1. **Backup Database**: Create full backup before rollback
   ```bash
   # For Turso production database
   turso db dump <database-name> > backup-before-037-rollback.sql
   ```

2. **Execute Rollback SQL**: Run the rollback script above against the database

3. **Verify Schema**: Confirm tables and columns are removed
   ```sql
   -- Verify tables are gone
   SELECT name FROM sqlite_master WHERE type='table' AND name IN ('reminder_schedule', 'reminder_execution_log');

   -- Verify transaction columns are removed
   PRAGMA table_info(transactions);
   ```

4. **Update Migration Status**: Mark migration 037 as rolled back in `migrations` table
   ```sql
   DELETE FROM migrations WHERE filename = '037_add_transaction_reminder_system.sql';
   ```

5. **Disable Reminder Cron**: Comment out or remove reminder cron job from `vercel.json`

6. **Restart Services**: Restart application to clear any cached schema information

**Data Considerations**:

- Rollback will delete all reminder scheduling data
- No impact on ticket or transaction data
- Email sending history is preserved in Brevo
- Consider exporting reminder logs before rollback for analysis

### Security Checklist

- [ ] Input validation implemented
- [ ] SQL injection prevention (parameterized queries)
- [ ] Authentication/authorization where required
- [ ] Rate limiting configured
- [ ] Sensitive data encrypted
- [ ] Error messages don't leak information
- [ ] JWT tokens properly validated
- [ ] Cache headers appropriate for content sensitivity

## Deployment

### Environment Variables

All required environment variables are documented in CLAUDE.md.

### Quality Gates

- **Pre-commit**: Basic validation, unit tests
- **Pre-push**: Full test suite, quality checks
- **CI/CD**: Comprehensive validation, zero-tolerance quality standards

### Rollback Strategy

- **Automatic rollback**: On deployment failure
- **Manual rollback**: Via Vercel dashboard
- **Database rollback**: Manual migration rollback if needed (see procedures above)

## Related Documentation

- [QR Code Generation Endpoint](QR_ENDPOINT.md) - Detailed QR API documentation
- [Order Number System](../ORDER_NUMBERS.md) - Order ID format and generation
- [Wallet Pass Setup](../WALLET_SETUP.md) - Mobile wallet configuration
- [Performance Optimization](../PERFORMANCE_OPTIMIZATION.md) - Caching and optimization features
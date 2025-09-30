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

## API Endpoints

### Email Services

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
- **Purpose**: Create Stripe checkout session for ticket purchases
- **Request**:

  ```json
  {
    "items": [
      {
        "ticketType": "full-pass|friday|saturday|sunday",
        "quantity": number,
        "price": number
      }
    ]
  }
  ```

- **Response**:

  ```json
  {
    "sessionId": "string",
    "url": "string",
    "orderId": "ALO-YYYY-NNNN"
  }
  ```

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
    "qrCode": "string",
    "status": "active|used|expired",
    "orderId": "ALO-YYYY-NNNN"
  }
  ```

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
| 400 | Bad Request (validation error) |
| 401 | Unauthorized |
| 403 | Forbidden (admin only) |
| 404 | Not Found |
| 405 | Method Not Allowed |
| 429 | Rate Limited |
| 500 | Internal Server Error |

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

- **Static responses**: 24-hour browser cache
- **QR codes**: Dual-layer caching
  - **HTTP Cache**: 24-hour browser cache (server-controlled)
  - **Client Cache**: 7-day localStorage + Service Worker cache
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
- **Database rollback**: Manual migration rollback if needed

## Related Documentation

- [QR Code Generation Endpoint](QR_ENDPOINT.md) - Detailed QR API documentation
- [Order Number System](../ORDER_NUMBERS.md) - Order ID format and generation
- [Wallet Pass Setup](../WALLET_SETUP.md) - Mobile wallet configuration
- [Performance Optimization](../PERFORMANCE_OPTIMIZATION.md) - Caching and optimization features
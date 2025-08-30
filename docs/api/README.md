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
- **Response**: `{ sessionId: string, url: string }`

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
    "status": "active|used|expired"
  }
  ```

#### Validate Ticket
- **Endpoint**: `POST /api/tickets/validate`
- **Purpose**: Validate QR code at event entrance
- **Request**: `{ qrCode: string }`
- **Response**: `{ valid: boolean, ticket: object }`

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

#### Google Wallet Pass
- **Endpoint**: `GET /api/tickets/google-wallet/[ticketId]`
- **Purpose**: Generate Google Wallet pass URL
- **Response**: `{ url: string }`

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
    "recentActivity": array
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
      "payments": "configured"
    }
  }
  ```

#### Database Health Check
- **Endpoint**: `GET /api/health/database`
- **Purpose**: Verify database connectivity
- **Response**: `{ status: "connected", type: "turso|sqlite" }`

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
| 429 | Rate Limited |
| 500 | Internal Server Error |

## Security

### Authentication

- **Admin endpoints**: JWT tokens with bcrypt password verification
- **Webhook endpoints**: HMAC signature validation
- **Wallet passes**: JWT authentication for secure pass generation

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
| External API calls | < 1000ms | ~500ms |

### Caching Strategy

- **Static responses**: 24-hour browser cache
- **Dynamic content**: No caching (real-time data)
- **Images**: CDN caching via Google Drive
- **Database connections**: Connection pooling via Turso

## Monitoring

### Key Metrics

- **Response times**: P50, P95, P99 latencies
- **Error rates**: 4xx and 5xx response percentages
- **Database performance**: Query execution times
- **External service health**: Stripe, Brevo, Google Drive availability

### Alerting

- **Critical errors**: 5xx responses > 1%
- **High latency**: P95 > 1000ms
- **Database issues**: Connection failures
- **External service outages**: Payment or email failures

## Development Guidelines

### Adding New Endpoints

1. **Follow async service pattern**: Use Promise-Based Lazy Singleton
2. **Implement error handling**: Standard error format
3. **Add input validation**: Sanitize all inputs
4. **Write tests**: Unit tests for logic, E2E for integration
5. **Document endpoint**: Update this README

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
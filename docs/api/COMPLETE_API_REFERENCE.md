# Complete API Reference - A Lo Cubano Boulder Fest

## Overview

This document provides comprehensive API documentation including all endpoints, request/response formats, error handling, rate limiting, and performance specifications. This supplements the main [API Documentation](./README.md) with complete details for all endpoints.

## Table of Contents

- [Missing Endpoint Documentation](#missing-endpoint-documentation)
- [Enhanced Endpoint Specifications](#enhanced-endpoint-specifications)
- [API Performance Standards](#api-performance-standards)
- [Rate Limiting Details](#rate-limiting-details)
- [Error Handling Patterns](#error-handling-patterns)

## Missing Endpoint Documentation

### POST /api/analytics/track

**Purpose**: Collect client-side analytics and performance metrics

**Authentication**: None (public endpoint)

**Rate Limiting**: 100 requests per minute per IP

**Request Headers**:

```http
Content-Type: application/json
User-Agent: YourApp/1.0
```

**Request Format**:

```json
{
  "event": "page_view",
  "page": "/tickets",
  "timestamp": "2026-05-15T10:30:00Z",
  "metadata": {
    "referrer": "https://google.com",
    "userAgent": "Mozilla/5.0...",
    "sessionId": "sess_abc123",
    "customData": {}
  }
}
```

**Request Body Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| event | string | Yes | Event type (page_view, ticket_selected, etc.) |
| page | string | Yes | Page path where event occurred |
| timestamp | string | Yes | ISO 8601 timestamp |
| metadata | object | No | Additional event data |

**Response (200 OK)**:

```json
{
  "success": true,
  "message": "Event tracked",
  "eventId": "evt_123abc"
}
```

**Error Responses**:

**400 Bad Request** - Invalid event data:

```json
{
  "error": "Invalid event type",
  "code": "INVALID_EVENT",
  "validEvents": ["page_view", "ticket_selected", "checkout_started"]
}
```

**429 Too Many Requests** - Rate limit exceeded:

```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 60,
  "limit": "100 requests per minute"
}
```

**Caching**: No caching (POST request)

**Timeout**: 5 seconds

**Usage Example**:

```javascript
// Track page view
fetch('/api/analytics/track', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    event: 'page_view',
    page: window.location.pathname,
    timestamp: new Date().toISOString(),
    metadata: {
      referrer: document.referrer,
      sessionId: getSessionId()
    }
  })
});

// Track custom event
fetch('/api/analytics/track', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    event: 'ticket_selected',
    page: '/tickets',
    timestamp: new Date().toISOString(),
    metadata: {
      ticketType: 'full-pass',
      quantity: 2,
      price: 150
    }
  })
});
```

**Notes**:

- Currently returns success without actual tracking
- Designed for future integration with analytics services (Google Analytics, Mixpanel, etc.)
- Events are logged but not persisted in current implementation

---

### GET /api/config/environment

**Purpose**: Retrieve current deployment environment information

**Authentication**: None (public endpoint)

**Rate Limiting**: None (configuration endpoint)

**Response (200 OK)**:

```json
{
  "environment": "development",
  "vercelEnv": "preview",
  "isProduction": false,
  "isDevelopment": false,
  "isPreview": true
}
```

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| environment | string | NODE_ENV value (development, production) |
| vercelEnv | string | Vercel environment (development, preview, production) |
| isProduction | boolean | True if vercelEnv === 'production' |
| isDevelopment | boolean | True if vercelEnv === 'development' |
| isPreview | boolean | True if vercelEnv === 'preview' |

**Error Responses**:

**405 Method Not Allowed**:

```json
{
  "error": "Method not allowed"
}
```

**Caching**: 5 minutes (`Cache-Control: max-age=300`)

**Timeout**: 1 second

**Usage Example**:

```javascript
// Check environment in frontend
async function checkEnvironment() {
  const response = await fetch('/api/config/environment');
  const env = await response.json();

  if (env.isProduction) {
    console.log('Running in production');
    // Disable test features
  } else {
    console.log('Running in', env.vercelEnv);
    // Enable test features
  }

  return env;
}

// Use for conditional feature flags
const env = await checkEnvironment();
if (!env.isProduction) {
  // Show test ticket options
  document.getElementById('test-tickets').style.display = 'block';
}
```

**Use Cases**:

- Conditional feature rendering (test tickets in non-production)
- Payment method availability (Stripe disabled in production)
- Debug tool visibility
- Environment-specific configuration

---

### GET /api/config/stripe-public

**Purpose**: Retrieve Stripe publishable key for client-side Stripe.js initialization

**Authentication**: None (publishable keys are public by design)

**Rate Limiting**: 60 requests per minute per IP

**Response (200 OK)**:

```json
{
  "publishableKey": "pk_test_51234567890abcdef",
  "environment": "test"
}
```

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| publishableKey | string | Stripe publishable key (pk_test_* or pk_live_*) |
| environment | string | "test" if pk_test_*, "live" if pk_live_* |

**Error Responses**:

**500 Internal Server Error** - Key not configured:

```json
{
  "error": "❌ FATAL: STRIPE_PUBLISHABLE_KEY secret not configured",
  "message": "Payment system configuration error - missing publishable key"
}
```

**405 Method Not Allowed**:

```json
{
  "error": "Method not allowed"
}
```

**Caching**: 1 hour (`Cache-Control: max-age=3600`)

**Timeout**: 2 seconds

**Usage Example**:

```javascript
// Initialize Stripe in frontend
async function initializeStripe() {
  try {
    const response = await fetch('/api/config/stripe-public');

    if (!response.ok) {
      throw new Error('Failed to load Stripe configuration');
    }

    const config = await response.json();

    // Initialize Stripe.js
    const stripe = Stripe(config.publishableKey);

    // Check environment
    if (config.environment === 'test') {
      console.log('Using Stripe test mode');
    }

    return stripe;
  } catch (error) {
    console.error('Stripe initialization failed:', error);
    throw error;
  }
}

// Use in payment flow
const stripe = await initializeStripe();
const result = await stripe.redirectToCheckout({
  sessionId: checkoutSessionId
});
```

**Security Notes**:

- Publishable keys are safe to expose publicly
- Secret keys are NEVER returned by this endpoint
- Keys are validated on server before sending
- Always use HTTPS in production

---

### GET /api/config/paypal-public

**Purpose**: Retrieve PayPal client configuration for SDK initialization

**Authentication**: None (client IDs are public)

**Rate Limiting**: 60 requests per minute per IP

**Response (200 OK)**:

```json
{
  "clientId": "AYourPayPalClientId...",
  "environment": "sandbox",
  "currency": "USD",
  "intent": "capture",
  "features": {
    "venmo": true,
    "card": true,
    "paylater": true
  }
}
```

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| clientId | string | PayPal client ID for SDK initialization |
| environment | string | "sandbox" or "live" |
| currency | string | Default currency (USD) |
| intent | string | Payment intent (capture or authorize) |
| features | object | Enabled PayPal features |

**Error Responses**:

**500 Internal Server Error** - Not configured:

```json
{
  "error": "PayPal not configured",
  "message": "PAYPAL_CLIENT_ID environment variable not set"
}
```

**405 Method Not Allowed**:

```json
{
  "error": "Method not allowed"
}
```

**Caching**: 1 hour (`Cache-Control: max-age=3600`)

**Timeout**: 2 seconds

**Usage Example**:

```javascript
// Load PayPal SDK dynamically
async function loadPayPalSDK() {
  const response = await fetch('/api/config/paypal-public');
  const config = await response.json();

  const script = document.createElement('script');
  script.src = `https://www.paypal.com/sdk/js?client-id=${config.clientId}&currency=${config.currency}`;

  return new Promise((resolve, reject) => {
    script.onload = () => resolve(window.paypal);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Initialize PayPal buttons
const paypal = await loadPayPalSDK();
paypal.Buttons({
  createOrder: async () => {
    const response = await fetch('/api/payments/paypal/create-order', {
      method: 'POST',
      body: JSON.stringify({ cartItems })
    });
    const data = await response.json();
    return data.orderId;
  },
  onApprove: async (data) => {
    // Handle approval
  }
}).render('#paypal-button-container');
```

---

### GET /api/robots.js

**Purpose**: Generate robots.txt for search engine crawlers

**Authentication**: None (public resource)

**Rate Limiting**: None

**Response (200 OK)**:

```text
User-agent: *
Allow: /

Sitemap: https://alocubanoboulderfest.vercel.app/api/sitemap.xml
```

**Response Headers**:

```http
Content-Type: text/plain
Cache-Control: public, max-age=86400
```

**Caching**: 24 hours

**Timeout**: 1 second

**Dynamic Rules**:

```javascript
// Production
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/admin/
Sitemap: https://alocubanoboulderfest.vercel.app/api/sitemap.xml

// Preview/Development
User-agent: *
Disallow: /
```

**Usage Example**:

```bash
# Search engines automatically fetch
curl https://alocubanoboulderfest.vercel.app/robots.txt

# Returns crawling rules
User-agent: *
Allow: /
```

---

### GET /api/sitemap.xml.js

**Purpose**: Generate XML sitemap for search engines

**Authentication**: None (public resource)

**Rate Limiting**: None

**Response (200 OK)**:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://alocubanoboulderfest.vercel.app/</loc>
    <lastmod>2026-05-15</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://alocubanoboulderfest.vercel.app/tickets</loc>
    <lastmod>2026-05-15</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://alocubanoboulderfest.vercel.app/gallery</loc>
    <lastmod>2026-05-15</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
```

**Response Headers**:

```http
Content-Type: application/xml
Cache-Control: public, max-age=86400
```

**Included Pages**:

| Page | Priority | Change Frequency |
|------|----------|------------------|
| / (home) | 1.0 | weekly |
| /tickets | 0.9 | daily |
| /schedule | 0.8 | weekly |
| /artists | 0.8 | weekly |
| /gallery | 0.8 | weekly |
| /about | 0.7 | monthly |
| /donations | 0.7 | monthly |

**Caching**: 24 hours

**Timeout**: 2 seconds

**Usage Example**:

```bash
# Search engines automatically fetch
curl https://alocubanoboulderfest.vercel.app/sitemap.xml

# Submit to Google Search Console
# Submit to Bing Webmaster Tools
```

---

### GET /api/embedded-docs.js

**Purpose**: Serve API documentation in HTML format for embedding in admin panels

**Authentication**: None (public documentation)

**Rate Limiting**: 30 requests per minute per IP

**Response (200 OK)**:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <title>API Documentation - A Lo Cubano Boulder Fest</title>
  <style>
    /* Documentation styling */
  </style>
</head>
<body>
  <h1>A Lo Cubano Boulder Fest API</h1>
  <nav>
    <a href="#tickets">Tickets</a>
    <a href="#payments">Payments</a>
    <!-- ... -->
  </nav>
  <section id="tickets">
    <!-- API documentation content -->
  </section>
</body>
</html>
```

**Response Headers**:

```http
Content-Type: text/html
Cache-Control: public, max-age=3600
```

**Features**:

- Syntax-highlighted code examples
- Interactive API explorer
- Collapsible sections
- Search functionality
- Copy-to-clipboard for examples

**Caching**: 1 hour

**Timeout**: 3 seconds

**Usage Example**:

```html
<!-- Embed in admin panel -->
<iframe
  src="/api/embedded-docs"
  width="100%"
  height="800"
  frameborder="0"
  title="API Documentation"
></iframe>

<!-- Or fetch and render inline -->
<script>
async function loadDocs() {
  const response = await fetch('/api/embedded-docs');
  const html = await response.text();
  document.getElementById('docs-container').innerHTML = html;
}
</script>
```

---

## Enhanced Endpoint Specifications

### POST /api/payments/create-checkout-session

**Complete Specification**

**Rate Limiting**:

- 10 requests per minute per IP
- 50 requests per hour per user session
- Burst allowance: 3 requests in 10 seconds

**Maximum Limits**:

- Cart size: 50 items maximum
- Total amount: $10,000 maximum per transaction
- Donation amount: $10,000 maximum per donation

**Timeout Specifications**:

- Request timeout: 30 seconds
- Database query timeout: 5 seconds
- Stripe API timeout: 20 seconds
- Webhook retry timeout: 60 seconds

**Webhook Retry Policy**:

- Initial retry: Immediate
- Retry 1: After 5 minutes
- Retry 2: After 15 minutes
- Retry 3: After 1 hour
- Retry 4: After 6 hours
- Maximum retries: 5 attempts
- Exponential backoff: 2x multiplier

**Complete Request Format**:

```json
{
  "items": [
    {
      "ticketType": "full-pass",
      "quantity": 2,
      "price": 15000,
      "isDonation": false,
      "type": "ticket",
      "eventId": "boulder-fest-2026",
      "eventName": "Boulder Fest 2026",
      "eventDate": "2026-05-15T00:00:00-06:00",
      "venue": "Avalon Ballroom"
    },
    {
      "ticketType": "donation",
      "quantity": 1,
      "price": 5000,
      "isDonation": true,
      "type": "donation",
      "category": "general"
    }
  ],
  "customerInfo": {
    "email": "customer@example.com",
    "firstName": "Jane",
    "lastName": "Smith"
  }
}
```

**Validation Rules**:

- All prices must be in cents (integer)
- Quantity must be 1-10 for tickets
- Donation minimum: $5 (500 cents)
- Email must be valid RFC 5322 format
- Event date must be in future

**Error Scenarios**:

**400 Bad Request** - Validation failed:

```json
{
  "error": "Validation failed",
  "details": {
    "items[0].price": "Price must be a positive integer in cents",
    "items[1].quantity": "Quantity must be between 1 and 10",
    "customerInfo.email": "Invalid email format"
  }
}
```

**409 Conflict** - Inventory insufficient:

```json
{
  "error": "Insufficient inventory",
  "details": {
    "ticketType": "full-pass",
    "requested": 5,
    "available": 3
  }
}
```

**429 Too Many Requests**:

```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 60,
  "limit": "10 requests per minute"
}
```

**500 Internal Server Error** - Stripe API failure:

```json
{
  "error": "Payment service unavailable",
  "message": "Stripe API error",
  "retryable": true
}
```

---

### POST /api/tickets/validate

**Complete Specification**

**Rate Limiting**:

- 100 requests per minute per IP
- Sliding window algorithm
- Burst protection: 10 requests per second

**Timeout Specifications**:

- Request timeout: 10 seconds
- Database query timeout: 3 seconds
- JWT verification timeout: 1 second

**Complete Request Format**:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "validateOnly": true,
  "metadata": {
    "scanLocation": "entrance-a",
    "scannerDevice": "scanner-001",
    "timestamp": "2026-05-15T18:30:00-06:00"
  }
}
```

**Request Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| token | string | Yes | JWT QR code token |
| validateOnly | boolean | No | If true, don't increment scan count |
| metadata | object | No | Additional scan metadata |

**Complete Success Response (200 OK)**:

```json
{
  "valid": true,
  "ticket": {
    "id": "TKT-ABC123",
    "type": "full-pass",
    "attendeeName": "John Doe",
    "attendeeEmail": "john@example.com",
    "purchaseDate": "2026-04-15T10:00:00-06:00",
    "eventDate": "2026-05-15T00:00:00-06:00",
    "status": "active",
    "scanCount": 0,
    "maxScans": 3,
    "batchTokens": ["token1", "token2"],
    "orderId": "ALO-2026-0001"
  },
  "scanInfo": {
    "timestamp": "2026-05-15T18:30:00-06:00",
    "location": "entrance-a",
    "scanner": "scanner-001"
  }
}
```

**Complete Error Responses**:

**400 Bad Request** - Malformed token:

```json
{
  "error": "Malformed token",
  "code": "INVALID_TOKEN_FORMAT",
  "details": "Token must be a valid JWT string"
}
```

**401 Unauthorized** - Invalid/expired token:

```json
{
  "error": "Invalid or expired token",
  "code": "TOKEN_VERIFICATION_FAILED",
  "details": "Token signature verification failed"
}
```

**404 Not Found** - Ticket not found:

```json
{
  "error": "Ticket not found",
  "code": "TICKET_NOT_FOUND",
  "ticketId": "TKT-ABC123"
}
```

**409 Conflict** - Maximum scans exceeded:

```json
{
  "error": "Ticket locked - maximum scans exceeded",
  "code": "MAX_SCANS_EXCEEDED",
  "details": {
    "scanCount": 3,
    "maxScans": 3,
    "lastScanned": "2026-05-15T18:00:00-06:00"
  }
}
```

**410 Gone** - Event ended:

```json
{
  "error": "Event has permanently ended",
  "code": "EVENT_ENDED",
  "eventDate": "2026-05-15T00:00:00-06:00"
}
```

**423 Locked** - Ticket temporarily locked:

```json
{
  "error": "Ticket temporarily locked",
  "code": "TICKET_LOCKED",
  "details": {
    "reason": "fraud_investigation",
    "lockedUntil": "2026-05-15T20:00:00-06:00"
  }
}
```

**429 Too Many Requests**:

```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 60,
  "limit": "100 requests per minute"
}
```

---

### GET /api/admin/donations

**Complete Specification**

**Authentication**: Admin JWT session required

**Rate Limiting**: None (admin endpoint)

**Pagination**:

- Default limit: 50
- Maximum limit: 500
- Offset-based pagination
- Total count included in response

**Sorting Options**:

| Field | Order | Description |
|-------|-------|-------------|
| created_at | ASC/DESC | Sort by donation date |
| amount | ASC/DESC | Sort by donation amount |
| donor_name | ASC/DESC | Sort alphabetically |
| status | ASC/DESC | Sort by status |

**Filter Parameters**:

```javascript
{
  startDate: '2026-01-01',        // ISO date format
  endDate: '2026-12-31',          // ISO date format
  minAmount: 10.00,               // Minimum amount in dollars
  maxAmount: 1000.00,             // Maximum amount in dollars
  status: 'completed',            // completed|pending|refunded
  sortBy: 'created_at',           // Field to sort by
  sortOrder: 'DESC',              // ASC or DESC
  limit: 100,                     // Results per page
  offset: 0                       // Pagination offset
}
```

**Complete Request Example**:

```http
GET /api/admin/donations?startDate=2026-01-01&endDate=2026-12-31&minAmount=50&sortBy=amount&sortOrder=DESC&limit=100&offset=0
Authorization: Bearer <admin-jwt-token>
```

**Complete Response (200 OK)**:

```json
{
  "donations": [
    {
      "id": 1,
      "transaction_id": 123,
      "order_number": "ALO-2026-0001",
      "amount": 100.00,
      "donor_email": "donor@example.com",
      "donor_name": "Jane Smith",
      "created_at": "2026-05-15T10:30:00Z",
      "created_at_mt": "May 15, 2026, 3:30 AM MDT",
      "status": "completed",
      "payment_method": "stripe",
      "stripe_payment_intent": "pi_abc123",
      "metadata": {
        "campaign": "general",
        "source": "website"
      }
    }
  ],
  "summary": {
    "total_amount": 1250.00,
    "count": 25,
    "average_amount": 50.00,
    "largest_donation": 500.00,
    "smallest_donation": 5.00,
    "by_status": {
      "completed": 23,
      "pending": 1,
      "refunded": 1
    }
  },
  "pagination": {
    "total": 125,
    "limit": 100,
    "offset": 0,
    "hasMore": true
  },
  "timezone": "America/Denver"
}
```

**Export Formats**:

**CSV Export**:

```http
GET /api/admin/donations?format=csv
Authorization: Bearer <admin-jwt-token>

# Response
Content-Type: text/csv
Content-Disposition: attachment; filename="donations-2026-05-15.csv"

id,amount,donor_name,donor_email,created_at,status
1,100.00,Jane Smith,donor@example.com,2026-05-15T10:30:00Z,completed
```

**JSON Export**:

```http
GET /api/admin/donations?format=json&export=true
Authorization: Bearer <admin-jwt-token>

# Response includes all donations without pagination
```

**Error Responses**:

**401 Unauthorized**:

```json
{
  "error": "Unauthorized",
  "message": "Admin authentication required"
}
```

**403 Forbidden**:

```json
{
  "error": "Forbidden",
  "message": "Invalid or expired admin session"
}
```

---

### GET /api/qr/generate

**Complete Specification**

**Rate Limiting**:

- 100 requests per minute per IP
- 1000 requests per hour per user
- Burst protection: 10 requests per 5 seconds

**Cache Strategy**:

- Server-side: 24-hour HTTP cache
- CDN cache: 24 hours
- Browser cache: 24 hours
- Cache key: `qr-{token-hash}`

**Invalidation**:

- Manual: Force refresh with `Cache-Control: no-cache` header
- Automatic: On ticket status change
- Method: Broadcast cache invalidation event

**Image Specifications**:

- Format: PNG
- Dimensions: 300x300 pixels
- Background: White (#FFFFFF)
- Foreground: Black (#000000)
- Error correction level: Q (25% recovery)
- Margin: 4 modules (16px)

**QR Content Format**:

```javascript
// JWT token structure
{
  "ticketId": "TKT-ABC123",
  "type": "full-pass",
  "issued": "2026-04-15T10:00:00Z",
  "exp": "2026-05-16T23:59:59Z"
}
```

**Complete Request**:

```http
GET /api/qr/generate?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Cache-Control: max-age=86400
```

**Complete Response (200 OK)**:

```http
HTTP/2 200 OK
Content-Type: image/png
Cache-Control: public, max-age=86400, immutable
ETag: "qr-abc123def456"
Content-Length: 8742
X-Cache-Hit: true
X-Generation-Time: 45ms

<binary PNG data>
```

**Error Responses**:

**400 Bad Request** - Invalid token:

```json
{
  "error": "Invalid or missing token",
  "code": "INVALID_TOKEN"
}
```

**401 Unauthorized** - Expired token:

```json
{
  "error": "Token has expired",
  "code": "TOKEN_EXPIRED",
  "expiredAt": "2026-05-16T23:59:59Z"
}
```

**405 Method Not Allowed**:

```json
{
  "error": "Method not allowed",
  "allowed": ["GET"]
}
```

**429 Too Many Requests**:

```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 60,
  "limit": "100 requests per minute"
}
```

**500 Internal Server Error** - Generation failed:

```json
{
  "error": "QR code generation failed",
  "code": "GENERATION_ERROR",
  "requestId": "req_abc123"
}
```

**Usage with Cache Control**:

```javascript
// Force fresh QR code
fetch('/api/qr/generate?token=...', {
  headers: {
    'Cache-Control': 'no-cache'
  }
});

// Use cached version
fetch('/api/qr/generate?token=...');
```

---

## API Performance Standards

### Response Time Targets

| Endpoint Category | Target | Acceptable | Maximum | Timeout |
|-------------------|--------|------------|---------|---------|
| Config endpoints | < 50ms | < 100ms | 200ms | 1s |
| Health checks | < 50ms | < 100ms | 200ms | 2s |
| Ticket queries | < 100ms | < 200ms | 500ms | 10s |
| Cart operations | < 100ms | < 200ms | 500ms | 5s |
| Payment creation | < 200ms | < 500ms | 1s | 30s |
| QR generation | < 100ms | < 200ms | 500ms | 5s |
| Admin queries | < 200ms | < 500ms | 1s | 10s |
| Analytics tracking | < 100ms | < 200ms | 500ms | 5s |

### Performance Monitoring

**Metrics Collected**:

- Response time (P50, P95, P99)
- Error rate (4xx, 5xx)
- Cache hit rate
- Database query time
- External API latency

**Alerting Thresholds**:

- P95 > 1000ms: Warning
- P99 > 2000ms: Critical
- Error rate > 1%: Warning
- Error rate > 5%: Critical
- Cache hit rate < 80%: Warning

---

## Rate Limiting Details

### Rate Limit Headers

All rate-limited endpoints return these headers:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1704873600
X-RateLimit-Window: 60
```

### Rate Limit Policies

**Endpoint-Specific Limits**:

| Endpoint | Requests | Window | Burst |
|----------|----------|--------|-------|
| /api/analytics/track | 100 | 1 min | 10/10s |
| /api/config/* | 60 | 1 min | - |
| /api/payments/create-checkout-session | 10 | 1 min | 3/10s |
| /api/tickets/validate | 100 | 1 min | 10/1s |
| /api/qr/generate | 100 | 1 min | 10/5s |
| /api/admin/* | None | - | - |

**429 Response Format**:

```json
{
  "error": "Rate limit exceeded",
  "limit": 100,
  "window": 60,
  "retryAfter": 45,
  "resetAt": "2026-05-15T10:31:00Z"
}
```

---

## Error Handling Patterns

### Standard Error Format

```json
{
  "error": "Brief error message",
  "code": "ERROR_CODE",
  "message": "Detailed error description",
  "details": {
    "field": "Specific field error"
  },
  "requestId": "req_abc123",
  "timestamp": "2026-05-15T10:30:00Z",
  "documentation": "https://docs.alocubano.com/errors/ERROR_CODE"
}
```

### HTTP Status Code Usage

| Code | When to Use | Example |
|------|-------------|---------|
| 200 | Success | Data retrieved |
| 201 | Created | Resource created |
| 400 | Client error | Invalid input |
| 401 | Auth failed | Invalid token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not found | Resource doesn't exist |
| 409 | Conflict | Duplicate or constraint violation |
| 410 | Gone | Resource permanently unavailable |
| 423 | Locked | Resource temporarily locked |
| 429 | Rate limited | Too many requests |
| 500 | Server error | Unexpected error |
| 503 | Unavailable | Service temporarily down |

### Error Recovery Strategies

**Retryable Errors (5xx, 429)**:

```javascript
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || 60;
        await sleep(retryAfter * 1000);
        continue;
      }

      if (response.status >= 500) {
        await sleep(Math.pow(2, i) * 1000); // Exponential backoff
        continue;
      }

      return response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(Math.pow(2, i) * 1000);
    }
  }
}
```

**Non-Retryable Errors (4xx)**:

```javascript
async function handleClientError(response) {
  const error = await response.json();

  switch (response.status) {
    case 400:
      // Show validation errors to user
      displayValidationErrors(error.details);
      break;
    case 401:
      // Redirect to login
      window.location.href = '/login';
      break;
    case 404:
      // Show not found message
      displayNotFound();
      break;
    case 409:
      // Handle conflict (e.g., sold out)
      displayConflictMessage(error);
      break;
  }
}
```

---

## API Best Practices

### Request Optimization

```javascript
// ✅ Include necessary headers
fetch('/api/endpoint', {
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Request-ID': generateRequestId()
  }
});

// ✅ Use appropriate HTTP methods
const response = await fetch('/api/tickets', {
  method: 'POST',
  body: JSON.stringify(data)
});

// ✅ Handle errors gracefully
try {
  const response = await fetch('/api/endpoint');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
} catch (error) {
  handleError(error);
}
```

### Response Caching

```javascript
// Leverage HTTP caching
const response = await fetch('/api/config/stripe-public', {
  headers: {
    'Cache-Control': 'max-age=3600' // Use cached version if available
  }
});

// Force fresh data
const response = await fetch('/api/tickets/availability', {
  headers: {
    'Cache-Control': 'no-cache' // Always fetch fresh
  }
});
```

### Performance Monitoring

```javascript
// Track API performance
const start = performance.now();

const response = await fetch('/api/endpoint');
const data = await response.json();

const duration = performance.now() - start;

// Send to analytics
trackAPIPerformance({
  endpoint: '/api/endpoint',
  duration,
  status: response.status
});
```

---

## API Versioning Strategy

### Current Approach

- Single version (no explicit versioning)
- Backward compatibility maintained
- Breaking changes announced 60 days in advance
- Deprecation warnings in responses

### Future Versioning

```http
GET /api/v2/tickets
Accept: application/vnd.alocubano.v2+json
```

---

## Support and Documentation

**API Issues**: Create GitHub issue with `api` label

**Performance Issues**: Include request ID from `X-Request-ID` header

**Rate Limit Increases**: Contact alocubanoboulderfest@gmail.com

**Documentation Updates**: Pull requests welcome

---

This completes the comprehensive API reference documentation including all missing endpoints and enhanced specifications for key endpoints.

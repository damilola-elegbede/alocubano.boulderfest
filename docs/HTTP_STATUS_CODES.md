# HTTP Status Codes

Complete reference for HTTP status code usage in A Lo Cubano Boulder Fest APIs.

## Overview

This document defines the standard HTTP status codes used across all API endpoints, ensuring consistent error handling and RESTful conventions.

## Status Code Categories

### 2xx Success

**Definition**: Request succeeded

**Usage**: Return when operation completes successfully

### 3xx Redirection

**Definition**: Further action needed to complete request

**Usage**: Return when client needs to follow redirect

### 4xx Client Errors

**Definition**: Client made an error

**Usage**: Return when request is invalid or unauthorized

### 5xx Server Errors

**Definition**: Server encountered an error

**Usage**: Return when server fails to fulfill valid request

## Standard Status Codes

### 200 OK

**Category**: Success

**Meaning**: Request succeeded, response body contains result

**When to Use**:

- GET request returns data successfully
- PUT/PATCH request updates resource successfully
- POST request creates resource but doesn't need 201

**Examples**:

```javascript
// GET request - return existing data
res.status(200).json({
  tickets: [...],
  total: 10
});

// POST request - non-creation operation
res.status(200).json({
  message: 'Cache warmed successfully',
  warmedCount: 25
});

// PUT request - update resource
res.status(200).json({
  message: 'User updated successfully',
  user: { id: 123, name: 'Updated Name' }
});
```

**Response Structure**:

```typescript
{
  // Success data
  data?: any;
  message?: string;
  metadata?: {
    timestamp: string;
    requestId?: string;
  };
}
```

### 201 Created

**Category**: Success

**Meaning**: Resource created successfully

**When to Use**:

- POST request creates new resource
- Resource has a URI/ID that can be referenced

**Examples**:

```javascript
// Create new ticket
res.status(201)
  .setHeader('Location', `/api/tickets/${ticketId}`)
  .json({
    message: 'Ticket created successfully',
    ticket: {
      id: ticketId,
      type: 'early-bird',
      price: 125
    }
  });

// Create new registration
res.status(201)
  .setHeader('Location', `/api/registration/${token}`)
  .json({
    message: 'Registration created',
    registrationToken: token
  });
```

**Required Headers**:

- `Location`: URI of created resource

**Response Structure**:

```typescript
{
  message: string;
  [resourceName]: {
    id: string | number;
    // other resource fields
  };
}
```

### 204 No Content

**Category**: Success

**Meaning**: Request succeeded, no response body

**When to Use**:

- DELETE request removes resource successfully
- PUT/PATCH request with no meaningful response
- Operation succeeds but nothing to return

**Examples**:

```javascript
// Delete resource
await db.delete('tickets', ticketId);
res.status(204).end();

// Update with no response needed
await db.update('users', userId, updates);
res.status(204).end();
```

**Response**: Empty body (no JSON)

### 400 Bad Request

**Category**: Client Error

**Meaning**: Request syntax or validation error

**When to Use**:

- Missing required parameters
- Invalid parameter format
- Validation fails
- Malformed JSON

**Examples**:

```javascript
// Missing required field
if (!email) {
  return res.status(400).json({
    error: 'Validation error',
    message: 'Email is required',
    field: 'email'
  });
}

// Invalid format
if (!isValidEmail(email)) {
  return res.status(400).json({
    error: 'Validation error',
    message: 'Invalid email format',
    field: 'email',
    provided: email
  });
}

// Invalid parameter value
if (limit < 1 || limit > 100) {
  return res.status(400).json({
    error: 'Invalid parameter',
    message: 'Limit must be between 1 and 100',
    field: 'limit',
    provided: limit
  });
}
```

**Response Structure**:

```typescript
{
  error: 'Validation error' | 'Invalid parameter' | 'Malformed request';
  message: string;  // Human-readable description
  field?: string;   // Field that failed validation
  provided?: any;   // Invalid value provided
  expected?: string; // Expected format/value
}
```

### 401 Unauthorized

**Category**: Client Error

**Meaning**: Authentication required or failed

**When to Use**:

- No authentication credentials provided
- Invalid authentication credentials
- Expired authentication token
- Authentication method not supported

**Examples**:

```javascript
// No credentials
if (!authHeader) {
  return res.status(401)
    .setHeader('WWW-Authenticate', 'Bearer realm="API"')
    .json({
      error: 'Authentication required',
      message: 'No authentication credentials provided'
    });
}

// Invalid token
if (!isValidToken(token)) {
  return res.status(401)
    .setHeader('WWW-Authenticate', 'Bearer error="invalid_token"')
    .json({
      error: 'Invalid credentials',
      message: 'Authentication token is invalid or expired'
    });
}

// Wrong password
const match = await bcrypt.compare(password, hash);
if (!match) {
  return res.status(401).json({
    error: 'Authentication failed',
    message: 'Invalid username or password'
  });
}
```

**Required Headers**:

- `WWW-Authenticate`: Authentication method and realm

**Response Structure**:

```typescript
{
  error: 'Authentication required' | 'Invalid credentials' | 'Authentication failed';
  message: string;
}
```

**Note**: Never reveal which field is wrong (username vs password) to prevent user enumeration.

### 403 Forbidden

**Category**: Client Error

**Meaning**: Authenticated but not authorized

**When to Use**:

- User authenticated but lacks permissions
- Resource access restricted
- Operation not allowed for this user
- Rate limit exceeded

**Examples**:

```javascript
// Insufficient permissions
if (user.role !== 'admin') {
  return res.status(403).json({
    error: 'Forbidden',
    message: 'Admin access required for this operation'
  });
}

// Resource access denied
if (ticket.userId !== user.id && !user.isAdmin) {
  return res.status(403).json({
    error: 'Access denied',
    message: 'You do not have permission to access this ticket'
  });
}

// Rate limit exceeded
if (requestCount > limit) {
  return res.status(403)
    .setHeader('Retry-After', retryAfter)
    .json({
      error: 'Rate limit exceeded',
      message: `Too many requests. Retry after ${retryAfter} seconds`,
      retryAfter
    });
}
```

**Response Structure**:

```typescript
{
  error: 'Forbidden' | 'Access denied' | 'Rate limit exceeded';
  message: string;
  retryAfter?: number; // For rate limiting
}
```

### 404 Not Found

**Category**: Client Error

**Meaning**: Resource does not exist

**When to Use**:

- Requested resource ID doesn't exist
- Endpoint path doesn't exist
- Query returns no results (when expected to exist)

**Examples**:

```javascript
// Resource not found
const ticket = await db.get('tickets', ticketId);
if (!ticket) {
  return res.status(404).json({
    error: 'Not found',
    message: `Ticket ${ticketId} not found`,
    resource: 'ticket',
    id: ticketId
  });
}

// Endpoint not found (caught by framework)
// Handled automatically by Express/Vercel

// Related resource not found
const user = await db.get('users', ticket.userId);
if (!user) {
  return res.status(404).json({
    error: 'Not found',
    message: 'Associated user not found',
    resource: 'user'
  });
}
```

**Response Structure**:

```typescript
{
  error: 'Not found';
  message: string;
  resource?: string; // Type of resource not found
  id?: string | number; // ID that was not found
}
```

### 405 Method Not Allowed

**Category**: Client Error

**Meaning**: HTTP method not supported for endpoint

**When to Use**:

- Client uses wrong HTTP method
- Endpoint only supports specific methods

**Examples**:

```javascript
// Wrong method for endpoint
if (req.method !== 'POST') {
  res.setHeader('Allow', 'POST');
  return res.status(405).json({
    error: 'Method not allowed',
    message: `Method ${req.method} not allowed for this endpoint`,
    allowedMethods: ['POST']
  });
}

// Multiple allowed methods
const allowedMethods = ['GET', 'POST'];
if (!allowedMethods.includes(req.method)) {
  res.setHeader('Allow', allowedMethods.join(', '));
  return res.status(405).json({
    error: 'Method not allowed',
    message: `Method ${req.method} not supported`,
    allowedMethods
  });
}
```

**Required Headers**:

- `Allow`: Comma-separated list of allowed methods

**Response Structure**:

```typescript
{
  error: 'Method not allowed';
  message: string;
  allowedMethods: string[];
}
```

### 409 Conflict

**Category**: Client Error

**Meaning**: Request conflicts with current state

**When to Use**:

- Duplicate resource creation
- Concurrent modification conflict
- Resource state prevents operation
- Business rule violation

**Examples**:

```javascript
// Duplicate resource
const existing = await db.findOne('users', { email });
if (existing) {
  return res.status(409).json({
    error: 'Conflict',
    message: 'User with this email already exists',
    field: 'email',
    conflictType: 'duplicate'
  });
}

// Concurrent modification
if (req.headers['if-match'] !== currentETag) {
  return res.status(409).json({
    error: 'Conflict',
    message: 'Resource was modified by another request',
    conflictType: 'concurrent_modification',
    currentETag
  });
}

// Invalid state transition
if (ticket.status === 'used') {
  return res.status(409).json({
    error: 'Conflict',
    message: 'Cannot modify used ticket',
    conflictType: 'invalid_state',
    currentState: 'used'
  });
}
```

**Response Structure**:

```typescript
{
  error: 'Conflict';
  message: string;
  conflictType: 'duplicate' | 'concurrent_modification' | 'invalid_state';
  field?: string;
  currentState?: string;
  currentETag?: string;
}
```

### 422 Unprocessable Entity

**Category**: Client Error

**Meaning**: Syntactically correct but semantically invalid

**When to Use**:

- Business logic validation fails
- Cross-field validation fails
- Data relationships invalid
- Semantic errors

**Examples**:

```javascript
// Business logic validation
if (ticketCount > availableCount) {
  return res.status(422).json({
    error: 'Unprocessable entity',
    message: 'Not enough tickets available',
    requested: ticketCount,
    available: availableCount
  });
}

// Date validation
if (startDate > endDate) {
  return res.status(422).json({
    error: 'Validation error',
    message: 'Start date must be before end date',
    fields: ['startDate', 'endDate']
  });
}

// Related resource validation
const event = await db.get('events', eventId);
if (event.status === 'cancelled') {
  return res.status(422).json({
    error: 'Unprocessable entity',
    message: 'Cannot purchase tickets for cancelled event',
    eventStatus: 'cancelled'
  });
}
```

**Response Structure**:

```typescript
{
  error: 'Unprocessable entity' | 'Validation error';
  message: string;
  fields?: string[];
  [key: string]: any; // Additional context
}
```

**Difference from 400**:

- **400**: Syntax error (malformed JSON, wrong type)
- **422**: Semantic error (valid syntax, invalid logic)

### 429 Too Many Requests

**Category**: Client Error

**Meaning**: Rate limit exceeded

**When to Use**:

- Client exceeds rate limit
- Too many requests in time window
- API quota exceeded

**Examples**:

```javascript
// Rate limit exceeded
const rateLimit = checkRateLimit(clientId, operation);
if (!rateLimit.allowed) {
  const retryAfter = Math.ceil((rateLimit.resetTime - Date.now()) / 1000);

  return res.status(429)
    .setHeader('Retry-After', retryAfter)
    .setHeader('X-RateLimit-Limit', rateLimit.max)
    .setHeader('X-RateLimit-Remaining', 0)
    .setHeader('X-RateLimit-Reset', new Date(rateLimit.resetTime).toISOString())
    .json({
      error: 'Rate limit exceeded',
      message: `Too many ${operation} requests. Please wait ${retryAfter} seconds`,
      retryAfter,
      limit: rateLimit.max,
      resetTime: new Date(rateLimit.resetTime).toISOString()
    });
}
```

**Required Headers**:

- `Retry-After`: Seconds until limit resets
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Timestamp when limit resets

**Response Structure**:

```typescript
{
  error: 'Rate limit exceeded';
  message: string;
  retryAfter: number; // Seconds
  limit: number;
  resetTime: string; // ISO 8601 timestamp
}
```

### 500 Internal Server Error

**Category**: Server Error

**Meaning**: Unexpected server error

**When to Use**:

- Unhandled exception
- Database connection failure
- External service failure
- Unexpected error condition

**Examples**:

```javascript
// Catch-all error handler
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);

  // Don't expose internal error details in production
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : error.message;

  res.status(500).json({
    error: 'Internal server error',
    message,
    requestId: req.id // For tracking
  });
});

// Database error
try {
  await db.query('SELECT * FROM users');
} catch (error) {
  console.error('Database error:', error);
  return res.status(500).json({
    error: 'Internal server error',
    message: 'Database operation failed'
  });
}

// External service error
try {
  await stripe.createCharge(...);
} catch (error) {
  console.error('Stripe error:', error);
  return res.status(500).json({
    error: 'Internal server error',
    message: 'Payment processing failed'
  });
}
```

**Response Structure**:

```typescript
{
  error: 'Internal server error';
  message: string; // Generic in production, detailed in development
  requestId?: string; // For error tracking
}
```

**Security Note**: Never expose stack traces or internal details in production.

### 502 Bad Gateway

**Category**: Server Error

**Meaning**: Upstream server returned invalid response

**When to Use**:

- Proxy/gateway gets invalid response from upstream
- External API returns unexpected response
- Service integration failure

**Examples**:

```javascript
// External API error
try {
  const response = await fetch('https://external-api.com/data');

  if (!response.ok) {
    throw new Error(`Upstream returned ${response.status}`);
  }

  const data = await response.json();
} catch (error) {
  console.error('External API error:', error);
  return res.status(502).json({
    error: 'Bad gateway',
    message: 'External service returned invalid response',
    upstream: 'external-api.com'
  });
}
```

**Response Structure**:

```typescript
{
  error: 'Bad gateway';
  message: string;
  upstream?: string; // Which service failed
}
```

### 503 Service Unavailable

**Category**: Server Error

**Meaning**: Service temporarily unavailable

**When to Use**:

- Maintenance mode
- Database connection unavailable
- Service overloaded
- Temporary outage

**Examples**:

```javascript
// Maintenance mode
if (process.env.MAINTENANCE_MODE === 'true') {
  return res.status(503)
    .setHeader('Retry-After', 3600) // 1 hour
    .json({
      error: 'Service unavailable',
      message: 'System is under maintenance',
      retryAfter: 3600,
      estimatedRestoreTime: '2025-09-30T15:00:00Z'
    });
}

// Database unavailable
try {
  await db.connect();
} catch (error) {
  return res.status(503)
    .setHeader('Retry-After', 60)
    .json({
      error: 'Service unavailable',
      message: 'Database temporarily unavailable',
      retryAfter: 60
    });
}
```

**Recommended Headers**:

- `Retry-After`: Seconds until service available

**Response Structure**:

```typescript
{
  error: 'Service unavailable';
  message: string;
  retryAfter?: number; // Seconds
  estimatedRestoreTime?: string; // ISO 8601 timestamp
}
```

## Status Code Decision Tree

```text
Request received
  │
  ├─ Is syntax valid? ───NO──► 400 Bad Request
  │      │
  │     YES
  │      │
  ├─ Is authenticated? ───NO──► 401 Unauthorized
  │      │
  │     YES
  │      │
  ├─ Is authorized? ───NO──► 403 Forbidden
  │      │
  │     YES
  │      │
  ├─ Does resource exist? ───NO──► 404 Not Found
  │      │
  │     YES
  │      │
  ├─ Is method allowed? ───NO──► 405 Method Not Allowed
  │      │
  │     YES
  │      │
  ├─ Is semantically valid? ───NO──► 422 Unprocessable Entity
  │      │
  │     YES
  │      │
  ├─ Would it conflict? ───YES──► 409 Conflict
  │      │
  │      NO
  │      │
  ├─ Is rate limited? ───YES──► 429 Too Many Requests
  │      │
  │      NO
  │      │
  ├─ Process request
  │      │
  │      ├─ Success? ───YES──► 200 OK / 201 Created / 204 No Content
  │      │
  │      NO
  │      │
  └──────► 500 Internal Server Error / 502 Bad Gateway / 503 Service Unavailable
```

## Common Patterns

### Resource Creation (POST)

```javascript
router.post('/api/tickets', async (req, res) => {
  // 400: Validation error
  if (!req.body.ticketType) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Ticket type is required'
    });
  }

  // 422: Business logic error
  if (availableCount < 1) {
    return res.status(422).json({
      error: 'Unprocessable entity',
      message: 'No tickets available'
    });
  }

  // 409: Duplicate
  const existing = await db.findTicket(req.body.code);
  if (existing) {
    return res.status(409).json({
      error: 'Conflict',
      message: 'Ticket code already exists'
    });
  }

  // 201: Success
  const ticket = await db.createTicket(req.body);
  res.status(201)
    .setHeader('Location', `/api/tickets/${ticket.id}`)
    .json({ ticket });
});
```

### Resource Retrieval (GET)

```javascript
router.get('/api/tickets/:id', async (req, res) => {
  // 404: Not found
  const ticket = await db.getTicket(req.params.id);
  if (!ticket) {
    return res.status(404).json({
      error: 'Not found',
      message: 'Ticket not found'
    });
  }

  // 403: Access denied
  if (ticket.userId !== req.user.id && !req.user.isAdmin) {
    return res.status(403).json({
      error: 'Access denied',
      message: 'You cannot access this ticket'
    });
  }

  // 200: Success
  res.status(200).json({ ticket });
});
```

### Resource Update (PUT/PATCH)

```javascript
router.patch('/api/tickets/:id', async (req, res) => {
  // 404: Not found
  const ticket = await db.getTicket(req.params.id);
  if (!ticket) {
    return res.status(404).json({
      error: 'Not found',
      message: 'Ticket not found'
    });
  }

  // 409: Invalid state
  if (ticket.status === 'used') {
    return res.status(409).json({
      error: 'Conflict',
      message: 'Cannot update used ticket'
    });
  }

  // 200: Success
  await db.updateTicket(req.params.id, req.body);
  res.status(200).json({
    message: 'Ticket updated successfully'
  });
});
```

### Resource Deletion (DELETE)

```javascript
router.delete('/api/tickets/:id', async (req, res) => {
  // 404: Not found
  const ticket = await db.getTicket(req.params.id);
  if (!ticket) {
    return res.status(404).json({
      error: 'Not found',
      message: 'Ticket not found'
    });
  }

  // 403: Cannot delete
  if (ticket.status === 'used') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Cannot delete used ticket'
    });
  }

  // 204: Success (no content)
  await db.deleteTicket(req.params.id);
  res.status(204).end();
});
```

## Testing Status Codes

```javascript
import { describe, it, expect } from 'vitest';

describe('API Status Codes', () => {
  it('returns 200 for successful GET', async () => {
    const res = await fetch('/api/tickets');
    expect(res.status).toBe(200);
  });

  it('returns 201 for successful POST', async () => {
    const res = await fetch('/api/tickets', {
      method: 'POST',
      body: JSON.stringify({ ticketType: 'early-bird' })
    });
    expect(res.status).toBe(201);
    expect(res.headers.get('Location')).toContain('/api/tickets/');
  });

  it('returns 400 for missing required field', async () => {
    const res = await fetch('/api/tickets', {
      method: 'POST',
      body: JSON.stringify({}) // Missing ticketType
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Validation error');
  });

  it('returns 404 for non-existent resource', async () => {
    const res = await fetch('/api/tickets/999999');
    expect(res.status).toBe(404);
  });

  it('returns 429 when rate limited', async () => {
    // Make many requests
    for (let i = 0; i < 100; i++) {
      await fetch('/api/tickets');
    }

    const res = await fetch('/api/tickets');
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeDefined();
  });
});
```

## Related Documentation

- [API Documentation](./api/README.md)
- [Error Handling](./ERROR_HANDLING.md)
- [Testing Guide](./TESTING.md)
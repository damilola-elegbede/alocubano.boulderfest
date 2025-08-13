# Security Headers Migration Guide

This guide shows how to migrate existing API endpoints to use the new comprehensive security headers system.

## Quick Start

### 1. Basic API Endpoint Protection

**Before:**

```javascript
export default async function handler(req, res) {
  // Your API logic
  res.json({ data: "example" });
}
```

**After:**

```javascript
import { createSecurityMiddleware } from "../../middleware/security.js";

async function handler(req, res) {
  // Your API logic
  res.json({ data: "example" });
}

export default createSecurityMiddleware("api")(handler);
```

### 2. Admin Endpoint Protection

**Before:**

```javascript
export default async function adminHandler(req, res) {
  // Admin logic
  res.json({ admin: true });
}
```

**After:**

```javascript
import { createSecurityMiddleware } from "../../middleware/security.js";

async function adminHandler(req, res) {
  // Admin logic
  res.json({ admin: true });
}

export default createSecurityMiddleware("admin", {
  requireCSRF: true,
})(adminHandler);
```

### 3. Authentication Endpoint Protection

**Before:**

```javascript
export default async function loginHandler(req, res) {
  // Auth logic
  res.json({ token: "jwt-token" });
}
```

**After:**

```javascript
import { createSecurityMiddleware } from "../../middleware/security.js";

async function loginHandler(req, res) {
  // Auth logic
  res.json({ token: "jwt-token" });
}

export default createSecurityMiddleware("auth")(loginHandler);
```

## Advanced Configuration

### API with Custom CORS and Caching

```javascript
import { createSecurityMiddleware } from "../../middleware/security.js";

async function apiHandler(req, res) {
  const data = await fetchData();
  res.json(data);
}

export default createSecurityMiddleware("api", {
  maxAge: 300, // Cache for 5 minutes
  corsOrigins: [
    "https://alocubanoboulderfest.vercel.app",
    "https://admin.alocubanoboulderfest.vercel.app",
  ],
  requireAuth: false,
})(apiHandler);
```

### Payment Endpoint with Stripe Support

```javascript
import { createSecurityMiddleware } from "../../middleware/security.js";

async function paymentHandler(req, res) {
  // Stripe payment logic
  res.json({ session_url: "stripe-checkout-url" });
}

export default createSecurityMiddleware("api", {
  maxAge: 0, // No caching for payments
  corsOrigins: ["https://alocubanoboulderfest.vercel.app"],
  requireAuth: true,
})(paymentHandler);
```

## Migration Checklist

### Step 1: Update Imports

```javascript
// Add this import to all API files
import { createSecurityMiddleware } from "../middleware/security.js";
```

### Step 2: Wrap Handlers

- [ ] Wrap `export default` with `createSecurityMiddleware`
- [ ] Choose appropriate middleware type (`api`, `admin`, `auth`)
- [ ] Configure options (CORS, caching, CSRF)

### Step 3: Update Dependencies

```bash
npm install helmet@^8.0.0
```

### Step 4: Test Security Headers

```bash
# Test individual endpoint
curl -I https://yourdomain.com/api/your-endpoint

# Run security test suite
npm run test:unit -- security-headers-comprehensive.test.js
```

## Endpoint-Specific Guidelines

### Public API Endpoints

```javascript
export default createSecurityMiddleware("api", {
  maxAge: 300,
  corsOrigins: ["https://yourdomain.com"],
})(handler);
```

### Private API Endpoints

```javascript
export default createSecurityMiddleware("api", {
  maxAge: 0,
  requireAuth: true,
})(handler);
```

### Admin Endpoints

```javascript
export default createSecurityMiddleware("admin", {
  requireCSRF: true,
})(handler);
```

### Authentication Endpoints

```javascript
export default createSecurityMiddleware("auth")(handler);
```

### Health Check Endpoints

```javascript
export default createSecurityMiddleware("api", {
  maxAge: 60, // Short cache
  corsOrigins: [], // No CORS needed
})(handler);
```

## Error Handling

The security middleware automatically handles:

- Rate limiting errors (429)
- CSRF token errors (403)
- CORS violations (403)
- Security header failures (500)

Custom error handling:

```javascript
async function handler(req, res) {
  try {
    // Your logic
  } catch (error) {
    // Error is automatically handled by security middleware
    throw error;
  }
}
```

## Environment-Specific Behavior

### Development

- Relaxed CSP for dev tools
- No HSTS enforcement
- Verbose security logging
- Localhost CORS support

### Production

- Strict CSP with reporting
- HSTS with 2-year max-age
- Minimal error information
- Trusted domain validation

## Troubleshooting

### CORS Issues

```javascript
// Add your domain to corsOrigins
export default createSecurityMiddleware("api", {
  corsOrigins: ["https://yourdomain.com", "https://www.yourdomain.com"],
})(handler);
```

### CSP Violations

Check browser console for CSP violation reports and update trusted domains in `/api/lib/security-headers.js`.

### Rate Limiting

Adjust limits in middleware configuration:

```javascript
export default createSecurityMiddleware("api", {
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    max: 200, // Increase limit
  },
})(handler);
```

## Testing Security

### Manual Testing

```bash
# Test security headers
curl -I https://yourdomain.com/api/endpoint

# Check CSP
curl -H "Content-Type: application/csp-report" \
     -d '{"csp-report":{"document-uri":"test"}}' \
     https://yourdomain.com/api/security/csp-report
```

### Automated Testing

```javascript
// test/security.test.js
import { createSecurityMiddleware } from "../middleware/security.js";

describe("API Security", () => {
  it("should apply security headers", async () => {
    const handler = createSecurityMiddleware("api")(mockHandler);
    await handler(req, res);

    expect(res.setHeader).toHaveBeenCalledWith("X-Frame-Options", "DENY");
  });
});
```

## Performance Impact

The security middleware adds minimal overhead:

- Header generation: ~1-2ms
- Rate limiting: ~3-5ms (with Redis)
- CSP processing: ~0.5ms

Monitor performance with:

```bash
curl -w "%{time_total}" https://yourdomain.com/api/endpoint
```

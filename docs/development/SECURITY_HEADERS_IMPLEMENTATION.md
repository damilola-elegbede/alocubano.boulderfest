# Security Headers Implementation

This document describes the comprehensive security headers and HTTPS enforcement system implemented as part of SPEC_04 Task 4.4.

## Overview

The security system provides A+ rated security through:
- Comprehensive HTTP security headers using Helmet.js
- Strict Content Security Policy (CSP) with violation reporting
- HTTP Strict Transport Security (HSTS) with 2-year max-age
- Advanced rate limiting and CSRF protection
- API-specific security controls and caching

## Components

### 1. Core Security Headers (`api/lib/security-headers.js`)

#### Features
- **Helmet.js Integration**: Industry-standard security headers
- **Environment-Aware**: Different configurations for development/production
- **CSP Configuration**: Strict policy allowing only trusted domains
- **HSTS**: 2-year max-age with preload and subdomains
- **Permissions Policy**: Restricts dangerous browser features

#### Key Functions
```javascript
// Apply comprehensive security headers
await addSecurityHeaders(res, { isAPI: true, maxAge: 300 });

// Add API-specific headers with caching control
addAPISecurityHeaders(res, {
  maxAge: 300,
  corsOrigins: ['https://alocubanoboulderfest.vercel.app'],
  apiVersion: 'v1'
});

// CSRF protection
addCSRFHeaders(res, csrfToken);
```

### 2. Security Middleware Composition (`middleware/security.js`)

#### Middleware Types
- **API Security**: General API endpoint protection
- **Admin Security**: Enhanced protection with CSRF
- **Auth Security**: Ultra-strict protection for authentication

#### Usage Examples
```javascript
import { createSecurityMiddleware } from '../middleware/security.js';

// API endpoint protection
export default createSecurityMiddleware('api', {
  maxAge: 300,
  corsOrigins: ['https://example.com']
})(handler);

// Admin endpoint protection
export default createSecurityMiddleware('admin', {
  requireCSRF: true
})(handler);

// Authentication endpoint protection
export default createSecurityMiddleware('auth')(handler);
```

### 3. CSP Violation Reporting (`api/security/csp-report.js`)

#### Features
- Validates and sanitizes CSP reports
- Filters false positives (browser extensions, dev tools)
- Classifies violations by severity
- Comprehensive logging and monitoring

#### Endpoint
```
POST /api/security/csp-report
GET /api/security/csp-report (stats)
```

## Security Headers Applied

### Core Security Headers
```http
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
X-DNS-Prefetch-Control: off
```

### Content Security Policy
```http
Content-Security-Policy: 
  default-src 'self'; 
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://checkout.stripe.com; 
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; 
  img-src 'self' data: blob: https:; 
  font-src 'self' data: https://fonts.gstatic.com; 
  connect-src 'self' https://api.stripe.com https://api.brevo.com; 
  frame-src 'self' https://js.stripe.com; 
  frame-ancestors 'none'; 
  base-uri 'self'; 
  object-src 'none'; 
  report-uri /api/security/csp-report
```

### HTTP Strict Transport Security (Production Only)
```http
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

### Permissions Policy
```http
Permissions-Policy: 
  camera=(), 
  microphone=(), 
  geolocation=(), 
  payment=(self), 
  usb=(), 
  fullscreen=(self), 
  web-share=(self)
```

### API-Specific Headers
```http
X-API-Version: v1
Cache-Control: public, max-age=300, s-maxage=300, stale-while-revalidate=60
X-RateLimit-Limit: 100
X-RateLimit-Window: 900
Access-Control-Allow-Origin: https://alocubanoboulderfest.vercel.app
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-API-Key
```

## Trusted Domains

### Stripe Integration
- `https://js.stripe.com` - Stripe.js library
- `https://checkout.stripe.com` - Checkout sessions
- `https://api.stripe.com` - API calls
- `https://q.stripe.com` - Analytics/telemetry
- `https://m.stripe.network` - Mobile SDK

### Brevo Email Service
- `https://sibforms.com` - Form submissions
- `https://sibautomation.com` - Automation
- `https://api.brevo.com` - API calls

### CDN and Fonts
- `https://fonts.googleapis.com` - Google Fonts CSS
- `https://fonts.gstatic.com` - Google Fonts files
- `https://cdnjs.cloudflare.com` - Public CDN

### Analytics
- `https://www.google-analytics.com` - GA tracking
- `https://analytics.google.com` - GA4 tracking

## Rate Limiting Configuration

### API Endpoints
- **Window**: 15 minutes
- **Limit**: 100 requests
- **Headers**: Standard rate limit headers

### Admin Endpoints
- **Window**: 15 minutes
- **Limit**: 20 requests
- **Additional**: CSRF protection required

### Authentication Endpoints
- **Window**: 15 minutes
- **Limit**: 5 requests
- **Additional**: Progressive penalties, clear site data

## HTTPS Enforcement

### Production Behavior
- Automatic HTTP → HTTPS redirects (301)
- HSTS header with 2-year max-age
- Preload directive for browser inclusion

### Development Behavior
- No HTTPS enforcement
- Relaxed CSP for dev tools
- Local development support

## Testing

### Security Headers Test
```bash
# Run security headers test suite
npm run test:unit -- security-headers-comprehensive.test.js

# Test live security headers
curl -I https://alocubanoboulderfest.vercel.app/api/security/test-headers
```

### CSP Violation Testing
```javascript
// Trigger CSP violation for testing
document.createElement('script').innerHTML = 'alert("XSS")';
```

## Monitoring

### CSP Violations
- Real-time logging of violations
- Severity classification (high/medium/low)
- False positive filtering
- Automatic alerting for high-severity violations

### Security Metrics
- Rate limiting violations
- Authentication failures
- CSRF token mismatches
- Suspicious request patterns

## Configuration

### Environment Variables
```bash
# CSP reporting endpoint
CSP_REPORT_URI=/api/security/csp-report

# Rate limiting configuration
RATE_LIMIT_REDIS_URL=redis://localhost:6379

# Admin configuration
ADMIN_SECRET=your-secret-key
```

### Security Levels
- **Development**: Relaxed CSP, no HSTS, verbose logging
- **Staging**: Full security headers, CSP reporting
- **Production**: Maximum security, preload HSTS, strict CSP

## Best Practices

### API Endpoint Protection
```javascript
import { createSecurityMiddleware } from '../middleware/security.js';

export default createSecurityMiddleware('api', {
  maxAge: 300, // Cache for 5 minutes
  corsOrigins: ['https://yourdomain.com'],
  requireAuth: false
})(async (req, res) => {
  // Your API logic here
});
```

### Admin Endpoint Protection
```javascript
import { createSecurityMiddleware } from '../middleware/security.js';

export default createSecurityMiddleware('admin', {
  requireCSRF: true // CSRF protection required
})(async (req, res) => {
  // Your admin logic here
});
```

### Authentication Endpoint Protection
```javascript
import { createSecurityMiddleware } from '../middleware/security.js';

export default createSecurityMiddleware('auth')(async (req, res) => {
  // Ultra-strict security for auth
});
```

## Security Audit Results

Target: **A+ Rating** from security testing tools

### Implemented Controls
✅ Content Security Policy (CSP)  
✅ HTTP Strict Transport Security (HSTS)  
✅ X-Content-Type-Options  
✅ X-Frame-Options  
✅ X-XSS-Protection  
✅ Referrer Policy  
✅ Permissions Policy  
✅ CORS Configuration  
✅ Rate Limiting  
✅ CSRF Protection  
✅ Secure Defaults  

### Security Headers Checklist
- [x] CSP with strict policy and reporting
- [x] HSTS with 2-year max-age and preload
- [x] MIME type sniffing protection
- [x] Clickjacking protection
- [x] XSS protection (legacy browser support)
- [x] Referrer policy for privacy
- [x] Feature policy restrictions
- [x] Server information hiding
- [x] CORS configuration
- [x] Cache control for sensitive endpoints

## Troubleshooting

### Common CSP Violations
1. **Inline scripts**: Use nonces or move to external files
2. **eval() usage**: Avoid or add 'unsafe-eval' to CSP
3. **Third-party domains**: Add to TRUSTED_DOMAINS

### Rate Limiting Issues
1. **False positives**: Whitelist legitimate IPs
2. **High traffic**: Increase limits for specific endpoints
3. **Development testing**: Use skipInDevelopment option

### CORS Issues
1. **Missing origins**: Add to corsOrigins array
2. **Preflight failures**: Ensure OPTIONS handling
3. **Credentials**: Set allowCredentials: true if needed

## Maintenance

### Regular Tasks
- Monitor CSP violation reports
- Update trusted domains as needed
- Review rate limiting analytics
- Update security dependencies
- Audit security configuration

### Security Updates
- Keep Helmet.js updated
- Monitor security advisories
- Review and update CSP policies
- Test security headers after deployments
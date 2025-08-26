# Security Policy

A Lo Cubano Boulder Fest takes security seriously. This document outlines our security practices, vulnerability reporting process, and security considerations for developers.

## Supported Versions

We provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | ✅ Currently supported |
| < 1.0   | ❌ No longer supported |

## Security Architecture

### Authentication & Authorization

#### Admin Panel Security
- **bcrypt password hashing** with salt rounds ≥ 10
- **JWT session management** with secure secret keys (≥ 32 characters)
- **Rate limiting** on login attempts (5 attempts, 30-minute lockout)
- **Session expiration** (1-hour default, configurable)
- **Automatic cleanup** of expired sessions

#### API Security
- **Input validation** on all endpoints
- **SQL injection protection** via parameterized queries
- **XSS prevention** through input sanitization
- **CSRF protection** for state-changing operations
- **Rate limiting** per IP and endpoint

### Data Protection

#### Database Security
- **SQLite WAL mode** for better concurrency
- **Transactional migrations** with rollback capability
- **Connection pooling** with timeout limits
- **Encrypted credentials** for production (Turso)

#### Personal Data Handling
- **Minimal data collection** - only necessary information
- **Email encryption** for sensitive communications
- **Secure token generation** for unsubscribe links
- **Data retention policies** - automatic cleanup after events

### Payment Security

#### Stripe Integration
- **PCI DSS compliance** through Stripe Checkout
- **No card data storage** on our servers
- **Webhook signature verification** for all payment events
- **Secure API key management** with environment variables
- **Fraud protection** via Stripe's built-in security

#### Financial Data
- **No financial data persistence** beyond order metadata
- **Encrypted payment tokens** for refund processing
- **Audit logging** of all payment operations
- **Secure refund processing** through Stripe API

### Infrastructure Security

#### Vercel Platform Security
- **Edge network deployment** with DDoS protection
- **Automatic HTTPS** with certificate management
- **Environment variable encryption** at rest
- **Function isolation** preventing code access between functions
- **Geographic distribution** for resilience

#### API Security Headers
```javascript
// Security headers implemented
'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
'X-Content-Type-Options': 'nosniff',
'X-Frame-Options': 'DENY',
'Referrer-Policy': 'strict-origin-when-cross-origin',
'Content-Security-Policy': [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://m.stripe.network",
  "connect-src 'self' https://api.stripe.com https://m.stripe.network",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'"
].join('; '),
'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), browsing-topics=()'
```

## Vulnerability Reporting

### Responsible Disclosure

If you discover a security vulnerability, please report it responsibly:

#### Contact Information
- **Email**: security@alocubanoboulderfest.com
- **Alternative**: alocubanoboulderfest@gmail.com (mark as SECURITY)
- **Response Time**: We aim to respond within 24 hours

#### What to Include
Please provide the following information:
- **Description** of the vulnerability
- **Steps to reproduce** the issue
- **Potential impact** assessment
- **Suggested fix** (if available)
- **Your contact information** for follow-up

#### What NOT to Do
- **Do not** publish the vulnerability publicly before we've addressed it
- **Do not** access or modify data that doesn't belong to you
- **Do not** perform attacks that could harm our users or services
- **Do not** engage in social engineering attacks

### Response Process

1. **Acknowledgment** - We confirm receipt within 24 hours
2. **Assessment** - We evaluate the vulnerability within 72 hours  
3. **Fix Development** - We develop and test a fix
4. **Deployment** - We deploy the fix to production
5. **Disclosure** - We coordinate public disclosure with the reporter

### Bounty Program

Currently, we operate a **recognition-based program**:
- **Hall of Fame** listing for responsible disclosures
- **Acknowledgment** in security advisories
- **Direct communication** with our security team
- **Priority support** for future reports

*Note: We're a small non-profit organization and cannot offer monetary rewards at this time.*

## Security Best Practices for Developers

### Code Security

#### Input Validation
```javascript
// Always validate and sanitize inputs
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || typeof email !== 'string' || !emailRegex.test(email)) {
    throw new Error('Invalid email format');
  }
  return email.toLowerCase().trim();
}

// Prevent SQL injection
const query = 'SELECT * FROM users WHERE email = ?';
const result = await db.execute(query, [sanitizedEmail]);
```

#### Authentication
```javascript
// Secure password hashing
const bcrypt = require('bcryptjs');
const hashedPassword = await bcrypt.hash(password, 12);

// Secure session management
const jwt = require('jsonwebtoken');
const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
  expiresIn: '1h',
  issuer: 'alocubano-boulderfest'
});
```

#### API Security
```javascript
// Rate limiting implementation
const rateLimit = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
};

// Input sanitization
function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/[<>'"&]/g, (match) => ({
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '&': '&amp;'
    }[match]));
}
```

### Environment Security

#### Environment Variables
```bash
# Use strong secrets (minimum 32 characters)
ADMIN_SECRET=your-very-secure-secret-key-with-32-plus-characters
JWT_SECRET=another-very-secure-jwt-signing-secret-key
WEBHOOK_SECRET=secure-webhook-validation-secret

# Never commit real values to version control
# Use .env.local for development
# Use platform environment variables for production
```

#### Database Security
```javascript
// Use parameterized queries
const insertUser = db.prepare('INSERT INTO users (email, name) VALUES (?, ?)');
insertUser.run(email, name);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Set reasonable timeouts
db.pragma('busy_timeout = 5000');
```

### Testing Security

#### Security Test Cases
```javascript
// Test SQL injection prevention
test('API prevents SQL injection attacks', async () => {
  const maliciousInput = "'; DROP TABLE users; --";
  const response = await testRequest('POST', '/api/subscribe', {
    email: maliciousInput
  });
  
  expect(response.status).toBe(400);
  expect(response.data.error).not.toMatch(/sql|syntax|query/i);
});

// Test XSS prevention
test('API sanitizes XSS attempts', async () => {
  const xssPayload = '<script>alert("xss")</script>';
  const response = await testRequest('POST', '/api/register', {
    name: xssPayload
  });
  
  expect(response.status).toBe(400);
});
```

## Incident Response

### Security Incident Classifications

#### Critical (P0)
- Data breach affecting user information
- Payment system compromise
- Unauthorized admin access
- Service-wide outage due to attack

#### High (P1)
- Authentication bypass
- Privilege escalation
- Significant data exposure
- Successful injection attacks

#### Medium (P2)
- Limited data exposure
- Rate limiting bypass
- Non-critical XSS vulnerabilities
- Insecure direct object references

#### Low (P3)
- Information disclosure
- Missing security headers
- Weak encryption algorithms
- Social engineering attempts

### Response Timeline

| Priority | Initial Response | Status Update | Resolution Target |
|----------|-----------------|---------------|-------------------|
| P0       | 1 hour          | 4 hours       | 24 hours         |
| P1       | 4 hours         | 12 hours      | 72 hours         |
| P2       | 24 hours        | 48 hours      | 1 week           |
| P3       | 72 hours        | 1 week        | Next release     |

### Communication Plan

#### Internal Communication
1. **Security team** notified immediately
2. **Development team** engaged for technical response
3. **Leadership** informed for critical incidents
4. **Legal counsel** consulted for data breaches

#### External Communication
1. **Users affected** - direct notification via email
2. **General users** - website banner or status page
3. **Regulators** - as required by applicable laws
4. **Security community** - coordinated disclosure

## Compliance

### Data Privacy
- **CCPA compliance** for California residents
- **GDPR considerations** for European visitors
- **Data minimization** - collect only necessary information
- **Right to deletion** - users can request data removal

### Payment Processing
- **PCI DSS compliance** through Stripe
- **SOC 2 compliance** through Vercel infrastructure
- **Payment card industry standards** adherence

### Accessibility
- **WCAG 2.1 Level AA** compliance
- **Section 508** considerations for government accessibility
- **Screen reader compatibility** for all interactive elements

## Security Monitoring

### Automated Monitoring
- **Error rate monitoring** via Sentry
- **Performance monitoring** for attack detection  
- **Rate limiting** alerts for abuse detection
- **Failed authentication** alerts

### Manual Reviews
- **Quarterly security reviews** of all endpoints
- **Annual penetration testing** (planned)
- **Code review** for all security-related changes
- **Dependency vulnerability scanning** via npm audit

### Metrics Tracked
- **Authentication failure rates**
- **API error rates by endpoint**
- **Response time anomalies**
- **Rate limiting triggers**
- **Payment failure rates**

## Contact

For security-related questions or to report vulnerabilities:

- **Security Email**: security@alocubanoboulderfest.com
- **General Contact**: alocubanoboulderfest@gmail.com
- **Response Time**: 24 hours for security issues
- **Emergency**: Use email with "URGENT SECURITY" in subject

## Updates

This security policy is reviewed and updated regularly. Last updated: **2025-08-26**

Changes to this policy will be:
1. **Posted** in the CHANGELOG.md
2. **Announced** via email to registered developers
3. **Published** on our website security page
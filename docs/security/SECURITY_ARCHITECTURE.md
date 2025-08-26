# Security Architecture

## Overview

The A Lo Cubano Boulder Fest application implements comprehensive security measures across authentication, authorization, data validation, and infrastructure layers.

## Authentication & Authorization

### JWT Authentication
- **Implementation**: `api/lib/auth.js`
- **Algorithm**: HS256 with configurable secret
- **Token Expiry**: Configurable (default: 1 hour for admin sessions)
- **Usage**: Admin panel access, wallet pass authentication

```javascript
// Example JWT verification
const { requireAuth } = require('../lib/auth');

export default async function handler(req, res) {
  const user = await requireAuth(req, res);
  // Protected logic here
}
```

### Password Security
- **Hashing**: bcrypt with salt rounds of 10+
- **Storage**: Environment variables only (never in code)
- **Generation**: Use `npm run generate-admin-password`

```bash
# Generate secure admin password
node -e "console.log(require('bcryptjs').hashSync('your_password', 12))"
```

## Security Headers

### Comprehensive Header Implementation
All API responses include security headers via middleware:

```javascript
// Security headers applied to all responses
{
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY', 
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': 'default-src \'self\'; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\';',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
}
```

### CORS Configuration
- **Default Policy**: Same-origin only
- **API Endpoints**: Configured per endpoint basis
- **Credentials**: Restricted to authenticated endpoints

## Input Validation & Sanitization

### Validation Architecture
- **Central Validation**: `api/lib/validation.js`
- **Input Sanitization**: XSS prevention and SQL injection protection
- **Error Handling**: Secure error responses without information leakage

```javascript
// Example validation usage
const { validateEmail, validateName } = require('../lib/validation');

if (!validateEmail(email)) {
  return res.status(400).json({ error: 'Please provide a valid email address' });
}
```

### Validation Rules
- **Email**: RFC 5322 compliant regex
- **Names**: 2-50 characters, letters, spaces, hyphens, apostrophes only
- **QR Codes**: Alphanumeric, length limits, format validation
- **Ticket IDs**: Predefined format with checksum validation

## Rate Limiting

### Implementation Strategy
- **Window**: 15 minutes (900,000ms)  
- **Limits**: Vary by endpoint sensitivity
  - General API: 100 requests/window
  - Authentication: 5 attempts/window
  - Payment processing: 10 requests/window

### Rate Limit Headers
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Payment Security

### Stripe Integration
- **PCI Compliance**: Stripe handles all card data
- **Webhook Verification**: Cryptographic signature validation
- **Secret Management**: Environment variables only

```javascript
// Webhook signature verification
const sig = req.headers['stripe-signature'];
const event = stripe.webhooks.constructEvent(payload, sig, endpointSecret);
```

### Transaction Security
- **Idempotency**: Duplicate payment prevention
- **Amount Validation**: Server-side price verification
- **Currency Enforcement**: USD only, validated server-side

## Data Protection

### Database Security
- **SQLite/Turso**: Parameterized queries only (no raw SQL)
- **Connection Strings**: Environment variables with encryption
- **Backup Encryption**: Automatic encryption at rest

### Sensitive Data Handling
- **PII Encryption**: Email addresses and names
- **Token Security**: JWT signing with strong secrets (32+ chars)
- **Log Sanitization**: No sensitive data in logs

## API Security

### Endpoint Protection
```javascript
// Security middleware stack
app.use(securityHeaders);
app.use(rateLimiter);
app.use(inputValidator);
app.use(authHandler);
```

### Error Handling
- **Information Disclosure Prevention**: Generic error messages
- **Logging**: Detailed logs server-side, minimal client-side
- **Status Codes**: Proper HTTP status codes for security events

```javascript
// Secure error responses
res.status(401).json({ error: 'Unauthorized - Authentication required' });
// Never: res.status(401).json({ error: 'Invalid JWT token: expired at 2023-...' });
```

## Wallet Pass Security

### Apple Wallet
- **Certificate-based Signing**: P12 certificate with private key
- **Pass Type ID**: Unique identifier per organization
- **Signature Validation**: Cryptographic verification

### Google Wallet
- **Service Account Authentication**: JSON-based credentials
- **OAuth 2.0**: Server-to-server authentication
- **Class/Object Security**: Structured data validation

## Infrastructure Security

### Vercel Platform
- **Environment Variables**: Encrypted at rest and in transit
- **Function Isolation**: Serverless function sandboxing
- **HTTPS Only**: Automatic SSL/TLS encryption

### External Service Security
- **API Keys**: Environment variables only
- **Webhook Secrets**: Cryptographic validation
- **Service Isolation**: Separate credentials per service

## Security Monitoring

### Error Tracking
- **Sentry Integration**: Real-time error monitoring
- **Security Events**: Failed authentication attempts
- **Rate Limit Violations**: Automated alerting

### Audit Logging
```javascript
// Security event logging
console.log(`[SECURITY] Failed login attempt: ${ip} - ${userAgent}`);
console.log(`[SECURITY] Rate limit exceeded: ${ip} - ${endpoint}`);
```

## Security Testing

### Automated Testing
- **SQL Injection**: Automated payload testing
- **XSS Prevention**: Script injection testing
- **Authentication**: JWT manipulation testing
- **Rate Limiting**: Automated threshold testing

### Manual Security Review
- **Code Review**: Security-focused peer review
- **Penetration Testing**: Regular security assessments
- **Dependency Scanning**: Automated vulnerability detection

## Incident Response

### Security Event Types
1. **Authentication Failures**: Lock account after 5 attempts
2. **Rate Limit Violations**: Temporary IP-based blocking
3. **Payment Fraud**: Immediate transaction suspension
4. **Data Breach**: Immediate notification and containment

### Response Procedures
1. **Detection**: Automated monitoring alerts
2. **Containment**: Immediate threat isolation
3. **Assessment**: Impact and scope analysis
4. **Recovery**: System restoration and hardening
5. **Lessons Learned**: Process improvement

## Compliance & Standards

### Security Standards
- **OWASP Top 10**: Full compliance implementation
- **PCI DSS**: Stripe-mediated compliance
- **Data Privacy**: GDPR/CCPA considerations

### Regular Security Maintenance
- **Dependency Updates**: Monthly security patches
- **Certificate Rotation**: Annual certificate renewal
- **Secret Rotation**: Quarterly API key rotation
- **Security Audits**: Annual third-party assessments

## Quick Reference

### Environment Variables (Security-Related)
```bash
# Authentication
ADMIN_PASSWORD=bcrypt_hash
ADMIN_SECRET=jwt_signing_secret_32_chars_min

# Payment Security  
STRIPE_SECRET_KEY=sk_live_or_test
STRIPE_WEBHOOK_SECRET=whsec_signature_verification

# Wallet Security
WALLET_AUTH_SECRET=jwt_signing_secret_32_chars_min
APPLE_PASS_KEY=base64_encoded_private_key

# General Security
QR_SECRET_KEY=qr_signing_secret_32_chars_min
REGISTRATION_JWT_SECRET=registration_jwt_secret_32_chars_min
```

### Security Checklist
- [ ] All secrets in environment variables (never in code)
- [ ] JWT secrets minimum 32 characters
- [ ] bcrypt hash strength 10+ rounds
- [ ] Input validation on all user inputs
- [ ] Rate limiting on all public endpoints
- [ ] Security headers on all responses
- [ ] HTTPS enforcement (Vercel automatic)
- [ ] Webhook signature verification
- [ ] Error messages don't leak information
- [ ] Database queries use parameterization
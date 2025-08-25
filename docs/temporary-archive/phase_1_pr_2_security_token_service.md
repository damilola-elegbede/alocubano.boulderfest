# Phase 1 PR 2: Security Token Service Implementation

## Overview
- **PRD Reference**: [prd.md](./prd.md) Section: Security Requirements
- **Requirements**: REQ-SEC-001, REQ-SEC-002, REQ-SEC-005
- **Dependencies**: Phase 1 PR 1 (database migrations)
- **Duration**: 2 days

## Tasks

### Task_1_2_01: Implement JWT Token Service with Server-Side Tracking
- **Assignee**: security-auditor
- **Execution**: Independent
- **Duration**: 4-5 hours
- **PRD Requirements**: REQ-SEC-001
- **Technical Details**:
  - Create `/api/lib/registration-token-service.js`
  - Implement JWT generation with server-side validation
  - Use crypto.randomUUID() for token IDs
  - Store token state in database for revocation capability
  - Implement single-use token enforcement
  - Add token expiration logic (72 hours)
- **Acceptance Criteria**:
  - Tokens cannot be reused after consumption
  - Tokens can be revoked before expiration
  - Token validation completes in <100ms
  - Cryptographically secure token generation
- **Testing**:
  - Test token generation uniqueness
  - Verify single-use enforcement
  - Test expiration validation
  - Verify revocation capability
- **PRD Validation**: Meets all requirements from REQ-SEC-001

```javascript
// api/lib/registration-token-service.js
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getDatabase } from './database.js';

export class RegistrationTokenService {
  constructor() {
    this.secret = process.env.REGISTRATION_SECRET || crypto.randomBytes(32).toString('hex');
    this.tokenExpiry = 72 * 60 * 60; // 72 hours in seconds
  }

  async createToken(transactionId) {
    const tokenId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + (this.tokenExpiry * 1000);
    
    // Create JWT with minimal payload
    const token = jwt.sign({
      tid: tokenId,
      txn: transactionId,
      type: 'registration',
      iat: Math.floor(now / 1000),
      exp: Math.floor(expiresAt / 1000)
    }, this.secret, { algorithm: 'HS256' });
    
    // Store server-side state for tracking
    const db = await getDatabase();
    await db.execute({
      sql: `UPDATE transactions 
            SET registration_token = ?, 
                registration_token_expires = ?,
                registration_initiated_at = ?
            WHERE id = ?`,
      args: [token, new Date(expiresAt).toISOString(), new Date().toISOString(), transactionId]
    });
    
    return token;
  }

  async validateAndConsumeToken(token, ipAddress) {
    try {
      // Verify JWT signature and expiration
      const decoded = jwt.verify(token, this.secret);
      
      // Check server-side state
      const db = await getDatabase();
      const result = await db.execute({
        sql: `SELECT * FROM transactions 
              WHERE registration_token = ? 
              AND datetime(registration_token_expires) > datetime('now')`,
        args: [token]
      });
      
      if (result.rows.length === 0) {
        throw new Error('Token invalid or expired');
      }
      
      const transaction = result.rows[0];
      
      // Check if already used (all tickets registered)
      if (transaction.all_tickets_registered) {
        throw new Error('Registration already completed');
      }
      
      // Log token usage
      await this.logTokenUsage(decoded.tid, ipAddress, 'validated');
      
      return {
        transactionId: transaction.id,
        customerId: transaction.customer_email,
        expiresAt: transaction.registration_token_expires
      };
    } catch (error) {
      await this.logTokenUsage(null, ipAddress, 'failed', error.message);
      throw error;
    }
  }

  async revokeToken(transactionId) {
    const db = await getDatabase();
    await db.execute({
      sql: `UPDATE transactions 
            SET registration_token = NULL,
                registration_token_expires = NULL
            WHERE id = ?`,
      args: [transactionId]
    });
  }

  async logTokenUsage(tokenId, ipAddress, action, errorMessage = null) {
    // Implement audit logging per REQ-SEC-005
    console.log(JSON.stringify({
      event: 'registration_token_usage',
      tokenId: tokenId?.substring(0, 8),
      ip: ipAddress,
      action,
      error: errorMessage,
      timestamp: new Date().toISOString()
    }));
  }
}
```

### Task_1_2_02: Implement Input Validation Library
- **Assignee**: security-auditor
- **Execution**: Independent
- **Duration**: 3-4 hours
- **PRD Requirements**: REQ-SEC-002
- **Technical Details**:
  - Create `/api/lib/registration-validator.js`
  - Implement comprehensive name validation (2-50 chars)
  - Add email validation (RFC 5322 compliant)
  - Prevent XSS through HTML entity encoding
  - Prevent SQL injection via parameterized queries
  - Add character whitelist for names
- **Acceptance Criteria**:
  - All XSS vectors blocked
  - SQL injection attempts rejected
  - Valid international names accepted
  - Clear validation error messages
- **Testing**:
  - Test with OWASP XSS vectors
  - Test SQL injection patterns
  - Test international characters
  - Test edge cases (single names, hyphenated)
- **PRD Validation**: Implements all validation from REQ-SEC-002

```javascript
// api/lib/registration-validator.js
import validator from 'validator';
import DOMPurify from 'isomorphic-dompurify';

export class RegistrationValidator {
  
  validateName(name, fieldName = 'name') {
    // Check presence and length
    if (!name || typeof name !== 'string') {
      throw new ValidationError(`${fieldName} is required`);
    }
    
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 50) {
      throw new ValidationError(`${fieldName} must be 2-50 characters`);
    }
    
    // Character whitelist: letters, spaces, hyphens, apostrophes
    // Supports international characters
    const nameRegex = /^[a-zA-ZÀ-ÿĀ-žА-я\s'\-\.]+$/u;
    if (!nameRegex.test(trimmed)) {
      throw new ValidationError(`${fieldName} contains invalid characters`);
    }
    
    // Normalize whitespace
    const normalized = trimmed.replace(/\s+/g, ' ');
    
    // Check for potential XSS patterns
    if (this.containsXSSPatterns(normalized)) {
      throw new ValidationError(`${fieldName} contains prohibited content`);
    }
    
    // Check for SQL patterns
    if (this.containsSQLPatterns(normalized)) {
      throw new ValidationError(`${fieldName} contains prohibited content`);
    }
    
    // Sanitize for storage (HTML entity encoding)
    const sanitized = DOMPurify.sanitize(normalized, { 
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true
    });
    
    return sanitized;
  }
  
  validateEmail(email) {
    if (!email || typeof email !== 'string') {
      throw new ValidationError('Email is required');
    }
    
    const trimmed = email.trim().toLowerCase();
    
    // Use validator.js for RFC compliance
    if (!validator.isEmail(trimmed, { 
      allow_utf8_local_part: false,
      require_tld: true,
      allow_ip_domain: false
    })) {
      throw new ValidationError('Invalid email format');
    }
    
    // Additional security checks
    if (trimmed.length > 254) { // RFC 5321
      throw new ValidationError('Email address too long');
    }
    
    // Check for malicious patterns
    if (this.containsXSSPatterns(trimmed) || this.containsSQLPatterns(trimmed)) {
      throw new ValidationError('Email contains prohibited content');
    }
    
    return trimmed;
  }
  
  containsXSSPatterns(str) {
    const xssPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i, // Event handlers
      /<iframe/i,
      /<embed/i,
      /<object/i,
      /data:text\/html/i,
      /vbscript:/i
    ];
    
    return xssPatterns.some(pattern => pattern.test(str));
  }
  
  containsSQLPatterns(str) {
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE)\b)/i,
      /(--|\||;|\/\*|\*\/)/,
      /(\bOR\b.*=.*)/i,
      /(\bAND\b.*=.*)/i,
      /'.*\bOR\b.*'/i
    ];
    
    return sqlPatterns.some(pattern => pattern.test(str));
  }
  
  validateTicketRegistration(data) {
    const validated = {
      ticketId: this.validateTicketId(data.ticketId),
      firstName: this.validateName(data.firstName, 'First name'),
      lastName: this.validateName(data.lastName, 'Last name'),
      email: this.validateEmail(data.email)
    };
    
    return validated;
  }
  
  validateTicketId(ticketId) {
    if (!ticketId || typeof ticketId !== 'string') {
      throw new ValidationError('Ticket ID is required');
    }
    
    // Ticket ID format: TKT-XXXXXXXXX
    const ticketRegex = /^TKT-[A-Z0-9]{9}$/;
    if (!ticketRegex.test(ticketId)) {
      throw new ValidationError('Invalid ticket ID format');
    }
    
    return ticketId;
  }
}

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}
```

### Task_1_2_03: Implement Rate Limiting Service
- **Assignee**: security-auditor
- **Execution**: Independent
- **Duration**: 3 hours
- **PRD Requirements**: REQ-SEC-003
- **Technical Details**:
  - Create `/api/lib/rate-limiter.js`
  - Implement sliding window rate limiting
  - 3 attempts per 15 minutes per IP
  - Progressive backoff for repeated violations
  - Bypass for authenticated admin users
  - In-memory storage with cleanup
- **Acceptance Criteria**:
  - Rate limits enforced accurately
  - Admin bypass functional
  - Memory cleanup prevents leaks
  - Clear rate limit headers in responses
- **Testing**:
  - Test rate limit enforcement
  - Test admin bypass
  - Test cleanup of old entries
  - Test progressive backoff
- **PRD Validation**: Implements rate limiting per REQ-SEC-003

```javascript
// api/lib/rate-limiter.js
export class RateLimiter {
  constructor() {
    this.attempts = new Map();
    this.violations = new Map();
    this.windowMs = 15 * 60 * 1000; // 15 minutes
    this.maxAttempts = 3;
    
    // Cleanup old entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }
  
  async checkRateLimit(identifier, isAdmin = false) {
    // Bypass for admin users
    if (isAdmin) {
      return { allowed: true, remaining: 999, resetTime: null };
    }
    
    const now = Date.now();
    const key = this.getKey(identifier);
    
    // Check for previous violations (progressive backoff)
    const violationCount = this.violations.get(key) || 0;
    const backoffMultiplier = Math.pow(2, violationCount); // Exponential backoff
    const effectiveWindow = this.windowMs * backoffMultiplier;
    
    // Get or create attempt record
    let record = this.attempts.get(key);
    if (!record) {
      record = { attempts: [], windowStart: now };
      this.attempts.set(key, record);
    }
    
    // Remove attempts outside the window
    const windowStart = now - effectiveWindow;
    record.attempts = record.attempts.filter(time => time > windowStart);
    
    // Check if limit exceeded
    if (record.attempts.length >= this.maxAttempts) {
      // Record violation
      this.violations.set(key, violationCount + 1);
      
      // Calculate reset time
      const oldestAttempt = Math.min(...record.attempts);
      const resetTime = oldestAttempt + effectiveWindow;
      
      return {
        allowed: false,
        remaining: 0,
        resetTime: new Date(resetTime),
        retryAfter: Math.ceil((resetTime - now) / 1000)
      };
    }
    
    // Record this attempt
    record.attempts.push(now);
    
    // Clear violations on successful attempt
    if (violationCount > 0 && record.attempts.length === 1) {
      this.violations.delete(key);
    }
    
    return {
      allowed: true,
      remaining: this.maxAttempts - record.attempts.length,
      resetTime: new Date(now + effectiveWindow)
    };
  }
  
  getKey(identifier) {
    // Use IP + endpoint as key for more granular control
    return `${identifier.ip}:${identifier.endpoint || 'default'}`;
  }
  
  cleanup() {
    const now = Date.now();
    const maxAge = this.windowMs * 4; // Keep for 4x window duration
    
    // Clean attempts
    for (const [key, record] of this.attempts.entries()) {
      const latestAttempt = Math.max(...record.attempts, 0);
      if (now - latestAttempt > maxAge) {
        this.attempts.delete(key);
      }
    }
    
    // Clean violations older than 1 hour
    for (const [key, timestamp] of this.violations.entries()) {
      if (now - timestamp > 60 * 60 * 1000) {
        this.violations.delete(key);
      }
    }
  }
  
  reset(identifier) {
    const key = this.getKey(identifier);
    this.attempts.delete(key);
    this.violations.delete(key);
  }
}

// Singleton instance
let rateLimiterInstance;
export function getRateLimiter() {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiter();
  }
  return rateLimiterInstance;
}
```

### Task_1_2_04: Implement CSRF Protection Middleware
- **Assignee**: security-auditor
- **Execution**: Depends on Task_1_2_01
- **Duration**: 2 hours
- **PRD Requirements**: REQ-SEC-004
- **Technical Details**:
  - Create `/api/lib/csrf-protection.js`
  - Generate secure CSRF tokens
  - Validate tokens on state-changing requests
  - Configure SameSite cookie attributes
  - Implement origin validation
- **Acceptance Criteria**:
  - CSRF tokens required for POST requests
  - Tokens bound to user session
  - SameSite cookies configured
  - Origin validation functional
- **Testing**:
  - Test token generation and validation
  - Test cross-origin request rejection
  - Test SameSite cookie behavior
  - Test token expiration
- **PRD Validation**: Implements CSRF protection per REQ-SEC-004

```javascript
// api/lib/csrf-protection.js
import crypto from 'crypto';

export class CSRFProtection {
  constructor() {
    this.tokens = new Map();
    this.tokenExpiry = 60 * 60 * 1000; // 1 hour
  }
  
  generateToken(sessionId) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + this.tokenExpiry;
    
    this.tokens.set(token, {
      sessionId,
      expires,
      used: false
    });
    
    // Cleanup expired tokens
    this.cleanup();
    
    return token;
  }
  
  validateToken(token, sessionId) {
    if (!token) {
      throw new Error('CSRF token required');
    }
    
    const tokenData = this.tokens.get(token);
    
    if (!tokenData) {
      throw new Error('Invalid CSRF token');
    }
    
    if (tokenData.expires < Date.now()) {
      this.tokens.delete(token);
      throw new Error('CSRF token expired');
    }
    
    if (tokenData.sessionId !== sessionId) {
      throw new Error('CSRF token mismatch');
    }
    
    if (tokenData.used) {
      throw new Error('CSRF token already used');
    }
    
    // Mark as used (single-use tokens)
    tokenData.used = true;
    
    return true;
  }
  
  validateOrigin(origin, allowedOrigins) {
    if (!origin) {
      return false;
    }
    
    return allowedOrigins.some(allowed => {
      if (allowed === origin) return true;
      
      // Support wildcard subdomains
      if (allowed.startsWith('*.')) {
        const domain = allowed.substring(2);
        return origin.endsWith(domain);
      }
      
      return false;
    });
  }
  
  cleanup() {
    const now = Date.now();
    for (const [token, data] of this.tokens.entries()) {
      if (data.expires < now) {
        this.tokens.delete(token);
      }
    }
  }
  
  middleware(allowedOrigins = []) {
    return async (req, res, next) => {
      // Skip for GET requests
      if (req.method === 'GET' || req.method === 'HEAD') {
        return next();
      }
      
      // Validate origin
      const origin = req.headers.origin || req.headers.referer;
      if (!this.validateOrigin(origin, allowedOrigins)) {
        return res.status(403).json({ error: 'Invalid origin' });
      }
      
      // Validate CSRF token
      const token = req.headers['x-csrf-token'] || req.body.csrfToken;
      const sessionId = req.session?.id || req.ip;
      
      try {
        this.validateToken(token, sessionId);
        next();
      } catch (error) {
        return res.status(403).json({ error: error.message });
      }
    };
  }
}
```

## Success Criteria
- All security services implemented and tested
- Token validation completes in <100ms
- Rate limiting accurately enforced
- Input validation blocks all malicious patterns
- CSRF protection prevents cross-origin attacks
- All PRD security requirements satisfied

## Testing Checklist
- [ ] JWT tokens are cryptographically secure
- [ ] Tokens cannot be reused after consumption
- [ ] Rate limits correctly enforced per IP
- [ ] XSS patterns blocked by validator
- [ ] SQL injection patterns blocked
- [ ] CSRF tokens required for state changes
- [ ] International names accepted by validator
- [ ] Admin bypass works for rate limiting

## Security Review Checklist
- [ ] No sensitive data in JWT payload
- [ ] Tokens expire after 72 hours
- [ ] Rate limit prevents brute force
- [ ] Input validation prevents injection
- [ ] CSRF tokens are single-use
- [ ] Audit logging captures all attempts
- [ ] Error messages don't leak information

## Notes
- Use environment variable for JWT secret in production
- Monitor rate limit violations for abuse patterns
- Review OWASP guidelines for input validation
- Consider implementing CAPTCHA for repeated violations
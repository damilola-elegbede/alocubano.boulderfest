# A Lo Cubano Boulder Fest - Critical Security Remediation Plan

## Executive Summary

The redesigned test suite has uncovered critical production security vulnerabilities requiring immediate architectural attention. This plan provides comprehensive guidance for remediating SQL injection vulnerabilities, implementing proper rate limiting, and establishing secure coding patterns across the serverless application.

## Current Security Assessment

### Critical Vulnerabilities Identified

1. **SQL Injection (CRITICAL)**
   - Location: `/api/email/subscribe` endpoint
   - Evidence: HTTP 500 errors from injection payloads
   - Impact: Database compromise, data exposure, system crashes

2. **Missing Rate Limiting (HIGH)**
   - Affected: Payment, ticket validation, admin endpoints
   - Risk: Payment spam, QR brute forcing, authentication attacks

3. **Error Information Disclosure (MEDIUM)**
   - Issue: HTTP 500 errors revealing system internals
   - Risk: Information gathering for targeted attacks

## Security Architecture Recommendations

### 1. Database Security Architecture

#### Immediate Actions (Critical - Week 1)

**A. Implement Parameterized Queries Everywhere**

```javascript
// CURRENT VULNERABLE PATTERN (found in email-subscriber-service.js)
const query = `INSERT INTO email_subscribers (...) VALUES (?1, ?2, ?3, ...)`;
await db.execute(query, values); // Still vulnerable if values not properly sanitized

// SECURE PATTERN - Use Prepared Statements
class SecureDatabaseService {
  async executeSecure(sql, params = []) {
    // Validate SQL structure (no dynamic table/column names)
    if (sql.includes('${') || sql.includes('`${')) {
      throw new Error('Dynamic SQL construction not allowed');
    }
    
    // Use prepared statement with parameter binding
    const stmt = await this.db.prepare(sql);
    try {
      return await stmt.all(...params);
    } finally {
      await stmt.finalize();
    }
  }
}
```

**B. Create Database Abstraction Layer**

```javascript
// api/lib/secure-database.js
import { getDatabaseClient } from './database.js';
import { validateTableName } from './sql-security.js';

export class SecureDatabase {
  constructor() {
    this.db = null;
    this.preparedStatements = new Map();
  }

  async ensureInitialized() {
    if (!this.db) {
      this.db = await getDatabaseClient();
    }
    return this;
  }

  // Secure query execution with automatic parameterization
  async query(sql, params = [], options = {}) {
    await this.ensureInitialized();
    
    // Input validation
    this.validateQueryInput(sql, params);
    
    // Use cached prepared statement if available
    const stmtKey = this.getStatementKey(sql);
    let stmt = this.preparedStatements.get(stmtKey);
    
    if (!stmt) {
      stmt = await this.db.prepare(sql);
      this.preparedStatements.set(stmtKey, stmt);
    }
    
    try {
      const result = options.single 
        ? await stmt.get(...params)
        : await stmt.all(...params);
      
      return this.sanitizeOutput(result);
    } catch (error) {
      // Secure error handling
      throw this.sanitizeError(error);
    }
  }

  validateQueryInput(sql, params) {
    // Prevent dynamic SQL construction
    const dangerousPatterns = [
      /EXEC\s*\(/i,
      /EXECUTE\s+IMMEDIATE/i,
      /eval\s*\(/i,
      /\$\{.*\}/,
      /`.*\$\{.*\}`/
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(sql)) {
        throw new Error('Potentially dangerous SQL pattern detected');
      }
    }
    
    // Validate parameter types
    for (const param of params) {
      if (param !== null && param !== undefined) {
        const type = typeof param;
        if (!['string', 'number', 'boolean'].includes(type)) {
          throw new Error(`Invalid parameter type: ${type}`);
        }
      }
    }
  }

  sanitizeError(error) {
    // Never expose internal database errors to clients
    const sanitizedError = new Error('Database operation failed');
    
    // Log full error internally
    console.error('Database error:', {
      message: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    });
    
    // Return generic error to prevent information disclosure
    if (error.message.includes('UNIQUE constraint')) {
      sanitizedError.message = 'This record already exists';
      sanitizedError.code = 'DUPLICATE_ENTRY';
    } else if (error.message.includes('FOREIGN KEY constraint')) {
      sanitizedError.message = 'Related record not found';
      sanitizedError.code = 'INVALID_REFERENCE';
    } else {
      sanitizedError.message = 'Operation could not be completed';
      sanitizedError.code = 'DATABASE_ERROR';
    }
    
    return sanitizedError;
  }

  sanitizeOutput(result) {
    // Remove any potentially sensitive metadata
    if (Array.isArray(result)) {
      return result.map(row => this.sanitizeRow(row));
    }
    return result ? this.sanitizeRow(result) : null;
  }

  sanitizeRow(row) {
    const sanitized = {};
    for (const [key, value] of Object.entries(row)) {
      // Skip internal fields
      if (!key.startsWith('_')) {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
}
```

**C. Refactor Vulnerable Endpoints**

```javascript
// api/email/subscribe.js - SECURE VERSION
import { SecureDatabase } from '../lib/secure-database.js';
import { InputValidator } from '../lib/input-validator.js';

export default async function handler(req, res) {
  try {
    // Input validation layer
    const validator = new InputValidator();
    const sanitized = validator.validateEmailSubscription(req.body);
    
    // Use secure database layer
    const db = await new SecureDatabase().ensureInitialized();
    
    // Parameterized query - no string concatenation
    const subscriber = await db.query(
      `INSERT INTO email_subscribers 
       (email, first_name, last_name, status, created_at) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        sanitized.email,
        sanitized.firstName,
        sanitized.lastName,
        'pending',
        new Date().toISOString()
      ],
      { single: true }
    );
    
    res.status(201).json({ success: true, subscriber });
  } catch (error) {
    // Secure error response
    if (error.code === 'DUPLICATE_ENTRY') {
      return res.status(409).json({ 
        error: 'Email already subscribed' 
      });
    }
    
    // Generic error for unknown issues
    res.status(500).json({ 
      error: 'Subscription could not be processed' 
    });
  }
}
```

### 2. Rate Limiting Strategy

#### Implementation Approach (High Priority - Week 1)

**A. Activate Existing Advanced Rate Limiter**

The codebase already has a sophisticated rate limiter (`api/lib/security/rate-limiter.js`) that needs activation:

```javascript
// api/lib/middleware/activate-rate-limiting.js
import { getRateLimiter } from '../security/rate-limiter.js';

export function createRateLimitMiddleware(endpoint) {
  const limiter = getRateLimiter({
    enableRedis: process.env.REDIS_URL ? true : false,
    redis: process.env.REDIS_URL,
    enableAnalytics: true
  });

  return async function rateLimitMiddleware(req, res, next) {
    const result = await limiter.checkRateLimit(req, endpoint);
    
    if (!result.allowed) {
      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', result.limit || 60);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', result.resetTime);
      res.setHeader('Retry-After', result.retryAfter);
      
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: result.retryAfter,
        reason: result.reason
      });
    }
    
    // Set success headers
    res.setHeader('X-RateLimit-Limit', result.limit || 60);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', result.resetTime);
    
    if (next) {
      next();
    }
  };
}
```

**B. Apply Rate Limiting to All Endpoints**

```javascript
// api/payments/create-checkout-session.js
import { createRateLimitMiddleware } from '../lib/middleware/activate-rate-limiting.js';

const rateLimiter = createRateLimitMiddleware('payment');

export default async function handler(req, res) {
  // Apply rate limiting
  const rateLimitResult = await rateLimiter(req, res);
  if (rateLimitResult) return; // Request was rate limited
  
  // Continue with normal processing
  // ... existing code ...
}
```

**C. Configure Endpoint-Specific Limits**

Update the existing rate limiter configuration:

```javascript
// api/lib/security/rate-limiter.js - Update ENDPOINT_CONFIGS
const ENDPOINT_CONFIGS = {
  payment: {
    ipLimit: { requests: 3, windowMs: 60000 }, // 3 req/min (tightened)
    userLimit: { requests: 5, windowMs: 3600000 }, // 5 req/hour
    slidingWindow: true,
    enablePenalties: true,
    alertThreshold: 10 // Alert after 10 blocks
  },
  email: {
    ipLimit: { requests: 5, windowMs: 3600000 }, // 5 req/hour (tightened)
    slidingWindow: true,
    enablePenalties: true,
    alertThreshold: 20
  },
  qrValidation: {
    deviceLimit: { requests: 50, windowMs: 60000 }, // 50 req/min (tightened)
    slidingWindow: true,
    enablePenalties: true, // Changed to true
    alertThreshold: 100
  },
  auth: {
    ipLimit: { requests: 3, windowMs: 60000 }, // 3 attempts/min (tightened)
    lockoutAfter: 5, // Lockout after 5 failures (tightened)
    lockoutDuration: 7200000, // 2 hours (increased)
    enablePenalties: true,
    maxPenaltyMultiplier: 64, // Increased max penalty
    alertThreshold: 10
  }
};
```

### 3. Input Validation Architecture

#### Schema-Based Validation (Week 1)

**A. Create Centralized Input Validator**

```javascript
// api/lib/input-validator.js
import validator from 'validator';
import DOMPurify from 'isomorphic-dompurify';

export class InputValidator {
  constructor() {
    this.schemas = this.loadSchemas();
  }

  loadSchemas() {
    return {
      email: {
        email: { type: 'email', required: true, maxLength: 255 },
        firstName: { type: 'string', maxLength: 100, sanitize: true },
        lastName: { type: 'string', maxLength: 100, sanitize: true },
        consentToMarketing: { type: 'boolean', required: true }
      },
      payment: {
        cartItems: { type: 'array', required: true, minLength: 1 },
        customerInfo: { 
          type: 'object', 
          required: true,
          properties: {
            email: { type: 'email', required: true },
            firstName: { type: 'string', required: true, maxLength: 100 },
            lastName: { type: 'string', required: true, maxLength: 100 }
          }
        }
      },
      ticketValidation: {
        qr_code: { type: 'string', required: true, pattern: /^[A-Za-z0-9\-_]+$/, maxLength: 500 }
      }
    };
  }

  validate(schemaName, data) {
    const schema = this.schemas[schemaName];
    if (!schema) {
      throw new Error(`Unknown schema: ${schemaName}`);
    }

    const errors = [];
    const sanitized = {};

    for (const [field, rules] of Object.entries(schema)) {
      const value = data[field];
      
      // Check required fields
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }

      if (value !== undefined && value !== null) {
        // Type validation
        const validatedValue = this.validateType(field, value, rules, errors);
        
        if (validatedValue !== undefined) {
          // Sanitization
          sanitized[field] = rules.sanitize 
            ? this.sanitize(validatedValue, rules.type)
            : validatedValue;
        }
      }
    }

    if (errors.length > 0) {
      const error = new Error('Validation failed');
      error.validationErrors = errors;
      throw error;
    }

    return sanitized;
  }

  validateType(field, value, rules, errors) {
    switch (rules.type) {
      case 'email':
        if (!validator.isEmail(value)) {
          errors.push(`${field} must be a valid email`);
          return undefined;
        }
        return validator.normalizeEmail(value);

      case 'string':
        if (typeof value !== 'string') {
          errors.push(`${field} must be a string`);
          return undefined;
        }
        if (rules.maxLength && value.length > rules.maxLength) {
          errors.push(`${field} must not exceed ${rules.maxLength} characters`);
          return undefined;
        }
        if (rules.pattern && !rules.pattern.test(value)) {
          errors.push(`${field} has invalid format`);
          return undefined;
        }
        return value;

      case 'number':
        const num = Number(value);
        if (isNaN(num)) {
          errors.push(`${field} must be a number`);
          return undefined;
        }
        if (rules.min !== undefined && num < rules.min) {
          errors.push(`${field} must be at least ${rules.min}`);
          return undefined;
        }
        if (rules.max !== undefined && num > rules.max) {
          errors.push(`${field} must not exceed ${rules.max}`);
          return undefined;
        }
        return num;

      case 'boolean':
        return Boolean(value);

      case 'array':
        if (!Array.isArray(value)) {
          errors.push(`${field} must be an array`);
          return undefined;
        }
        if (rules.minLength && value.length < rules.minLength) {
          errors.push(`${field} must contain at least ${rules.minLength} items`);
          return undefined;
        }
        return value;

      case 'object':
        if (typeof value !== 'object' || value === null) {
          errors.push(`${field} must be an object`);
          return undefined;
        }
        if (rules.properties) {
          return this.validate(field, value);
        }
        return value;

      default:
        return value;
    }
  }

  sanitize(value, type) {
    if (type === 'string') {
      // Remove potential SQL injection patterns
      value = value.replace(/['";\\]/g, '');
      
      // Remove potential XSS
      value = DOMPurify.sanitize(value, { 
        ALLOWED_TAGS: [], 
        ALLOWED_ATTR: [] 
      });
      
      // Trim whitespace
      value = value.trim();
    }
    
    return value;
  }

  // Specialized validators
  validateEmailSubscription(data) {
    return this.validate('email', data);
  }

  validatePaymentRequest(data) {
    const validated = this.validate('payment', data);
    
    // Additional payment-specific validation
    for (const item of validated.cartItems) {
      if (!item.name || !item.price || !item.quantity) {
        throw new Error('Invalid cart item structure');
      }
      if (item.price <= 0) {
        throw new Error('Invalid item price');
      }
      if (item.quantity <= 0) {
        throw new Error('Invalid item quantity');
      }
    }
    
    return validated;
  }

  validateTicketQRCode(data) {
    return this.validate('ticketValidation', data);
  }
}
```

### 4. Error Handling Strategy

#### Secure Error Response Architecture (Week 1)

**A. Create Error Handler Service**

```javascript
// api/lib/error-handler.js
export class ErrorHandler {
  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  handle(error, req, res) {
    // Log full error internally
    this.logError(error, req);
    
    // Determine error category
    const errorResponse = this.categorizeError(error);
    
    // Send secure response
    res.status(errorResponse.status).json({
      error: errorResponse.message,
      code: errorResponse.code,
      ...(this.isDevelopment && { debug: error.stack })
    });
  }

  categorizeError(error) {
    // Validation errors
    if (error.validationErrors) {
      return {
        status: 400,
        message: error.validationErrors.join(', '),
        code: 'VALIDATION_ERROR'
      };
    }

    // Database errors (sanitized)
    if (error.code === 'DUPLICATE_ENTRY') {
      return {
        status: 409,
        message: 'This record already exists',
        code: 'DUPLICATE_ENTRY'
      };
    }

    if (error.code === 'INVALID_REFERENCE') {
      return {
        status: 400,
        message: 'Invalid reference provided',
        code: 'INVALID_REFERENCE'
      };
    }

    // Rate limiting
    if (error.code === 'RATE_LIMIT_EXCEEDED') {
      return {
        status: 429,
        message: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED'
      };
    }

    // Authentication errors
    if (error.code === 'UNAUTHORIZED') {
      return {
        status: 401,
        message: 'Authentication required',
        code: 'UNAUTHORIZED'
      };
    }

    // Default to generic error
    return {
      status: 500,
      message: 'An error occurred processing your request',
      code: 'INTERNAL_ERROR'
    };
  }

  logError(error, req) {
    const logData = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      error: {
        message: error.message,
        code: error.code,
        stack: error.stack
      }
    };

    // In production, send to monitoring service
    if (process.env.NODE_ENV === 'production') {
      // Send to Sentry, DataDog, etc.
      this.sendToMonitoring(logData);
    }

    // Always log to console
    console.error('Request error:', logData);
  }

  sendToMonitoring(logData) {
    // Integrate with monitoring service
    // Example: Sentry, DataDog, CloudWatch
  }
}
```

### 5. Security Implementation Priority

#### Phase 1: Critical Fixes (Week 1)
1. **Day 1-2**: Implement parameterized queries in all database operations
2. **Day 3-4**: Deploy secure database abstraction layer
3. **Day 5**: Activate rate limiting on all endpoints
4. **Day 6-7**: Implement input validation and error handling

#### Phase 2: Enhanced Security (Week 2)
1. **Day 1-2**: Add Redis support for distributed rate limiting
2. **Day 3-4**: Implement security monitoring and alerting
3. **Day 5-6**: Add request signing for critical operations
4. **Day 7**: Security audit and penetration testing

#### Phase 3: Long-term Improvements (Week 3+)
1. Implement Web Application Firewall (WAF) rules
2. Add anomaly detection for abuse patterns
3. Implement security headers enhancement
4. Create security dashboard for monitoring

## Testing Strategy

### Security Test Suite Enhancement

```javascript
// tests/security-validation.test.js
import { test, expect } from 'vitest';
import { testRequest } from './helpers.js';

test('SQL injection attempts are properly blocked', async () => {
  const injectionPayloads = [
    "'; DROP TABLE users; --",
    "1' OR '1'='1",
    "admin'--",
    "' UNION SELECT * FROM users--"
  ];
  
  for (const payload of injectionPayloads) {
    const response = await testRequest('POST', '/api/email/subscribe', {
      email: `test@example.com`,
      firstName: payload,
      consentToMarketing: true
    });
    
    // Should never return 500 (indicates SQL execution)
    expect(response.status).not.toBe(500);
    
    // Should return validation error or success (sanitized)
    expect([200, 201, 400, 422]).toContain(response.status);
  }
});

test('Rate limiting prevents abuse', async () => {
  const endpoint = '/api/payments/create-checkout-session';
  const validData = {
    cartItems: [{ name: 'Test', price: 100, quantity: 1 }],
    customerInfo: { email: 'test@example.com' }
  };
  
  // Make requests up to limit
  const responses = [];
  for (let i = 0; i < 5; i++) {
    responses.push(await testRequest('POST', endpoint, validData));
  }
  
  // Last request should be rate limited
  const lastResponse = responses[responses.length - 1];
  expect(lastResponse.status).toBe(429);
  expect(lastResponse.data.error).toContain('Too many requests');
});

test('Error responses do not leak sensitive information', async () => {
  const response = await testRequest('POST', '/api/email/subscribe', {
    email: 'duplicate@test.com',
    consentToMarketing: true
  });
  
  // Make same request again (duplicate)
  const duplicateResponse = await testRequest('POST', '/api/email/subscribe', {
    email: 'duplicate@test.com',
    consentToMarketing: true
  });
  
  // Should not expose database structure
  expect(duplicateResponse.data.error).not.toContain('UNIQUE constraint');
  expect(duplicateResponse.data.error).not.toContain('email_subscribers');
  expect(duplicateResponse.data.error).not.toContain('SQL');
});
```

## Monitoring and Alerting

### Security Event Monitoring

```javascript
// api/lib/security-monitor.js
export class SecurityMonitor {
  constructor() {
    this.events = [];
    this.alertThresholds = {
      sqlInjectionAttempts: 5,
      rateLimitViolations: 50,
      authenticationFailures: 10
    };
  }

  async logSecurityEvent(type, details) {
    const event = {
      type,
      timestamp: new Date().toISOString(),
      details,
      severity: this.calculateSeverity(type, details)
    };
    
    this.events.push(event);
    
    // Check if alert needed
    if (this.shouldAlert(type)) {
      await this.sendAlert(event);
    }
    
    // Log to persistent storage
    await this.persistEvent(event);
  }

  calculateSeverity(type, details) {
    const severityMap = {
      'sql_injection_attempt': 'critical',
      'rate_limit_violation': 'medium',
      'authentication_failure': 'high',
      'invalid_input': 'low'
    };
    
    return severityMap[type] || 'medium';
  }

  shouldAlert(type) {
    const recentEvents = this.events.filter(e => 
      e.type === type && 
      Date.now() - new Date(e.timestamp).getTime() < 3600000
    );
    
    return recentEvents.length >= this.alertThresholds[type] || 5;
  }

  async sendAlert(event) {
    // Send to alerting service
    console.error(`SECURITY ALERT: ${event.type}`, event);
    
    // Integration with PagerDuty, Slack, etc.
    if (process.env.SLACK_WEBHOOK_URL) {
      await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🚨 Security Alert: ${event.type}`,
          attachments: [{
            color: event.severity === 'critical' ? 'danger' : 'warning',
            fields: [
              { title: 'Type', value: event.type, short: true },
              { title: 'Severity', value: event.severity, short: true },
              { title: 'Details', value: JSON.stringify(event.details) }
            ]
          }]
        })
      });
    }
  }

  async persistEvent(event) {
    // Store in database for audit trail
    const db = await new SecureDatabase().ensureInitialized();
    await db.query(
      `INSERT INTO security_events (type, severity, details, timestamp) 
       VALUES (?, ?, ?, ?)`,
      [event.type, event.severity, JSON.stringify(event.details), event.timestamp]
    );
  }
}
```

## Performance Considerations

### Optimization Strategies

1. **Prepared Statement Caching**: Cache prepared statements to avoid re-compilation
2. **Rate Limiter Optimization**: Use Redis pipeline for atomic operations
3. **Input Validation Caching**: Cache validation schemas in memory
4. **Error Response Caching**: Cache common error responses

### Performance Targets

- **Security overhead**: <10ms per request
- **Rate limiting check**: <5ms
- **Input validation**: <3ms
- **Database query with security**: <20ms increase

## Implementation Checklist

### Week 1 - Critical Security Fixes
- [ ] Implement SecureDatabase class with parameterized queries
- [ ] Refactor all endpoints to use secure database layer
- [ ] Activate rate limiting on all endpoints
- [ ] Implement InputValidator for all user inputs
- [ ] Deploy ErrorHandler for secure error responses
- [ ] Update all tests to validate security measures
- [ ] Deploy to staging for security testing

### Week 2 - Enhanced Security
- [ ] Configure Redis for distributed rate limiting
- [ ] Implement SecurityMonitor for event tracking
- [ ] Add security headers to all responses
- [ ] Implement request signing for payments
- [ ] Create security dashboard
- [ ] Conduct penetration testing
- [ ] Deploy to production

### Week 3+ - Continuous Improvement
- [ ] Implement WAF rules
- [ ] Add machine learning for anomaly detection
- [ ] Enhance monitoring and alerting
- [ ] Regular security audits
- [ ] Security training for development team

## Success Metrics

### Security KPIs
- **Zero SQL injection vulnerabilities** in production
- **100% endpoint rate limiting coverage**
- **<0.1% false positive rate** for security blocks
- **<10ms security overhead** per request
- **100% test coverage** for security scenarios

### Monitoring Metrics
- SQL injection attempts blocked per day
- Rate limit violations per endpoint
- Authentication failure patterns
- Error response information leakage incidents
- Security alert response time

## Conclusion

This comprehensive security remediation plan addresses all critical vulnerabilities discovered in the A Lo Cubano Boulder Fest application. The phased implementation approach ensures rapid mitigation of critical issues while building toward a robust, defense-in-depth security architecture.

The combination of parameterized queries, rate limiting, input validation, and secure error handling will provide multiple layers of protection against common web application attacks. The existing sophisticated rate limiter just needs activation, significantly reducing implementation time.

With proper implementation and testing, these security measures will protect user data, prevent system abuse, and maintain application availability while adding minimal performance overhead to the serverless architecture.
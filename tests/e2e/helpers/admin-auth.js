/**
 * Admin Authentication Helper - Comprehensive admin auth testing utilities
 * 
 * Provides utilities for testing admin authentication, authorization,
 * security scenarios, and JWT token management.
 */

import { generateTestId } from './test-isolation.js';

/**
 * Security Test Helper - Security-focused testing utilities
 */
class SecurityTestHelper {
  constructor(options = {}) {
    this.testId = options.testId || generateTestId('security');
    this.options = {
      jwtSecret: options.jwtSecret || process.env.ADMIN_SECRET || 'test-secret',
      sessionTimeout: options.sessionTimeout || 24 * 60 * 60 * 1000, // 24 hours
      ...options
    };
    
    console.log(`🔐 Security Test Helper initialized: ${this.testId}`);
  }

  /**
   * Generate test admin credentials
   * @param {Object} overrides - Override default values
   * @returns {Object} Admin credentials
   */
  generateAdminCredentials(overrides = {}) {
    return {
      username: 'test-admin',
      password: process.env.TEST_ADMIN_PASSWORD || 'test-admin-password',
      hashedPassword: process.env.ADMIN_PASSWORD, // bcrypt hashed version
      role: 'admin',
      permissions: ['read', 'write', 'delete', 'admin'],
      ...overrides
    };
  }

  /**
   * Generate invalid admin credentials for testing
   * @returns {Array} Array of invalid credential scenarios
   */
  generateInvalidCredentials() {
    return [
      {
        scenario: 'wrong-password',
        username: 'test-admin',
        password: 'wrong-password',
        expectedError: 'Invalid password'
      },
      {
        scenario: 'empty-password',
        username: 'test-admin',
        password: '',
        expectedError: 'Password required'
      },
      {
        scenario: 'sql-injection-attempt',
        username: 'admin\'; DROP TABLE users; --',
        password: 'password',
        expectedError: 'Invalid credentials'
      },
      {
        scenario: 'xss-attempt',
        username: '<script>alert("xss")</script>',
        password: 'password',
        expectedError: 'Invalid credentials'
      },
      {
        scenario: 'very-long-input',
        username: 'test-admin',
        password: 'a'.repeat(10000),
        expectedError: 'Invalid credentials'
      }
    ];
  }

  /**
   * Generate brute force attack simulation data
   * @param {number} attemptCount - Number of attempts to simulate
   * @returns {Array} Array of login attempts
   */
  generateBruteForceAttempts(attemptCount = 10) {
    const attempts = [];
    const commonPasswords = [
      'password', '123456', 'admin', 'letmein', 'welcome',
      'password123', 'admin123', 'root', 'test', 'qwerty'
    ];

    for (let i = 0; i < attemptCount; i++) {
      attempts.push({
        attemptNumber: i + 1,
        username: 'test-admin',
        password: commonPasswords[i % commonPasswords.length],
        timestamp: Date.now() + (i * 1000), // 1 second apart
        expectedBlocked: i >= 5 // Should be blocked after 5 attempts
      });
    }

    return attempts;
  }

  /**
   * Create session hijacking test scenarios
   * @returns {Object} Session security test scenarios
   */
  createSessionSecurityTests() {
    const validToken = this.generateTestJWT({ role: 'admin' });
    
    return {
      validSession: {
        token: validToken,
        expected: 'success'
      },
      expiredToken: {
        token: this.generateTestJWT({ role: 'admin' }, { expiresIn: '-1h' }),
        expected: 'expired'
      },
      invalidSignature: {
        token: validToken.slice(0, -5) + 'XXXXX', // Corrupt signature
        expected: 'invalid'
      },
      tamperedPayload: {
        token: this.createTamperedToken(validToken),
        expected: 'invalid'
      },
      wrongSecret: {
        token: this.generateTestJWT({ role: 'admin' }, { secret: 'wrong-secret' }),
        expected: 'invalid'
      },
      noToken: {
        token: null,
        expected: 'unauthorized'
      },
      malformedToken: {
        token: 'not.a.valid.jwt.token',
        expected: 'invalid'
      }
    };
  }

  /**
   * Generate CSRF attack test data
   * @returns {Object} CSRF test scenarios
   */
  generateCSRFTests() {
    return {
      missingCSRFToken: {
        headers: {},
        expectedBlocked: true
      },
      invalidCSRFToken: {
        headers: { 'X-CSRF-Token': 'invalid-token' },
        expectedBlocked: true
      },
      validCSRFToken: {
        headers: { 'X-CSRF-Token': this.generateCSRFToken() },
        expectedBlocked: false
      }
    };
  }

  /**
   * Create tampered JWT token
   * @param {string} validToken - Valid JWT token
   * @returns {string} Tampered token
   */
  createTamperedToken(validToken) {
    try {
      const parts = validToken.split('.');
      if (parts.length !== 3) return 'invalid.token';

      // Decode payload using Node.js Buffer
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      
      // Tamper with payload (elevate privileges)
      payload.role = 'super-admin';
      payload.permissions = ['*'];
      
      // Re-encode payload using Node.js Buffer
      const tamperedPayload = Buffer.from(JSON.stringify(payload))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      
      return `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    } catch (error) {
      return 'tampered.invalid.token';
    }
  }

  /**
   * Generate CSRF token
   * @returns {string} CSRF token
   */
  generateCSRFToken() {
    return generateTestId('csrf') + '_' + Date.now();
  }

  /**
   * Generate test JWT token
   * @param {Object} payload - JWT payload
   * @param {Object} options - JWT options
   * @returns {string} JWT token
   */
  generateTestJWT(payload = {}, options = {}) {
    const {
      secret = this.options.jwtSecret,
      expiresIn = '24h'
    } = options;

    // Simple JWT implementation for testing
    // In production, use a proper JWT library
    const header = {
      alg: 'HS256',
      typ: 'JWT'
    };

    const now = Math.floor(Date.now() / 1000);
    const exp = expiresIn.startsWith('-') 
      ? now - parseInt(expiresIn.slice(1, -1)) * 3600 // Expired token
      : now + parseInt(expiresIn.slice(0, -1)) * 3600; // Valid token

    const tokenPayload = {
      sub: 'test-admin',
      iat: now,
      exp,
      testId: this.testId,
      ...payload
    };

    // Encode header and payload using Node.js Buffer
    const encodedHeader = Buffer.from(JSON.stringify(header))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    const encodedPayload = Buffer.from(JSON.stringify(tokenPayload))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // Create signature (simplified for testing)
    const signature = Buffer.from(`${encodedHeader}.${encodedPayload}.${secret}`)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  /**
   * Validate security headers
   * @param {Object} headers - Response headers
   * @returns {Object} Validation results
   */
  validateSecurityHeaders(headers) {
    const requiredHeaders = {
      'Content-Security-Policy': 'CSP header missing',
      'X-Frame-Options': 'Frame options header missing',
      'X-Content-Type-Options': 'Content type options header missing',
      'Strict-Transport-Security': 'HSTS header missing'
      // Note: X-XSS-Protection is deprecated and removed from modern security standards
    };

    const results = {
      passed: 0,
      failed: 0,
      details: []
    };

    for (const [header, errorMessage] of Object.entries(requiredHeaders)) {
      const present = headers[header] || headers[header.toLowerCase()];
      
      if (present) {
        results.passed++;
        results.details.push({
          header,
          present: true,
          value: present
        });
      } else {
        results.failed++;
        results.details.push({
          header,
          present: false,
          error: errorMessage
        });
      }
    }

    return results;
  }
}

/**
 * JWT Test Helper - JWT-specific testing utilities
 */
class JWTTestHelper {
  constructor(secret = null) {
    this.secret = secret || process.env.ADMIN_SECRET || 'test-secret';
  }

  /**
   * Create test tokens for various scenarios
   * @returns {Object} Collection of test tokens
   */
  createTestTokens() {
    return {
      valid: this.createToken({ role: 'admin' }),
      expired: this.createExpiredToken(),
      invalidRole: this.createToken({ role: 'user' }),
      noRole: this.createToken({}),
      malformed: 'not.a.valid.jwt',
      empty: '',
      null: null
    };
  }

  /**
   * Create valid JWT token
   * @param {Object} payload - Token payload
   * @param {number} expiresIn - Expiration time in seconds
   * @returns {string} JWT token
   */
  createToken(payload, expiresIn = 24 * 60 * 60) {
    const now = Math.floor(Date.now() / 1000);
    
    const tokenPayload = {
      iat: now,
      exp: now + expiresIn,
      ...payload
    };

    // Simple token creation for testing using Node.js Buffer
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
    const encodedPayload = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');
    const signature = Buffer.from(`${header}.${encodedPayload}.${this.secret}`).toString('base64');

    return `${header}.${encodedPayload}.${signature}`;
  }

  /**
   * Create expired JWT token
   * @param {Object} payload - Token payload
   * @returns {string} Expired JWT token
   */
  createExpiredToken(payload = { role: 'admin' }) {
    return this.createToken(payload, -3600); // Expired 1 hour ago
  }

  /**
   * Decode JWT token (for testing)
   * @param {string} token - JWT token
   * @returns {Object} Decoded token or null
   */
  decodeToken(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      return payload;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if token is expired
   * @param {string} token - JWT token
   * @returns {boolean} True if expired
   */
  isTokenExpired(token) {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) return true;

    return decoded.exp < Math.floor(Date.now() / 1000);
  }
}

/**
 * Create comprehensive admin authentication helper
 * @param {Object} options - Helper configuration
 * @returns {Object} Admin auth helper instance
 */
export default function createAdminAuth(options = {}) {
  const securityHelper = new SecurityTestHelper(options);
  const jwtHelper = new JWTTestHelper(options.jwtSecret);

  return {
    security: securityHelper,
    jwt: jwtHelper,

    /**
     * Generate complete admin login test data
     * @param {string} scenario - Test scenario type
     * @returns {Object} Test data for scenario
     */
    generateLoginTestData(scenario = 'valid') {
      switch (scenario) {
        case 'valid':
          return securityHelper.generateAdminCredentials();
        
        case 'invalid':
          return securityHelper.generateInvalidCredentials();
        
        case 'brute-force':
          return securityHelper.generateBruteForceAttempts();
        
        case 'session-security':
          return securityHelper.createSessionSecurityTests();
        
        case 'csrf':
          return securityHelper.generateCSRFTests();
        
        default:
          throw new Error(`Unknown login test scenario: ${scenario}`);
      }
    },

    /**
     * Create admin session for testing
     * @param {Object} sessionData - Session data
     * @returns {Object} Session with token
     */
    createTestSession(sessionData = {}) {
      const token = jwtHelper.createToken({
        role: 'admin',
        permissions: ['read', 'write', 'delete', 'admin'],
        ...sessionData
      });

      return {
        token,
        sessionId: generateTestId('session'),
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        ...sessionData
      };
    },

    /**
     * Validate admin session
     * @param {string} token - Session token
     * @returns {Object} Validation result
     */
    validateSession(token) {
      if (!token) {
        return { valid: false, error: 'No token provided' };
      }

      const decoded = jwtHelper.decodeToken(token);
      
      if (!decoded) {
        return { valid: false, error: 'Invalid token format' };
      }

      if (jwtHelper.isTokenExpired(token)) {
        return { valid: false, error: 'Token expired' };
      }

      if (decoded.role !== 'admin') {
        return { valid: false, error: 'Insufficient permissions' };
      }

      return {
        valid: true,
        payload: decoded
      };
    },

    /**
     * Test security headers
     * @param {Object} headers - Response headers
     * @returns {Object} Security validation results
     */
    testSecurityHeaders(headers) {
      return securityHelper.validateSecurityHeaders(headers);
    }
  };
}

export { SecurityTestHelper, JWTTestHelper };
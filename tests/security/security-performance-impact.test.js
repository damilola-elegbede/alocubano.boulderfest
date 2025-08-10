/**
 * Security Performance Impact Measurement Tests
 * 
 * Measures the performance overhead of all security measures
 * Validates <5% performance impact requirement from SPEC_04 Task 4.6
 * 
 * Test Categories:
 * - Rate limiting performance impact
 * - Input validation overhead
 * - Encryption/decryption performance
 * - Authentication processing time
 * - Security headers overhead
 * - Overall security middleware stack performance
 * 
 * Performance Requirements:
 * - Individual security measures: <3% overhead each
 * - Total security stack: <5% overhead
 * - Real-world scenario testing with concurrent users
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { performance } from 'perf_hooks';
import { createRequire } from 'module';
import crypto from 'crypto';

const require = createRequire(import.meta.url);
const httpMocks = require('node-mocks-http');

// Import security modules for testing
import { AdvancedRateLimiter } from '../../api/lib/security/rate-limiter.js';
import { sanitizeInput } from '../../api/lib/sql-security.js';
import { withSecurityHeaders } from '../../api/lib/security-headers.js';
import { createRateLimitMiddleware } from '../../middleware/rate-limit.js';

// Performance metrics collection
const PERFORMANCE_METRICS = {
  rateLimiting: {
    baseline: [],
    withSecurity: [],
    overhead: []
  },
  inputValidation: {
    baseline: [],
    withSecurity: [],
    overhead: []
  },
  encryption: {
    baseline: [],
    withSecurity: [],
    overhead: []
  },
  authentication: {
    baseline: [],
    withSecurity: [],
    overhead: []
  },
  securityHeaders: {
    baseline: [],
    withSecurity: [],
    overhead: []
  },
  totalStack: {
    baseline: [],
    withSecurity: [],
    overhead: []
  }
};

// Configuration
const TEST_CONFIG = {
  ITERATIONS: 1000,
  CONCURRENT_USERS: 50,
  MAX_OVERHEAD_PERCENT: 5,
  INDIVIDUAL_MAX_OVERHEAD_PERCENT: 3,
  PAYLOAD_SIZES: [1024, 4096, 16384], // Different payload sizes
  ATTACK_SIMULATION_SIZE: 10000 // For stress testing
};

describe('Security Performance Impact Analysis', () => {
  let rateLimiter;
  
  beforeAll(() => {
    console.log('🚀 Starting Security Performance Analysis');
    console.log(`Target: <${TEST_CONFIG.MAX_OVERHEAD_PERCENT}% total overhead`);
  });

  beforeEach(() => {
    rateLimiter = new AdvancedRateLimiter({
      enableRedis: false, // Memory for testing
      enableAnalytics: true
    });
  });

  afterEach(() => {
    if (rateLimiter) {
      rateLimiter.resetAnalytics();
    }
  });

  /**
   * 1. RATE LIMITING PERFORMANCE IMPACT
   */
  describe('Rate Limiting Performance Impact', () => {
    
    it('should measure rate limiting overhead for normal requests', async () => {
      const iterations = TEST_CONFIG.ITERATIONS;
      
      // Baseline: requests without rate limiting
      const baselineStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        const req = httpMocks.createRequest({
          method: 'POST',
          url: '/api/payments/create-checkout-session',
          ip: `192.168.1.${i % 256}`,
          body: { amount: 2500, currency: 'usd' }
        });
        
        // Simulate minimal processing
        const clientId = req.ip || 'unknown';
        const key = `general:${clientId}`;
        key.length; // Basic operation
      }
      const baselineTime = performance.now() - baselineStart;
      
      // With rate limiting
      const securityStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        const req = httpMocks.createRequest({
          method: 'POST',
          url: '/api/payments/create-checkout-session',
          ip: `192.168.1.${i % 256}`,
          body: { amount: 2500, currency: 'usd' }
        });
        
        await rateLimiter.checkRateLimit(req, 'payment');
      }
      const securityTime = performance.now() - securityStart;
      
      const overhead = ((securityTime - baselineTime) / baselineTime) * 100;
      
      PERFORMANCE_METRICS.rateLimiting.baseline.push(baselineTime);
      PERFORMANCE_METRICS.rateLimiting.withSecurity.push(securityTime);
      PERFORMANCE_METRICS.rateLimiting.overhead.push(overhead);
      
      console.log(`Rate Limiting Overhead: ${overhead.toFixed(2)}%`);
      expect(overhead).toBeLessThan(TEST_CONFIG.INDIVIDUAL_MAX_OVERHEAD_PERCENT);
    });

    it('should measure rate limiting under attack conditions', async () => {
      const attackIterations = TEST_CONFIG.ATTACK_SIMULATION_SIZE;
      
      // Baseline: high volume without rate limiting
      const baselineStart = performance.now();
      for (let i = 0; i < attackIterations; i++) {
        const req = httpMocks.createRequest({
          method: 'POST',
          url: '/api/admin/login',
          ip: `203.0.113.${i % 256}`,
          body: { password: `attack-${i}` }
        });
        
        // Basic processing simulation
        JSON.stringify(req.body);
      }
      const baselineTime = performance.now() - baselineStart;
      
      // With rate limiting under attack
      const securityStart = performance.now();
      for (let i = 0; i < attackIterations; i++) {
        const req = httpMocks.createRequest({
          method: 'POST',
          url: '/api/admin/login',
          ip: `203.0.113.${i % 256}`,
          body: { password: `attack-${i}` }
        });
        
        await rateLimiter.checkRateLimit(req, 'auth');
      }
      const securityTime = performance.now() - securityStart;
      
      const overhead = ((securityTime - baselineTime) / baselineTime) * 100;
      
      console.log(`Rate Limiting Under Attack Overhead: ${overhead.toFixed(2)}%`);
      
      // Should handle attacks efficiently
      expect(overhead).toBeLessThan(TEST_CONFIG.MAX_OVERHEAD_PERCENT);
      expect(securityTime).toBeLessThan(30000); // <30s for 10k requests
    });

    it('should measure concurrent rate limiting performance', async () => {
      const concurrentUsers = TEST_CONFIG.CONCURRENT_USERS;
      const requestsPerUser = 100;
      
      // Baseline: concurrent requests without rate limiting
      const baselineStart = performance.now();
      const baselinePromises = Array.from({ length: concurrentUsers }, (_, userId) =>
        Promise.all(Array.from({ length: requestsPerUser }, (_, reqId) => {
          const req = httpMocks.createRequest({
            method: 'GET',
            url: '/api/tickets',
            ip: `10.0.${Math.floor(userId / 256)}.${userId % 256}`
          });
          return Promise.resolve(JSON.stringify(req.ip));
        }))
      );
      await Promise.all(baselinePromises);
      const baselineTime = performance.now() - baselineStart;
      
      // With rate limiting
      const securityStart = performance.now();
      const securityPromises = Array.from({ length: concurrentUsers }, (_, userId) =>
        Promise.all(Array.from({ length: requestsPerUser }, async (_, reqId) => {
          const req = httpMocks.createRequest({
            method: 'GET',
            url: '/api/tickets',
            ip: `10.0.${Math.floor(userId / 256)}.${userId % 256}`
          });
          return await rateLimiter.checkRateLimit(req, 'general');
        }))
      );
      await Promise.all(securityPromises);
      const securityTime = performance.now() - securityStart;
      
      const overhead = ((securityTime - baselineTime) / baselineTime) * 100;
      
      console.log(`Concurrent Rate Limiting Overhead: ${overhead.toFixed(2)}%`);
      expect(overhead).toBeLessThan(TEST_CONFIG.MAX_OVERHEAD_PERCENT);
    });
  });

  /**
   * 2. INPUT VALIDATION PERFORMANCE IMPACT
   */
  describe('Input Validation Performance Impact', () => {
    
    it('should measure input sanitization overhead', () => {
      const testInputs = Array.from({ length: TEST_CONFIG.ITERATIONS }, (_, i) => ({
        email: `user${i}@example.com`,
        name: `Test User ${i}`,
        message: `This is a test message with <script>alert('${i}')</script> content`,
        data: `Data payload ${i} with potentially malicious content: ' OR 1=1 --`
      }));
      
      // Baseline: no validation
      const baselineStart = performance.now();
      testInputs.forEach(input => {
        JSON.stringify(input);
      });
      const baselineTime = performance.now() - baselineStart;
      
      // With input validation
      const securityStart = performance.now();
      testInputs.forEach(input => {
        const sanitized = {
          email: sanitizeInput(input.email),
          name: sanitizeInput(input.name),
          message: sanitizeInput(input.message),
          data: sanitizeInput(input.data)
        };
        JSON.stringify(sanitized);
      });
      const securityTime = performance.now() - securityStart;
      
      const overhead = ((securityTime - baselineTime) / baselineTime) * 100;
      
      PERFORMANCE_METRICS.inputValidation.baseline.push(baselineTime);
      PERFORMANCE_METRICS.inputValidation.withSecurity.push(securityTime);
      PERFORMANCE_METRICS.inputValidation.overhead.push(overhead);
      
      console.log(`Input Validation Overhead: ${overhead.toFixed(2)}%`);
      expect(overhead).toBeLessThan(TEST_CONFIG.INDIVIDUAL_MAX_OVERHEAD_PERCENT);
    });

    it('should measure validation with different payload sizes', () => {
      TEST_CONFIG.PAYLOAD_SIZES.forEach(size => {
        const largePayload = 'A'.repeat(size) + '<script>alert("xss")</script>';
        const iterations = Math.max(100, Math.floor(TEST_CONFIG.ITERATIONS / (size / 1024)));
        
        // Baseline
        const baselineStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          largePayload.length;
        }
        const baselineTime = performance.now() - baselineStart;
        
        // With validation
        const securityStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          sanitizeInput(largePayload);
        }
        const securityTime = performance.now() - securityStart;
        
        const overhead = ((securityTime - baselineTime) / baselineTime) * 100;
        
        console.log(`Input Validation (${size} bytes) Overhead: ${overhead.toFixed(2)}%`);
        expect(overhead).toBeLessThan(TEST_CONFIG.MAX_OVERHEAD_PERCENT);
      });
    });
  });

  /**
   * 3. ENCRYPTION PERFORMANCE IMPACT
   */
  describe('Encryption Performance Impact', () => {
    
    it('should measure symmetric encryption overhead', () => {
      const testData = Array.from({ length: TEST_CONFIG.ITERATIONS }, (_, i) => 
        `Sensitive data ${i}: user@example.com, card token tok_${i}`
      );
      
      // Baseline: no encryption
      const baselineStart = performance.now();
      testData.forEach(data => {
        Buffer.from(data, 'utf8').toString('base64');
      });
      const baselineTime = performance.now() - baselineStart;
      
      // With encryption
      const key = crypto.randomBytes(32);
      const securityStart = performance.now();
      testData.forEach(data => {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher('aes-256-cbc', key);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
      });
      const securityTime = performance.now() - securityStart;
      
      const overhead = ((securityTime - baselineTime) / baselineTime) * 100;
      
      PERFORMANCE_METRICS.encryption.baseline.push(baselineTime);
      PERFORMANCE_METRICS.encryption.withSecurity.push(securityTime);
      PERFORMANCE_METRICS.encryption.overhead.push(overhead);
      
      console.log(`Encryption Overhead: ${overhead.toFixed(2)}%`);
      expect(overhead).toBeLessThan(TEST_CONFIG.MAX_OVERHEAD_PERCENT);
    });

    it('should measure key derivation performance', () => {
      const passwords = Array.from({ length: 100 }, (_, i) => `password-${i}`);
      const salt = crypto.randomBytes(16);
      
      // Baseline: simple hashing
      const baselineStart = performance.now();
      passwords.forEach(password => {
        crypto.createHash('sha256').update(password).digest('hex');
      });
      const baselineTime = performance.now() - baselineStart;
      
      // With secure key derivation
      const securityStart = performance.now();
      passwords.forEach(password => {
        crypto.pbkdf2Sync(password, salt, 10000, 32, 'sha256');
      });
      const securityTime = performance.now() - securityStart;
      
      const overhead = ((securityTime - baselineTime) / baselineTime) * 100;
      
      console.log(`Key Derivation Overhead: ${overhead.toFixed(2)}%`);
      // Key derivation is intentionally slower for security
      expect(overhead).toBeGreaterThan(100); // Should be significantly slower
      expect(securityTime).toBeLessThan(5000); // But not too slow
    });

    it('should measure hashing performance for different algorithms', () => {
      const data = 'Test data for hashing performance measurement';
      const algorithms = ['md5', 'sha1', 'sha256', 'sha512'];
      const iterations = 10000;
      
      algorithms.forEach(algorithm => {
        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
          crypto.createHash(algorithm).update(data).digest('hex');
        }
        const time = performance.now() - start;
        
        console.log(`${algorithm.toUpperCase()} (${iterations} iterations): ${time.toFixed(2)}ms`);
        
        // All algorithms should complete reasonably quickly
        expect(time).toBeLessThan(1000); // <1s for 10k operations
      });
    });
  });

  /**
   * 4. AUTHENTICATION PERFORMANCE IMPACT
   */
  describe('Authentication Performance Impact', () => {
    
    it('should measure JWT token processing overhead', async () => {
      const jwt = require('jsonwebtoken');
      const secret = 'test-secret-key-32-characters-long';
      const iterations = TEST_CONFIG.ITERATIONS;
      
      // Generate test tokens
      const tokens = Array.from({ length: iterations }, (_, i) => 
        jwt.sign({ userId: `user${i}`, role: 'user' }, secret, { expiresIn: '1h' })
      );
      
      // Baseline: no verification
      const baselineStart = performance.now();
      tokens.forEach(token => {
        token.split('.').length; // Just check format
      });
      const baselineTime = performance.now() - baselineStart;
      
      // With JWT verification
      const securityStart = performance.now();
      tokens.forEach(token => {
        try {
          jwt.verify(token, secret);
        } catch (error) {
          // Handle invalid tokens
        }
      });
      const securityTime = performance.now() - securityStart;
      
      const overhead = ((securityTime - baselineTime) / baselineTime) * 100;
      
      PERFORMANCE_METRICS.authentication.baseline.push(baselineTime);
      PERFORMANCE_METRICS.authentication.withSecurity.push(securityTime);
      PERFORMANCE_METRICS.authentication.overhead.push(overhead);
      
      console.log(`JWT Authentication Overhead: ${overhead.toFixed(2)}%`);
      expect(overhead).toBeLessThan(TEST_CONFIG.MAX_OVERHEAD_PERCENT);
    });

    it('should measure TOTP validation performance', () => {
      const speakeasy = require('speakeasy');
      const iterations = 1000;
      
      // Generate test secrets and tokens
      const testData = Array.from({ length: iterations }, (_, i) => {
        const secret = speakeasy.generateSecret({ name: `User${i}` });
        const token = speakeasy.totp({
          secret: secret.base32,
          encoding: 'base32'
        });
        return { secret: secret.base32, token };
      });
      
      // Baseline: no validation
      const baselineStart = performance.now();
      testData.forEach(({ token }) => {
        parseInt(token, 10); // Basic parsing
      });
      const baselineTime = performance.now() - baselineStart;
      
      // With TOTP validation
      const securityStart = performance.now();
      testData.forEach(({ secret, token }) => {
        speakeasy.totp.verify({
          secret,
          encoding: 'base32',
          token,
          window: 1
        });
      });
      const securityTime = performance.now() - securityStart;
      
      const overhead = ((securityTime - baselineTime) / baselineTime) * 100;
      
      console.log(`TOTP Validation Overhead: ${overhead.toFixed(2)}%`);
      expect(overhead).toBeLessThan(TEST_CONFIG.MAX_OVERHEAD_PERCENT);
    });
  });

  /**
   * 5. SECURITY HEADERS PERFORMANCE IMPACT
   */
  describe('Security Headers Performance Impact', () => {
    
    it('should measure security headers overhead', async () => {
      const iterations = TEST_CONFIG.ITERATIONS;
      
      // Baseline: minimal headers
      const baselineStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        const req = httpMocks.createRequest({
          method: 'GET',
          url: '/api/tickets'
        });
        const res = httpMocks.createResponse();
        
        res.setHeader('Content-Type', 'application/json');
        res.status(200);
      }
      const baselineTime = performance.now() - baselineStart;
      
      // With security headers
      const securityStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        const req = httpMocks.createRequest({
          method: 'GET',
          url: '/api/tickets'
        });
        const res = httpMocks.createResponse();
        
        // Apply security headers
        res.setHeader('Content-Security-Policy', "default-src 'self'");
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Permissions-Policy', 'geolocation=(), microphone=()');
        res.setHeader('Content-Type', 'application/json');
        res.status(200);
      }
      const securityTime = performance.now() - securityStart;
      
      const overhead = ((securityTime - baselineTime) / baselineTime) * 100;
      
      PERFORMANCE_METRICS.securityHeaders.baseline.push(baselineTime);
      PERFORMANCE_METRICS.securityHeaders.withSecurity.push(securityTime);
      PERFORMANCE_METRICS.securityHeaders.overhead.push(overhead);
      
      console.log(`Security Headers Overhead: ${overhead.toFixed(2)}%`);
      expect(overhead).toBeLessThan(TEST_CONFIG.INDIVIDUAL_MAX_OVERHEAD_PERCENT);
    });
  });

  /**
   * 6. TOTAL SECURITY STACK PERFORMANCE
   */
  describe('Total Security Stack Performance Impact', () => {
    
    it('should measure complete security middleware stack', async () => {
      const iterations = 500; // Reduced for complex test
      
      // Baseline: minimal processing
      const baselineStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        const req = httpMocks.createRequest({
          method: 'POST',
          url: '/api/payments/create-checkout-session',
          ip: `192.168.1.${i % 256}`,
          body: {
            amount: 2500,
            currency: 'usd',
            customerEmail: `user${i}@example.com`
          }
        });
        const res = httpMocks.createResponse();
        
        // Minimal processing
        JSON.stringify(req.body);
        res.status(200).json({ success: true });
      }
      const baselineTime = performance.now() - baselineStart;
      
      // With full security stack
      const securityStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        const req = httpMocks.createRequest({
          method: 'POST',
          url: '/api/payments/create-checkout-session',
          ip: `192.168.1.${i % 256}`,
          body: {
            amount: 2500,
            currency: 'usd',
            customerEmail: `user${i}@example.com`
          }
        });
        const res = httpMocks.createResponse();
        
        // Apply full security stack
        await rateLimiter.checkRateLimit(req, 'payment');
        
        // Input validation
        const sanitizedBody = {
          amount: parseInt(req.body.amount),
          currency: sanitizeInput(req.body.currency),
          customerEmail: sanitizeInput(req.body.customerEmail)
        };
        
        // Security headers
        res.setHeader('Content-Security-Policy', "default-src 'self'");
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        
        res.status(200).json({ success: true, data: sanitizedBody });
      }
      const securityTime = performance.now() - securityStart;
      
      const overhead = ((securityTime - baselineTime) / baselineTime) * 100;
      
      PERFORMANCE_METRICS.totalStack.baseline.push(baselineTime);
      PERFORMANCE_METRICS.totalStack.withSecurity.push(securityTime);
      PERFORMANCE_METRICS.totalStack.overhead.push(overhead);
      
      console.log(`Total Security Stack Overhead: ${overhead.toFixed(2)}%`);
      expect(overhead).toBeLessThan(TEST_CONFIG.MAX_OVERHEAD_PERCENT);
    });

    it('should measure real-world scenario performance', async () => {
      const scenarios = [
        {
          name: 'Payment Processing',
          endpoint: '/api/payments/create-checkout-session',
          method: 'POST',
          rateLimitType: 'payment'
        },
        {
          name: 'Admin Authentication',
          endpoint: '/api/admin/login',
          method: 'POST',
          rateLimitType: 'auth'
        },
        {
          name: 'Ticket Validation',
          endpoint: '/api/tickets/validate',
          method: 'POST',
          rateLimitType: 'qrValidation'
        },
        {
          name: 'API Data Retrieval',
          endpoint: '/api/tickets',
          method: 'GET',
          rateLimitType: 'general'
        }
      ];
      
      for (const scenario of scenarios) {
        const iterations = 200;
        
        // Baseline
        const baselineStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          const req = httpMocks.createRequest({
            method: scenario.method,
            url: scenario.endpoint,
            ip: `10.0.${i % 256}.1`
          });
          JSON.stringify(req.url);
        }
        const baselineTime = performance.now() - baselineStart;
        
        // With security
        const securityStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          const req = httpMocks.createRequest({
            method: scenario.method,
            url: scenario.endpoint,
            ip: `10.0.${i % 256}.1`
          });
          
          await rateLimiter.checkRateLimit(req, scenario.rateLimitType);
        }
        const securityTime = performance.now() - securityStart;
        
        const overhead = ((securityTime - baselineTime) / baselineTime) * 100;
        
        console.log(`${scenario.name} Security Overhead: ${overhead.toFixed(2)}%`);
        expect(overhead).toBeLessThan(TEST_CONFIG.MAX_OVERHEAD_PERCENT);
      }
    });
  });

  /**
   * 7. PERFORMANCE METRICS SUMMARY
   */
  describe('Performance Metrics Summary', () => {
    
    it('should generate comprehensive performance report', () => {
      const calculateStats = (values) => {
        if (values.length === 0) return { avg: 0, min: 0, max: 0 };
        return {
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values)
        };
      };
      
      const performanceReport = {
        timestamp: new Date().toISOString(),
        testConfiguration: TEST_CONFIG,
        results: {
          rateLimiting: {
            ...calculateStats(PERFORMANCE_METRICS.rateLimiting.overhead),
            status: PERFORMANCE_METRICS.rateLimiting.overhead.every(o => o < TEST_CONFIG.INDIVIDUAL_MAX_OVERHEAD_PERCENT) ? 'PASS' : 'FAIL'
          },
          inputValidation: {
            ...calculateStats(PERFORMANCE_METRICS.inputValidation.overhead),
            status: PERFORMANCE_METRICS.inputValidation.overhead.every(o => o < TEST_CONFIG.INDIVIDUAL_MAX_OVERHEAD_PERCENT) ? 'PASS' : 'FAIL'
          },
          encryption: {
            ...calculateStats(PERFORMANCE_METRICS.encryption.overhead),
            status: PERFORMANCE_METRICS.encryption.overhead.every(o => o < TEST_CONFIG.MAX_OVERHEAD_PERCENT) ? 'PASS' : 'FAIL'
          },
          authentication: {
            ...calculateStats(PERFORMANCE_METRICS.authentication.overhead),
            status: PERFORMANCE_METRICS.authentication.overhead.every(o => o < TEST_CONFIG.MAX_OVERHEAD_PERCENT) ? 'PASS' : 'FAIL'
          },
          securityHeaders: {
            ...calculateStats(PERFORMANCE_METRICS.securityHeaders.overhead),
            status: PERFORMANCE_METRICS.securityHeaders.overhead.every(o => o < TEST_CONFIG.INDIVIDUAL_MAX_OVERHEAD_PERCENT) ? 'PASS' : 'FAIL'
          },
          totalStack: {
            ...calculateStats(PERFORMANCE_METRICS.totalStack.overhead),
            status: PERFORMANCE_METRICS.totalStack.overhead.every(o => o < TEST_CONFIG.MAX_OVERHEAD_PERCENT) ? 'PASS' : 'FAIL'
          }
        }
      };
      
      // Log comprehensive report
      console.log('\n📊 SECURITY PERFORMANCE IMPACT REPORT');
      console.log('=====================================');
      console.log(`Test Date: ${performanceReport.timestamp}`);
      console.log(`Target Overhead: <${TEST_CONFIG.MAX_OVERHEAD_PERCENT}%`);
      console.log(`Individual Components: <${TEST_CONFIG.INDIVIDUAL_MAX_OVERHEAD_PERCENT}%`);
      
      console.log('\n🔍 DETAILED RESULTS:');
      Object.entries(performanceReport.results).forEach(([component, stats]) => {
        console.log(`${component.toUpperCase()}:`);
        console.log(`  Average Overhead: ${stats.avg.toFixed(2)}%`);
        console.log(`  Min/Max: ${stats.min.toFixed(2)}% / ${stats.max.toFixed(2)}%`);
        console.log(`  Status: ${stats.status}`);
      });
      
      // All components should pass performance requirements
      Object.values(performanceReport.results).forEach(result => {
        expect(result.status).toBe('PASS');
      });
      
      // Total stack should be within limits
      const totalStackOverhead = performanceReport.results.totalStack.avg;
      expect(totalStackOverhead).toBeLessThan(TEST_CONFIG.MAX_OVERHEAD_PERCENT);
      
      console.log(`\n✅ OVERALL PERFORMANCE: ${totalStackOverhead.toFixed(2)}% overhead (Target: <${TEST_CONFIG.MAX_OVERHEAD_PERCENT}%)`);
    });
  });
});
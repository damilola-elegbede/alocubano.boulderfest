/**
 * Advanced Rate Limiter Tests
 * 
 * Tests the Redis-backed distributed rate limiting system
 * Validates performance, functionality, and edge cases
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AdvancedRateLimiter, getRateLimiter } from '../../api/lib/security/rate-limiter.js';
import {
  withRateLimit,
  paymentRateLimit,
  authRateLimit,
  qrValidationRateLimit
} from '../../middleware/rate-limit.js';

describe('Advanced Rate Limiter', () => {
  let rateLimiter;
  let mockReq;
  let mockRes;
  
  beforeEach(() => {
    // Create fresh instance for each test
    rateLimiter = new AdvancedRateLimiter({
      enableRedis: false, // Use memory fallback for tests
      enableAnalytics: true
    });
    
    // Reset analytics
    rateLimiter.resetAnalytics();
    
    // Mock request object
    mockReq = {
      headers: {
        'x-forwarded-for': '203.0.113.100', // Use a public IP that won't be whitelisted
        'user-agent': 'test-agent',
        'x-device-id': 'test-device-123'
      },
      user: { id: 'user123' },
      method: 'POST',
      url: '/api/test'
    };
    
    // Mock response object
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
      headersSent: false
    };
  });
  
  afterEach(async () => {
    if (rateLimiter) {
      await rateLimiter.close();
    }
  });
  
  describe('Performance Requirements', () => {
    it('should process requests within 5ms performance target', async () => {
      const iterations = 100;
      const times = [];
      
      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        await rateLimiter.checkRateLimit(mockReq, 'general');
        const duration = Date.now() - start;
        times.push(duration);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      const p95Time = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];
      
      console.log(`Performance stats: avg=${avgTime}ms, max=${maxTime}ms, p95=${p95Time}ms`);
      
      // Performance requirements
      expect(avgTime).toBeLessThan(5);
      expect(p95Time).toBeLessThan(10); // Allow some variance for p95
      expect(maxTime).toBeLessThan(20); // Reasonable upper bound
    });
    
    it('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = 50;
      const start = Date.now();
      
      const promises = Array.from({ length: concurrentRequests }, (_, i) => {
        const req = {
          ...mockReq,
          headers: {
            ...mockReq.headers,
            'x-forwarded-for': `192.168.1.${100 + i % 10}` // Vary IPs
          }
        };
        return rateLimiter.checkRateLimit(req, 'general');
      });
      
      const results = await Promise.all(promises);
      const totalTime = Date.now() - start;
      const avgTimePerRequest = totalTime / concurrentRequests;
      
      console.log(`Concurrent processing: ${totalTime}ms total, ${avgTimePerRequest}ms per request`);
      
      // Should process all requests and most should be allowed
      expect(results).toHaveLength(concurrentRequests);
      expect(results.filter(r => r.allowed).length).toBeGreaterThan(concurrentRequests * 0.8);
      expect(avgTimePerRequest).toBeLessThan(5);
    });
  });
  
  describe('Core Functionality', () => {
    it('should identify clients correctly', () => {
      // IP-based identification
      const ipClient = rateLimiter.getClientId(mockReq, 'ip');
      expect(ipClient).toBe('ip:203.0.113.100');
      
      // User-based identification
      const userClient = rateLimiter.getClientId(mockReq, 'user');
      expect(userClient).toBe('user:user123');
      
      // Device-based identification
      const deviceClient = rateLimiter.getClientId(mockReq, 'device');
      expect(deviceClient).toBe('device:test-device-123');
    });
    
    it('should enforce rate limits correctly', async () => {
      // Allow requests within limit
      for (let i = 0; i < 5; i++) {
        const result = await rateLimiter.checkRateLimit(mockReq, 'payment');
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4 - i); // Should decrease with each request
      }
      
      // Block requests exceeding limit
      const result = await rateLimiter.checkRateLimit(mockReq, 'payment');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('rate_limit_exceeded');
      expect(typeof result.retryAfter).toBe('number');
    });
    
    it('should track analytics correctly', async () => {
      const initialAnalytics = rateLimiter.getAnalytics();
      expect(initialAnalytics.blocked).toBe(0);
      expect(initialAnalytics.allowed).toBe(0);
      
      // Generate some allowed requests
      for (let i = 0; i < 3; i++) {
        await rateLimiter.checkRateLimit(mockReq, 'general');
      }
      
      // Generate a blocked request (exceed payment limits)
      for (let i = 0; i < 6; i++) {
        await rateLimiter.checkRateLimit(mockReq, 'payment');
      }
      
      const finalAnalytics = rateLimiter.getAnalytics();
      expect(finalAnalytics.allowed).toBeGreaterThan(0);
      expect(finalAnalytics.blocked).toBeGreaterThan(0);
    });
  });
  
  describe('Whitelist/Blacklist', () => {
    it('should allow whitelisted IPs', async () => {
      // Add IP to whitelist
      await rateLimiter.addToWhitelist('203.0.113.100', 'test');
      
      const result = await rateLimiter.checkRateLimit(mockReq, 'payment');
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('whitelisted');
    });
    
    it('should block blacklisted IPs', async () => {
      // Add IP to blacklist
      await rateLimiter.addToBlacklist('203.0.113.100', 'test');
      
      const result = await rateLimiter.checkRateLimit(mockReq, 'general');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('blacklisted');
    });
  });
  
  describe('Progressive Penalties', () => {
    it('should apply penalties for repeated violations', async () => {
      // Exceed limits multiple times to trigger penalties
      for (let violation = 0; violation < 3; violation++) {
        // Reset to new time window
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Exceed limit to trigger penalty
        for (let i = 0; i < 7; i++) {
          await rateLimiter.checkRateLimit(mockReq, 'auth');
        }
        
        // Check penalty multiplier increases
        const multiplier = await rateLimiter.getPenaltyMultiplier('ip:203.0.113.100', 'auth');
        expect(multiplier).toBeGreaterThan(1);
      }
    });
  });
  
  describe('Sliding Window Algorithm', () => {
    it('should properly implement sliding window', async () => {
      // Fill up most of the window
      for (let i = 0; i < 4; i++) {
        const result = await rateLimiter.checkRateLimit(mockReq, 'payment');
        expect(result.allowed).toBe(true);
      }
      
      // Should have one request left
      const almostFull = await rateLimiter.checkRateLimit(mockReq, 'payment');
      expect(almostFull.allowed).toBe(true);
      expect(almostFull.remaining).toBe(0);
      
      // Should be blocked
      const blocked = await rateLimiter.checkRateLimit(mockReq, 'payment');
      expect(blocked.allowed).toBe(false);
    });
  });
  
  describe('Endpoint-Specific Configurations', () => {
    it('should apply different limits for different endpoints', async () => {
      // Payment endpoint: 5 req/min
      for (let i = 0; i < 5; i++) {
        const result = await rateLimiter.checkRateLimit(mockReq, 'payment');
        expect(result.allowed).toBe(true);
      }
      const paymentBlocked = await rateLimiter.checkRateLimit(mockReq, 'payment');
      expect(paymentBlocked.allowed).toBe(false);
      
      // General endpoint should still work (different counter)
      const generalAllowed = await rateLimiter.checkRateLimit(mockReq, 'general');
      expect(generalAllowed.allowed).toBe(true);
    });
    
    it('should handle QR validation endpoint correctly', async () => {
      const deviceReq = {
        ...mockReq,
        headers: {
          ...mockReq.headers,
          'x-device-id': 'scanner-device-456'
        }
      };
      
      // QR validation: 100 req/min per device
      for (let i = 0; i < 50; i++) {
        const result = await rateLimiter.checkRateLimit(deviceReq, 'qrValidation', { clientType: 'device' });
        expect(result.allowed).toBe(true);
      }
    });
  });
  
  describe('Error Handling', () => {
    it('should fail open on errors', async () => {
      // Mock an error in the rate limiter
      const originalCheckSlidingWindow = rateLimiter.checkSlidingWindow;
      rateLimiter.checkSlidingWindow = vi.fn().mockRejectedValue(new Error('Test error'));
      
      const result = await rateLimiter.checkRateLimit(mockReq, 'general');
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('error_fallback');
      
      // Restore original method
      rateLimiter.checkSlidingWindow = originalCheckSlidingWindow;
    });
  });
});

describe('Rate Limiting Middleware', () => {
  let mockNext;
  let middlewareReq;
  let middlewareRes;
  
  beforeEach(() => {
    mockNext = vi.fn();
    
    // Mock response object
    middlewareRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
      headersSent: false
    };
    
    // Mock request
    middlewareReq = {
      headers: { 'x-forwarded-for': '192.168.1.200' },
      method: 'POST',
      url: '/api/test'
    };
  });
  
  describe('Payment Rate Limiting', () => {
    it('should apply payment rate limits', async () => {
      const middleware = paymentRateLimit();
      
      // Should allow first few requests
      for (let i = 0; i < 5; i++) {
        await middleware(middlewareReq, middlewareRes, mockNext);
        expect(mockNext).toHaveBeenCalledWith();
        mockNext.mockClear();
      }
      
      // Should block subsequent requests
      await middleware(middlewareReq, middlewareRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });
  
  describe('withRateLimit Wrapper', () => {
    it('should protect handlers correctly', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ success: true });
      const protectedHandler = withRateLimit(mockHandler, 'general');
      
      // Should call handler when rate limit passes
      const result = await protectedHandler(middlewareReq, middlewareRes);
      expect(mockHandler).toHaveBeenCalledWith(middlewareReq, middlewareRes);
    });
    
    it('should block handlers when rate limit exceeded', async () => {
      const mockHandler = vi.fn();
      const protectedHandler = withRateLimit(mockHandler, 'payment');
      
      // Exceed rate limit first
      for (let i = 0; i < 6; i++) {
        await protectedHandler({ ...middlewareReq, headers: { 'x-forwarded-for': '192.168.1.201' }}, middlewareRes);
      }
      
      // Handler should not be called on last request
      const callCount = mockHandler.mock.calls.length;
      expect(callCount).toBeLessThan(6);
    });
  });
  
  describe('Performance in Middleware', () => {
    it('should add minimal overhead to requests', async () => {
      const middleware = paymentRateLimit();
      const iterations = 20;
      const times = [];
      
      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        await middleware(middlewareReq, middlewareRes, mockNext);
        const duration = Date.now() - start;
        times.push(duration);
        
        // Reset for next iteration
        mockNext.mockClear();
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      console.log(`Middleware overhead: ${avgTime}ms average`);
      
      expect(avgTime).toBeLessThan(8); // Allow slight overhead for middleware
    });
  });
});

describe('Integration Tests', () => {
  it('should work with error handling middleware', async () => {
    const middleware = authRateLimit();
    let capturedError = null;
    
    const mockNext = (error) => {
      capturedError = error;
    };
    
    const testReq = {
      headers: { 'x-forwarded-for': '192.168.1.202' },
      method: 'POST',
      url: '/api/auth'
    };
    
    const testRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
      headersSent: false
    };
    
    // Exceed auth limits
    for (let i = 0; i < 7; i++) {
      await middleware(testReq, testRes, mockNext);
    }
    
    expect(capturedError).toBeTruthy();
    expect(capturedError.type).toBe('RateLimitError');
  });
});
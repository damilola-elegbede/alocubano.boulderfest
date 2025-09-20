/**
 * Auth Service Concurrency Tests
 *
 * Tests the Promise-based singleton initialization pattern to ensure:
 * 1. Multiple concurrent calls to ensureInitialized() return the same promise
 * 2. Race conditions are prevented during initialization
 * 3. Only one initialization occurs even with 10+ concurrent requests
 * 4. All concurrent callers get the same initialized instance
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthService } from '../../../lib/auth-service.js';

describe('Auth Service Concurrency Tests', () => {
  let authService;
  let originalEnv;

  beforeEach(() => {
    // Backup original environment
    originalEnv = { ...process.env };

    // Create fresh auth service instance for each test
    authService = new AuthService();

    // Set required environment variables for initialization
    process.env.ADMIN_SECRET = 'a'.repeat(32); // 32 character secret
    process.env.ADMIN_SESSION_DURATION = '3600000'; // 1 hour
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;

    // Reset service state
    if (authService) {
      authService.initialized = false;
      authService.initializationPromise = null;
      authService.sessionSecret = null;
      authService.sessionDuration = null;
    }
  });

  describe('Concurrent Initialization - Promise Caching', () => {
    it('should cache initialization promise for concurrent calls', async () => {
      // Verify service starts uninitialized
      expect(authService.initialized).toBe(false);
      expect(authService.initializationPromise).toBe(null);

      // Make 5 concurrent calls to ensureInitialized()
      const promise1 = authService.ensureInitialized();
      const promise2 = authService.ensureInitialized();
      const promise3 = authService.ensureInitialized();
      const promise4 = authService.ensureInitialized();
      const promise5 = authService.ensureInitialized();

      // Verify initialization promise was created after first call
      expect(authService.initializationPromise).not.toBe(null);

      // Wait for all promises to resolve
      const results = await Promise.all([promise1, promise2, promise3, promise4, promise5]);

      // All should return the same auth service instance
      results.forEach(result => {
        expect(result).toBe(authService);
        expect(result.initialized).toBe(true);
        expect(result.sessionSecret).toBe('a'.repeat(32));
      });
    });

    it('should handle 15+ concurrent initialization requests correctly', async () => {
      const concurrentCount = 15;
      const promises = [];

      // Create 15 concurrent calls
      for (let i = 0; i < concurrentCount; i++) {
        promises.push(authService.ensureInitialized());
      }

      // Verify initialization promise exists
      expect(authService.initializationPromise).not.toBe(null);

      // Wait for all to complete
      const results = await Promise.all(promises);

      // Verify all results are the same instance and properly initialized
      results.forEach(result => {
        expect(result).toBe(authService);
        expect(result.initialized).toBe(true);
        expect(result.sessionSecret).toBe('a'.repeat(32));
        expect(result.sessionDuration).toBe(3600000);
      });
    });
  });

  describe('Race Condition Prevention', () => {
    it('should prevent race conditions by ensuring only one initialization occurs', async () => {
      // Spy on the internal initialization method
      const initSpy = vi.spyOn(authService, '_performInitialization');

      // Create 10 concurrent calls
      const promises = Array.from({ length: 10 }, () => authService.ensureInitialized());

      // Wait for all to complete
      const results = await Promise.all(promises);

      // Verify _performInitialization was called exactly once
      expect(initSpy).toHaveBeenCalledTimes(1);

      // Verify all results are the same initialized instance
      results.forEach(result => {
        expect(result).toBe(authService);
        expect(result.initialized).toBe(true);
      });

      initSpy.mockRestore();
    });

    it('should handle initialization failure and allow retry', async () => {
      // Force initialization to fail by removing required environment variable
      delete process.env.ADMIN_SECRET;

      // Make concurrent calls that should all fail
      const promises = Array.from({ length: 5 }, () => authService.ensureInitialized());

      // All should reject with the same error
      await Promise.all(promises.map(async (promise) => {
        await expect(promise).rejects.toThrow('ADMIN_SECRET not configured');
      }));

      // Verify service remains uninitialized and promise is cleared
      expect(authService.initialized).toBe(false);
      expect(authService.initializationPromise).toBe(null);

      // Restore environment and verify retry works
      process.env.ADMIN_SECRET = 'b'.repeat(32);

      const retryResult = await authService.ensureInitialized();
      expect(retryResult.initialized).toBe(true);
      expect(retryResult.sessionSecret).toBe('b'.repeat(32));
    });
  });

  describe('Fast Path Optimization', () => {
    it('should use fast path for subsequent calls after initialization', async () => {
      // Initialize the service first
      await authService.ensureInitialized();
      expect(authService.initialized).toBe(true);

      // Spy on _performInitialization to ensure it's not called again
      const initSpy = vi.spyOn(authService, '_performInitialization');

      // Make multiple concurrent calls after initialization
      const promises = Array.from({ length: 8 }, () => authService.ensureInitialized());
      const results = await Promise.all(promises);

      // _performInitialization should not have been called (fast path used)
      expect(initSpy).not.toHaveBeenCalled();

      // All should return the same initialized instance immediately
      results.forEach(result => {
        expect(result).toBe(authService);
        expect(result.initialized).toBe(true);
      });

      initSpy.mockRestore();
    });

    it('should return same instance synchronously when already initialized', async () => {
      // Initialize first
      await authService.ensureInitialized();

      // Subsequent calls should return the same instance immediately
      const result1 = authService.ensureInitialized();
      const result2 = authService.ensureInitialized();
      const result3 = authService.ensureInitialized();

      // These should all be promises that resolve to the same instance
      expect(result1).toBeInstanceOf(Promise);
      expect(result2).toBeInstanceOf(Promise);
      expect(result3).toBeInstanceOf(Promise);

      const [resolved1, resolved2, resolved3] = await Promise.all([result1, result2, result3]);

      expect(resolved1).toBe(authService);
      expect(resolved2).toBe(authService);
      expect(resolved3).toBe(authService);
    });
  });

  describe('Concurrent Access to Service Methods', () => {
    it('should handle concurrent method calls that trigger ensureInitialized()', async () => {
      // Test concurrent calls to methods that call ensureInitialized internally
      const promises = [
        authService.verifyPassword('testpassword'),
        authService.createSessionToken('admin1'),
        authService.createSessionCookie('token123'),
        authService.verifySessionToken('invalidtoken'),
        authService.verifyPassword('anotherpassword')
      ];

      // All should complete without errors (though some may return false/invalid results)
      const results = await Promise.all(promises);

      // Verify service is initialized after all operations
      expect(authService.initialized).toBe(true);

      // Results structure verification (not testing business logic, just concurrency)
      expect(results).toHaveLength(5);
      expect(typeof results[0]).toBe('boolean'); // verifyPassword result
      expect(typeof results[1]).toBe('string'); // createSessionToken result
      expect(typeof results[2]).toBe('string'); // createSessionCookie result
      expect(typeof results[3]).toBe('object'); // verifySessionToken result
      expect(typeof results[4]).toBe('boolean'); // verifyPassword result
    });

    it('should maintain consistency during concurrent password verification', async () => {
      // Set up test password
      process.env.TEST_ADMIN_PASSWORD = 'testpass123';

      // Make multiple concurrent password verification calls
      const promises = Array.from({ length: 12 }, () =>
        authService.verifyPassword('testpass123')
      );

      const results = await Promise.all(promises);

      // All should return true consistently
      results.forEach(result => {
        expect(result).toBe(true);
      });

      // Service should be properly initialized
      expect(authService.initialized).toBe(true);
    });
  });

  describe('Stress Testing - High Concurrency', () => {
    it('should handle 25+ concurrent initialization requests without issues', async () => {
      const concurrentCount = 25;
      const startTime = Date.now();

      // Create high-concurrency scenario
      const promises = Array.from({ length: concurrentCount }, (_, index) =>
        authService.ensureInitialized().then(result => ({ index, result }))
      );

      const results = await Promise.all(promises);
      const endTime = Date.now();

      // Verify all completed successfully
      expect(results).toHaveLength(concurrentCount);

      results.forEach(({ index, result }) => {
        expect(result).toBe(authService);
        expect(result.initialized).toBe(true);
      });

      // Performance check - should complete reasonably quickly
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

      console.log(`✅ Handled ${concurrentCount} concurrent requests in ${duration}ms`);
    });

    it('should handle mixed concurrent operations during initialization', async () => {
      // Mix of different operations that all trigger ensureInitialized
      const directInitPromises = Array.from({ length: 5 }, () => authService.ensureInitialized());
      const methodCallPromises = [
        ...Array.from({ length: 3 }, () => authService.verifyPassword('test')),
        ...Array.from({ length: 3 }, () => authService.createSessionToken()),
        ...Array.from({ length: 3 }, () => authService.verifySessionToken('invalid'))
      ];

      // Execute direct init calls and method calls concurrently
      const [initResults, methodResults] = await Promise.all([
        Promise.all(directInitPromises),
        Promise.all(methodCallPromises)
      ]);

      // Verify service is properly initialized
      expect(authService.initialized).toBe(true);

      // All direct initialization calls should return the auth service instance
      initResults.forEach(result => {
        expect(result).toBe(authService);
      });

      // Method calls should complete successfully (different return types)
      expect(methodResults).toHaveLength(9);
      expect(methodResults.slice(0, 3).every(result => typeof result === 'boolean')).toBe(true); // verifyPassword
      expect(methodResults.slice(3, 6).every(result => typeof result === 'string')).toBe(true); // createSessionToken
      expect(methodResults.slice(6, 9).every(result => typeof result === 'object' && 'valid' in result)).toBe(true); // verifySessionToken

      console.log('✅ Successfully handled mixed concurrent operations');
    });
  });

  describe('Error Handling in Concurrent Scenarios', () => {
    it('should handle concurrent calls when environment is misconfigured', async () => {
      // Set invalid environment (secret too short)
      process.env.ADMIN_SECRET = 'short';

      const promises = Array.from({ length: 8 }, () => authService.ensureInitialized());

      // All should reject with the same error
      for (const promise of promises) {
        await expect(promise).rejects.toThrow('ADMIN_SECRET must be at least 32 characters long');
      }

      // Service should remain uninitialized
      expect(authService.initialized).toBe(false);
      expect(authService.initializationPromise).toBe(null);
    });

    it('should clear initialization promise on error to allow retry', async () => {
      // First attempt with bad config
      process.env.ADMIN_SECRET = 'bad';

      const failingPromises = Array.from({ length: 3 }, () => authService.ensureInitialized());

      for (const promise of failingPromises) {
        await expect(promise).rejects.toThrow();
      }

      expect(authService.initializationPromise).toBe(null);

      // Fix config and retry
      process.env.ADMIN_SECRET = 'c'.repeat(32);

      const retryPromises = Array.from({ length: 3 }, () => authService.ensureInitialized());
      const retryResults = await Promise.all(retryPromises);

      retryResults.forEach(result => {
        expect(result).toBe(authService);
        expect(result.initialized).toBe(true);
      });
    });
  });
});
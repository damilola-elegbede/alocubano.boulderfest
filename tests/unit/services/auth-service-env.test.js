/**
 * Unit Tests for AuthService Environment Variable Handling
 * Tests critical env var validation and promise-based initialization patterns
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthService } from '../../../lib/auth-service.js';

describe('AuthService Environment Variable Handling', () => {
  let originalEnv;
  let authService;

  beforeEach(() => {
    // Backup original environment
    originalEnv = { ...process.env };

    // Create fresh AuthService instance for each test
    authService = new AuthService();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('ADMIN_SECRET Validation', () => {
    it('should throw error when ADMIN_SECRET is missing', async () => {
      // Remove ADMIN_SECRET from environment
      delete process.env.ADMIN_SECRET;

      await expect(authService.ensureInitialized())
        .rejects
        .toThrow('❌ FATAL: ADMIN_SECRET not configured');

      // Service should remain uninitialized
      expect(authService.initialized).toBe(false);
      expect(authService.sessionSecret).toBeNull();
    });

    it('should throw error when ADMIN_SECRET is too short (<32 chars)', async () => {
      // Set ADMIN_SECRET that is too short
      process.env.ADMIN_SECRET = 'short_secret_31_characters_long'; // 31 chars

      await expect(authService.ensureInitialized())
        .rejects
        .toThrow('ADMIN_SECRET must be at least 32 characters long');

      // Service should remain uninitialized
      expect(authService.initialized).toBe(false);
      // Note: sessionSecret gets set before validation, so it contains the invalid value
      expect(authService.sessionSecret).toBe('short_secret_31_characters_long');
    });

    it('should accept ADMIN_SECRET with exactly 32 characters', async () => {
      // Set ADMIN_SECRET with exactly 32 characters
      process.env.ADMIN_SECRET = 'valid_32_character_admin_secret!'; // 32 chars

      await expect(authService.ensureInitialized()).resolves.toBe(authService);

      // Service should be initialized
      expect(authService.initialized).toBe(true);
      expect(authService.sessionSecret).toBe('valid_32_character_admin_secret!');
    });

    it('should accept ADMIN_SECRET longer than 32 characters', async () => {
      // Set ADMIN_SECRET longer than 32 characters
      process.env.ADMIN_SECRET = 'very_long_admin_secret_that_is_definitely_more_than_32_characters';

      await expect(authService.ensureInitialized()).resolves.toBe(authService);

      // Service should be initialized
      expect(authService.initialized).toBe(true);
      expect(authService.sessionSecret).toBe('very_long_admin_secret_that_is_definitely_more_than_32_characters');
    });
  });

  describe('ADMIN_SESSION_DURATION Parsing', () => {
    beforeEach(() => {
      // Set valid ADMIN_SECRET for all session duration tests
      process.env.ADMIN_SECRET = 'valid_32_character_admin_secret_key';
    });

    it('should parse ADMIN_SESSION_DURATION correctly when set', async () => {
      process.env.ADMIN_SESSION_DURATION = '7200000'; // 2 hours in milliseconds

      await authService.ensureInitialized();

      expect(authService.sessionDuration).toBe(7200000);
    });

    it('should use default session duration when ADMIN_SESSION_DURATION is not set', async () => {
      delete process.env.ADMIN_SESSION_DURATION;

      await authService.ensureInitialized();

      // Default should be 3600000ms (1 hour)
      expect(authService.sessionDuration).toBe(3600000);
    });

    it('should parse ADMIN_SESSION_DURATION from string to number', async () => {
      process.env.ADMIN_SESSION_DURATION = '1800000'; // 30 minutes

      await authService.ensureInitialized();

      expect(authService.sessionDuration).toBe(1800000);
      expect(typeof authService.sessionDuration).toBe('number');
    });

    it('should handle ADMIN_SESSION_DURATION with leading/trailing whitespace', async () => {
      process.env.ADMIN_SESSION_DURATION = '  900000  '; // 15 minutes with whitespace

      await authService.ensureInitialized();

      expect(authService.sessionDuration).toBe(900000);
    });

    it('should handle invalid ADMIN_SESSION_DURATION gracefully', async () => {
      process.env.ADMIN_SESSION_DURATION = 'invalid_number';

      await authService.ensureInitialized();

      // parseInt('invalid_number') returns NaN, now defaults to 3600000 for robustness
      expect(authService.sessionDuration).toBe(3600000);
    });

    it('should use empty string as fallback when ADMIN_SESSION_DURATION is undefined', async () => {
      delete process.env.ADMIN_SESSION_DURATION;

      await authService.ensureInitialized();

      // parseInt("3600000") should give 3600000
      expect(authService.sessionDuration).toBe(3600000);
    });
  });

  describe('Promise-based Initialization Error Handling', () => {
    it('should clear promise on error to allow retry after fixing env vars', async () => {
      // First attempt with missing ADMIN_SECRET
      delete process.env.ADMIN_SECRET;

      await expect(authService.ensureInitialized())
        .rejects
        .toThrow('❌ FATAL: ADMIN_SECRET not configured');

      // Promise should be cleared to allow retry
      expect(authService.initializationPromise).toBeNull();
      expect(authService.initialized).toBe(false);

      // Fix the environment variable
      process.env.ADMIN_SECRET = 'fixed_32_character_admin_secret_key';

      // Second attempt should succeed
      await expect(authService.ensureInitialized()).resolves.toBe(authService);
      expect(authService.initialized).toBe(true);
      expect(authService.sessionSecret).toBe('fixed_32_character_admin_secret_key');
    });

    it('should clear promise on ADMIN_SECRET length error for retry', async () => {
      // First attempt with short ADMIN_SECRET
      process.env.ADMIN_SECRET = 'short'; // Too short

      await expect(authService.ensureInitialized())
        .rejects
        .toThrow('ADMIN_SECRET must be at least 32 characters long');

      // Promise should be cleared to allow retry
      expect(authService.initializationPromise).toBeNull();
      expect(authService.initialized).toBe(false);

      // Fix the environment variable
      process.env.ADMIN_SECRET = 'properly_sized_32_character_secret';

      // Second attempt should succeed
      await expect(authService.ensureInitialized()).resolves.toBe(authService);
      expect(authService.initialized).toBe(true);
      expect(authService.sessionSecret).toBe('properly_sized_32_character_secret');
    });

    it('should maintain promise during concurrent initialization attempts', async () => {
      process.env.ADMIN_SECRET = 'valid_concurrent_32_character_secret';

      // Start multiple concurrent initialization attempts
      const promise1 = authService.ensureInitialized();
      const promise2 = authService.ensureInitialized();
      const promise3 = authService.ensureInitialized();

      // All should resolve to the same promise and result
      const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);

      expect(result1).toBe(authService);
      expect(result2).toBe(authService);
      expect(result3).toBe(authService);
      expect(authService.initialized).toBe(true);
      expect(authService.sessionSecret).toBe('valid_concurrent_32_character_secret');
    });

    it('should return immediately on subsequent calls after successful initialization', async () => {
      process.env.ADMIN_SECRET = 'fast_path_32_character_admin_secret';

      // First initialization
      await authService.ensureInitialized();
      expect(authService.initialized).toBe(true);

      // Clear the initialization promise to test fast path
      authService.initializationPromise = null;

      // Second call should use fast path (already initialized)
      const startTime = Date.now();
      const result = await authService.ensureInitialized();
      const endTime = Date.now();

      expect(result).toBe(authService);
      expect(authService.initialized).toBe(true);

      // Fast path should be very quick (< 10ms is reasonable for synchronous path)
      expect(endTime - startTime).toBeLessThan(10);
    });
  });

  describe('Environment Variable Integration', () => {
    it('should handle all valid environment configurations', async () => {
      process.env.ADMIN_SECRET = 'comprehensive_test_32_char_secret';
      process.env.ADMIN_SESSION_DURATION = '5400000'; // 90 minutes

      await authService.ensureInitialized();

      expect(authService.initialized).toBe(true);
      expect(authService.sessionSecret).toBe('comprehensive_test_32_char_secret');
      expect(authService.sessionDuration).toBe(5400000);
    });

    it('should preserve initialized state across multiple calls', async () => {
      process.env.ADMIN_SECRET = 'persistence_test_32_character_key';
      process.env.ADMIN_SESSION_DURATION = '2700000';

      // Initialize once
      await authService.ensureInitialized();
      const firstSessionSecret = authService.sessionSecret;
      const firstSessionDuration = authService.sessionDuration;

      // Call again - should maintain state
      await authService.ensureInitialized();
      expect(authService.sessionSecret).toBe(firstSessionSecret);
      expect(authService.sessionDuration).toBe(firstSessionDuration);
      expect(authService.initialized).toBe(true);
    });

    it('should handle edge case environment values', async () => {
      process.env.ADMIN_SECRET = 'edge_case_32_characters_exactly!'; // Exactly 32 chars
      process.env.ADMIN_SESSION_DURATION = '0'; // Edge case: 0 duration

      await authService.ensureInitialized();

      expect(authService.initialized).toBe(true);
      expect(authService.sessionSecret).toBe('edge_case_32_characters_exactly!');
      expect(authService.sessionDuration).toBe(3600000); // Zero duration defaults to 1 hour for security
    });
  });

  describe('Error Message Quality', () => {
    it('should provide clear error message for missing ADMIN_SECRET', async () => {
      delete process.env.ADMIN_SECRET;

      try {
        await authService.ensureInitialized();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toContain('❌ FATAL: ADMIN_SECRET not configured');
        expect(error.message).not.toContain('undefined');
        expect(error.message).not.toContain('[object Object]');
      }
    });

    it('should provide clear error message for short ADMIN_SECRET', async () => {
      process.env.ADMIN_SECRET = 'too_short_secret';

      try {
        await authService.ensureInitialized();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toBe('ADMIN_SECRET must be at least 32 characters long');
        expect(error.message).not.toContain('undefined');
      }
    });
  });
});
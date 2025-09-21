/**
 * Bootstrap Helpers Unit Tests
 *
 * Focused unit tests for bootstrap helper functions with proper mocking
 * and isolated testing of individual functions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Import helper functions
import {
  detectEnvironment,
  flattenSettings,
  validateEventData,
  deepMerge,
  retry,
  withTimeout,
  createTimeout,
  safeJsonParse,
  formatDuration,
  createLogger
} from '../../lib/bootstrap-helpers.js';

describe('Bootstrap Helper Functions', () => {
  let originalEnv = {};

  beforeEach(() => {
    // Save original environment
    originalEnv = {
      VERCEL_ENV: process.env.VERCEL_ENV,
      NODE_ENV: process.env.NODE_ENV,
      TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
      TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
      ADMIN_EMAIL: process.env.ADMIN_EMAIL
    };
  });

  afterEach(() => {
    // Restore original environment
    Object.assign(process.env, originalEnv);
    Object.keys(originalEnv).forEach(key => {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      }
    });
  });

  describe('Environment Detection', () => {
    it('should detect production environment from VERCEL_ENV', () => {
      process.env.VERCEL_ENV = 'production';
      delete process.env.NODE_ENV;

      const env = detectEnvironment();
      expect(env).toBe('production');
    });

    it('should detect preview environment from VERCEL_ENV', () => {
      process.env.VERCEL_ENV = 'preview';
      process.env.NODE_ENV = 'production'; // Should be overridden

      const env = detectEnvironment();
      expect(env).toBe('preview');
    });

    it('should detect development environment from VERCEL_ENV', () => {
      process.env.VERCEL_ENV = 'development';

      const env = detectEnvironment();
      expect(env).toBe('development');
    });

    it('should fall back to NODE_ENV=production', () => {
      delete process.env.VERCEL_ENV;
      process.env.NODE_ENV = 'production';

      const env = detectEnvironment();
      expect(env).toBe('production');
    });

    it('should default to development when no env vars set', () => {
      delete process.env.VERCEL_ENV;
      delete process.env.NODE_ENV;

      const env = detectEnvironment();
      expect(env).toBe('development');
    });
  });

  describe('Settings Flattening', () => {
    it('should flatten nested object to dot notation', () => {
      const nested = {
        payment: {
          stripe: {
            enabled: true,
            key: 'pk_test_123'
          },
          fees: {
            percentage: 2.9,
            fixed: 0.30
          }
        },
        email: {
          enabled: true,
          from: 'test@example.com'
        }
      };

      const flattened = flattenSettings(nested);

      expect(flattened).toEqual({
        'payment.stripe.enabled': 'true',
        'payment.stripe.key': 'pk_test_123',
        'payment.fees.percentage': '2.9',
        'payment.fees.fixed': '0.3',
        'email.enabled': 'true',
        'email.from': 'test@example.com'
      });
    });

    it('should handle arrays by JSON stringifying', () => {
      const withArrays = {
        features: ['workshops', 'social'],
        numbers: [1, 2, 3]
      };

      const flattened = flattenSettings(withArrays);

      expect(flattened).toEqual({
        'features': '["workshops","social"]',
        'numbers': '[1,2,3]'
      });
    });

    it('should handle null and undefined values', () => {
      const withNulls = {
        setting1: null,
        setting2: undefined,
        setting3: 'value'
      };

      const flattened = flattenSettings(withNulls);

      expect(flattened).toEqual({
        'setting1': 'null',
        'setting2': 'undefined',
        'setting3': 'value'
      });
    });

    it('should handle empty objects', () => {
      const flattened = flattenSettings({});
      expect(flattened).toEqual({});
    });

    it('should handle deeply nested structures', () => {
      const deepNested = {
        level1: {
          level2: {
            level3: {
              level4: 'deep_value'
            }
          }
        }
      };

      const flattened = flattenSettings(deepNested);
      expect(flattened['level1.level2.level3.level4']).toBe('deep_value');
    });
  });

  describe('Event Data Validation', () => {
    it('should validate complete event data', () => {
      const validEvent = {
        slug: 'test-event-2025',
        name: 'Test Event 2025',
        type: 'festival',
        status: 'upcoming',
        dates: {
          start: '2025-06-01',
          end: '2025-06-03'
        }
      };

      const errors = validateEventData(validEvent);
      expect(errors).toHaveLength(0);
    });

    it('should require mandatory fields', () => {
      const incompleteEvent = {
        slug: 'test-event'
        // Missing name, type, status
      };

      const errors = validateEventData(incompleteEvent);
      expect(errors).toContain('Missing required field: name');
      expect(errors).toContain('Missing required field: type');
      expect(errors).toContain('Missing required field: status');
    });

    it('should validate event type enum', () => {
      const invalidTypeEvent = {
        slug: 'test-event',
        name: 'Test Event',
        type: 'invalid-type',
        status: 'upcoming'
      };

      const errors = validateEventData(invalidTypeEvent);
      expect(errors).toContain('Invalid event type: invalid-type. Must be one of: festival, weekender, workshop, special');
    });

    it('should validate event status enum', () => {
      const invalidStatusEvent = {
        slug: 'test-event',
        name: 'Test Event',
        type: 'festival',
        status: 'invalid-status'
      };

      const errors = validateEventData(invalidStatusEvent);
      expect(errors).toContain('Invalid event status: invalid-status. Must be one of: draft, upcoming, active, completed, cancelled');
    });

    it('should validate date formats', () => {
      const invalidDatesEvent = {
        slug: 'test-event',
        name: 'Test Event',
        type: 'festival',
        status: 'upcoming',
        dates: {
          start: 'invalid-date',
          end: '2025-06-03'
        }
      };

      const errors = validateEventData(invalidDatesEvent);
      expect(errors).toContain('Invalid start date: invalid-date');
    });

    it('should validate date order', () => {
      const wrongOrderEvent = {
        slug: 'test-event',
        name: 'Test Event',
        type: 'festival',
        status: 'upcoming',
        dates: {
          start: '2025-06-03',
          end: '2025-06-01' // End before start
        }
      };

      const errors = validateEventData(wrongOrderEvent);
      expect(errors).toContain('Start date must be before end date');
    });
  });

  describe('Utility Functions', () => {
    describe('deepMerge', () => {
      it('should merge objects deeply', () => {
        const target = {
          a: 1,
          b: { c: 2, d: 3 }
        };
        const source = {
          b: { d: 4, e: 5 },
          f: 6
        };

        const result = deepMerge(target, source);

        expect(result).toEqual({
          a: 1,
          b: { c: 2, d: 4, e: 5 },
          f: 6
        });
        // Should not mutate original
        expect(target.b.d).toBe(3);
      });

      it('should handle arrays by replacement', () => {
        const target = { arr: [1, 2, 3] };
        const source = { arr: [4, 5] };

        const result = deepMerge(target, source);
        expect(result.arr).toEqual([4, 5]);
      });
    });

    describe('safeJsonParse', () => {
      it('should parse valid JSON', () => {
        const result = safeJsonParse('{"test": "value"}');
        expect(result).toEqual({ test: 'value' });
      });

      it('should return default for invalid JSON', () => {
        const result = safeJsonParse('invalid json', { default: true });
        expect(result).toEqual({ default: true });
      });

      it('should return null by default for invalid JSON', () => {
        const result = safeJsonParse('invalid json');
        expect(result).toBeNull();
      });
    });

    describe('formatDuration', () => {
      it('should format milliseconds', () => {
        expect(formatDuration(500)).toBe('500ms');
        expect(formatDuration(1500)).toBe('1.5s');
        expect(formatDuration(2000)).toBe('2.0s');
      });
    });

    describe('timeout utilities', () => {
      it('should create timeout promise that rejects', async () => {
        const timeoutPromise = createTimeout(10, 'Test timeout');

        await expect(timeoutPromise).rejects.toThrow('Test timeout');
      });

      it('should complete before timeout', async () => {
        const fastFunction = async () => {
          await new Promise(resolve => setTimeout(resolve, 5));
          return 'completed';
        };

        const result = await withTimeout(fastFunction, 100, 'Should not timeout');
        expect(result).toBe('completed');
      });

      it('should timeout slow function', async () => {
        const slowFunction = async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return 'completed';
        };

        await expect(withTimeout(slowFunction, 10, 'Function too slow'))
          .rejects
          .toThrow('Function too slow');
      });
    });

    describe('retry utility', () => {
      it('should succeed without retries', async () => {
        const successFunction = vi.fn().mockResolvedValue('success');

        const result = await retry(successFunction);
        expect(result).toBe('success');
        expect(successFunction).toHaveBeenCalledTimes(1);
      });

      it('should retry on failure then succeed', async () => {
        const retryFunction = vi.fn()
          .mockRejectedValueOnce(new Error('Attempt 1'))
          .mockRejectedValueOnce(new Error('Attempt 2'))
          .mockResolvedValue('success');

        const result = await retry(retryFunction, 3, 1); // 1ms delay for test speed
        expect(result).toBe('success');
        expect(retryFunction).toHaveBeenCalledTimes(3);
      });

      it('should throw after max retries', async () => {
        const failFunction = vi.fn().mockRejectedValue(new Error('Always fails'));

        await expect(retry(failFunction, 2, 1))
          .rejects
          .toThrow('Always fails');
        expect(failFunction).toHaveBeenCalledTimes(3); // Initial + 2 retries
      });
    });

    describe('logger creation', () => {
      it('should create logger with prefix', () => {
        const logger = createLogger('Test');

        expect(logger).toHaveProperty('info');
        expect(logger).toHaveProperty('success');
        expect(logger).toHaveProperty('warn');
        expect(logger).toHaveProperty('error');
        expect(logger).toHaveProperty('debug');
        expect(logger).toHaveProperty('log');

        // Should not throw when called
        expect(() => logger.info('Test message')).not.toThrow();
        expect(() => logger.success('Success message')).not.toThrow();
      });

      it('should create logger without prefix', () => {
        const logger = createLogger();

        expect(logger).toHaveProperty('info');
        expect(() => logger.info('Message without prefix')).not.toThrow();
      });
    });
  });
});
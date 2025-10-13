/**
 * Test Mode Utils Unit Tests
 * Testing the test mode detection and utility functions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isTestMode,
  getTestModeFlag,
  generateTestAwareTicketName,
  generateTestAwareTransactionId,
  createTestModeMetadata,
  validateTestModeConsistency,
  extractTestModeFromStripeSession,
  getTestModeConfig
} from '../../lib/test-mode-utils.js';

describe('Test Mode Utils', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment after each test
    process.env = originalEnv;
  });

  describe('Test Mode Detection', () => {
    it('should detect test mode from NODE_ENV=test', () => {
      process.env.NODE_ENV = 'test';
      expect(isTestMode()).toBe(true);
      expect(getTestModeFlag()).toBe(1);
    });

    it('should detect test mode from CI=true', () => {
      process.env.CI = 'true';
      expect(isTestMode()).toBe(true);
      expect(getTestModeFlag()).toBe(1);
    });

    it('should detect test mode from E2E_TEST_MODE=true', () => {
      process.env.E2E_TEST_MODE = 'true';
      expect(isTestMode()).toBe(true);
      expect(getTestModeFlag()).toBe(1);
    });

    it('should detect test mode from VERCEL_ENV=preview', () => {
      process.env.VERCEL_ENV = 'preview';
      expect(isTestMode()).toBe(true);
      expect(getTestModeFlag()).toBe(1);
    });

    it('should detect test mode from request headers', () => {
      const req = {
        headers: {
          'x-test-mode': 'true'
        }
      };
      expect(isTestMode(req)).toBe(true);
      expect(getTestModeFlag(req)).toBe(1);
    });

    it('should not detect test mode in production environment', () => {
      process.env.NODE_ENV = 'production';
      process.env.CI = 'false';
      process.env.E2E_TEST_MODE = 'false';
      process.env.VERCEL_ENV = 'production';

      expect(isTestMode()).toBe(false);
      expect(getTestModeFlag()).toBe(0);
    });
  });

  describe('Test-Aware Name Generation', () => {
    it('should add TEST- prefix in test mode', () => {
      process.env.NODE_ENV = 'test';

      const ticketName = generateTestAwareTicketName('TICKET-123');
      const transactionId = generateTestAwareTransactionId('TXN-456');

      expect(ticketName).toBe('TEST-TICKET-123');
      expect(transactionId).toBe('TEST-TXN-456');
    });

    it('should not add TEST- prefix in production mode', () => {
      process.env.NODE_ENV = 'production';

      const ticketName = generateTestAwareTicketName('TICKET-123');
      const transactionId = generateTestAwareTransactionId('TXN-456');

      expect(ticketName).toBe('TICKET-123');
      expect(transactionId).toBe('TXN-456');
    });
  });

  describe('Test Mode Metadata', () => {
    it('should create metadata with test mode information', () => {
      process.env.NODE_ENV = 'test';
      process.env.CI = 'true';

      const metadata = createTestModeMetadata();

      expect(metadata.test_mode).toBe(true);
      expect(metadata.test_context).toBeDefined();
      expect(metadata.test_context.environment).toBe('test');
      expect(metadata.test_context.ci_mode).toBe(true);
      expect(metadata.created_at).toBeDefined();
    });

    it('should include request headers in test metadata', () => {
      process.env.NODE_ENV = 'test';
      const req = {
        headers: {
          'x-test-session': 'session-123',
          'x-e2e-test': 'true'
        }
      };

      const metadata = createTestModeMetadata(req);

      expect(metadata.test_context.headers).toBeDefined();
      expect(metadata.test_context.headers.test_session).toBe('session-123');
      expect(metadata.test_context.headers.e2e_test).toBe('true');
    });

    it('should not include test context in production mode', () => {
      process.env.NODE_ENV = 'production';

      const metadata = createTestModeMetadata();

      expect(metadata.test_mode).toBe(false);
      expect(metadata.test_context).toBeUndefined();
    });
  });

  describe('Test Mode Consistency Validation', () => {
    it('should pass validation when test modes match', () => {
      expect(() => {
        validateTestModeConsistency(1, 1, 'transaction', 'ticket');
      }).not.toThrow();

      expect(() => {
        validateTestModeConsistency(0, 0, 'transaction', 'ticket');
      }).not.toThrow();
    });

    it('should throw error when test modes do not match', () => {
      expect(() => {
        validateTestModeConsistency(1, 0, 'transaction', 'ticket');
      }).toThrow('Test mode mismatch: ticket test mode (0) must match transaction test mode (1)');

      expect(() => {
        validateTestModeConsistency(0, 1, 'transaction', 'ticket');
      }).toThrow('Test mode mismatch: ticket test mode (1) must match transaction test mode (0)');
    });
  });

  // REMOVED: Test Mode Filtering tests
  // Reason: createTestModeFilter() function was removed from lib/test-mode-utils.js
  // The admin portal now shows ALL data (test + production) at all times.
  // Filtering is controlled by UI elements, not automatic code logic.

  describe('Stripe Session Test Mode Extraction', () => {
    it('should detect test mode from Stripe livemode=false', () => {
      const session = {
        livemode: false,
        metadata: {}
      };

      const testMode = extractTestModeFromStripeSession(session);

      expect(testMode.is_test).toBe(1);
      expect(testMode.stripe_test_mode).toBe(true);
      expect(testMode.metadata_test_mode).toBe(false);
    });

    it('should detect test mode from metadata', () => {
      const session = {
        livemode: true,
        metadata: {
          test: 'true'
        }
      };

      const testMode = extractTestModeFromStripeSession(session);

      expect(testMode.is_test).toBe(1);
      expect(testMode.stripe_test_mode).toBe(false);
      expect(testMode.metadata_test_mode).toBe(true);
    });

    it('should detect test mode from e2e_test metadata', () => {
      const session = {
        livemode: true,
        metadata: {
          e2e_test: 'true'
        }
      };

      const testMode = extractTestModeFromStripeSession(session);

      expect(testMode.is_test).toBe(1);
      expect(testMode.metadata_test_mode).toBe(true);
    });

    it('should not detect test mode for production session', () => {
      const session = {
        livemode: true,
        metadata: {
          order_id: 'ORDER-123'
        }
      };

      const testMode = extractTestModeFromStripeSession(session);

      expect(testMode.is_test).toBe(0);
      expect(testMode.stripe_test_mode).toBe(false);
      expect(testMode.metadata_test_mode).toBe(false);
    });
  });

  describe('Test Mode Configuration', () => {
    it('should return correct configuration for test environment', () => {
      process.env.NODE_ENV = 'test';
      process.env.TEST_DATA_CLEANUP_ENABLED = 'true';
      process.env.TEST_DATA_CLEANUP_AGE_DAYS = '7';

      const config = getTestModeConfig();

      expect(config.enabled).toBe(true);
      expect(config.environment).toBe('test');
      expect(config.cleanup_enabled).toBe(true);
      expect(config.cleanup_age_days).toBe(7);
    });

    it('should return correct configuration for production environment', () => {
      process.env.NODE_ENV = 'production';

      const config = getTestModeConfig();

      expect(config.enabled).toBe(false);
      expect(config.environment).toBe('production');
      expect(config.cleanup_enabled).toBe(true); // Default
      expect(config.cleanup_age_days).toBe(30); // Default
    });

    it('should handle custom cleanup configuration', () => {
      process.env.TEST_DATA_CLEANUP_ENABLED = 'false';
      process.env.TEST_DATA_CLEANUP_AGE_DAYS = '14';
      process.env.TEST_DATA_CLEANUP_BATCH_SIZE = '50';

      const config = getTestModeConfig();

      expect(config.cleanup_enabled).toBe(false);
      expect(config.cleanup_age_days).toBe(14);
      expect(config.cleanup_batch_size).toBe(50);
    });
  });
});
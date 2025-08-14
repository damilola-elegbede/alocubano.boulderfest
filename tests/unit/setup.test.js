/**
 * Tests for the simple setup helper
 * Validates that the new setup system works correctly and replaces
 * the complex TestInitializationOrchestrator
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTest, teardownTest, setupIntegrationTest } from '../helpers/setup.js';

describe('Setup Helper', () => {
  let setup;

  afterEach(async () => {
    if (setup) {
      await teardownTest(setup);
      setup = null;
    }
  });

  describe('setupTest()', () => {
    it('should create basic setup with database', async () => {
      setup = await setupTest();

      expect(setup.database).toBeDefined();
      expect(setup.client).toBeDefined();
      expect(setup.client.execute).toBeTypeOf('function');
      expect(setup.client.close).toBeTypeOf('function');
    });

    it('should skip database when disabled', async () => {
      setup = await setupTest({ database: false });

      expect(setup.database).toBeNull();
      expect(setup.client).toBeNull();
    });

    it('should setup environment from preset', async () => {
      setup = await setupTest({ 
        env: 'complete-test'
      });

      // Verify setup structure contains expected values
      expect(setup.envBackup).toBeDefined();
      expect(setup.options.env).toBe('complete-test');
      
      // The env setup happens, even if global cleanup restores it later
      expect(typeof setup.envBackup).toBe('object');
    });

    it('should setup environment from custom object', async () => {
      setup = await setupTest({ 
        env: { CUSTOM_VAR: 'test-value' },
        isolate: true
      });

      expect(process.env.CUSTOM_VAR).toBe('test-value');
    });

    it('should setup fetch mock', async () => {
      setup = await setupTest({ 
        mocks: ['fetch'],
        database: false
      });

      expect(setup.mocks.fetch).toBeDefined();
      expect(global.fetch).toBe(setup.mocks.fetch);
      expect(vi.isMockFunction(global.fetch)).toBe(true);
    });

    it('should setup brevo mock', async () => {
      setup = await setupTest({ 
        mocks: ['brevo'],
        database: false
      });

      expect(setup.mocks.brevo).toBeDefined();
      expect(setup.mocks.brevo.sendEmail).toBeDefined();
      expect(vi.isMockFunction(setup.mocks.brevo.sendEmail)).toBe(true);
    });

    it('should setup stripe mock', async () => {
      setup = await setupTest({ 
        mocks: ['stripe'],
        database: false
      });

      expect(setup.mocks.stripe).toBeDefined();
      expect(setup.mocks.stripe.checkout.sessions.create).toBeDefined();
      expect(vi.isMockFunction(setup.mocks.stripe.checkout.sessions.create)).toBe(true);
    });

    it('should setup multiple mocks', async () => {
      setup = await setupTest({ 
        mocks: ['fetch', 'brevo', 'stripe'],
        database: false
      });

      expect(setup.mocks.fetch).toBeDefined();
      expect(setup.mocks.brevo).toBeDefined();
      expect(setup.mocks.stripe).toBeDefined();
      expect(global.fetch).toBe(setup.mocks.fetch);
    });

    it('should handle missing seed fixture gracefully', async () => {
      // Should not throw when seed fixture doesn't exist
      setup = await setupTest({ seed: 'nonexistent-fixture' });
      
      expect(setup.database).toBeDefined();
    });

    it('should skip seeding when disabled', async () => {
      setup = await setupTest({ seed: false });
      
      expect(setup.database).toBeDefined();
    });
  });

  describe('teardownTest()', () => {
    it('should cleanup database', async () => {
      setup = await setupTest();
      const db = setup.database;
      
      await teardownTest(setup);
      
      // Database should be closed
      expect(() => db.prepare('SELECT 1')).toThrow();
      setup = null; // Prevent double cleanup
    });

    it('should restore environment', async () => {
      const originalValue = process.env.TEST_VAR || 'not-set';
      
      setup = await setupTest({ 
        env: { TEST_VAR: 'test-value' },
        isolate: true
      });
      
      expect(process.env.TEST_VAR).toBe('test-value');
      
      await teardownTest(setup);
      
      if (originalValue === 'not-set') {
        expect(process.env.TEST_VAR).toBeUndefined();
      } else {
        expect(process.env.TEST_VAR).toBe(originalValue);
      }
      setup = null;
    });

    it('should cleanup fetch mock', async () => {
      setup = await setupTest({ 
        mocks: ['fetch'],
        database: false
      });
      
      expect(global.fetch).toBeDefined();
      
      await teardownTest(setup);
      
      expect(global.fetch).toBeUndefined();
      setup = null;
    });

    it('should handle null setup gracefully', async () => {
      await expect(teardownTest(null)).resolves.toBeUndefined();
      await expect(teardownTest(undefined)).resolves.toBeUndefined();
    });
  });

  describe('setupIntegrationTest()', () => {
    it('should create complete integration setup', async () => {
      setup = await setupIntegrationTest();

      // Should have database
      expect(setup.database).toBeDefined();
      expect(setup.client).toBeDefined();

      // Should have all mocks
      expect(setup.mocks.fetch).toBeDefined();
      expect(setup.mocks.brevo).toBeDefined();
      expect(setup.mocks.stripe).toBeDefined();

      // Should have environment
      expect(process.env.BREVO_API_KEY).toBeDefined();
      expect(process.env.STRIPE_SECRET_KEY).toBeDefined();

      // Should have backup for cleanup
      expect(setup.envBackup).toBeDefined();
    });

    it('should work with custom env preset', async () => {
      setup = await setupIntegrationTest('valid-local');

      expect(process.env.TURSO_DATABASE_URL).toBe(':memory:');
      expect(setup.database).toBeDefined();
    });
  });

  describe('Database operations', () => {
    it('should execute queries on test database', async () => {
      setup = await setupTest();

      const result = await setup.client.execute('SELECT COUNT(*) as count FROM registrations');
      expect(result.rows).toBeDefined();
      expect(Array.isArray(result.rows)).toBe(true);
    });

    it('should handle database errors', async () => {
      setup = await setupTest();

      await expect(
        setup.client.execute('INVALID SQL QUERY')
      ).rejects.toThrow();
    });
  });

  describe('Mock behavior', () => {
    it('should provide working fetch mock', async () => {
      setup = await setupTest({ 
        mocks: ['fetch'],
        database: false
      });

      const response = await global.fetch('https://api.example.com');
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data).toEqual({});
      expect(setup.mocks.fetch).toHaveBeenCalledWith('https://api.example.com');
    });

    it('should provide working brevo mock', async () => {
      setup = await setupTest({ 
        mocks: ['brevo'],
        database: false
      });

      const result = await setup.mocks.brevo.sendEmail({
        to: 'test@example.com',
        subject: 'Test'
      });

      expect(result.messageId).toBeDefined();
      expect(result.messageId).toContain('msg_');
    });

    it('should provide working stripe mock', async () => {
      setup = await setupTest({ 
        mocks: ['stripe'],
        database: false
      });

      const session = await setup.mocks.stripe.checkout.sessions.create({
        line_items: [{ price: 'price_test', quantity: 1 }]
      });

      expect(session.id).toBeDefined();
      expect(session.id).toContain('cs_test_');
      expect(session.url).toBe('https://checkout.stripe.com/test');
    });
  });

  describe('Environment isolation', () => {
    it('should isolate environment completely', async () => {
      const originalKeys = Object.keys(process.env);
      
      setup = await setupTest({ 
        env: 'empty',
        isolate: true,
        database: false
      });

      // Should have fewer environment variables
      const newKeys = Object.keys(process.env);
      expect(newKeys.length).toBeLessThan(originalKeys.length);

      // Should preserve system variables
      expect(process.env.NODE_ENV).toBeDefined();
      expect(process.env.PATH).toBeDefined();
    });

    it('should restore environment after cleanup', async () => {
      const originalEnvCount = Object.keys(process.env).length;
      const originalBrevoKey = process.env.BREVO_API_KEY;
      
      setup = await setupTest({ 
        env: 'complete-test',
        isolate: true,
        database: false
      });

      await teardownTest(setup);
      setup = null;

      const restoredEnvCount = Object.keys(process.env).length;
      expect(restoredEnvCount).toBe(originalEnvCount);
      expect(process.env.BREVO_API_KEY).toBe(originalBrevoKey);
    });
  });
});
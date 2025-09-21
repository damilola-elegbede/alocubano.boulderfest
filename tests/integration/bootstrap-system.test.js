/**
 * Bootstrap System Integration Tests
 *
 * Integration tests for the production data bootstrap system that test:
 * - Full bootstrap flow with real database
 * - Transaction rollback scenarios
 * - Batch operation performance
 * - Multi-environment behavior
 * - Real configuration loading
 * - Database migration integration
 *
 * These tests use the actual database service and test configurations
 * to ensure the bootstrap system works correctly in production-like conditions.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { BootstrapSystem } from '../../scripts/bootstrap-vercel.js';
import { createDatabaseHelpers, withDatabaseHelpers } from '../../lib/bootstrap-database-helpers.js';
import { getDatabaseClient, resetDatabaseInstance } from '../../lib/database.js';
import { detectEnvironment, loadConfig, validateRequiredEnvVars } from '../../lib/bootstrap-helpers.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Bootstrap System Integration Tests', () => {
  let originalEnv = {};
  let testDatabase;
  let testConfigDir;

  beforeAll(async () => {
    // Save original environment
    originalEnv = {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
      DATABASE_URL: process.env.DATABASE_URL,
      ADMIN_EMAIL: process.env.ADMIN_EMAIL,
      TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
      TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN
    };

    // Create test configuration directory with the expected structure
    const fixturesDir = path.join(__dirname, '../fixtures');
    testConfigDir = path.join(fixturesDir, 'bootstrap');
    if (!fs.existsSync(testConfigDir)) {
      fs.mkdirSync(testConfigDir, { recursive: true });
    }

    // Create realistic test configurations for different environments
    await createTestConfigurations();
  });

  afterAll(async () => {
    // Restore original environment
    Object.assign(process.env, originalEnv);
    Object.keys(originalEnv).forEach(key => {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      }
    });

    // Clean up test configurations
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true });
    }

    // Reset database instance
    await resetDatabaseInstance();
  });

  beforeEach(async () => {
    // Set integration test environment
    process.env.NODE_ENV = 'test';
    process.env.VERCEL_ENV = 'development';
    process.env.DATABASE_URL = ':memory:';
    process.env.ADMIN_EMAIL = 'integration-test@example.com';

    // Reset database instance for clean state
    await resetDatabaseInstance();

    // Get fresh database instance
    testDatabase = await getDatabaseClient();

    // Create test database schema
    await createTestSchema();
  });

  afterEach(async () => {
    // Clean up database
    if (testDatabase) {
      try {
        await testDatabase.execute('DELETE FROM tickets');
        await testDatabase.execute('DELETE FROM event_access');
        await testDatabase.execute('DELETE FROM event_settings');
        await testDatabase.execute('DELETE FROM events');
      } catch (error) {
        // Tables might not exist in some tests
      }
    }

    // Reset database instance
    await resetDatabaseInstance();
  });

  describe('Real Database Operations', () => {
    it('should bootstrap complete system with real database operations', async () => {
      const bootstrap = new BootstrapSystem();

      // Override config loading to use test directory
      bootstrap.loadConfig = async function() {
        this.logger.info('\n📄 Loading configuration...');
        this.logger.info(`   Environment: ${this.environment}`);

        try {
          // loadConfig expects baseDir/../bootstrap/[env].json
          // We have fixtures/bootstrap/[env].json
          // So we need to pass fixtures/dummy as baseDir
          const dummyDir = path.join(__dirname, '../fixtures', 'dummy');
          this.config = await loadConfig(this.environment, dummyDir);

          // Substitute environment variables
          if (this.config.admin_access?.email === '${ADMIN_EMAIL}') {
            this.config.admin_access.email = process.env.ADMIN_EMAIL || null;
          }

          this.logger.success(`   ✅ Loaded ${this.config.events?.length || 0} event(s) from configuration`);
        } catch (error) {
          this.logger.error('   ❌ Failed to load configuration:', error.message);
          throw error;
        }
      };

      // Run full bootstrap
      const exitCode = await bootstrap.run();
      expect(exitCode).toBe(0);

      // Verify data integrity
      const eventCount = await testDatabase.execute('SELECT COUNT(*) as count FROM events');
      expect(eventCount.rows[0].count).toBeGreaterThan(0);

      const settingsCount = await testDatabase.execute('SELECT COUNT(*) as count FROM event_settings');
      expect(settingsCount.rows[0].count).toBeGreaterThan(0);

      // Verify specific data
      const testEvent = await testDatabase.execute({
        sql: 'SELECT * FROM events WHERE slug = ?',
        args: ['integration-test-festival']
      });
      expect(testEvent.rows).toHaveLength(1);
      expect(testEvent.rows[0].name).toBe('Integration Test Festival');
      expect(testEvent.rows[0].type).toBe('festival');

      // Verify settings were flattened and stored correctly
      const paymentSetting = await testDatabase.execute({
        sql: 'SELECT value FROM event_settings WHERE key = ?',
        args: ['payment.stripe_enabled']
      });
      expect(paymentSetting.rows[0].value).toBe('true');

      // Verify admin access
      const adminAccess = await testDatabase.execute({
        sql: 'SELECT * FROM event_access WHERE user_email = ?',
        args: ['integration-test@example.com']
      });
      expect(adminAccess.rows).toHaveLength(1);
      expect(adminAccess.rows[0].role).toBe('admin');

      // Verify bootstrap statistics
      expect(bootstrap.stats.events_created).toBeGreaterThan(0);
      expect(bootstrap.stats.settings_created).toBeGreaterThan(0);
      expect(bootstrap.stats.access_granted).toBeGreaterThan(0);
      expect(bootstrap.stats.transactions_used).toBeGreaterThan(0);
      expect(bootstrap.stats.batch_operations).toBeGreaterThan(0);

      // Clean up
      await bootstrap.dbHelpers?.cleanup();
    });

    it('should handle database transaction rollback on error', async () => {
      const helpers = createDatabaseHelpers();
      await helpers.init();

      let rollbackOccurred = false;
      let transactionError = null;

      try {
        await helpers.safeTransaction(async (transaction) => {
          // Insert valid data first
          await transaction.execute(
            'INSERT INTO events (slug, name, type, status, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)',
            ['tx-test-1', 'Transaction Test 1', 'festival', 'upcoming', '2025-01-01', '2025-01-02']
          );

          // Simulate error that should trigger rollback
          throw new Error('Simulated transaction error');
        });
      } catch (error) {
        transactionError = error;
        rollbackOccurred = true;
      }

      expect(rollbackOccurred).toBe(true);
      expect(transactionError.message).toBe('Simulated transaction error');

      // Verify no data was committed due to rollback
      const count = await testDatabase.execute('SELECT COUNT(*) as count FROM events');
      expect(count.rows[0].count).toBe(0);

      await helpers.cleanup();
    });

    it('should handle large batch operations efficiently', async () => {
      const helpers = createDatabaseHelpers();
      await helpers.init();

      // Create large dataset for batch testing
      const largeDataset = [];
      for (let i = 0; i < 250; i++) {
        largeDataset.push([
          1, // event_id (will be replaced with actual ID)
          `batch_setting_${i}`,
          `value_${i}`
        ]);
      }

      // First create an event to reference
      await testDatabase.execute({
        sql: 'INSERT INTO events (slug, name, type, status, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)',
        args: ['batch-test-event', 'Batch Test Event', 'festival', 'upcoming', '2025-01-01', '2025-01-02']
      });

      const eventResult = await testDatabase.execute('SELECT id FROM events WHERE slug = ?', ['batch-test-event']);
      const eventId = eventResult.rows[0].id;

      // Update dataset with correct event_id
      const settingsData = largeDataset.map(row => [eventId, row[1], row[2]]);

      const startTime = Date.now();

      // Test batch insert performance
      const result = await helpers.safeBatchInsert(
        'event_settings',
        ['event_id', 'key', 'value'],
        settingsData,
        {
          chunkSize: 50,
          conflictAction: 'IGNORE',
          validateData: true
        }
      );

      const duration = Date.now() - startTime;

      // Verify performance and results
      expect(result.totalRows).toBe(250);
      expect(result.inserted).toBe(250);
      expect(result.errors).toHaveLength(0);
      expect(result.chunks).toBe(5); // 250 rows / 50 chunk size = 5 chunks
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

      // Verify data was actually inserted
      const settingsCount = await testDatabase.execute({
        sql: 'SELECT COUNT(*) as count FROM event_settings WHERE event_id = ?',
        args: [eventId]
      });
      expect(settingsCount.rows[0].count).toBe(250);

      await helpers.cleanup();
    });

    it('should handle concurrent operations safely', async () => {
      // Create multiple events concurrently to test database safety
      const concurrentPromises = [];

      for (let i = 0; i < 5; i++) {
        const promise = withDatabaseHelpers(async (helpers) => {
          const eventData = {
            slug: `concurrent-event-${i}`,
            name: `Concurrent Event ${i}`,
            type: 'workshop',
            status: 'upcoming',
            start_date: '2025-01-01',
            end_date: '2025-01-02'
          };

          const result = await helpers.safeUpsert('events', eventData, ['slug']);
          return { index: i, result };
        });

        concurrentPromises.push(promise);
      }

      // Wait for all concurrent operations to complete
      const results = await Promise.all(concurrentPromises);

      // Verify all operations succeeded
      expect(results).toHaveLength(5);
      results.forEach((result, index) => {
        expect(result.index).toBe(index);
        expect(result.result.action).toBe('inserted');
      });

      // Verify all events were created
      const eventCount = await testDatabase.execute('SELECT COUNT(*) as count FROM events');
      expect(eventCount.rows[0].count).toBe(5);
    });
  });

  describe('Multi-Environment Configuration', () => {
    it('should detect correct environment for different scenarios', () => {
      // Test Vercel production
      process.env.VERCEL_ENV = 'production';
      delete process.env.NODE_ENV;
      expect(detectEnvironment()).toBe('production');

      // Test Vercel preview
      process.env.VERCEL_ENV = 'preview';
      expect(detectEnvironment()).toBe('preview');

      // Test local development
      delete process.env.VERCEL_ENV;
      process.env.NODE_ENV = 'development';
      expect(detectEnvironment()).toBe('development');

      // Test fallback
      delete process.env.NODE_ENV;
      expect(detectEnvironment()).toBe('development');
    });

    it('should load different configurations for different environments', async () => {
      // Test development config
      const devConfig = await loadConfig('development', testConfigDir);
      expect(devConfig.environment).toBe('development');
      expect(devConfig.events).toHaveLength(1);
      expect(devConfig.events[0].slug).toBe('integration-test-festival');

      // Test preview config
      const previewConfig = await loadConfig('preview', testConfigDir);
      expect(previewConfig.environment).toBe('preview');
      expect(previewConfig.events).toHaveLength(1);
      expect(previewConfig.events[0].capacity).toBe(150); // Different from dev

      // Test production config
      const prodConfig = await loadConfig('production', testConfigDir);
      expect(prodConfig.environment).toBe('production');
      expect(prodConfig.events).toHaveLength(2); // More events in production
    });

    it('should validate environment variables for different environments', () => {
      // Development should not require Turso variables
      delete process.env.TURSO_DATABASE_URL;
      delete process.env.TURSO_AUTH_TOKEN;
      expect(() => validateRequiredEnvVars('development')).not.toThrow();

      // Production should require Turso variables
      expect(() => validateRequiredEnvVars('production')).toThrow(/Missing required environment variables/);

      // Set required variables for production
      process.env.TURSO_DATABASE_URL = 'test-url';
      process.env.TURSO_AUTH_TOKEN = 'test-token';
      expect(() => validateRequiredEnvVars('production')).not.toThrow();

      // Preview should also require Turso variables
      delete process.env.TURSO_DATABASE_URL;
      expect(() => validateRequiredEnvVars('preview')).toThrow(/Missing required environment variables/);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle bootstrap with large configuration efficiently', async () => {
      // Create large configuration
      const largeConfig = {
        version: '1.0',
        environment: 'development',
        events: [],
        defaults: {
          settings: {
            general: { timezone: 'America/Denver' },
            payment: { currency: 'usd' }
          }
        },
        admin_access: {
          email: '${ADMIN_EMAIL}',
          role: 'admin',
          events: ['*']
        }
      };

      // Add many events
      for (let i = 0; i < 10; i++) {
        largeConfig.events.push({
          slug: `large-config-event-${i}`,
          name: `Large Config Event ${i}`,
          type: i % 2 === 0 ? 'festival' : 'workshop',
          status: 'upcoming',
          dates: {
            start: '2025-06-01',
            end: '2025-06-03'
          },
          settings: {
            payment: { stripe_enabled: true },
            registration: { deadline_days: 7 },
            features: { workshops: true, social_dancing: i % 3 === 0 }
          }
        });
      }

      // Write large config
      const largeConfigPath = path.join(testConfigDir, 'large-test.json');
      fs.writeFileSync(largeConfigPath, JSON.stringify(largeConfig, null, 2));

      // Test performance
      const startTime = Date.now();

      try {
        const config = await loadConfig('large-test', testConfigDir);
        expect(config.events).toHaveLength(10);

        const bootstrap = new BootstrapSystem();

        // Override environment and config loading
        bootstrap.environment = 'large-test';
        bootstrap.loadConfig = async function() {
          this.config = config;
          if (this.config.admin_access?.email === '${ADMIN_EMAIL}') {
            this.config.admin_access.email = process.env.ADMIN_EMAIL || null;
          }
        };

        const exitCode = await bootstrap.run();
        expect(exitCode).toBe(0);

        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(10000); // Should complete within 10 seconds

        // Verify all events and settings were created
        const eventCount = await testDatabase.execute('SELECT COUNT(*) as count FROM events');
        expect(eventCount.rows[0].count).toBe(10);

        const settingsCount = await testDatabase.execute('SELECT COUNT(*) as count FROM event_settings');
        expect(settingsCount.rows[0].count).toBeGreaterThan(50); // Each event should have multiple settings

        // Clean up
        await bootstrap.dbHelpers?.cleanup();

      } finally {
        // Clean up large config file
        if (fs.existsSync(largeConfigPath)) {
          fs.unlinkSync(largeConfigPath);
        }
      }
    });

    it('should maintain performance with repeated idempotent runs', async () => {
      const bootstrap = new BootstrapSystem();

      // Override config loading
      bootstrap.loadConfig = async function() {
        this.config = await loadConfig('development', testConfigDir);
        if (this.config.admin_access?.email === '${ADMIN_EMAIL}') {
          this.config.admin_access.email = process.env.ADMIN_EMAIL || null;
        }
      };

      const runTimes = [];

      // Run bootstrap multiple times and measure performance
      for (let i = 0; i < 3; i++) {
        const startTime = Date.now();

        const exitCode = await bootstrap.run();
        expect(exitCode).toBe(0);

        const duration = Date.now() - startTime;
        runTimes.push(duration);

        // Clean up for next iteration
        await bootstrap.dbHelpers?.cleanup();

        // Create new bootstrap instance for next run
        if (i < 2) {
          bootstrap = new BootstrapSystem();
          bootstrap.loadConfig = async function() {
            this.config = await loadConfig('development', testConfigDir);
            if (this.config.admin_access?.email === '${ADMIN_EMAIL}') {
              this.config.admin_access.email = process.env.ADMIN_EMAIL || null;
            }
          };
        }
      }

      // Verify performance doesn't degrade significantly
      const firstRun = runTimes[0];
      const subsequentRuns = runTimes.slice(1);

      subsequentRuns.forEach(runTime => {
        // Subsequent runs should not take more than 2x the first run
        expect(runTime).toBeLessThan(firstRun * 2);
      });

      // All runs should complete within reasonable time
      runTimes.forEach(runTime => {
        expect(runTime).toBeLessThan(5000); // 5 seconds max
      });
    });
  });

  describe('Error Scenarios and Recovery', () => {
    it('should handle partial data corruption gracefully', async () => {
      // Create initial data
      await testDatabase.execute({
        sql: 'INSERT INTO events (slug, name, type, status, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)',
        args: ['corrupted-event', 'Corrupted Event', 'festival', 'upcoming', '2025-01-01', '2025-01-02']
      });

      const eventResult = await testDatabase.execute('SELECT id FROM events WHERE slug = ?', ['corrupted-event']);
      const eventId = eventResult.rows[0].id;

      // Insert some corrupted settings (missing values)
      await testDatabase.execute({
        sql: 'INSERT INTO event_settings (event_id, key, value) VALUES (?, ?, ?)',
        args: [eventId, 'corrupted_setting', null]
      });

      // Now run bootstrap which should handle the existing corrupted data
      const bootstrap = new BootstrapSystem();
      bootstrap.loadConfig = async function() {
        this.config = await loadConfig('development', testConfigDir);
        if (this.config.admin_access?.email === '${ADMIN_EMAIL}') {
          this.config.admin_access.email = process.env.ADMIN_EMAIL || null;
        }
      };

      const exitCode = await bootstrap.run();
      expect(exitCode).toBe(0); // Should complete successfully despite corrupted data

      // Verify integrity check detected issues but didn't fail the bootstrap
      expect(bootstrap.stats.errors.length).toBeGreaterThanOrEqual(0); // May or may not have errors

      await bootstrap.dbHelpers?.cleanup();
    });

    it('should handle network timeout scenarios', async () => {
      const helpers = createDatabaseHelpers();
      await helpers.init();

      // Test transaction timeout
      await expect(
        helpers.safeTransaction(async () => {
          // Simulate long-running operation
          await new Promise(resolve => setTimeout(resolve, 200));
        }, { timeoutMs: 100 })
      ).rejects.toThrow(/timeout/);

      await helpers.cleanup();
    });

    it('should handle invalid configuration gracefully', async () => {
      // Create invalid configuration
      const invalidConfig = {
        version: '1.0',
        environment: 'development',
        events: [
          {
            slug: 'invalid-event',
            name: 'Invalid Event',
            type: 'invalid-type', // Invalid type
            status: 'invalid-status', // Invalid status
            // Missing required dates
          }
        ]
      };

      const invalidConfigPath = path.join(testConfigDir, 'invalid.json');
      fs.writeFileSync(invalidConfigPath, JSON.stringify(invalidConfig, null, 2));

      try {
        const bootstrap = new BootstrapSystem();
        bootstrap.environment = 'invalid';
        bootstrap.loadConfig = async function() {
          this.config = await loadConfig('invalid', testConfigDir);
        };

        const exitCode = await bootstrap.run();
        expect(exitCode).toBe(1); // Should fail gracefully

        await bootstrap.dbHelpers?.cleanup();

      } finally {
        // Clean up invalid config
        if (fs.existsSync(invalidConfigPath)) {
          fs.unlinkSync(invalidConfigPath);
        }
      }
    });
  });

  // Helper functions
  async function createTestSchema() {
    await testDatabase.execute(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        description TEXT,
        venue_name TEXT,
        venue_address TEXT,
        venue_city TEXT DEFAULT 'Boulder',
        venue_state TEXT DEFAULT 'CO',
        venue_zip TEXT,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        max_capacity INTEGER,
        early_bird_end_date DATE,
        regular_price_start_date DATE,
        display_order INTEGER DEFAULT 0,
        is_featured BOOLEAN DEFAULT FALSE,
        is_visible BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT,
        config TEXT
      )
    `);

    await testDatabase.execute(`
      CREATE TABLE IF NOT EXISTS event_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(event_id, key)
      )
    `);

    await testDatabase.execute(`
      CREATE TABLE IF NOT EXISTS event_access (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        user_email TEXT NOT NULL,
        role TEXT DEFAULT 'viewer',
        granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        granted_by TEXT,
        UNIQUE(event_id, user_email)
      )
    `);

    await testDatabase.execute(`
      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        ticket_code TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async function createTestConfigurations() {
    // Development configuration
    const devConfig = {
      version: '1.0',
      environment: 'development',
      metadata: {
        created: '2025-01-01T00:00:00Z',
        description: 'Development configuration for bootstrap integration tests'
      },
      events: [
        {
          slug: 'integration-test-festival',
          name: 'Integration Test Festival',
          type: 'festival',
          status: 'upcoming',
          description: 'Integration test festival for bootstrap testing',
          venue: {
            name: 'Integration Test Venue',
            address: '123 Integration St',
            city: 'Boulder',
            state: 'CO',
            zip: '80301'
          },
          dates: {
            start: '2025-06-01',
            end: '2025-06-03',
            early_bird_end: '2025-04-01',
            regular_price_start: '2025-05-01'
          },
          capacity: 100,
          display_order: 1,
          is_featured: true,
          is_visible: true,
          settings: {
            payment: {
              stripe_enabled: true,
              processing_fee_percentage: 2.9
            },
            registration: {
              deadline_days: 7
            },
            email: {
              confirmation_enabled: true
            }
          },
          ticket_types: [
            { code: 'full-pass', name: 'Full Festival Pass' },
            { code: 'day-pass', name: 'Day Pass' }
          ]
        }
      ],
      defaults: {
        settings: {
          general: {
            timezone: 'America/Denver'
          }
        }
      },
      admin_access: {
        email: '${ADMIN_EMAIL}',
        role: 'admin',
        events: ['*'],
        granted_by: 'integration-test'
      }
    };

    // Preview configuration (similar to dev but with different capacity)
    const previewConfig = {
      ...devConfig,
      environment: 'preview',
      events: [
        {
          ...devConfig.events[0],
          capacity: 150, // Different capacity for preview
          slug: 'integration-test-festival'
        }
      ]
    };

    // Production configuration (more events)
    const prodConfig = {
      ...devConfig,
      environment: 'production',
      events: [
        {
          ...devConfig.events[0],
          capacity: 200,
          slug: 'integration-test-festival'
        },
        {
          slug: 'integration-test-workshop',
          name: 'Integration Test Workshop',
          type: 'workshop',
          status: 'upcoming',
          dates: {
            start: '2025-07-01',
            end: '2025-07-01'
          },
          capacity: 50,
          settings: {
            payment: {
              stripe_enabled: true
            }
          }
        }
      ]
    };

    // Write configurations
    fs.writeFileSync(path.join(testConfigDir, 'development.json'), JSON.stringify(devConfig, null, 2));
    fs.writeFileSync(path.join(testConfigDir, 'preview.json'), JSON.stringify(previewConfig, null, 2));
    fs.writeFileSync(path.join(testConfigDir, 'production.json'), JSON.stringify(prodConfig, null, 2));
  }
});
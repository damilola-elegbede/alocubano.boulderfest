/**
 * Bootstrap System Performance Tests
 *
 * Performance and load testing for the bootstrap system to ensure:
 * - Acceptable performance under various loads
 * - Memory usage remains within bounds
 * - Database operations scale properly
 * - Batch operations are efficient
 * - System remains responsive under stress
 *
 * Performance Targets:
 * - Small datasets (1-10 events): < 2 seconds
 * - Medium datasets (10-100 events): < 10 seconds
 * - Large datasets (100-1000 events): < 60 seconds
 * - Memory usage: < 500MB for any operation
 * - Database connections: Properly managed and cleaned up
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { createClient } from '@libsql/client';
import { BootstrapSystem } from '../../scripts/bootstrap-vercel.js';
import { createDatabaseHelpers, withDatabaseHelpers } from '../../lib/bootstrap-database-helpers.js';
import { getDatabaseClient, resetDatabaseInstance } from '../../lib/database.js';
import { loadConfig, flattenSettings } from '../../lib/bootstrap-helpers.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Performance test configuration
const PERFORMANCE_TIMEOUTS = {
  small: 2000,    // 2 seconds for small datasets
  medium: 10000,  // 10 seconds for medium datasets
  large: 60000,   // 60 seconds for large datasets
  stress: 120000  // 2 minutes for stress tests
};

const MEMORY_LIMITS = {
  operation: 500 * 1024 * 1024, // 500MB per operation
  total: 1024 * 1024 * 1024      // 1GB total
};

describe('Bootstrap System Performance Tests', () => {
  let testDatabase;
  let testConfigDir;
  let originalEnv = {};

  beforeAll(async () => {
    // Save environment
    originalEnv = {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
      DATABASE_URL: process.env.DATABASE_URL,
      ADMIN_EMAIL: process.env.ADMIN_EMAIL
    };

    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.VERCEL_ENV = 'development';
    process.env.DATABASE_URL = ':memory:';
    process.env.ADMIN_EMAIL = 'perf-test@example.com';

    // Create test config directory
    testConfigDir = path.join(__dirname, '../fixtures/perf-configs');
    if (!fs.existsSync(testConfigDir)) {
      fs.mkdirSync(testConfigDir, { recursive: true });
    }

    // Create performance test configurations
    await createPerformanceConfigurations();
  });

  afterAll(async () => {
    // Restore environment
    Object.assign(process.env, originalEnv);
    Object.keys(originalEnv).forEach(key => {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      }
    });

    // Clean up test configs
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true });
    }
    // Also clean up bootstrap directory
    const bootstrapDir = path.join(path.dirname(testConfigDir), 'bootstrap');
    if (fs.existsSync(bootstrapDir)) {
      fs.rmSync(bootstrapDir, { recursive: true });
    }

    await resetDatabaseInstance();
  });

  beforeEach(async () => {
    await resetDatabaseInstance();
    testDatabase = await getDatabaseClient();
    await createTestSchema();
  });

  afterEach(async () => {
    if (testDatabase) {
      try {
        await testDatabase.execute('DELETE FROM tickets');
        await testDatabase.execute('DELETE FROM event_access');
        await testDatabase.execute('DELETE FROM event_settings');
        await testDatabase.execute('DELETE FROM events');
      } catch (error) {
        // Tables might not exist
      }
    }
    await resetDatabaseInstance();

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  });

  describe('Small Dataset Performance (1-10 events)', () => {
    it('should bootstrap small configuration quickly', async () => {
      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;

      const bootstrap = new BootstrapSystem();
      bootstrap.loadConfig = async function() {
        this.config = await loadConfig('small', testConfigDir);
        if (this.config.admin_access?.email === '${ADMIN_EMAIL}') {
          this.config.admin_access.email = process.env.ADMIN_EMAIL;
        }
      };

      const exitCode = await bootstrap.run();

      const duration = Date.now() - startTime;
      const memoryUsed = process.memoryUsage().heapUsed - startMemory;

      expect(exitCode).toBe(0);
      expect(duration).toBeLessThan(PERFORMANCE_TIMEOUTS.small);
      expect(memoryUsed).toBeLessThan(MEMORY_LIMITS.operation);

      // Verify data was created
      const eventCount = await testDatabase.execute('SELECT COUNT(*) as count FROM events');
      expect(eventCount.rows[0].count).toBe(5);

      const settingsCount = await testDatabase.execute('SELECT COUNT(*) as count FROM event_settings');
      expect(settingsCount.rows[0].count).toBeGreaterThan(20); // At least 4 settings per event

      await bootstrap.dbHelpers?.cleanup();
    }, PERFORMANCE_TIMEOUTS.small + 1000);

    it('should handle repeated small bootstraps efficiently', async () => {
      const runTimes = [];

      for (let i = 0; i < 3; i++) {
        const startTime = Date.now();

        const bootstrap = new BootstrapSystem();
        bootstrap.loadConfig = async function() {
          this.config = await loadConfig('small', testConfigDir);
          if (this.config.admin_access?.email === '${ADMIN_EMAIL}') {
            this.config.admin_access.email = process.env.ADMIN_EMAIL;
          }
        };

        const exitCode = await bootstrap.run();
        const duration = Date.now() - startTime;

        expect(exitCode).toBe(0);
        runTimes.push(duration);

        await bootstrap.dbHelpers?.cleanup();
      }

      // Performance should not degrade significantly
      const avgTime = runTimes.reduce((a, b) => a + b, 0) / runTimes.length;
      expect(avgTime).toBeLessThan(PERFORMANCE_TIMEOUTS.small);

      // No run should take more than 2x the fastest run
      const minTime = Math.min(...runTimes);
      runTimes.forEach(time => {
        expect(time).toBeLessThan(minTime * 2);
      });
    }, PERFORMANCE_TIMEOUTS.small * 4);
  });

  describe('Medium Dataset Performance (10-100 events)', () => {
    it('should bootstrap medium configuration efficiently', async () => {
      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;

      const bootstrap = new BootstrapSystem();
      bootstrap.loadConfig = async function() {
        this.config = await loadConfig('medium', testConfigDir);
        if (this.config.admin_access?.email === '${ADMIN_EMAIL}') {
          this.config.admin_access.email = process.env.ADMIN_EMAIL;
        }
      };

      const exitCode = await bootstrap.run();

      const duration = Date.now() - startTime;
      const memoryUsed = process.memoryUsage().heapUsed - startMemory;

      expect(exitCode).toBe(0);
      expect(duration).toBeLessThan(PERFORMANCE_TIMEOUTS.medium);
      expect(memoryUsed).toBeLessThan(MEMORY_LIMITS.operation);

      // Verify data was created
      const eventCount = await testDatabase.execute('SELECT COUNT(*) as count FROM events');
      expect(eventCount.rows[0].count).toBe(50);

      // Check batch operation efficiency
      expect(bootstrap.stats.batch_operations).toBeGreaterThan(0);
      expect(bootstrap.stats.transactions_used).toBeGreaterThan(0);

      await bootstrap.dbHelpers?.cleanup();
    }, PERFORMANCE_TIMEOUTS.medium + 5000);

    it('should maintain database performance with medium load', async () => {
      const helpers = createDatabaseHelpers();
      await helpers.init();

      const startTime = Date.now();

      // Create medium-sized dataset for batch operations
      const mediumDataset = [];
      for (let i = 0; i < 1000; i++) {
        mediumDataset.push([
          1, // event_id (will be updated)
          `medium_setting_${i}`,
          `value_${i}`
        ]);
      }

      // Create base event first
      await testDatabase.execute({
        sql: 'INSERT INTO events (slug, name, type, status, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)',
        args: ['medium-perf-test', 'Medium Performance Test', 'festival', 'upcoming', '2025-01-01', '2025-01-02']
      });

      const eventResult = await testDatabase.execute('SELECT id FROM events WHERE slug = ?', ['medium-perf-test']);
      const eventId = eventResult.rows[0].id;

      // Update dataset with correct event_id
      const settingsData = mediumDataset.map(row => [eventId, row[1], row[2]]);

      // Test batch insert performance
      const result = await helpers.safeBatchInsert(
        'event_settings',
        ['event_id', 'key', 'value'],
        settingsData,
        { chunkSize: 100 }
      );

      const duration = Date.now() - startTime;

      expect(result.totalRows).toBe(1000);
      expect(result.inserted).toBe(1000);
      expect(result.errors).toHaveLength(0);
      expect(duration).toBeLessThan(PERFORMANCE_TIMEOUTS.medium);

      await helpers.cleanup();
    }, PERFORMANCE_TIMEOUTS.medium + 5000);
  });

  describe('Large Dataset Performance (100-1000 events)', () => {
    it('should bootstrap large configuration within time limit', async () => {
      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;

      const bootstrap = new BootstrapSystem();
      bootstrap.loadConfig = async function() {
        this.config = await loadConfig('large', testConfigDir);
        if (this.config.admin_access?.email === '${ADMIN_EMAIL}') {
          this.config.admin_access.email = process.env.ADMIN_EMAIL;
        }
      };

      const exitCode = await bootstrap.run();

      const duration = Date.now() - startTime;
      const memoryUsed = process.memoryUsage().heapUsed - startMemory;

      expect(exitCode).toBe(0);
      expect(duration).toBeLessThan(PERFORMANCE_TIMEOUTS.large);
      expect(memoryUsed).toBeLessThan(MEMORY_LIMITS.operation);

      // Verify data was created
      const eventCount = await testDatabase.execute('SELECT COUNT(*) as count FROM events');
      expect(eventCount.rows[0].count).toBe(200);

      // Check batch efficiency for large datasets
      expect(bootstrap.stats.batch_operations).toBeGreaterThan(0);

      const dbStats = bootstrap.dbHelpers.getStats();
      expect(dbStats.duration).toBeLessThan(PERFORMANCE_TIMEOUTS.large);

      await bootstrap.dbHelpers?.cleanup();
    }, PERFORMANCE_TIMEOUTS.large + 10000);

    it('should handle very large batch operations efficiently', async () => {
      const helpers = createDatabaseHelpers();
      await helpers.init();

      const startTime = Date.now();

      // Create very large dataset
      const largeDataset = [];
      for (let i = 0; i < 5000; i++) {
        largeDataset.push([
          `large-event-${i.toString().padStart(4, '0')}`,
          `Large Event ${i}`,
          'workshop',
          'upcoming',
          '2025-01-01',
          '2025-01-02'
        ]);
      }

      const result = await helpers.safeBatchInsert(
        'events',
        ['slug', 'name', 'type', 'status', 'start_date', 'end_date'],
        largeDataset,
        {
          chunkSize: 250,
          conflictAction: 'IGNORE',
          validateData: false // Skip validation for performance
        }
      );

      const duration = Date.now() - startTime;

      expect(result.totalRows).toBe(5000);
      expect(result.inserted).toBe(5000);
      expect(result.chunks).toBe(20); // 5000 / 250 = 20
      expect(duration).toBeLessThan(PERFORMANCE_TIMEOUTS.large);

      // Verify throughput
      const eventsPerSecond = result.totalRows / (duration / 1000);
      expect(eventsPerSecond).toBeGreaterThan(100); // At least 100 events/second

      await helpers.cleanup();
    }, PERFORMANCE_TIMEOUTS.large + 10000);
  });

  describe('Memory Usage and Optimization', () => {
    it('should manage memory efficiently during large operations', async () => {
      const initialMemory = process.memoryUsage();

      // Perform memory-intensive operations
      await withDatabaseHelpers(async (helpers) => {
        const memoryTestData = [];

        // Create large in-memory dataset
        for (let i = 0; i < 10000; i++) {
          memoryTestData.push([
            `memory-test-${i}`,
            `Memory Test Event ${i}`,
            'festival',
            'upcoming',
            '2025-01-01',
            '2025-01-02'
          ]);
        }

        // Process in chunks to manage memory
        const result = await helpers.safeBatchInsert(
          'events',
          ['slug', 'name', 'type', 'status', 'start_date', 'end_date'],
          memoryTestData,
          { chunkSize: 500 }
        );

        expect(result.totalRows).toBe(10000);
        expect(result.inserted).toBe(10000);

        const currentMemory = process.memoryUsage();
        const memoryIncrease = currentMemory.heapUsed - initialMemory.heapUsed;

        // Memory increase should be reasonable
        expect(memoryIncrease).toBeLessThan(MEMORY_LIMITS.operation);
      });

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Memory should be released after operation
      setTimeout(() => {
        const finalMemory = process.memoryUsage();
        const finalIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
        expect(finalIncrease).toBeLessThan(MEMORY_LIMITS.operation / 2);
      }, 1000);
    }, PERFORMANCE_TIMEOUTS.large);

    it('should handle settings flattening performance', () => {
      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;

      // Create complex nested settings
      const complexSettings = {
        payment: {
          stripe: {
            enabled: true,
            keys: {
              public: 'pk_test_123',
              secret: 'sk_test_123'
            },
            webhooks: {
              endpoints: Array.from({ length: 100 }, (_, i) => `endpoint_${i}`)
            }
          },
          paypal: {
            enabled: false,
            config: {
              mode: 'sandbox',
              settings: Array.from({ length: 50 }, (_, i) => ({ key: `setting_${i}`, value: `value_${i}` }))
            }
          }
        },
        features: {
          workshops: true,
          social_dancing: true,
          competitions: {
            enabled: true,
            categories: Array.from({ length: 20 }, (_, i) => `category_${i}`)
          }
        }
      };

      // Flatten settings many times to test performance
      for (let i = 0; i < 1000; i++) {
        const flattened = flattenSettings(complexSettings);
        expect(Object.keys(flattened).length).toBeGreaterThan(0);
      }

      const duration = Date.now() - startTime;
      const memoryUsed = process.memoryUsage().heapUsed - startMemory;

      expect(duration).toBeLessThan(5000); // Should complete in 5 seconds
      expect(memoryUsed).toBeLessThan(100 * 1024 * 1024); // Less than 100MB
    });
  });

  describe('Database Connection and Resource Management', () => {
    it('should manage database connections efficiently', async () => {
      const connectionPromises = [];

      // Create multiple concurrent database operations
      for (let i = 0; i < 10; i++) {
        const promise = withDatabaseHelpers(async (helpers) => {
          const result = await helpers.safeUpsert(
            'events',
            {
              slug: `concurrent-${i}`,
              name: `Concurrent Event ${i}`,
              type: 'workshop',
              status: 'upcoming',
              start_date: '2025-01-01',
              end_date: '2025-01-02'
            },
            ['slug']
          );
          return { index: i, action: result.action };
        });
        connectionPromises.push(promise);
      }

      const results = await Promise.all(connectionPromises);

      expect(results).toHaveLength(10);
      results.forEach((result, index) => {
        expect(result.index).toBe(index);
        expect(result.action).toBe('inserted');
      });

      // Verify all events were created
      const eventCount = await testDatabase.execute('SELECT COUNT(*) as count FROM events');
      expect(eventCount.rows[0].count).toBe(10);
    });

    it('should clean up resources properly after errors', async () => {
      let errorOccurred = false;

      try {
        await withDatabaseHelpers(async (helpers) => {
          // Start an operation
          await helpers.safeUpsert(
            'events',
            {
              slug: 'error-test',
              name: 'Error Test Event',
              type: 'festival',
              status: 'upcoming',
              start_date: '2025-01-01',
              end_date: '2025-01-02'
            },
            ['slug']
          );

          // Simulate error
          throw new Error('Simulated operation error');
        });
      } catch (error) {
        errorOccurred = true;
        expect(error.message).toBe('Simulated operation error');
      }

      expect(errorOccurred).toBe(true);

      // Should be able to perform new operations after error
      await withDatabaseHelpers(async (helpers) => {
        const result = await helpers.safeUpsert(
          'events',
          {
            slug: 'recovery-test',
            name: 'Recovery Test Event',
            type: 'festival',
            status: 'upcoming',
            start_date: '2025-01-01',
            end_date: '2025-01-02'
          },
          ['slug']
        );
        expect(result.action).toBe('inserted');
      });

      // Verify both events exist
      const eventCount = await testDatabase.execute('SELECT COUNT(*) as count FROM events');
      expect(eventCount.rows[0].count).toBe(2);
    });
  });

  describe('Stress Testing', () => {
    it('should handle sustained load without degradation', async () => {
      const iterations = 5;
      const eventsPerIteration = 100;
      const iterationTimes = [];

      for (let iteration = 0; iteration < iterations; iteration++) {
        const startTime = Date.now();

        await withDatabaseHelpers(async (helpers) => {
          const eventData = [];
          for (let i = 0; i < eventsPerIteration; i++) {
            eventData.push([
              `stress-${iteration}-${i}`,
              `Stress Test Event ${iteration}-${i}`,
              'workshop',
              'upcoming',
              '2025-01-01',
              '2025-01-02'
            ]);
          }

          const result = await helpers.safeBatchInsert(
            'events',
            ['slug', 'name', 'type', 'status', 'start_date', 'end_date'],
            eventData,
            { chunkSize: 50 }
          );

          expect(result.inserted).toBe(eventsPerIteration);
        });

        const iterationTime = Date.now() - startTime;
        iterationTimes.push(iterationTime);

        // Each iteration should complete within reasonable time
        expect(iterationTime).toBeLessThan(PERFORMANCE_TIMEOUTS.medium);
      }

      // Performance should not degrade significantly across iterations
      const firstIterationTime = iterationTimes[0];
      const lastIterationTime = iterationTimes[iterationTimes.length - 1];

      // Last iteration should not take more than 2x the first iteration
      expect(lastIterationTime).toBeLessThan(firstIterationTime * 2);

      // Verify total data
      const totalCount = await testDatabase.execute('SELECT COUNT(*) as count FROM events');
      expect(totalCount.rows[0].count).toBe(iterations * eventsPerIteration);
    }, PERFORMANCE_TIMEOUTS.stress);
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

  async function createPerformanceConfigurations() {
    // Create bootstrap directory for configs (loadConfig expects ../bootstrap/[env].json)
    const bootstrapDir = path.join(path.dirname(testConfigDir), 'bootstrap');
    if (!fs.existsSync(bootstrapDir)) {
      fs.mkdirSync(bootstrapDir, { recursive: true });
    }

    // Small configuration (5 events)
    const smallConfig = createBaseConfig('small', 5);

    // Medium configuration (50 events)
    const mediumConfig = createBaseConfig('medium', 50);

    // Large configuration (200 events)
    const largeConfig = createBaseConfig('large', 200);

    // Write configurations to bootstrap directory
    fs.writeFileSync(path.join(bootstrapDir, 'small.json'), JSON.stringify(smallConfig, null, 2));
    fs.writeFileSync(path.join(bootstrapDir, 'medium.json'), JSON.stringify(mediumConfig, null, 2));
    fs.writeFileSync(path.join(bootstrapDir, 'large.json'), JSON.stringify(largeConfig, null, 2));
  }

  function createBaseConfig(environment, eventCount) {
    const config = {
      version: '1.0',
      environment,
      metadata: {
        created: '2025-01-01T00:00:00Z',
        description: `Performance test configuration with ${eventCount} events`
      },
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

    // Generate events
    for (let i = 0; i < eventCount; i++) {
      config.events.push({
        slug: `perf-test-event-${i.toString().padStart(3, '0')}`,
        name: `Performance Test Event ${i}`,
        type: i % 4 === 0 ? 'festival' : i % 3 === 0 ? 'workshop' : i % 2 === 0 ? 'weekender' : 'special',
        status: 'upcoming',
        description: `Performance test event ${i} for load testing`,
        venue: {
          name: `Test Venue ${i % 10}`,
          address: `${i} Test Street`,
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
        capacity: 50 + (i * 10),
        display_order: i,
        is_featured: i % 10 === 0,
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
          },
          features: {
            workshops: i % 3 === 0,
            social_dancing: i % 2 === 0,
            competitions: i % 5 === 0
          }
        },
        ticket_types: [
          { code: 'full-pass', name: 'Full Pass' },
          { code: 'day-pass', name: 'Day Pass' }
        ]
      });
    }

    return config;
  }
});
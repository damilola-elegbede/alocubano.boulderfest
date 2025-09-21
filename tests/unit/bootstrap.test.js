/**
 * Bootstrap System Unit Tests
 *
 * Comprehensive test coverage for the production data bootstrap system.
 * Tests all components including helpers, database operations, and full system integration.
 *
 * Test Categories:
 * - Environment detection and validation
 * - Configuration loading and validation
 * - Settings flattening and merging
 * - Database operations safety
 * - Transaction handling
 * - Batch operations
 * - Idempotency checks
 * - Error recovery
 * - Data integrity verification
 * - Full bootstrap system integration
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';

// Import bootstrap system components
import { BootstrapSystem } from '../../scripts/bootstrap-vercel.js';
import {
  detectEnvironment,
  loadConfig,
  flattenSettings,
  createLogger,
  validateRequiredEnvVars,
  validateEventData,
  deepMerge,
  retry,
  withTimeout,
  createTimeout,
  safeJsonParse,
  formatDuration
} from '../../lib/bootstrap-helpers.js';
import {
  BootstrapDatabaseHelpers,
  createDatabaseHelpers,
  withDatabaseHelpers,
  BOOTSTRAP_INTEGRITY_EXPECTATIONS
} from '../../lib/bootstrap-database-helpers.js';

// Test database setup
let testDb;
let originalEnv = {};

describe('Bootstrap System - Helper Functions', () => {
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
    // Clear any undefined values
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

  describe('Configuration Loading', () => {
    let testConfigDir;
    const validConfig = {
      version: '1.0',
      environment: 'test',
      events: [
        {
          slug: 'test-event',
          name: 'Test Event',
          type: 'festival',
          status: 'upcoming'
        }
      ]
    };

    beforeEach(() => {
      // Create unique test config directory to avoid conflicts
      testConfigDir = path.join(process.cwd(), '.tmp', 'test-configs', `test-${Date.now()}`);
      if (!fs.existsSync(testConfigDir)) {
        fs.mkdirSync(testConfigDir, { recursive: true });
      }

      // Write valid test config
      fs.writeFileSync(
        path.join(testConfigDir, 'test.json'),
        JSON.stringify(validConfig, null, 2)
      );
    });

    afterEach(() => {
      // Clean up test config directory
      if (fs.existsSync(testConfigDir)) {
        fs.rmSync(testConfigDir, { recursive: true });
      }
    });

    it('should load valid configuration file', async () => {
      // Create parent directory to match expected structure
      const parentDir = path.join(testConfigDir, 'parent');
      const bootstrapDir = path.join(parentDir, 'bootstrap');
      fs.mkdirSync(bootstrapDir, { recursive: true });

      // Move config file to expected location
      fs.copyFileSync(
        path.join(testConfigDir, 'test.json'),
        path.join(bootstrapDir, 'test.json')
      );

      const config = await loadConfig('test', parentDir);

      expect(config).toEqual(validConfig);
      expect(config.version).toBe('1.0');
      expect(config.environment).toBe('test');
      expect(config.events).toHaveLength(1);
    });

    it('should throw error for missing configuration file', async () => {
      await expect(loadConfig('nonexistent', testConfigDir))
        .rejects
        .toThrow(/Configuration file not found/);
    });

    it('should throw error for invalid JSON', async () => {
      const invalidJsonPath = path.join(testConfigDir, 'invalid.json');
      fs.writeFileSync(invalidJsonPath, '{ invalid json }');

      await expect(loadConfig('invalid', testConfigDir))
        .rejects
        .toThrow(/Invalid JSON in configuration file/);
    });

    it('should validate required configuration fields', async () => {
      const invalidConfig = { version: '1.0' }; // Missing environment
      fs.writeFileSync(
        path.join(testConfigDir, 'no-env.json'),
        JSON.stringify(invalidConfig)
      );

      await expect(loadConfig('no-env', testConfigDir))
        .rejects
        .toThrow(/Configuration missing environment field/);
    });

    it('should validate environment mismatch', async () => {
      const mismatchConfig = { version: '1.0', environment: 'wrong' };
      fs.writeFileSync(
        path.join(testConfigDir, 'mismatch.json'),
        JSON.stringify(mismatchConfig)
      );

      await expect(loadConfig('test', testConfigDir))
        .rejects
        .toThrow(/Configuration environment mismatch/);
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

  describe('Environment Validation', () => {
    it('should validate production environment requirements', () => {
      process.env.TURSO_DATABASE_URL = 'test_url';
      process.env.TURSO_AUTH_TOKEN = 'test_token';

      expect(() => validateRequiredEnvVars('production')).not.toThrow();
    });

    it('should validate preview environment requirements', () => {
      process.env.TURSO_DATABASE_URL = 'test_url';
      process.env.TURSO_AUTH_TOKEN = 'test_token';

      expect(() => validateRequiredEnvVars('preview')).not.toThrow();
    });

    it('should allow development environment without Turso vars', () => {
      delete process.env.TURSO_DATABASE_URL;
      delete process.env.TURSO_AUTH_TOKEN;

      expect(() => validateRequiredEnvVars('development')).not.toThrow();
    });

    it('should throw error for missing production variables', () => {
      delete process.env.TURSO_DATABASE_URL;
      delete process.env.TURSO_AUTH_TOKEN;

      expect(() => validateRequiredEnvVars('production'))
        .toThrow(/Missing required environment variables for production/);
    });

    it('should handle unknown environment gracefully', () => {
      expect(() => validateRequiredEnvVars('unknown')).not.toThrow();
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
  });
});

describe('Bootstrap System - Database Operations', () => {
  let dbHelpers;
  let testDatabase;

  beforeAll(async () => {
    // Create test database
    testDatabase = createClient({ url: ':memory:' });

    // Mock the database client getter to return our test database
    vi.doMock('../../lib/database.js', () => ({
      getDatabaseClient: vi.fn().mockResolvedValue(testDatabase)
    }));
  });

  beforeEach(async () => {
    // Create fresh database helpers for each test
    dbHelpers = createDatabaseHelpers();
    await dbHelpers.init();

    // Create test tables
    await testDatabase.execute(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
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
  });

  afterEach(async () => {
    if (dbHelpers) {
      await dbHelpers.cleanup();
    }

    // Clear all tables
    await testDatabase.execute('DELETE FROM tickets');
    await testDatabase.execute('DELETE FROM event_access');
    await testDatabase.execute('DELETE FROM event_settings');
    await testDatabase.execute('DELETE FROM events');
  });

  afterAll(async () => {
    vi.clearAllMocks();
  });

  describe('Database Helpers Initialization', () => {
    it('should initialize database helpers successfully', async () => {
      const helpers = createDatabaseHelpers();
      await helpers.init();

      const stats = helpers.getStats();
      expect(stats.startTime).toBeDefined();
      expect(stats.queries).toBe(0);

      await helpers.cleanup();
    });

    it('should track operation statistics', async () => {
      const stats = dbHelpers.getStats();
      expect(stats).toHaveProperty('queries');
      expect(stats).toHaveProperty('inserts');
      expect(stats).toHaveProperty('updates');
      expect(stats).toHaveProperty('duration');
    });
  });

  describe('Safe Batch Insert', () => {
    it('should insert data in batches successfully', async () => {
      const testData = [
        ['test-1', 'Test Event 1', 'festival', 'upcoming', '2025-01-01', '2025-01-02'],
        ['test-2', 'Test Event 2', 'festival', 'upcoming', '2025-01-01', '2025-01-02'],
        ['test-3', 'Test Event 3', 'festival', 'upcoming', '2025-01-01', '2025-01-02']
      ];

      const result = await dbHelpers.safeBatchInsert(
        'events',
        ['slug', 'name', 'type', 'status', 'start_date', 'end_date'],
        testData,
        { chunkSize: 2 }
      );

      expect(result.totalRows).toBe(3);
      expect(result.inserted).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.chunks).toBe(2); // 3 rows with chunk size 2 = 2 chunks

      // Verify data was inserted
      const count = await testDatabase.execute('SELECT COUNT(*) as count FROM events');
      expect(count.rows[0].count).toBe(3);
    });

    it('should handle conflict resolution with IGNORE', async () => {
      // Insert initial data
      await testDatabase.execute({
        sql: 'INSERT INTO events (slug, name, type, status, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)',
        args: ['existing', 'Existing Event', 'festival', 'upcoming', '2025-01-01', '2025-01-02']
      });

      const testData = [
        ['existing', 'Duplicate Event', 'festival', 'upcoming', '2025-01-01', '2025-01-02'], // Should be ignored
        ['new-event', 'New Event', 'festival', 'upcoming', '2025-01-01', '2025-01-02']
      ];

      const result = await dbHelpers.safeBatchInsert(
        'events',
        ['slug', 'name', 'type', 'status', 'start_date', 'end_date'],
        testData,
        { conflictAction: 'IGNORE' }
      );

      expect(result.inserted).toBe(1); // Only new event inserted
      expect(result.skipped).toBe(1); // Existing event skipped

      // Verify total count
      const count = await testDatabase.execute('SELECT COUNT(*) as count FROM events');
      expect(count.rows[0].count).toBe(2);
    });

    it('should validate input data when requested', async () => {
      const invalidData = [
        ['test-1'], // Wrong number of columns
        ['test-2', 'Test 2']
      ];

      await expect(dbHelpers.safeBatchInsert(
        'events',
        ['slug', 'name'],
        invalidData,
        { validateData: true }
      )).rejects.toThrow(/has 1 values but 2 columns expected/);
    });

    it('should handle empty data gracefully', async () => {
      const result = await dbHelpers.safeBatchInsert(
        'events',
        ['slug', 'name'],
        [],
        { validateData: true }
      );

      expect(result.totalRows).toBe(0);
      expect(result.inserted).toBe(0);
      expect(result.processed).toBe(0);
    });
  });

  describe('Safe Upsert', () => {
    it('should insert new record', async () => {
      const eventData = {
        slug: 'new-event',
        name: 'New Event',
        type: 'festival',
        status: 'upcoming',
        start_date: '2025-01-01',
        end_date: '2025-01-02'
      };

      const result = await dbHelpers.safeUpsert(
        'events',
        eventData,
        ['slug']
      );

      expect(result.action).toBe('inserted');
      expect(result.id).toBeDefined();

      // Verify insertion
      const check = await testDatabase.execute({
        sql: 'SELECT * FROM events WHERE slug = ?',
        args: ['new-event']
      });
      expect(check.rows).toHaveLength(1);
      expect(check.rows[0].name).toBe('New Event');
    });

    it('should skip existing record when updateOnConflict is false', async () => {
      // Insert initial record
      const initialData = {
        slug: 'existing-event',
        name: 'Existing Event',
        type: 'festival',
        status: 'draft',
        start_date: '2025-01-01',
        end_date: '2025-01-02'
      };

      await dbHelpers.safeUpsert('events', initialData, ['slug']);

      // Try to upsert with different data
      const updateData = {
        slug: 'existing-event',
        name: 'Updated Event',
        type: 'workshop',
        status: 'upcoming',
        start_date: '2025-01-01',
        end_date: '2025-01-02'
      };

      const result = await dbHelpers.safeUpsert(
        'events',
        updateData,
        ['slug'],
        { updateOnConflict: false }
      );

      expect(result.action).toBe('skipped');
      expect(result.reason).toBe('exists_no_update');

      // Verify original data unchanged
      const check = await testDatabase.execute({
        sql: 'SELECT * FROM events WHERE slug = ?',
        args: ['existing-event']
      });
      expect(check.rows[0].name).toBe('Existing Event');
      expect(check.rows[0].status).toBe('draft');
    });

    it('should update existing record when updateOnConflict is true', async () => {
      // Insert initial record
      const initialData = {
        slug: 'existing-event',
        name: 'Existing Event',
        type: 'festival',
        status: 'draft',
        start_date: '2025-01-01',
        end_date: '2025-01-02'
      };

      await dbHelpers.safeUpsert('events', initialData, ['slug']);

      // Update with different data
      const updateData = {
        slug: 'existing-event',
        name: 'Updated Event',
        type: 'workshop',
        status: 'upcoming',
        start_date: '2025-01-01',
        end_date: '2025-01-02'
      };

      const result = await dbHelpers.safeUpsert(
        'events',
        updateData,
        ['slug'],
        { updateOnConflict: true }
      );

      expect(result.action).toBe('updated');

      // Verify data was updated
      const check = await testDatabase.execute({
        sql: 'SELECT * FROM events WHERE slug = ?',
        args: ['existing-event']
      });
      expect(check.rows[0].name).toBe('Updated Event');
      expect(check.rows[0].status).toBe('upcoming');
      expect(check.rows[0].type).toBe('workshop');
    });
  });

  describe('Safe Transaction', () => {
    it('should execute transaction successfully', async () => {
      await dbHelpers.safeTransaction(async (transaction) => {
        await transaction.execute(
          'INSERT INTO events (slug, name, type, status, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)',
          ['tx-event-1', 'Transaction Event 1', 'festival', 'upcoming', '2025-01-01', '2025-01-02']
        );
        await transaction.execute(
          'INSERT INTO events (slug, name, type, status, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)',
          ['tx-event-2', 'Transaction Event 2', 'workshop', 'draft', '2025-01-01', '2025-01-02']
        );
      });

      // Verify both records were committed
      const count = await testDatabase.execute('SELECT COUNT(*) as count FROM events');
      expect(count.rows[0].count).toBe(2);
    });

    it('should rollback transaction on error', async () => {
      try {
        await dbHelpers.safeTransaction(async (transaction) => {
          await transaction.execute(
            'INSERT INTO events (slug, name, type, status, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)',
            ['tx-event-1', 'Transaction Event 1', 'festival', 'upcoming', '2025-01-01', '2025-01-02']
          );
          // This should cause a rollback
          throw new Error('Intentional transaction error');
        });
      } catch (error) {
        expect(error.message).toBe('Intentional transaction error');
      }

      // Verify no records were committed
      const count = await testDatabase.execute('SELECT COUNT(*) as count FROM events');
      expect(count.rows[0].count).toBe(0);
    });

    it('should prevent nested transactions', async () => {
      await expect(dbHelpers.safeTransaction(async () => {
        await dbHelpers.safeTransaction(async () => {
          // Nested transaction
        });
      })).rejects.toThrow('Cannot start nested transaction');
    });

    it('should handle transaction timeout', async () => {
      await expect(dbHelpers.safeTransaction(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      }, { timeoutMs: 50 })).rejects.toThrow(/timeout/);
    });
  });

  describe('Record Existence Check', () => {
    it('should detect existing records', async () => {
      // Insert test record
      await testDatabase.execute({
        sql: 'INSERT INTO events (slug, name, type, status, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)',
        args: ['test-event', 'Test Event', 'festival', 'upcoming', '2025-01-01', '2025-01-02']
      });

      const result = await dbHelpers.checkRecordExists('events', { slug: 'test-event' });

      expect(result.exists).toBe(true);
      expect(result.count).toBe(1);
      expect(result.id).toBeDefined();
      expect(result.hasConflict).toBe(false);
    });

    it('should detect non-existing records', async () => {
      const result = await dbHelpers.checkRecordExists('events', { slug: 'non-existent' });

      expect(result.exists).toBe(false);
      expect(result.count).toBe(0);
      expect(result.id).toBeNull();
      expect(result.hasConflict).toBe(false);
    });

    it('should detect conflicts (multiple matches)', async () => {
      // Insert multiple records that would match (shouldn't happen with UNIQUE constraints, but test the logic)
      await testDatabase.execute('DROP TABLE events');
      await testDatabase.execute(`
        CREATE TABLE events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT NOT NULL,  -- Removed UNIQUE for this test
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft'
        )
      `);

      // Insert duplicate slugs
      await testDatabase.execute({
        sql: 'INSERT INTO events (slug, name, type, status) VALUES (?, ?, ?, ?)',
        args: ['duplicate', 'Event 1', 'festival', 'upcoming']
      });
      await testDatabase.execute({
        sql: 'INSERT INTO events (slug, name, type, status) VALUES (?, ?, ?, ?)',
        args: ['duplicate', 'Event 2', 'festival', 'upcoming']
      });

      const result = await dbHelpers.checkRecordExists('events', { slug: 'duplicate' });

      expect(result.exists).toBe(true);
      expect(result.count).toBe(2);
      expect(result.hasConflict).toBe(true);
    });
  });

  describe('Integrity Verification', () => {
    beforeEach(async () => {
      // Insert test data for integrity checks
      await testDatabase.execute({
        sql: 'INSERT INTO events (slug, name, type, status, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)',
        args: ['test-event', 'Test Event', 'festival', 'upcoming', '2025-01-01', '2025-01-02']
      });

      const eventResult = await testDatabase.execute({
        sql: 'SELECT id FROM events WHERE slug = ?',
        args: ['test-event']
      });
      const eventId = eventResult.rows[0].id;

      // Insert settings
      for (let i = 0; i < 5; i++) {
        await testDatabase.execute({
          sql: 'INSERT INTO event_settings (event_id, key, value) VALUES (?, ?, ?)',
          args: [eventId, `setting_${i}`, `value_${i}`]
        });
      }

      // Insert access record
      await testDatabase.execute({
        sql: 'INSERT INTO event_access (event_id, user_email, role) VALUES (?, ?, ?)',
        args: [eventId, 'admin@example.com', 'admin']
      });

      // Insert ticket
      await testDatabase.execute({
        sql: 'INSERT INTO tickets (event_id, ticket_code) VALUES (?, ?)',
        args: [eventId, 'TEST123']
      });
    });

    it('should pass integrity verification with valid data', async () => {
      const result = await dbHelpers.verifyIntegrity({
        tableCounts: {
          events: 1,
          event_settings: 5,
          event_access: 1,
          tickets: 1
        }
      });

      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.checks.length).toBeGreaterThan(0);
    });

    it('should fail integrity verification with insufficient data', async () => {
      const result = await dbHelpers.verifyIntegrity({
        tableCounts: {
          events: 5, // Expecting 5 but only have 1
          event_settings: 10 // Expecting 10 but only have 5
        }
      });

      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.table === 'events')).toBe(true);
      expect(result.errors.some(e => e.table === 'event_settings')).toBe(true);
    });

    it('should verify foreign key constraints', async () => {
      const result = await dbHelpers.verifyIntegrity({
        foreignKeys: [
          {
            table: 'event_settings',
            column: 'event_id',
            refTable: 'events',
            refColumn: 'id'
          }
        ]
      });

      expect(result.passed).toBe(true);
      expect(result.checks.some(c => c.type === 'foreign_key')).toBe(true);
    });

    it('should detect foreign key violations', async () => {
      // Insert invalid foreign key reference
      await testDatabase.execute({
        sql: 'INSERT INTO event_settings (event_id, key, value) VALUES (?, ?, ?)',
        args: [999999, 'invalid_fk', 'test'] // Non-existent event_id
      });

      const result = await dbHelpers.verifyIntegrity({
        foreignKeys: [
          {
            table: 'event_settings',
            column: 'event_id',
            refTable: 'events',
            refColumn: 'id'
          }
        ]
      });

      expect(result.passed).toBe(false);
      expect(result.errors.some(e => e.type === 'foreign_key' && e.violations > 0)).toBe(true);
    });

    it('should verify unique constraints', async () => {
      const result = await dbHelpers.verifyIntegrity({
        uniqueConstraints: [
          {
            table: 'events',
            columns: 'slug'
          }
        ]
      });

      expect(result.passed).toBe(true);
      expect(result.checks.some(c => c.type === 'unique')).toBe(true);
    });
  });
});

describe('Bootstrap System - Integration Tests', () => {
  let originalEnv = {};
  let testConfigDir;

  beforeAll(async () => {
    // Save original environment
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
    process.env.ADMIN_EMAIL = 'admin@example.com';

    // Create test config directory and file
    testConfigDir = '/tmp/bootstrap-integration-test';
    if (!fs.existsSync(testConfigDir)) {
      fs.mkdirSync(testConfigDir, { recursive: true });
    }

    const testConfig = {
      version: '1.0',
      environment: 'development',
      metadata: {
        created: '2025-01-01T00:00:00Z',
        description: 'Test configuration for bootstrap integration tests'
      },
      events: [
        {
          slug: 'integration-test-event',
          name: 'Integration Test Event',
          type: 'festival',
          status: 'upcoming',
          description: 'Test event for bootstrap integration tests',
          venue: {
            name: 'Test Venue',
            address: '123 Test St',
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

    fs.writeFileSync(
      path.join(testConfigDir, 'development.json'),
      JSON.stringify(testConfig, null, 2)
    );
  });

  afterAll(async () => {
    // Restore original environment
    Object.assign(process.env, originalEnv);
    Object.keys(originalEnv).forEach(key => {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      }
    });

    // Clean up test config
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true });
    }

    vi.clearAllMocks();
  });

  describe('Full Bootstrap System Integration', () => {
    let bootstrap;
    let testDatabase;
    let integrationConfigDir;

    beforeEach(async () => {
      // Create fresh test database
      testDatabase = createClient({ url: ':memory:' });

      // Mock the database client getter
      vi.doMock('../../lib/database.js', () => ({
        getDatabaseClient: vi.fn().mockResolvedValue(testDatabase)
      }));

      // Create test configuration directory
      integrationConfigDir = path.join(process.cwd(), '.tmp', 'integration-configs', `test-${Date.now()}`);
      if (!fs.existsSync(integrationConfigDir)) {
        fs.mkdirSync(integrationConfigDir, { recursive: true });
      }

      // Create test configuration
      const testConfig = {
        version: '1.0',
        environment: 'development',
        metadata: {
          created: '2025-01-01T00:00:00Z',
          description: 'Integration test configuration'
        },
        events: [
          {
            slug: 'integration-test-event',
            name: 'Integration Test Event',
            type: 'festival',
            status: 'upcoming',
            description: 'Test event for integration tests',
            venue: {
              name: 'Test Venue',
              address: '123 Test St',
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

      fs.writeFileSync(
        path.join(integrationConfigDir, 'development.json'),
        JSON.stringify(testConfig, null, 2)
      );

      // Create bootstrap instance
      bootstrap = new BootstrapSystem();

      // Override config loading to use our test directory
      const originalLoadConfig = bootstrap.loadConfig;
      bootstrap.loadConfig = async function() {
        this.logger.info('\n📄 Loading configuration...');
        this.logger.info(`   Environment: ${this.environment}`);

        try {
          const { loadConfig } = await import('../../lib/bootstrap-helpers.js');
          this.config = await loadConfig(this.environment, integrationConfigDir);

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

      // Create minimal database schema
      await testDatabase.execute(`
        CREATE TABLE events (
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
        CREATE TABLE event_settings (
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
        CREATE TABLE event_access (
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
        CREATE TABLE tickets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          ticket_code TEXT UNIQUE NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    });

    afterEach(async () => {
      if (bootstrap?.dbHelpers) {
        await bootstrap.dbHelpers.cleanup();
      }

      // Clean up integration config directory
      if (integrationConfigDir && fs.existsSync(integrationConfigDir)) {
        fs.rmSync(integrationConfigDir, { recursive: true });
      }

      vi.clearAllMocks();
    });

    it('should run complete bootstrap process successfully', async () => {
      const exitCode = await bootstrap.run();

      expect(exitCode).toBe(0);

      // Verify events were created
      const eventCount = await testDatabase.execute('SELECT COUNT(*) as count FROM events');
      expect(eventCount.rows[0].count).toBe(1);

      const event = await testDatabase.execute('SELECT * FROM events WHERE slug = ?', ['integration-test-event']);
      expect(event.rows).toHaveLength(1);
      expect(event.rows[0].name).toBe('Integration Test Event');
      expect(event.rows[0].type).toBe('festival');
      expect(event.rows[0].status).toBe('upcoming');
      expect(event.rows[0].venue_name).toBe('Test Venue');

      // Verify settings were created
      const settingsCount = await testDatabase.execute('SELECT COUNT(*) as count FROM event_settings');
      expect(settingsCount.rows[0].count).toBeGreaterThan(0);

      // Check specific settings
      const stripeSettings = await testDatabase.execute({
        sql: 'SELECT value FROM event_settings WHERE key = ?',
        args: ['payment.stripe_enabled']
      });
      expect(stripeSettings.rows[0].value).toBe('true');

      // Verify admin access was granted
      const accessCount = await testDatabase.execute('SELECT COUNT(*) as count FROM event_access');
      expect(accessCount.rows[0].count).toBe(1);

      const access = await testDatabase.execute('SELECT * FROM event_access');
      expect(access.rows[0].user_email).toBe('admin@example.com');
      expect(access.rows[0].role).toBe('admin');

      // Verify bootstrap statistics
      expect(bootstrap.stats.events_created).toBe(1);
      expect(bootstrap.stats.settings_created).toBeGreaterThan(0);
      expect(bootstrap.stats.access_granted).toBe(1);
      expect(bootstrap.stats.errors).toHaveLength(0);
    });

    it('should be idempotent - running twice should not create duplicates', async () => {
      // Run bootstrap first time
      let exitCode = await bootstrap.run();
      expect(exitCode).toBe(0);

      // Get counts after first run
      const firstEventCount = await testDatabase.execute('SELECT COUNT(*) as count FROM events');
      const firstSettingsCount = await testDatabase.execute('SELECT COUNT(*) as count FROM event_settings');
      const firstAccessCount = await testDatabase.execute('SELECT COUNT(*) as count FROM event_access');

      // Create new bootstrap instance for second run
      const bootstrap2 = new BootstrapSystem();

      // Override config loading for second bootstrap
      bootstrap2.loadConfig = bootstrap.loadConfig;

      // Run bootstrap second time
      exitCode = await bootstrap2.run();
      expect(exitCode).toBe(0);

      // Get counts after second run
      const secondEventCount = await testDatabase.execute('SELECT COUNT(*) as count FROM events');
      const secondSettingsCount = await testDatabase.execute('SELECT COUNT(*) as count FROM event_settings');
      const secondAccessCount = await testDatabase.execute('SELECT COUNT(*) as count FROM event_access');

      // Counts should be the same (idempotent)
      expect(secondEventCount.rows[0].count).toBe(firstEventCount.rows[0].count);
      expect(secondSettingsCount.rows[0].count).toBe(firstSettingsCount.rows[0].count);
      expect(secondAccessCount.rows[0].count).toBe(firstAccessCount.rows[0].count);

      // Check that second run skipped existing records
      expect(bootstrap2.stats.events_skipped).toBe(1);
      expect(bootstrap2.stats.settings_skipped).toBeGreaterThan(0);
      expect(bootstrap2.stats.access_skipped).toBe(1);

      // Clean up second bootstrap
      if (bootstrap2.dbHelpers) {
        await bootstrap2.dbHelpers.cleanup();
      }
    });

    it('should handle configuration errors gracefully', async () => {
      // Remove config file to cause error
      const configPath = path.join(testConfigDir, 'development.json');
      const originalContent = fs.readFileSync(configPath, 'utf8');
      fs.unlinkSync(configPath);

      try {
        const exitCode = await bootstrap.run();
        expect(exitCode).toBe(1); // Should fail gracefully
      } finally {
        // Restore config file
        fs.writeFileSync(configPath, originalContent);
      }
    });

    it('should handle database errors gracefully', async () => {
      // Break the database by dropping a required table
      await testDatabase.execute('DROP TABLE events');

      const exitCode = await bootstrap.run();
      expect(exitCode).toBe(1); // Should fail gracefully
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    it('should handle withDatabaseHelpers utility', async () => {
      const testDb = createClient({ url: ':memory:' });

      vi.doMock('../../lib/database.js', () => ({
        getDatabaseClient: vi.fn().mockResolvedValue(testDb)
      }));

      await testDb.execute(`
        CREATE TEMPORARY TABLE test_table (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL
        )
      `);

      const result = await withDatabaseHelpers(async (helpers) => {
        await helpers.init();

        const insertResult = await helpers.safeUpsert(
          'test_table',
          { name: 'Test Item' },
          ['name']
        );

        expect(insertResult.action).toBe('inserted');
        return 'operation_completed';
      });

      expect(result).toBe('operation_completed');
    });

    it('should handle integrity expectations constants', () => {
      expect(BOOTSTRAP_INTEGRITY_EXPECTATIONS).toBeDefined();
      expect(BOOTSTRAP_INTEGRITY_EXPECTATIONS.tableCounts).toBeDefined();
      expect(BOOTSTRAP_INTEGRITY_EXPECTATIONS.foreignKeys).toBeDefined();
      expect(BOOTSTRAP_INTEGRITY_EXPECTATIONS.uniqueConstraints).toBeDefined();

      expect(BOOTSTRAP_INTEGRITY_EXPECTATIONS.tableCounts.events).toBe(1);
      expect(BOOTSTRAP_INTEGRITY_EXPECTATIONS.tableCounts.event_settings).toBe(5);

      expect(BOOTSTRAP_INTEGRITY_EXPECTATIONS.foreignKeys).toContainEqual({
        table: 'event_settings',
        column: 'event_id',
        refTable: 'events',
        refColumn: 'id'
      });
    });

    it('should handle logger creation with different prefixes', () => {
      const logger1 = createLogger('Test');
      const logger2 = createLogger();

      expect(logger1).toHaveProperty('info');
      expect(logger1).toHaveProperty('success');
      expect(logger1).toHaveProperty('warn');
      expect(logger1).toHaveProperty('error');
      expect(logger1).toHaveProperty('debug');
      expect(logger1).toHaveProperty('log');

      expect(logger2).toHaveProperty('info');

      // Should not throw when called
      expect(() => logger1.info('Test message')).not.toThrow();
      expect(() => logger2.success('Success message')).not.toThrow();
    });
  });
});
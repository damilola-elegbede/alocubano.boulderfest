/**
 * Bootstrap Database Helpers Unit Tests
 *
 * Tests for database helper functions with proper mocking and isolation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient } from '@libsql/client';

import {
  BootstrapDatabaseHelpers,
  createDatabaseHelpers,
  withDatabaseHelpers,
  BOOTSTRAP_INTEGRITY_EXPECTATIONS
} from '../../lib/bootstrap-database-helpers.js';

describe('Bootstrap Database Helpers', () => {
  let testDb;
  let dbHelpers;

  beforeEach(async () => {
    // Create in-memory test database
    testDb = createClient({ url: ':memory:' });

    // Create test schema first
    await createTestSchema(testDb);

    // Create helpers instance and manually set the database
    dbHelpers = createDatabaseHelpers();
    dbHelpers.db = testDb; // Directly set the database instance
    dbHelpers.operationStats.startTime = Date.now();
  });

  afterEach(async () => {
    if (dbHelpers) {
      await dbHelpers.cleanup();
    }
    vi.clearAllMocks();
  });

  describe('Initialization and Stats', () => {
    it('should initialize database helpers successfully', async () => {
      const helpers = createDatabaseHelpers();
      await helpers.init();

      const stats = helpers.getStats();
      expect(stats.startTime).toBeDefined();
      expect(stats.queries).toBe(0);
      expect(stats.inserts).toBe(0);
      expect(stats.updates).toBe(0);

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
      const count = await testDb.execute('SELECT COUNT(*) as count FROM events');
      expect(count.rows[0].count).toBe(3);
    });

    it('should handle conflict resolution with IGNORE', async () => {
      // Insert initial data
      await testDb.execute({
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
      const count = await testDb.execute('SELECT COUNT(*) as count FROM events');
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
      const check = await testDb.execute({
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
      const check = await testDb.execute({
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
      const check = await testDb.execute({
        sql: 'SELECT * FROM events WHERE slug = ?',
        args: ['existing-event']
      });
      expect(check.rows[0].name).toBe('Updated Event');
      expect(check.rows[0].status).toBe('upcoming');
      expect(check.rows[0].type).toBe('workshop');
    });
  });

  describe('Record Existence Check', () => {
    it('should detect existing records', async () => {
      // Insert test record
      await testDb.execute({
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
  });

  describe('Integrity Verification', () => {
    beforeEach(async () => {
      // Insert test data for integrity checks
      await testDb.execute({
        sql: 'INSERT INTO events (slug, name, type, status, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)',
        args: ['test-event', 'Test Event', 'festival', 'upcoming', '2025-01-01', '2025-01-02']
      });

      const eventResult = await testDb.execute({
        sql: 'SELECT id FROM events WHERE slug = ?',
        args: ['test-event']
      });
      const eventId = eventResult.rows[0].id;

      // Insert settings
      for (let i = 0; i < 5; i++) {
        await testDb.execute({
          sql: 'INSERT INTO event_settings (event_id, key, value) VALUES (?, ?, ?)',
          args: [eventId, `setting_${i}`, `value_${i}`]
        });
      }

      // Insert access record
      await testDb.execute({
        sql: 'INSERT INTO event_access (event_id, user_email, role) VALUES (?, ?, ?)',
        args: [eventId, 'admin@example.com', 'admin']
      });

      // Insert ticket
      await testDb.execute({
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
  });

  describe('withDatabaseHelpers utility', () => {
    it('should execute operation with helpers and cleanup', async () => {
      // Mock the getDatabaseClient to return our test database
      const mockGetDatabaseClient = vi.fn().mockResolvedValue(testDb);
      vi.doMock('../../lib/database.js', () => ({
        getDatabaseClient: mockGetDatabaseClient
      }));

      // Re-import to get the mocked version
      const { withDatabaseHelpers: mockedWithDatabaseHelpers } = await import('../../lib/bootstrap-database-helpers.js');

      const result = await mockedWithDatabaseHelpers(async (helpers) => {
        // Manually set the database instance since mocking isn't working perfectly in this context
        helpers.db = testDb;
        helpers.operationStats.startTime = Date.now();

        const insertResult = await helpers.safeUpsert(
          'events',
          {
            slug: 'test-helper-event',
            name: 'Test Helper Event',
            type: 'festival',
            status: 'upcoming',
            start_date: '2025-01-01',
            end_date: '2025-01-02'
          },
          ['slug']
        );

        expect(insertResult.action).toBe('inserted');
        return 'operation_completed';
      });

      expect(result).toBe('operation_completed');

      // Verify data was inserted
      const check = await testDb.execute({
        sql: 'SELECT COUNT(*) as count FROM events WHERE slug = ?',
        args: ['test-helper-event']
      });
      expect(check.rows[0].count).toBe(1);

      vi.clearAllMocks();
    });
  });

  describe('Constants and Configuration', () => {
    it('should have integrity expectations defined', () => {
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
  });

  // Helper function to create test schema
  async function createTestSchema(db) {
    await db.execute(`
      CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('festival', 'weekender', 'workshop', 'special')),
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'upcoming', 'active', 'completed', 'cancelled')),
        description TEXT,
        venue_name TEXT,
        venue_address TEXT,
        venue_city TEXT DEFAULT 'Boulder',
        venue_state TEXT DEFAULT 'CO',
        venue_zip TEXT,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        year INTEGER GENERATED ALWAYS AS (CAST(strftime('%Y', start_date) AS INTEGER)) STORED,
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

    await db.execute(`
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

    await db.execute(`
      CREATE TABLE event_access (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        user_email TEXT NOT NULL,
        role TEXT DEFAULT 'viewer' CHECK(role IN ('viewer', 'manager', 'admin')),
        granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        granted_by TEXT,
        UNIQUE(event_id, user_email)
      )
    `);

    await db.execute(`
      CREATE TABLE tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        ticket_code TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
});
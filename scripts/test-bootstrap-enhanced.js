#!/usr/bin/env node
/**
 * Enhanced Bootstrap Test Script
 *
 * Tests the bootstrap system with database safety mechanisms
 * Validates all components work together correctly
 */

import { BootstrapSystem } from './bootstrap-vercel.js';
import { createDatabaseHelpers, BOOTSTRAP_INTEGRITY_EXPECTATIONS } from '../lib/bootstrap-database-helpers.js';
import { createLogger, validateEventData } from '../lib/bootstrap-helpers.js';
import { getDatabaseClient, resetDatabaseInstance } from '../lib/database.js';

const logger = createLogger('BootstrapTest');

class BootstrapTestSuite {
  constructor() {
    this.testResults = {
      passed: 0,
      failed: 0,
      errors: []
    };
    this.originalEnv = {};
  }

  /**
   * Set up test environment
   */
  async setUp() {
    logger.info('🧪 Setting up test environment...');

    // Save original environment
    this.originalEnv = {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
      DATABASE_URL: process.env.DATABASE_URL
    };

    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.VERCEL_ENV = 'development';
    process.env.DATABASE_URL = ':memory:';

    // Reset database instance to ensure clean state
    await resetDatabaseInstance();

    logger.success('✅ Test environment configured');
  }

  /**
   * Clean up test environment
   */
  async tearDown() {
    logger.info('🧹 Cleaning up test environment...');

    // Restore original environment
    Object.assign(process.env, this.originalEnv);

    // Reset database instance
    await resetDatabaseInstance();

    logger.success('✅ Test environment cleaned up');
  }

  /**
   * Run a single test
   */
  async runTest(testName, testFn) {
    try {
      logger.info(`\n🔬 Running test: ${testName}`);
      await testFn();
      this.testResults.passed++;
      logger.success(`✅ Test passed: ${testName}`);
    } catch (error) {
      this.testResults.failed++;
      this.testResults.errors.push({ test: testName, error: error.message });
      logger.error(`❌ Test failed: ${testName} - ${error.message}`);
    }
  }

  /**
   * Test: Database Helpers Initialization
   */
  async testDatabaseHelpersInit() {
    const helpers = createDatabaseHelpers();
    await helpers.init();

    // Test that helpers are properly initialized
    const stats = helpers.getStats();
    if (!stats.startTime) {
      throw new Error('Database helpers not properly initialized');
    }

    await helpers.cleanup();
  }

  /**
   * Test: Safe Batch Insert
   */
  async testSafeBatchInsert() {
    const helpers = createDatabaseHelpers();
    await helpers.init();

    // Create a test table
    const db = await getDatabaseClient();
    await db.execute(`
      CREATE TEMPORARY TABLE test_batch (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        value INTEGER
      )
    `);

    // Test batch insert
    const testData = [
      ['Test 1', 100],
      ['Test 2', 200],
      ['Test 3', 300]
    ];

    const result = await helpers.safeBatchInsert(
      'test_batch',
      ['name', 'value'],
      testData,
      { chunkSize: 2 }
    );

    if (result.inserted !== 3) {
      throw new Error(`Expected 3 inserts, got ${result.inserted}`);
    }

    if (result.errors.length !== 0) {
      throw new Error(`Expected 0 errors, got ${result.errors.length}`);
    }

    await helpers.cleanup();
  }

  /**
   * Test: Safe Transaction
   */
  async testSafeTransaction() {
    const helpers = createDatabaseHelpers();
    await helpers.init();

    // Create a test table
    const db = await getDatabaseClient();
    await db.execute(`
      CREATE TEMPORARY TABLE test_transaction (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);

    // Test successful transaction
    await helpers.safeTransaction(async (transaction) => {
      await transaction.execute('INSERT INTO test_transaction (name) VALUES (?)', ['Success']);
    });

    // Verify data was committed
    const result = await db.execute('SELECT COUNT(*) as count FROM test_transaction');
    if (result.rows[0].count !== 1) {
      throw new Error('Transaction was not committed properly');
    }

    await helpers.cleanup();
  }

  /**
   * Test: Safe Upsert
   */
  async testSafeUpsert() {
    const helpers = createDatabaseHelpers();
    await helpers.init();

    // Create a test table
    const db = await getDatabaseClient();
    await db.execute(`
      CREATE TEMPORARY TABLE test_upsert (
        id INTEGER PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        value INTEGER
      )
    `);

    // Test insert
    const insertResult = await helpers.safeUpsert(
      'test_upsert',
      { slug: 'test-1', name: 'Test Item', value: 100 },
      ['slug']
    );

    if (insertResult.action !== 'inserted') {
      throw new Error(`Expected 'inserted', got '${insertResult.action}'`);
    }

    // Test skip on conflict
    const skipResult = await helpers.safeUpsert(
      'test_upsert',
      { slug: 'test-1', name: 'Updated Item', value: 200 },
      ['slug'],
      { updateOnConflict: false }
    );

    if (skipResult.action !== 'skipped') {
      throw new Error(`Expected 'skipped', got '${skipResult.action}'`);
    }

    await helpers.cleanup();
  }

  /**
   * Test: Integrity Verification
   */
  async testIntegrityVerification() {
    const helpers = createDatabaseHelpers();
    await helpers.init();

    // Create test tables that match our expectations
    const db = await getDatabaseClient();
    await db.execute(`
      CREATE TEMPORARY TABLE events (
        id INTEGER PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL
      )
    `);

    await db.execute(`
      CREATE TEMPORARY TABLE event_settings (
        id INTEGER PRIMARY KEY,
        event_id INTEGER REFERENCES events(id),
        key TEXT NOT NULL,
        value TEXT
      )
    `);

    // Insert test data
    await db.execute('INSERT INTO events (slug, name) VALUES (?, ?)', ['test-event', 'Test Event']);
    const eventResult = await db.execute('SELECT id FROM events WHERE slug = ?', ['test-event']);
    const eventId = eventResult.rows[0].id;

    for (let i = 0; i < 5; i++) {
      await db.execute('INSERT INTO event_settings (event_id, key, value) VALUES (?, ?, ?)',
        [eventId, `setting_${i}`, `value_${i}`]);
    }

    // Test integrity verification
    const integrityResult = await helpers.verifyIntegrity({
      tableCounts: {
        events: 1,
        event_settings: 5
      }
    });

    if (!integrityResult.passed) {
      throw new Error(`Integrity verification failed: ${integrityResult.errors.length} errors`);
    }

    await helpers.cleanup();
  }

  /**
   * Test: Full Bootstrap System
   */
  async testFullBootstrapSystem() {
    // First, we need to run migrations to create the schema
    const { MigrationSystem } = await import('./migrate.js');
    const migration = new MigrationSystem();

    try {
      // Run migrations to create tables
      await migration.runMigrations();
      logger.info('✅ Migrations completed for bootstrap test');
    } catch (migrationError) {
      logger.warn(`⚠️  Migration failed (expected in test): ${migrationError.message}`);
      // For in-memory testing, we'll create minimal tables manually
      const db = await getDatabaseClient();

      // Create minimal events table
      await db.execute(`
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

      // Create event_settings table
      await db.execute(`
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

      // Create event_access table
      await db.execute(`
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

      logger.info('✅ Manual schema creation completed for test');
    }

    // This test uses the development.json config
    const bootstrap = new BootstrapSystem();

    // Run the full bootstrap process
    const exitCode = await bootstrap.run();

    if (exitCode !== 0) {
      throw new Error('Bootstrap system returned non-zero exit code');
    }

    // Verify that data was created
    const db = await getDatabaseClient();

    const eventCount = await db.execute('SELECT COUNT(*) as count FROM events');
    if (eventCount.rows[0].count === 0) {
      throw new Error('No events were created by bootstrap');
    }

    const settingsCount = await db.execute('SELECT COUNT(*) as count FROM event_settings');
    if (settingsCount.rows[0].count === 0) {
      throw new Error('No settings were created by bootstrap');
    }
  }

  /**
   * Test: Configuration Validation
   */
  async testConfigurationValidation() {
    // Test valid event data
    const validEvent = {
      slug: 'test-event',
      name: 'Test Event',
      type: 'festival',
      status: 'upcoming',
      dates: {
        start: '2025-01-01',
        end: '2025-01-03'
      }
    };

    const validationErrors = validateEventData(validEvent);
    if (validationErrors.length > 0) {
      throw new Error(`Valid event data failed validation: ${validationErrors.join(', ')}`);
    }

    // Test invalid event data
    const invalidEvent = {
      slug: 'test-event',
      // Missing name
      type: 'invalid-type',
      status: 'invalid-status'
    };

    const invalidErrors = validateEventData(invalidEvent);
    if (invalidErrors.length === 0) {
      throw new Error('Invalid event data passed validation');
    }
  }

  /**
   * Test: Error Recovery
   */
  async testErrorRecovery() {
    const helpers = createDatabaseHelpers();
    await helpers.init();

    // Create a table that will cause constraint violations
    const db = await getDatabaseClient();
    await db.execute(`
      CREATE TEMPORARY TABLE test_recovery (
        id INTEGER PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL
      )
    `);

    // Insert initial data
    await db.execute('INSERT INTO test_recovery (slug, name) VALUES (?, ?)', ['existing', 'Existing Item']);

    // Test batch insert with conflicts (should recover gracefully)
    const testData = [
      ['existing', 'Duplicate Item'], // This should be ignored
      ['new-1', 'New Item 1'],
      ['new-2', 'New Item 2']
    ];

    const result = await helpers.safeBatchInsert(
      'test_recovery',
      ['slug', 'name'],
      testData,
      { conflictAction: 'IGNORE' }
    );

    // Should have inserted 2 new items, skipped 1 duplicate
    if (result.inserted !== 2) {
      throw new Error(`Expected 2 inserts, got ${result.inserted}`);
    }

    await helpers.cleanup();
  }

  /**
   * Run all tests
   */
  async runAll() {
    logger.info('🚀 Starting Enhanced Bootstrap Test Suite');
    logger.info('═'.repeat(60));

    await this.setUp();

    try {
      // Run individual component tests
      await this.runTest('Database Helpers Initialization', () => this.testDatabaseHelpersInit());
      await this.runTest('Safe Batch Insert', () => this.testSafeBatchInsert());
      await this.runTest('Safe Transaction', () => this.testSafeTransaction());
      await this.runTest('Safe Upsert', () => this.testSafeUpsert());
      await this.runTest('Integrity Verification', () => this.testIntegrityVerification());
      await this.runTest('Configuration Validation', () => this.testConfigurationValidation());
      await this.runTest('Error Recovery', () => this.testErrorRecovery());

      // Run integration test
      await this.runTest('Full Bootstrap System', () => this.testFullBootstrapSystem());

    } finally {
      await this.tearDown();
    }

    // Print results
    this.printResults();

    return this.testResults.failed === 0;
  }

  /**
   * Print test results
   */
  printResults() {
    logger.info('\n📊 Test Results');
    logger.info('═'.repeat(50));
    logger.success(`✅ Passed: ${this.testResults.passed}`);

    if (this.testResults.failed > 0) {
      logger.error(`❌ Failed: ${this.testResults.failed}`);
      logger.info('\nErrors:');
      for (const error of this.testResults.errors) {
        logger.error(`  • ${error.test}: ${error.error}`);
      }
    } else {
      logger.success('🎉 All tests passed!');
    }

    logger.info('═'.repeat(50));
  }
}

// Run tests if script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const testSuite = new BootstrapTestSuite();

  testSuite.runAll().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Test suite failed with unexpected error:', error);
    process.exit(1);
  });
}

export { BootstrapTestSuite };
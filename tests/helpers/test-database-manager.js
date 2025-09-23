/**
 * Test Database Manager
 * Provides database instances with different migration states for testing
 */

import { logger } from '../../lib/logger.js';

class TestDatabaseManager {
  constructor() {
    this.instances = new Map();
    this.migrationRunner = null;
  }

  /**
   * Get or create a database instance with the specified configuration
   * @param {Object} config - Database configuration
   * @param {boolean} config.withMigrations - Whether to run migrations
   * @param {string} config.testId - Unique test identifier
   * @param {boolean} config.isolated - Whether to create isolated instance
   * @returns {Promise<Object>} Database client
   */
  async getDatabaseInstance(config = {}) {
    const {
      withMigrations = false,
      testId = 'default',
      isolated = true
    } = config;

    const instanceKey = `${testId}_${withMigrations}_${isolated}`;

    // Return existing instance if available and not isolated
    if (!isolated && this.instances.has(instanceKey)) {
      const instance = this.instances.get(instanceKey);
      if (await this._validateInstance(instance)) {
        return instance;
      } else {
        // Remove invalid instance
        this.instances.delete(instanceKey);
      }
    }

    // Create new instance
    const instance = await this._createInstance(withMigrations, testId);

    if (!isolated) {
      this.instances.set(instanceKey, instance);
    }

    return instance;
  }

  /**
   * Create a new database instance
   * @private
   */
  async _createInstance(withMigrations, testId) {
    try {
      // Import better-sqlite3 for test databases
      const { default: Database } = await import('better-sqlite3');

      // Create in-memory database with unique name for isolation
      const dbPath = `:memory:`;
      const db = new Database(dbPath, {
        verbose: process.env.DEBUG === 'true' ? console.log : null
      });

      // Configure SQLite settings
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = NORMAL');
      db.pragma('foreign_keys = ON');
      db.pragma('temp_store = memory');

      // Create LibSQL-compatible wrapper
      const client = this._createLibSQLWrapper(db, testId);

      // Run migrations if requested
      if (withMigrations) {
        await this._runMigrations(client);
      } else {
        // Create minimal schema for basic operations
        await this._createMinimalSchema(client);
      }

      logger.log(`✅ Test database instance created (migrations: ${withMigrations}, test: ${testId})`);
      return client;

    } catch (error) {
      logger.error(`❌ Failed to create test database instance:`, error.message);
      throw error;
    }
  }

  /**
   * Create LibSQL-compatible wrapper around better-sqlite3
   * @private
   */
  _createLibSQLWrapper(db, testId) {
    let closed = false;

    return {
      testId,
      closed: false,

      execute: async (sql, params = []) => {
        if (closed) {
          throw new Error('Database connection closed');
        }

        try {
          // Handle both string queries and object format
          const query = typeof sql === 'string' ? sql : sql.sql;
          const values = typeof sql === 'string' ? params : sql.args || [];

          // Determine if it's a SELECT query
          const isSelect = query.trim().toUpperCase().startsWith('SELECT') ||
                          query.trim().toUpperCase().startsWith('PRAGMA');

          if (isSelect) {
            const stmt = db.prepare(query);
            const rows = stmt.all(...values);
            return {
              rows,
              columns: rows.length > 0 ? Object.keys(rows[0]) : [],
              rowsAffected: 0,
              lastInsertRowid: null
            };
          } else {
            const stmt = db.prepare(query);
            const result = stmt.run(...values);
            return {
              rows: [],
              columns: [],
              rowsAffected: result.changes,
              lastInsertRowid: result.lastInsertRowid
            };
          }
        } catch (error) {
          // Wrap error to match LibSQL error format
          const wrappedError = new Error(error.message);
          wrappedError.code = error.code || 'SQLITE_ERROR';
          throw wrappedError;
        }
      },

      batch: async (statements) => {
        const results = [];
        for (const stmt of statements) {
          results.push(await this.execute(stmt));
        }
        return results;
      },

      close: () => {
        if (!closed && db.open) {
          db.close();
          closed = true;
        }
      }
    };
  }

  /**
   * Run database migrations
   * @private
   */
  async _runMigrations(client) {
    if (!this.migrationRunner) {
      // Import migration runner
      const { MigrationRunner } = await import('../../lib/migration-runner.js');
      this.migrationRunner = new MigrationRunner();
    }

    try {
      // Initialize migration system
      await client.execute(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          filename TEXT UNIQUE NOT NULL,
          checksum TEXT NOT NULL,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Run all migrations
      await this.migrationRunner.runMigrations(client);
      logger.log('✅ Test database migrations completed');

    } catch (error) {
      logger.error('❌ Migration failed in test database:', error.message);
      throw error;
    }
  }

  /**
   * Create minimal schema for basic operations (when migrations are skipped)
   * @private
   */
  async _createMinimalSchema(client) {
    try {
      // Create comprehensive events table for bootstrap tests compatibility
      await client.execute(`
        CREATE TABLE IF NOT EXISTS events (
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
          year INTEGER,
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

      await client.execute(`
        CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_id TEXT UNIQUE NOT NULL,
          type TEXT NOT NULL,
          status TEXT NOT NULL,
          amount_cents INTEGER NOT NULL,
          currency TEXT NOT NULL DEFAULT 'USD',
          customer_email TEXT,
          customer_name TEXT,
          order_data TEXT NOT NULL,
          stripe_session_id TEXT,
          event_id INTEGER,
          is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1)),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (event_id) REFERENCES events(id)
        )
      `);

      await client.execute(`
        CREATE TABLE IF NOT EXISTS tickets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticket_id TEXT UNIQUE NOT NULL,
          transaction_id INTEGER,
          ticket_type TEXT NOT NULL,
          event_id INTEGER NOT NULL,
          price_cents INTEGER NOT NULL,
          attendee_email TEXT,
          attendee_first_name TEXT,
          attendee_last_name TEXT,
          status TEXT DEFAULT 'active',
          registration_status TEXT DEFAULT 'pending',
          is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1)),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (transaction_id) REFERENCES transactions(id),
          FOREIGN KEY (event_id) REFERENCES events(id)
        )
      `);

      await client.execute(`
        CREATE TABLE IF NOT EXISTS transaction_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_id INTEGER NOT NULL,
          item_type TEXT NOT NULL,
          item_name TEXT NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 1,
          unit_price_cents INTEGER NOT NULL,
          total_price_cents INTEGER NOT NULL,
          is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1)),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (transaction_id) REFERENCES transactions(id)
        )
      `);

      await client.execute(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          request_id TEXT,
          event_type TEXT NOT NULL,
          action TEXT NOT NULL,
          target_type TEXT,
          target_id TEXT,
          data_subject_id TEXT,
          data_type TEXT,
          processing_purpose TEXT,
          legal_basis TEXT,
          amount_cents INTEGER,
          currency TEXT,
          transaction_reference TEXT,
          payment_status TEXT,
          admin_user TEXT,
          before_value TEXT,
          after_value TEXT,
          changed_fields TEXT,
          metadata TEXT,
          severity TEXT DEFAULT 'info',
          source_service TEXT DEFAULT 'system',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create event_settings table for bootstrap tests
      await client.execute(`
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

      // Create event_access table for bootstrap tests
      await client.execute(`
        CREATE TABLE IF NOT EXISTS event_access (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          user_email TEXT NOT NULL,
          role TEXT DEFAULT 'viewer' CHECK(role IN ('viewer', 'manager', 'admin')),
          granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          granted_by TEXT,
          UNIQUE(event_id, user_email)
        )
      `);

      // Insert default event for testing (compatible with bootstrap schema)
      await client.execute(`
        INSERT OR IGNORE INTO events (id, slug, name, type, status, start_date, end_date)
        VALUES (1, 'alocubano-boulder-fest-2026', 'A Lo Cubano Boulder Fest 2026', 'festival', 'active', '2026-05-15', '2026-05-17')
      `);

      logger.log('✅ Comprehensive test database schema created');

    } catch (error) {
      logger.error('❌ Failed to create minimal schema:', error.message);
      throw error;
    }
  }

  /**
   * Validate that an instance is still usable
   * @private
   */
  async _validateInstance(instance) {
    try {
      if (!instance || instance.closed) {
        return false;
      }
      await instance.execute('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Cleanup all instances
   */
  async cleanup() {
    for (const [key, instance] of this.instances) {
      try {
        if (instance && typeof instance.close === 'function') {
          instance.close();
        }
      } catch (error) {
        logger.warn(`Failed to close test database instance ${key}:`, error.message);
      }
    }
    this.instances.clear();
    logger.log('✅ Test database manager cleanup completed');
  }

  /**
   * Get database instance for migration validation tests
   */
  async getDatabaseWithMigrations(testId = 'migration-test') {
    return this.getDatabaseInstance({
      withMigrations: true,
      testId,
      isolated: true
    });
  }

  /**
   * Get database instance for performance-optimized unit tests
   */
  async getDatabaseWithoutMigrations(testId = 'unit-test') {
    // Force isolation for edge case tests to prevent data spillover
    const needsIsolation = testId.includes('bootstrap-edge') || testId.includes('concurrent') || testId.includes('deadlock');

    return this.getDatabaseInstance({
      withMigrations: false,
      testId,
      isolated: needsIsolation  // Isolate problematic tests
    });
  }
}

// Export singleton instance
let testDatabaseManagerInstance = null;

/**
 * Get test database manager singleton
 */
export function getTestDatabaseManager() {
  if (!testDatabaseManagerInstance) {
    testDatabaseManagerInstance = new TestDatabaseManager();
  }
  return testDatabaseManagerInstance;
}

/**
 * Reset test database manager for clean test environment
 */
export async function resetTestDatabaseManager() {
  if (testDatabaseManagerInstance) {
    await testDatabaseManagerInstance.cleanup();
    testDatabaseManagerInstance = null;
  }
}

/**
 * Utility function to get appropriate database for test type
 * @param {Object} options - Test options
 * @param {boolean} options.requiresMigrations - Whether test requires migrations
 * @param {string} options.testName - Test name for isolation
 * @returns {Promise<Object>} Database client
 */
export async function getTestDatabase(options = {}) {
  const { requiresMigrations = false, testName = 'default' } = options;
  const manager = getTestDatabaseManager();

  if (requiresMigrations) {
    return manager.getDatabaseWithMigrations(testName);
  } else {
    return manager.getDatabaseWithoutMigrations(testName);
  }
}
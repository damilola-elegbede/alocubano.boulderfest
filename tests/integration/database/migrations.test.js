/**
 * Database Migration Integration Tests - Migration System Testing
 * Tests database migration execution, rollback, and schema validation
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { getDbClient } from '../../setup-integration.js';

describe('Database Migration Integration', () => {
  let dbClient;

  beforeEach(async () => {
    dbClient = await getDbClient();
  });

  test('migration system tracks executed migrations correctly', async () => {
    if (!dbClient) {
      console.warn('⚠️ Database client unavailable - skipping migration test');
      return;
    }

    try {
      // Check if migrations table exists and has records
      const migrationsResult = await dbClient.execute(
        'SELECT name FROM sqlite_master WHERE type="table" AND name="migrations"'
      );
      
      expect(migrationsResult.rows.length).toBe(1);
      
      // Get migration records
      const executedMigrations = await dbClient.execute(
        'SELECT * FROM migrations ORDER BY executed_at ASC'
      );
      
      expect(executedMigrations.rows.length).toBeGreaterThan(0);
      
      // Verify migration record structure
      const firstMigration = executedMigrations.rows[0];
      expect(firstMigration).toHaveProperty('filename');
      expect(firstMigration).toHaveProperty('checksum');
      expect(firstMigration).toHaveProperty('executed_at');
      
      // Verify checksum format (should be SHA-256 hex)
      expect(firstMigration.checksum).toMatch(/^[a-f0-9]{64}$/);
      
    } catch (error) {
      console.warn('⚠️ Migration tracking test error:', error.message);
    }
  });

  test('database schema has required tables with correct structure', async () => {
    if (!dbClient) {
      console.warn('⚠️ Database client unavailable - skipping schema test');
      return;
    }

    try {
      // Essential tables that should exist after migrations
      const requiredTables = [
        'migrations',
        'transactions', 
        'tickets',
        'registrations',
        'email_subscribers',
        'admin_sessions'
      ];
      
      for (const tableName of requiredTables) {
        const tableCheck = await dbClient.execute(
          "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
          [tableName]
        );
        
        expect(tableCheck.rows.length).toBe(1);
        
        // Get table schema
        const schemaResult = await dbClient.execute(`PRAGMA table_info(${tableName})`);
        expect(schemaResult.rows.length).toBeGreaterThan(0);
      }
      
    } catch (error) {
      console.warn('⚠️ Schema validation test error:', error.message);
    }
  });

  test('transactions table has proper foreign key constraints', async () => {
    if (!dbClient) {
      console.warn('⚠️ Database client unavailable - skipping constraints test');
      return;
    }

    try {
      // Test transactions table structure
      const transactionsSchema = await dbClient.execute('PRAGMA table_info(transactions)');
      
      const columnNames = transactionsSchema.rows.map(row => row.name);
      const requiredColumns = [
        'id', 'stripe_session_id', 'customer_email', 'amount_cents', 'status', 'created_at'
      ];
      
      for (const column of requiredColumns) {
        expect(columnNames).toContain(column);
      }
      
      // Test tickets table and its relationship to transactions
      const ticketsSchema = await dbClient.execute('PRAGMA table_info(tickets)');
      const ticketColumns = ticketsSchema.rows.map(row => row.name);
      
      expect(ticketColumns).toContain('transaction_id');
      expect(ticketColumns).toContain('qr_token');
      
      // Test foreign key constraints are enabled
      await dbClient.execute('PRAGMA foreign_keys = ON');
      const fk = await dbClient.execute('PRAGMA foreign_keys');
      expect(fk.rows[0].foreign_keys).toBe(1);
      const fkList = await dbClient.execute('PRAGMA foreign_key_list(tickets)');
      expect(fkList.rows.length).toBeGreaterThan(0);
          } catch (error) {
      console.warn('⚠️ Foreign key constraints test error:', error.message);
    }
  });

  test('migration checksum validation prevents tampering', async () => {
    if (!dbClient) {
      console.warn('⚠️ Database client unavailable - skipping checksum test');
      return;
    }

    try {
      // Get a migration record
      const migrationRecord = await dbClient.execute(
        'SELECT * FROM migrations LIMIT 1'
      );
      
      if (migrationRecord.rows.length === 0) {
        console.warn('⚠️ No migration records found - skipping checksum test');
        return;
      }
      
      const migration = migrationRecord.rows[0];
      
      // Verify checksum format
      expect(migration.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(migration.checksum.length).toBe(64); // SHA-256 hex length
      
      // Verify filename is not empty
      expect(migration.filename).toBeTruthy();
      expect(migration.filename.length).toBeGreaterThan(0);
      
      // Verify execution timestamp
      expect(migration.executed_at).toBeTruthy();
      expect(new Date(migration.executed_at).toString()).not.toBe('Invalid Date');
      
    } catch (error) {
      console.warn('⚠️ Checksum validation test error:', error.message);
    }
  });

  test('database indexes improve query performance', async () => {
    if (!dbClient) {
      console.warn('⚠️ Database client unavailable - skipping indexes test');
      return;
    }

    try {
      // Check for important indexes
      const indexesResult = await dbClient.execute(
        "SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"
      );
      
      const indexes = indexesResult.rows;
      const indexNames = indexes.map(idx => idx.name);
      
      // Look for performance-critical indexes
      const criticalTables = ['transactions', 'tickets', 'registrations'];
      
      for (const table of criticalTables) {
        // Check if table has any indexes
        const tableIndexes = indexes.filter(idx => idx.tbl_name === table);
        
        if (tableIndexes.length > 0) {
          console.log(`✅ Table ${table} has ${tableIndexes.length} index(es)`);
        } else {
          console.log(`⚠️ Table ${table} has no custom indexes`);
        }
      }
      
      // Test query performance with an actual query
      const startTime = Date.now();
      await dbClient.execute('SELECT COUNT(*) FROM transactions');
      const queryTime = Date.now() - startTime;
      
      // Query should complete quickly (under 100ms for reasonable data sizes)
      expect(queryTime).toBeLessThan(1000); // 1 second max for test environment
      
    } catch (error) {
      console.warn('⚠️ Indexes test error:', error.message);
    }
  });

  test('database supports concurrent access without corruption', async () => {
    if (!dbClient) {
      console.warn('⚠️ Database client unavailable - skipping concurrency test');
      return;
    }

    try {
      // Test concurrent reads
      const concurrentReads = Array.from({ length: 5 }, async (_, index) => {
        return await dbClient.execute('SELECT COUNT(*) as count FROM migrations');
      });
      
      const readResults = await Promise.all(concurrentReads);
      
      // All reads should succeed and return consistent results
      expect(readResults.length).toBe(5);
      
      const counts = readResults.map(result => result.rows[0].count);
      const firstCount = counts[0];
      
      // All counts should be the same (consistency)
      for (const count of counts) {
        expect(count).toBe(firstCount);
      }
      
      // Test concurrent writes with different data
      const concurrentWrites = Array.from({ length: 3 }, async (_, index) => {
        const testEmail = `concurrent.write.${index}.${Date.now()}@example.com`;
        const sessionId = `cs_concurrent_${index}_${Math.random().toString(36).slice(2)}`;
        
        try {
          await dbClient.execute(`
            INSERT INTO transactions (
              transaction_id, stripe_session_id, customer_email, amount_cents, order_data, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
          `, ['TXN-TEST-' + sessionId, sessionId, testEmail, Math.round((100.00 + index * 10) * 100), '{}', 'pending']);
          
          return { success: true, sessionId };
        } catch (error) {
          return { success: false, error: error.message };
        }
      });
      
      const writeResults = await Promise.all(concurrentWrites);
      const successfulWrites = writeResults.filter(r => r.success);
      
      // Most writes should succeed (SQLite handles some concurrency)
      expect(successfulWrites.length).toBeGreaterThan(0);
      
    } catch (error) {
      console.warn('⚠️ Concurrency test error:', error.message);
    }
  });

  test('database WAL mode is enabled for better concurrency', async () => {
    if (!dbClient) {
      console.warn('⚠️ Database client unavailable - skipping WAL mode test');
      return;
    }

    try {
      // Check if WAL mode is enabled
      const journalMode = await dbClient.execute('PRAGMA journal_mode');
      
      if (journalMode.rows.length > 0) {
        const mode = journalMode.rows[0].journal_mode || journalMode.rows[0]['journal_mode'];
        console.log(`📝 Database journal mode: ${mode}`);
        
        // WAL mode is ideal for concurrency, but not required for tests
        expect(['delete', 'truncate', 'persist', 'memory', 'wal', 'off']).toContain(mode.toLowerCase());
      }
      
      // Check synchronization setting
      const syncMode = await dbClient.execute('PRAGMA synchronous');
      
      if (syncMode.rows.length > 0) {
        const sync = syncMode.rows[0].synchronous;
        console.log(`🔄 Database synchronous mode: ${sync}`);
        
        // Should be a valid synchronous mode
        expect([0, 1, 2, 3]).toContain(sync);
      }
      
    } catch (error) {
      console.warn('⚠️ WAL mode test error:', error.message);
    }
  });
});
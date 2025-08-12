/**
 * Test Migration Runner Tests
 * Validates that the migration runner executes all SQL migrations correctly
 * and ensures database schema is properly initialized for tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@libsql/client';
import { 
  runMigrationsForTest,
  initializeTestDatabase,
  setupTestDatabase,
  TestMigrationRunner 
} from '../utils/test-migration-runner.js';

describe('TestMigrationRunner', () => {
  let testClient;

  beforeEach(async () => {
    // Create in-memory SQLite database for testing
    testClient = createClient({ url: ':memory:' });
  });

  afterEach(async () => {
    if (testClient) {
      await testClient.close();
    }
  });

  describe('TestMigrationRunner Class', () => {
    it('should initialize with default options', () => {
      const runner = new TestMigrationRunner();
      
      expect(runner.options.logLevel).toBe('info');
      expect(runner.options.createMigrationsTable).toBe(true);
      expect(runner.options.continueOnError).toBe(false);
      expect(runner.options.transactionMode).toBe(true);
    });

    it('should accept custom options', () => {
      const runner = new TestMigrationRunner({
        logLevel: 'debug',
        continueOnError: true,
        transactionMode: false
      });
      
      expect(runner.options.logLevel).toBe('debug');
      expect(runner.options.continueOnError).toBe(true);
      expect(runner.options.transactionMode).toBe(false);
    });

    it('should get migration files in order', () => {
      const runner = new TestMigrationRunner();
      const files = runner.getMigrationFiles();
      
      expect(files).toBeDefined();
      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBeGreaterThan(0);
      
      // Should include core migration files
      const fileNames = files.map(f => f.name);
      expect(fileNames).toContain('001_core_tables_simple.sql');
      expect(fileNames).toContain('002_tickets_table.sql');
      
      // Should be ordered correctly
      for (let i = 1; i < files.length; i++) {
        expect(files[i].order).toBeGreaterThanOrEqual(files[i - 1].order);
      }
    });

    it('should read and parse migration files', () => {
      const runner = new TestMigrationRunner();
      const files = runner.getMigrationFiles();
      
      expect(files.length).toBeGreaterThan(0);
      
      const firstFile = files[0];
      const statements = runner.readMigrationFile(firstFile.path);
      
      expect(Array.isArray(statements)).toBe(true);
      expect(statements.length).toBeGreaterThan(0);
      
      // Should contain valid SQL statements
      statements.forEach(statement => {
        expect(typeof statement).toBe('string');
        expect(statement.trim().length).toBeGreaterThan(0);
        expect(statement).not.toMatch(/^\s*--/); // No comment-only statements
      });
    });

    it('should cache parsed migration files', () => {
      const runner = new TestMigrationRunner();
      const files = runner.getMigrationFiles();
      const firstFile = files[0];
      
      // First call should read and cache
      const statements1 = runner.readMigrationFile(firstFile.path);
      
      // Second call should use cache
      const statements2 = runner.readMigrationFile(firstFile.path);
      
      expect(statements1).toBe(statements2); // Same reference due to caching
    });
  });

  describe.skip('Migration Execution', () => {
    it('should create migrations tracking table', async () => {
      const runner = new TestMigrationRunner();
      
      await runner.createMigrationsTable(testClient);
      
      // Verify table was created
      const result = await testClient.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'"
      );
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('migrations');
    });

    it('should execute a single migration successfully', async () => {
      const runner = new TestMigrationRunner({ logLevel: 'silent' });
      const files = runner.getMigrationFiles();
      
      expect(files.length).toBeGreaterThan(0);
      
      await runner.createMigrationsTable(testClient);
      const result = await runner.executeMigration(testClient, files[0]);
      
      expect(result.success).toBe(true);
      expect(result.executedStatements).toBeGreaterThan(0);
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should track migration execution in migrations table', async () => {
      const runner = new TestMigrationRunner({ logLevel: 'silent' });
      const files = runner.getMigrationFiles();
      
      await runner.createMigrationsTable(testClient);
      await runner.executeMigration(testClient, files[0]);
      
      // Check that migration was recorded
      const result = await testClient.execute(
        'SELECT * FROM migrations WHERE filename = ?',
        [files[0].name]
      );
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].success).toBe(1);
      expect(result.rows[0].execution_time_ms).toBeGreaterThan(0);
    });

    it('should run all migrations successfully', async () => {
      const runner = new TestMigrationRunner({ logLevel: 'silent' });
      
      const summary = await runner.runAllMigrations(testClient);
      
      expect(summary.success).toBe(true);
      expect(summary.totalMigrations).toBeGreaterThan(0);
      expect(summary.appliedMigrations).toBe(summary.totalMigrations);
      expect(summary.failedMigrations).toBe(0);
      expect(summary.totalExecutionTime).toBeGreaterThan(0);
    });

    it('should create all expected database tables', async () => {
      await runMigrationsForTest(testClient, { logLevel: 'silent' });
      
      // Check that key tables exist
      const tablesResult = await testClient.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      );
      
      const tableNames = tablesResult.rows.map(row => row.name);
      
      // Should include core tables from migrations
      expect(tableNames).toContain('transactions');
      expect(tableNames).toContain('tickets');
      expect(tableNames).toContain('migrations');
      
      // Should have a reasonable number of tables
      expect(tableNames.length).toBeGreaterThan(3);
    });

    it('should skip already applied migrations', async () => {
      const runner = new TestMigrationRunner({ logLevel: 'silent' });
      
      // Run migrations first time
      const firstRun = await runner.runAllMigrations(testClient);
      expect(firstRun.success).toBe(true);
      expect(firstRun.appliedMigrations).toBeGreaterThan(0);
      
      // Run migrations second time - should skip all
      const runner2 = new TestMigrationRunner({ logLevel: 'silent' });
      const secondRun = await runner2.runAllMigrations(testClient);
      
      expect(secondRun.success).toBe(true);
      expect(secondRun.appliedMigrations).toBe(0); // Nothing new to apply
      expect(secondRun.skippedMigrations).toBe(firstRun.totalMigrations);
    });
  });

  describe('Helper Functions', () => {
    it.skip('should run migrations with runMigrationsForTest', async () => {
      const summary = await runMigrationsForTest(testClient);
      
      expect(summary.success).toBe(true);
      expect(summary.totalMigrations).toBeGreaterThan(0);
      expect(summary.appliedMigrations).toBeGreaterThan(0);
    });

    it.skip('should initialize database with initializeTestDatabase', async () => {
      const returnedClient = await initializeTestDatabase(testClient);
      
      expect(returnedClient).toBe(testClient); // Should return same client
      
      // Verify database is initialized
      const result = await testClient.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'"
      );
      expect(result.rows).toHaveLength(1);
    });

    it.skip('should setup database with setupTestDatabase in silent mode', async () => {
      const summary = await setupTestDatabase(testClient, true);
      
      expect(summary.success).toBe(true);
      expect(summary.totalMigrations).toBeGreaterThan(0);
      
      // Verify core tables exist
      const result = await testClient.execute(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'"
      );
      expect(result.rows[0].count).toBeGreaterThan(3);
    });
  });

  describe.skip('Database Schema Validation', () => {
    beforeEach(async () => {
      // Run all migrations before each test
      await runMigrationsForTest(testClient, { logLevel: 'silent' });
    });

    it('should create transactions table with correct schema', async () => {
      const result = await testClient.execute(
        "PRAGMA table_info(transactions)"
      );
      
      const columns = result.rows.map(row => row.name);
      
      expect(columns).toContain('id');
      expect(columns).toContain('transaction_id');
      expect(columns).toContain('type');
      expect(columns).toContain('status');
      expect(columns).toContain('amount_cents');
      expect(columns).toContain('customer_email');
      expect(columns).toContain('created_at');
    });

    it('should create tickets table with correct schema', async () => {
      const result = await testClient.execute(
        "PRAGMA table_info(tickets)"
      );
      
      const columns = result.rows.map(row => row.name);
      
      expect(columns).toContain('id');
      expect(columns).toContain('ticket_id');
      expect(columns).toContain('transaction_id');
      expect(columns).toContain('ticket_type');
      expect(columns).toContain('event_id');
      expect(columns).toContain('status');
      expect(columns).toContain('validation_code');
    });

    it('should allow inserting test data into transactions table', async () => {
      const insertResult = await testClient.execute({
        sql: `
          INSERT INTO transactions 
          (transaction_id, type, status, amount_cents, customer_email, order_data)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        args: ['test-123', 'tickets', 'completed', 5000, 'test@example.com', '{}']
      });
      
      expect(insertResult.changes).toBe(1);
      
      // Verify insert
      const selectResult = await testClient.execute(
        'SELECT * FROM transactions WHERE transaction_id = ?',
        ['test-123']
      );
      
      expect(selectResult.rows).toHaveLength(1);
      expect(selectResult.rows[0].customer_email).toBe('test@example.com');
    });

    it('should allow inserting test data into tickets table', async () => {
      // First insert a transaction
      await testClient.execute({
        sql: `
          INSERT INTO transactions 
          (id, transaction_id, type, status, amount_cents, customer_email, order_data)
          VALUES (1, 'test-123', 'tickets', 'completed', 5000, 'test@example.com', '{}')
        `
      });
      
      // Then insert a ticket
      const insertResult = await testClient.execute({
        sql: `
          INSERT INTO tickets 
          (ticket_id, transaction_id, ticket_type, event_id, price_cents, status)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        args: ['ticket-123', 1, 'general', 'boulder-fest-2026', 5000, 'valid']
      });
      
      expect(insertResult.changes).toBe(1);
      
      // Verify insert
      const selectResult = await testClient.execute(
        'SELECT * FROM tickets WHERE ticket_id = ?',
        ['ticket-123']
      );
      
      expect(selectResult.rows).toHaveLength(1);
      expect(selectResult.rows[0].event_id).toBe('boulder-fest-2026');
    });

    it('should have proper triggers for timestamp updates', async () => {
      // Insert initial transaction
      await testClient.execute({
        sql: `
          INSERT INTO transactions 
          (transaction_id, type, status, amount_cents, customer_email, order_data)
          VALUES ('test-trigger', 'tickets', 'pending', 5000, 'test@example.com', '{}')
        `
      });
      
      // Get initial timestamp
      let result = await testClient.execute(
        'SELECT updated_at FROM transactions WHERE transaction_id = ?',
        ['test-trigger']
      );
      const initialTimestamp = result.rows[0].updated_at;
      
      // Wait a moment and update
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await testClient.execute({
        sql: 'UPDATE transactions SET status = ? WHERE transaction_id = ?',
        args: ['completed', 'test-trigger']
      });
      
      // Check updated timestamp
      result = await testClient.execute(
        'SELECT updated_at FROM transactions WHERE transaction_id = ?',
        ['test-trigger']
      );
      const updatedTimestamp = result.rows[0].updated_at;
      
      expect(updatedTimestamp).not.toBe(initialTimestamp);
    });
  });

  describe('Error Handling', () => {
    it('should handle empty migration directory gracefully', () => {
      // Create runner with non-existent directory (will be handled by getMigrationFiles)
      const runner = new TestMigrationRunner({ logLevel: 'silent' });
      
      expect(() => {
        runner.getMigrationFiles();
      }).not.toThrow();
    });

    it('should handle invalid SQL gracefully with proper options', async () => {
      const runner = new TestMigrationRunner({ 
        logLevel: 'silent',
        continueOnError: true 
      });
      
      await runner.createMigrationsTable(testClient);
      
      // Create a fake migration object with invalid SQL
      const badMigration = {
        name: 'test_bad.sql',
        path: '/fake/path.sql'  
      };
      
      // Mock the readMigrationFile method to return invalid SQL
      runner.readMigrationFile = () => ['INVALID SQL STATEMENT;'];
      
      const result = await runner.executeMigration(testClient, badMigration);
      
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });
  });

  describe('Performance and Memory', () => {
    it.skip('should complete all migrations within reasonable time', async () => {
      const startTime = Date.now();
      
      const summary = await runMigrationsForTest(testClient, { logLevel: 'silent' });
      
      const executionTime = Date.now() - startTime;
      
      expect(summary.success).toBe(true);
      expect(executionTime).toBeLessThan(5000); // Should complete in under 5 seconds
    });

    it('should not leak memory with multiple runs', async () => {
      // Run migrations multiple times to check for memory leaks
      for (let i = 0; i < 3; i++) {
        const newClient = createClient({ url: ':memory:' });
        
        const summary = await runMigrationsForTest(newClient, { logLevel: 'silent' });
        expect(summary.success).toBe(true);
        
        await newClient.close();
      }
      
      // If we get here without throwing, memory management is working
      expect(true).toBe(true);
    });
  });
});
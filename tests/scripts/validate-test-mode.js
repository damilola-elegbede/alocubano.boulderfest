#!/usr/bin/env node

/**
 * Test Mode Validation Script
 * Comprehensive validation of test mode functionality and data integrity
 */

import { getDatabaseClient } from '../../lib/database.js';
import { getCurrentEnvironmentConfig, validateTestData, detectEnvironment } from '../config/test-mode-config.js';
import { validateTestDataIsolation, cleanupTestTickets } from '../helpers/ticket-test-helpers.js';

class TestModeValidator {
  constructor() {
    this.client = null;
    this.config = getCurrentEnvironmentConfig();
    this.environment = detectEnvironment();
    this.errors = [];
    this.warnings = [];
    this.validations = {
      total: 0,
      passed: 0,
      failed: 0
    };
  }

  async initialize() {
    try {
      this.client = await getDatabaseClient();
      console.log(`🚀 Test Mode Validator initialized for environment: ${this.environment}`);
      console.log(`📋 Configuration: ${JSON.stringify(this.config, null, 2)}`);
    } catch (error) {
      this.addError('Failed to initialize database client', error);
      throw error;
    }
  }

  async validate() {
    console.log('\n🔍 Starting comprehensive test mode validation...\n');

    await this.validateDatabaseSchema();
    await this.validateTestDataStructure();
    await this.validateDataIsolation();
    await this.validateIndexes();
    await this.validateTriggers();
    await this.validateViews();
    await this.validateCleanupSystem();
    await this.validatePerformance();
    await this.validateSecurity();

    this.printResults();
    return this.errors.length === 0;
  }

  async validateDatabaseSchema() {
    console.log('📊 Validating database schema...');
    await this.runValidation('Database Schema', async () => {
      // Check for is_test columns
      const tables = ['transactions', 'tickets', 'transaction_items'];

      for (const table of tables) {
        const columns = await this.client.execute(`PRAGMA table_info(${table})`);
        const hasIsTestColumn = columns.rows.some(row => row.name === 'is_test');

        if (!hasIsTestColumn) {
          throw new Error(`Table ${table} missing is_test column`);
        }

        // Verify column type and constraints
        const isTestColumn = columns.rows.find(row => row.name === 'is_test');
        if (isTestColumn.type !== 'INTEGER') {
          throw new Error(`Table ${table} is_test column should be INTEGER`);
        }

        if (isTestColumn.notnull !== 1) {
          throw new Error(`Table ${table} is_test column should be NOT NULL`);
        }

        if (isTestColumn.dflt_value !== '0') {
          throw new Error(`Table ${table} is_test column should default to 0`);
        }
      }

      // Check for test_data_cleanup_log table
      const cleanupTable = await this.client.execute(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='test_data_cleanup_log'
      `);

      if (cleanupTable.rows.length === 0) {
        throw new Error('test_data_cleanup_log table missing');
      }
    });
  }

  async validateTestDataStructure() {
    console.log('🏗️ Validating test data structure...');
    await this.runValidation('Test Data Structure', async () => {
      // Check existing test data
      const testTransactions = await this.client.execute(`
        SELECT * FROM transactions WHERE is_test = 1 LIMIT 5
      `);

      const testTickets = await this.client.execute(`
        SELECT * FROM tickets WHERE is_test = 1 LIMIT 5
      `);

      // Validate test transaction structure
      for (const transaction of testTransactions.rows) {
        try {
          validateTestData({
            transactionId: transaction.transaction_id,
            type: transaction.type,
            status: transaction.status,
            amountCents: transaction.amount_cents,
            isTest: transaction.is_test,
            customerEmail: transaction.customer_email
          }, 'transactions');
        } catch (error) {
          if (this.config.requireTestPrefix) {
            throw new Error(`Invalid test transaction ${transaction.transaction_id}: ${error.message}`);
          } else {
            this.addWarning(`Test transaction ${transaction.transaction_id}`, error.message);
          }
        }
      }

      // Validate test ticket structure
      for (const ticket of testTickets.rows) {
        try {
          validateTestData({
            ticketId: ticket.ticket_id,
            ticketType: ticket.ticket_type,
            name: ticket.ticket_type, // Simplified for validation
            price: ticket.price_cents / 100,
            isTestItem: ticket.is_test === 1
          }, 'tickets');
        } catch (error) {
          if (this.config.requireTestPrefix) {
            throw new Error(`Invalid test ticket ${ticket.ticket_id}: ${error.message}`);
          } else {
            this.addWarning(`Test ticket ${ticket.ticket_id}`, error.message);
          }
        }
      }
    });
  }

  async validateDataIsolation() {
    console.log('🔒 Validating data isolation...');
    await this.runValidation('Data Isolation', async () => {
      const isolation = await validateTestDataIsolation();

      if (!isolation.isolation_verified) {
        throw new Error('Data isolation verification failed');
      }

      console.log(`   ✓ Test tickets: ${isolation.test_tickets}`);
      console.log(`   ✓ Production tickets: ${isolation.production_tickets}`);
      console.log(`   ✓ Test transactions: ${isolation.test_transactions}`);
      console.log(`   ✓ Production transactions: ${isolation.production_transactions}`);

      // Verify referential integrity
      const orphanedTickets = await this.client.execute(`
        SELECT COUNT(*) as count
        FROM tickets t
        LEFT JOIN transactions tr ON tr.id = t.transaction_id
        WHERE t.is_test != tr.is_test
      `);

      if (orphanedTickets.rows[0].count > 0) {
        throw new Error(`Found ${orphanedTickets.rows[0].count} tickets with mismatched test mode`);
      }

      const orphanedItems = await this.client.execute(`
        SELECT COUNT(*) as count
        FROM transaction_items ti
        LEFT JOIN transactions tr ON tr.id = ti.transaction_id
        WHERE ti.is_test != tr.is_test
      `);

      if (orphanedItems.rows[0].count > 0) {
        throw new Error(`Found ${orphanedItems.rows[0].count} transaction items with mismatched test mode`);
      }
    });
  }

  async validateIndexes() {
    console.log('📇 Validating database indexes...');
    await this.runValidation('Database Indexes', async () => {
      const expectedIndexes = [
        'idx_transactions_test_mode',
        'idx_transactions_test_mode_lookup',
        'idx_transactions_production_active',
        'idx_tickets_test_mode',
        'idx_tickets_test_mode_lookup',
        'idx_tickets_production_active',
        'idx_transaction_items_test_mode'
      ];

      for (const indexName of expectedIndexes) {
        const tableName = indexName.split('_')[1]; // Extract table name
        const indexes = await this.client.execute(`PRAGMA index_list(${tableName})`);
        const hasIndex = indexes.rows.some(row => row.name === indexName);

        if (!hasIndex) {
          throw new Error(`Missing index: ${indexName} on table ${tableName}`);
        }
      }

      // Test index performance
      const testQuery = await this.client.execute(`
        EXPLAIN QUERY PLAN
        SELECT COUNT(*) FROM tickets WHERE is_test = 1 AND status = 'active'
      `);

      const usesIndex = testQuery.rows.some(row =>
        row.detail.includes('USING INDEX') && row.detail.includes('idx_tickets')
      );

      if (!usesIndex) {
        this.addWarning('Index Usage', 'Query may not be using optimal indexes');
      }
    });
  }

  async validateTriggers() {
    console.log('⚡ Validating database triggers...');
    await this.runValidation('Database Triggers', async () => {
      const expectedTriggers = [
        'trg_test_mode_consistency_transactions',
        'trg_test_mode_consistency_transaction_items',
        'trg_test_cleanup_audit_log',
        'audit_tickets_insert',
        'audit_transactions_insert'
      ];

      for (const triggerName of expectedTriggers) {
        const trigger = await this.client.execute(`
          SELECT name FROM sqlite_master
          WHERE type='trigger' AND name=?
        `, [triggerName]);

        if (trigger.rows.length === 0) {
          throw new Error(`Missing trigger: ${triggerName}`);
        }
      }

      // Test trigger functionality
      await this.testConsistencyTriggers();
    });
  }

  async testConsistencyTriggers() {
    // Test transaction-ticket consistency trigger
    const testTransId = `TEST-TRIGGER-${Date.now()}`;

    await this.client.execute(`
      INSERT INTO transactions (
        transaction_id, type, status, amount_cents, currency,
        customer_email, is_test
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [testTransId, 'purchase', 'completed', 5000, 'USD', 'trigger@test.com', 1]);

    const transResult = await this.client.execute(`
      SELECT id FROM transactions WHERE transaction_id = ?
    `, [testTransId]);
    const transId = transResult.rows[0].id;

    // This should fail due to trigger
    try {
      await this.client.execute(`
        INSERT INTO tickets (
          ticket_id, transaction_id, ticket_type, event_id, price_cents,
          attendee_email, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [`TRIGGER-TICKET-${Date.now()}`, transId, 'general', 1, 5000, 'trigger@test.com', 0]);

      throw new Error('Trigger should have prevented mismatched test mode');
    } catch (error) {
      if (!error.message.includes('Ticket test mode must match parent transaction test mode')) {
        throw error;
      }
      // Expected error - trigger working correctly
    }

    // Cleanup
    await this.client.execute('DELETE FROM transactions WHERE transaction_id = ?', [testTransId]);
  }

  async validateViews() {
    console.log('👁️ Validating database views...');
    await this.runValidation('Database Views', async () => {
      const expectedViews = [
        'v_data_mode_statistics',
        'v_test_cleanup_history',
        'v_active_test_data',
        'v_test_data_cleanup_candidates'
      ];

      for (const viewName of expectedViews) {
        const view = await this.client.execute(`
          SELECT name FROM sqlite_master
          WHERE type='view' AND name=?
        `, [viewName]);

        if (view.rows.length === 0) {
          throw new Error(`Missing view: ${viewName}`);
        }

        // Test view functionality
        try {
          await this.client.execute(`SELECT * FROM ${viewName} LIMIT 1`);
        } catch (error) {
          throw new Error(`View ${viewName} query failed: ${error.message}`);
        }
      }
    });
  }

  async validateCleanupSystem() {
    console.log('🧹 Validating cleanup system...');
    await this.runValidation('Cleanup System', async () => {
      // Test cleanup log table structure
      const cleanupColumns = await this.client.execute('PRAGMA table_info(test_data_cleanup_log)');
      const requiredColumns = [
        'cleanup_id', 'operation_type', 'initiated_by', 'cleanup_criteria',
        'records_identified', 'records_deleted', 'status', 'started_at'
      ];

      for (const column of requiredColumns) {
        const hasColumn = cleanupColumns.rows.some(row => row.name === column);
        if (!hasColumn) {
          throw new Error(`Cleanup log missing column: ${column}`);
        }
      }

      // Test cleanup operation logging
      const cleanupId = `TEST-CLEANUP-VALIDATION-${Date.now()}`;
      await this.client.execute(`
        INSERT INTO test_data_cleanup_log (
          cleanup_id, operation_type, initiated_by, cleanup_criteria,
          records_identified, status, started_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        cleanupId,
        'manual_cleanup',
        'validator',
        JSON.stringify({ test: true }),
        0,
        'completed',
        new Date().toISOString()
      ]);

      // Verify audit log entry was created
      const auditLogs = await this.client.execute(`
        SELECT COUNT(*) as count FROM audit_logs
        WHERE action = 'test_data_cleanup_initiated'
        AND target_id = ?
      `, [cleanupId]);

      if (auditLogs.rows[0].count === 0) {
        throw new Error('Cleanup operation not logged in audit trail');
      }

      // Cleanup test data
      await this.client.execute('DELETE FROM test_data_cleanup_log WHERE cleanup_id = ?', [cleanupId]);
    });
  }

  async validatePerformance() {
    console.log('⚡ Validating performance...');
    await this.runValidation('Performance', async () => {
      // Test query performance with indexes
      const startTime = Date.now();

      await this.client.execute(`
        SELECT t.*, tr.amount_cents
        FROM tickets t
        JOIN transactions tr ON tr.id = t.transaction_id
        WHERE t.is_test = 1
        ORDER BY t.created_at DESC
        LIMIT 100
      `);

      const queryTime = Date.now() - startTime;

      if (queryTime > 1000) {
        this.addWarning('Performance', `Query took ${queryTime}ms (expected < 1000ms)`);
      }

      // Test aggregation query performance
      const aggStartTime = Date.now();

      await this.client.execute(`
        SELECT
          is_test,
          status,
          COUNT(*) as count,
          SUM(amount_cents) as total_amount,
          AVG(amount_cents) as avg_amount
        FROM transactions
        WHERE created_at > datetime('now', '-30 days')
        GROUP BY is_test, status
      `);

      const aggQueryTime = Date.now() - aggStartTime;

      if (aggQueryTime > 2000) {
        this.addWarning('Performance', `Aggregation query took ${aggQueryTime}ms (expected < 2000ms)`);
      }

      console.log(`   ✓ Simple query: ${queryTime}ms`);
      console.log(`   ✓ Aggregation query: ${aggQueryTime}ms`);
    });
  }

  async validateSecurity() {
    console.log('🔐 Validating security...');
    await this.runValidation('Security', async () => {
      // Check for any production data leakage in test queries
      if (this.config.database.isolateTestData) {
        const mixedData = await this.client.execute(`
          SELECT
            SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) as test_count,
            SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END) as prod_count
          FROM transactions
        `);

        const stats = mixedData.rows[0];
        if (stats.test_count > 0 && stats.prod_count > 0) {
          this.addWarning('Security', 'Mixed test and production data detected');
        }
      }

      // Verify test data doesn't contain real customer information
      const testEmails = await this.client.execute(`
        SELECT DISTINCT customer_email
        FROM transactions
        WHERE is_test = 1
        AND customer_email NOT LIKE '%test%'
        AND customer_email NOT LIKE '%@test.com'
        LIMIT 5
      `);

      if (testEmails.rows.length > 0) {
        this.addWarning('Security', 'Test data may contain non-test email addresses');
      }

      // Check for proper audit logging of test operations
      const recentAudits = await this.client.execute(`
        SELECT COUNT(*) as count
        FROM audit_logs
        WHERE created_at > datetime('now', '-1 day')
        AND metadata LIKE '%test_mode%'
      `);

      console.log(`   ✓ Recent test audit logs: ${recentAudits.rows[0].count}`);
    });
  }

  async runValidation(name, validationFn) {
    this.validations.total++;
    try {
      await validationFn();
      this.validations.passed++;
      console.log(`   ✅ ${name}`);
    } catch (error) {
      this.validations.failed++;
      this.addError(name, error);
      console.log(`   ❌ ${name}: ${error.message}`);
    }
  }

  addError(context, error) {
    this.errors.push({
      context,
      message: error.message || error,
      timestamp: new Date().toISOString()
    });
  }

  addWarning(context, message) {
    this.warnings.push({
      context,
      message,
      timestamp: new Date().toISOString()
    });
  }

  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST MODE VALIDATION RESULTS');
    console.log('='.repeat(60));

    console.log(`\n📈 Summary:`);
    console.log(`   Total validations: ${this.validations.total}`);
    console.log(`   Passed: ${this.validations.passed} ✅`);
    console.log(`   Failed: ${this.validations.failed} ❌`);
    console.log(`   Success rate: ${((this.validations.passed / this.validations.total) * 100).toFixed(1)}%`);

    if (this.warnings.length > 0) {
      console.log(`\n⚠️ Warnings (${this.warnings.length}):`);
      this.warnings.forEach(warning => {
        console.log(`   • ${warning.context}: ${warning.message}`);
      });
    }

    if (this.errors.length > 0) {
      console.log(`\n❌ Errors (${this.errors.length}):`);
      this.errors.forEach(error => {
        console.log(`   • ${error.context}: ${error.message}`);
      });
    }

    if (this.errors.length === 0) {
      console.log('\n🎉 All test mode validations passed!');
    } else {
      console.log('\n💥 Test mode validation failed - please fix the errors above');
    }

    console.log('='.repeat(60));
  }

  async cleanup() {
    if (this.client && !this.client.closed) {
      this.client.close();
    }
  }
}

// Main execution
async function main() {
  const validator = new TestModeValidator();

  try {
    await validator.initialize();
    const success = await validator.validate();
    await validator.cleanup();

    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('💥 Validation failed:', error.message);
    await validator.cleanup();
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default TestModeValidator;
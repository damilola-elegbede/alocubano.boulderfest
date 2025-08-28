/**
 * Database Cleanup Utilities for E2E Tests
 * Provides targeted cleanup by test run ID and verification
 */

import { createClient } from '@libsql/client';

/**
 * DatabaseCleanup - Manages test data cleanup operations
 */
export class DatabaseCleanup {
  constructor(databaseUrl = null, authToken = null) {
    // Load from .env.local if not in environment
    if (!process.env.TURSO_DATABASE_URL) {
      require('dotenv').config({ path: '.env.local' });
    }
    
    // Use TURSO_DATABASE_URL from environment (dev/test database for E2E)
    this.databaseUrl = databaseUrl || process.env.TURSO_DATABASE_URL || 'file:data/test.db';
    this.authToken = authToken || process.env.TURSO_AUTH_TOKEN;
    this.client = null;
  }

  /**
   * Initialize database client
   */
  async initialize() {
    if (!this.client) {
      if (!this.databaseUrl) {
        console.warn('TURSO_DATABASE_URL not found, using local SQLite for testing');
        this.databaseUrl = 'file:data/test.db';
      }
      
      this.client = createClient({
        url: this.databaseUrl,
        authToken: this.authToken
      });
      
      // Test connection
      await this.client.execute('SELECT 1');
    }
    return this.client;
  }

  /**
   * Clean up data by test run ID
   */
  async cleanupByTestRunId(testRunId) {
    await this.initialize();
    
    const cleanupResults = {
      testRunId,
      timestamp: new Date().toISOString(),
      deleted: {}
    };

    try {
      // Clean up transactions first (foreign key constraints)
      const txnResult = await this.client.execute({
        sql: `DELETE FROM transactions WHERE transaction_id LIKE ? OR metadata LIKE ?`,
        args: [`%${testRunId}%`, `%${testRunId}%`]
      });
      cleanupResults.deleted.transactions = txnResult.rowsAffected || 0;

      // Clean up registrations
      const regResult = await this.client.execute({
        sql: `DELETE FROM registrations WHERE 
              registration_id LIKE ? OR 
              customer_email LIKE ? OR
              ticket_id LIKE ?`,
        args: [`%${testRunId}%`, `%${testRunId}%`, `%${testRunId}%`]
      });
      cleanupResults.deleted.registrations = regResult.rowsAffected || 0;

      // Clean up email subscribers
      const emailResult = await this.client.execute({
        sql: `DELETE FROM email_subscribers WHERE 
              email LIKE ? OR 
              source = 'e2e-test'`,
        args: [`%${testRunId}%`]
      });
      cleanupResults.deleted.emailSubscribers = emailResult.rowsAffected || 0;

      // Clean up tickets if table exists
      try {
        const ticketResult = await this.client.execute({
          sql: `DELETE FROM tickets WHERE ticket_id LIKE ?`,
          args: [`%${testRunId}%`]
        });
        cleanupResults.deleted.tickets = ticketResult.rowsAffected || 0;
      } catch (error) {
        // Table might not exist
        cleanupResults.deleted.tickets = 0;
      }

      // Clean up gallery items if table exists
      try {
        const galleryResult = await this.client.execute({
          sql: `DELETE FROM gallery_items WHERE id LIKE ?`,
          args: [`%${testRunId}%`]
        });
        cleanupResults.deleted.galleryItems = galleryResult.rowsAffected || 0;
      } catch (error) {
        // Table might not exist
        cleanupResults.deleted.galleryItems = 0;
      }

      cleanupResults.success = true;
      cleanupResults.totalDeleted = Object.values(cleanupResults.deleted).reduce((a, b) => a + b, 0);

    } catch (error) {
      cleanupResults.success = false;
      cleanupResults.error = error.message;
    }

    return cleanupResults;
  }

  /**
   * Clean up legacy test data (older patterns)
   */
  async cleanupLegacyTestData() {
    await this.initialize();
    
    const patterns = [
      '%@e2e-test.%',
      '%_test_%',
      '%E2E%',
      'test_%',
      '%@test.com%'
    ];
    
    const results = {
      timestamp: new Date().toISOString(),
      deleted: {}
    };

    try {
      // Clean registrations with test patterns
      for (const pattern of patterns) {
        const result = await this.client.execute({
          sql: `DELETE FROM registrations WHERE 
                customer_email LIKE ? AND 
                created_at < datetime('now', '-1 day')`,
          args: [pattern]
        });
        results.deleted.registrations = (results.deleted.registrations || 0) + (result.rowsAffected || 0);
      }

      // Clean email subscribers with test patterns
      const emailResult = await this.client.execute({
        sql: `DELETE FROM email_subscribers WHERE 
              (email LIKE '%@e2e-test.%' OR 
               email LIKE '%@test.com' OR 
               source = 'e2e-test') AND
              subscribed_at < datetime('now', '-1 day')`
      });
      results.deleted.emailSubscribers = emailResult.rowsAffected || 0;

      results.success = true;
      results.totalDeleted = Object.values(results.deleted).reduce((a, b) => a + b, 0);

    } catch (error) {
      results.success = false;
      results.error = error.message;
    }

    return results;
  }

  /**
   * Verify cleanup was successful
   */
  async verifyCleanup(testRunId) {
    await this.initialize();
    
    const verification = {
      testRunId,
      timestamp: new Date().toISOString(),
      remaining: {}
    };

    try {
      // Check registrations
      const regCheck = await this.client.execute({
        sql: `SELECT COUNT(*) as count FROM registrations WHERE 
              registration_id LIKE ? OR 
              customer_email LIKE ? OR
              ticket_id LIKE ?`,
        args: [`%${testRunId}%`, `%${testRunId}%`, `%${testRunId}%`]
      });
      verification.remaining.registrations = regCheck.rows[0]?.count || 0;

      // Check email subscribers
      const emailCheck = await this.client.execute({
        sql: `SELECT COUNT(*) as count FROM email_subscribers WHERE email LIKE ?`,
        args: [`%${testRunId}%`]
      });
      verification.remaining.emailSubscribers = emailCheck.rows[0]?.count || 0;

      // Check transactions
      try {
        const txnCheck = await this.client.execute({
          sql: `SELECT COUNT(*) as count FROM transactions WHERE 
                transaction_id LIKE ? OR metadata LIKE ?`,
          args: [`%${testRunId}%`, `%${testRunId}%`]
        });
        verification.remaining.transactions = txnCheck.rows[0]?.count || 0;
      } catch {
        verification.remaining.transactions = 0;
      }

      verification.clean = Object.values(verification.remaining).every(count => count === 0);
      verification.success = true;

    } catch (error) {
      verification.success = false;
      verification.error = error.message;
    }

    return verification;
  }

  /**
   * Complete database reset (use with caution)
   */
  async resetDatabase() {
    await this.initialize();
    
    // Safety check - only allow in test environment
    if (process.env.NODE_ENV !== 'test' && !process.env.E2E_TEST_MODE) {
      throw new Error('Database reset only allowed in test environment');
    }

    const results = {
      timestamp: new Date().toISOString(),
      reset: {}
    };

    try {
      // Delete all test data from tables
      const tables = [
        'registrations',
        'email_subscribers',
        'transactions',
        'tickets',
        'gallery_items'
      ];

      for (const table of tables) {
        try {
          // Only delete E2E test data, not seed data
          const result = await this.client.execute({
            sql: `DELETE FROM ${table} WHERE 
                  ${table === 'email_subscribers' ? 'email' : table === 'registrations' ? 'customer_email' : 'id'} 
                  LIKE '%E2E%' OR 
                  ${table === 'email_subscribers' ? 'email' : table === 'registrations' ? 'customer_email' : 'id'} 
                  LIKE '%@e2e-test.%'`
          });
          results.reset[table] = result.rowsAffected || 0;
        } catch (error) {
          // Table might not exist
          results.reset[table] = `skipped: ${error.message}`;
        }
      }

      results.success = true;
    } catch (error) {
      results.success = false;
      results.error = error.message;
    }

    return results;
  }

  /**
   * Get test data statistics
   */
  async getTestDataStats() {
    await this.initialize();
    
    const stats = {
      timestamp: new Date().toISOString(),
      counts: {}
    };

    try {
      // Count test registrations
      const regCount = await this.client.execute({
        sql: `SELECT COUNT(*) as count FROM registrations WHERE 
              customer_email LIKE '%@e2e-test.%' OR 
              customer_email LIKE '%E2E%'`
      });
      stats.counts.testRegistrations = regCount.rows[0]?.count || 0;

      // Count test email subscribers  
      const emailCount = await this.client.execute({
        sql: `SELECT COUNT(*) as count FROM email_subscribers WHERE 
              email LIKE '%@e2e-test.%' OR 
              email LIKE '%E2E%' OR
              source = 'e2e-test'`
      });
      stats.counts.testEmailSubscribers = emailCount.rows[0]?.count || 0;

      // Get test run IDs
      const testRuns = await this.client.execute({
        sql: `SELECT DISTINCT 
              SUBSTR(customer_email, 1, INSTR(customer_email, '_customer') - 1) as test_run_id,
              COUNT(*) as count,
              MIN(created_at) as started_at
              FROM registrations 
              WHERE customer_email LIKE 'E2E%'
              GROUP BY test_run_id
              ORDER BY started_at DESC
              LIMIT 10`
      });
      stats.recentTestRuns = testRuns.rows || [];

      stats.success = true;
    } catch (error) {
      stats.success = false;
      stats.error = error.message;
    }

    return stats;
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.client) {
      // LibSQL client doesn't have explicit close, but we can clear reference
      this.client = null;
    }
  }
}

// Helper functions for common operations
export async function cleanupTestRun(testRunId) {
  const cleanup = new DatabaseCleanup();
  const result = await cleanup.cleanupByTestRunId(testRunId);
  await cleanup.close();
  return result;
}

export async function verifyTestCleanup(testRunId) {
  const cleanup = new DatabaseCleanup();
  const result = await cleanup.verifyCleanup(testRunId);
  await cleanup.close();
  return result;
}

export async function cleanupAllTestData() {
  const cleanup = new DatabaseCleanup();
  const result = await cleanup.resetDatabase();
  await cleanup.close();
  return result;
}

export async function getTestStats() {
  const cleanup = new DatabaseCleanup();
  const result = await cleanup.getTestDataStats();
  await cleanup.close();
  return result;
}

export default DatabaseCleanup;
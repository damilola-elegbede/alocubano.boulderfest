/**
 * Database Helper - Advanced database operations for E2E testing
 *
 * Provides database utilities for complex E2E scenarios including
 * data setup, validation, cleanup, and transaction management.
 */

import { generateTestId } from './test-isolation.js';

/**
 * Database Helper Class - Manages database operations for testing
 */
export class DatabaseHelper {
  constructor(options = {}) {
    this.testId = options.testId || generateTestId('db_helper');
    this.connectionConfig = options.connectionConfig || this.getDefaultConfig();
    this.cleanupQueries = new Set();
    this.createdRecords = new Map();

    console.log(`🗄️  Database Helper initialized: ${this.testId}`);
  }

  /**
   * Get default database configuration for testing
   * @returns {Object} Default database configuration
   */
  getDefaultConfig() {
    // Use environment-appropriate database configuration
    const isCI = process.env.CI === 'true';
    const isE2E = process.env.NODE_ENV === 'e2e';

    if (isE2E && process.env.TURSO_DATABASE_URL) {
      // E2E tests use production database
      return {
        type: 'turso',
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN
      };
    } else {
      // Unit tests use in-memory SQLite
      return {
        type: 'sqlite',
        url: 'file::memory:'
      };
    }
  }

  /**
   * Execute a database query (mock implementation for now)
   * @param {string} query - SQL query to execute
   * @param {Array} params - Query parameters
   * @returns {Promise<Object>} Query result
   */
  async executeQuery(query, params = []) {
    console.log(`🔍 Executing query: ${query.substring(0, 100)}...`);

    // This is a mock implementation
    // In a real scenario, this would connect to the actual database
    const mockResult = {
      rows: [],
      rowsAffected: 0,
      lastInsertId: null,
      query,
      params,
      executedAt: Date.now()
    };

    // Simulate different query types
    if (query.trim().toLowerCase().startsWith('select')) {
      mockResult.rows = this.generateMockRows(query);
    } else if (query.trim().toLowerCase().startsWith('insert')) {
      mockResult.rowsAffected = 1;
      mockResult.lastInsertId = generateTestId('record');
    } else if (query.trim().toLowerCase().startsWith('update')) {
      mockResult.rowsAffected = 1;
    } else if (query.trim().toLowerCase().startsWith('delete')) {
      mockResult.rowsAffected = 1;
    }

    return mockResult;
  }

  /**
   * Generate mock rows for SELECT queries
   * @param {string} query - The SELECT query
   * @returns {Array} Mock rows
   */
  generateMockRows(query) {
    // Simple mock row generation based on query
    if (query.includes('newsletters')) {
      return [
        {
          id: 1,
          email: 'test@example.com',
          subscribed: true,
          created_at: new Date().toISOString()
        }
      ];
    } else if (query.includes('tickets')) {
      return [
        {
          id: generateTestId('ticket'),
          type: 'weekend-pass',
          price: 85.00,
          status: 'available',
          created_at: new Date().toISOString()
        }
      ];
    } else if (query.includes('registrations')) {
      return [
        {
          id: generateTestId('registration'),
          ticket_id: generateTestId('ticket'),
          user_email: 'test@example.com',
          status: 'pending',
          created_at: new Date().toISOString()
        }
      ];
    }

    return [];
  }

  /**
   * Insert test data with automatic cleanup tracking
   * @param {string} table - Table name
   * @param {Object} data - Data to insert
   * @returns {Promise<Object>} Insert result
   */
  async insertTestData(table, data) {
    const recordId = data.id || generateTestId(`${table}_record`);
    const enrichedData = {
      ...data,
      id: recordId,
      test_session: this.testId,
      created_at: new Date().toISOString()
    };

    // Build INSERT query
    const columns = Object.keys(enrichedData);
    const placeholders = columns.map(() => '?').join(', ');
    const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
    const params = Object.values(enrichedData);

    const result = await this.executeQuery(query, params);

    // Track for cleanup
    this.trackRecord(table, recordId, enrichedData);
    this.addCleanupQuery(`DELETE FROM ${table} WHERE id = ?`, [recordId]);

    console.log(`✅ Inserted test data into ${table}: ${recordId}`);
    return { ...result, recordId, data: enrichedData };
  }

  /**
   * Update test data
   * @param {string} table - Table name
   * @param {string} id - Record ID
   * @param {Object} updates - Data to update
   * @returns {Promise<Object>} Update result
   */
  async updateTestData(table, id, updates) {
    const enrichedUpdates = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    const setClause = Object.keys(enrichedUpdates)
      .map(key => `${key} = ?`)
      .join(', ');

    const query = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
    const params = [...Object.values(enrichedUpdates), id];

    const result = await this.executeQuery(query, params);

    console.log(`✅ Updated test data in ${table}: ${id}`);
    return result;
  }

  /**
   * Find test data
   * @param {string} table - Table name
   * @param {Object} conditions - Where conditions
   * @returns {Promise<Array>} Found records
   */
  async findTestData(table, conditions = {}) {
    const whereClause = Object.keys(conditions).length > 0
      ? 'WHERE ' + Object.keys(conditions).map(key => `${key} = ?`).join(' AND ')
      : '';

    const query = `SELECT * FROM ${table} ${whereClause}`;
    const params = Object.values(conditions);

    const result = await this.executeQuery(query, params);

    console.log(`🔍 Found ${result.rows.length} records in ${table}`);
    return result.rows;
  }

  /**
   * Delete test data
   * @param {string} table - Table name
   * @param {Object} conditions - Where conditions
   * @returns {Promise<Object>} Delete result
   */
  async deleteTestData(table, conditions = {}) {
    if (Object.keys(conditions).length === 0) {
      throw new Error('Delete conditions required for safety');
    }

    const whereClause = Object.keys(conditions)
      .map(key => `${key} = ?`)
      .join(' AND ');

    const query = `DELETE FROM ${table} WHERE ${whereClause}`;
    const params = Object.values(conditions);

    const result = await this.executeQuery(query, params);

    console.log(`🗑️  Deleted ${result.rowsAffected} records from ${table}`);
    return result;
  }

  /**
   * Setup test user with complete profile
   * @param {Object} userData - User data
   * @returns {Promise<Object>} Created user
   */
  async setupTestUser(userData) {
    const user = {
      id: generateTestId('user'),
      email: userData.email,
      first_name: userData.firstName || 'Test',
      last_name: userData.lastName || 'User',
      phone: userData.phone || '+1234567890',
      accessibility_needs: userData.accessibilityNeeds || '',
      created_at: new Date().toISOString(),
      test_session: this.testId
    };

    await this.insertTestData('users', user);

    console.log(`👤 Setup test user: ${user.email}`);
    return user;
  }

  /**
   * Setup test ticket
   * @param {Object} ticketData - Ticket data
   * @returns {Promise<Object>} Created ticket
   */
  async setupTestTicket(ticketData) {
    const ticket = {
      id: generateTestId('ticket'),
      type: ticketData.type || 'weekend-pass',
      price: ticketData.price || 85.00,
      status: ticketData.status || 'available',
      purchase_id: ticketData.purchaseId || generateTestId('purchase'),
      buyer_email: ticketData.buyerEmail || 'test@example.com',
      created_at: new Date().toISOString(),
      test_session: this.testId
    };

    await this.insertTestData('tickets', ticket);

    console.log(`🎫 Setup test ticket: ${ticket.id}`);
    return ticket;
  }

  /**
   * Setup test registration
   * @param {Object} user - User data
   * @param {Object} ticket - Ticket data
   * @returns {Promise<Object>} Created registration
   */
  async setupTestRegistration(user, ticket) {
    const registration = {
      id: generateTestId('registration'),
      ticket_id: ticket.id,
      user_id: user.id,
      user_email: user.email,
      status: 'pending',
      registration_data: JSON.stringify({
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        accessibilityNeeds: user.accessibility_needs
      }),
      created_at: new Date().toISOString(),
      test_session: this.testId
    };

    await this.insertTestData('registrations', registration);

    console.log(`📝 Setup test registration: ${registration.id}`);
    return registration;
  }

  /**
   * Verify database state
   * @param {Array} assertions - Array of assertion objects
   * @returns {Promise<Object>} Verification results
   */
  async verifyDatabaseState(assertions) {
    const results = {
      passed: 0,
      failed: 0,
      details: []
    };

    for (const assertion of assertions) {
      try {
        const { table, conditions, expected, operation = 'count' } = assertion;
        const records = await this.findTestData(table, conditions);

        let actual;
        switch (operation) {
          case 'count':
            actual = records.length;
            break;
          case 'exists':
            actual = records.length > 0;
            break;
          case 'not_exists':
            actual = records.length === 0;
            break;
          default:
            actual = records;
        }

        const passed = (operation === 'count' && actual === expected) ||
                      (operation === 'exists' && actual === true && expected === true) ||
                      (operation === 'not_exists' && actual === true && expected === true);

        if (passed) {
          results.passed++;
          console.log(`✅ Database assertion passed: ${table} ${operation} ${expected}`);
        } else {
          results.failed++;
          console.log(`❌ Database assertion failed: ${table} ${operation} expected ${expected}, got ${actual}`);
        }

        results.details.push({
          table,
          conditions,
          operation,
          expected,
          actual,
          passed
        });

      } catch (error) {
        results.failed++;
        results.details.push({
          ...assertion,
          error: error.message,
          passed: false
        });
        console.log(`❌ Database assertion error: ${error.message}`);
      }
    }

    console.log(`🔍 Database verification: ${results.passed} passed, ${results.failed} failed`);
    return results;
  }

  /**
   * Track a created record for cleanup
   * @param {string} table - Table name
   * @param {string} id - Record ID
   * @param {Object} data - Record data
   */
  trackRecord(table, id, data) {
    const key = `${table}:${id}`;
    this.createdRecords.set(key, {
      table,
      id,
      data,
      createdAt: Date.now()
    });
  }

  /**
   * Add cleanup query
   * @param {string} query - Cleanup query
   * @param {Array} params - Query parameters
   */
  addCleanupQuery(query, params = []) {
    this.cleanupQueries.add({ query, params, addedAt: Date.now() });
  }

  /**
   * Get helper statistics
   * @returns {Object} Helper statistics
   */
  getStats() {
    return {
      testId: this.testId,
      createdRecords: this.createdRecords.size,
      cleanupQueries: this.cleanupQueries.size,
      connectionConfig: this.connectionConfig
    };
  }

  /**
   * Execute all cleanup queries
   * @returns {Promise<Object>} Cleanup results
   */
  async cleanup() {
    console.log(`🧹 Starting database cleanup for ${this.testId}`);

    let cleaned = 0;
    let errors = 0;

    // Execute cleanup queries in reverse order (LIFO)
    const queries = Array.from(this.cleanupQueries).reverse();

    for (const { query, params } of queries) {
      try {
        await this.executeQuery(query, params);
        cleaned++;
        console.log(`🧹 Executed cleanup query: ${query.substring(0, 50)}...`);
      } catch (error) {
        errors++;
        console.error(`❌ Cleanup query failed: ${query}`, error);
      }
    }

    // Clear tracking
    this.createdRecords.clear();
    this.cleanupQueries.clear();

    const result = { cleaned, errors, testId: this.testId };
    console.log(`✅ Database cleanup completed:`, result);
    return result;
  }

  /**
   * Export tracked data for debugging
   * @returns {Object} All tracked data
   */
  exportData() {
    return {
      testId: this.testId,
      stats: this.getStats(),
      createdRecords: Array.from(this.createdRecords.entries()).map(([key, value]) => ({
        key,
        ...value
      })),
      cleanupQueries: Array.from(this.cleanupQueries)
    };
  }
}

/**
 * Create a new database helper instance
 * @param {Object} options - Helper options
 * @returns {DatabaseHelper} New helper instance
 */
export function createDatabaseHelper(options = {}) {
  return new DatabaseHelper(options);
}

export default DatabaseHelper;
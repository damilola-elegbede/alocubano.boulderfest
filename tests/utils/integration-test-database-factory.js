/**
 * Integration Test Database Factory
 * 
 * Provides guaranteed real LibSQL database clients for integration tests.
 * Prevents mock contamination and ensures proper database operations.
 * 
 * Key Features:
 * - Direct LibSQL client creation bypassing service layer mocking
 * - Per-test database isolation with unique file paths
 * - Real client validation and error reporting
 * - Automatic cleanup and resource management
 * 
 * @author Principal Architect
 * @version 1.0.0 - Integration Test Architecture Fix
 */

import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

export class IntegrationTestDatabaseFactory {
  constructor() {
    this.realClients = new Map();
    this.testDatabases = new Map();
    this.debugMode = process.env.TEST_DEBUG === 'true';
  }

  /**
   * Create a real LibSQL database client for integration tests
   * @param {Object} testContext - Test context information
   * @returns {Promise<Object>} Real LibSQL client instance
   */
  async createRealDatabaseClient(testContext = {}) {
    const testId = this._generateTestId(testContext);
    
    if (this.realClients.has(testId)) {
      const existingClient = this.realClients.get(testId);
      // Verify existing client is still valid
      if (await this._validateClient(existingClient)) {
        return existingClient;
      }
      // Invalid client - remove and create new
      this.realClients.delete(testId);
      this.testDatabases.delete(testId);
    }

    try {
      // Create dedicated test database file
      const testDbPath = await this._createTestDatabasePath(testId);
      
      // Force real LibSQL client creation
      const client = await this._createLibSQLClient(testDbPath);
      
      // Validate client is real and functional
      await this._validateRealClient(client, testContext);
      
      // Cache for reuse within same test
      this.realClients.set(testId, client);
      this.testDatabases.set(testId, testDbPath);
      
      if (this.debugMode) {
        console.log(`[IntegrationTestDatabaseFactory] Created real client for ${testId}: ${testDbPath}`);
      }
      
      return client;
    } catch (error) {
      console.error(`❌ Failed to create real database client for ${testId}:`, error);
      throw new Error(`Integration test database client creation failed: ${error.message}`);
    }
  }

  /**
   * Create LibSQL client directly, bypassing service layer
   * @param {string} databasePath - Path to database file
   * @returns {Promise<Object>} LibSQL client instance
   */
  async _createLibSQLClient(databasePath) {
    try {
      // Import LibSQL client directly (not through service layer)
      let createClient;
      
      try {
        // Try Node.js client first
        const libsqlNode = await import('@libsql/client');
        createClient = libsqlNode.createClient;
      } catch (nodeError) {
        console.warn('Node.js LibSQL client not available, trying web client:', nodeError.message);
        // Fallback to web client
        const libsqlWeb = await import('@libsql/client/web');
        createClient = libsqlWeb.createClient;
      }

      // Create client with file database
      const client = createClient({
        url: `file:${databasePath}`
      });

      // Test client immediately to ensure it works
      const testResult = await client.execute('SELECT 1 as test');
      
      if (!testResult || !testResult.rows || testResult.rows.length !== 1) {
        throw new Error('Client test query failed - invalid response');
      }

      // Test insert operations to verify lastInsertRowid support
      await client.execute('CREATE TABLE IF NOT EXISTS test_table (id INTEGER PRIMARY KEY, value TEXT)');
      const insertResult = await client.execute('INSERT INTO test_table (value) VALUES (?)', ['test']);
      
      if (!insertResult.hasOwnProperty('lastInsertRowid')) {
        throw new Error('Client does not support lastInsertRowid - required for integration tests');
      }

      // Clean up test table
      await client.execute('DROP TABLE test_table');
      
      console.log(`✅ Real LibSQL client created and validated: ${databasePath}`);
      return client;
    } catch (error) {
      throw new Error(`LibSQL client creation failed: ${error.message}`);
    }
  }

  /**
   * Create unique test database file path
   * @param {string} testId - Unique test identifier
   * @returns {Promise<string>} Absolute path to test database file
   */
  async _createTestDatabasePath(testId) {
    // Get current working directory
    const projectRoot = process.cwd();
    
    // Create test-specific database in temp directory
    const testDbDir = path.join(projectRoot, '.tmp', 'test-databases');
    
    // Ensure directory exists
    try {
      const fs = await import('fs/promises');
      await fs.mkdir(testDbDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw new Error(`Failed to create test database directory: ${error.message}`);
      }
    }
    
    // Create unique database file path
    const dbFileName = `test-${testId}.db`;
    const dbPath = path.join(testDbDir, dbFileName);
    
    // Remove existing file if present
    try {
      const fs = await import('fs/promises');
      await fs.unlink(dbPath);
    } catch (error) {
      // File doesn't exist - that's fine
    }
    
    return dbPath;
  }

  /**
   * Generate unique test identifier
   * @param {Object} testContext - Test context
   * @returns {string} Unique test ID
   */
  _generateTestId(testContext) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    
    let testName = 'unknown';
    if (testContext.file && testContext.file.filepath) {
      testName = path.basename(testContext.file.filepath, '.test.js');
    } else if (testContext.file && testContext.file.name) {
      testName = path.basename(testContext.file.name, '.test.js');
    }
    
    return `${testName}-${timestamp}-${random}`;
  }

  /**
   * Validate that client is real LibSQL client
   * @param {Object} client - Database client to validate
   * @param {Object} testContext - Test context for error reporting
   * @throws {Error} If client is not valid for integration tests
   */
  async _validateRealClient(client, testContext) {
    const testPath = this._getTestPath(testContext);
    
    // Basic validation
    if (!client) {
      throw new Error(`Database client is null/undefined in integration test: ${testPath}`);
    }

    if (typeof client.execute !== 'function') {
      throw new Error(`Invalid database client - missing execute method in: ${testPath}`);
    }

    // Check for mock indicators (should not be present in real client)
    if (this._isMockClient(client)) {
      throw new Error(
        `Mock database client detected in integration test: ${testPath}\n` +
        `Integration tests must use real LibSQL clients.`
      );
    }

    // Functional validation
    try {
      const result = await client.execute('SELECT 1 as test');
      if (!result || !result.rows || result.rows.length !== 1) {
        throw new Error('Client functional test failed');
      }
    } catch (error) {
      throw new Error(`Database client functional validation failed: ${error.message}`);
    }

    console.log(`✅ Real LibSQL client validated for integration test: ${testPath}`);
  }

  /**
   * Validate existing client is still functional
   * @param {Object} client - Client to validate
   * @returns {Promise<boolean>} True if client is still valid
   */
  async _validateClient(client) {
    try {
      if (!client || typeof client.execute !== 'function') {
        return false;
      }
      
      const result = await client.execute('SELECT 1 as test');
      return result && result.rows && result.rows.length === 1;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if client has mock indicators
   * @param {Object} client - Client to check
   * @returns {boolean} True if client appears to be a mock
   */
  _isMockClient(client) {
    if (!client) return false;

    const mockIndicators = [
      // Vitest mock indicators
      client._isMockFunction,
      client.__vitest_mock__,
      client.mockImplementation,
      client.mockResolvedValue,
      client.mockRejectedValue,
      
      // Function-level mock indicators
      client.execute && client.execute._isMockFunction,
      client.execute && client.execute.__vitest_mock__,
      client.execute && client.execute.mockImplementation,
      
      // Constructor name indicators
      client.constructor && client.constructor.name.includes('Mock'),
      client.constructor && client.constructor.name.includes('Spy'),
      
      // Property indicators
      Object.keys(client).some(key => key.includes('mock') || key.includes('Mock')),
    ];

    return mockIndicators.some(indicator => Boolean(indicator));
  }

  /**
   * Get test path from context
   * @param {Object} testContext - Test context
   * @returns {string} Test file path
   */
  _getTestPath(testContext) {
    try {
      return testContext?.file?.filepath || 
             testContext?.file?.name || 
             testContext?.filepath ||
             'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Clean up test databases and clients
   * @param {string} testId - Optional specific test ID to clean
   */
  async cleanup(testId = null) {
    const idsToClean = testId ? [testId] : Array.from(this.testDatabases.keys());
    
    for (const id of idsToClean) {
      try {
        // Close client if exists
        const client = this.realClients.get(id);
        if (client && typeof client.close === 'function') {
          client.close();
        }
        
        // Remove database file
        const dbPath = this.testDatabases.get(id);
        if (dbPath) {
          const fs = await import('fs/promises');
          await fs.unlink(dbPath);
          
          if (this.debugMode) {
            console.log(`[IntegrationTestDatabaseFactory] Cleaned up database: ${dbPath}`);
          }
        }
        
        // Remove from caches
        this.realClients.delete(id);
        this.testDatabases.delete(id);
      } catch (error) {
        console.warn(`Warning: Failed to clean up test database ${id}:`, error.message);
      }
    }
  }

  /**
   * Clean up all test databases
   */
  async cleanupAll() {
    await this.cleanup();
  }

  /**
   * Get diagnostics information
   * @returns {Object} Diagnostic information
   */
  getDiagnostics() {
    return {
      activeClients: this.realClients.size,
      testDatabases: this.testDatabases.size,
      clientIds: Array.from(this.realClients.keys()),
      databasePaths: Array.from(this.testDatabases.values())
    };
  }
}

// Export singleton instance
export const integrationTestDatabaseFactory = new IntegrationTestDatabaseFactory();

// Export convenience function
export async function createRealDatabaseClient(testContext) {
  return integrationTestDatabaseFactory.createRealDatabaseClient(testContext);
}

// Export for testing and debugging
export default IntegrationTestDatabaseFactory;
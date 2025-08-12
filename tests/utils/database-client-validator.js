/**
 * Database Client Validator
 * 
 * Validates database client types and prevents mock contamination in integration tests.
 * Ensures integration tests always use real LibSQL clients while allowing mocks in unit tests.
 * 
 * Key Features:
 * - Strict validation for integration test database clients
 * - Multiple mock detection strategies
 * - Real LibSQL client verification
 * - Detailed error reporting and debugging
 * 
 * @author Principal Architect
 * @version 1.0.0 - Integration Test Architecture Fix
 */

export class DatabaseClientValidator {
  constructor() {
    this.debugMode = process.env.TEST_DEBUG === 'true';
    this.validationHistory = [];
  }

  /**
   * Validate database client for integration tests
   * @param {Object} client - Database client to validate
   * @param {Object} testContext - Test context for error reporting
   * @throws {Error} If client is invalid for integration tests
   * @returns {boolean} True if client is valid
   */
  validateIntegrationClient(client, testContext = {}) {
    const testPath = this._getTestPath(testContext);
    
    try {
      // Basic null/undefined check
      if (!client) {
        throw new Error(`Database client is null/undefined in integration test: ${testPath}`);
      }

      // Check for required methods
      if (typeof client.execute !== 'function') {
        throw new Error(`Invalid database client - missing execute method in: ${testPath}`);
      }

      // Detect and reject mock clients
      if (this.isMockClient(client)) {
        const mockDetails = this.analyzeMockClient(client);
        throw new Error(
          `Mock database client detected in integration test: ${testPath}\n` +
          `Mock type: ${mockDetails.type}\n` +
          `Mock indicators: ${mockDetails.indicators.join(', ')}\n` +
          `Integration tests must use real LibSQL clients.`
        );
      }

      // Validate LibSQL client characteristics
      if (!this.isValidLibSQLClient(client)) {
        const clientInfo = this.analyzeClient(client);
        throw new Error(
          `Database client is not a valid LibSQL client: ${testPath}\n` +
          `Client type: ${clientInfo.type}\n` +
          `Available methods: ${clientInfo.methods.join(', ')}\n` +
          `Expected LibSQL client with execute method returning {rows, lastInsertRowid}.`
        );
      }

      // Log successful validation
      this._logValidation(testPath, 'PASS', 'Valid LibSQL client for integration test');
      
      return true;
    } catch (error) {
      this._logValidation(testPath, 'FAIL', error.message);
      throw error;
    }
  }

  /**
   * Validate database client for unit tests (allows mocks)
   * @param {Object} client - Database client to validate
   * @param {Object} testContext - Test context for error reporting
   * @returns {boolean} True if client is valid for unit tests
   */
  validateUnitClient(client, testContext = {}) {
    const testPath = this._getTestPath(testContext);
    
    try {
      // Basic null/undefined check
      if (!client) {
        throw new Error(`Database client is null/undefined in unit test: ${testPath}`);
      }

      // Check for required methods (mocks or real)
      if (typeof client.execute !== 'function') {
        throw new Error(`Invalid database client - missing execute method in: ${testPath}`);
      }

      // Unit tests can use either mocks or real clients
      const isMock = this.isMockClient(client);
      const isReal = this.isValidLibSQLClient(client);
      
      if (!isMock && !isReal) {
        throw new Error(`Database client is neither a valid mock nor LibSQL client: ${testPath}`);
      }

      this._logValidation(testPath, 'PASS', `Valid ${isMock ? 'mock' : 'LibSQL'} client for unit test`);
      
      return true;
    } catch (error) {
      this._logValidation(testPath, 'FAIL', error.message);
      throw error;
    }
  }

  /**
   * Detect if client is a mock with multiple strategies
   * @param {Object} client - Database client to analyze
   * @returns {boolean} True if client is a mock
   */
  isMockClient(client) {
    if (!client) return false;

    const mockIndicators = [
      // Vitest mock indicators
      client._isMockFunction,
      client.__vitest_mock__,
      client.mockImplementation,
      client.mockResolvedValue,
      client.mockRejectedValue,
      
      // Jest mock indicators (for compatibility)
      client._isMockFunction,
      client.mockClear,
      client.mockReset,
      client.mockRestore,
      
      // Function-level mock indicators
      client.execute && client.execute._isMockFunction,
      client.execute && client.execute.__vitest_mock__,
      client.execute && client.execute.mockImplementation,
      
      // Constructor name indicators
      client.constructor && client.constructor.name.includes('Mock'),
      client.constructor && client.constructor.name.includes('Spy'),
      
      // Prototype indicators
      Object.getPrototypeOf(client).constructor.name.includes('Mock'),
      
      // Property indicators
      Object.keys(client).some(key => key.includes('mock') || key.includes('Mock')),
      
      // Symbol indicators
      Object.getOwnPropertySymbols(client).some(symbol => 
        symbol.toString().includes('mock') || symbol.toString().includes('Mock')
      )
    ];

    return mockIndicators.some(indicator => Boolean(indicator));
  }

  /**
   * Validate if client is a real LibSQL client
   * @param {Object} client - Database client to validate
   * @returns {boolean} True if client appears to be a real LibSQL client
   */
  isValidLibSQLClient(client) {
    if (!client || typeof client.execute !== 'function') {
      return false;
    }

    // Check for LibSQL-specific characteristics
    const libsqlIndicators = [
      // Has required methods
      typeof client.execute === 'function',
      
      // Not a mock (confirmed above)
      !this.isMockClient(client),
      
      // Constructor name patterns
      client.constructor.name === 'Client' ||
      client.constructor.name.includes('LibSQL') ||
      client.constructor.name.includes('Turso'),
      
      // Method signature analysis (LibSQL execute returns {rows, lastInsertRowid})
      this._hasLibSQLSignature(client),
      
      // Property patterns
      !Object.keys(client).some(key => key.includes('mock'))
    ];

    // Require majority of indicators to be true
    const trueCount = libsqlIndicators.filter(Boolean).length;
    return trueCount >= 3;
  }

  /**
   * Analyze mock client to provide detailed information
   * @param {Object} client - Mock client to analyze
   * @returns {Object} Analysis results
   */
  analyzeMockClient(client) {
    const indicators = [];
    let type = 'unknown';

    if (client._isMockFunction || client.__vitest_mock__) {
      type = 'vitest';
      indicators.push('Vitest mock function');
    }

    if (client.mockImplementation) {
      indicators.push('Has mockImplementation');
    }

    if (client.mockResolvedValue) {
      indicators.push('Has mockResolvedValue');
    }

    if (client.constructor.name.includes('Mock')) {
      indicators.push('Constructor name contains Mock');
    }

    if (client.execute && client.execute._isMockFunction) {
      indicators.push('Execute method is mocked');
    }

    return { type, indicators };
  }

  /**
   * Analyze client to provide detailed information
   * @param {Object} client - Client to analyze
   * @returns {Object} Analysis results
   */
  analyzeClient(client) {
    const methods = Object.getOwnPropertyNames(client)
      .filter(name => typeof client[name] === 'function');
    
    const type = client.constructor.name;
    const properties = Object.keys(client);
    
    return {
      type,
      methods,
      properties,
      isMock: this.isMockClient(client),
      isLibSQL: this.isValidLibSQLClient(client)
    };
  }

  /**
   * Check if client has LibSQL method signature patterns
   * @param {Object} client - Client to check
   * @returns {boolean} True if signature matches LibSQL patterns
   */
  _hasLibSQLSignature(client) {
    try {
      // Check if execute method exists and is not obviously mocked
      if (typeof client.execute !== 'function') {
        return false;
      }

      // LibSQL execute method should not have mock properties
      const execute = client.execute;
      const hasMockProperties = [
        execute._isMockFunction,
        execute.__vitest_mock__,
        execute.mockImplementation,
        execute.mockResolvedValue
      ].some(Boolean);

      return !hasMockProperties;
    } catch (error) {
      return false;
    }
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
             process.env.VITEST_TEST_FILE ||
             'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Log validation results
   * @param {string} testPath - Test file path
   * @param {string} result - PASS or FAIL
   * @param {string} message - Validation message
   */
  _logValidation(testPath, result, message) {
    const entry = {
      timestamp: new Date().toISOString(),
      testPath,
      result,
      message
    };

    this.validationHistory.push(entry);
    
    // Keep only last 100 entries
    if (this.validationHistory.length > 100) {
      this.validationHistory = this.validationHistory.slice(-100);
    }

    if (this.debugMode || result === 'FAIL') {
      console.log(`[DatabaseClientValidator] ${result}: ${testPath} - ${message}`);
    }
  }

  /**
   * Get validation history for debugging
   * @returns {Array} Validation history entries
   */
  getValidationHistory() {
    return [...this.validationHistory];
  }

  /**
   * Clear validation history
   */
  clearValidationHistory() {
    this.validationHistory = [];
  }

  /**
   * Enable debug mode
   */
  enableDebug() {
    this.debugMode = true;
  }

  /**
   * Disable debug mode
   */
  disableDebug() {
    this.debugMode = false;
  }

  /**
   * Get validation statistics
   * @returns {Object} Validation statistics
   */
  getValidationStats() {
    const total = this.validationHistory.length;
    const passed = this.validationHistory.filter(entry => entry.result === 'PASS').length;
    const failed = total - passed;
    
    return {
      total,
      passed,
      failed,
      successRate: total > 0 ? (passed / total * 100).toFixed(2) + '%' : '0%'
    };
  }
}

// Export singleton instance
export const databaseClientValidator = new DatabaseClientValidator();

// Export convenience functions
export function validateIntegrationClient(client, testContext) {
  return databaseClientValidator.validateIntegrationClient(client, testContext);
}

export function validateUnitClient(client, testContext) {
  return databaseClientValidator.validateUnitClient(client, testContext);
}

export function isMockClient(client) {
  return databaseClientValidator.isMockClient(client);
}

export function isValidLibSQLClient(client) {
  return databaseClientValidator.isValidLibSQLClient(client);
}

// Export for testing and debugging
export default DatabaseClientValidator;
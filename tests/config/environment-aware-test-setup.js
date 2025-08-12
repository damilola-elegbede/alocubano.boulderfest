/**
 * Environment-Aware Test Setup
 * 
 * Intelligent test setup that provisions correct services based on test type.
 * Ensures integration tests use real database clients and unit tests use appropriate mocks.
 * 
 * Key Features:
 * - Test type detection and environment provisioning
 * - Real database client creation for integration tests
 * - Mock service provisioning for unit tests
 * - Environment variable management
 * - Service validation and health checking
 * 
 * @author Principal Architect
 * @version 1.0.0 - Integration Test Architecture Fix
 */

import { testEnvironmentDetector } from '../utils/test-environment-detector.js';
import { databaseClientValidator } from '../utils/database-client-validator.js';
import { TestEnvironments } from './test-environments.js';

export class EnvironmentAwareTestSetup {
  constructor() {
    this.debugMode = process.env.TEST_DEBUG === 'true';
    this.setupHistory = [];
    this.environmentBackup = null;
  }

  /**
   * Main setup method - detects test type and provisions appropriate environment
   * @param {Object} testContext - Vitest test context
   * @returns {Object} Setup result with services and configuration
   */
  async setupForTest(testContext) {
    const testType = testEnvironmentDetector.detectTestType(testContext);
    const testPath = this._getTestPath(testContext);
    
    this._logSetup(testPath, 'START', `Setting up ${testType} test environment`);
    
    try {
      let setupResult;
      
      switch (testType) {
        case 'integration':
          setupResult = await this.setupIntegrationEnvironment(testContext);
          break;
        case 'unit':
          setupResult = await this.setupUnitEnvironment(testContext);
          break;
        case 'performance':
          setupResult = await this.setupPerformanceEnvironment(testContext);
          break;
        case 'e2e':
          setupResult = await this.setupE2EEnvironment(testContext);
          break;
        default:
          throw new Error(`Unknown test type: ${testType}`);
      }

      this._logSetup(testPath, 'SUCCESS', `${testType} environment setup complete`);
      return setupResult;
      
    } catch (error) {
      this._logSetup(testPath, 'ERROR', `Setup failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Setup environment for integration tests with real services
   * @param {Object} testContext - Test context
   * @returns {Object} Integration environment setup
   */
  async setupIntegrationEnvironment(testContext) {
    const testPath = this._getTestPath(testContext);
    
    // Backup current environment
    this._backupEnvironment();
    
    // Set integration-specific environment variables
    this.setIntegrationEnvironment();
    
    // Force creation of real database client
    const dbClient = await this.createRealDatabaseClient();
    
    // Validate database client is real (not mock)
    databaseClientValidator.validateIntegrationClient(dbClient, testContext);
    
    // Initialize real services
    const services = await this.initializeRealServices(dbClient);
    
    // Perform health checks
    await this.performHealthChecks(services, 'integration');
    
    return {
      testType: 'integration',
      testPath,
      dbClient,
      services,
      environment: 'real',
      cleanup: () => this.cleanupIntegrationEnvironment()
    };
  }

  /**
   * Setup environment for unit tests with mocks
   * @param {Object} testContext - Test context
   * @returns {Object} Unit test environment setup
   */
  async setupUnitEnvironment(testContext) {
    const testPath = this._getTestPath(testContext);
    
    // Backup current environment
    this._backupEnvironment();
    
    // Set unit test environment variables
    this.setUnitEnvironment();
    
    // Create mock database client
    const dbClient = this.createMockDatabaseClient();
    
    // Validate database client (can be mock for unit tests)
    databaseClientValidator.validateUnitClient(dbClient, testContext);
    
    // Initialize mock services
    const services = this.initializeMockServices(dbClient);
    
    return {
      testType: 'unit',
      testPath,
      dbClient,
      services,
      environment: 'mock',
      cleanup: () => this.cleanupUnitEnvironment()
    };
  }

  /**
   * Setup environment for performance tests
   * @param {Object} testContext - Test context
   * @returns {Object} Performance test environment setup
   */
  async setupPerformanceEnvironment(testContext) {
    const testPath = this._getTestPath(testContext);
    
    // Backup current environment
    this._backupEnvironment();
    
    // Set performance test environment (minimal overhead)
    this.setPerformanceEnvironment();
    
    // Use real database client for realistic performance testing
    const dbClient = await this.createRealDatabaseClient();
    
    // Validate database client
    databaseClientValidator.validateIntegrationClient(dbClient, testContext);
    
    // Initialize minimal services for performance testing
    const services = await this.initializeMinimalServices(dbClient);
    
    return {
      testType: 'performance',
      testPath,
      dbClient,
      services,
      environment: 'performance',
      cleanup: () => this.cleanupPerformanceEnvironment()
    };
  }

  /**
   * Setup environment for E2E tests
   * @param {Object} testContext - Test context
   * @returns {Object} E2E test environment setup
   */
  async setupE2EEnvironment(testContext) {
    const testPath = this._getTestPath(testContext);
    
    // Backup current environment
    this._backupEnvironment();
    
    // Set E2E environment (production-like)
    this.setE2EEnvironment();
    
    // Use real database client
    const dbClient = await this.createRealDatabaseClient();
    
    // Validate database client
    databaseClientValidator.validateIntegrationClient(dbClient, testContext);
    
    // Initialize full services stack
    const services = await this.initializeFullServices(dbClient);
    
    return {
      testType: 'e2e',
      testPath,
      dbClient,
      services,
      environment: 'e2e',
      cleanup: () => this.cleanupE2EEnvironment()
    };
  }

  /**
   * Set environment variables for integration tests
   */
  setIntegrationEnvironment() {
    const integrationEnv = TestEnvironments.COMPLETE_TEST;
    
    // Clear test-related environment variables
    this._clearTestEnvironment();
    
    // Apply integration environment
    Object.assign(process.env, integrationEnv);
    
    // Ensure real database URL (not memory)
    if (process.env.TURSO_DATABASE_URL === ':memory:') {
      process.env.TURSO_DATABASE_URL = 'file:integration-test.db';
    }
    
    this._logSetup('environment', 'INFO', 'Integration environment variables set');
  }

  /**
   * Set environment variables for unit tests
   */
  setUnitEnvironment() {
    const unitEnv = TestEnvironments.VALID_LOCAL;
    
    // Clear test-related environment variables
    this._clearTestEnvironment();
    
    // Apply unit test environment with mocks
    Object.assign(process.env, unitEnv);
    
    // Force memory database for unit tests
    process.env.TURSO_DATABASE_URL = ':memory:';
    
    this._logSetup('environment', 'INFO', 'Unit test environment variables set');
  }

  /**
   * Set environment variables for performance tests
   */
  setPerformanceEnvironment() {
    const perfEnv = TestEnvironments.MINIMAL;
    
    // Clear test-related environment variables
    this._clearTestEnvironment();
    
    // Apply minimal environment for performance
    Object.assign(process.env, perfEnv);
    
    // Use real database for realistic performance testing
    process.env.TURSO_DATABASE_URL = 'file:performance-test.db';
    
    this._logSetup('environment', 'INFO', 'Performance test environment variables set');
  }

  /**
   * Set environment variables for E2E tests
   */
  setE2EEnvironment() {
    const e2eEnv = TestEnvironments.PRODUCTION_LIKE;
    
    // Clear test-related environment variables
    this._clearTestEnvironment();
    
    // Apply production-like environment
    Object.assign(process.env, e2eEnv);
    
    this._logSetup('environment', 'INFO', 'E2E test environment variables set');
  }

  /**
   * Create real database client for integration/performance/e2e tests
   * @returns {Object} Real database client
   */
  async createRealDatabaseClient() {
    try {
      // Dynamic import to avoid circular dependencies
      const { getDatabaseClient } = await import('../../api/lib/database.js');
      
      // Get real database client
      const client = await getDatabaseClient();
      
      // Ensure we have a real client
      if (!client || typeof client.execute !== 'function') {
        throw new Error('Failed to create real database client');
      }
      
      // Test connection
      await client.execute('SELECT 1');
      
      this._logSetup('database', 'SUCCESS', 'Real database client created and tested');
      return client;
      
    } catch (error) {
      this._logSetup('database', 'ERROR', `Failed to create real database client: ${error.message}`);
      throw new Error(`Real database client creation failed: ${error.message}`);
    }
  }

  /**
   * Create mock database client for unit tests
   * @returns {Object} Mock database client
   */
  createMockDatabaseClient() {
    const { vi } = require('vitest');
    
    const mockClient = {
      execute: vi.fn(),
      close: vi.fn(),
      _isMockClient: true,
      __vitest_mock__: true
    };
    
    // Default mock implementation
    mockClient.execute.mockResolvedValue({
      rows: [],
      lastInsertRowid: 1
    });
    
    this._logSetup('database', 'SUCCESS', 'Mock database client created');
    return mockClient;
  }

  /**
   * Initialize real services for integration tests
   * @param {Object} dbClient - Database client
   * @returns {Object} Real services
   */
  async initializeRealServices(dbClient) {
    try {
      const services = {};
      
      // Initialize email service
      try {
        const { getEmailSubscriberService } = await import('../../api/lib/email-subscriber-service.js');
        services.emailService = await getEmailSubscriberService();
      } catch (error) {
        console.warn('Email service initialization failed:', error.message);
        services.emailService = null;
      }
      
      // Initialize ticket service
      try {
        const ticketServiceModule = await import('../../api/lib/ticket-service.js');
        services.ticketService = ticketServiceModule.default;
      } catch (error) {
        console.warn('Ticket service initialization failed:', error.message);
        services.ticketService = null;
      }
      
      this._logSetup('services', 'SUCCESS', 'Real services initialized');
      return services;
      
    } catch (error) {
      this._logSetup('services', 'ERROR', `Real services initialization failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Initialize mock services for unit tests
   * @param {Object} dbClient - Mock database client
   * @returns {Object} Mock services
   */
  initializeMockServices(dbClient) {
    const { vi } = require('vitest');
    
    const services = {
      emailService: {
        subscribeToNewsletter: vi.fn().mockResolvedValue({ id: 'brevo_123' }),
        unsubscribeContact: vi.fn().mockResolvedValue({ success: true }),
        healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' }),
        _isMockService: true
      },
      
      ticketService: {
        generateQRCode: vi.fn().mockResolvedValue('mock-qr-code'),
        validateAndCheckIn: vi.fn().mockResolvedValue({ 
          success: true, 
          message: 'Mock check-in successful' 
        }),
        _isMockService: true
      }
    };
    
    this._logSetup('services', 'SUCCESS', 'Mock services initialized');
    return services;
  }

  /**
   * Initialize minimal services for performance tests
   * @param {Object} dbClient - Database client
   * @returns {Object} Minimal services
   */
  async initializeMinimalServices(dbClient) {
    // Only essential services for performance testing
    const services = {
      database: dbClient
    };
    
    this._logSetup('services', 'SUCCESS', 'Minimal services initialized for performance testing');
    return services;
  }

  /**
   * Initialize full services for E2E tests
   * @param {Object} dbClient - Database client
   * @returns {Object} Full services
   */
  async initializeFullServices(dbClient) {
    // Same as real services but with full stack
    return await this.initializeRealServices(dbClient);
  }

  /**
   * Perform health checks on services
   * @param {Object} services - Services to check
   * @param {string} environment - Environment type
   */
  async performHealthChecks(services, environment) {
    const checks = [];
    
    // Database health check
    if (services.database || services.dbClient) {
      checks.push(this._checkDatabaseHealth(services.database || services.dbClient));
    }
    
    // Email service health check
    if (services.emailService && typeof services.emailService.healthCheck === 'function') {
      checks.push(this._checkEmailServiceHealth(services.emailService));
    }
    
    try {
      await Promise.all(checks);
      this._logSetup('health', 'SUCCESS', `${environment} services health checks passed`);
    } catch (error) {
      this._logSetup('health', 'WARN', `Some health checks failed: ${error.message}`);
      // Don't fail setup for health check failures, just warn
    }
  }

  /**
   * Check database health
   * @param {Object} dbClient - Database client
   */
  async _checkDatabaseHealth(dbClient) {
    if (!dbClient || typeof dbClient.execute !== 'function') {
      throw new Error('Database client is not available');
    }
    
    await dbClient.execute('SELECT 1');
  }

  /**
   * Check email service health
   * @param {Object} emailService - Email service
   */
  async _checkEmailServiceHealth(emailService) {
    if (typeof emailService.healthCheck === 'function') {
      await emailService.healthCheck();
    }
  }

  /**
   * Backup current environment
   */
  _backupEnvironment() {
    if (!this.environmentBackup) {
      this.environmentBackup = { ...process.env };
    }
  }

  /**
   * Clear test-related environment variables
   */
  _clearTestEnvironment() {
    const testVars = [
      'TURSO_DATABASE_URL',
      'TURSO_AUTH_TOKEN',
      'BREVO_API_KEY',
      'BREVO_NEWSLETTER_LIST_ID',
      'STRIPE_SECRET_KEY',
      'TEST_TYPE',
      'VITEST_MODE'
    ];
    
    testVars.forEach(varName => {
      delete process.env[varName];
    });
  }

  /**
   * Cleanup integration environment
   */
  async cleanupIntegrationEnvironment() {
    this._restoreEnvironment();
    this._logSetup('cleanup', 'SUCCESS', 'Integration environment cleaned up');
  }

  /**
   * Cleanup unit environment
   */
  async cleanupUnitEnvironment() {
    this._restoreEnvironment();
    this._logSetup('cleanup', 'SUCCESS', 'Unit environment cleaned up');
  }

  /**
   * Cleanup performance environment
   */
  async cleanupPerformanceEnvironment() {
    this._restoreEnvironment();
    this._logSetup('cleanup', 'SUCCESS', 'Performance environment cleaned up');
  }

  /**
   * Cleanup E2E environment
   */
  async cleanupE2EEnvironment() {
    this._restoreEnvironment();
    this._logSetup('cleanup', 'SUCCESS', 'E2E environment cleaned up');
  }

  /**
   * Restore original environment
   */
  _restoreEnvironment() {
    if (this.environmentBackup) {
      // Clear current environment
      Object.keys(process.env).forEach(key => {
        delete process.env[key];
      });
      
      // Restore backup
      Object.assign(process.env, this.environmentBackup);
      this.environmentBackup = null;
    }
  }

  /**
   * Get test path from context
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
   * Log setup operations
   */
  _logSetup(component, level, message) {
    const entry = {
      timestamp: new Date().toISOString(),
      component,
      level,
      message
    };
    
    this.setupHistory.push(entry);
    
    // Keep only last 50 entries
    if (this.setupHistory.length > 50) {
      this.setupHistory = this.setupHistory.slice(-50);
    }
    
    if (this.debugMode || level === 'ERROR') {
      console.log(`[EnvironmentAwareTestSetup] ${level}: ${component} - ${message}`);
    }
  }

  /**
   * Get setup history for debugging
   */
  getSetupHistory() {
    return [...this.setupHistory];
  }

  /**
   * Clear setup history
   */
  clearSetupHistory() {
    this.setupHistory = [];
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
}

// Export singleton instance
export const environmentAwareTestSetup = new EnvironmentAwareTestSetup();

// Export convenience functions
export async function setupForTest(testContext) {
  return await environmentAwareTestSetup.setupForTest(testContext);
}

export function setIntegrationEnvironment() {
  environmentAwareTestSetup.setIntegrationEnvironment();
}

export function setUnitEnvironment() {
  environmentAwareTestSetup.setUnitEnvironment();
}

export async function createRealDatabaseClient() {
  return await environmentAwareTestSetup.createRealDatabaseClient();
}

export function createMockDatabaseClient() {
  return environmentAwareTestSetup.createMockDatabaseClient();
}

// Export for testing and debugging
export default EnvironmentAwareTestSetup;
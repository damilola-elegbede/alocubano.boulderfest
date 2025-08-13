/**
 * Integration Test Service Strategy
 * Removes mock contamination and implements real service initialization
 */

;
import { serviceDetector } from './service-availability-detector.js';

import { backupEnv, restoreEnv, withCompleteIsolation, resetDatabaseSingleton, cleanupTest } from "./helpers/simple-helpers.js";
export class IntegrationTestStrategy {
  constructor() {
    this.envManager = // TestEnvironmentManager → Simple helpers (no instantiation needed);
    this.realServices = new Map();
    this.serviceConfigs = new Map();
    this.initializationPromises = new Map();
  }

  /**
   * Configure a service for integration testing
   * @param {string} serviceName - Service identifier
   * @param {Object} config - Service configuration
   */
  configureService(serviceName, config) {
    this.serviceConfigs.set(serviceName, {
      factory: config.factory,
      environmentPreset: config.environmentPreset || 'complete-test',
      requiredEnvVars: config.requiredEnvVars || [],
      initialization: config.initialization || null,
      dependencies: config.dependencies || [],
      timeout: config.timeout || 15000,
      ...config
    });
  }

  /**
   * Initialize real services for integration testing
   * @param {string[]} serviceNames - Services to initialize
   * @returns {Promise<Object>} Initialized services map
   */
  async initializeRealServices(serviceNames) {
    const services = {};
    const errors = [];

    // Check service availability first
    const availability = await serviceDetector.checkAllServices();

    for (const serviceName of serviceNames) {
      if (!availability[serviceName]) {
        console.log(`⏭️  Skipping ${serviceName} - service unavailable`);
        continue;
      }

      try {
        const service = await this.initializeService(serviceName);
        services[serviceName] = service;
        console.log(`✅ ${serviceName} initialized for integration testing`);
      } catch (error) {
        console.error(`❌ Failed to initialize ${serviceName}:`, error.message);
        errors.push({ service: serviceName, error });
      }
    }

    if (errors.length > 0 && errors.length === serviceNames.length) {
      throw new Error(`All services failed to initialize: ${errors.map(e => e.service).join(', ')}`);
    }

    return services;
  }

  /**
   * Initialize a specific service
   * @param {string} serviceName - Service to initialize
   * @returns {Promise<Object>} Initialized service instance
   */
  async initializeService(serviceName) {
    // Return cached service if already initialized
    if (this.realServices.has(serviceName)) {
      return this.realServices.get(serviceName);
    }

    // Return existing initialization promise to prevent parallel initialization
    if (this.initializationPromises.has(serviceName)) {
      return await this.initializationPromises.get(serviceName);
    }

    const config = this.serviceConfigs.get(serviceName);
    if (!config) {
      throw new Error(`Service ${serviceName} not configured`);
    }

    const initPromise = this._performServiceInitialization(serviceName, config);
    this.initializationPromises.set(serviceName, initPromise);

    try {
      const service = await initPromise;
      this.realServices.set(serviceName, service);
      return service;
    } catch (error) {
      this.initializationPromises.delete(serviceName);
      throw error;
    }
  }

  /**
   * Perform the actual service initialization
   * @param {string} serviceName - Service name
   * @param {Object} config - Service configuration
   * @returns {Promise<Object>} Initialized service
   */
  async _performServiceInitialization(serviceName, config) {
    // Set up environment for this service
    this.Object.assign(process.env, this.getEnvPreset(config.environmentPreset));

    // Validate required environment variables
    for (const envVar of config.requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Required environment variable ${envVar} not set for ${serviceName}`);
      }
    }

    // Initialize dependencies first
    for (const dependency of config.dependencies) {
      await this.initializeService(dependency);
    }

    // Create service instance
    const service = await config.factory();

    // Perform custom initialization if provided
    if (config.initialization) {
      await Promise.race([
        config.initialization(service),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`${serviceName} initialization timeout`)), config.timeout)
        )
      ]);
    }

    // Verify service is properly initialized
    if (config.healthCheck) {
      const isHealthy = await config.healthCheck(service);
      if (!isHealthy) {
        throw new Error(`${serviceName} failed health check after initialization`);
      }
    }

    return service;
  }

  /**
   * Create integration test database client with real connection
   * @returns {Promise<Object>} Real database client
   */
  async createRealDatabaseClient() {
    // Ensure no mocks are interfering
    this.clearDatabaseMocks();

    // Set real database environment
    Object.assign(process.env, {
      TURSO_DATABASE_URL: ':memory:', // Use in-memory for tests
      TURSO_AUTH_TOKEN: 'test-token',
      NODE_ENV: 'test'
    });

    // Import and get real database client
    const { getDatabaseClient } = await import('../../api/lib/database.js');
    const client = await getDatabaseClient();

    // Verify connection
    const testResult = await client.execute('SELECT 1 as test');
    if (!testResult || !testResult.rows || testResult.rows.length === 0) {
      throw new Error('Database client connection verification failed');
    }

    return client;
  }

  /**
   * Create integration test Google Sheets service with real credentials
   * @returns {Promise<Object>} Real Google Sheets service
   */
  async createRealGoogleSheetsService() {
    // Clear any existing mocks
    this.clearGoogleSheetsMocks();

    // Set real Google Sheets environment
    Object.assign(process.env, {
      GOOGLE_SHEET_ID: 'test_sheet_123',
      GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL: 'test@sheets.com',
      GOOGLE_SHEETS_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
      SHEETS_TIMEZONE: 'America/Denver'
    });

    // Import real Google Sheets service
    const { GoogleSheetsService } = await import('../../api/lib/google-sheets-service.js');
    const service = new GoogleSheetsService();

    // Initialize with timeout
    await Promise.race([
      service.initialize(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Google Sheets initialization timeout')), 10000)
      )
    ]);

    // Verify initialization
    if (!service.sheets || !service.auth) {
      throw new Error('Google Sheets service initialization failed - missing sheets or auth');
    }

    return service;
  }

  /**
   * Create integration test Brevo service with real connection
   * @returns {Promise<Object>} Real Brevo service
   */
  async createRealBrevoService() {
    // Clear any existing mocks
    this.clearBrevoMocks();

    // Set real Brevo environment
    Object.assign(process.env, {
      BREVO_API_KEY: 'test-brevo-api-key',
      BREVO_NEWSLETTER_LIST_ID: '123',
      BREVO_WEBHOOK_SECRET: 'test-webhook-secret'
    });

    // Import real Brevo service
    const { getEmailSubscriberService } = await import('../../api/lib/email-subscriber-service.js');
    const service = getEmailSubscriberService();

    // Initialize with timeout
    await Promise.race([
      service.ensureInitialized(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Brevo service initialization timeout')), 8000)
      )
    ]);

    return service;
  }

  /**
   * Clear database-related mocks to prevent interference
   */
  clearDatabaseMocks() {
    if (typeof vi !== 'undefined') {
      // Clear any existing database mocks
      vi.doUnmock('../../api/lib/database.js');
      vi.doUnmock('../../api/lib/database-client-selector.js');
    }
  }

  /**
   * Clear Google Sheets mocks to prevent interference
   */
  clearGoogleSheetsMocks() {
    if (typeof vi !== 'undefined') {
      // Clear Google Sheets related mocks
      vi.doUnmock('googleapis');
      vi.doUnmock('../../api/lib/google-sheets-service.js');
    }
  }

  /**
   * Clear Brevo service mocks to prevent interference
   */
  clearBrevoMocks() {
    if (typeof vi !== 'undefined') {
      // Clear Brevo related mocks
      vi.doUnmock('../../api/lib/email-subscriber-service.js');
      vi.doUnmock('../../api/lib/brevo-client.js');
    }
  }

  /**
   * Clean up all real services and restore environment
   */
  async cleanup() {
    // Close/cleanup all real services
    for (const [serviceName, service] of this.realServices) {
      try {
        if (service && typeof service.close === 'function') {
          await service.close();
        }
        if (service && typeof service.cleanup === 'function') {
          await service.cleanup();
        }
      } catch (error) {
        console.warn(`Failed to cleanup ${serviceName}:`, error.message);
      }
    }

    // Clear service caches
    this.realServices.clear();
    this.initializationPromises.clear();

    // Restore environment
    this.restoreEnv(envBackup);
  }

  /**
   * Execute test with real services and proper cleanup
   * @param {string[]} serviceNames - Services needed for test
   * @param {Function} testFn - Test function to execute
   * @returns {Promise<any>} Test result
   */
  async withRealServices(serviceNames, testFn) {
    this.envBackup = backupEnv(Object.keys(process.env));

    try {
      // Initialize real services
      const services = await this.initializeRealServices(serviceNames);

      // Execute test with real services
      return await testFn(services);
    } finally {
      // Cleanup regardless of test outcome
      await this.cleanup();
    }
  }

  /**
   * Create test helper for database client enforcement
   * @returns {Promise<Object>} Database client enforcement helper
   */
  async createDatabaseClientEnforcement() {
    return {
      ensureRealClient: async () => {
        const client = await this.createRealDatabaseClient();
        
        // Verify this is a real client, not a mock
        if (client.execute && typeof client.execute === 'function') {
          const testQuery = await client.execute('SELECT sqlite_version() as version');
          if (!testQuery.rows || testQuery.rows.length === 0) {
            throw new Error('Database client verification failed - appears to be mocked');
          }
        } else {
          throw new Error('Database client does not have expected execute method');
        }
        
        return client;
      },
      
      validateNotMocked: (client) => {
        // Additional checks to ensure we have a real client
        if (client._isMockFunction || client.constructor.name.includes('Mock')) {
          throw new Error('Mock database client detected in integration test');
        }
        return true;
      }
    };
  }
}

// Configure standard services
export const integrationStrategy = new IntegrationTestStrategy();

// Configure database service
integrationStrategy.configureService('database', {
  factory: async () => {
    const { getDatabaseClient } = await import('../../api/lib/database.js');
    return await getDatabaseClient();
  },
  environmentPreset: 'valid-local',
  requiredEnvVars: ['TURSO_DATABASE_URL'],
  healthCheck: async (client) => {
    try {
      const result = await client.execute('SELECT 1 as test');
      return result && result.rows && result.rows.length > 0;
    } catch {
      return false;
    }
  },
  timeout: 15000
});

// Configure Google Sheets service
integrationStrategy.configureService('googleSheets', {
  factory: async () => {
    const { GoogleSheetsService } = await import('../../api/lib/google-sheets-service.js');
    return new GoogleSheetsService();
  },
  environmentPreset: 'complete-test',
  requiredEnvVars: ['GOOGLE_SHEET_ID', 'GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL'],
  initialization: async (service) => await service.initialize(),
  healthCheck: async (service) => Boolean(service.sheets && service.auth),
  timeout: 10000
});

// Configure Brevo service
integrationStrategy.configureService('brevo', {
  factory: async () => {
    const { getEmailSubscriberService } = await import('../../api/lib/email-subscriber-service.js');
    return getEmailSubscriberService();
  },
  environmentPreset: 'complete-test',
  requiredEnvVars: ['BREVO_API_KEY'],
  initialization: async (service) => await service.ensureInitialized(),
  dependencies: ['database'],
  timeout: 8000
});

export default integrationStrategy;
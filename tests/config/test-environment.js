/**
 * Test Environment Management
 * Centralized configuration for different test layers
 */

/**
 * Test Environment Types
 */
export const TEST_ENVIRONMENTS = {
  UNIT: 'unit',
  INTEGRATION: 'integration',
  E2E: 'e2e'
};

/**
 * Database Configuration by Test Type
 */
export const getDatabaseConfig = (testType) => {
  switch (testType) {
    case TEST_ENVIRONMENTS.UNIT:
      return {
        url: 'file::memory:',
        authToken: null,
        description: 'In-memory SQLite for fast unit tests',
        persistent: false
      };
      
    case TEST_ENVIRONMENTS.INTEGRATION:
      // Ensure data directory exists for integration tests
      const getIntegrationDbUrl = () => {
        // Force local SQLite file for integration tests - never use remote databases
        if (process.env.INTEGRATION_DATABASE_URL && 
            process.env.INTEGRATION_DATABASE_URL.startsWith('file:')) {
          return process.env.INTEGRATION_DATABASE_URL;
        }
        
        // Warn if someone tried to set a remote database URL for integration tests
        if (process.env.INTEGRATION_DATABASE_URL && 
            !process.env.INTEGRATION_DATABASE_URL.startsWith('file:')) {
          console.warn('⚠️ Integration tests cannot use remote database URLs - forcing local SQLite');
        }
        
        // Create data directory if it doesn't exist
        try {
          const fs = require('fs');
          const path = require('path');
          const dataDir = path.join(process.cwd(), 'data');
          if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            console.log(`📁 Created data directory for integration tests: ${dataDir}`);
          }
        } catch (error) {
          console.warn('⚠️ Could not create data directory:', error.message);
        }
        
        return 'file:./data/test-integration.db';
      };
      
      return {
        url: getIntegrationDbUrl(),
        authToken: null, // Integration tests never need auth tokens
        description: 'Local SQLite file for integration tests (remote databases forbidden)',
        persistent: true,
        cleanup: true,
        remoteAllowed: false // Explicitly flag that remote databases are not allowed
      };
      
    case TEST_ENVIRONMENTS.E2E:
      return {
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
        description: 'Turso production database for E2E tests',
        persistent: true,
        cleanup: false
      };
      
    default:
      throw new Error(`Unknown test environment type: ${testType}`);
  }
};

/**
 * Mock Configuration by Test Type
 */
export const getMockConfig = (testType) => {
  switch (testType) {
    case TEST_ENVIRONMENTS.UNIT:
      return {
        externalServices: true,  // Mock all external services
        database: false,         // Use real in-memory database
        apis: true,              // Mock external APIs
        payments: true,          // Mock payment processing
        email: true              // Mock email sending
      };
      
    case TEST_ENVIRONMENTS.INTEGRATION:
      return {
        externalServices: false, // Use real services where possible
        database: false,         // Use real database
        apis: true,              // Mock external APIs (partially)
        payments: true,          // Mock payments (test mode)
        email: true              // Mock email (test mode)
      };
      
    case TEST_ENVIRONMENTS.E2E:
      return {
        externalServices: false, // Use real services
        database: false,         // Use real database
        apis: false,             // Use real APIs
        payments: false,         // Use real payments (test mode)
        email: false             // Use real email (test mode)
      };
      
    default:
      throw new Error(`Unknown test environment type: ${testType}`);
  }
};

/**
 * Timeout Configuration by Test Type
 */
export const getTimeoutConfig = (testType) => {
  const isCI = process.env.CI === 'true';
  
  switch (testType) {
    case TEST_ENVIRONMENTS.UNIT:
      return {
        test: isCI ? 30000 : 15000,
        hook: isCI ? 10000 : 5000,
        setup: isCI ? 15000 : 10000,
        cleanup: isCI ? 10000 : 5000
      };
      
    case TEST_ENVIRONMENTS.INTEGRATION:
      return {
        test: isCI ? 120000 : 60000,
        hook: isCI ? 30000 : 20000,
        setup: isCI ? 30000 : 20000,
        cleanup: isCI ? 20000 : 10000
      };
      
    case TEST_ENVIRONMENTS.E2E:
      return {
        test: isCI ? 300000 : 180000,
        hook: isCI ? 60000 : 30000,
        setup: isCI ? 60000 : 30000,
        cleanup: isCI ? 30000 : 15000
      };
      
    default:
      throw new Error(`Unknown test environment type: ${testType}`);
  }
};

/**
 * Port Configuration by Test Type
 */
export const getPortConfig = (testType) => {
  const basePort = parseInt(process.env.DYNAMIC_PORT || process.env.PORT || '3000', 10);
  
  switch (testType) {
    case TEST_ENVIRONMENTS.UNIT:
      return {
        port: basePort,
        description: 'Unit tests use mocked APIs, port for reference only'
      };
      
    case TEST_ENVIRONMENTS.INTEGRATION:
      return {
        port: basePort + 1, // Offset to avoid conflicts
        description: 'Integration tests require real API server'
      };
      
    case TEST_ENVIRONMENTS.E2E:
      return {
        port: basePort + 2, // Further offset
        description: 'E2E tests use Vercel Preview Deployment or dedicated server'
      };
      
    default:
      throw new Error(`Unknown test environment type: ${testType}`);
  }
};

/**
 * Configure Environment for Test Type
 */
export const configureEnvironment = (testType) => {
  const dbConfig = getDatabaseConfig(testType);
  const mockConfig = getMockConfig(testType);
  const timeoutConfig = getTimeoutConfig(testType);
  const portConfig = getPortConfig(testType);
  
  // Set environment variables
  process.env.NODE_ENV = 'test';
  process.env.TEST_TYPE = testType;
  
  // Database configuration
  process.env.DATABASE_URL = dbConfig.url;
  if (dbConfig.authToken) {
    process.env.TURSO_AUTH_TOKEN = dbConfig.authToken;
  } else {
    delete process.env.TURSO_AUTH_TOKEN;
  }
  
  // Additional safety for integration tests - force delete any Turso variables
  if (testType === TEST_ENVIRONMENTS.INTEGRATION) {
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    
    // Ensure DATABASE_URL is always a local file for integration tests
    if (!process.env.DATABASE_URL.startsWith('file:')) {
      console.warn('⚠️ Fixing invalid DATABASE_URL for integration test');
      process.env.DATABASE_URL = 'file:./data/test-integration.db';
    }
  }
  
  // Port configuration
  process.env.TEST_PORT = portConfig.port.toString();
  process.env.TEST_BASE_URL = `http://localhost:${portConfig.port}`;
  
  // Timeout configuration
  Object.entries(timeoutConfig).forEach(([key, value]) => {
    process.env[`VITEST_${key.toUpperCase()}_TIMEOUT`] = value.toString();
  });
  
  console.log(`🧪 Test environment configured for: ${testType.toUpperCase()}`);
  console.log(`📍 Database: ${dbConfig.description}`);
  console.log(`🔧 Port: ${portConfig.port} (${portConfig.description})`);
  console.log(`⚡ Timeouts: Test=${timeoutConfig.test}ms, Hook=${timeoutConfig.hook}ms`);
  
  return {
    testType,
    database: dbConfig,
    mocks: mockConfig,
    timeouts: timeoutConfig,
    port: portConfig
  };
};

/**
 * Cleanup Environment after Tests
 */
export const cleanupEnvironment = async (testType) => {
  const dbConfig = getDatabaseConfig(testType);
  
  if (dbConfig.cleanup && dbConfig.persistent) {
    try {
      const fs = await import('fs/promises');
      const pathModule = await import('path');
      
      let dbPath = dbConfig.url.replace('file:', '');
      
      // Handle relative paths correctly
      if (dbPath.startsWith('./')) {
        dbPath = pathModule.join(process.cwd(), dbPath.substring(2));
      }
      
      if (dbPath !== ':memory:' && dbPath && !dbPath.startsWith('libsql://')) {
        await fs.unlink(dbPath).catch(() => {}); // Ignore if file doesn't exist
        console.log(`🧹 Cleaned up test database: ${dbPath}`);
      }
    } catch (error) {
      console.warn(`⚠️ Could not cleanup test database: ${error.message}`);
    }
  }
  
  console.log(`🧹 Environment cleanup completed for: ${testType.toUpperCase()}`);
};

/**
 * Environment Validation
 */
export const validateEnvironment = (testType) => {
  const errors = [];
  
  const dbConfig = getDatabaseConfig(testType);
  const mockConfig = getMockConfig(testType);
  
  // Validate database configuration
  if (testType === TEST_ENVIRONMENTS.E2E) {
    if (!dbConfig.url || !dbConfig.authToken) {
      errors.push('E2E tests require TURSO_DATABASE_URL and TURSO_AUTH_TOKEN');
    }
  }
  
  // Validate Node.js environment
  if (!process.env.NODE_ENV) {
    errors.push('NODE_ENV must be set');
  }
  
  // Validate test type
  if (!Object.values(TEST_ENVIRONMENTS).includes(testType)) {
    errors.push(`Invalid test type: ${testType}`);
  }
  
  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
  }
  
  console.log(`✅ Environment validation passed for: ${testType.toUpperCase()}`);
  return true;
};
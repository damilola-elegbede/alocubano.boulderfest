/**
 * E2E Environment Variable Configuration
 * 
 * Standardizes environment variable handling for E2E tests and CI environments.
 * Provides proper fallbacks, type conversion, and validation for all E2E-related
 * environment variables.
 * 
 * Usage:
 *   import { E2E_CONFIG, validateE2EEnvironment } from './config/e2e-env-config.js';
 *   
 *   // Validate all required variables are present
 *   validateE2EEnvironment();
 *   
 *   // Use standardized configuration
 *   const port = E2E_CONFIG.DYNAMIC_PORT;
 */

/**
 * Helper function to throw meaningful errors for missing required variables
 */
function throwError(variableName, description = '') {
  const message = `❌ REQUIRED: Environment variable '${variableName}' is not set${description ? `: ${description}` : ''}`;
  console.error('\n' + message);
  
  if (variableName.includes('TURSO')) {
    console.error('E2E tests require Turso database for production-like testing');
    console.error('Get credentials from: https://turso.tech/');
  } else if (variableName.includes('ADMIN')) {
    console.error('Admin credentials required for administrative E2E tests');
  } else if (variableName.includes('VERCEL')) {
    console.error('Vercel credentials required for deployment testing in CI');
    console.error('Get token from: https://vercel.com/account/tokens');
  }
  
  console.error('');
  throw new Error(message);
}

/**
 * Helper function to convert string boolean to actual boolean
 */
function parseBoolean(value, defaultValue = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true' || value === '1';
  }
  return defaultValue;
}

/**
 * Helper function to safely parse numbers
 */
function parseNumber(value, defaultValue = 0) {
  const parsed = Number(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Helper function to mask sensitive values in logs
 */
function maskSensitive(value) {
  if (!value) return 'not set';
  if (typeof value === 'string' && value.length > 8) {
    return value.substring(0, 4) + '***' + value.substring(value.length - 4);
  }
  return '***';
}

/**
 * Centralized E2E Environment Configuration
 * 
 * All environment variables used in E2E testing with proper types,
 * fallbacks, and validation.
 * 
 * Note: Required variables that are missing will be marked as null
 * rather than throwing immediately. Use validateE2EEnvironment() 
 * to perform validation and get meaningful error messages.
 */
export const E2E_CONFIG = {
  // =============================================================================
  // REQUIRED VARIABLES (Critical for E2E functionality)
  // =============================================================================
  
  /**
   * Database Configuration - Required for E2E Tests
   * E2E tests use Turso for production-like testing environment
   */
  TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL || null,
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN || null,

  // =============================================================================
  // PORT AND SERVER CONFIGURATION
  // =============================================================================
  
  /**
   * Port Configuration with Proper Precedence
   * DYNAMIC_PORT (CI) -> PORT (standard) -> 3000 (default)
   */
  DYNAMIC_PORT: parseNumber(process.env.DYNAMIC_PORT || process.env.PORT || 3000),
  PORT: parseNumber(process.env.DYNAMIC_PORT || process.env.PORT || 3000),
  
  /**
   * Base URL Configuration
   */
  PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL || 
    `http://localhost:${parseNumber(process.env.DYNAMIC_PORT || process.env.PORT || 3000)}`,

  // =============================================================================
  // ADMIN AUTHENTICATION (Required for Admin Tests)
  // =============================================================================
  
  /**
   * Admin Authentication Configuration
   * TEST_ADMIN_PASSWORD: Plain text for E2E (not bcrypt hashed)
   * ADMIN_PASSWORD: Bcrypt hashed for production use
   * ADMIN_SECRET: JWT signing secret (minimum 32 characters)
   */
  TEST_ADMIN_PASSWORD: process.env.TEST_ADMIN_PASSWORD || null,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || null,
  ADMIN_SECRET: process.env.ADMIN_SECRET || null,

  // =============================================================================
  // SERVICE INTEGRATION (Optional but Required for Specific Tests)
  // =============================================================================
  
  /**
   * Email Service Configuration (Brevo)
   */
  BREVO_API_KEY: process.env.BREVO_API_KEY || null,
  BREVO_NEWSLETTER_LIST_ID: process.env.BREVO_NEWSLETTER_LIST_ID || null,
  BREVO_WEBHOOK_SECRET: process.env.BREVO_WEBHOOK_SECRET || null,
  
  /**
   * Payment Service Configuration (Stripe)
   */
  STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || null,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || null,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || null,
  
  /**
   * Wallet Pass Configuration
   */
  APPLE_PASS_KEY: process.env.APPLE_PASS_KEY || null,
  GOOGLE_WALLET_ISSUER_ID: process.env.GOOGLE_WALLET_ISSUER_ID || null,
  WALLET_AUTH_SECRET: process.env.WALLET_AUTH_SECRET || null,

  // =============================================================================
  // CI/CD AND DEPLOYMENT CONFIGURATION
  // =============================================================================
  
  /**
   * Vercel Configuration for CI Authentication
   */
  VERCEL_TOKEN: process.env.VERCEL_TOKEN || null,
  VERCEL_ORG_ID: process.env.VERCEL_ORG_ID || null,
  VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID || null,
  
  /**
   * Environment Detection
   */
  CI: parseBoolean(process.env.CI, false),
  NODE_ENV: process.env.NODE_ENV || 'test',
  VERCEL: process.env.VERCEL || null,

  // =============================================================================
  // TEST CONFIGURATION FLAGS
  // =============================================================================
  
  /**
   * Test Mode Configuration
   */
  E2E_TEST_MODE: parseBoolean(process.env.E2E_TEST_MODE, false),
  TEST_DATABASE_RESET_ALLOWED: parseBoolean(process.env.TEST_DATABASE_RESET_ALLOWED, false),
  SKIP_DATABASE_INIT: parseBoolean(process.env.SKIP_DATABASE_INIT, false),
  VERCEL_DEV_STARTUP: parseBoolean(process.env.VERCEL_DEV_STARTUP, false),
  
  /**
   * Advanced Testing Scenarios
   */
  ADVANCED_SCENARIOS: parseBoolean(process.env.ADVANCED_SCENARIOS, false),
  PERFORMANCE_TESTING: parseBoolean(process.env.PERFORMANCE_TESTING, false),
  ACCESSIBILITY_TESTING: parseBoolean(process.env.ACCESSIBILITY_TESTING, false),
  SECURITY_TESTING: parseBoolean(process.env.SECURITY_TESTING, false),

  // =============================================================================
  // DEVELOPMENT AND DEBUG CONFIGURATION
  // =============================================================================
  
  /**
   * Debug and Logging Configuration
   */
  DEBUG_PORT: parseNumber(process.env.DEBUG_PORT, 9229),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  FORCE_COLOR: parseBoolean(process.env.FORCE_COLOR, false),
  NO_UPDATE_NOTIFIER: parseBoolean(process.env.NO_UPDATE_NOTIFIER, true), // Default to true in tests
  
  /**
   * Vercel Specific Flags
   */
  VERCEL_NON_INTERACTIVE: parseBoolean(process.env.VERCEL_NON_INTERACTIVE, true), // Default to true for E2E
  
  /**
   * Browser Configuration
   */
  ALL_BROWSERS: parseBoolean(process.env.ALL_BROWSERS, true),
  PLAYWRIGHT_BROWSER: process.env.PLAYWRIGHT_BROWSER || 'chromium',

  // =============================================================================
  // TIMEOUT CONFIGURATION
  // =============================================================================

  /**
   * Configurable Timeouts for E2E Tests
   * These allow adjustment for different CI environments and performance requirements
   */
  E2E_STARTUP_TIMEOUT: parseNumber(process.env.E2E_STARTUP_TIMEOUT, 60000), // Server startup timeout
  E2E_TEST_TIMEOUT: parseNumber(process.env.E2E_TEST_TIMEOUT, 
    parseBoolean(process.env.ADVANCED_SCENARIOS) ? 120000 : 
    (parseBoolean(process.env.CI) ? 90000 : 60000)), // Individual test timeout
  E2E_ACTION_TIMEOUT: parseNumber(process.env.E2E_ACTION_TIMEOUT,
    parseBoolean(process.env.ADVANCED_SCENARIOS) ? 45000 :
    (parseBoolean(process.env.CI) ? 35000 : 30000)), // Action timeout (clicks, inputs)
  E2E_NAVIGATION_TIMEOUT: parseNumber(process.env.E2E_NAVIGATION_TIMEOUT,
    parseBoolean(process.env.ADVANCED_SCENARIOS) ? 60000 :
    (parseBoolean(process.env.CI) ? 50000 : 45000)), // Page navigation timeout
  E2E_WEBSERVER_TIMEOUT: parseNumber(process.env.E2E_WEBSERVER_TIMEOUT,
    parseBoolean(process.env.ADVANCED_SCENARIOS) ? 240000 : 180000), // Webserver startup timeout
  E2E_EXPECT_TIMEOUT: parseNumber(process.env.E2E_EXPECT_TIMEOUT,
    parseBoolean(process.env.ADVANCED_SCENARIOS) ? 30000 :
    (parseBoolean(process.env.CI) ? 20000 : 15000)), // Expect assertion timeout

  // =============================================================================
  // GOOGLE SERVICES CONFIGURATION (Optional)
  // =============================================================================
  
  /**
   * Google Drive/Sheets Integration
   */
  GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || null,
  GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY || null,
  GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID || null,
};

/**
 * Validation Configuration
 * Defines which variables are required for different test scenarios
 */
export const VALIDATION_RULES = {
  // Always required for any E2E testing
  ALWAYS_REQUIRED: [
    // Turso is now optional - will fallback to SQLite
  ],
  
  // Optional for production-like testing (recommended but not required)
  TURSO_PRODUCTION_LIKE: [
    'TURSO_DATABASE_URL',
    'TURSO_AUTH_TOKEN',
  ],
  
  // Required for admin functionality tests
  ADMIN_TESTS: [
    'TEST_ADMIN_PASSWORD',
    'ADMIN_PASSWORD',
    'ADMIN_SECRET',
  ],
  
  // Required for CI/CD environments
  CI_REQUIRED: [
    'VERCEL_TOKEN',
  ],
  
  // Required for service integration tests
  EMAIL_TESTS: [
    'BREVO_API_KEY',
  ],
  
  PAYMENT_TESTS: [
    'STRIPE_SECRET_KEY',
  ],
  
  WALLET_TESTS: [
    'APPLE_PASS_KEY',
    'WALLET_AUTH_SECRET',
  ],
};

/**
 * Validate environment variables based on test requirements
 * 
 * @param {Object} options - Validation options
 * @param {boolean} options.adminTests - Whether admin tests will run
 * @param {boolean} options.ciMode - Whether running in CI
 * @param {boolean} options.emailTests - Whether email tests will run
 * @param {boolean} options.paymentTests - Whether payment tests will run
 * @param {boolean} options.walletTests - Whether wallet tests will run
 * @param {boolean} options.throwOnMissing - Whether to throw on missing vars (default: true)
 * @returns {Object} Validation result
 */
export function validateE2EEnvironment(options = {}) {
  const {
    adminTests = true, // Most E2E tests require admin functionality
    ciMode = E2E_CONFIG.CI,
    emailTests = false,
    paymentTests = false,
    walletTests = false,
    throwOnMissing = true,
  } = options;

  const missing = [];
  const warnings = [];
  
  // Check always required variables
  VALIDATION_RULES.ALWAYS_REQUIRED.forEach(key => {
    if (!E2E_CONFIG[key]) {
      missing.push({
        key,
        description: 'Required for E2E functionality'
      });
    }
  });
  
  // Check admin test requirements
  if (adminTests) {
    VALIDATION_RULES.ADMIN_TESTS.forEach(key => {
      if (!E2E_CONFIG[key]) {
        missing.push({
          key,
          description: key === 'TEST_ADMIN_PASSWORD' 
            ? 'Plain text password required for admin E2E tests'
            : key === 'ADMIN_PASSWORD' 
            ? 'Bcrypt hashed admin password required'
            : key === 'ADMIN_SECRET' 
            ? 'JWT signing secret required (minimum 32 characters)'
            : 'Required for admin functionality'
        });
      }
    });
  }
  
  // Check CI requirements
  if (ciMode) {
    VALIDATION_RULES.CI_REQUIRED.forEach(key => {
      if (!E2E_CONFIG[key]) {
        warnings.push(`CI mode enabled but ${key} not set - may cause authentication issues`);
      }
    });
  }
  
  // Check Turso database configuration (optional but recommended)
  const hasTurso = E2E_CONFIG.TURSO_DATABASE_URL && E2E_CONFIG.TURSO_AUTH_TOKEN;
  if (!hasTurso) {
    warnings.push('Turso database credentials not found - will use SQLite fallback for local testing');
    warnings.push('For production-like testing, set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN');
  }
  
  // Check service-specific requirements
  if (emailTests) {
    VALIDATION_RULES.EMAIL_TESTS.forEach(key => {
      if (!E2E_CONFIG[key]) {
        warnings.push(`Email tests enabled but ${key} not set - tests may fail`);
      }
    });
  }
  
  if (paymentTests) {
    VALIDATION_RULES.PAYMENT_TESTS.forEach(key => {
      if (!E2E_CONFIG[key]) {
        warnings.push(`Payment tests enabled but ${key} not set - tests may fail`);
      }
    });
  }
  
  if (walletTests) {
    VALIDATION_RULES.WALLET_TESTS.forEach(key => {
      if (!E2E_CONFIG[key]) {
        warnings.push(`Wallet tests enabled but ${key} not set - tests may fail`);
      }
    });
  }
  
  // Report results
  const isValid = missing.length === 0;
  
  if (!isValid && throwOnMissing) {
    console.error('\n❌ E2E Environment Validation Failed');
    console.error('Missing required environment variables:');
    missing.forEach(item => {
      if (typeof item === 'string') {
        console.error(`  - ${item}`);
      } else {
        console.error(`  - ${item.key}: ${item.description}`);
      }
    });
    
    if (warnings.length > 0) {
      console.error('\nWarnings:');
      warnings.forEach(warning => console.error(`  ⚠️  ${warning}`));
    }
    
    console.error('\nPlease set the missing environment variables and try again.\n');
    const missingKeys = missing.map(item => typeof item === 'string' ? item : item.key);
    throw new Error(`Missing required environment variables: ${missingKeys.join(', ')}`);
  }
  
  return {
    isValid,
    missing,
    warnings,
    config: E2E_CONFIG,
  };
}

/**
 * Log environment configuration (with sensitive values masked)
 * 
 * @param {boolean} verbose - Whether to log all variables or just summary
 */
export function logE2EEnvironment(verbose = false) {
  console.log('\n🔧 E2E Environment Configuration:');
  
  // Always show critical configuration
  console.log('  Database:');
  console.log(`    TURSO_DATABASE_URL: ${E2E_CONFIG.TURSO_DATABASE_URL ? '✅ SET' : '❌ MISSING'}`);
  console.log(`    TURSO_AUTH_TOKEN: ${maskSensitive(E2E_CONFIG.TURSO_AUTH_TOKEN)}`);
  
  console.log('  Server:');
  console.log(`    DYNAMIC_PORT: ${E2E_CONFIG.DYNAMIC_PORT}`);
  console.log(`    BASE_URL: ${E2E_CONFIG.PLAYWRIGHT_BASE_URL}`);
  
  console.log('  Admin Authentication:');
  console.log(`    TEST_ADMIN_PASSWORD: ${maskSensitive(E2E_CONFIG.TEST_ADMIN_PASSWORD)}`);
  console.log(`    ADMIN_SECRET: ${maskSensitive(E2E_CONFIG.ADMIN_SECRET)}`);
  
  console.log('  Test Configuration:');
  console.log(`    E2E_TEST_MODE: ${E2E_CONFIG.E2E_TEST_MODE}`);
  console.log(`    CI: ${E2E_CONFIG.CI}`);
  console.log(`    ADVANCED_SCENARIOS: ${E2E_CONFIG.ADVANCED_SCENARIOS}`);
  
  if (verbose) {
    console.log('  Service Integration:');
    console.log(`    BREVO_API_KEY: ${maskSensitive(E2E_CONFIG.BREVO_API_KEY)}`);
    console.log(`    STRIPE_SECRET_KEY: ${maskSensitive(E2E_CONFIG.STRIPE_SECRET_KEY)}`);
    console.log(`    APPLE_PASS_KEY: ${maskSensitive(E2E_CONFIG.APPLE_PASS_KEY)}`);
    
    console.log('  Vercel Configuration:');
    console.log(`    VERCEL_TOKEN: ${maskSensitive(E2E_CONFIG.VERCEL_TOKEN)}`);
    console.log(`    VERCEL_ORG_ID: ${E2E_CONFIG.VERCEL_ORG_ID || 'not set'}`);
    console.log(`    VERCEL_PROJECT_ID: ${E2E_CONFIG.VERCEL_PROJECT_ID || 'not set'}`);
    
    console.log('  Debug Configuration:');
    console.log(`    LOG_LEVEL: ${E2E_CONFIG.LOG_LEVEL}`);
    console.log(`    DEBUG_PORT: ${E2E_CONFIG.DEBUG_PORT}`);
    console.log(`    FORCE_COLOR: ${E2E_CONFIG.FORCE_COLOR}`);
  }
  
  console.log('');
}

/**
 * Get environment variables formatted for webServer.env in Playwright configs
 * 
 * @param {Object} options - Configuration options
 * @returns {Object} Environment variables object ready for Playwright webServer
 */
export function getWebServerEnv(options = {}) {
  const {
    port = E2E_CONFIG.DYNAMIC_PORT,
    includeServices = false,
    includeVercel = false,
  } = options;
  
  const env = {
    // Node environment
    NODE_ENV: E2E_CONFIG.NODE_ENV,
    
    // Port configuration
    PORT: port.toString(),
    DYNAMIC_PORT: port.toString(),
    
    // Database (always required for E2E)
    TURSO_DATABASE_URL: E2E_CONFIG.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: E2E_CONFIG.TURSO_AUTH_TOKEN,
    
    // Admin authentication (always required for E2E)
    TEST_ADMIN_PASSWORD: E2E_CONFIG.TEST_ADMIN_PASSWORD,
    ADMIN_SECRET: E2E_CONFIG.ADMIN_SECRET,
    ADMIN_PASSWORD: E2E_CONFIG.ADMIN_PASSWORD,
    
    // Test configuration
    E2E_TEST_MODE: 'true',
    CI: E2E_CONFIG.CI.toString(),
    SKIP_DATABASE_INIT: E2E_CONFIG.SKIP_DATABASE_INIT.toString(),
    VERCEL_DEV_STARTUP: E2E_CONFIG.VERCEL_DEV_STARTUP.toString(),
    
    // Advanced scenarios
    ADVANCED_SCENARIOS: E2E_CONFIG.ADVANCED_SCENARIOS.toString(),
    PERFORMANCE_TESTING: E2E_CONFIG.PERFORMANCE_TESTING.toString(),
    ACCESSIBILITY_TESTING: E2E_CONFIG.ACCESSIBILITY_TESTING.toString(),
    SECURITY_TESTING: E2E_CONFIG.SECURITY_TESTING.toString(),
    
    // Vercel specific
    VERCEL_NON_INTERACTIVE: '1',
    NO_UPDATE_NOTIFIER: '1',
    FORCE_COLOR: E2E_CONFIG.FORCE_COLOR.toString(),
  };
  
  // Add service credentials if requested and available
  if (includeServices) {
    if (E2E_CONFIG.BREVO_API_KEY) env.BREVO_API_KEY = E2E_CONFIG.BREVO_API_KEY;
    if (E2E_CONFIG.STRIPE_SECRET_KEY) env.STRIPE_SECRET_KEY = E2E_CONFIG.STRIPE_SECRET_KEY;
    if (E2E_CONFIG.STRIPE_WEBHOOK_SECRET) env.STRIPE_WEBHOOK_SECRET = E2E_CONFIG.STRIPE_WEBHOOK_SECRET;
    if (E2E_CONFIG.APPLE_PASS_KEY) env.APPLE_PASS_KEY = E2E_CONFIG.APPLE_PASS_KEY;
    if (E2E_CONFIG.GOOGLE_WALLET_ISSUER_ID) env.GOOGLE_WALLET_ISSUER_ID = E2E_CONFIG.GOOGLE_WALLET_ISSUER_ID;
    if (E2E_CONFIG.WALLET_AUTH_SECRET) env.WALLET_AUTH_SECRET = E2E_CONFIG.WALLET_AUTH_SECRET;
  }
  
  // Add Vercel credentials if requested and available
  if (includeVercel) {
    if (E2E_CONFIG.VERCEL_TOKEN) env.VERCEL_TOKEN = E2E_CONFIG.VERCEL_TOKEN;
    if (E2E_CONFIG.VERCEL_ORG_ID) env.VERCEL_ORG_ID = E2E_CONFIG.VERCEL_ORG_ID;
    if (E2E_CONFIG.VERCEL_PROJECT_ID) env.VERCEL_PROJECT_ID = E2E_CONFIG.VERCEL_PROJECT_ID;
  }
  
  return env;
}

/**
 * Default export for convenience
 */
export default {
  E2E_CONFIG,
  VALIDATION_RULES,
  validateE2EEnvironment,
  logE2EEnvironment,
  getWebServerEnv,
  maskSensitive,
  parseBoolean,
  parseNumber,
};
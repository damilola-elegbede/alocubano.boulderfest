/**
 * Test Mode Configuration
 * Centralized configuration for test mode functionality and validation
 */

/**
 * Test mode environment detection
 */
export const TEST_MODE_ENVIRONMENTS = {
  UNIT: 'unit',
  INTEGRATION: 'integration',
  E2E: 'e2e',
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production'
};

/**
 * Test mode configuration for different environments
 */
export const testModeConfig = {
  [TEST_MODE_ENVIRONMENTS.UNIT]: {
    enabled: true,
    defaultTestMode: true,
    allowProductionData: false,
    requireTestPrefix: true,
    autoCleanup: true,
    database: {
      useMemory: true,
      isolateTestData: true
    },
    email: {
      useMockService: true,
      requireTestEmails: true
    },
    payments: {
      useTestMode: true,
      requireTestCards: true
    }
  },

  [TEST_MODE_ENVIRONMENTS.INTEGRATION]: {
    enabled: true,
    defaultTestMode: true,
    allowProductionData: false,
    requireTestPrefix: true,
    autoCleanup: true,
    database: {
      useMemory: false,
      isolateTestData: true,
      cleanupOnTeardown: true
    },
    email: {
      useMockService: true,
      requireTestEmails: true
    },
    payments: {
      useTestMode: true,
      requireTestCards: true
    }
  },

  [TEST_MODE_ENVIRONMENTS.E2E]: {
    enabled: true,
    defaultTestMode: false,
    allowProductionData: true,
    requireTestPrefix: false,
    autoCleanup: true,
    database: {
      useMemory: false,
      isolateTestData: false,
      cleanupOnTeardown: true
    },
    email: {
      useMockService: false,
      requireTestEmails: false
    },
    payments: {
      useTestMode: true,
      requireTestCards: true
    }
  },

  [TEST_MODE_ENVIRONMENTS.DEVELOPMENT]: {
    enabled: true,
    defaultTestMode: false,
    allowProductionData: true,
    requireTestPrefix: false,
    autoCleanup: false,
    database: {
      useMemory: false,
      isolateTestData: false
    },
    email: {
      useMockService: false,
      requireTestEmails: false
    },
    payments: {
      useTestMode: true,
      requireTestCards: false
    }
  },

  [TEST_MODE_ENVIRONMENTS.STAGING]: {
    enabled: true,
    defaultTestMode: false,
    allowProductionData: true,
    requireTestPrefix: false,
    autoCleanup: false,
    database: {
      useMemory: false,
      isolateTestData: false
    },
    email: {
      useMockService: false,
      requireTestEmails: false
    },
    payments: {
      useTestMode: true,
      requireTestCards: false
    }
  },

  [TEST_MODE_ENVIRONMENTS.PRODUCTION]: {
    enabled: false,
    defaultTestMode: false,
    allowProductionData: true,
    requireTestPrefix: false,
    autoCleanup: false,
    database: {
      useMemory: false,
      isolateTestData: false
    },
    email: {
      useMockService: false,
      requireTestEmails: false
    },
    payments: {
      useTestMode: false,
      requireTestCards: false
    }
  }
};

/**
 * Test data patterns and validation rules
 */
export const testDataPatterns = {
  ticketId: /^TEST-TICKET-\d+-[a-z0-9]+$/,
  transactionId: /^TEST-TRANS-[A-Z0-9-]+$/,
  donationId: /^test_donation_\d+_[a-z0-9]+$/,
  qrToken: /^TEST-QR-.+$/,
  emailDomain: /@test\.com$/
};

/**
 * Test mode validation rules
 */
export const validationRules = {
  tickets: {
    requireTestPrefix: (ticketId) => testDataPatterns.ticketId.test(ticketId),
    requireTestFlag: (ticket) => ticket.isTestItem === true || ticket.is_test === 1,
    requireTestName: (name) => name.startsWith('TEST -'),
    validatePrice: (price) => price > 0 && price <= 100000 // $1000 max for test tickets
  },

  transactions: {
    requireTestPrefix: (transactionId) => testDataPatterns.transactionId.test(transactionId),
    requireTestFlag: (transaction) => transaction.isTest === true || transaction.is_test === 1,
    requireTestEmail: (email) => email.includes('test') || email.endsWith('@test.com'),
    validateAmount: (amount) => amount > 0 && amount <= 10000000 // $100,000 max for test transactions
  },

  donations: {
    requireTestPrefix: (donationId) => testDataPatterns.donationId.test(donationId),
    requireTestFlag: (donation) => donation.isTestItem === true,
    requireTestName: (name) => name.startsWith('TEST -'),
    validateAmount: (amount) => amount > 0 && amount <= 1000000 // $10,000 max for test donations
  },

  emails: {
    requireTestDomain: (email) => testDataPatterns.emailDomain.test(email) || email.includes('test'),
    validateFormat: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  },

  qrTokens: {
    requireTestFormat: (token) => testDataPatterns.qrToken.test(token),
    validateStructure: (token) => token.split('-').length >= 3
  }
};

/**
 * Test mode timeouts and limits
 */
export const testModeLimits = {
  maxTestTicketsPerTransaction: 10,
  maxTestDonationsPerTransaction: 5,
  maxTestTransactionsPerSession: 50,
  maxTestDataAgeHours: 720, // 30 days
  bulkOperationLimit: 100,
  performanceTestTimeout: 30000, // 30 seconds
  cleanupOperationTimeout: 60000 // 60 seconds
};

/**
 * Test mode security settings
 */
export const testModeSecurity = {
  requireAuth: {
    adminOperations: true,
    cleanupOperations: true,
    bulkOperations: true
  },
  allowedOrigins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://test.alocubano.com',
    'https://staging.alocubano.com'
  ],
  rateLimit: {
    testOperationsPerMinute: 100,
    bulkOperationsPerHour: 10,
    cleanupOperationsPerDay: 5
  }
};

/**
 * Get current environment configuration
 */
export function getCurrentEnvironmentConfig() {
  const environment = detectEnvironment();
  return testModeConfig[environment] || testModeConfig[TEST_MODE_ENVIRONMENTS.DEVELOPMENT];
}

/**
 * Detect current environment
 */
export function detectEnvironment() {
  if (process.env.NODE_ENV === 'test') {
    if (process.env.UNIT_ONLY_MODE === 'true') {
      return TEST_MODE_ENVIRONMENTS.UNIT;
    }
    if (process.env.INTEGRATION_TEST_MODE === 'true') {
      return TEST_MODE_ENVIRONMENTS.INTEGRATION;
    }
    if (process.env.E2E_TEST_MODE === 'true') {
      return TEST_MODE_ENVIRONMENTS.E2E;
    }
    return TEST_MODE_ENVIRONMENTS.UNIT; // Default for tests
  }

  if (process.env.NODE_ENV === 'development') {
    return TEST_MODE_ENVIRONMENTS.DEVELOPMENT;
  }

  if (process.env.NODE_ENV === 'staging') {
    return TEST_MODE_ENVIRONMENTS.STAGING;
  }

  if (process.env.NODE_ENV === 'production') {
    return TEST_MODE_ENVIRONMENTS.PRODUCTION;
  }

  return TEST_MODE_ENVIRONMENTS.DEVELOPMENT; // Default fallback
}

/**
 * Check if test mode is enabled in current environment
 */
export function isTestModeEnabled() {
  const config = getCurrentEnvironmentConfig();
  return config.enabled;
}

/**
 * Check if test mode should be default in current environment
 */
export function isTestModeDefault() {
  const config = getCurrentEnvironmentConfig();
  return config.defaultTestMode;
}

/**
 * Validate test data according to current environment rules
 */
export function validateTestData(data, type) {
  const config = getCurrentEnvironmentConfig();
  const rules = validationRules[type];

  if (!rules) {
    throw new Error(`Unknown test data type: ${type}`);
  }

  const errors = [];

  // Apply validation rules based on configuration
  switch (type) {
    case 'tickets':
      if (config.requireTestPrefix && !rules.requireTestPrefix(data.ticketId || data.ticket_id)) {
        errors.push('Ticket ID must have TEST prefix in this environment');
      }
      if (!rules.requireTestFlag(data)) {
        errors.push('Ticket must have test flag set');
      }
      if (config.requireTestPrefix && data.name && !rules.requireTestName(data.name)) {
        errors.push('Ticket name must have TEST prefix in this environment');
      }
      if (!rules.validatePrice(data.price || data.price_cents / 100)) {
        errors.push('Invalid ticket price for test data');
      }
      break;

    case 'transactions':
      if (config.requireTestPrefix && !rules.requireTestPrefix(data.transactionId || data.transaction_id)) {
        errors.push('Transaction ID must have TEST prefix in this environment');
      }
      if (!rules.requireTestFlag(data)) {
        errors.push('Transaction must have test flag set');
      }
      if (config.email?.requireTestEmails && !rules.requireTestEmail(data.customerEmail || data.customer_email)) {
        errors.push('Customer email must be test email in this environment');
      }
      if (!rules.validateAmount(data.amountCents || data.amount_cents)) {
        errors.push('Invalid transaction amount for test data');
      }
      break;

    case 'donations':
      if (config.requireTestPrefix && !rules.requireTestPrefix(data.id)) {
        errors.push('Donation ID must have test prefix in this environment');
      }
      if (!rules.requireTestFlag(data)) {
        errors.push('Donation must have test flag set');
      }
      if (config.requireTestPrefix && !rules.requireTestName(data.name)) {
        errors.push('Donation name must have TEST prefix in this environment');
      }
      if (!rules.validateAmount(data.amount)) {
        errors.push('Invalid donation amount for test data');
      }
      break;

    case 'emails':
      if (config.email?.requireTestEmails && !rules.requireTestDomain(data.email)) {
        errors.push('Email must use test domain in this environment');
      }
      if (!rules.validateFormat(data.email)) {
        errors.push('Invalid email format');
      }
      break;

    case 'qrTokens':
      if (config.requireTestPrefix && !rules.requireTestFormat(data.token || data)) {
        errors.push('QR token must have TEST format in this environment');
      }
      if (!rules.validateStructure(data.token || data)) {
        errors.push('Invalid QR token structure');
      }
      break;
  }

  if (errors.length > 0) {
    throw new Error(`Test data validation failed: ${errors.join(', ')}`);
  }

  return true;
}

/**
 * Get test mode headers for API requests
 */
export function getTestModeHeaders(testMode = true) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (testMode) {
    headers['X-Test-Mode'] = 'true';
  }

  const config = getCurrentEnvironmentConfig();
  if (config.requireAuth?.adminOperations) {
    headers['Authorization'] = `Bearer ${process.env.TEST_ADMIN_TOKEN || 'test-token'}`;
  }

  return headers;
}

/**
 * Create test mode database connection string
 */
export function getTestModeConnectionString() {
  const config = getCurrentEnvironmentConfig();

  if (config.database.useMemory) {
    return 'file::memory:?cache=shared';
  }

  if (config.database.isolateTestData) {
    return process.env.TEST_DATABASE_URL || ':memory:';
  }

  return process.env.DATABASE_URL || ':memory:';
}

/**
 * Get test mode email configuration
 */
export function getTestModeEmailConfig() {
  const config = getCurrentEnvironmentConfig();

  return {
    useMockService: config.email.useMockService,
    requireTestEmails: config.email.requireTestEmails,
    apiKey: config.email.useMockService ? 'test-api-key' : process.env.BREVO_API_KEY,
    baseUrl: config.email.useMockService ? 'mock://api.brevo.com/v3' : 'https://api.brevo.com/v3'
  };
}

/**
 * Get test mode payment configuration
 */
export function getTestModePaymentConfig() {
  const config = getCurrentEnvironmentConfig();

  return {
    useTestMode: config.payments.useTestMode,
    requireTestCards: config.payments.requireTestCards,
    publicKey: config.payments.useTestMode ? process.env.STRIPE_TEST_PUBLISHABLE_KEY : process.env.STRIPE_PUBLISHABLE_KEY,
    secretKey: config.payments.useTestMode ? process.env.STRIPE_TEST_SECRET_KEY : process.env.STRIPE_SECRET_KEY
  };
}

/**
 * Check if operation is allowed in current environment
 */
export function isOperationAllowed(operation) {
  const config = getCurrentEnvironmentConfig();

  switch (operation) {
    case 'test_mode_toggle':
      return config.enabled;
    case 'production_data_access':
      return config.allowProductionData;
    case 'auto_cleanup':
      return config.autoCleanup;
    case 'bulk_operations':
      return config.enabled;
    default:
      return false;
  }
}

/**
 * Get cleanup configuration for current environment
 */
export function getCleanupConfig() {
  const config = getCurrentEnvironmentConfig();

  return {
    enabled: config.autoCleanup,
    onTeardown: config.database?.cleanupOnTeardown || false,
    maxAge: testModeLimits.maxTestDataAgeHours,
    batchSize: testModeLimits.bulkOperationLimit,
    timeout: testModeLimits.cleanupOperationTimeout
  };
}

export default {
  TEST_MODE_ENVIRONMENTS,
  testModeConfig,
  testDataPatterns,
  validationRules,
  testModeLimits,
  testModeSecurity,
  getCurrentEnvironmentConfig,
  detectEnvironment,
  isTestModeEnabled,
  isTestModeDefault,
  validateTestData,
  getTestModeHeaders,
  getTestModeConnectionString,
  getTestModeEmailConfig,
  getTestModePaymentConfig,
  isOperationAllowed,
  getCleanupConfig
};
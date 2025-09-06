/**
 * E2E Test Secret Validator
 * 
 * Comprehensive validation of all secrets required for E2E tests. 
 * Provides clear reporting of missing/found secrets and immediately 
 * exits if critical secrets are missing.
 * 
 * Features:
 * - Clear visual reporting with found/missing counts
 * - Categorizes secrets by importance (CRITICAL, REQUIRED, OPTIONAL)
 * - Provides helpful context for each missing secret
 * - Exits with non-zero code when critical secrets are missing
 * - Supports different test scenarios (basic, advanced, admin, etc.)
 */

import { E2E_CONFIG } from '../../config/e2e-env-config.js';

/**
 * Secret definitions with categories and descriptions
 */
const SECRET_DEFINITIONS = {
  // CRITICAL - Tests cannot run without these
  CRITICAL: {
    NODE_ENV: {
      value: process.env.NODE_ENV,
      description: 'Node environment (test/development)',
      required: true
    },
    E2E_TEST_MODE: {
      value: process.env.E2E_TEST_MODE,
      description: 'E2E test mode flag',
      required: true
    }
  },

  // REQUIRED - Most functionality needs these
  REQUIRED: {
    // Database (recommended for production-like testing)
    TURSO_DATABASE_URL: {
      value: process.env.TURSO_DATABASE_URL,
      description: 'Turso database URL for production-like testing',
      required: false, // SQLite fallback available
      helpUrl: 'https://turso.tech/',
      fallback: 'SQLite local database'
    },
    TURSO_AUTH_TOKEN: {
      value: process.env.TURSO_AUTH_TOKEN,
      description: 'Turso authentication token',
      required: false, // SQLite fallback available
      helpUrl: 'https://turso.tech/',
      fallback: 'SQLite local database'
    },

    // Admin authentication (required for admin tests)
    TEST_ADMIN_PASSWORD: {
      value: process.env.TEST_ADMIN_PASSWORD,
      description: 'Plain text admin password for E2E tests',
      required: true,
      testTypes: ['admin', 'security'],
      defaultValue: 'test-admin-password'
    },
    ADMIN_SECRET: {
      value: process.env.ADMIN_SECRET,
      description: 'JWT signing secret (minimum 32 characters)',
      required: true,
      testTypes: ['admin', 'security'],
      minLength: 32
    },
    ADMIN_PASSWORD: {
      value: process.env.ADMIN_PASSWORD,
      description: 'Bcrypt hashed admin password for production',
      required: false, // Optional in E2E test mode
      testTypes: ['admin'],
      note: 'Optional in E2E test mode (TEST_ADMIN_PASSWORD used instead)'
    }
  },

  // SERVICE INTEGRATION - Required for specific test scenarios
  SERVICE_INTEGRATION: {
    // Email service (Brevo)
    BREVO_API_KEY: {
      value: process.env.BREVO_API_KEY,
      description: 'Brevo (SendinBlue) API key for email functionality',
      required: false,
      testTypes: ['email', 'newsletter'],
      helpUrl: 'https://developers.brevo.com/'
    },
    BREVO_NEWSLETTER_LIST_ID: {
      value: process.env.BREVO_NEWSLETTER_LIST_ID,
      description: 'Brevo newsletter list ID',
      required: false,
      testTypes: ['email', 'newsletter']
    },
    BREVO_WEBHOOK_SECRET: {
      value: process.env.BREVO_WEBHOOK_SECRET,
      description: 'Brevo webhook validation secret',
      required: false,
      testTypes: ['email']
    },

    // Payment service (Stripe)
    STRIPE_PUBLISHABLE_KEY: {
      value: process.env.STRIPE_PUBLISHABLE_KEY,
      description: 'Stripe publishable key for frontend',
      required: false,
      testTypes: ['payment', 'checkout']
    },
    STRIPE_SECRET_KEY: {
      value: process.env.STRIPE_SECRET_KEY,
      description: 'Stripe secret key for backend processing',
      required: false,
      testTypes: ['payment', 'checkout'],
      helpUrl: 'https://dashboard.stripe.com/apikeys'
    },
    STRIPE_WEBHOOK_SECRET: {
      value: process.env.STRIPE_WEBHOOK_SECRET,
      description: 'Stripe webhook endpoint secret',
      required: false,
      testTypes: ['payment']
    },

    // Wallet passes
    APPLE_PASS_KEY: {
      value: process.env.APPLE_PASS_KEY,
      description: 'Base64 encoded Apple Wallet pass signing key',
      required: false,
      testTypes: ['wallet', 'tickets']
    },
    WALLET_AUTH_SECRET: {
      value: process.env.WALLET_AUTH_SECRET,
      description: 'JWT secret for wallet pass authentication',
      required: false,
      testTypes: ['wallet', 'tickets'],
      minLength: 32
    },
    GOOGLE_WALLET_ISSUER_ID: {
      value: process.env.GOOGLE_WALLET_ISSUER_ID,
      description: 'Google Wallet issuer ID',
      required: false,
      testTypes: ['wallet', 'tickets']
    }
  },

  // CI/CD DEPLOYMENT - Required for CI environments
  CICD: {
    CI: {
      value: process.env.CI,
      description: 'CI environment flag',
      required: false,
      note: 'Automatically detected in CI environments'
    },
    GITHUB_TOKEN: {
      value: process.env.GITHUB_TOKEN,
      description: 'GitHub API token for CI operations',
      required: false,
      testTypes: ['ci'],
      helpUrl: 'https://github.com/settings/tokens'
    },
    VERCEL_TOKEN: {
      value: process.env.VERCEL_TOKEN,
      description: 'Vercel authentication token',
      required: false,
      testTypes: ['ci', 'deployment'],
      helpUrl: 'https://vercel.com/account/tokens'
    },
    VERCEL_ORG_ID: {
      value: process.env.VERCEL_ORG_ID,
      description: 'Vercel organization ID',
      required: false,
      testTypes: ['ci', 'deployment']
    },
    VERCEL_PROJECT_ID: {
      value: process.env.VERCEL_PROJECT_ID,
      description: 'Vercel project ID',
      required: false,
      testTypes: ['ci', 'deployment']
    }
  },

  // GOOGLE SERVICES - Optional integrations
  GOOGLE_SERVICES: {
    GOOGLE_DRIVE_API_KEY: {
      value: process.env.GOOGLE_DRIVE_API_KEY,
      description: 'Google Drive API key for gallery integration',
      required: false,
      testTypes: ['gallery', 'google'],
      helpUrl: 'https://console.cloud.google.com/apis/credentials'
    },
    GOOGLE_DRIVE_FOLDER_ID: {
      value: process.env.GOOGLE_DRIVE_FOLDER_ID,
      description: 'Google Drive folder ID for gallery images',
      required: false,
      testTypes: ['gallery', 'google']
    },
    GOOGLE_SERVICE_ACCOUNT_EMAIL: {
      value: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      description: 'Google service account email for authentication',
      required: false,
      testTypes: ['google']
    },
    GOOGLE_PRIVATE_KEY: {
      value: process.env.GOOGLE_PRIVATE_KEY,
      description: 'Google service account private key',
      required: false,
      testTypes: ['google']
    }
  },

  // RUNTIME CONFIGURATION
  RUNTIME: {
    PORT: {
      value: process.env.PORT || process.env.DYNAMIC_PORT,
      description: 'Server port for testing',
      required: false,
      defaultValue: '3000'
    },
    DYNAMIC_PORT: {
      value: process.env.DYNAMIC_PORT,
      description: 'Dynamic port allocation for CI',
      required: false,
      testTypes: ['ci']
    },
    PLAYWRIGHT_BASE_URL: {
      value: process.env.PLAYWRIGHT_BASE_URL,
      description: 'Base URL for Playwright tests',
      required: false,
      note: 'Auto-generated from port if not set'
    },
    PREVIEW_URL: {
      value: process.env.PREVIEW_URL,
      description: 'Vercel preview deployment URL',
      required: false,
      testTypes: ['preview', 'ci']
    }
  }
};

/**
 * Validate secrets for E2E testing with comprehensive reporting
 * 
 * @param {Object} options - Validation options
 * @param {Array<string>} options.testTypes - Types of tests to run (admin, email, payment, etc.)
 * @param {boolean} options.strict - Whether to fail on missing optional secrets
 * @param {boolean} options.ci - Whether running in CI environment
 * @returns {Object} Validation result
 */
export function validateSecrets(options = {}) {
  const {
    testTypes = ['basic', 'admin'], // Default test types
    strict = false,
    ci = E2E_CONFIG.CI
  } = options;

  console.log('🚨 E2E TEST STARTUP - SECRET VALIDATION');
  console.log('========================================');
  console.log(`Checking secrets for test types: ${testTypes.join(', ')}`);
  console.log('');

  const results = {
    found: [],
    missing: [],
    warnings: [],
    categories: {}
  };

  // Process each category
  Object.entries(SECRET_DEFINITIONS).forEach(([categoryName, secrets]) => {
    results.categories[categoryName] = {
      found: [],
      missing: [],
      warnings: [],
      total: Object.keys(secrets).length
    };

    Object.entries(secrets).forEach(([secretName, config]) => {
      const hasValue = Boolean(config.value);
      const isRequired = determineIfRequired(config, testTypes, ci);
      
      const secretInfo = {
        name: secretName,
        category: categoryName,
        value: config.value,
        hasValue,
        isRequired,
        config
      };

      if (hasValue) {
        // Validate value if present
        const validation = validateSecretValue(secretName, config);
        if (validation.isValid) {
          results.found.push(secretInfo);
          results.categories[categoryName].found.push(secretInfo);
        } else {
          results.warnings.push({
            ...secretInfo,
            issue: validation.issue
          });
          results.categories[categoryName].warnings.push(secretInfo);
        }
      } else {
        // Missing secret
        if (isRequired) {
          results.missing.push(secretInfo);
          results.categories[categoryName].missing.push(secretInfo);
        } else {
          results.warnings.push({
            ...secretInfo,
            issue: 'Optional secret not set'
          });
          results.categories[categoryName].warnings.push(secretInfo);
        }
      }
    });
  });

  // Generate report
  generateValidationReport(results, testTypes);

  // Determine if validation passed
  const hasRequiredMissing = results.missing.some(s => s.isRequired);
  const passed = !hasRequiredMissing;

  if (!passed) {
    console.log('❌ TESTS ABORTED: Cannot proceed without required secrets');
    console.log('========================================');
    process.exit(1);
  }

  console.log('✅ SECRET VALIDATION PASSED');
  console.log('========================================');

  return {
    passed,
    found: results.found,
    missing: results.missing,
    warnings: results.warnings,
    summary: {
      total: Object.values(SECRET_DEFINITIONS).reduce((total, category) => 
        total + Object.keys(category).length, 0),
      found: results.found.length,
      missing: results.missing.length,
      warnings: results.warnings.length
    }
  };
}

/**
 * Determine if a secret is required based on test types and configuration
 */
function determineIfRequired(config, testTypes, ci) {
  // Always required
  if (config.required === true) {
    return true;
  }

  // Required for specific test types
  if (config.testTypes && config.testTypes.some(type => testTypes.includes(type))) {
    return true;
  }

  // CI-specific requirements
  if (ci && config.testTypes && config.testTypes.includes('ci')) {
    return true;
  }

  return false;
}

/**
 * Validate the value of a secret (length, format, etc.)
 */
function validateSecretValue(secretName, config) {
  const value = config.value;

  // Check minimum length
  if (config.minLength && value.length < config.minLength) {
    return {
      isValid: false,
      issue: `Value too short (minimum ${config.minLength} characters)`
    };
  }

  // Check specific formats
  if (secretName.includes('URL') && value && !value.startsWith('http')) {
    return {
      isValid: false,
      issue: 'Invalid URL format'
    };
  }

  if (secretName.includes('EMAIL') && value && !value.includes('@')) {
    return {
      isValid: false,
      issue: 'Invalid email format'
    };
  }

  return { isValid: true };
}

/**
 * Generate comprehensive validation report
 */
function generateValidationReport(results, testTypes) {
  const totalSecrets = results.found.length + results.missing.length + results.warnings.length;
  
  console.log(`Checking ${totalSecrets} secrets...`);
  console.log('');

  // Found secrets
  if (results.found.length > 0) {
    console.log(`✅ Found ${results.found.length} secrets:`);
    results.found.forEach(secret => {
      const valueDisplay = getValueDisplay(secret.name, secret.value);
      console.log(`   - ${secret.name} (${valueDisplay})`);
    });
    console.log('');
  }

  // Missing critical secrets
  const criticalMissing = results.missing.filter(s => s.isRequired);
  if (criticalMissing.length > 0) {
    console.log(`❌ Missing ${criticalMissing.length} CRITICAL secrets:`);
    criticalMissing.forEach(secret => {
      console.log(`   - ${secret.name}`);
      if (secret.config.description) {
        console.log(`     ${secret.config.description}`);
      }
      if (secret.config.helpUrl) {
        console.log(`     Get it from: ${secret.config.helpUrl}`);
      }
      if (secret.config.defaultValue) {
        console.log(`     Default value available: ${secret.config.defaultValue}`);
      }
      if (secret.config.fallback) {
        console.log(`     Fallback: ${secret.config.fallback}`);
      }
    });
    console.log('');
  }

  // Missing optional secrets
  const optionalMissing = results.missing.filter(s => !s.isRequired);
  if (optionalMissing.length > 0) {
    console.log(`⚠️ Missing ${optionalMissing.length} optional secrets:`);
    optionalMissing.forEach(secret => {
      console.log(`   - ${secret.name}`);
      if (secret.config.description) {
        console.log(`     ${secret.config.description}`);
      }
      if (secret.config.note) {
        console.log(`     Note: ${secret.config.note}`);
      }
    });
    console.log('');
  }

  // Warnings
  const warningSecrets = results.warnings.filter(w => w.issue && w.issue !== 'Optional secret not set');
  if (warningSecrets.length > 0) {
    console.log(`⚠️ ${warningSecrets.length} secrets have issues:`);
    warningSecrets.forEach(warning => {
      console.log(`   - ${warning.name}: ${warning.issue}`);
    });
    console.log('');
  }

  // Category breakdown
  console.log('📊 Secrets by category:');
  Object.entries(results.categories).forEach(([category, data]) => {
    const status = data.missing.length > 0 ? '❌' : (data.warnings.length > 0 ? '⚠️' : '✅');
    console.log(`   ${status} ${category}: ${data.found.length}/${data.total} configured`);
  });
  console.log('');

  // Test type recommendations
  if (testTypes.includes('admin') && !results.found.some(s => s.name === 'TEST_ADMIN_PASSWORD')) {
    console.log('💡 Admin tests enabled but TEST_ADMIN_PASSWORD missing');
    console.log('   Admin panel tests may fail without proper credentials');
  }

  if (testTypes.includes('email') && !results.found.some(s => s.name === 'BREVO_API_KEY')) {
    console.log('💡 Email tests enabled but BREVO_API_KEY missing');
    console.log('   Newsletter and email functionality tests may fail');
  }

  if (testTypes.includes('payment') && !results.found.some(s => s.name === 'STRIPE_SECRET_KEY')) {
    console.log('💡 Payment tests enabled but STRIPE_SECRET_KEY missing');
    console.log('   Payment processing tests may fail');
  }
}

/**
 * Get display value for logging (mask sensitive data)
 */
function getValueDisplay(secretName, value) {
  if (!value) return 'not set';
  
  const sensitive = ['KEY', 'TOKEN', 'SECRET', 'PASSWORD'];
  const isSensitive = sensitive.some(word => secretName.includes(word));
  
  if (isSensitive) {
    if (typeof value === 'string' && value.length > 8) {
      return value.substring(0, 4) + '***' + value.substring(value.length - 4);
    }
    return '***';
  }
  
  return value;
}

/**
 * Quick validation for basic E2E test startup
 */
export function quickValidateBasicSecrets() {
  console.log('⚡ Quick secret validation for basic E2E tests...');
  
  const basicSecrets = [
    'NODE_ENV',
    'TEST_ADMIN_PASSWORD',
    'ADMIN_SECRET'
  ];
  
  const missing = [];
  
  basicSecrets.forEach(secret => {
    if (!process.env[secret]) {
      missing.push(secret);
    }
  });
  
  if (missing.length > 0) {
    console.log(`❌ Missing basic secrets: ${missing.join(', ')}`);
    return false;
  }
  
  console.log('✅ Basic secrets validated');
  return true;
}

/**
 * Validate secrets for specific test file
 */
export function validateSecretsForTestFile(testFilePath) {
  // Determine test types based on file name
  const testTypes = ['basic'];
  
  if (testFilePath.includes('admin')) {
    testTypes.push('admin');
  }
  if (testFilePath.includes('email') || testFilePath.includes('newsletter')) {
    testTypes.push('email');
  }
  if (testFilePath.includes('payment') || testFilePath.includes('checkout')) {
    testTypes.push('payment');
  }
  if (testFilePath.includes('wallet') || testFilePath.includes('ticket')) {
    testTypes.push('wallet');
  }
  if (testFilePath.includes('gallery')) {
    testTypes.push('gallery');
  }
  
  return validateSecrets({ testTypes });
}

export default validateSecrets;
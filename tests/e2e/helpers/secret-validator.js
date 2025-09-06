/**
 * Secret Detection and Validation System
 * 
 * Provides comprehensive secret validation for E2E tests.
 * Checks all required secrets at startup and fails fast if any are missing.
 * 
 * Features:
 * - Clear visual reporting of found vs missing secrets
 * - Intelligent value masking for security
 * - Categorized validation (required vs optional)
 * - Integration with E2E test setup
 * - Graceful degradation support
 */

/**
 * Secret configuration with validation rules
 */
const SECRET_CONFIG = {
  // Required secrets - tests cannot proceed without these
  required: {
    // Database secrets
    TURSO_DATABASE_URL: {
      description: 'Turso production database URL',
      validator: (value) => value && value.startsWith('libsql://'),
      maskPattern: (value) => `${value.substring(0, 10)}...${value.substring(value.length - 10)}`
    },
    TURSO_AUTH_TOKEN: {
      description: 'Turso database authentication token',
      validator: (value) => value && value.length > 50,
      maskPattern: (value) => `${value.substring(0, 8)}...(${value.length} chars)`
    },
    
    // Admin authentication
    ADMIN_PASSWORD: {
      description: 'Admin bcrypt hashed password',
      validator: (value) => value && (value.startsWith('$2b$') || value.startsWith('$2a$')),
      maskPattern: (value) => `bcrypt hash (${value.length} chars)`
    },
    ADMIN_SECRET: {
      description: 'Admin JWT signing secret',
      validator: (value) => value && value.length >= 32,
      maskPattern: (value) => `${value.substring(0, 6)}...(${value.length} chars)`
    },
    
    // Test admin credentials
    TEST_ADMIN_PASSWORD: {
      description: 'Plain text admin password for E2E tests',
      validator: (value) => value && value.length >= 8,
      maskPattern: (value) => `****(${value.length} chars)`
    }
  },
  
  // Optional secrets - tests can gracefully degrade without these
  optional: {
    // Email service
    BREVO_API_KEY: {
      description: 'Brevo email service API key',
      validator: (value) => value && value.startsWith('xkeysib-'),
      maskPattern: (value) => `xkeysib-...${value.substring(value.length - 8)}`,
      gracefulDegradation: 'Newsletter tests will be skipped'
    },
    BREVO_NEWSLETTER_LIST_ID: {
      description: 'Brevo newsletter list ID',
      validator: (value) => value && !isNaN(parseInt(value)),
      maskPattern: (value) => value,
      gracefulDegradation: 'Newsletter subscription will use mock data'
    },
    BREVO_WEBHOOK_SECRET: {
      description: 'Brevo webhook validation secret',
      validator: (value) => value && value.length > 10,
      maskPattern: (value) => `${value.substring(0, 4)}...(${value.length} chars)`,
      gracefulDegradation: 'Webhook tests will be skipped'
    },
    
    // Payment processing
    STRIPE_SECRET_KEY: {
      description: 'Stripe payment processing secret key',
      validator: (value) => value && (value.startsWith('sk_test_') || value.startsWith('sk_live_')),
      maskPattern: (value) => `${value.substring(0, 12)}...(${value.length} chars)`,
      gracefulDegradation: 'Payment flow tests will be skipped'
    },
    STRIPE_PUBLISHABLE_KEY: {
      description: 'Stripe publishable key',
      validator: (value) => value && (value.startsWith('pk_test_') || value.startsWith('pk_live_')),
      maskPattern: (value) => `${value.substring(0, 12)}...${value.substring(value.length - 8)}`,
      gracefulDegradation: 'Payment UI tests will be skipped'
    },
    STRIPE_WEBHOOK_SECRET: {
      description: 'Stripe webhook endpoint secret',
      validator: (value) => value && value.startsWith('whsec_'),
      maskPattern: (value) => `whsec_...(${value.length - 6} chars)`,
      gracefulDegradation: 'Payment webhook tests will be skipped'
    },
    
    // Google Drive integration
    GOOGLE_DRIVE_API_KEY: {
      description: 'Google Drive API key for gallery',
      validator: (value) => value && value.length > 30,
      maskPattern: (value) => `${value.substring(0, 8)}...(${value.length} chars)`,
      gracefulDegradation: 'Gallery tests will use mock data'
    },
    GOOGLE_DRIVE_FOLDER_ID: {
      description: 'Google Drive folder ID for gallery photos',
      validator: (value) => value && value.length > 10,
      maskPattern: (value) => `${value.substring(0, 6)}...${value.substring(value.length - 6)}`,
      gracefulDegradation: 'Gallery will show placeholder content'
    },
    
    // Wallet passes
    APPLE_PASS_KEY: {
      description: 'Apple Wallet pass signing key (base64)',
      validator: (value) => value && value.length > 100,
      maskPattern: (value) => `base64 key (${value.length} chars)`,
      gracefulDegradation: 'Apple Wallet tests will be skipped'
    },
    WALLET_AUTH_SECRET: {
      description: 'Wallet pass JWT signing secret',
      validator: (value) => value && value.length >= 32,
      maskPattern: (value) => `${value.substring(0, 6)}...(${value.length} chars)`,
      gracefulDegradation: 'Wallet pass generation tests will be skipped'
    },
    
    // Internal APIs
    INTERNAL_API_KEY: {
      description: 'Internal API authentication key',
      validator: (value) => value && value.length >= 16,
      maskPattern: (value) => `${value.substring(0, 4)}...(${value.length} chars)`,
      gracefulDegradation: 'Cache management tests will be skipped'
    },
    
    // CI/CD integration
    VERCEL_TOKEN: {
      description: 'Vercel deployment token',
      validator: (value) => value && value.length > 20,
      maskPattern: (value) => `${value.substring(0, 6)}...(${value.length} chars)`,
      gracefulDegradation: 'Using existing deployment instead of creating new one'
    },
    VERCEL_ORG_ID: {
      description: 'Vercel organization ID',
      validator: (value) => value && value.length > 10,
      maskPattern: (value) => `${value.substring(0, 4)}...${value.substring(value.length - 4)}`,
      gracefulDegradation: 'Using default Vercel organization'
    },
    GITHUB_TOKEN: {
      description: 'GitHub API token for PR integration',
      validator: (value) => value && (value.startsWith('ghp_') || value.startsWith('github_pat_')),
      maskPattern: (value) => `${value.substring(0, 8)}...(${value.length} chars)`,
      gracefulDegradation: 'GitHub integration features will be disabled'
    }
  }
};

/**
 * Validate a single secret
 */
function validateSecret(key, config, value) {
  const exists = value !== undefined && value !== null && value !== '';
  
  if (!exists) {
    return {
      key,
      exists: false,
      valid: false,
      description: config.description,
      gracefulDegradation: config.gracefulDegradation
    };
  }
  
  const valid = config.validator ? config.validator(value) : true;
  const maskedValue = config.maskPattern ? config.maskPattern(value) : '****';
  
  return {
    key,
    exists: true,
    valid,
    maskedValue,
    description: config.description,
    gracefulDegradation: config.gracefulDegradation
  };
}

/**
 * Perform comprehensive secret validation
 */
export function validateSecrets() {
  const results = {
    required: {},
    optional: {},
    summary: {
      requiredFound: 0,
      requiredMissing: 0,
      optionalFound: 0,
      optionalMissing: 0,
      totalSecrets: 0,
      allRequiredPresent: true,
      gracefulDegradations: []
    }
  };
  
  // Validate required secrets
  Object.entries(SECRET_CONFIG.required).forEach(([key, config]) => {
    const result = validateSecret(key, config, process.env[key]);
    results.required[key] = result;
    results.summary.totalSecrets++;
    
    if (result.exists && result.valid) {
      results.summary.requiredFound++;
    } else {
      results.summary.requiredMissing++;
      results.summary.allRequiredPresent = false;
    }
  });
  
  // Validate optional secrets
  Object.entries(SECRET_CONFIG.optional).forEach(([key, config]) => {
    const result = validateSecret(key, config, process.env[key]);
    results.optional[key] = result;
    results.summary.totalSecrets++;
    
    if (result.exists && result.valid) {
      results.summary.optionalFound++;
    } else {
      results.summary.optionalMissing++;
      if (result.gracefulDegradation) {
        results.summary.gracefulDegradations.push({
          key,
          degradation: result.gracefulDegradation
        });
      }
    }
  });
  
  return results;
}

/**
 * Generate comprehensive validation report
 */
export function generateSecretReport(results) {
  const lines = [];
  
  // Header
  lines.push('🔐 SECRET VALIDATION REPORT');
  lines.push('='.repeat(60));
  
  // Required secrets section
  lines.push('📋 REQUIRED SECRETS:');
  Object.values(results.required).forEach(result => {
    const status = (result.exists && result.valid) ? '✅ FOUND' : '❌ MISSING';
    const details = result.exists && result.valid 
      ? `(${result.maskedValue})`
      : `- ${result.description}`;
    lines.push(`   ${status}: ${result.key} ${details}`);
  });
  
  lines.push(''); // Empty line
  
  // Optional secrets section
  lines.push('🔧 OPTIONAL SECRETS:');
  Object.values(results.optional).forEach(result => {
    const status = (result.exists && result.valid) ? '✅ FOUND' : '⚠️  MISSING';
    const details = result.exists && result.valid 
      ? `(${result.maskedValue})`
      : `- ${result.description}`;
    lines.push(`   ${status}: ${result.key} ${details}`);
  });
  
  lines.push(''); // Empty line
  
  // Graceful degradation section
  if (results.summary.gracefulDegradations.length > 0) {
    lines.push('🎭 GRACEFUL DEGRADATIONS:');
    results.summary.gracefulDegradations.forEach(({ key, degradation }) => {
      lines.push(`   📉 ${key}: ${degradation}`);
    });
    lines.push(''); // Empty line
  }
  
  // Summary section
  lines.push('📊 VALIDATION SUMMARY:');
  lines.push(`   Required Secrets: ${results.summary.requiredFound}/${results.summary.requiredFound + results.summary.requiredMissing} found`);
  lines.push(`   Optional Secrets: ${results.summary.optionalFound}/${results.summary.optionalFound + results.summary.optionalMissing} found`);
  lines.push(`   Total Secrets: ${results.summary.requiredFound + results.summary.optionalFound}/${results.summary.totalSecrets} available`);
  
  // Status and next steps
  lines.push('='.repeat(60));
  
  if (results.summary.allRequiredPresent) {
    lines.push('✅ STATUS: All required secrets present - tests can proceed');
    if (results.summary.gracefulDegradations.length > 0) {
      lines.push(`⚠️  NOTE: ${results.summary.gracefulDegradations.length} features will use graceful degradation`);
    }
  } else {
    lines.push('❌ FATAL: Required secrets missing - tests cannot proceed');
    lines.push('🚨 ACTION REQUIRED: Configure missing required secrets before running E2E tests');
  }
  
  return lines.join('\n');
}

/**
 * Validate secrets and throw if required ones are missing
 */
export function validateSecretsOrFail() {
  console.log('🔍 Validating E2E test environment secrets...\n');
  
  const results = validateSecrets();
  const report = generateSecretReport(results);
  
  console.log(report);
  
  if (!results.summary.allRequiredPresent) {
    const missingRequired = Object.entries(results.required)
      .filter(([_, result]) => !result.exists || !result.valid)
      .map(([key, _]) => key);
    
    throw new Error(
      `❌ E2E Test Startup Failed: ${missingRequired.length} required secrets missing: ${missingRequired.join(', ')}\n\n` +
      'Required secrets must be configured before running E2E tests.\n' +
      'See CLAUDE.md for complete secret configuration guide.'
    );
  }
  
  console.log('\n🚀 Secret validation passed - proceeding with E2E tests\n');
  return results;
}

/**
 * Set environment flags based on secret availability
 */
export function setGracefulDegradationFlags(results) {
  const flags = {};
  
  // Set availability flags for optional services
  Object.entries(results.optional).forEach(([key, result]) => {
    const flagKey = `${key}_AVAILABLE`;
    flags[flagKey] = result.exists && result.valid;
    process.env[flagKey] = flags[flagKey].toString();
  });
  
  // Special service group flags
  const serviceGroups = {
    BREVO_API_AVAILABLE: results.optional.BREVO_API_KEY?.valid || false,
    STRIPE_API_AVAILABLE: (results.optional.STRIPE_SECRET_KEY?.valid && results.optional.STRIPE_PUBLISHABLE_KEY?.valid) || false,
    GOOGLE_DRIVE_API_AVAILABLE: (results.optional.GOOGLE_DRIVE_API_KEY?.valid && results.optional.GOOGLE_DRIVE_FOLDER_ID?.valid) || false,
    WALLET_PASSES_AVAILABLE: (results.optional.APPLE_PASS_KEY?.valid && results.optional.WALLET_AUTH_SECRET?.valid) || false
  };
  
  Object.entries(serviceGroups).forEach(([flag, available]) => {
    flags[flag] = available;
    process.env[flag] = available.toString();
  });
  
  console.log('🎭 Graceful degradation flags set:');
  Object.entries(flags).forEach(([flag, available]) => {
    console.log(`   ${available ? '✅' : '❌'} ${flag}: ${available}`);
  });
  console.log('');
  
  return flags;
}

/**
 * Main entry point for E2E test secret validation
 */
export function initializeSecretValidation() {
  try {
    const results = validateSecretsOrFail();
    const flags = setGracefulDegradationFlags(results);
    
    return {
      results,
      flags,
      success: true
    };
  } catch (error) {
    console.error('\n❌ Secret validation failed during E2E test initialization:');
    console.error(error.message);
    
    return {
      results: null,
      flags: {},
      success: false,
      error
    };
  }
}

export default {
  validateSecrets,
  generateSecretReport,
  validateSecretsOrFail,
  setGracefulDegradationFlags,
  initializeSecretValidation
};
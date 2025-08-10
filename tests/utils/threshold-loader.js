/**
 * Threshold Loader for K6 Tests
 * 
 * This utility loads environment-aware thresholds for K6 performance tests.
 * It detects the current environment and returns appropriate thresholds
 * for different test types.
 */

// Environment detection logic
function detectEnvironment() {
  // Check explicit override first
  if (__ENV.PERF_TEST_ENV) {
    return __ENV.PERF_TEST_ENV;
  }

  // Check for CI environment indicators
  if (__ENV.GITHUB_ACTIONS || __ENV.CI || __ENV.CONTINUOUS_INTEGRATION) {
    return 'ci';
  }

  // Check deployment URL patterns for staging
  const baseUrl = __ENV.LOAD_TEST_BASE_URL || '';
  if (baseUrl.includes('staging') || baseUrl.includes('preview') || baseUrl.includes('dev')) {
    return 'staging';
  }

  // Check for production patterns
  if (baseUrl.includes('production') || baseUrl.includes('prod') || 
      baseUrl.includes('alocubanoboulderfest.vercel.app')) {
    return 'production';
  }

  // Default fallback to CI (most lenient)
  return 'ci';
}

// Threshold configurations by environment and test type
const THRESHOLDS = {
  ci: {
    'ticket-sales': {
      'http_req_duration': ['p(95)<2000', 'p(99)<5000'],
      'http_req_duration{name:payment}': ['p(95)<1500'],
      'http_req_duration{name:cart}': ['p(95)<800'],
      'http_req_failed': ['rate<0.05'],
      'api_errors': ['rate<0.05'],
      'ticket_purchase_success': ['rate>0.85'],
      'checkout_completion': ['rate>0.80'],
      'payment_processing_duration': ['avg<1000', 'p(95)<2000']
    },
    'check-in': {
      'http_req_duration{scenario:checkin_rush}': ['p(95)<500', 'p(99)<1500'],
      'qr_validation_duration': ['avg<200', 'p(95)<600'],
      'database_write_duration': ['avg<150', 'p(95)<400'],
      'checkin_success_rate': ['rate>0.90'],
      'duplicate_scan_rate': ['rate<0.10'],
      'invalid_qr_rate': ['rate<0.05'],
      'http_req_failed{scenario:checkin_rush}': ['rate<0.08']
    },
    'sustained': {
      'http_req_duration': ['p(95)<1000', 'p(99)<2500'],
      'api_response_time': ['avg<400', 'p(95)<1000'],
      'operation_success_rate': ['rate>0.95'],
      'error_rate': ['rate<0.05'],
      'cache_hit_rate': ['rate>0.60'],
      'memory_usage_mb': ['avg<768', 'max<1536'],
      'cpu_usage_percent': ['avg<80', 'max<95']
    },
    'stress': {
      'http_req_duration': ['p(95)<5000', 'p(99)<12000'],
      'http_req_failed': ['rate<0.20'],
      'failure_rate': ['rate<0.25'],
      'timeout_rate': ['rate<0.15'],
      'connection_refusal_rate': ['rate<0.15'],
      'resource_exhaustion_rate': ['rate<0.40'],
      'cascade_failure_rate': ['rate<0.15'],
      'recovery_time_ms': ['p(95)<120000']
    }
  },

  staging: {
    'ticket-sales': {
      'http_req_duration': ['p(95)<1200', 'p(99)<3000'],
      'http_req_duration{name:payment}': ['p(95)<800'],
      'http_req_duration{name:cart}': ['p(95)<400'],
      'http_req_failed': ['rate<0.03'],
      'api_errors': ['rate<0.03'],
      'ticket_purchase_success': ['rate>0.92'],
      'checkout_completion': ['rate>0.87'],
      'payment_processing_duration': ['avg<600', 'p(95)<1200']
    },
    'check-in': {
      'http_req_duration{scenario:checkin_rush}': ['p(95)<300', 'p(99)<800'],
      'qr_validation_duration': ['avg<120', 'p(95)<350'],
      'database_write_duration': ['avg<100', 'p(95)<200'],
      'checkin_success_rate': ['rate>0.96'],
      'duplicate_scan_rate': ['rate<0.06'],
      'invalid_qr_rate': ['rate<0.03'],
      'http_req_failed{scenario:checkin_rush}': ['rate<0.05']
    },
    'sustained': {
      'http_req_duration': ['p(95)<600', 'p(99)<1500'],
      'api_response_time': ['avg<250', 'p(95)<600'],
      'operation_success_rate': ['rate>0.97'],
      'error_rate': ['rate<0.03'],
      'cache_hit_rate': ['rate>0.70'],
      'memory_usage_mb': ['avg<512', 'max<1024'],
      'cpu_usage_percent': ['avg<70', 'max<90']
    },
    'stress': {
      'http_req_duration': ['p(95)<3000', 'p(99)<8000'],
      'http_req_failed': ['rate<0.15'],
      'failure_rate': ['rate<0.20'],
      'timeout_rate': ['rate<0.10'],
      'connection_refusal_rate': ['rate<0.12'],
      'resource_exhaustion_rate': ['rate<0.30'],
      'cascade_failure_rate': ['rate<0.10'],
      'recovery_time_ms': ['p(95)<60000']
    }
  },

  production: {
    'ticket-sales': {
      'http_req_duration': ['p(95)<800', 'p(99)<2000'],
      'http_req_duration{name:payment}': ['p(95)<500'],
      'http_req_duration{name:cart}': ['p(95)<300'],
      'http_req_failed': ['rate<0.02'],
      'api_errors': ['rate<0.02'],
      'ticket_purchase_success': ['rate>0.95'],
      'checkout_completion': ['rate>0.90'],
      'payment_processing_duration': ['avg<400', 'p(95)<800']
    },
    'check-in': {
      'http_req_duration{scenario:checkin_rush}': ['p(95)<200', 'p(99)<500'],
      'qr_validation_duration': ['avg<80', 'p(95)<200'],
      'database_write_duration': ['avg<60', 'p(95)<120'],
      'checkin_success_rate': ['rate>0.98'],
      'duplicate_scan_rate': ['rate<0.05'],
      'invalid_qr_rate': ['rate<0.02'],
      'http_req_failed{scenario:checkin_rush}': ['rate<0.03']
    },
    'sustained': {
      'http_req_duration': ['p(95)<400', 'p(99)<1000'],
      'api_response_time': ['avg<150', 'p(95)<400'],
      'operation_success_rate': ['rate>0.99'],
      'error_rate': ['rate<0.01'],
      'cache_hit_rate': ['rate>0.80'],
      'memory_usage_mb': ['avg<400', 'max<800'],
      'cpu_usage_percent': ['avg<60', 'max<80']
    },
    'stress': {
      'http_req_duration': ['p(95)<2000', 'p(99)<5000'],
      'http_req_failed': ['rate<0.10'],
      'failure_rate': ['rate<0.15'],
      'timeout_rate': ['rate<0.05'],
      'connection_refusal_rate': ['rate<0.08'],
      'resource_exhaustion_rate': ['rate<0.20'],
      'cascade_failure_rate': ['rate<0.05'],
      'recovery_time_ms': ['p(95)<30000']
    }
  }
};

/**
 * Get thresholds for a specific test type in the current environment
 * @param {string} testType - The test type (ticket-sales, check-in, sustained, stress)
 * @returns {object} Threshold configuration object
 */
export function getThresholds(testType) {
  const environment = detectEnvironment();
  
  if (!THRESHOLDS[environment]) {
    console.warn(`Unknown environment '${environment}', falling back to 'ci'`);
    environment = 'ci';
  }

  if (!THRESHOLDS[environment][testType]) {
    throw new Error(`Unknown test type '${testType}' for environment '${environment}'`);
  }

  const thresholds = THRESHOLDS[environment][testType];
  
  // Log threshold selection for debugging
  console.log(`🎯 Using ${environment} thresholds for ${testType} test`);
  console.log(`📊 Threshold count: ${Object.keys(thresholds).length}`);
  
  return {
    environment: environment,
    testType: testType,
    thresholds: thresholds,
    metadata: {
      timestamp: new Date().toISOString(),
      detectionMethod: 'environment-variables',
      baseUrl: __ENV.LOAD_TEST_BASE_URL || 'not-set'
    }
  };
}

/**
 * Get execution parameters for the current environment
 * @param {string} testType - The test type
 * @returns {object} Execution parameters
 */
export function getExecutionParams(testType) {
  const environment = detectEnvironment();
  
  const params = {
    ci: {
      maxDuration: '10m',
      maxUsers: 50,
      reducedScope: true,
      skipStress: true
    },
    staging: {
      maxDuration: '30m', 
      maxUsers: 200,
      fullScope: true,
      includeStress: true
    },
    production: {
      maxDuration: '45m',
      maxUsers: 400,
      comprehensive: true,
      capacityPlanning: true
    }
  };

  return params[environment] || params.ci;
}

/**
 * Check if current environment supports a specific test type
 * @param {string} testType - The test type to check
 * @returns {boolean} True if supported
 */
export function isTestTypeSupported(testType) {
  const environment = detectEnvironment();
  const execParams = getExecutionParams(testType);
  
  if (testType === 'stress' && execParams.skipStress) {
    return false;
  }
  
  return true;
}

/**
 * Get environment-specific timeout adjustments
 * @returns {object} Timeout configuration
 */
export function getTimeoutConfig() {
  const environment = detectEnvironment();
  
  return {
    ci: {
      httpTimeout: '30s',
      setupTimeout: '60s',
      teardownTimeout: '30s'
    },
    staging: {
      httpTimeout: '25s',
      setupTimeout: '45s', 
      teardownTimeout: '30s'
    },
    production: {
      httpTimeout: '20s',
      setupTimeout: '30s',
      teardownTimeout: '30s'
    }
  }[environment] || { httpTimeout: '30s', setupTimeout: '60s', teardownTimeout: '30s' };
}

/**
 * Log environment detection results for debugging
 */
export function logEnvironmentInfo() {
  const environment = detectEnvironment();
  const baseUrl = __ENV.LOAD_TEST_BASE_URL || 'not-set';
  
  console.log('🔍 Environment Detection Results:');
  console.log(`   Environment: ${environment}`);
  console.log(`   Base URL: ${baseUrl}`);
  console.log(`   GitHub Actions: ${__ENV.GITHUB_ACTIONS || 'false'}`);
  console.log(`   CI Flag: ${__ENV.CI || 'false'}`);
  console.log(`   Explicit Override: ${__ENV.PERF_TEST_ENV || 'none'}`);
}

// Export environment detection for external use
export { detectEnvironment };
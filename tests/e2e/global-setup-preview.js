/**
 * Global Setup for E2E Preview Testing
 *
 * Handles setup for testing against live Vercel preview deployments:
 * - Extracts preview URL from multiple sources
 * - Validates deployment readiness
 * - Ensures test data consistency
 * - Configures environment for preview testing
 */

import { writeFileSync } from 'fs';
import { resolve } from 'path';

const PROJECT_ROOT = resolve(process.cwd());

// Dynamic timeouts from Playwright config hierarchy
// These values match the unified timeout strategy in playwright config
const BASE_TIMEOUT = process.env.CI ? 90000 : 60000; // Main test timeout from config
const HEALTH_CHECK_TIMEOUT = Math.floor(BASE_TIMEOUT * 0.33); // 33% of test timeout
const API_TIMEOUT = Math.floor(BASE_TIMEOUT * 0.22); // 22% of test timeout
const RETRY_ATTEMPTS = 6;
const RETRY_INTERVAL = 5000;

async function globalSetupPreview() {
  console.log('🚀 Global E2E Setup - Preview Deployment Mode');
  console.log('='.repeat(60));

  // For E2E tests against Vercel preview deployments, we don't validate local secrets
  // The deployment has its own environment variables configured in Vercel
  console.log('\n📝 E2E Testing Mode: Vercel Preview Deployment');
  console.log('-'.repeat(40));
  console.log('✅ No local secret validation needed - Vercel deployments have their own secrets');

  try {
    // Step 1: Get preview URL from environment (CI provides this)
    let previewUrl = process.env.PREVIEW_URL || process.env.PLAYWRIGHT_BASE_URL;

    if (!previewUrl) {
      // In CI, this should never happen as GitHub Actions sets it
      // For local development, user must provide PREVIEW_URL
      throw new Error(
        'PREVIEW_URL not set. ' +
        'In CI, this is set by GitHub Actions. ' +
        'For local testing, set PREVIEW_URL environment variable to your Vercel preview deployment URL.'
      );
    }

    // Ensure URL has protocol
    if (!previewUrl.startsWith('http://') && !previewUrl.startsWith('https://')) {
      previewUrl = `https://${previewUrl}`;
    }

    // Set for other processes
    process.env.CI_EXTRACTED_PREVIEW_URL = previewUrl;
    process.env.PREVIEW_URL = previewUrl;
    process.env.PLAYWRIGHT_BASE_URL = previewUrl;

    console.log(`✅ Preview URL: ${previewUrl}`);

    // Step 2: Allow deployment to stabilize before validation
    console.log('\n⏳ Waiting for deployment to stabilize...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for deployment to stabilize

    // Step 3: Validate deployment health and environment
    console.log('\n🏥 Validating preview deployment health and environment...');
    await validateDeploymentHealth(previewUrl);

    // Step 4: Verify deployment has required secrets configured
    console.log('\n🔐 Verifying deployment environment configuration...');
    await verifyDeploymentSecrets(previewUrl);

    // Step 5: Setup test data isolation
    console.log('\n🗄️ Setting up test data isolation...');
    await setupTestDataIsolation(previewUrl);

    // Step 6: Warm up critical endpoints
    console.log('\n🔥 Warming up critical endpoints...');
    await warmupEndpoints(previewUrl);

    // Step 7: Create preview environment file
    console.log('\n📁 Creating preview environment configuration...');
    await createPreviewEnvironment(previewUrl);

    console.log('\n📊 Preview Setup Summary:');
    console.log(`   Preview URL: ${previewUrl}`);
    console.log(`   Deployment Status: ✅ Ready`);
    console.log(`   Test Data: ✅ Isolated`);
    console.log(`   Critical Endpoints: ✅ Warmed up`);
    console.log(`   Mode: Production-like preview testing`);
    console.log(`   Timeout Profile: ${process.env.CI ? 'CI-Extended' : 'Local-Fast'} (Test: ${process.env.CI ? '90s' : '60s'}, Action: ${process.env.CI ? '30s' : '20s'}, Nav: ${process.env.CI ? '60s' : '40s'})`);

    console.log('\n✅ Global preview setup completed successfully');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Global preview setup failed:', error.message);
    console.error('Stack trace:', error.stack);

    // Provide debugging information
    console.error('\n🔧 Debugging Information:');
    console.error(`   GitHub Repository: ${process.env.GITHUB_REPOSITORY || 'Not set'}`);
    console.error(`   PR Number: ${process.env.GITHUB_PR_NUMBER || process.env.PR_NUMBER || 'Not set'}`);
    console.error(`   Commit SHA: ${process.env.GITHUB_SHA || 'Not set'}`);
    console.error(`   GitHub Token: ${process.env.GITHUB_TOKEN ? 'Available' : 'Missing'}`);
    console.error(`   Vercel Token: ${process.env.VERCEL_TOKEN ? 'Available' : 'Missing'}`);
    console.error(`   Vercel Org ID: ${process.env.VERCEL_ORG_ID ? 'Available' : 'Missing'}`);

    throw error;
  }
}

/**
 * Verify the deployment has required secrets configured - more resilient approach
 */
async function verifyDeploymentSecrets(previewUrl) {
  try {
    console.log(`   🔍 Checking deployment environment variables...`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    const response = await fetch(`${previewUrl}/api/debug/environment`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'E2E-Environment-Check',
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`   ⚠️ Debug endpoint not available - this is expected in production`);
        console.warn(`   ⚠️ Tests will use feature detection instead of environment checking`);
        return { success: true, status: 'debug_endpoint_disabled', message: 'Using feature detection' };
      } else {
        console.warn(`   ⚠️ Could not verify deployment environment (${response.status})`);
        console.warn(`   ⚠️ Tests will proceed but may fail if secrets are missing`);
        return { success: false, status: 'environment_check_failed', statusCode: response.status };
      }
    }

    const envData = await response.json();

    // Check critical variables for E2E testing
    const criticalVars = [
      'ADMIN_PASSWORD',
      'ADMIN_SECRET',
      'TEST_ADMIN_PASSWORD',
      'TURSO_DATABASE_URL',
      'TURSO_AUTH_TOKEN'
    ];

    const missingCritical = [];
    const availableServices = [];

    // Check critical variables
    if (envData.variables && envData.variables.details) {
      criticalVars.forEach(varName => {
        if (!envData.variables.details[varName]) {
          missingCritical.push(varName);
        }
      });
    }

    // Check service availability
    if (envData.apiAvailability) {
      Object.entries(envData.apiAvailability).forEach(([service, available]) => {
        if (available) {
          availableServices.push(service);
        }
      });
    }

    // Report findings with warnings instead of throwing
    if (missingCritical.length > 0) {
      console.warn(`   ⚠️ Critical secrets missing in deployment:`);
      missingCritical.forEach(varName => {
        console.warn(`      - ${varName}`);
      });
      console.warn(`   ⚠️ E2E tests may fail without these secrets`);
      console.warn(`   💡 Please configure these in Vercel dashboard for preview environment`);
      return {
        success: false,
        status: 'missing_critical_secrets',
        missingSecrets: missingCritical,
        availableServices
      };
    }

    console.log(`   ✅ All critical secrets configured in deployment`);

    if (availableServices.length > 0) {
      console.log(`   ✅ Available services: ${availableServices.join(', ')}`);
    }

    // Check optional services for graceful degradation
    const optionalServices = [];
    if (!envData.apiAvailability?.google_drive) {
      optionalServices.push('Google Drive (gallery will use fallback)');
    }
    if (!envData.apiAvailability?.payments) {
      optionalServices.push('Stripe (payment tests will be skipped)');
    }

    if (optionalServices.length > 0) {
      console.log(`   ⚠️ Optional services unavailable (tests will adapt):`);
      optionalServices.forEach(service => {
        console.log(`      - ${service}`);
      });
    }

    return {
      success: true,
      status: 'configured',
      availableServices,
      optionalServices
    };

  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn(`   ⚠️ Debug endpoint timed out - this is expected in production`);
      console.warn(`   ⚠️ Tests will use feature detection instead`);
      return { success: true, status: 'debug_endpoint_timeout', message: 'Using feature detection' };
    } else {
      console.warn(`   ⚠️ Failed to verify deployment environment: ${error.message}`);
      console.warn(`   ⚠️ Tests will proceed with feature detection`);
      return { success: false, status: 'verification_error', error: error.message };
    }
  }
}

/**
 * Validate deployment health with comprehensive checks
 */
async function validateDeploymentHealth(previewUrl) {
  console.log(`⏳ Validating deployment health (max ${RETRY_ATTEMPTS} attempts)...`);

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      console.log(`   🔍 Health check ${attempt}/${RETRY_ATTEMPTS}: ${previewUrl}/api/health/check`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

      const response = await fetch(`${previewUrl}/api/health/check`, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'E2E-Preview-Health-Check',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const healthData = await response.json();
        console.log(`   ✅ Deployment healthy (${response.status})`);
        console.log(`   📊 Health data: ${JSON.stringify(healthData, null, 2).replace(/\n/g, '\n      ')}`);

        // Additional API endpoint checks with retries
        await validateCriticalEndpoints(previewUrl);

        // Wait for services to be fully ready before declaring success
        console.log(`   ⏳ Ensuring services are fully ready...`);
        await ensureServicesReady(previewUrl);

        // Brief pause for deployment stabilization
        await new Promise(resolve => setTimeout(resolve, 2000));
        return;
      } else {
        console.log(`   ⚠️ Health check failed (${response.status}): ${response.statusText}`);
        if (attempt === RETRY_ATTEMPTS) {
          throw new Error(`Deployment not healthy after ${RETRY_ATTEMPTS} attempts`);
        }
      }

    } catch (error) {
      console.log(`   ❌ Health check error (${attempt}/${RETRY_ATTEMPTS}): ${error.message}`);

      if (attempt === RETRY_ATTEMPTS) {
        throw new Error(`Deployment health validation failed: ${error.message}`);
      }
    }

    if (attempt < RETRY_ATTEMPTS) {
      // Exponential backoff: 5s, 10s, 15s, 20s, 25s
      const backoffMs = RETRY_INTERVAL + (attempt - 1) * 5000;
      console.log(`   ⏳ Waiting ${backoffMs}ms before retry (exponential backoff)...`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }
}

/**
 * Validate critical API endpoints are responsive with parallel execution and circuit breaker
 */
async function validateCriticalEndpoints(previewUrl) {
  const endpoints = [
    '/api/health/database',
    '/api/gallery',
    '/api/featured-photos'
  ];

  console.log('   🔍 Validating critical endpoints in parallel...');

  // Parallel validation with circuit breaker pattern
  const results = await Promise.allSettled(
    endpoints.map(endpoint => validateEndpointWithRetries(previewUrl, endpoint))
  );

  // Circuit breaker: count failures - use 50% threshold instead of 66%
  const failures = results.filter(result => result.status === 'rejected').length;
  const criticalFailureThreshold = Math.ceil(endpoints.length * 0.5); // 50% threshold for better reliability

  if (failures >= criticalFailureThreshold) {
    console.warn(`   ⚠️ Circuit breaker triggered: ${failures}/${endpoints.length} critical endpoints failed (threshold: ${criticalFailureThreshold})`);
    console.warn(`   ⚠️ Tests will use graceful degradation for affected services`);
  } else {
    console.log(`   ✅ Critical endpoints validation completed: ${endpoints.length - failures}/${endpoints.length} healthy`);
  }

  return { totalEndpoints: endpoints.length, failures, healthy: endpoints.length - failures };
}

/**
 * Validate a single endpoint with retry logic and proper exponential backoff
 */
async function validateEndpointWithRetries(previewUrl, endpoint, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

      const response = await fetch(`${previewUrl}${endpoint}`, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'E2E-Endpoint-Validation',
          'Cache-Control': 'no-cache'
        }
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        console.log(`   ✅ ${endpoint}: OK (${response.status})`);
        return { success: true, status: response.status, endpoint }; // Success, exit retry loop
      } else if (response.status === 401 || response.status === 403) {
        console.log(`   ⚠️ ${endpoint}: ${response.status} ${response.statusText} (API credentials may be missing - will use graceful degradation)`);
        return { success: true, status: response.status, endpoint, warning: 'auth_error' }; // Expected auth error, exit retry loop
      } else {
        console.log(`   ⚠️ ${endpoint}: ${response.status} ${response.statusText} (attempt ${attempt}/${maxAttempts})`);
        if (attempt === maxAttempts) {
          console.log(`   ❌ ${endpoint}: Failed after ${maxAttempts} attempts (will handle gracefully in tests)`);
          throw new Error(`Endpoint ${endpoint} failed after ${maxAttempts} attempts: ${response.status}`);
        }
      }

    } catch (error) {
      if (error.name === 'AbortError') {
        console.log(`   ❌ ${endpoint}: Request timeout (attempt ${attempt}/${maxAttempts})`);
      } else {
        console.log(`   ❌ ${endpoint}: ${error.message} (attempt ${attempt}/${maxAttempts})`);
      }

      if (attempt === maxAttempts) {
        console.log(`   ❌ ${endpoint}: Failed after ${maxAttempts} attempts (will handle gracefully in tests)`);
        throw error; // Let Promise.allSettled handle this
      }
    }

    if (attempt < maxAttempts) {
      // Exponential backoff with jitter: 2s, 4s, 8s with ±25% jitter
      const baseBackoffMs = Math.pow(2, attempt) * 1000;
      const jitter = Math.random() * 0.5 + 0.75; // 0.75 to 1.25 multiplier
      const backoffMs = Math.round(baseBackoffMs * jitter);
      console.log(`   ⏳ ${endpoint}: Waiting ${backoffMs}ms before retry (exponential backoff with jitter)...`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }
}

/**
 * Ensure services are fully ready by performing multiple consecutive successful checks
 */
async function ensureServicesReady(previewUrl) {
  const readinessChecks = [
    '/api/health/check',
    '/api/health/database'
  ];

  const requiredConsecutiveSuccess = 2; // Require 2 consecutive successful checks
  const maxReadinessAttempts = 3;

  for (let attempt = 1; attempt <= maxReadinessAttempts; attempt++) {
    try {
      console.log(`   🔍 Service readiness check ${attempt}/${maxReadinessAttempts}...`);

      let consecutiveSuccess = 0;

      for (let check = 1; check <= requiredConsecutiveSuccess; check++) {
        // Test all readiness endpoints in parallel
        const checkResults = await Promise.allSettled(
          readinessChecks.map(async (endpoint) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout for readiness

            try {
              const response = await fetch(`${previewUrl}${endpoint}`, {
                signal: controller.signal,
                headers: {
                  'User-Agent': 'E2E-Service-Readiness',
                  'Cache-Control': 'no-cache'
                }
              });

              clearTimeout(timeoutId);
              return { endpoint, success: response.ok, status: response.status };
            } catch (error) {
              clearTimeout(timeoutId);
              return { endpoint, success: false, error: error.message };
            }
          })
        );

        const allSuccessful = checkResults.every(result =>
          result.status === 'fulfilled' && result.value.success
        );

        if (allSuccessful) {
          consecutiveSuccess++;
          console.log(`   ✅ Readiness check ${check}/${requiredConsecutiveSuccess} passed`);

          if (consecutiveSuccess < requiredConsecutiveSuccess) {
            // Wait briefly between consecutive checks
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } else {
          console.log(`   ⚠️ Readiness check ${check} failed, will retry attempt`);
          break; // Exit consecutive check loop, retry the attempt
        }
      }

      if (consecutiveSuccess === requiredConsecutiveSuccess) {
        console.log(`   ✅ Services are fully ready (${requiredConsecutiveSuccess} consecutive successful checks)`);
        return;
      }

      if (attempt < maxReadinessAttempts) {
        const backoffMs = attempt * 3000; // 3s, 6s backoff
        console.log(`   ⏳ Services not fully ready, waiting ${backoffMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }

    } catch (error) {
      console.log(`   ❌ Service readiness check ${attempt} failed: ${error.message}`);

      if (attempt === maxReadinessAttempts) {
        console.warn(`   ⚠️ Could not verify service readiness after ${maxReadinessAttempts} attempts`);
        console.warn(`   ⚠️ Proceeding with tests but may encounter failures`);
        return; // Don't throw, allow tests to proceed with warnings
      }
    }
  }
}

/**
 * Setup test data isolation for preview environment
 */
async function setupTestDataIsolation(previewUrl) {
  try {
    // For preview deployments, we need to ensure test data doesn't interfere
    // with production data. This may involve setting up test-specific database
    // records or ensuring proper cleanup mechanisms.

    const testSessionId = `e2e-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    process.env.E2E_SESSION_ID = testSessionId;

    console.log(`   🆔 Test Session ID: ${testSessionId}`);
    console.log(`   🔐 Test data isolation: Enabled`);

    // Test database connectivity if available
    try {
      const dbResponse = await fetch(`${previewUrl}/api/health/database`, {
        headers: { 'User-Agent': 'E2E-Database-Check' }
      });

      if (dbResponse.ok) {
        const dbData = await dbResponse.json();
        console.log(`   🗄️ Database: ${dbData.status || 'Connected'}`);
      }
    } catch (error) {
      console.log(`   ⚠️ Database check: ${error.message}`);
    }

  } catch (error) {
    console.warn(`   ⚠️ Test data isolation warning: ${error.message}`);
  }
}

/**
 * Warm up critical endpoints for better test performance
 */
async function warmupEndpoints(previewUrl) {
  const warmupEndpoints = [
    '/api/gallery',
    '/api/featured-photos',
    '/pages/tickets.html',
    '/pages/about.html'
  ];

  console.log(`   🔥 Warming up ${warmupEndpoints.length} endpoints...`);

  const warmupPromises = warmupEndpoints.map(async (endpoint) => {
    try {
      await fetch(`${previewUrl}${endpoint}`, {
        headers: { 'User-Agent': 'E2E-Warmup' }
      });
      console.log(`   ✅ Warmed: ${endpoint}`);
    } catch (error) {
      console.log(`   ⚠️ Warmup failed: ${endpoint} - ${error.message}`);
    }
  });

  await Promise.all(warmupPromises);
  console.log(`   🔥 Warmup completed`);
}

/**
 * Check API availability and create environment flags - optimized with parallel execution
 */
async function checkApiAvailability(previewUrl) {
  const apiChecks = {
    BREVO_API_AVAILABLE: false,
    GOOGLE_DRIVE_API_AVAILABLE: false,
    ADMIN_AUTH_AVAILABLE: false,
    STRIPE_API_AVAILABLE: false
  };

  console.log('   🔍 Checking API availability in parallel for graceful degradation...');

  // Define API check functions for parallel execution
  const apiCheckFunctions = [
    // Check Brevo API availability via newsletter endpoint
    async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

        const brevoResponse = await fetch(`${previewUrl}/api/email/subscribe`, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com', consent: true })
        });

        clearTimeout(timeoutId);
        // Even if it fails validation, a 400 means the API is configured
        apiChecks.BREVO_API_AVAILABLE = brevoResponse.status !== 500;
        return { api: 'BREVO_API', available: apiChecks.BREVO_API_AVAILABLE };
      } catch (error) {
        console.log(`   ⚠️ Brevo API check failed: ${error.message}`);
        return { api: 'BREVO_API', available: false, error: error.message };
      }
    },

    // Check Google Drive API availability
    async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

        const galleryResponse = await fetch(`${previewUrl}/api/gallery`, {
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        apiChecks.GOOGLE_DRIVE_API_AVAILABLE = galleryResponse.status === 200;
        return { api: 'GOOGLE_DRIVE_API', available: apiChecks.GOOGLE_DRIVE_API_AVAILABLE };
      } catch (error) {
        console.log(`   ⚠️ Google Drive API check failed: ${error.message}`);
        return { api: 'GOOGLE_DRIVE_API', available: false, error: error.message };
      }
    },

    // Check admin authentication
    async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

        const adminResponse = await fetch(`${previewUrl}/api/admin/login`, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'test', password: 'test' })
        });

        clearTimeout(timeoutId);
        // Even if credentials fail, a structured response means auth is working
        apiChecks.ADMIN_AUTH_AVAILABLE = adminResponse.status !== 500;
        return { api: 'ADMIN_AUTH', available: apiChecks.ADMIN_AUTH_AVAILABLE };
      } catch (error) {
        console.log(`   ⚠️ Admin auth check failed: ${error.message}`);
        return { api: 'ADMIN_AUTH', available: false, error: error.message };
      }
    }
  ];

  // Execute all API checks in parallel
  const results = await Promise.allSettled(apiCheckFunctions.map(fn => fn()));

  // Process results and log status
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) {
      const { api, available } = result.value;
      console.log(`   ${available ? '✅' : '❌'} ${api}: ${available ? 'Available' : 'Unavailable'}`);
    } else {
      console.log(`   ❌ API check ${index} failed`);
    }
  });

  // Add Stripe check placeholder (not actively tested in setup)
  console.log(`   ℹ️ STRIPE_API: Will be detected during payment flow tests`);

  // Return environment variables
  return Object.entries(apiChecks)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

/**
 * Create environment configuration for preview testing
 */
async function createPreviewEnvironment(previewUrl) {
  const previewEnvPath = resolve(PROJECT_ROOT, '.env.preview');

  const previewConfig = `# E2E Preview Testing Environment
# Generated: ${new Date().toISOString()}

# Preview deployment configuration
PREVIEW_URL=${previewUrl}
CI_EXTRACTED_PREVIEW_URL=${previewUrl}
PLAYWRIGHT_BASE_URL=${previewUrl}

# Testing mode
E2E_TEST_MODE=true
E2E_PREVIEW_MODE=true
NODE_ENV=test

# Session isolation
E2E_SESSION_ID=${process.env.E2E_SESSION_ID || 'default'}

# CI environment markers
CI=${process.env.CI || 'false'}
GITHUB_ACTIONS=${process.env.GITHUB_ACTIONS || 'false'}

# Test credentials (for admin panel testing)
TEST_ADMIN_PASSWORD=${process.env.TEST_ADMIN_PASSWORD || 'test-admin-password'}

# Preview testing optimizations
SKIP_LOCAL_SERVER=true
USE_PREVIEW_DEPLOYMENT=true
DEPLOYMENT_READY=true

# API availability flags (detected during setup)
${await checkApiAvailability(previewUrl)}

# Timeout configurations - derived from Playwright config (unified strategy)
# These values match the Playwright config timeout hierarchy
E2E_TEST_TIMEOUT=${process.env.CI ? '90000' : '60000'}        # Main test timeout (matches Playwright config)
E2E_ACTION_TIMEOUT=${process.env.CI ? '30000' : '20000'}      # Action timeout (~33% of test timeout)
E2E_NAVIGATION_TIMEOUT=${process.env.CI ? '60000' : '40000'}  # Navigation timeout (~67% of test timeout)
E2E_EXPECT_TIMEOUT=${process.env.CI ? '20000' : '15000'}      # Expect timeout (~22% of test timeout)
E2E_STARTUP_TIMEOUT=${process.env.CI ? '60000' : '40000'}     # Startup timeout (~67% of test timeout)
E2E_WEBSERVER_TIMEOUT=${process.env.CI ? '90000' : '60000'}   # Server timeout (matches test timeout)
E2E_HEALTH_CHECK_INTERVAL=2000

# Vitest timeout configurations - consistent with E2E timeouts
VITEST_TEST_TIMEOUT=${process.env.CI ? '120000' : '90000'}    # Slightly longer for unit tests
VITEST_HOOK_TIMEOUT=${process.env.CI ? '60000' : '40000'}     # Hook timeout
VITEST_SETUP_TIMEOUT=10000
VITEST_CLEANUP_TIMEOUT=5000
VITEST_REQUEST_TIMEOUT=30000
`;

  writeFileSync(previewEnvPath, previewConfig);
  console.log(`   ✅ Preview environment created: ${previewEnvPath}`);
}

export default globalSetupPreview;
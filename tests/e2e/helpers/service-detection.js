/**
 * Service Detection Helper - Graceful degradation for E2E tests
 *
 * Provides utilities for detecting service availability and enabling
 * conditional test execution based on service status.
 */

// Global cache to avoid repeated service checks
let serviceCache = null;
let lastCacheTime = 0;
const CACHE_DURATION = 30000; // 30 seconds

/**
 * Check if a service is available with timeout and error handling
 * @param {Page} page - Playwright page object
 * @param {string} endpoint - API endpoint to check
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} True if service is available
 */
async function checkServiceAvailability(page, endpoint, options = {}) {
  const {
    timeout = 5000,
    expectedStatus = 200,
    method = 'GET',
    description = endpoint
  } = options;

  try {
    console.log(`🔍 Checking ${description} availability at ${endpoint}...`);

    const response = await Promise.race([
      page.request[method.toLowerCase()](endpoint),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      )
    ]);

    if (response.ok() || response.status() === expectedStatus) {
      console.log(`✅ ${description} is available (status: ${response.status()})`);
      return true;
    } else {
      console.log(`📍 ${description} returned status ${response.status()}`);
      return false;
    }
  } catch (error) {
    console.log(`📍 ${description} check failed: ${error.message}`);
    return false;
  }
}

/**
 * Check Google Drive API availability
 * @param {Page} page - Playwright page object
 * @returns {Promise<boolean>} True if Google Drive API is available
 */
async function checkGoogleDriveAPI(page) {
  // First check if environment debug endpoint exists
  const hasDebugEndpoint = await checkServiceAvailability(page, '/api/debug/environment', {
    description: 'Debug Environment API',
    timeout: 5000
  });

  if (!hasDebugEndpoint) {
    console.log('📍 No debug endpoint available, skipping Google Drive config check');
    return false;
  }

  try {
    // Check environment configuration
    const envResponse = await page.request.get('/api/debug/environment');
    if (!envResponse.ok()) {
      return false;
    }

    const envData = await envResponse.json();
    const hasServiceAccount = !!envData.variables?.details?.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const hasPrivateKey = !!envData.variables?.details?.GOOGLE_PRIVATE_KEY;
    const hasFolderId = !!envData.variables?.details?.GOOGLE_DRIVE_GALLERY_FOLDER_ID;

    const isConfigured = hasServiceAccount && hasPrivateKey && hasFolderId;

    if (!isConfigured) {
      console.log('📍 Google Drive configuration incomplete');
      return false;
    }

    // Check if gallery API returns real data
    const galleryResponse = await page.request.get('/api/gallery?eventId=boulder-fest-2025');
    if (!galleryResponse.ok()) {
      console.log('📍 Gallery API endpoint not available');
      return false;
    }

    const galleryData = await galleryResponse.json();
    const hasRealData = galleryData.items && galleryData.items.length > 0 && !galleryData.error;

    if (hasRealData) {
      console.log(`✅ Google Drive API working with ${galleryData.items.length} items`);
      return true;
    } else {
      console.log('📍 Google Drive API configured but no data available');
      return false;
    }
  } catch (error) {
    console.log(`📍 Google Drive API check failed: ${error.message}`);
    return false;
  }
}

/**
 * Check admin authentication availability
 * @param {Page} page - Playwright page object
 * @returns {Promise<boolean>} True if admin auth is available
 */
async function checkAdminAuth(page) {
  // Check if admin login endpoint is available
  const hasLoginEndpoint = await checkServiceAvailability(page, '/api/admin/login', {
    description: 'Admin Login API',
    timeout: 5000,
    method: 'POST'
  });

  if (!hasLoginEndpoint) {
    return false;
  }

  // Check if we have test admin credentials
  const testPassword = process.env.TEST_ADMIN_PASSWORD;
  if (!testPassword) {
    console.log('📍 No TEST_ADMIN_PASSWORD environment variable set');
    return false;
  }

  try {
    // Try a test login to verify admin auth is working
    const response = await page.request.post('/api/admin/login', {
      data: {
        password: testPassword
      }
    });

    if (response.ok()) {
      console.log('✅ Admin authentication is working');
      return true;
    } else {
      console.log(`📍 Admin auth test failed with status ${response.status()}`);
      return false;
    }
  } catch (error) {
    console.log(`📍 Admin auth check failed: ${error.message}`);
    return false;
  }
}

/**
 * Check database health
 * @param {Page} page - Playwright page object
 * @returns {Promise<boolean>} True if database is healthy
 */
async function checkDatabaseHealth(page) {
  return await checkServiceAvailability(page, '/api/health/database', {
    description: 'Database Health API',
    timeout: 5000
  });
}

/**
 * Check debug endpoints availability
 * @param {Page} page - Playwright page object
 * @returns {Promise<boolean>} True if debug endpoints are available
 */
async function checkDebugEndpoints(page) {
  return await checkServiceAvailability(page, '/api/debug/environment', {
    description: 'Debug Environment API',
    timeout: 5000
  });
}

/**
 * Check Stripe payments availability
 * @param {Page} page - Playwright page object
 * @returns {Promise<boolean>} True if Stripe payments are available
 */
async function checkStripePayments(page) {
  // Check if payment endpoints are available
  const hasCreateSession = await checkServiceAvailability(page, '/api/payments/create-checkout-session', {
    description: 'Stripe Create Session API',
    timeout: 5000,
    method: 'POST'
  });

  if (!hasCreateSession) {
    return false;
  }

  // Check if Stripe keys are configured
  try {
    const envResponse = await page.request.get('/api/debug/environment');
    if (!envResponse.ok()) {
      console.log('📍 Cannot verify Stripe configuration - debug endpoint unavailable');
      return false;
    }

    const envData = await envResponse.json();
    const hasPublishableKey = !!envData.variables?.details?.STRIPE_PUBLISHABLE_KEY;
    const hasSecretKey = !!envData.variables?.details?.STRIPE_SECRET_KEY;

    if (hasPublishableKey && hasSecretKey) {
      console.log('✅ Stripe configuration appears complete');
      return true;
    } else {
      console.log('📍 Stripe configuration incomplete');
      return false;
    }
  } catch (error) {
    console.log(`📍 Stripe configuration check failed: ${error.message}`);
    return false;
  }
}

/**
 * Detect available services with caching
 * @param {Page} page - Playwright page object
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Service availability status
 */
export async function detectAvailableServices(page, options = {}) {
  const {
    useCache = true,
    timeout = 30000
  } = options;

  const currentTime = Date.now();

  // Return cached results if available and recent
  if (useCache && serviceCache && (currentTime - lastCacheTime) < CACHE_DURATION) {
    console.log('🔄 Using cached service detection results');
    return serviceCache;
  }

  console.log('🔍 Starting service detection...');
  const startTime = Date.now();

  try {
    // Run all service checks in parallel with Promise.allSettled
    const serviceChecks = await Promise.allSettled([
      checkGoogleDriveAPI(page),
      checkAdminAuth(page),
      checkDatabaseHealth(page),
      checkDebugEndpoints(page),
      checkStripePayments(page)
    ]);

    // Extract results safely
    const results = {
      googleDrive: serviceChecks[0].status === 'fulfilled' ? serviceChecks[0].value : false,
      adminAuth: serviceChecks[1].status === 'fulfilled' ? serviceChecks[1].value : false,
      database: serviceChecks[2].status === 'fulfilled' ? serviceChecks[2].value : false,
      debugEndpoints: serviceChecks[3].status === 'fulfilled' ? serviceChecks[3].value : false,
      stripePayments: serviceChecks[4].status === 'fulfilled' ? serviceChecks[4].value : false
    };

    // Log any rejected promises
    serviceChecks.forEach((result, index) => {
      if (result.status === 'rejected') {
        const serviceNames = ['googleDrive', 'adminAuth', 'database', 'debugEndpoints', 'stripePayments'];
        console.log(`⚠️  ${serviceNames[index]} check was rejected: ${result.reason}`);
      }
    });

    const elapsed = Date.now() - startTime;
    console.log(`📊 Service detection completed in ${elapsed}ms:`, results);

    // Cache the results
    serviceCache = results;
    lastCacheTime = currentTime;

    return results;
  } catch (error) {
    console.log(`❌ Service detection failed: ${error.message}`);

    // Return safe defaults on error
    const defaultResults = {
      googleDrive: false,
      adminAuth: false,
      database: false,
      debugEndpoints: false,
      stripePayments: false
    };

    serviceCache = defaultResults;
    lastCacheTime = currentTime;

    return defaultResults;
  }
}

/**
 * Clear the service detection cache
 */
export function clearServiceCache() {
  console.log('🔄 Clearing service detection cache');
  serviceCache = null;
  lastCacheTime = 0;
}

/**
 * Get service availability for specific services
 * @param {Page} page - Playwright page object
 * @param {Array<string>} services - Array of service names to check
 * @returns {Promise<Object>} Service availability for requested services
 */
export async function checkSpecificServices(page, services = []) {
  const allServices = await detectAvailableServices(page);

  if (services.length === 0) {
    return allServices;
  }

  const result = {};
  services.forEach(service => {
    if (service in allServices) {
      result[service] = allServices[service];
    } else {
      console.log(`⚠️  Unknown service requested: ${service}`);
      result[service] = false;
    }
  });

  return result;
}

/**
 * Utility to skip tests based on service availability
 * @param {Object} requiredServices - Object with service names as keys and required status as values
 * @param {Object} availableServices - Service availability object from detectAvailableServices
 * @returns {boolean} True if all required services are available
 */
export function shouldRunTest(requiredServices, availableServices) {
  for (const [serviceName, required] of Object.entries(requiredServices)) {
    const available = availableServices[serviceName] || false;

    if (required && !available) {
      console.log(`🚫 Test requires ${serviceName} but it's not available`);
      return false;
    }

    if (!required && available) {
      // This case is for negative tests - when we want to test behavior when service is NOT available
      console.log(`🚫 Test requires ${serviceName} to be unavailable but it's available`);
      return false;
    }
  }

  return true;
}

/**
 * Helper to create conditional test describe blocks
 * @param {string} testName - Test name
 * @param {Object} requiredServices - Required services for test
 * @param {Function} testFn - Test function
 * @param {Object} availableServices - Available services
 */
export function conditionalDescribe(testName, requiredServices, testFn, availableServices) {
  const shouldRun = shouldRunTest(requiredServices, availableServices);

  if (shouldRun) {
    console.log(`✅ Running test suite: ${testName}`);
    return describe(testName, testFn);
  } else {
    console.log(`🚫 Skipping test suite: ${testName} (missing required services)`);
    return describe.skip(testName, testFn);
  }
}

export default {
  detectAvailableServices,
  clearServiceCache,
  checkSpecificServices,
  shouldRunTest,
  conditionalDescribe
};
/**
 * Deployment Health Check Helper
 * 
 * Provides utilities to ensure Vercel deployments are fully ready
 * before running E2E tests, preventing cold start failures.
 */

/**
 * Wait for deployment to be fully ready and warmed up
 * @param {string} baseUrl - The deployment URL to check
 * @param {number} maxWaitTime - Maximum time to wait in milliseconds (default: 120000)
 * @returns {Promise<boolean>} - Returns true when deployment is ready
 */
export async function waitForDeploymentReady(baseUrl, maxWaitTime = 120000) {
  const startTime = Date.now();
  const checkInterval = 5000; // Check every 5 seconds
  let attempts = 0;
  
  console.log(`🏥 Checking deployment health at ${baseUrl}...`);
  
  while (Date.now() - startTime < maxWaitTime) {
    attempts++;
    
    try {
      // Check main health endpoint
      const healthResponse = await fetch(`${baseUrl}/api/health/check`, {
        method: 'GET',
        headers: {
          'User-Agent': 'E2E-Health-Check'
        },
        signal: AbortSignal.timeout(10000) // 10 second timeout per request
      });
      
      if (healthResponse.ok) {
        const data = await healthResponse.json();
        
        if (data.status === 'healthy' || data.status === 'ok') {
          console.log(`✅ Deployment is healthy after ${attempts} attempts (${Math.round((Date.now() - startTime) / 1000)}s)`);
          return true;
        } else {
          console.log(`  Attempt ${attempts}: Health check returned status: ${data.status}`);
        }
      } else {
        console.log(`  Attempt ${attempts}: Health check returned ${healthResponse.status}`);
      }
    } catch (error) {
      console.log(`  Attempt ${attempts}: Health check failed - ${error.message}`);
    }
    
    // Wait before next check
    if (Date.now() - startTime + checkInterval < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
  }
  
  throw new Error(`Deployment not ready after ${maxWaitTime}ms (${attempts} attempts)`);
}

/**
 * Warm up critical endpoints to prevent cold starts during tests
 * @param {string} baseUrl - The deployment URL
 * @param {string[]} endpoints - Array of endpoint paths to warm up
 * @returns {Promise<Object>} - Warmup results
 */
export async function warmupCriticalEndpoints(baseUrl, endpoints = null) {
  const defaultEndpoints = [
    '/',
    '/api/health/check',
    '/api/gallery',
    '/pages/admin/login.html',
    '/pages/tickets.html',
    '/api/featured-photos'
  ];
  
  const endpointsToWarm = endpoints || defaultEndpoints;
  const results = {};
  
  console.log(`🔥 Warming up ${endpointsToWarm.length} endpoints...`);
  
  // Warm up endpoints in parallel for efficiency
  const warmupPromises = endpointsToWarm.map(async (endpoint) => {
    const url = `${baseUrl}${endpoint}`;
    const startTime = Date.now();
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'E2E-Warmup'
        },
        signal: AbortSignal.timeout(30000) // 30 second timeout
      });
      
      const duration = Date.now() - startTime;
      
      results[endpoint] = {
        status: response.status,
        duration: duration,
        success: response.ok
      };
      
      console.log(`  ${response.ok ? '✅' : '⚠️'} ${endpoint}: ${response.status} (${duration}ms)`);
      
    } catch (error) {
      results[endpoint] = {
        status: 0,
        duration: Date.now() - startTime,
        success: false,
        error: error.message
      };
      
      console.log(`  ❌ ${endpoint}: Failed - ${error.message}`);
    }
  });
  
  await Promise.all(warmupPromises);
  
  // Count successes
  const successCount = Object.values(results).filter(r => r.success).length;
  console.log(`✅ Warmed up ${successCount}/${endpointsToWarm.length} endpoints successfully`);
  
  return results;
}

/**
 * Check if critical services are available
 * @param {string} baseUrl - The deployment URL
 * @returns {Promise<Object>} - Service availability status
 */
export async function checkServiceAvailability(baseUrl) {
  const services = {
    api: false,
    admin: false,
    gallery: false,
    database: false
  };
  
  console.log(`🔍 Checking service availability...`);
  
  // Check API health
  try {
    const response = await fetch(`${baseUrl}/api/health/check`, {
      signal: AbortSignal.timeout(10000)
    });
    services.api = response.ok;
  } catch (e) {
    services.api = false;
  }
  
  // Check admin panel
  try {
    const response = await fetch(`${baseUrl}/pages/admin/login.html`, {
      signal: AbortSignal.timeout(10000)
    });
    services.admin = response.ok;
  } catch (e) {
    services.admin = false;
  }
  
  // Check gallery API
  try {
    const response = await fetch(`${baseUrl}/api/gallery`, {
      signal: AbortSignal.timeout(10000)
    });
    services.gallery = response.ok;
  } catch (e) {
    services.gallery = false;
  }
  
  // Check database health
  try {
    const response = await fetch(`${baseUrl}/api/health/database`, {
      signal: AbortSignal.timeout(10000)
    });
    services.database = response.ok;
  } catch (e) {
    services.database = false;
  }
  
  console.log(`Service Status:
  - API: ${services.api ? '✅' : '❌'}
  - Admin: ${services.admin ? '✅' : '❌'}
  - Gallery: ${services.gallery ? '✅' : '❌'}
  - Database: ${services.database ? '✅' : '❌'}`);
  
  return services;
}

/**
 * Perform comprehensive deployment readiness check
 * @param {string} baseUrl - The deployment URL
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} - Returns true when deployment is fully ready
 */
export async function ensureDeploymentReady(baseUrl, options = {}) {
  const {
    maxWaitTime = 120000,
    warmupEndpoints = true,
    checkServices = true,
    requiredServices = ['api']
  } = options;
  
  console.log(`🚀 Ensuring deployment is ready at ${baseUrl}`);
  
  try {
    // Step 1: Wait for basic health
    await waitForDeploymentReady(baseUrl, maxWaitTime);
    
    // Step 2: Check service availability
    if (checkServices) {
      const services = await checkServiceAvailability(baseUrl);
      
      // Verify required services are available
      for (const service of requiredServices) {
        if (!services[service]) {
          throw new Error(`Required service '${service}' is not available`);
        }
      }
    }
    
    // Step 3: Warm up endpoints
    if (warmupEndpoints) {
      const results = await warmupCriticalEndpoints(baseUrl);
      
      // Check if critical endpoints are responding
      const criticalEndpoints = ['/', '/api/health/check'];
      for (const endpoint of criticalEndpoints) {
        if (results[endpoint] && !results[endpoint].success) {
          console.warn(`⚠️ Critical endpoint ${endpoint} failed warmup`);
        }
      }
    }
    
    console.log(`✅ Deployment is fully ready for E2E testing`);
    return true;
    
  } catch (error) {
    console.error(`❌ Deployment readiness check failed: ${error.message}`);
    throw error;
  }
}

// Export for use in Playwright tests
export default {
  waitForDeploymentReady,
  warmupCriticalEndpoints,
  checkServiceAvailability,
  ensureDeploymentReady
};
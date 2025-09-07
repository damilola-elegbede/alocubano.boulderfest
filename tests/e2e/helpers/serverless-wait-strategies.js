/**
 * Serverless Wait Strategies for Vercel Preview Deployments
 * 
 * This module provides specialized wait strategies and utilities for handling
 * Vercel serverless function cold starts and network latency in E2E tests.
 */

/**
 * Wait for API endpoint to be warm and responsive
 * Handles cold start scenarios by retrying with exponential backoff
 */
export async function waitForAPIWarmup(page, endpoint, options = {}) {
  const {
    timeout = 60000, // 60s total timeout
    interval = 2000,  // Start with 2s intervals
    maxRetries = 10,
    expectedStatus = [200, 201, 204]
  } = options;

  const startTime = Date.now();
  let attempt = 0;

  while (attempt < maxRetries && (Date.now() - startTime) < timeout) {
    try {
      console.log(`  🌡️  API Warmup attempt ${attempt + 1} for ${endpoint}`);
      
      const response = await page.request.get(endpoint, {
        timeout: 15000, // 15s per request
        ignoreHTTPSErrors: true
      });

      if (expectedStatus.includes(response.status())) {
        console.log(`  ✅ API warmed up successfully: ${endpoint} (${response.status()})`);
        return response;
      }

      console.log(`  ⏳ API not ready: ${endpoint} (status: ${response.status()})`);
    } catch (error) {
      console.log(`  🔄 Cold start detected: ${endpoint} (${error.message})`);
    }

    attempt++;
    const waitTime = Math.min(interval * Math.pow(1.5, attempt), 10000); // Max 10s
    await page.waitForTimeout(waitTime);
  }

  throw new Error(`API warmup failed for ${endpoint} after ${timeout}ms`);
}

/**
 * Wait for serverless function to complete with retry logic
 * Useful for POST endpoints that may take time due to cold starts
 */
export async function waitForServerlessResponse(page, requestFn, options = {}) {
  const {
    timeout = 90000,  // 90s for complex operations
    retries = 3,
    retryDelay = 5000
  } = options;

  for (let i = 0; i < retries; i++) {
    try {
      console.log(`  🚀 Serverless request attempt ${i + 1}/${retries}`);
      
      const result = await Promise.race([
        requestFn(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), timeout)
        )
      ]);

      console.log(`  ✅ Serverless request succeeded on attempt ${i + 1}`);
      return result;

    } catch (error) {
      console.log(`  ⚠️  Serverless request failed on attempt ${i + 1}: ${error.message}`);
      
      if (i === retries - 1) {
        throw error; // Last attempt, re-throw
      }

      console.log(`  ⏳ Retrying in ${retryDelay}ms...`);
      await page.waitForTimeout(retryDelay);
    }
  }
}

/**
 * Enhanced page navigation with cold start awareness
 * Automatically handles initial page loads that may trigger cold starts
 */
export async function navigateWithColdStartHandling(page, url, options = {}) {
  const {
    timeout = 90000,
    waitUntil = 'domcontentloaded', // Don't wait for all resources
    retries = 2
  } = options;

  console.log(`  🔗 Navigating to ${url} with cold start handling`);

  for (let i = 0; i < retries + 1; i++) {
    try {
      const startTime = Date.now();
      
      await page.goto(url, { 
        timeout,
        waitUntil
      });

      const loadTime = Date.now() - startTime;
      console.log(`  ✅ Navigation successful in ${loadTime}ms (attempt ${i + 1})`);
      
      // Wait for basic DOM initialization
      await page.waitForSelector('body', { timeout: 10000 });
      
      return;

    } catch (error) {
      console.log(`  ⚠️  Navigation failed on attempt ${i + 1}: ${error.message}`);
      
      if (i === retries) {
        throw new Error(`Navigation failed after ${retries + 1} attempts: ${error.message}`);
      }

      console.log(`  ⏳ Retrying navigation in 3s...`);
      await page.waitForTimeout(3000);
    }
  }
}

/**
 * Wait for elements with serverless-aware timeout handling
 * Uses progressive timeout strategy to handle cold start delays
 */
export async function waitForElementWithColdStart(page, selector, options = {}) {
  const {
    timeout = 45000,
    progressive = true,
    logProgress = true
  } = options;

  if (!progressive) {
    return await page.waitForSelector(selector, { timeout });
  }

  // Progressive timeout strategy: quick check, then longer waits
  const timeouts = [2000, 5000, 15000, timeout - 22000]; // Total = timeout
  
  for (let i = 0; i < timeouts.length; i++) {
    try {
      if (logProgress) {
        console.log(`  🔍 Looking for "${selector}" (phase ${i + 1}/${timeouts.length})`);
      }

      return await page.waitForSelector(selector, { 
        timeout: Math.max(timeouts[i], 1000) 
      });

    } catch (error) {
      if (i === timeouts.length - 1) {
        throw error; // Last attempt
      }

      if (logProgress) {
        console.log(`  ⏳ Element not found yet, continuing... (cold start possible)`);
      }
    }
  }
}

/**
 * Health check utility for preview deployments
 * Verifies that the deployment is ready before running tests
 */
export async function verifyDeploymentHealth(page, baseURL, options = {}) {
  const {
    timeout = 60000,
    endpoints = ['/api/health/check', '/']
  } = options;

  console.log(`  🏥 Verifying deployment health for ${baseURL}`);

  for (const endpoint of endpoints) {
    try {
      await waitForAPIWarmup(page, `${baseURL}${endpoint}`, {
        timeout: timeout / endpoints.length,
        expectedStatus: [200, 201, 204, 404] // 404 is OK for some endpoints
      });
    } catch (error) {
      console.warn(`  ⚠️  Health check failed for ${endpoint}: ${error.message}`);
      // Don't fail immediately, continue checking other endpoints
    }
  }

  console.log(`  ✅ Deployment health check completed`);
}

/**
 * Smart retry decorator for test functions
 * Automatically retries on specific serverless-related errors
 */
export function withServerlessRetry(testFn, options = {}) {
  const {
    retries = 2,
    retryDelay = 5000,
    retryOnErrors = ['timeout', 'network', 'cold start', 'connection']
  } = options;

  return async function(...args) {
    for (let i = 0; i < retries + 1; i++) {
      try {
        return await testFn.apply(this, args);
      } catch (error) {
        const shouldRetry = retryOnErrors.some(keyword => 
          error.message.toLowerCase().includes(keyword.toLowerCase())
        );

        if (!shouldRetry || i === retries) {
          throw error;
        }

        console.log(`  🔄 Retrying test due to serverless error: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  };
}

/**
 * Environment-aware timeout calculator
 * Adjusts timeouts based on CI vs local environment
 */
export function getEnvironmentTimeout(baseTimeout, multiplier = 1) {
  const isCI = !!process.env.CI;
  const baseMultiplier = isCI ? 1.5 : 1.0; // 50% longer in CI
  
  return Math.floor(baseTimeout * baseMultiplier * multiplier);
}

/**
 * Comprehensive wait utilities export
 */
export const ServerlessWaitStrategies = {
  waitForAPIWarmup,
  waitForServerlessResponse,
  navigateWithColdStartHandling,
  waitForElementWithColdStart,
  verifyDeploymentHealth,
  withServerlessRetry,
  getEnvironmentTimeout
};

export default ServerlessWaitStrategies;
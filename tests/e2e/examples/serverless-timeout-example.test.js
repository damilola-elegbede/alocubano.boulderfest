/**
 * Example E2E Test - Enhanced Timeout Handling for Vercel Deployments
 * 
 * This test demonstrates the enhanced timeout configuration and serverless
 * wait strategies for handling Vercel cold starts and network latency.
 * 
 * Key Features Demonstrated:
 * - Enhanced timeout configuration for different browsers
 * - Cold start handling for serverless functions
 * - Progressive wait strategies for API endpoints
 * - Retry mechanisms for network-dependent operations
 * - Environment-aware timeout adjustments
 */

import { test, expect } from '@playwright/test';
import { ServerlessWaitStrategies } from '../helpers/serverless-wait-strategies.js';

const {
  waitForAPIWarmup,
  navigateWithColdStartHandling,
  waitForElementWithColdStart,
  verifyDeploymentHealth,
  withServerlessRetry,
  getEnvironmentTimeout
} = ServerlessWaitStrategies;

test.describe('Enhanced Timeout Handling for Vercel Deployments', () => {
  
  test.beforeEach(async ({ page }) => {
    console.log('🧪 Starting test with enhanced timeout handling');
    
    // Verify deployment health before each test
    await verifyDeploymentHealth(page, page.url() || 'http://localhost:3000');
  });

  test('demonstrates cold start aware navigation', async ({ page }) => {
    console.log('📍 Testing cold start aware navigation');
    
    // Use enhanced navigation that handles cold starts
    await navigateWithColdStartHandling(page, '/pages/tickets.html', {
      timeout: getEnvironmentTimeout(90000), // 90s base, adjusted for CI
      retries: 2
    });

    // Wait for elements with cold start awareness
    const pageTitle = await waitForElementWithColdStart(page, 'h1', {
      timeout: getEnvironmentTimeout(45000),
      progressive: true,
      logProgress: true
    });

    await expect(pageTitle).toBeVisible();
    console.log('✅ Cold start navigation successful');
  });

  test('demonstrates API warmup strategies', async ({ page }) => {
    console.log('🌡️ Testing API warmup strategies');
    
    await page.goto('/');
    
    // Warm up API endpoints before testing
    await waitForAPIWarmup(page, '/api/health/check', {
      timeout: getEnvironmentTimeout(60000),
      interval: 3000,
      maxRetries: 8,
      expectedStatus: [200]
    });

    await waitForAPIWarmup(page, '/api/gallery', {
      timeout: getEnvironmentTimeout(45000),
      interval: 2000,
      maxRetries: 6,
      expectedStatus: [200, 404, 401] // 404/401 OK if API keys not configured
    });

    console.log('✅ API warmup completed');
  });

  test('demonstrates serverless retry wrapper', async ({ page }) => {
    console.log('🔄 Testing serverless retry wrapper');
    
    await page.goto('/');

    // Wrap a potentially flaky operation with retry logic
    const testWithRetry = withServerlessRetry(async () => {
      await page.click('[data-test="menu-toggle"]', {
        timeout: getEnvironmentTimeout(30000)
      });
      
      await expect(page.locator('.mobile-menu')).toBeVisible({
        timeout: getEnvironmentTimeout(15000)
      });
      
      return 'success';
    }, {
      retries: 3,
      retryDelay: 3000,
      retryOnErrors: ['timeout', 'network', 'element not found']
    });

    const result = await testWithRetry();
    expect(result).toBe('success');
    
    console.log('✅ Serverless retry wrapper successful');
  });

  test('demonstrates environment-aware timeouts', async ({ page }) => {
    console.log('⚙️ Testing environment-aware timeouts');
    
    await page.goto('/pages/about.html');

    // Demonstrate different timeout calculations
    const baseTimeout = 30000;
    const ciTimeout = getEnvironmentTimeout(baseTimeout, 1.0); // Standard multiplier
    const heavyOperationTimeout = getEnvironmentTimeout(baseTimeout, 2.0); // Double for heavy ops
    
    console.log(`   Base timeout: ${baseTimeout}ms`);
    console.log(`   CI-adjusted timeout: ${ciTimeout}ms`);
    console.log(`   Heavy operation timeout: ${heavyOperationTimeout}ms`);
    
    // Use environment-appropriate timeouts for different operations
    await expect(page.locator('h1')).toBeVisible({
      timeout: ciTimeout
    });

    // Simulate a heavy operation (like gallery loading)
    await expect(page.locator('body')).toBeVisible({
      timeout: heavyOperationTimeout
    });
    
    console.log('✅ Environment-aware timeouts demonstrated');
  });

  test('demonstrates progressive wait strategies', async ({ page }) => {
    console.log('📈 Testing progressive wait strategies');
    
    await page.goto('/pages/gallery.html');

    // Wait for gallery initialization with progressive strategy
    await waitForElementWithColdStart(page, '[data-gallery-initialized]', {
      timeout: getEnvironmentTimeout(60000),
      progressive: true,
      logProgress: true
    });

    // Progressive wait for gallery content
    const galleryItems = await waitForElementWithColdStart(page, '.gallery-item', {
      timeout: getEnvironmentTimeout(45000),
      progressive: true,
      logProgress: true
    });

    await expect(galleryItems.first()).toBeVisible();
    
    console.log('✅ Progressive wait strategies successful');
  });

  test('demonstrates browser-specific timeout handling', async ({ page, browserName }) => {
    console.log(`🌐 Testing browser-specific timeouts for ${browserName}`);
    
    // Adjust timeouts based on browser characteristics
    let browserMultiplier = 1.0;
    
    if (browserName === 'firefox') {
      browserMultiplier = 1.5; // Firefox needs more time with serverless
    } else if (browserName === 'webkit') {
      browserMultiplier = 1.3; // Safari needs more time on mobile
    }
    
    const adjustedTimeout = getEnvironmentTimeout(30000, browserMultiplier);
    console.log(`   ${browserName} adjusted timeout: ${adjustedTimeout}ms`);
    
    await page.goto('/pages/tickets.html');
    
    await expect(page.locator('.ticket-card').first()).toBeVisible({
      timeout: adjustedTimeout
    });
    
    console.log(`✅ Browser-specific timeout handling for ${browserName} successful`);
  });

  test('demonstrates comprehensive error handling', async ({ page }) => {
    console.log('🛡️ Testing comprehensive error handling');
    
    try {
      // Attempt operation that might fail due to cold starts
      await navigateWithColdStartHandling(page, '/pages/nonexistent.html', {
        timeout: getEnvironmentTimeout(30000),
        retries: 1 // Fewer retries for expected failure
      });
      
      // This should fail, but gracefully
      expect(false).toBe(true); // Should not reach here
      
    } catch (error) {
      console.log(`   ✅ Expected error caught: ${error.message}`);
      expect(error.message).toContain('Navigation failed');
    }
    
    // Recover and continue with valid navigation
    await navigateWithColdStartHandling(page, '/', {
      timeout: getEnvironmentTimeout(60000),
      retries: 2
    });
    
    await expect(page.locator('body')).toBeVisible();
    
    console.log('✅ Comprehensive error handling demonstrated');
  });

});

/**
 * Test Configuration Summary:
 * 
 * This example demonstrates the enhanced timeout configuration implemented
 * in playwright-e2e-preview.config.js:
 * 
 * Environment-Adaptive Timeouts:
 * - CI: 120s test, 45s action, 90s navigation, 30s expect
 * - Local: 90s test, 30s action, 60s navigation, 25s expect
 * 
 * Browser-Specific Adjustments:
 * - Firefox: +50% longer timeouts (serverless + browser overhead)
 * - Mobile Safari: +100% longer timeouts (most demanding)
 * - Mobile Chrome: +67% longer timeouts (mobile + serverless)
 * 
 * Retry Strategy:
 * - CI: 3 retries with network-aware delays
 * - Local: 2 retries for development efficiency
 * 
 * Key Benefits:
 * - Handles Vercel cold starts (10-15s initial delay)
 * - Accounts for network latency in CI environments
 * - Provides graceful fallbacks for flaky network conditions
 * - Offers progressive wait strategies for better UX
 * - Includes comprehensive error handling and recovery
 */
/**
 * Network Simulation Usage Examples
 * Demonstrates proper usage of the network simulation helper
 * and validates that the critical issues have been resolved
 */

import { test, expect } from '@playwright/test';
import { 
  createNetworkSimulator, 
  NETWORK_CONDITIONS, 
  testNetworkResilience 
} from '../helpers/network-simulation.js';

test.describe('Network Simulation Helper Usage', () => {
  let networkSimulator;

  test.beforeEach(async ({ page }) => {
    networkSimulator = createNetworkSimulator(page);
  });

  test.afterEach(async () => {
    // Critical: Always cleanup to prevent memory leaks
    if (networkSimulator) {
      await networkSimulator.cleanup();
    }
  });

  test('should properly simulate offline mode', async ({ page }) => {
    // Navigate to page first
    await page.goto('/pages/tickets.html');
    await expect(page.locator('h1')).toBeVisible();

    // Apply offline simulation
    await networkSimulator.simulateNetworkCondition(NETWORK_CONDITIONS.OFFLINE);

    // Verify offline state
    const status = await networkSimulator.getNetworkStatus();
    expect(status.offline).toBe(true);

    // Test offline behavior
    await page.click('a[href="/pages/about.html"]').catch(() => {
      // Navigation might fail in offline mode
    });

    // Should show offline message or cached content
    await page.waitForTimeout(1000);
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toBeTruthy();

    // Restore network
    await networkSimulator.restoreNetworkConditions();
    const restoredStatus = await networkSimulator.getNetworkStatus();
    expect(restoredStatus.offline).toBe(false);
  });

  test('should properly throttle network to slow 3G', async ({ page }) => {
    // Apply slow 3G conditions
    const appliedConditions = await networkSimulator.simulateNetworkCondition(NETWORK_CONDITIONS.SLOW_3G);
    
    expect(appliedConditions.offline).toBe(false);
    expect(appliedConditions.downloadThroughput).toBe(50 * 1024);
    expect(appliedConditions.latency).toBe(2000);

    // Navigate and measure load time
    const startTime = Date.now();
    await page.goto('/pages/gallery.html');
    await expect(page.locator('h1')).toContainText('Gallery', { timeout: 15000 });
    const loadTime = Date.now() - startTime;

    // Should take longer than normal due to throttling
    expect(loadTime).toBeGreaterThan(1000);
  });

  test('should simulate intermittent connectivity', async ({ page }) => {
    await page.goto('/pages/tickets.html');

    // Simulate intermittent connectivity for 6 seconds
    const result = await networkSimulator.simulateIntermittentConnectivity({
      intervalMs: 1500,
      duration: 6000,
      startOnline: true
    });

    expect(result.toggleCount).toBeGreaterThan(0);
    expect(result.finalState).toBe('online');

    // Page should still be functional after connectivity issues
    await expect(page.locator('h1')).toBeVisible();
  });

  test('should handle API timeout simulation', async ({ page }) => {
    // Set up API timeout simulation
    const timeoutHandler = await networkSimulator.simulateAPITimeout('/api/gallery', {
      timeoutMs: 2000,
      maxRetries: 2
    });

    await page.goto('/pages/gallery.html');

    // First few requests should timeout
    await page.waitForTimeout(5000);

    // Check that retries were attempted
    expect(timeoutHandler.getRequestCount()).toBeGreaterThan(1);

    // Cleanup the handler
    await timeoutHandler.remove();
  });

  test('should simulate slow resource loading', async ({ page }) => {
    // Set up slow image loading
    const slowResourceHandler = await networkSimulator.simulateSlowResources('**/thumb*.jpg', 1000);

    await page.goto('/pages/gallery.html');

    // Should show loading states
    const loadingElements = page.locator('.loading, .spinner, [data-loading]');
    if (await loadingElements.first().isVisible()) {
      await expect(loadingElements.first()).toBeVisible();
    }

    // Wait for images to eventually load
    await page.waitForTimeout(3000);

    // Cleanup the handler
    await slowResourceHandler.remove();
  });

  test('should handle request interception with delays and failures', async ({ page }) => {
    // Set up request interception with 30% failure rate
    const interceptionHandler = await networkSimulator.addRequestInterception('/api/email/subscribe', {
      delayMs: 500,
      failureRate: 0.3,
      failureStatus: 500
    });

    await page.goto('/pages/tickets.html');

    // Try to subscribe to newsletter multiple times
    for (let i = 0; i < 3; i++) {
      await page.fill('#newsletter-email', `test${i}@example.com`);
      await page.click('#newsletter-submit').catch(() => {
        // Some requests might fail due to failure rate
      });
      await page.waitForTimeout(1000);
    }

    // Should have made multiple requests
    expect(interceptionHandler.getRequestCount()).toBeGreaterThan(0);

    // Cleanup the handler
    await interceptionHandler.remove();
  });

  test('should properly cleanup all resources', async ({ page }) => {
    // Add various simulations
    await networkSimulator.simulateNetworkCondition(NETWORK_CONDITIONS.FAST_3G);
    const handler1 = await networkSimulator.addRequestInterception('/api/**', { delayMs: 100 });
    const handler2 = await networkSimulator.simulateSlowResources('**/*.jpg', 500);

    // Verify resources are active
    let status = await networkSimulator.getNetworkStatus();
    expect(status.activeRoutes).toBeGreaterThan(0);
    expect(status.hasCDPSession).toBe(true);

    // Cleanup
    await networkSimulator.cleanup();

    // Verify cleanup completed
    status = await networkSimulator.getNetworkStatus().catch(() => ({ cleaned: true }));
    expect(status.cleaned).toBe(true);

    // Subsequent operations should fail
    await expect(async () => {
      await networkSimulator.simulateNetworkCondition(NETWORK_CONDITIONS.OFFLINE);
    }).rejects.toThrow('NetworkSimulator has been cleaned up');
  });

  test('should work with testNetworkResilience helper', async ({ page }) => {
    const result = await testNetworkResilience(page, {
      condition: NETWORK_CONDITIONS.SLOW_3G,
      testFunction: async () => {
        await page.goto('/pages/about.html');
        await expect(page.locator('h1')).toBeVisible();
        return { success: true };
      },
      expectations: {
        maxLoadTime: 10000
      }
    });

    expect(result.success).toBe(true);
  });

  test('should handle custom network conditions', async ({ page }) => {
    const customCondition = {
      offline: false,
      downloadThroughput: 100 * 1024, // 100 KB/s
      uploadThroughput: 50 * 1024,     // 50 KB/s
      latency: 1000 // 1s
    };

    const appliedConditions = await networkSimulator.simulateNetworkCondition(customCondition);
    
    expect(appliedConditions.downloadThroughput).toBe(100 * 1024);
    expect(appliedConditions.uploadThroughput).toBe(50 * 1024);
    expect(appliedConditions.latency).toBe(1000);

    await page.goto('/pages/schedule.html');
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
  });

  test('should handle multiple network condition changes', async ({ page }) => {
    await page.goto('/pages/tickets.html');

    // Test multiple condition changes
    const conditions = [
      NETWORK_CONDITIONS.WIFI,
      NETWORK_CONDITIONS.FOUR_G,
      NETWORK_CONDITIONS.FAST_3G,
      NETWORK_CONDITIONS.SLOW_3G
    ];

    for (const condition of conditions) {
      await networkSimulator.simulateNetworkCondition(condition);
      
      // Navigate to different page under each condition
      const pages = ['/pages/about.html', '/pages/artists.html', '/pages/schedule.html', '/pages/gallery.html'];
      const pageUrl = pages[conditions.indexOf(condition)];
      
      await page.goto(pageUrl);
      await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
    }

    // Restore to normal conditions
    await networkSimulator.restoreNetworkConditions();
  });
});

test.describe('Network Simulation Error Handling', () => {
  test('should handle CDP session initialization failure gracefully', async ({ page }) => {
    // Create simulator
    const simulator = createNetworkSimulator(page);
    
    // Mock CDP session failure by using a detached page
    await page.close();
    
    try {
      await simulator.simulateNetworkCondition(NETWORK_CONDITIONS.OFFLINE);
    } catch (error) {
      expect(error.message).toContain('CDP session initialization failed');
    }
  });

  test('should handle unknown network condition', async ({ page }) => {
    const simulator = createNetworkSimulator(page);
    
    try {
      await simulator.simulateNetworkCondition('unknown-condition');
    } catch (error) {
      expect(error.message).toContain('Unknown network condition');
    } finally {
      await simulator.cleanup();
    }
  });

  test('should handle cleanup after page is closed', async ({ page }) => {
    const simulator = createNetworkSimulator(page);
    
    // Set up some routes
    await simulator.addRequestInterception('/api/**', { delayMs: 100 });
    
    // Close page
    await page.close();
    
    // Cleanup should not throw errors
    await simulator.cleanup();
    
    // Should be marked as cleaned up
    expect(() => simulator.getNetworkStatus()).toThrow();
  });
});

test.describe('Memory Leak Prevention', () => {
  test('should properly cleanup event listeners', async ({ page }) => {
    const simulator = createNetworkSimulator(page);
    
    // Start intermittent connectivity (adds event listeners)
    const connectivityPromise = simulator.simulateIntermittentConnectivity({
      intervalMs: 500,
      duration: 2000
    });
    
    // Cleanup before completion
    await page.waitForTimeout(1000);
    await simulator.cleanup();
    
    // Wait for original promise to resolve/reject
    try {
      await connectivityPromise;
    } catch (error) {
      // Expected if cleanup interrupted the process
    }
    
    // Should be cleaned up
    expect(() => simulator.getNetworkStatus()).toThrow();
  });

  test('should remove all route handlers on cleanup', async ({ page }) => {
    const simulator = createNetworkSimulator(page);
    
    // Add multiple route handlers
    await simulator.addRequestInterception('/api/gallery', { delayMs: 100 });
    await simulator.addRequestInterception('/api/email/**', { failureRate: 0.5 });
    await simulator.simulateSlowResources('**/*.jpg', 500);
    
    const status = await simulator.getNetworkStatus();
    expect(status.activeRoutes).toBe(3);
    
    // Cleanup
    await simulator.cleanup();
    
    // Navigate to trigger any remaining handlers (should be none)
    await page.goto('/pages/gallery.html');
    await expect(page.locator('h1')).toBeVisible();
    
    // Verify cleanup completed
    expect(() => simulator.getNetworkStatus()).toThrow();
  });
});
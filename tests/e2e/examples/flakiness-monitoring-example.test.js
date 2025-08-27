/**
 * Example E2E Test demonstrating Flakiness Detection Integration
 * 
 * This file showcases how to integrate the flakiness detection system
 * with actual E2E tests for enhanced reliability monitoring
 */

import { test, expect } from '@playwright/test';
import { 
  executeTestWithMonitoring, 
  registerTestRetryStrategy,
  getFlakinessDetector,
  cleanupFlakinessDetector,
  getResourceMonitoringStats
} from '../monitoring/flakiness-detector.js';

test.describe('Flakiness Monitoring Integration Examples', () => {

  test.beforeAll(async () => {
    // Register custom retry strategies for specific test patterns
    
    // Network-sensitive tests get more aggressive retry with longer delays
    registerTestRetryStrategy('**/network-*', {
      maxAttempts: 4,
      calculateDelay: (attempt, error, defaultDelay) => {
        if (error.message.includes('network') || error.message.includes('timeout')) {
          return Math.min(5000 * attempt, 20000); // 5s, 10s, 15s, 20s
        }
        return defaultDelay;
      }
    });
    
    // DOM-related tests get quick retries for race conditions
    registerTestRetryStrategy('**/dom-*', {
      maxAttempts: 3,
      calculateDelay: (attempt, error, defaultDelay) => {
        if (error.message.includes('selector') || error.message.includes('visible')) {
          return 500 * attempt; // Fast retries for DOM issues
        }
        return defaultDelay;
      }
    });
  });

  test('Basic test with monitoring - Gallery page load', async ({ page }) => {
    const testInfo = {
      file: __filename,
      title: 'Gallery page load test',
      project: { name: 'chromium' }
    };

    await executeTestWithMonitoring(
      async () => {
        // Navigate to gallery page
        await page.goto('/gallery');
        
        // Wait for gallery container to be visible
        await expect(page.locator('.gallery-container')).toBeVisible({ timeout: 10000 });
        
        // Verify gallery functionality
        const galleryItems = page.locator('.gallery-item, .photo-item, .video-item');
        await expect(galleryItems.first()).toBeVisible({ timeout: 5000 });
        
        // Check that images are loaded
        const firstImage = page.locator('img').first();
        if (await firstImage.count() > 0) {
          await expect(firstImage).toHaveAttribute('src', /.+/);
        }
        
        return { success: true, itemsFound: await galleryItems.count() };
      },
      testInfo,
      {
        validateEnvironment: true,
        requireConsistentEnvironment: false,
        enableResourceMonitoring: true,
        retry: {
          maxAttempts: 3,
          baseDelay: 1000
        }
      }
    );
  });

  test('Network-sensitive test with custom retry strategy', async ({ page }) => {
    const testInfo = {
      file: __filename,
      title: 'network-dependent-api-test',
      project: { name: 'chromium' }
    };

    await executeTestWithMonitoring(
      async () => {
        // Navigate to page that makes API calls
        await page.goto('/');
        
        // Wait for network requests to complete
        await page.waitForLoadState('networkidle', { timeout: 15000 });
        
        // Test API-dependent functionality
        const healthCheckResponse = await page.evaluate(async () => {
          try {
            const response = await fetch('/api/health/check');
            return { success: response.ok, status: response.status };
          } catch (error) {
            throw new Error(`Network request failed: ${error.message}`);
          }
        });
        
        expect(healthCheckResponse.success).toBe(true);
        return healthCheckResponse;
      },
      testInfo,
      {
        validateEnvironment: true,
        retry: {
          maxAttempts: 4, // Will use custom retry strategy
          baseDelay: 2000
        }
      }
    );
  });

  test('DOM interaction test with timing sensitivity', async ({ page }) => {
    const testInfo = {
      file: __filename,
      title: 'dom-interaction-timing-test',
      project: { name: 'chromium' }
    };

    await executeTestWithMonitoring(
      async () => {
        await page.goto('/');
        
        // Test interactive elements that might have timing issues
        const navigationToggle = page.locator('[data-nav-toggle]');
        
        if (await navigationToggle.count() > 0) {
          // Click navigation toggle
          await navigationToggle.click();
          
          // Wait for navigation menu to appear
          const navMenu = page.locator('.navigation-menu, .nav-menu');
          await expect(navMenu).toBeVisible({ timeout: 3000 });
          
          // Click again to close
          await navigationToggle.click();
          await expect(navMenu).not.toBeVisible({ timeout: 3000 });
        }
        
        // Test form interactions if available
        const subscribeForm = page.locator('form[data-newsletter-form], .newsletter-form form');
        if (await subscribeForm.count() > 0) {
          const emailInput = subscribeForm.locator('input[type="email"], input[name="email"]');
          const submitButton = subscribeForm.locator('button[type="submit"], .submit-btn');
          
          if (await emailInput.count() > 0 && await submitButton.count() > 0) {
            await emailInput.fill('test@example.com');
            
            // Don't actually submit in test environment
            await expect(emailInput).toHaveValue('test@example.com');
          }
        }
        
        return { success: true };
      },
      testInfo,
      {
        validateEnvironment: false, // Skip environment validation for DOM tests
        retry: {
          maxAttempts: 3
        }
      }
    );
  });

  test('Performance-sensitive test', async ({ page }) => {
    const testInfo = {
      file: __filename,
      title: 'performance-monitoring-test',
      project: { name: 'chromium' }
    };

    const result = await executeTestWithMonitoring(
      async () => {
        const startTime = Date.now();
        
        // Navigate and measure load time
        await page.goto('/gallery');
        await page.waitForLoadState('networkidle', { timeout: 10000 });
        
        const loadTime = Date.now() - startTime;
        
        // Performance assertion
        expect(loadTime).toBeLessThan(8000); // Should load within 8 seconds
        
        // Check Core Web Vitals if possible
        const vitals = await page.evaluate(() => {
          return new Promise((resolve) => {
            if ('PerformanceObserver' in window) {
              const vitals = {};
              
              // Largest Contentful Paint
              new PerformanceObserver((list) => {
                const entries = list.getEntries();
                const lastEntry = entries[entries.length - 1];
                vitals.lcp = lastEntry.startTime;
              }).observe({ entryTypes: ['largest-contentful-paint'] });
              
              // Cumulative Layout Shift
              new PerformanceObserver((list) => {
                let cumulativeScore = 0;
                for (const entry of list.getEntries()) {
                  if (!entry.hadRecentInput) {
                    cumulativeScore += entry.value;
                  }
                }
                vitals.cls = cumulativeScore;
              }).observe({ entryTypes: ['layout-shift'] });
              
              setTimeout(() => resolve(vitals), 3000);
            } else {
              resolve({});
            }
          });
        });
        
        return { 
          loadTime, 
          vitals,
          performance: {
            lcp: vitals.lcp || null,
            cls: vitals.cls || null
          }
        };
      },
      testInfo,
      {
        validateEnvironment: true,
        retry: {
          maxAttempts: 2, // Performance tests shouldn't retry too much
          baseDelay: 3000
        }
      }
    );
    
    console.log('Performance metrics:', result.performance);
  });

  test('Intentionally flaky test for monitoring demonstration', async ({ page }) => {
    const testInfo = {
      file: __filename,
      title: 'intentionally-flaky-demo-test',
      project: { name: 'chromium' }
    };

    await executeTestWithMonitoring(
      async () => {
        await page.goto('/');
        
        // Simulate flakiness with random failure
        const shouldFail = Math.random() < 0.2; // 20% chance of failure
        
        if (shouldFail) {
          // Simulate a timing-related failure
          await page.waitForTimeout(100);
          throw new Error('Simulated timing issue - element not found within timeout');
        }
        
        // Normal test flow
        await expect(page.locator('body')).toBeVisible();
        return { success: true, flakiness: 'simulated' };
      },
      testInfo,
      {
        validateEnvironment: false,
        retry: {
          maxAttempts: 3,
          baseDelay: 1000
        }
      }
    );
  });

  test('Test with environment consistency validation', async ({ page }) => {
    const testInfo = {
      file: __filename,
      title: 'environment-consistency-test',
      project: { name: 'chromium' }
    };

    await executeTestWithMonitoring(
      async () => {
        // This test validates that environment is consistent
        await page.goto('/api/health/check');
        
        const healthData = await page.evaluate(() => {
          try {
            return JSON.parse(document.body.textContent);
          } catch {
            return null;
          }
        });
        
        expect(healthData).toBeTruthy();
        expect(healthData.status).toBe('healthy');
        
        return { health: healthData };
      },
      testInfo,
      {
        validateEnvironment: true,
        requireConsistentEnvironment: true, // Strict environment requirement
        retry: {
          maxAttempts: 2,
          baseDelay: 2000
        }
      }
    );
  });

  test('Concurrent execution tracking demo', async ({ page }) => {
    const detector = getFlakinessDetector();
    const testKey = `${__filename}::concurrent-execution-demo`;
    const executionId = `${testKey}::${Date.now()}::${Math.random().toString(36).substr(2, 9)}`;
    
    // Manually track concurrent execution for demonstration
    await detector.trackConcurrentExecution(testKey, executionId);
    
    try {
      await page.goto('/');
      await expect(page.locator('body')).toBeVisible();
      
      // Simulate some work
      await page.waitForTimeout(1000);
      
      const result = { status: 'passed', duration: 1000 };
      await detector.completeConcurrentExecution(executionId, result);
      
    } catch (error) {
      await detector.completeConcurrentExecution(executionId, { 
        status: 'failed', 
        error: error.message 
      });
      throw error;
    }
  });

  test.afterEach(async ({ page }, testInfo) => {
    // Log test execution details
    console.log(`Test "${testInfo.title}" completed with status: ${testInfo.status}`);
    
    if (testInfo.status === 'failed') {
      console.log(`Failure reason: ${testInfo.error?.message || 'Unknown'}`);
      console.log(`Retry count: ${testInfo.retry || 0}`);
    }
  });

  test.afterAll(async () => {
    // Generate a quick metrics summary after test run
    try {
      const detector = getFlakinessDetector();
      const metrics = await detector.loadMetrics();
      
      console.log('\n📊 Flakiness Monitoring Summary');
      console.log('─'.repeat(40));
      
      if (metrics.dashboard) {
        console.log(`Total tests monitored: ${metrics.dashboard.summary.totalTests}`);
        console.log(`Overall reliability: ${(metrics.dashboard.summary.overallReliability * 100).toFixed(1)}%`);
        
        if (metrics.dashboard.summary.flakyTests > 0) {
          console.log(`⚠️  Flaky tests detected: ${metrics.dashboard.summary.flakyTests}`);
        }
        
        if (metrics.dashboard.recommendations.length > 0) {
          console.log(`💡 Recommendations available: ${metrics.dashboard.recommendations.length}`);
        }
      }
      
      // Show resource monitoring stats
      const resourceStats = getResourceMonitoringStats();
      if (resourceStats.monitoring) {
        console.log(`📈 Resource monitoring data points: ${resourceStats.dataPoints}`);
      }
      
    } catch (error) {
      console.log('Could not load monitoring metrics:', error.message);
    } finally {
      // Clean up monitoring resources
      cleanupFlakinessDetector();
      console.log('✅ Monitoring resources cleaned up');
    }
  });
});

/**
 * Advanced usage examples
 */
test.describe('Advanced Flakiness Monitoring Features', () => {

  test('Custom retry strategy registration', async ({ page }) => {
    // Register a custom strategy for this specific test
    registerTestRetryStrategy(__filename + '::custom-retry-demo', {
      maxAttempts: 5,
      calculateDelay: (attempt, error, defaultDelay) => {
        // Exponential backoff with jitter
        const exponentialDelay = Math.pow(2, attempt) * 1000;
        const jitter = Math.random() * 1000;
        return Math.min(exponentialDelay + jitter, 15000);
      },
      shouldRetry: (error) => {
        // Only retry on specific error types
        return error.message.includes('timeout') || 
               error.message.includes('network') ||
               error.message.includes('server error');
      }
    });

    const testInfo = {
      file: __filename,
      title: 'custom-retry-demo',
      project: { name: 'chromium' }
    };

    await executeTestWithMonitoring(
      async () => {
        await page.goto('/');
        await expect(page.locator('body')).toBeVisible();
        return { success: true };
      },
      testInfo,
      { retry: { maxAttempts: 5 } }
    );
  });

  test('Environment snapshot comparison', async ({ page }) => {
    const detector = getFlakinessDetector();
    
    // Capture current environment
    const snapshot = await detector.captureEnvironmentSnapshot();
    
    console.log('Current environment snapshot:');
    console.log(`- Node version: ${snapshot.node.version}`);
    console.log(`- Platform: ${snapshot.node.platform}`);
    console.log(`- Network: ${snapshot.network.online ? 'Online' : 'Offline'}`);
    
    if (snapshot.git.available !== false) {
      console.log(`- Git branch: ${snapshot.git.branch}`);
      console.log(`- Git dirty: ${snapshot.git.dirty}`);
    }

    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });
});
/**
 * Purchase Performance and Analytics E2E Tests
 * Tests performance metrics, analytics tracking, and monitoring during purchase flows
 */

import { test, expect } from '@playwright/test';
import { BasePage } from '../helpers/base-page.js';
import { TestDataFactory } from '../helpers/test-data-factory.js';
import { DatabaseCleanup } from '../helpers/database-cleanup.js';
import { generateUniqueTestData } from '../fixtures/test-data.js';
import { fillForm, mockAPI, waitForNetworkIdle } from '../helpers/test-utils.js';

test.describe('Purchase Performance and Analytics', () => {
  let basePage;
  let testDataFactory;
  let databaseCleanup;
  let testRunId;

  test.beforeAll(async () => {
    testDataFactory = new TestDataFactory({ seed: 99999 });
    databaseCleanup = new DatabaseCleanup();
    testRunId = testDataFactory.getTestRunId();
    console.log(`Performance analytics test run: ${testRunId}`);
  });

  test.afterAll(async () => {
    if (!process.env.KEEP_TEST_DATA) {
      const cleanupResult = await databaseCleanup.cleanupByTestRunId(testRunId);
      console.log('Performance test cleanup result:', cleanupResult);
    }
    await databaseCleanup.close();
  });

  test.beforeEach(async ({ page }) => {
    basePage = new BasePage(page);
    page.setDefaultTimeout(30000);
    
    // Clear storage and enable performance monitoring
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    
    // Enable performance monitoring
    await page.addInitScript(() => {
      window.performanceMetrics = {
        navigationStart: performance.now(),
        resourceTimings: [],
        userTimings: []
      };
      
      // Track resource loading
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.performanceMetrics.resourceTimings.push({
            name: entry.name,
            duration: entry.duration,
            transferSize: entry.transferSize,
            type: entry.entryType
          });
        }
      });
      observer.observe({ entryTypes: ['resource', 'measure', 'mark'] });
    });
  });

  test.describe('Page Load Performance', () => {
    test('Tickets page load performance metrics', async ({ page }) => {
      const testData = testDataFactory.generateScenario('purchase-flow', {
        customer: {
          name: `Perf User ${testRunId}`,
          email: `perf_${testRunId}@e2e-test.com`
        }
      });

      await test.step('Measure initial page load performance', async () => {
        const startTime = Date.now();
        
        await basePage.goto('/tickets');
        await basePage.waitForReady();
        
        const loadTime = Date.now() - startTime;
        console.log(`Tickets page load time: ${loadTime}ms`);
        
        // Page should load within 3 seconds
        expect(loadTime).toBeLessThan(3000);
        
        // Get navigation timing
        const navTiming = await page.evaluate(() => {
          const navigation = performance.getEntriesByType('navigation')[0];
          return {
            domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
            loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
            firstPaint: performance.getEntriesByType('paint').find(p => p.name === 'first-paint')?.startTime,
            firstContentfulPaint: performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint')?.startTime,
            networkTime: navigation.responseEnd - navigation.requestStart,
            serverResponseTime: navigation.responseStart - navigation.requestStart
          };
        });
        
        console.log('Navigation timing:', navTiming);
        
        // Performance assertions
        expect(navTiming.domContentLoaded).toBeLessThan(1000); // DOM ready within 1s
        expect(navTiming.firstContentfulPaint).toBeLessThan(2000); // FCP within 2s
        expect(navTiming.serverResponseTime).toBeLessThan(500); // Server response within 500ms
      });

      await test.step('Measure resource loading performance', async () => {
        const resourceMetrics = await page.evaluate(() => {
          const resources = performance.getEntriesByType('resource');
          const metrics = {
            totalResources: resources.length,
            totalTransferSize: 0,
            slowestResource: { duration: 0, name: '' },
            resourcesByType: {}
          };
          
          resources.forEach(resource => {
            metrics.totalTransferSize += resource.transferSize || 0;
            
            if (resource.duration > metrics.slowestResource.duration) {
              metrics.slowestResource = {
                duration: resource.duration,
                name: resource.name
              };
            }
            
            const type = resource.name.split('.').pop() || 'unknown';
            metrics.resourcesByType[type] = (metrics.resourcesByType[type] || 0) + 1;
          });
          
          return metrics;
        });
        
        console.log('Resource metrics:', resourceMetrics);
        
        // Performance checks
        expect(resourceMetrics.slowestResource.duration).toBeLessThan(2000); // No single resource > 2s
        expect(resourceMetrics.totalTransferSize).toBeLessThan(5 * 1024 * 1024); // Total < 5MB
      });

      await test.step('Test Core Web Vitals', async () => {
        // Measure Largest Contentful Paint (LCP)
        const webVitals = await page.evaluate(() => {
          return new Promise((resolve) => {
            const vitals = {
              lcp: null,
              fid: null,
              cls: null
            };
            
            // LCP
            new PerformanceObserver((list) => {
              const entries = list.getEntries();
              vitals.lcp = entries[entries.length - 1].startTime;
            }).observe({ entryTypes: ['largest-contentful-paint'] });
            
            // CLS
            let clsValue = 0;
            new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                if (!entry.hadRecentInput) {
                  clsValue += entry.value;
                }
              }
              vitals.cls = clsValue;
            }).observe({ entryTypes: ['layout-shift'] });
            
            // Resolve after a short delay to collect metrics
            setTimeout(() => resolve(vitals), 2000);
          });
        });
        
        console.log('Core Web Vitals:', webVitals);
        
        // Web Vitals thresholds (Google recommendations)
        if (webVitals.lcp !== null) {
          expect(webVitals.lcp).toBeLessThan(2500); // LCP < 2.5s
        }
        if (webVitals.cls !== null) {
          expect(webVitals.cls).toBeLessThan(0.1); // CLS < 0.1
        }
      });
    });

    test('Checkout flow performance under load', async ({ page }) => {
      await test.step('Simulate multiple cart operations', async () => {
        await basePage.goto('/tickets');
        
        // Rapid cart operations to test performance
        const operations = [];
        const startTime = performance.now();
        
        for (let i = 0; i < 5; i++) {
          operations.push(
            page.locator('button').filter({ hasText: /full.*pass/i }).first().click()
          );
          await page.waitForTimeout(100);
        }
        
        await Promise.all(operations);
        
        const operationTime = performance.now() - startTime;
        console.log(`5 cart operations completed in: ${operationTime}ms`);
        
        // Should handle rapid operations efficiently
        expect(operationTime).toBeLessThan(2000);
        
        // Verify final cart state
        const cartCount = await page.locator('.cart-count, [data-cart-count]').textContent();
        expect(parseInt(cartCount)).toBe(5);
      });

      await test.step('Memory usage during checkout', async () => {
        // Monitor memory usage
        const memoryBefore = await page.evaluate(() => {
          return performance.memory ? {
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
          } : null;
        });
        
        if (memoryBefore) {
          console.log('Memory before checkout:', memoryBefore);
        }
        
        // Perform checkout flow
        const cartToggle = page.locator('.floating-cart').first();
        await cartToggle.click();
        
        const checkoutButton = page.locator('button').filter({ hasText: /checkout/i }).first();
        await checkoutButton.click();
        
        // Fill form and submit
        const nameInput = page.locator('input[name="name"]').first();
        if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          await fillForm(page, {
            name: `Memory Test User`,
            email: `memory_${testRunId}@e2e-test.com`,
            phone: '555-MEM-TEST'
          });
          
          const submitButton = page.locator('button[type="submit"]').first();
          if (await submitButton.isVisible()) {
            await submitButton.click();
          }
        }
        
        const memoryAfter = await page.evaluate(() => {
          return performance.memory ? {
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
          } : null;
        });
        
        if (memoryBefore && memoryAfter) {
          const memoryIncrease = memoryAfter.usedJSHeapSize - memoryBefore.usedJSHeapSize;
          console.log('Memory increase during checkout:', memoryIncrease, 'bytes');
          
          // Memory increase should be reasonable (< 10MB)
          expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
        }
      });
    });
  });

  test.describe('API Response Times', () => {
    test('Payment API performance monitoring', async ({ page }) => {
      const testData = testDataFactory.generateScenario('purchase-flow', {
        customer: {
          name: `API Perf User ${testRunId}`,
          email: `api_perf_${testRunId}@e2e-test.com`
        }
      });

      await test.step('Monitor payment API response times', async () => {
        const apiTimings = [];
        
        // Track API requests
        page.on('response', response => {
          if (response.url().includes('/api/')) {
            const timing = response.timing();
            apiTimings.push({
              url: response.url(),
              status: response.status(),
              timing: timing
            });
          }
        });
        
        await basePage.goto('/tickets');
        
        // Add ticket to cart
        const fullPassButton = page.locator('button').filter({ hasText: /full.*pass/i }).first();
        await fullPassButton.click();
        
        // Proceed to checkout
        const cartToggle = page.locator('.floating-cart').first();
        await cartToggle.click();
        
        const checkoutButton = page.locator('button').filter({ hasText: /checkout/i }).first();
        await checkoutButton.click();
        
        // Submit customer form
        const nameInput = page.locator('input[name="name"]').first();
        if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          await fillForm(page, {
            name: testData.customer.name,
            email: testData.customer.email,
            phone: testData.customer.phone
          });
          
          const submitButton = page.locator('button[type="submit"]').first();
          if (await submitButton.isVisible()) {
            await submitButton.click();
          }
        }
        
        // Wait for API calls to complete
        await page.waitForTimeout(2000);
        
        console.log('API timing results:', apiTimings);
        
        // Check API performance
        apiTimings.forEach(timing => {
          if (timing.timing) {
            const totalTime = timing.timing.responseEnd - timing.timing.requestStart;
            console.log(`${timing.url}: ${totalTime}ms (${timing.status})`);
            
            // API responses should be under 1 second
            expect(totalTime).toBeLessThan(1000);
          }
        });
      });

      await test.step('Database query performance', async () => {
        // Test health check endpoint performance
        const healthStartTime = Date.now();
        const healthResponse = await page.request.get('/api/health/check');
        const healthEndTime = Date.now();
        
        expect(healthResponse.ok()).toBe(true);
        const healthTime = healthEndTime - healthStartTime;
        console.log(`Health check response time: ${healthTime}ms`);
        
        // Health check should be very fast
        expect(healthTime).toBeLessThan(500);
        
        // Test database health
        const dbHealthResponse = await page.request.get('/api/health/database');
        if (dbHealthResponse.ok()) {
          const dbHealthData = await dbHealthResponse.json();
          console.log('Database health:', dbHealthData);
          
          // Check if response includes timing information
          if (dbHealthData.timing) {
            expect(dbHealthData.timing.query).toBeLessThan(100); // DB queries < 100ms
          }
        }
      });
    });

    test('Gallery virtual scrolling performance', async ({ page }) => {
      await test.step('Test gallery performance with large datasets', async () => {
        await basePage.goto('/gallery');
        
        // Wait for gallery to load
        await page.waitForSelector('.gallery-container, .photo-grid', { timeout: 10000 });
        
        // Measure initial render time
        const renderStartTime = Date.now();
        await page.waitForSelector('img', { timeout: 10000 });
        const renderEndTime = Date.now();
        
        const initialRenderTime = renderEndTime - renderStartTime;
        console.log(`Gallery initial render time: ${initialRenderTime}ms`);
        
        // Gallery should render quickly even with many images
        expect(initialRenderTime).toBeLessThan(3000);
        
        // Test scroll performance
        const scrollStartTime = Date.now();
        
        for (let i = 0; i < 5; i++) {
          await page.mouse.wheel(0, 500);
          await page.waitForTimeout(200);
        }
        
        const scrollEndTime = Date.now();
        const scrollTime = scrollEndTime - scrollStartTime;
        
        console.log(`Gallery scroll performance: ${scrollTime}ms for 5 scrolls`);
        
        // Scrolling should remain smooth
        expect(scrollTime).toBeLessThan(2000);
        
        // Check if virtual scrolling is working (limited DOM elements)
        const imageCount = await page.locator('img').count();
        console.log(`Images in DOM: ${imageCount}`);
        
        // Virtual scrolling should limit DOM elements
        expect(imageCount).toBeLessThan(100); // Should not load all images at once
      });
    });
  });

  test.describe('Cart Persistence Performance', () => {
    test('Cart operations performance across sessions', async ({ page }) => {
      const testData = generateUniqueTestData('cart_perf');

      await test.step('Measure cart persistence operations', async () => {
        await basePage.goto('/tickets');
        
        // Time cart additions
        const addStartTime = performance.now();
        
        // Add multiple different tickets
        const ticketTypes = ['full.*pass', 'day.*pass', 'social.*pass'];
        
        for (const ticketType of ticketTypes) {
          const button = page.locator('button').filter({ hasText: new RegExp(ticketType, 'i') }).first();
          await button.click();
          await page.waitForTimeout(100); // Small delay between additions
        }
        
        const addEndTime = performance.now();
        const addTime = addEndTime - addStartTime;
        
        console.log(`Cart additions time: ${addTime}ms`);
        expect(addTime).toBeLessThan(1000);
        
        // Verify cart state
        const cartCount = await page.locator('.cart-count, [data-cart-count]').textContent();
        expect(parseInt(cartCount)).toBe(3);
      });

      await test.step('Test cart persistence across page navigation', async () => {
        const navStartTime = performance.now();
        
        // Navigate to different pages and verify cart persists
        const pages = ['/about', '/artists', '/schedule', '/gallery'];
        
        for (const pagePath of pages) {
          await basePage.goto(pagePath);
          await basePage.waitForReady();
          
          // Verify cart count persists
          const cartCount = await page.locator('.cart-count, [data-cart-count]').textContent();
          expect(parseInt(cartCount)).toBe(3);
        }
        
        const navEndTime = performance.now();
        const navTime = navEndTime - navStartTime;
        
        console.log(`Navigation with cart persistence: ${navTime}ms`);
        expect(navTime).toBeLessThan(5000); // All navigation should be under 5s
      });

      await test.step('Test cart localStorage performance', async () => {
        await basePage.goto('/tickets');
        
        // Time localStorage operations
        const storageStartTime = performance.now();
        
        // Simulate rapid cart updates
        for (let i = 0; i < 10; i++) {
          await page.evaluate((index) => {
            const cart = JSON.parse(localStorage.getItem('cart') || '[]');
            cart.push({
              id: `test_item_${index}`,
              type: 'test-pass',
              price: 50,
              quantity: 1,
              timestamp: Date.now()
            });
            localStorage.setItem('cart', JSON.stringify(cart));
          }, i);
        }
        
        const storageEndTime = performance.now();
        const storageTime = storageEndTime - storageStartTime;
        
        console.log(`localStorage operations time: ${storageTime}ms`);
        expect(storageTime).toBeLessThan(100); // Should be very fast
        
        // Verify localStorage size isn't excessive
        const cartSize = await page.evaluate(() => {
          const cartData = localStorage.getItem('cart');
          return cartData ? cartData.length : 0;
        });
        
        console.log(`Cart localStorage size: ${cartSize} characters`);
        expect(cartSize).toBeLessThan(10000); // Keep cart data reasonable
      });
    });
  });

  test.describe('Analytics and Event Tracking', () => {
    test('Purchase funnel analytics tracking', async ({ page }) => {
      const testData = testDataFactory.generateScenario('purchase-flow', {
        customer: {
          name: `Analytics User ${testRunId}`,
          email: `analytics_${testRunId}@e2e-test.com`
        }
      });

      const analyticsEvents = [];
      
      await test.step('Setup analytics tracking', async () => {
        // Mock analytics tracking
        await page.addInitScript(() => {
          window.analyticsEvents = [];
          
          // Mock Google Analytics
          window.gtag = function(command, eventName, parameters) {
            window.analyticsEvents.push({
              type: 'gtag',
              command,
              eventName,
              parameters,
              timestamp: Date.now()
            });
          };
          
          // Mock other analytics services
          window.analytics = {
            track: function(eventName, properties) {
              window.analyticsEvents.push({
                type: 'segment',
                eventName,
                properties,
                timestamp: Date.now()
              });
            }
          };
        });
        
        await basePage.goto('/tickets');
      });

      await test.step('Track ticket selection events', async () => {
        // Select Full Pass ticket
        const fullPassButton = page.locator('button').filter({ hasText: /full.*pass/i }).first();
        await fullPassButton.click();
        
        // Give time for analytics events
        await page.waitForTimeout(500);
        
        // Check for ticket selection events
        const events = await page.evaluate(() => window.analyticsEvents);
        console.log('Ticket selection events:', events);
        
        // Should have tracked ticket selection
        const ticketEvents = events.filter(e => 
          e.eventName?.includes('ticket') || 
          e.eventName?.includes('add_to_cart') ||
          e.parameters?.item_name?.includes('pass')
        );
        
        expect(ticketEvents.length).toBeGreaterThan(0);
      });

      await test.step('Track checkout funnel progression', async () => {
        // Open cart
        const cartToggle = page.locator('.floating-cart').first();
        await cartToggle.click();
        await page.waitForTimeout(300);
        
        // Proceed to checkout
        const checkoutButton = page.locator('button').filter({ hasText: /checkout/i }).first();
        await checkoutButton.click();
        await page.waitForTimeout(500);
        
        // Check for checkout events
        const events = await page.evaluate(() => window.analyticsEvents);
        const checkoutEvents = events.filter(e => 
          e.eventName?.includes('checkout') || 
          e.eventName?.includes('begin_checkout')
        );
        
        console.log('Checkout events:', checkoutEvents);
        expect(checkoutEvents.length).toBeGreaterThan(0);
      });

      await test.step('Track form completion events', async () => {
        const nameInput = page.locator('input[name="name"]').first();
        if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          await fillForm(page, {
            name: testData.customer.name,
            email: testData.customer.email,
            phone: testData.customer.phone
          });
          
          const submitButton = page.locator('button[type="submit"]').first();
          if (await submitButton.isVisible()) {
            await submitButton.click();
            await page.waitForTimeout(500);
          }
        }
        
        // Check for form completion events
        const events = await page.evaluate(() => window.analyticsEvents);
        const formEvents = events.filter(e => 
          e.eventName?.includes('form') || 
          e.eventName?.includes('customer_info')
        );
        
        console.log('Form completion events:', formEvents);
        // Form events may be optional depending on implementation
      });

      await test.step('Verify event timing and order', async () => {
        const events = await page.evaluate(() => window.analyticsEvents);
        
        // Events should be in chronological order
        for (let i = 1; i < events.length; i++) {
          expect(events[i].timestamp).toBeGreaterThanOrEqual(events[i-1].timestamp);
        }
        
        // Events should fire within reasonable time
        const totalTime = events[events.length - 1]?.timestamp - events[0]?.timestamp;
        console.log(`Total analytics tracking time: ${totalTime}ms`);
        expect(totalTime).toBeLessThan(30000); // All events within 30s
      });
    });

    test('Error tracking and reporting', async ({ page }) => {
      const errorEvents = [];

      await test.step('Setup error tracking', async () => {
        // Track JavaScript errors
        page.on('pageerror', error => {
          errorEvents.push({
            type: 'javascript_error',
            message: error.message,
            stack: error.stack,
            timestamp: Date.now()
          });
        });
        
        // Track console errors
        page.on('console', msg => {
          if (msg.type() === 'error') {
            errorEvents.push({
              type: 'console_error',
              message: msg.text(),
              timestamp: Date.now()
            });
          }
        });
        
        // Track network errors
        page.on('response', response => {
          if (!response.ok()) {
            errorEvents.push({
              type: 'network_error',
              url: response.url(),
              status: response.status(),
              statusText: response.statusText(),
              timestamp: Date.now()
            });
          }
        });
        
        await basePage.goto('/tickets');
      });

      await test.step('Simulate error conditions', async () => {
        // Trigger a 404 error
        try {
          await page.request.get('/api/non-existent-endpoint');
        } catch (error) {
          // Expected to fail
        }
        
        // Trigger network timeout (mock)
        await page.route('**/api/slow-endpoint', route => {
          setTimeout(() => {
            route.fulfill({
              status: 408,
              body: JSON.stringify({ error: 'Request timeout' })
            });
          }, 5000);
        });
        
        try {
          await page.request.get('/api/slow-endpoint');
        } catch (error) {
          // Expected to timeout
        }
        
        await page.waitForTimeout(1000);
        
        console.log('Captured error events:', errorEvents);
        
        // Should have captured network errors
        const networkErrors = errorEvents.filter(e => e.type === 'network_error');
        expect(networkErrors.length).toBeGreaterThan(0);
      });

      await test.step('Verify error reporting format', async () => {
        // All error events should have required fields
        errorEvents.forEach(error => {
          expect(error.type).toBeTruthy();
          expect(error.timestamp).toBeGreaterThan(0);
          expect(error.message || error.url).toBeTruthy();
        });
        
        console.log('Error tracking validation passed');
      });
    });
  });

  test.describe('Monitoring and Health Checks', () => {
    test('System health monitoring during purchase', async ({ page }) => {
      await test.step('Monitor system health endpoints', async () => {
        // Check general health
        const healthResponse = await page.request.get('/api/health/check');
        expect(healthResponse.ok()).toBe(true);
        
        const healthData = await healthResponse.json();
        console.log('System health:', healthData);
        
        // Health response should include key metrics
        expect(healthData.status).toBe('healthy');
        if (healthData.uptime) {
          expect(healthData.uptime).toBeGreaterThan(0);
        }
      });

      await test.step('Monitor database health during operations', async () => {
        // Add ticket to cart (creates some DB activity)
        await basePage.goto('/tickets');
        
        const fullPassButton = page.locator('button').filter({ hasText: /full.*pass/i }).first();
        await fullPassButton.click();
        
        // Check database health
        const dbHealthResponse = await page.request.get('/api/health/database');
        
        if (dbHealthResponse.ok()) {
          const dbHealthData = await dbHealthResponse.json();
          console.log('Database health:', dbHealthData);
          
          // Database should be responsive
          expect(dbHealthData.status).toBe('healthy');
          
          if (dbHealthData.metrics) {
            expect(dbHealthData.metrics.responseTime).toBeLessThan(1000);
          }
        } else {
          console.log('Database health endpoint not available');
        }
      });

      await test.step('Test E2E database health for test cleanup', async () => {
        // Check E2E database health (for test data cleanup)
        const e2eHealthResponse = await page.request.get('/api/health/e2e-database');
        
        if (e2eHealthResponse.ok()) {
          const e2eHealthData = await e2eHealthResponse.json();
          console.log('E2E Database health:', e2eHealthData);
          
          expect(e2eHealthData.status).toBe('healthy');
          expect(e2eHealthData.testMode).toBe(true);
        } else {
          console.log('E2E database health endpoint not available');
        }
      });
    });

    test('Performance regression detection', async ({ page }) => {
      const performanceBaselines = {
        pageLoadTime: 3000,    // 3 seconds
        apiResponseTime: 1000,  // 1 second
        cartOperationTime: 500, // 500ms
        formSubmissionTime: 2000 // 2 seconds
      };

      await test.step('Measure current performance against baselines', async () => {
        // Page load performance
        const pageLoadStart = Date.now();
        await basePage.goto('/tickets');
        await basePage.waitForReady();
        const pageLoadTime = Date.now() - pageLoadStart;
        
        console.log(`Page load time: ${pageLoadTime}ms (baseline: ${performanceBaselines.pageLoadTime}ms)`);
        expect(pageLoadTime).toBeLessThan(performanceBaselines.pageLoadTime);
        
        // API response performance
        const apiStart = Date.now();
        const apiResponse = await page.request.get('/api/health/check');
        const apiTime = Date.now() - apiStart;
        
        console.log(`API response time: ${apiTime}ms (baseline: ${performanceBaselines.apiResponseTime}ms)`);
        expect(apiTime).toBeLessThan(performanceBaselines.apiResponseTime);
        
        // Cart operation performance
        const cartStart = Date.now();
        const fullPassButton = page.locator('button').filter({ hasText: /full.*pass/i }).first();
        await fullPassButton.click();
        await page.waitForSelector('.cart-count:has-text("1")');
        const cartTime = Date.now() - cartStart;
        
        console.log(`Cart operation time: ${cartTime}ms (baseline: ${performanceBaselines.cartOperationTime}ms)`);
        expect(cartTime).toBeLessThan(performanceBaselines.cartOperationTime);
      });

      await test.step('Generate performance report', async () => {
        const performanceReport = {
          testRunId,
          timestamp: new Date().toISOString(),
          metrics: {
            pageLoadTime: 'PASSED',
            apiResponseTime: 'PASSED',
            cartOperationTime: 'PASSED'
          },
          recommendations: [
            'Consider implementing service worker for better caching',
            'Optimize image loading with lazy loading',
            'Consider CDN for static assets'
          ]
        };
        
        console.log('Performance Report:', performanceReport);
        
        // In a real implementation, this would be sent to monitoring system
        expect(performanceReport.testRunId).toBe(testRunId);
      });
    });
  });
});
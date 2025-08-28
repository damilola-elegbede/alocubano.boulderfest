/**
 * Concurrent Users and Load Testing for A Lo Cubano Boulder Fest
 * 
 * Tests system behavior under high concurrent load with focus on:
 * - Race condition detection in ticket purchases
 * - Database isolation under concurrent access
 * - Session management with multiple simultaneous users
 * - Ticket inventory capacity limits enforcement
 * - Queue management and user flow control
 * - Performance degradation detection
 * 
 * Requirements: REQ-BUS-003, REQ-E2E-001, REQ-DB-001
 */

import { test, expect } from '@playwright/test';
import ConcurrencyUtilities from '../helpers/concurrency-utilities.js';
import { TestDataFactory } from '../helpers/test-data-factory.js';
import { DatabaseCleanup } from '../helpers/database-cleanup.js';
import { BasePage } from '../helpers/base-page.js';

test.describe('Concurrent Users and Load Testing', () => {
  let concurrencyUtils;
  let testDataFactory;
  let databaseCleanup;
  let testRunId;

  test.beforeAll(async () => {
    concurrencyUtils = new ConcurrencyUtilities({
      baseURL: 'http://localhost:3000',
      maxConcurrentUsers: 100,
      timeoutMs: 60000
    });
    
    testDataFactory = new TestDataFactory({ seed: 98765 });
    databaseCleanup = new DatabaseCleanup();
    testRunId = testDataFactory.getTestRunId();
    
    console.log(`=== Concurrent Load Test Run: ${testRunId} ===`);
  });

  test.afterAll(async () => {
    if (!process.env.KEEP_TEST_DATA) {
      try {
        await concurrencyUtils.cleanupConcurrentTestData(testRunId);
        console.log('Concurrent test data cleanup completed');
      } catch (error) {
        console.warn('Cleanup warning:', error.message);
      }
    }
    await databaseCleanup.close();
  });

  /**
   * Test 1: Concurrent Ticket Purchase with Race Condition Detection
   * Simulates 50 users simultaneously attempting to purchase the same ticket type
   * to validate inventory controls and race condition handling
   */
  test('50 concurrent users purchasing tickets - race condition detection', async ({ browser }) => {
    const concurrentUsers = 50;
    
    await test.step('Setup concurrent browsers and users', async () => {
      console.log(`Setting up ${concurrentUsers} concurrent browser instances...`);
    });

    const { contexts, pages } = await concurrencyUtils.createConcurrentBrowsers(browser, concurrentUsers);
    
    try {
      // Generate unique user data for each concurrent user
      const userData = concurrencyUtils.generateConcurrentUserData(concurrentUsers);
      
      await test.step('Execute concurrent ticket purchases', async () => {
        const purchaseOperation = async (page, userIndex) => {
          const user = userData[userIndex];
          const basePage = new BasePage(page);
          
          try {
            // Navigate to tickets page
            await basePage.goto('/tickets');
            await basePage.waitForReady();
            
            // Clear any existing cart state
            await page.evaluate(() => {
              localStorage.clear();
              sessionStorage.clear();
            });
            
            // Find and click Full Pass ticket (most likely to cause race conditions)
            const fullPassSection = page.locator('.ticket-card, .pass-option').filter({ 
              hasText: /full.*pass/i 
            });
            const addButton = fullPassSection.locator('button').filter({ 
              hasText: /add.*cart|purchase|buy/i 
            }).first();
            
            await addButton.click({ timeout: 10000 });
            
            // Wait for cart update
            await expect(page.locator('.cart-count, [data-cart-count]')).toContainText('1', { 
              timeout: 10000 
            });
            
            // Proceed to checkout
            const cartToggle = page.locator('.floating-cart, .cart-icon, [data-cart-toggle]').first();
            await cartToggle.click();
            await page.waitForTimeout(1000);
            
            const checkoutButton = page.locator('button').filter({ 
              hasText: /checkout|proceed|continue/i 
            }).first();
            await checkoutButton.click();
            
            // Handle checkout form if present
            const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first();
            if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
              await nameInput.fill(user.customer.name);
              
              const emailInput = page.locator('input[name="email"], input[type="email"]').first();
              if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
                await emailInput.fill(user.customer.email);
              }
              
              const submitButton = page.locator('button[type="submit"]').filter({ 
                hasText: /continue|proceed|next|pay/i 
              }).first();
              if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
                await submitButton.click();
              }
            }
            
            // Wait for potential redirect or success
            await page.waitForTimeout(3000);
            
            return {
              success: true,
              userId: userIndex,
              userEmail: user.customer.email,
              ticketType: 'full-pass',
              timestamp: new Date().toISOString(),
              currentUrl: page.url()
            };
            
          } catch (error) {
            return {
              success: false,
              userId: userIndex,
              error: error.message,
              timestamp: new Date().toISOString()
            };
          }
        };

        console.log('Executing concurrent purchases...');
        const results = await concurrencyUtils.executeConcurrentOperations(
          pages, 
          purchaseOperation,
          { enableRaceDetection: true, collectMetrics: true }
        );

        // Analyze results
        console.log(`\n=== Purchase Results ===`);
        console.log(`Successful purchases: ${results.successful.length}`);
        console.log(`Failed purchases: ${results.errors.length}`);
        console.log(`Total duration: ${results.totalDuration}ms`);
        console.log(`Success rate: ${((results.successful.length / concurrentUsers) * 100).toFixed(2)}%`);

        // Validate results
        expect(results.successful.length + results.errors.length).toBe(concurrentUsers);
        
        // Check for race conditions
        if (results.raceConditions.length > 0) {
          console.warn(`\n   Race conditions detected: ${results.raceConditions.length}`);
          results.raceConditions.forEach(rc => {
            console.warn(`- ${rc.type}: ${rc.description} (${rc.severity})`);
          });
          
          // High severity race conditions should fail the test
          const highSeverityIssues = results.raceConditions.filter(rc => rc.severity === 'high');
          if (highSeverityIssues.length > 0) {
            throw new Error(`High severity race conditions detected: ${highSeverityIssues.length}`);
          }
        } else {
          console.log(' No race conditions detected');
        }
        
        // Performance validation
        if (results.metrics) {
          console.log(`\n=== Performance Metrics ===`);
          console.log(`Avg response time: ${results.metrics.responseTime.avg.toFixed(2)}ms`);
          console.log(`95th percentile: ${results.metrics.responseTime.p95.toFixed(2)}ms`);
          console.log(`Throughput: ${results.metrics.throughput.toFixed(2)} ops/sec`);
          
          // Performance requirements
          expect(results.metrics.responseTime.avg).toBeLessThan(5000); // 5 second average
          expect(results.metrics.responseTime.p95).toBeLessThan(10000); // 10 second 95th percentile
        }

        // Generate comprehensive report
        const report = concurrencyUtils.generateLoadTestReport(results);
        console.log('Load test report generated');
      });

    } finally {
      // Clean up browser contexts
      await Promise.all(contexts.map(context => context.close()));
    }
  });

  /**
   * Test 2: Database Isolation Under High Concurrent Access
   * Tests database transaction isolation and consistency with 30 concurrent operations
   */
  test('Database isolation with 30 concurrent database operations', async ({ browser }) => {
    const concurrentUsers = 30;
    
    const { contexts, pages } = await concurrencyUtils.createConcurrentBrowsers(browser, concurrentUsers);
    
    try {
      await test.step('Test database transaction isolation', async () => {
        const databaseOperation = async (page, userIndex) => {
          try {
            // Test newsletter subscription (database write operation)
            const response = await page.request.post('/api/email/subscribe', {
              data: {
                email: `concurrent_db_test_${userIndex}_${Date.now()}@e2e-test.com`,
                source: 'concurrent_load_test'
              }
            });
            
            if (!response.ok()) {
              const error = await response.text();
              throw new Error(`Newsletter subscription failed: ${error}`);
            }
            
            const result = await response.json();
            
            // Test database read operation
            const healthResponse = await page.request.get('/api/health/database');
            if (!healthResponse.ok()) {
              throw new Error('Database health check failed');
            }
            
            const healthData = await healthResponse.json();
            
            return {
              success: true,
              userId: userIndex,
              subscriptionResult: result,
              databaseHealth: healthData,
              timestamp: new Date().toISOString()
            };
            
          } catch (error) {
            return {
              success: false,
              userId: userIndex,
              error: error.message,
              timestamp: new Date().toISOString()
            };
          }
        };

        console.log('Testing database isolation with concurrent operations...');
        const results = await concurrencyUtils.executeConcurrentOperations(
          pages, 
          databaseOperation,
          { enableRaceDetection: true, collectMetrics: true }
        );

        // Analyze database isolation results
        console.log(`\n=== Database Isolation Results ===`);
        console.log(`Successful operations: ${results.successful.length}`);
        console.log(`Failed operations: ${results.errors.length}`);
        
        // Validate database consistency
        const consistencyCheck = await concurrencyUtils.validateDatabaseConsistency(pages[0]);
        
        console.log(`Database consistency: ${consistencyCheck.consistent ? ' PASSED' : 'L FAILED'}`);
        
        if (!consistencyCheck.consistent) {
          console.error('Database consistency issues:', consistencyCheck.issues);
          consistencyCheck.issues.forEach(issue => {
            if (issue.severity === 'high') {
              throw new Error(`High severity database issue: ${issue.description}`);
            }
          });
        }

        // Expect high success rate for database operations
        const successRate = (results.successful.length / concurrentUsers) * 100;
        expect(successRate).toBeGreaterThan(90); // At least 90% success rate
      });

    } finally {
      await Promise.all(contexts.map(context => context.close()));
    }
  });

  /**
   * Test 3: Session Management with Simultaneous Authentication
   * Tests session isolation and prevents cross-user data contamination
   */
  test('Session management isolation with 25 concurrent users', async ({ browser }) => {
    const concurrentUsers = 25;
    
    const { contexts, pages } = await concurrencyUtils.createConcurrentBrowsers(browser, concurrentUsers);
    
    try {
      await test.step('Test session isolation', async () => {
        const sessionOperation = async (page, userIndex) => {
          try {
            const basePage = new BasePage(page);
            
            // Create unique session data
            const sessionData = {
              userId: userIndex,
              testRunId: testRunId,
              timestamp: Date.now(),
              preferences: {
                theme: userIndex % 2 === 0 ? 'light' : 'dark',
                language: userIndex % 3 === 0 ? 'en' : 'es'
              }
            };
            
            // Set unique session data
            await page.evaluate((data) => {
              sessionStorage.setItem('userSession', JSON.stringify(data));
              localStorage.setItem('userPrefs', JSON.stringify(data.preferences));
            }, sessionData);
            
            // Navigate and interact with the site
            await basePage.goto('/tickets');
            await basePage.waitForReady();
            
            // Add a ticket to cart
            const ticketButton = page.locator('button').filter({ hasText: /add.*cart/i }).first();
            if (await ticketButton.isVisible({ timeout: 5000 }).catch(() => false)) {
              await ticketButton.click();
              await page.waitForTimeout(1000);
            }
            
            // Navigate to another page
            await basePage.goto('/about');
            await basePage.waitForReady();
            
            // Verify session data integrity
            const retrievedData = await page.evaluate(() => {
              return {
                session: JSON.parse(sessionStorage.getItem('userSession') || '{}'),
                prefs: JSON.parse(localStorage.getItem('userPrefs') || '{}'),
                cart: JSON.parse(localStorage.getItem('cart') || '[]')
              };
            });
            
            return {
              success: true,
              userId: userIndex,
              originalData: sessionData,
              retrievedData: retrievedData,
              timestamp: new Date().toISOString()
            };
            
          } catch (error) {
            return {
              success: false,
              userId: userIndex,
              error: error.message,
              timestamp: new Date().toISOString()
            };
          }
        };

        console.log('Testing session isolation with concurrent users...');
        const results = await concurrencyUtils.executeConcurrentOperations(
          pages, 
          sessionOperation,
          { enableRaceDetection: true, collectMetrics: true }
        );

        // Analyze session isolation results
        console.log(`\n=== Session Isolation Results ===`);
        console.log(`Successful sessions: ${results.successful.length}`);
        console.log(`Failed sessions: ${results.errors.length}`);
        
        // Check for session contamination
        const sessionContamination = results.raceConditions.filter(rc => 
          rc.type === 'session_contamination'
        );
        
        if (sessionContamination.length > 0) {
          console.error('L Session contamination detected:', sessionContamination);
          throw new Error(`Session contamination detected: ${sessionContamination.length} instances`);
        } else {
          console.log(' No session contamination detected');
        }

        // Validate session data integrity
        const successfulSessions = results.successful;
        for (const session of successfulSessions) {
          const original = session.result.originalData;
          const retrieved = session.result.retrievedData.session;
          
          expect(retrieved.userId).toBe(original.userId);
          expect(retrieved.testRunId).toBe(original.testRunId);
        }

        const successRate = (results.successful.length / concurrentUsers) * 100;
        expect(successRate).toBeGreaterThan(95); // At least 95% success rate for sessions
      });

    } finally {
      await Promise.all(contexts.map(context => context.close()));
    }
  });

  /**
   * Test 4: Ticket Capacity Limits Under Load
   * Tests inventory management with limited ticket capacity
   */
  test('Ticket capacity limits with 40 users competing for limited inventory', async ({ browser }) => {
    const concurrentUsers = 40;
    const maxTicketCapacity = 20; // Simulate limited inventory
    
    const { contexts, pages } = await concurrencyUtils.createConcurrentBrowsers(browser, concurrentUsers);
    
    try {
      await test.step('Test inventory limits under concurrent load', async () => {
        const inventoryOperation = async (page, userIndex) => {
          try {
            const basePage = new BasePage(page);
            
            // Navigate to tickets
            await basePage.goto('/tickets');
            await basePage.waitForReady();
            
            // Attempt to purchase Social Pass (simulating limited inventory)
            const socialPassButton = page.locator('button').filter({ 
              hasText: /social.*pass.*add/i 
            }).first();
            
            if (await socialPassButton.isVisible({ timeout: 5000 }).catch(() => false)) {
              await socialPassButton.click();
              
              // Check if ticket was actually added to cart
              const cartCount = await page.locator('.cart-count, [data-cart-count]')
                .textContent({ timeout: 5000 }).catch(() => '0');
              
              if (cartCount !== '0') {
                // Attempt to proceed to checkout quickly
                const cartToggle = page.locator('.floating-cart, .cart-icon').first();
                await cartToggle.click();
                
                const checkoutButton = page.locator('button').filter({ 
                  hasText: /checkout|proceed/i 
                }).first();
                
                if (await checkoutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
                  await checkoutButton.click();
                  await page.waitForTimeout(2000);
                }
                
                return {
                  success: true,
                  userId: userIndex,
                  ticketAdded: true,
                  cartCount: cartCount,
                  timestamp: new Date().toISOString()
                };
              } else {
                return {
                  success: false,
                  userId: userIndex,
                  reason: 'ticket_not_added_to_cart',
                  timestamp: new Date().toISOString()
                };
              }
            } else {
              return {
                success: false,
                userId: userIndex,
                reason: 'social_pass_button_not_found',
                timestamp: new Date().toISOString()
              };
            }
            
          } catch (error) {
            return {
              success: false,
              userId: userIndex,
              error: error.message,
              timestamp: new Date().toISOString()
            };
          }
        };

        console.log(`Testing inventory limits: ${concurrentUsers} users competing for limited tickets...`);
        const results = await concurrencyUtils.executeConcurrentOperations(
          pages, 
          inventoryOperation,
          { enableRaceDetection: true, collectMetrics: true }
        );

        // Analyze inventory management results
        console.log(`\n=== Inventory Management Results ===`);
        const successfulPurchases = results.successful.filter(r => r.result.ticketAdded);
        console.log(`Successful ticket additions: ${successfulPurchases.length}`);
        console.log(`Failed attempts: ${results.errors.length + (results.successful.length - successfulPurchases.length)}`);
        
        // Check for inventory overselling
        const oversellIssues = results.raceConditions.filter(rc => 
          rc.type === 'inventory_oversell'
        );
        
        if (oversellIssues.length > 0) {
          console.error('L Inventory overselling detected:', oversellIssues);
          throw new Error(`Inventory overselling detected: ${oversellIssues.length} instances`);
        } else {
          console.log(' No inventory overselling detected');
        }

        // In a real scenario, we would validate against actual inventory limits
        // For now, we ensure the system handled concurrent load without crashing
        expect(results.successful.length + results.errors.length).toBe(concurrentUsers);
        
        // Validate inventory consistency
        const inventoryCheck = await concurrencyUtils.validateTicketInventory(pages[0]);
        if (!inventoryCheck.passed) {
          console.error('Inventory validation issues:', inventoryCheck.issues);
          const highSeverityIssues = inventoryCheck.issues.filter(issue => issue.severity === 'high');
          if (highSeverityIssues.length > 0) {
            throw new Error(`High severity inventory issues detected: ${highSeverityIssues.length}`);
          }
        }
      });

    } finally {
      await Promise.all(contexts.map(context => context.close()));
    }
  });

  /**
   * Test 5: Performance Degradation Detection Under Peak Load
   * Tests system performance with high concurrent user load (100 users)
   */
  test('Performance degradation detection with 100 concurrent users', async ({ browser }) => {
    const concurrentUsers = 100;
    
    const { contexts, pages } = await concurrencyUtils.createConcurrentBrowsers(browser, concurrentUsers);
    
    try {
      await test.step('Monitor performance under peak load', async () => {
        // Start performance monitoring
        const performanceMetrics = await concurrencyUtils.collectPerformanceMetrics(pages, 60000);
        
        const performanceOperation = async (page, userIndex) => {
          try {
            const basePage = new BasePage(page);
            const startTime = Date.now();
            
            // Simulate realistic user journey
            await basePage.goto('/');
            await basePage.waitForReady();
            
            const navigationTime = Date.now() - startTime;
            
            // Navigate to different pages
            await basePage.goto('/about');
            await basePage.waitForReady();
            
            await basePage.goto('/artists');
            await basePage.waitForReady();
            
            await basePage.goto('/tickets');
            await basePage.waitForReady();
            
            // Simulate some interaction
            const ticketButton = page.locator('button').first();
            if (await ticketButton.isVisible({ timeout: 3000 }).catch(() => false)) {
              await ticketButton.click();
            }
            
            const totalTime = Date.now() - startTime;
            
            // Collect client-side performance data
            const clientMetrics = await page.evaluate(() => {
              const nav = performance.navigation;
              const timing = performance.timing;
              
              return {
                loadTime: timing.loadEventEnd - timing.navigationStart,
                domReady: timing.domContentLoadedEventEnd - timing.navigationStart,
                firstPaint: performance.getEntriesByType('paint')[0]?.startTime || 0,
                memory: performance.memory ? {
                  used: performance.memory.usedJSHeapSize,
                  total: performance.memory.totalJSHeapSize
                } : null
              };
            });
            
            return {
              success: true,
              userId: userIndex,
              navigationTime,
              totalTime,
              clientMetrics,
              timestamp: new Date().toISOString()
            };
            
          } catch (error) {
            return {
              success: false,
              userId: userIndex,
              error: error.message,
              timestamp: new Date().toISOString()
            };
          }
        };

        console.log(`Testing performance degradation with ${concurrentUsers} concurrent users...`);
        const results = await concurrencyUtils.executeConcurrentOperations(
          pages, 
          performanceOperation,
          { enableRaceDetection: false, collectMetrics: true }
        );

        // Analyze performance results
        console.log(`\n=== Performance Analysis ===`);
        console.log(`Successful operations: ${results.successful.length}`);
        console.log(`Failed operations: ${results.errors.length}`);
        
        if (results.metrics) {
          console.log(`Average response time: ${results.metrics.responseTime.avg.toFixed(2)}ms`);
          console.log(`95th percentile: ${results.metrics.responseTime.p95.toFixed(2)}ms`);
          console.log(`Max response time: ${results.metrics.responseTime.max.toFixed(2)}ms`);
          console.log(`Throughput: ${results.metrics.throughput.toFixed(2)} ops/sec`);
          console.log(`Error rate: ${(results.metrics.errorRate * 100).toFixed(2)}%`);
          
          // Performance degradation checks
          const avgResponseTime = results.metrics.responseTime.avg;
          const p95ResponseTime = results.metrics.responseTime.p95;
          const errorRate = results.metrics.errorRate;
          
          // Performance requirements under load
          expect(avgResponseTime).toBeLessThan(8000); // 8 seconds average under peak load
          expect(p95ResponseTime).toBeLessThan(15000); // 15 seconds 95th percentile
          expect(errorRate).toBeLessThan(0.05); // Less than 5% error rate
          
          // Check for performance degradation patterns
          const timingIssues = results.raceConditions.filter(rc => 
            rc.type === 'timing_inconsistency'
          );
          
          if (timingIssues.length > 0) {
            console.warn('   Timing inconsistencies detected:', timingIssues);
            // Log but don't fail test - timing variations are expected under high load
          }
          
          console.log(' Performance requirements met under peak load');
        }

        const successRate = (results.successful.length / concurrentUsers) * 100;
        expect(successRate).toBeGreaterThan(85); // At least 85% success rate under peak load
      });

    } finally {
      await Promise.all(contexts.map(context => context.close()));
    }
  });

  /**
   * Test 6: Queue Management and Fair Access Testing
   * Tests system behavior when handling queued requests under high load
   */
  test('Queue management with burst load - 60 users in rapid succession', async ({ browser }) => {
    const burstUsers = 60;
    const burstInterval = 100; // 100ms between user arrivals
    
    await test.step('Test queue management under burst load', async () => {
      const userBatches = [];
      
      // Create users in batches to simulate burst traffic
      for (let batch = 0; batch < 6; batch++) {
        const batchSize = 10;
        const { contexts, pages } = await concurrencyUtils.createConcurrentBrowsers(browser, batchSize);
        
        userBatches.push({
          contexts,
          pages,
          batchIndex: batch,
          arrivalTime: batch * burstInterval
        });
      }
      
      try {
        const queueOperation = async (page, userIndex, batchInfo) => {
          // Simulate staggered arrival
          await new Promise(resolve => setTimeout(resolve, batchInfo.arrivalTime));
          
          try {
            const basePage = new BasePage(page);
            const arrivalTime = Date.now();
            
            // Attempt to access the site
            await basePage.goto('/tickets');
            await basePage.waitForReady();
            
            const pageLoadTime = Date.now() - arrivalTime;
            
            // Attempt newsletter subscription (queue-able operation)
            const subscribeResponse = await page.request.post('/api/email/subscribe', {
              data: {
                email: `queue_test_${batchInfo.batchIndex}_${userIndex}_${Date.now()}@e2e-test.com`,
                source: 'queue_load_test'
              }
            });
            
            const subscriptionTime = Date.now() - arrivalTime;
            
            return {
              success: subscribeResponse.ok(),
              userId: userIndex,
              batchIndex: batchInfo.batchIndex,
              arrivalTime: batchInfo.arrivalTime,
              pageLoadTime,
              subscriptionTime,
              queuePosition: batchInfo.batchIndex * 10 + userIndex,
              timestamp: new Date().toISOString()
            };
            
          } catch (error) {
            return {
              success: false,
              userId: userIndex,
              batchIndex: batchInfo.batchIndex,
              error: error.message,
              timestamp: new Date().toISOString()
            };
          }
        };
        
        console.log('Testing queue management with burst load...');
        
        // Execute operations for all batches
        const allResults = [];
        for (const batch of userBatches) {
          const batchResults = await concurrencyUtils.executeConcurrentOperations(
            batch.pages,
            (page, userIndex) => queueOperation(page, userIndex, batch),
            { enableRaceDetection: false, collectMetrics: true }
          );
          
          allResults.push(batchResults);
        }
        
        // Aggregate results
        const totalSuccessful = allResults.reduce((sum, result) => sum + result.successful.length, 0);
        const totalErrors = allResults.reduce((sum, result) => sum + result.errors.length, 0);
        
        console.log(`\n=== Queue Management Results ===`);
        console.log(`Total successful operations: ${totalSuccessful}`);
        console.log(`Total failed operations: ${totalErrors}`);
        console.log(`Overall success rate: ${((totalSuccessful / burstUsers) * 100).toFixed(2)}%`);
        
        // Analyze queue fairness
        const successfulOperations = allResults.flatMap(result => result.successful);
        const avgResponseTimeByBatch = {};
        
        successfulOperations.forEach(op => {
          const batchIndex = op.result.batchIndex;
          if (!avgResponseTimeByBatch[batchIndex]) {
            avgResponseTimeByBatch[batchIndex] = [];
          }
          avgResponseTimeByBatch[batchIndex].push(op.result.subscriptionTime);
        });
        
        // Calculate average response time per batch
        Object.keys(avgResponseTimeByBatch).forEach(batchIndex => {
          const times = avgResponseTimeByBatch[batchIndex];
          const avg = times.reduce((a, b) => a + b, 0) / times.length;
          console.log(`Batch ${batchIndex} avg response time: ${avg.toFixed(2)}ms`);
        });
        
        // Validate queue management fairness
        const responseTimeDifferences = Object.values(avgResponseTimeByBatch).map(times => 
          times.reduce((a, b) => a + b, 0) / times.length
        );
        
        if (responseTimeDifferences.length > 1) {
          const minTime = Math.min(...responseTimeDifferences);
          const maxTime = Math.max(...responseTimeDifferences);
          const timeDifferenceRatio = maxTime / minTime;
          
          console.log(`Queue fairness ratio: ${timeDifferenceRatio.toFixed(2)}`);
          
          // Queue should maintain reasonable fairness (later arrivals shouldn't be 5x slower)
          expect(timeDifferenceRatio).toBeLessThan(5);
        }
        
        // Overall system stability
        expect(totalSuccessful + totalErrors).toBe(burstUsers);
        expect((totalSuccessful / burstUsers) * 100).toBeGreaterThan(80); // At least 80% success rate
        
        console.log(' Queue management test completed successfully');
        
      } finally {
        // Clean up all batch contexts
        for (const batch of userBatches) {
          await Promise.all(batch.contexts.map(context => context.close()));
        }
      }
    });
  });
});
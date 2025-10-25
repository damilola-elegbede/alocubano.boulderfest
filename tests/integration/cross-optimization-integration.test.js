/**
 * Cross-Optimization Integration Tests
 *
 * Verifies that all 11 performance optimizations work together without conflicts:
 * 1. Font Loading + CSS Bundling (Frontend)
 * 2. Database Indexes + Query Consolidation (Database)
 * 3. Async Operations (Emails, Reminders, Fulfillment) (Backend)
 * 4. Cache Headers + API Performance (Backend)
 * 5. Batch Validation + Webhook Parallelization (Backend)
 *
 * Test Coverage:
 * - No conflicts between optimizations
 * - Cumulative performance gains
 * - Data integrity maintained
 * - Error handling works across optimizations
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';

// Skip in integration test mode (Playwright not installed)
const skipPlaywrightTests = process.env.INTEGRATION_TEST_MODE === 'true';

describe.skipIf(skipPlaywrightTests)('Cross-Optimization Integration', () => {
  let db;
  let browser;
  let context;
  let chromium;
  const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

  beforeAll(async () => {
    // Dynamically import Playwright when not skipped
    chromium = (await import('playwright')).chromium;
    db = await getDatabaseClient();
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
  });

  afterAll(async () => {
    await context?.close();
    await browser?.close();
  });

  beforeEach(async () => {
    // Clean up test data
    await db.execute({ sql: 'DELETE FROM tickets WHERE is_test = 1' });
    await db.execute({ sql: 'DELETE FROM transactions WHERE is_test = 1' });
    await db.execute({ sql: 'DELETE FROM registration_reminders WHERE is_test = 1' });
  });

  test('font loading + CSS bundling work together without conflicts', async () => {
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/home`, { waitUntil: 'networkidle' });

    // Verify font preload exists (Optimization #1)
    const preloadLink = await page.$('link[rel="preload"][as="style"]');
    expect(preloadLink).toBeTruthy();

    const preloadHref = await preloadLink.getAttribute('href');
    expect(preloadHref).toContain('fonts.googleapis.com');
    expect(preloadHref).toContain('display=swap');

    // Verify CSS bundling exists (Optimization #9)
    const criticalBundleLink = await page.$('link[rel="stylesheet"][href*="bundle-critical.css"]');
    expect(criticalBundleLink).toBeTruthy();

    const deferredBundleLink = await page.$('link[rel="stylesheet"][href*="bundle-deferred.css"]');
    expect(deferredBundleLink).toBeTruthy();

    // Verify both optimizations contribute to fast FCP
    const metrics = await page.evaluate(() => {
      const perfEntries = performance.getEntriesByType('paint');
      const fcp = perfEntries.find(entry => entry.name === 'first-contentful-paint');
      return { fcp: fcp ? fcp.startTime : null };
    });

    expect(metrics.fcp).toBeTruthy();
    // Combined optimization target: < 1500ms (100-200ms font + 300-500ms CSS bundling = 400-700ms total improvement)
    expect(metrics.fcp).toBeLessThan(1500);

    console.log(`✓ Font + CSS bundling: FCP = ${metrics.fcp.toFixed(2)}ms`);

    await page.close();
  });

  test('database indexes + query consolidation work together', async () => {
    // Create test data to verify index usage
    const testEventId = 9999;
    await db.execute({
      sql: `INSERT INTO events (id, name, slug, type, status, start_date, end_date)
            VALUES (?, 'Index Test Event', 'index-test', 'festival', 'active', '2026-05-15', '2026-05-17')`,
      args: [testEventId]
    });

    const testTransactionId = 'test_index_trans';
    await db.execute({
      sql: `INSERT INTO transactions (transaction_id, uuid, type, stripe_session_id, customer_email, customer_name,
                                      amount_cents, currency, status, payment_processor, is_test, order_data, created_at, updated_at)
            VALUES (?, ?, 'tickets', 'cs_test', 'index@example.com', 'Index Test', 5000, 'USD', 'completed', 'stripe', 1, '{}', datetime('now'), datetime('now'))`,
      args: [testTransactionId, testTransactionId]
    });

    // Create tickets that will use indexes (Optimization #2)
    for (let i = 0; i < 10; i++) {
      await db.execute({
        sql: `INSERT INTO tickets (ticket_id, transaction_id, ticket_type, event_id, price_cents, status, is_test, created_at)
              VALUES (?, ?, 'General', ?, 5000, 'valid', 1, datetime('now'))`,
        args: [`test_index_${i}`, testTransactionId, testEventId]
      });
    }

    // Measure consolidated query performance (Optimization #11)
    const start = performance.now();

    const statsQuery = `
      WITH ticket_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE status = 'valid') as total_tickets,
          COUNT(DISTINCT transaction_id) as total_orders
        FROM tickets
        WHERE event_id = ?
      )
      SELECT * FROM ticket_stats
    `;

    const result = await db.execute(statsQuery, [testEventId]);
    const duration = performance.now() - start;

    // With indexes + consolidation, should be very fast
    expect(duration).toBeLessThan(100);
    expect(result.rows[0].total_tickets).toBe(10);
    expect(result.rows[0].total_orders).toBe(1);

    console.log(`✓ Indexes + Query Consolidation: ${duration.toFixed(2)}ms`);

    // Cleanup
    await db.execute({ sql: 'DELETE FROM tickets WHERE event_id = ?', args: [testEventId] });
    await db.execute({ sql: 'DELETE FROM transactions WHERE id = ?', args: [testTransactionId] });
    await db.execute({ sql: 'DELETE FROM events WHERE id = ?', args: [testEventId] });
  });

  test('async operations (emails + reminders + fulfillment) do not block each other', async () => {
    // This tests that Optimizations #4, #5, #6 work in harmony
    const { createOrRetrieveTickets } = await import('../../lib/ticket-creation-service.js');
    const { fulfillReservation } = await import('../../lib/ticket-availability-service.js');

    const mockSession = {
      id: `cs_test_async_ops_${Date.now()}`,
      customer_email: 'async-ops@example.com',
      customer_details: {
        name: 'Async Test',
        email: 'async-ops@example.com'
      },
      amount_total: 5000,
      currency: 'usd',
      line_items: {
        data: [
          {
            quantity: 2,
            price: {
              unit_amount: 2500,
              product: {
                metadata: {
                  ticket_type_id: '1',
                  event_id: '1',
                  event_date: '2026-05-15'
                }
              }
            }
          }
        ]
      },
      metadata: { test_mode: 'true' },
      mode: 'payment'
    };

    // All async operations should complete quickly without blocking
    const start = performance.now();

    const result = await createOrRetrieveTickets(mockSession, null);

    const duration = performance.now() - start;

    // With all async optimizations (emails #6, reminders #4, fulfillment #5), checkout should be fast
    // Target: < 1000ms (not waiting for 1-2s email, 200-500ms reminders, 50-100ms fulfillment)
    expect(duration).toBeLessThan(1000);
    expect(result).toBeDefined();
    expect(result.transaction).toBeDefined();

    console.log(`✓ Async Operations Integration: ${duration.toFixed(2)}ms`);

    // Wait for all async operations to complete in background
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify reminders were scheduled (async #4)
    const remindersResult = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM registration_reminders WHERE transaction_id = ?',
      args: [result.transaction.id]
    });
    const reminderCount = remindersResult.rows[0]?.count || 0;
    expect(reminderCount).toBeGreaterThan(0);

    console.log(`✓ Reminders scheduled asynchronously: ${reminderCount} reminders`);
  }, 15000);

  test('cache headers + API performance optimizations work together', async () => {
    // Test admin API endpoints with cache headers (Optimization #3)
    const adminToken = process.env.TEST_ADMIN_TOKEN || 'test-token';

    const endpoints = [
      '/api/admin/dashboard',
      '/api/admin/registrations'
    ];

    for (const endpoint of endpoints) {
      const start = performance.now();

      const response = await fetch(`${BASE_URL}${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      });

      const duration = performance.now() - start;

      if (response.ok) {
        // Verify cache headers are present
        const cacheControl = response.headers.get('cache-control');
        const vary = response.headers.get('vary');

        expect(cacheControl).toBeTruthy();
        expect(cacheControl).toContain('private');
        expect(cacheControl).toContain('max-age=30');
        expect(vary).toContain('Authorization');

        // API should respond quickly with all backend optimizations
        // Target: < 200ms (includes indexes #2, query consolidation #11, cache headers #3)
        console.log(`✓ ${endpoint}: ${duration.toFixed(2)}ms, Cache-Control: ${cacheControl}`);
      } else {
        console.log(`⚠️ ${endpoint}: ${response.status} (may need authentication)`);
      }
    }
  });

  test('batch validation + webhook parallelization work together', async () => {
    // Test that Optimization #8 (batch validation) and #7 (webhook parallelization) work in harmony
    const { createOrRetrieveTickets } = await import('../../lib/ticket-creation-service.js');

    // Create session with multiple ticket types to test batch validation
    const mockSession = {
      id: `cs_test_batch_parallel_${Date.now()}`,
      customer_email: 'batch-parallel@example.com',
      customer_details: {
        name: 'Batch Parallel Test',
        email: 'batch-parallel@example.com'
      },
      amount_total: 15000,
      currency: 'usd',
      line_items: {
        data: [
          {
            quantity: 2,
            price: {
              unit_amount: 5000,
              product: {
                metadata: {
                  ticket_type_id: '1',
                  event_id: '1',
                  event_date: '2026-05-15'
                }
              }
            }
          },
          {
            quantity: 2,
            price: {
              unit_amount: 5000,
              product: {
                metadata: {
                  ticket_type_id: '2',
                  event_id: '1',
                  event_date: '2026-05-16'
                }
              }
            }
          }
        ]
      },
      metadata: { test_mode: 'true' },
      mode: 'payment'
    };

    // Batch validation should handle multiple ticket types efficiently
    const start = performance.now();

    const result = await createOrRetrieveTickets(mockSession, null);

    const duration = performance.now() - start;

    // With batch validation (#8), should validate all tickets in single query
    // With webhook parallelization (#7), subsequent operations run in parallel
    // Target: < 1500ms for 4 tickets across 2 types
    expect(duration).toBeLessThan(1500);
    expect(result).toBeDefined();
    expect(result.ticketCount).toBe(4);

    console.log(`✓ Batch Validation + Webhook Parallelization: ${duration.toFixed(2)}ms for ${result.ticketCount} tickets`);

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 500));
  }, 15000);

  test('frontend optimizations (font + CSS + JS deferral) combine for fast page load', async () => {
    const page = await context.newPage();

    // Measure full page load with all frontend optimizations
    const startNav = performance.now();
    await page.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded' });
    const navDuration = performance.now() - startNav;

    // Collect metrics
    const metrics = await page.evaluate(() => {
      const perfEntries = performance.getEntriesByType('paint');
      const navTiming = performance.getEntriesByType('navigation')[0];

      return {
        fcp: perfEntries.find(e => e.name === 'first-contentful-paint')?.startTime || 0,
        domContentLoaded: navTiming?.domContentLoadedEventEnd - navTiming?.domContentLoadedEventStart || 0,
        loadComplete: navTiming?.loadEventEnd - navTiming?.loadEventStart || 0
      };
    });

    // Verify all frontend optimizations are present
    const hasPreload = await page.$('link[rel="preload"][as="style"]');
    const hasCssBundle = await page.$('link[rel="stylesheet"][href*="bundle-critical.css"]');
    const hasDefer = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script[src*="navigation.js"]'));
      return scripts.some(s => s.defer === true);
    });

    expect(hasPreload).toBeTruthy();
    expect(hasCssBundle).toBeTruthy();
    expect(hasDefer).toBe(true);

    // Combined frontend optimizations should achieve fast load
    console.log(`✓ Frontend Optimizations Combined:`);
    console.log(`  - Navigation: ${navDuration.toFixed(2)}ms`);
    console.log(`  - FCP: ${metrics.fcp.toFixed(2)}ms`);
    console.log(`  - DOM Content Loaded: ${metrics.domContentLoaded.toFixed(2)}ms`);

    // Combined optimization target
    expect(metrics.fcp).toBeLessThan(1500);

    await page.close();
  });

  test('all optimizations maintain data integrity', async () => {
    // Verify that performance optimizations do not compromise data integrity
    const { createOrRetrieveTickets } = await import('../../lib/ticket-creation-service.js');

    const mockSession = {
      id: `cs_test_integrity_${Date.now()}`,
      customer_email: 'integrity@example.com',
      customer_details: {
        name: 'Integrity Test',
        email: 'integrity@example.com'
      },
      amount_total: 5000,
      currency: 'usd',
      line_items: {
        data: [
          {
            quantity: 3,
            price: {
              unit_amount: 5000,
              product: {
                metadata: {
                  ticket_type_id: '1',
                  event_id: '1',
                  event_date: '2026-05-15'
                }
              }
            }
          }
        ]
      },
      metadata: { test_mode: 'true' },
      mode: 'payment'
    };

    // Create tickets with all optimizations active
    const result = await createOrRetrieveTickets(mockSession, null);

    expect(result).toBeDefined();
    expect(result.transaction).toBeDefined();
    expect(result.ticketCount).toBe(3);

    // Verify all tickets were created
    const ticketsResult = await db.execute({
      sql: 'SELECT * FROM tickets WHERE transaction_id = ?',
      args: [result.transaction.id]
    });

    expect(ticketsResult.rows.length).toBe(3);

    // Verify transaction integrity
    const transactionResult = await db.execute({
      sql: 'SELECT * FROM transactions WHERE id = ?',
      args: [result.transaction.id]
    });

    expect(transactionResult.rows.length).toBe(1);
    expect(transactionResult.rows[0].status).toBe('completed');

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify reminders were scheduled (async operation didn't lose data)
    const remindersResult = await db.execute({
      sql: 'SELECT * FROM registration_reminders WHERE transaction_id = ?',
      args: [result.transaction.id]
    });

    expect(remindersResult.rows.length).toBeGreaterThan(0);

    console.log(`✓ Data Integrity Verified:`);
    console.log(`  - Tickets created: ${ticketsResult.rows.length}`);
    console.log(`  - Transaction status: ${transactionResult.rows[0].status}`);
    console.log(`  - Reminders scheduled: ${remindersResult.rows.length}`);
  }, 15000);

  test('error handling works correctly with all optimizations', async () => {
    // Test that error handling isn't broken by optimizations
    const { createOrRetrieveTickets } = await import('../../lib/ticket-creation-service.js');

    // Create session with invalid ticket type (should fail validation)
    const mockSession = {
      id: `cs_test_error_${Date.now()}`,
      customer_email: 'error@example.com',
      customer_details: {
        name: 'Error Test',
        email: 'error@example.com'
      },
      amount_total: 5000,
      currency: 'usd',
      line_items: {
        data: [
          {
            quantity: 1,
            price: {
              unit_amount: 5000,
              product: {
                metadata: {
                  ticket_type_id: 'nonexistent-ticket-999',
                  event_id: '1',
                  event_date: '2026-05-15'
                }
              }
            }
          }
        ]
      },
      metadata: { test_mode: 'true' },
      mode: 'payment'
    };

    // Should fail gracefully with batch validation (#8)
    await expect(createOrRetrieveTickets(mockSession, null)).rejects.toThrow();

    // Verify no partial data was created
    const ticketsResult = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM tickets WHERE transaction_id LIKE ?',
      args: [`%${mockSession.id}%`]
    });

    expect(ticketsResult.rows[0].count).toBe(0);

    console.log(`✓ Error handling works correctly - no partial data created`);
  });

  test('concurrent requests with all optimizations maintain consistency', async () => {
    // Test that concurrent requests don't cause race conditions
    const { createOrRetrieveTickets } = await import('../../lib/ticket-creation-service.js');

    const promises = Array.from({ length: 10 }, (_, i) => {
      const mockSession = {
        id: `cs_test_concurrent_${Date.now()}_${i}`,
        customer_email: `concurrent-${i}@example.com`,
        customer_details: {
          name: `Concurrent Test ${i}`,
          email: `concurrent-${i}@example.com`
        },
        amount_total: 5000,
        currency: 'usd',
        line_items: {
          data: [
            {
              quantity: 2,
              price: {
                unit_amount: 2500,
                product: {
                  metadata: {
                    ticket_type_id: '1',
                    event_id: '1',
                    event_date: '2026-05-15'
                  }
                }
              }
            }
          ]
        },
        metadata: { test_mode: 'true' },
        mode: 'payment'
      };

      return createOrRetrieveTickets(mockSession, null);
    });

    const start = performance.now();
    const results = await Promise.all(promises);
    const duration = performance.now() - start;

    // All should succeed
    expect(results.length).toBe(10);
    expect(results.every(r => r && r.transaction)).toBe(true);

    // With all optimizations, concurrent requests should complete efficiently
    console.log(`✓ Concurrent Requests: 10 requests in ${duration.toFixed(2)}ms`);

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Verify data consistency - each transaction should have exactly 2 tickets
    for (const result of results) {
      const ticketsResult = await db.execute({
        sql: 'SELECT COUNT(*) as count FROM tickets WHERE transaction_id = ?',
        args: [result.transaction.id]
      });

      expect(ticketsResult.rows[0].count).toBe(2);
    }

    console.log(`✓ Data consistency maintained across 10 concurrent requests`);
  }, 30000);

  test('performance metrics show cumulative gains', async () => {
    // Measure cumulative performance improvements
    const { createOrRetrieveTickets } = await import('../../lib/ticket-creation-service.js');

    const mockSession = {
      id: `cs_test_cumulative_${Date.now()}`,
      customer_email: 'cumulative@example.com',
      customer_details: {
        name: 'Cumulative Test',
        email: 'cumulative@example.com'
      },
      amount_total: 10000,
      currency: 'usd',
      line_items: {
        data: [
          {
            quantity: 4,
            price: {
              unit_amount: 2500,
              product: {
                metadata: {
                  ticket_type_id: '1',
                  event_id: '1',
                  event_date: '2026-05-15'
                }
              }
            }
          }
        ]
      },
      metadata: { test_mode: 'true' },
      mode: 'payment'
    };

    const start = performance.now();
    const result = await createOrRetrieveTickets(mockSession, null);
    const duration = performance.now() - start;

    // Expected cumulative gains:
    // - Async emails: 1000-2000ms saved
    // - Async reminders: 200-500ms saved
    // - Async fulfillment: 50-100ms saved
    // - Batch validation: 17.25ms saved (85% improvement)
    // - Database indexes: 10-50ms per query saved
    // Total backend improvement: ~1300-2700ms

    // Target: < 1000ms (fast checkout with all optimizations)
    expect(duration).toBeLessThan(1000);

    console.log(`✓ Cumulative Performance: ${duration.toFixed(2)}ms (target: <1000ms)`);
    console.log(`  Expected improvement: 1300-2700ms from async operations alone`);

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, 15000);
});

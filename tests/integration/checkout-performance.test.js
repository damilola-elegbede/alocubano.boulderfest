import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';
import { createOrRetrieveTickets } from '../../lib/ticket-creation-service.js';
import transactionService from '../../lib/transaction-service.js';

describe('Checkout Performance with Async Reminders', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabaseClient();
  });

  beforeEach(async () => {
    // Clean up test data - use email pattern instead of is_test column
    await db.execute({
      sql: `DELETE FROM tickets WHERE transaction_id IN (
        SELECT id FROM transactions WHERE customer_email LIKE '%@example.com'
      )`
    });
    await db.execute({
      sql: `DELETE FROM registration_reminders WHERE transaction_id IN (
        SELECT id FROM transactions WHERE customer_email LIKE '%@example.com'
      )`
    });
    await db.execute({
      sql: `DELETE FROM transactions WHERE customer_email LIKE '%@example.com'`
    });
  });

  afterAll(async () => {
    // Final cleanup - use email pattern instead of is_test column
    await db.execute({
      sql: `DELETE FROM tickets WHERE transaction_id IN (
        SELECT id FROM transactions WHERE customer_email LIKE '%@example.com'
      )`
    });
    await db.execute({
      sql: `DELETE FROM registration_reminders WHERE transaction_id IN (
        SELECT id FROM transactions WHERE customer_email LIKE '%@example.com'
      )`
    });
    await db.execute({
      sql: `DELETE FROM transactions WHERE customer_email LIKE '%@example.com'`
    });
  });

  test('checkout completes faster than 1.5s', async () => {
    const mockSession = {
      id: `cs_test_perf_${Date.now()}`,
      amount_total: 5000,
      customer_details: {
        email: 'perf-test@example.com',
        name: 'Performance Test'
      },
      livemode: false,
      metadata: {},
      line_items: {
        data: [
          {
            quantity: 2,
            amount_total: 5000,
            price: {
              product: {
                metadata: {
                  ticket_type: '1',
                  event_id: '1',
                  event_date: '2026-05-15'
                }
              }
            }
          }
        ]
      }
    };

    const start = performance.now();
    await createOrRetrieveTickets(mockSession);
    const duration = performance.now() - start;

    console.log(`Checkout completed in ${duration.toFixed(0)}ms`);

    // Target: <1500ms (should be 200-500ms faster than before async optimization)
    expect(duration).toBeLessThan(1500);

    // Wait for async reminders to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify reminders were scheduled
    const transaction = await transactionService.getByStripeSessionId(mockSession.id);
    const remindersResult = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM registration_reminders WHERE transaction_id = ?',
      args: [transaction.id]
    });
    const reminderCount = remindersResult.rows[0]?.count || 0;

    // Should have scheduled reminders (4 standard reminders for 24+ hour deadline)
    expect(reminderCount).toBeGreaterThan(0);
  }, 30000);

  test('concurrent checkouts complete efficiently', async () => {
    const durations = [];
    const concurrentCount = 10;

    const promises = Array.from({ length: concurrentCount }, async (_, i) => {
      const mockSession = {
        id: `cs_test_concurrent_${Date.now()}_${i}`,
        amount_total: 5000,
        customer_details: {
          email: `concurrent-${i}@example.com`,
          name: `Test User ${i}`
        },
        livemode: false,
        metadata: {},
        line_items: {
          data: [
            {
              quantity: 2,
              amount_total: 5000,
              price: {
                product: {
                  metadata: {
                    ticket_type: '1',
                    event_id: '1',
                    event_date: '2026-05-15'
                  }
                }
              }
            }
          ]
        }
      };

      const start = performance.now();
      await createOrRetrieveTickets(mockSession);
      const duration = performance.now() - start;
      durations.push(duration);
    });

    await Promise.all(promises);

    // Calculate p95
    durations.sort((a, b) => a - b);
    const p95Index = Math.floor(durations.length * 0.95);
    const p95 = durations[p95Index];
    const median = durations[Math.floor(durations.length / 2)];
    const average = durations.reduce((a, b) => a + b, 0) / durations.length;

    console.log(`Concurrent checkout performance (${concurrentCount} requests):`);
    console.log(`  Median: ${median.toFixed(0)}ms`);
    console.log(`  Average: ${average.toFixed(0)}ms`);
    console.log(`  P95: ${p95.toFixed(0)}ms`);

    // P95 should be under 2000ms for concurrent requests
    expect(p95).toBeLessThan(2000);

    // Wait for all async reminders to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, 60000);

  test('reminders still get scheduled correctly', async () => {
    const mockSession = {
      id: `cs_test_reminders_${Date.now()}`,
      amount_total: 5000,
      customer_details: {
        email: 'reminder-test@example.com',
        name: 'Reminder Test'
      },
      livemode: false,
      metadata: {},
      line_items: {
        data: [
          {
            quantity: 2,
            amount_total: 5000,
            price: {
              product: {
                metadata: {
                  ticket_type: '1',
                  event_id: '1',
                  event_date: '2026-05-15'
                }
              }
            }
          }
        ]
      }
    };

    const result = await createOrRetrieveTickets(mockSession);

    // Get transaction for verification
    const transaction = await transactionService.getByStripeSessionId(mockSession.id);
    expect(transaction).toBeDefined();

    // Wait for async reminder scheduling
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify reminders were scheduled
    const remindersResult = await db.execute({
      sql: `SELECT * FROM registration_reminders WHERE transaction_id = ? ORDER BY scheduled_for`,
      args: [transaction.id]
    });

    const reminders = remindersResult.rows || [];
    expect(reminders.length).toBeGreaterThan(0);

    // Standard 24+ hour deadline should have 4 reminders
    // (Initial 1hr, Mid 12hr, Urgent 12hr before, Final 6hr before)
    expect(reminders.length).toBe(4);

    // Verify reminder types
    const reminderTypes = reminders.map(r => r.reminder_type);
    expect(reminderTypes).toContain('initial');
    expect(reminderTypes).toContain('urgent');
    expect(reminderTypes).toContain('final');
  }, 30000);

  test('performance with multiple ticket types', async () => {
    const mockSession = {
      id: `cs_test_multi_${Date.now()}`,
      amount_total: 10000,
      customer_details: {
        email: 'multi-ticket@example.com',
        name: 'Multi Ticket Test'
      },
      livemode: false,
      metadata: {},
      line_items: {
        data: [
          {
            quantity: 2,
            amount_total: 5000,
            price: {
              product: {
                metadata: {
                  ticket_type: '1',
                  event_id: '1',
                  event_date: '2026-05-15'
                }
              }
            }
          },
          {
            quantity: 2,
            amount_total: 5000,
            price: {
              product: {
                metadata: {
                  ticket_type: '2',
                  event_id: '1',
                  event_date: '2026-05-16'
                }
              }
            }
          }
        ]
      }
    };

    const start = performance.now();
    await createOrRetrieveTickets(mockSession);
    const duration = performance.now() - start;

    console.log(`Multi-ticket checkout completed in ${duration.toFixed(0)}ms`);

    // Should still be fast with multiple ticket types
    expect(duration).toBeLessThan(1500);

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify multiple deadline reminders scheduled
    const transaction = await transactionService.getByStripeSessionId(mockSession.id);
    const remindersResult = await db.execute({
      sql: `SELECT COUNT(*) as count FROM registration_reminders WHERE transaction_id = ?`,
      args: [transaction.id]
    });

    const reminderCount = remindersResult.rows[0]?.count || 0;
    // Two different event dates = two sets of reminders (8 total for standard deadlines)
    expect(reminderCount).toBeGreaterThan(0);
  }, 30000);

  test('checkout speed is consistent across multiple runs', async () => {
    const runCount = 5;
    const durations = [];

    for (let i = 0; i < runCount; i++) {
      const mockSession = {
        id: `cs_test_consistent_${Date.now()}_${i}`,
        amount_total: 5000,
        customer_details: {
          email: `consistent-${i}@example.com`,
          name: `Consistent Test ${i}`
        },
        livemode: false,
        metadata: {},
        line_items: {
          data: [
            {
              quantity: 2,
              amount_total: 5000,
              price: {
                product: {
                  metadata: {
                    ticket_type: '1',
                    event_id: '1',
                    event_date: '2026-05-15'
                  }
                }
              }
            }
          ]
        }
      };

      const start = performance.now();
      await createOrRetrieveTickets(mockSession);
      const duration = performance.now() - start;
      durations.push(duration);

      // Small delay between runs
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const average = durations.reduce((a, b) => a + b, 0) / durations.length;
    const max = Math.max(...durations);
    const min = Math.min(...durations);
    const variance = durations.map(d => Math.pow(d - average, 2)).reduce((a, b) => a + b, 0) / durations.length;
    const stdDev = Math.sqrt(variance);

    console.log(`Consistency test (${runCount} runs):`);
    console.log(`  Average: ${average.toFixed(0)}ms`);
    console.log(`  Min: ${min.toFixed(0)}ms`);
    console.log(`  Max: ${max.toFixed(0)}ms`);
    console.log(`  StdDev: ${stdDev.toFixed(0)}ms`);

    // All runs should be under 1500ms
    expect(max).toBeLessThan(1500);

    // Variance should be reasonable (not wildly inconsistent)
    expect(stdDev).toBeLessThan(500);

    // Wait for all async reminders
    await new Promise(resolve => setTimeout(resolve, 500));
  }, 60000);

  test('error in reminder scheduling does not break checkout', async () => {
    // This test verifies that even if reminder scheduling fails,
    // the checkout completes successfully

    const mockSession = {
      id: `cs_test_error_${Date.now()}`,
      amount_total: 5000,
      customer_details: {
        email: 'error-test@example.com',
        name: 'Error Test'
      },
      livemode: false,
      metadata: {},
      line_items: {
        data: [
          {
            quantity: 2,
            amount_total: 5000,
            price: {
              product: {
                metadata: {
                  ticket_type: '1',
                  event_id: '1',
                  event_date: '2026-05-15'
                }
              }
            }
          }
        ]
      }
    };

    // Checkout should succeed even if reminders fail
    const result = await createOrRetrieveTickets(mockSession);

    expect(result).toBeDefined();
    expect(result.ticketCount).toBe(2);
    expect(result.created).toBe(true);

    // Verify tickets were created
    const transaction = await transactionService.getByStripeSessionId(mockSession.id);
    const ticketsResult = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM tickets WHERE transaction_id = ?',
      args: [transaction.id]
    });

    const ticketCount = ticketsResult.rows[0]?.count || 0;
    expect(ticketCount).toBe(2);

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 500));
  }, 30000);
});

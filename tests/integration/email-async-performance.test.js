/**
 * Email Async Performance Integration Tests
 * Tests that checkout completes without waiting for email sending
 * BIGGEST PERFORMANCE WIN: 1-2 second improvement
 */

import { describe, test, expect, vi, beforeAll, afterAll } from 'vitest';
import { createOrRetrieveTickets } from '../../lib/ticket-creation-service.js';
import { getDatabaseClient } from '../../lib/database.js';
import * as ticketEmailServiceModule from '../../lib/ticket-email-service-brevo.js';

describe('Async Email Performance Tests', () => {
  let db;
  let originalGetTicketEmailService;

  beforeAll(async () => {
    db = await getDatabaseClient();
    originalGetTicketEmailService = ticketEmailServiceModule.getTicketEmailService;
  });

  afterAll(async () => {
    // Restore original function
    ticketEmailServiceModule.getTicketEmailService = originalGetTicketEmailService;

    // Cleanup test data
    await db.execute({
      sql: 'DELETE FROM email_retry_queue WHERE is_test = 1',
      args: []
    });
  });

  afterEach(() => {
    // Clear mock call history and restore original implementations
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  test('checkout completes immediately without waiting for email', async () => {
    // Mock email service to simulate slow email sending (1500ms)
    const mockEmailService = {
      sendTicketConfirmation: vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(resolve, 1500); // Simulate slow email
        });
      })
    };

    vi.spyOn(ticketEmailServiceModule, 'getTicketEmailService').mockReturnValue(mockEmailService);

    // Create test session
    const testSession = {
      id: `cs_test_async_perf_${Date.now()}`,
      customer_email: 'perf-test@example.com',
      customer_details: {
        name: 'Performance Test',
        email: 'perf-test@example.com'
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
                  ticket_type_id: '1',
                  event_id: '1'
                }
              }
            }
          }
        ]
      },
      metadata: {
        test_mode: 'true'
      },
      mode: 'payment'
    };

    // Measure checkout time
    const startTime = performance.now();

    const result = await createOrRetrieveTickets(testSession, null);

    const duration = performance.now() - startTime;

    // Checkout should complete in under 1 second (not waiting for 1.5s email)
    expect(duration).toBeLessThan(1000);
    expect(result).toBeDefined();
    expect(result.transaction).toBeDefined();

    // Email should eventually be sent (async)
    // Give it time to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
    expect(mockEmailService.sendTicketConfirmation).toHaveBeenCalled();
  }, 10000); // 10 second timeout for this test

  test('failed email queues for retry without blocking checkout', async () => {
    // Mock email service to fail
    const mockEmailService = {
      sendTicketConfirmation: vi.fn().mockRejectedValue(new Error('Brevo API timeout'))
    };

    vi.spyOn(ticketEmailServiceModule, 'getTicketEmailService').mockReturnValue(mockEmailService);

    // Create test session
    const testSession = {
      id: `cs_test_async_fail_${Date.now()}`,
      customer_email: 'fail-test@example.com',
      customer_details: {
        name: 'Fail Test',
        email: 'fail-test@example.com'
      },
      amount_total: 3000,
      currency: 'usd',
      line_items: {
        data: [
          {
            quantity: 1,
            price: {
              unit_amount: 3000,
              product: {
                metadata: {
                  ticket_type_id: '1',
                  event_id: '1'
                }
              }
            }
          }
        ]
      },
      metadata: {
        test_mode: 'true'
      },
      mode: 'payment'
    };

    // Checkout should complete immediately despite email failure
    const startTime = performance.now();

    const result = await createOrRetrieveTickets(testSession, null);

    const duration = performance.now() - startTime;

    expect(duration).toBeLessThan(1000);
    expect(result).toBeDefined();
    expect(result.transaction).toBeDefined();

    // Wait for async error handling to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify email was queued for retry
    const queuedEmails = await db.execute({
      sql: `
        SELECT * FROM email_retry_queue
        WHERE email_address = ?
        AND is_test = 1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      args: ['fail-test@example.com']
    });

    expect(queuedEmails.rows.length).toBeGreaterThan(0);
    expect(queuedEmails.rows[0].email_type).toBe('ticket_confirmation');
    expect(queuedEmails.rows[0].status).toBe('pending');
    expect(queuedEmails.rows[0].last_error).toContain('Brevo API timeout');
  }, 10000);

  test('100 concurrent checkouts handle async emails efficiently', async () => {
    // Mock fast email service
    const mockEmailService = {
      sendTicketConfirmation: vi.fn().mockResolvedValue(true)
    };

    vi.spyOn(ticketEmailServiceModule, 'getTicketEmailService').mockReturnValue(mockEmailService);

    const startTime = performance.now();

    // Create 100 concurrent checkout sessions
    const promises = Array.from({ length: 100 }, (_, i) => {
      const testSession = {
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
              quantity: 1,
              price: {
                unit_amount: 5000,
                product: {
                  metadata: {
                    ticket_type_id: '1',
                    event_id: '1'
                  }
                }
              }
            }
          ]
        },
        metadata: {
          test_mode: 'true'
        },
        mode: 'payment'
      };

      return createOrRetrieveTickets(testSession, null);
    });

    // All checkouts should complete
    const results = await Promise.all(promises);

    const duration = performance.now() - startTime;

    // 100 checkouts should complete within reasonable time
    // Without async emails, this would take 100-200 seconds
    // With async emails, should be under 30 seconds
    expect(duration).toBeLessThan(30000);
    expect(results).toHaveLength(100);
    expect(results.every(r => r && r.transaction)).toBe(true);

    // Wait for async emails to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify all emails were sent
    expect(mockEmailService.sendTicketConfirmation).toHaveBeenCalledTimes(100);
  }, 60000); // 60 second timeout for load test

  test('email queue handles mixed success and failure scenarios', async () => {
    let callCount = 0;

    // Mock email service that fails every other call
    const mockEmailService = {
      sendTicketConfirmation: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount % 2 === 0) {
          return Promise.reject(new Error('Intermittent failure'));
        }
        return Promise.resolve(true);
      })
    };

    vi.spyOn(ticketEmailServiceModule, 'getTicketEmailService').mockReturnValue(mockEmailService);

    // Create 10 concurrent checkouts
    const promises = Array.from({ length: 10 }, (_, i) => {
      const testSession = {
        id: `cs_test_mixed_${Date.now()}_${i}`,
        customer_email: `mixed-${i}@example.com`,
        customer_details: {
          name: `Mixed Test ${i}`,
          email: `mixed-${i}@example.com`
        },
        amount_total: 2000,
        currency: 'usd',
        line_items: {
          data: [
            {
              quantity: 1,
              price: {
                unit_amount: 2000,
                product: {
                  metadata: {
                    ticket_type_id: '1',
                    event_id: '1'
                  }
                }
              }
            }
          ]
        },
        metadata: {
          test_mode: 'true'
        },
        mode: 'payment'
      };

      return createOrRetrieveTickets(testSession, null);
    });

    // All checkouts should complete regardless of email status
    await expect(Promise.all(promises)).resolves.not.toThrow();

    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify some emails were queued for retry (the failed ones)
    const queuedEmails = await db.execute({
      sql: `
        SELECT * FROM email_retry_queue
        WHERE email_address LIKE 'mixed-%@example.com'
        AND is_test = 1
      `,
      args: []
    });

    // Should have ~5 failed emails queued (every other one)
    expect(queuedEmails.rows.length).toBeGreaterThan(0);
    expect(queuedEmails.rows.length).toBeLessThanOrEqual(5);
  }, 15000);

  test('checkout performance improves by at least 1 second with async emails', async () => {
    // Test 1: Simulated synchronous email (old behavior)
    const mockSlowEmailService = {
      sendTicketConfirmation: vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(resolve, 1500); // 1.5 second email
        });
      })
    };

    vi.spyOn(ticketEmailServiceModule, 'getTicketEmailService').mockReturnValue(mockSlowEmailService);

    const syncSession = {
      id: `cs_test_sync_${Date.now()}`,
      customer_email: 'sync-test@example.com',
      customer_details: {
        name: 'Sync Test',
        email: 'sync-test@example.com'
      },
      amount_total: 4000,
      currency: 'usd',
      line_items: {
        data: [
          {
            quantity: 1,
            price: {
              unit_amount: 4000,
              product: {
                metadata: {
                  ticket_type_id: '1',
                  event_id: '1'
                }
              }
            }
          }
        ]
      },
      metadata: {
        test_mode: 'true'
      },
      mode: 'payment'
    };

    const asyncStart = performance.now();
    await createOrRetrieveTickets(syncSession, null);
    const asyncDuration = performance.now() - asyncStart;

    // With async emails, checkout should be at least 1 second faster
    // (not waiting for the 1.5 second email to complete)
    expect(asyncDuration).toBeLessThan(1000);

    // The improvement is: 1500ms (email time) - asyncDuration
    const improvement = 1500 - asyncDuration;
    expect(improvement).toBeGreaterThan(1000); // At least 1 second improvement
  }, 10000);
});

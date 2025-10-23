import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOrRetrieveTickets } from '../../lib/ticket-creation-service.js';
import * as reminderScheduler from '../../lib/reminder-scheduler.js';
import transactionService from '../../lib/transaction-service.js';
import { getDatabaseClient } from '../../lib/database.js';
import * as ticketIdGenerator from '../../lib/ticket-id-generator.js';

describe('Async Reminder Scheduling', () => {
  let mockSession, mockTransaction, originalConsoleLog, originalConsoleError;

  beforeEach(() => {
    // Capture console to verify async logging
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    console.log = vi.fn();
    console.error = vi.fn();

    // Mock ticket ID generator to avoid database calls
    let ticketIdCounter = 0;
    vi.spyOn(ticketIdGenerator, 'generateTicketId').mockImplementation(async () => {
      ticketIdCounter++;
      return `TKT-TEST${ticketIdCounter.toString().padStart(5, '0')}`;
    });

    mockSession = {
      id: 'cs_test_async_reminders_123',
      amount_total: 5000,
      customer_details: {
        email: 'test@example.com',
        name: 'Test User'
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

    mockTransaction = {
      id: 999,
      uuid: 'trans_async_test_123',
      email: 'test@example.com',
      total_amount_cents: 5000,
      stripe_session_id: 'cs_test_async_reminders_123',
      is_test: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString()
    };
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    vi.restoreAllMocks();
  });

  test('ticket creation does not await reminder scheduling', async () => {
    // Mock transaction service to return new transaction (triggers reminder scheduling)
    vi.spyOn(transactionService, 'getByStripeSessionId').mockResolvedValue(null);
    vi.spyOn(transactionService, 'createFromStripeSession').mockResolvedValue(mockTransaction);

    // Mock database for ticket creation
    const db = await getDatabaseClient();
    vi.spyOn(db, 'execute').mockResolvedValue({ rows: [] });
    vi.spyOn(db, 'batch').mockResolvedValue(undefined);

    // Slow reminder scheduling (500ms delay)
    vi.spyOn(reminderScheduler, 'scheduleRegistrationReminders').mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      return 3;
    });

    const start = performance.now();
    await createOrRetrieveTickets(mockSession);
    const duration = performance.now() - start;

    // Should complete fast (not waiting for 500ms reminders)
    // Allow 200ms buffer for test overhead
    expect(duration).toBeLessThan(300);
  }, 10000);

  test('reminders still get scheduled asynchronously', async () => {
    // Mock transaction service
    vi.spyOn(transactionService, 'getByStripeSessionId').mockResolvedValue(null);
    vi.spyOn(transactionService, 'createFromStripeSession').mockResolvedValue(mockTransaction);

    // Mock database
    const db = await getDatabaseClient();
    vi.spyOn(db, 'execute').mockResolvedValue({ rows: [] });
    vi.spyOn(db, 'batch').mockResolvedValue(undefined);

    const scheduleSpy = vi.spyOn(reminderScheduler, 'scheduleRegistrationReminders').mockResolvedValue(3);

    await createOrRetrieveTickets(mockSession);

    // Wait for async operation to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(scheduleSpy).toHaveBeenCalledWith(
      mockTransaction.id,
      expect.any(Date), // deadline
      true // isTestTransaction
    );
  }, 10000);

  test('reminder scheduling failures do not break checkout', async () => {
    // Mock transaction service
    vi.spyOn(transactionService, 'getByStripeSessionId').mockResolvedValue(null);
    vi.spyOn(transactionService, 'createFromStripeSession').mockResolvedValue(mockTransaction);

    // Mock database
    const db = await getDatabaseClient();
    vi.spyOn(db, 'execute').mockResolvedValue({ rows: [] });
    vi.spyOn(db, 'batch').mockResolvedValue(undefined);

    vi.spyOn(reminderScheduler, 'scheduleRegistrationReminders').mockRejectedValue(
      new Error('DB connection failed')
    );

    // Checkout should still succeed
    await expect(createOrRetrieveTickets(mockSession)).resolves.not.toThrow();
  }, 10000);

  test('error logged when reminder scheduling fails', async () => {
    // Mock transaction service
    vi.spyOn(transactionService, 'getByStripeSessionId').mockResolvedValue(null);
    vi.spyOn(transactionService, 'createFromStripeSession').mockResolvedValue(mockTransaction);

    // Mock database
    const db = await getDatabaseClient();
    vi.spyOn(db, 'execute').mockResolvedValue({ rows: [] });
    vi.spyOn(db, 'batch').mockResolvedValue(undefined);

    const testError = new Error('Test error');
    vi.spyOn(reminderScheduler, 'scheduleRegistrationReminders').mockRejectedValue(testError);

    await createOrRetrieveTickets(mockSession);

    // Wait for async error handling
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Reminder scheduling failed'),
      expect.any(Number),
      testError
    );
  }, 10000);

  test('success logged when reminders scheduled', async () => {
    // Mock transaction service
    vi.spyOn(transactionService, 'getByStripeSessionId').mockResolvedValue(null);
    vi.spyOn(transactionService, 'createFromStripeSession').mockResolvedValue(mockTransaction);

    // Mock database
    const db = await getDatabaseClient();
    vi.spyOn(db, 'execute').mockResolvedValue({ rows: [] });
    vi.spyOn(db, 'batch').mockResolvedValue(undefined);

    vi.spyOn(reminderScheduler, 'scheduleRegistrationReminders').mockResolvedValue(4);

    await createOrRetrieveTickets(mockSession);

    // Wait for async success logging
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Scheduled 4 reminders')
    );
  }, 10000);

  test('multiple deadlines scheduled in parallel', async () => {
    // Mock transaction with multiple ticket types (different deadlines)
    const multiDeadlineSession = {
      ...mockSession,
      line_items: {
        data: [
          {
            quantity: 1,
            amount_total: 2500,
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
            quantity: 1,
            amount_total: 2500,
            price: {
              product: {
                metadata: {
                  ticket_type: '2',
                  event_id: '1',
                  event_date: '2026-05-16' // Different event date = different deadline
                }
              }
            }
          }
        ]
      }
    };

    // Mock transaction service
    vi.spyOn(transactionService, 'getByStripeSessionId').mockResolvedValue(null);
    vi.spyOn(transactionService, 'createFromStripeSession').mockResolvedValue(mockTransaction);

    // Mock database
    const db = await getDatabaseClient();
    vi.spyOn(db, 'execute').mockResolvedValue({ rows: [] });
    vi.spyOn(db, 'batch').mockResolvedValue(undefined);

    const scheduleSpy = vi.spyOn(reminderScheduler, 'scheduleRegistrationReminders').mockResolvedValue(3);

    const start = performance.now();
    await createOrRetrieveTickets(multiDeadlineSession);
    const duration = performance.now() - start;

    // Should complete fast despite multiple deadline scheduling calls
    expect(duration).toBeLessThan(300);

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify both deadlines were scheduled
    expect(scheduleSpy).toHaveBeenCalledTimes(2);
  }, 10000);

  test('existing tickets do not trigger reminder scheduling', async () => {
    // Mock existing transaction with tickets already created
    vi.spyOn(transactionService, 'getByStripeSessionId').mockResolvedValue(mockTransaction);

    const db = await getDatabaseClient();
    vi.spyOn(db, 'execute').mockResolvedValue({
      rows: [
        { ticket_id: 'TICK-001', ticket_type: '1' },
        { ticket_id: 'TICK-002', ticket_type: '1' }
      ]
    });

    const scheduleSpy = vi.spyOn(reminderScheduler, 'scheduleRegistrationReminders').mockResolvedValue(3);

    await createOrRetrieveTickets(mockSession);

    // Wait to ensure no async calls happen
    await new Promise(resolve => setTimeout(resolve, 100));

    // Reminder scheduling should NOT be called for existing tickets
    expect(scheduleSpy).not.toHaveBeenCalled();
  }, 10000);

  test('performance improvement is measurable', async () => {
    // Mock transaction service
    vi.spyOn(transactionService, 'getByStripeSessionId').mockResolvedValue(null);
    vi.spyOn(transactionService, 'createFromStripeSession').mockResolvedValue(mockTransaction);

    // Mock database
    const db = await getDatabaseClient();
    vi.spyOn(db, 'execute').mockResolvedValue({ rows: [] });
    vi.spyOn(db, 'batch').mockResolvedValue(undefined);

    // Test with slow reminder scheduling (simulate real-world delay)
    vi.spyOn(reminderScheduler, 'scheduleRegistrationReminders').mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 300)); // 300ms delay
      return 3;
    });

    const start = performance.now();
    await createOrRetrieveTickets(mockSession);
    const duration = performance.now() - start;

    // Should complete in <200ms despite 300ms reminder scheduling
    // This demonstrates the 200-500ms improvement claimed
    expect(duration).toBeLessThan(200);
  }, 10000);

  test('no reminder warning logged when no deadlines tracked', async () => {
    // Mock session with donation (no tickets)
    const donationSession = {
      ...mockSession,
      line_items: {
        data: [
          {
            quantity: 1,
            amount_total: 5000,
            price: {
              product: {
                metadata: {
                  type: 'donation',
                  donation_category: 'general'
                }
              }
            }
          }
        ]
      }
    };

    // Mock transaction service
    vi.spyOn(transactionService, 'getByStripeSessionId').mockResolvedValue(null);
    vi.spyOn(transactionService, 'createFromStripeSession').mockResolvedValue(mockTransaction);

    // Mock database
    const db = await getDatabaseClient();
    vi.spyOn(db, 'execute').mockResolvedValue({ rows: [] });
    vi.spyOn(db, 'batch').mockResolvedValue(undefined);

    const warnSpy = vi.spyOn(console, 'warn');

    await createOrRetrieveTickets(donationSession);

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify warning about no deadlines
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('No registration deadlines tracked')
    );
  }, 10000);
});

/**
 * Email Retry Cron Integration Tests
 * Tests that the retry queue cron job processes failed emails correctly
 */

import { describe, test, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';
import processEmailQueueHandler from '../../api/email/process-retry-queue.js';
import * as ticketEmailServiceModule from '../../lib/ticket-email-service-brevo.js';

describe('Email Retry Cron Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabaseClient();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await db.execute({
      sql: 'DELETE FROM email_retry_queue WHERE is_test = 1',
      args: []
    });
  });

  afterAll(async () => {
    // Final cleanup
    await db.execute({
      sql: 'DELETE FROM email_retry_queue WHERE is_test = 1',
      args: []
    });
  });

  test('retry cron processes queued emails successfully', async () => {
    // Create test transaction
    const transactionResult = await db.execute({
      sql: `
        INSERT INTO transactions
        (transaction_id, uuid, type, customer_email, customer_name, amount_cents, currency, status, order_data, is_test)
        VALUES (?, ?, 'tickets', ?, ?, ?, ?, ?, '{}', ?)
      `,
      args: ['trans_trans_retry_success', 'trans_retry_success', 'retry-success@example.com', 'Retry Success', 5000, 'usd', 'completed', 1]
    });

    const transactionId = transactionResult.lastInsertRowid;

    // Add email to retry queue (ready for processing)
    await db.execute({
      sql: `
        INSERT INTO email_retry_queue
        (transaction_id, email_address, email_type, next_retry_at, last_error, is_test)
        VALUES (?, ?, 'ticket_confirmation', datetime('now', '-1 minute'), 'Initial failure', ?)
      `,
      args: [transactionId, 'retry-success@example.com', 1]
    });

    // Mock successful email sending
    const mockEmailService = {
      sendTicketConfirmation: vi.fn().mockResolvedValue(true)
    };

    vi.spyOn(ticketEmailServiceModule, 'getTicketEmailService').mockReturnValue(mockEmailService);

    // Mock request/response for cron handler
    const mockReq = {
      method: 'GET',
      headers: {}
    };

    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn()
    };

    // Run cron job
    await processEmailQueueHandler(mockReq, mockRes);

    // Verify response indicates success
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        results: expect.objectContaining({
          succeeded: expect.any(Number)
        })
      })
    );

    // Verify email was marked as sent
    const queueStatus = await db.execute({
      sql: `SELECT * FROM email_retry_queue WHERE transaction_id = ?`,
      args: [transactionId]
    });

    expect(queueStatus.rows[0].status).toBe('sent');
    expect(queueStatus.rows[0].sent_at).toBeTruthy();
    expect(queueStatus.rows[0].last_error).toBeNull();
  });

  test('retry cron handles failed attempts with exponential backoff', async () => {
    // Create test transaction
    const transactionResult = await db.execute({
      sql: `
        INSERT INTO transactions
        (transaction_id, uuid, type, customer_email, customer_name, amount_cents, currency, status, order_data, is_test)
        VALUES (?, ?, 'tickets', ?, ?, ?, ?, ?, '{}', ?)
      `,
      args: ['trans_trans_retry_backoff', 'trans_retry_backoff', 'retry-backoff@example.com', 'Retry Backoff', 3000, 'usd', 'completed', 1]
    });

    const transactionId = transactionResult.lastInsertRowid;

    // Add email to retry queue
    await db.execute({
      sql: `
        INSERT INTO email_retry_queue
        (transaction_id, email_address, email_type, next_retry_at, attempt_count, last_error, is_test)
        VALUES (?, ?, 'ticket_confirmation', datetime('now', '-1 minute'), 1, 'Previous failure', ?)
      `,
      args: [transactionId, 'retry-backoff@example.com', 1]
    });

    // Mock failed email sending
    const mockEmailService = {
      sendTicketConfirmation: vi.fn().mockRejectedValue(new Error('Brevo API error'))
    };

    vi.spyOn(ticketEmailServiceModule, 'getTicketEmailService').mockReturnValue(mockEmailService);

    // Mock request/response
    const mockReq = {
      method: 'GET',
      headers: {}
    };

    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn()
    };

    // Run cron job
    await processEmailQueueHandler(mockReq, mockRes);

    // Verify email retry was scheduled
    const queueStatus = await db.execute({
      sql: `SELECT * FROM email_retry_queue WHERE transaction_id = ?`,
      args: [transactionId]
    });

    const email = queueStatus.rows[0];
    expect(email.status).toBe('pending');
    expect(email.attempt_count).toBe(2); // Incremented from 1 to 2
    expect(email.last_error).toContain('Brevo API error');

    // Verify next_retry_at is in the future (exponential backoff)
    const nextRetry = new Date(email.next_retry_at);
    const now = new Date();
    expect(nextRetry.getTime()).toBeGreaterThan(now.getTime());
  });

  test('retry cron marks emails as failed after max attempts', async () => {
    // Create test transaction
    const transactionResult = await db.execute({
      sql: `
        INSERT INTO transactions
        (transaction_id, uuid, type, customer_email, customer_name, amount_cents, currency, status, order_data, is_test)
        VALUES (?, ?, 'tickets', ?, ?, ?, ?, ?, '{}', ?)
      `,
      args: ['trans_trans_retry_failed', 'trans_retry_failed', 'retry-failed@example.com', 'Retry Failed', 2000, 'usd', 'completed', 1]
    });

    const transactionId = transactionResult.lastInsertRowid;

    // Add email with 4 previous attempts (one more will exceed max of 5)
    await db.execute({
      sql: `
        INSERT INTO email_retry_queue
        (transaction_id, email_address, email_type, next_retry_at, attempt_count, last_error, is_test)
        VALUES (?, ?, 'ticket_confirmation', datetime('now', '-1 minute'), 4, 'Multiple failures', ?)
      `,
      args: [transactionId, 'retry-failed@example.com', 1]
    });

    // Mock failed email sending
    const mockEmailService = {
      sendTicketConfirmation: vi.fn().mockRejectedValue(new Error('Persistent failure'))
    };

    vi.spyOn(ticketEmailServiceModule, 'getTicketEmailService').mockReturnValue(mockEmailService);

    // Mock request/response
    const mockReq = {
      method: 'GET',
      headers: {}
    };

    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn()
    };

    // Run cron job
    await processEmailQueueHandler(mockReq, mockRes);

    // Verify email was marked as permanently failed
    const queueStatus = await db.execute({
      sql: `SELECT * FROM email_retry_queue WHERE transaction_id = ?`,
      args: [transactionId]
    });

    const email = queueStatus.rows[0];
    expect(email.status).toBe('failed');
    expect(email.attempt_count).toBe(5); // Max attempts reached
    expect(email.last_error).toContain('Persistent failure');
  });

  test('retry cron processes multiple emails in batch', async () => {
    // Create 5 test transactions and queue emails
    const transactionIds = [];

    for (let i = 0; i < 5; i++) {
      const transactionResult = await db.execute({
        sql: `
          INSERT INTO transactions
          (transaction_id, uuid, type, customer_email, customer_name, amount_cents, currency, status, order_data, is_test)
          VALUES (?, ?, 'tickets', ?, ?, ?, ?, ?, '{}', ?)
        `,
        args: [`trans_batch_${i}`, `trans_batch_${i}`, `batch-${i}@example.com`, `Batch ${i}`, 1000, 'usd', 'completed', 1]
      });

      transactionIds.push(transactionResult.lastInsertRowid);

      await db.execute({
        sql: `
          INSERT INTO email_retry_queue
          (transaction_id, email_address, email_type, next_retry_at, is_test)
          VALUES (?, ?, 'ticket_confirmation', datetime('now', '-1 minute'), ?)
        `,
        args: [transactionResult.lastInsertRowid, `batch-${i}@example.com`, 1]
      });
    }

    // Mock successful email sending
    const mockEmailService = {
      sendTicketConfirmation: vi.fn().mockResolvedValue(true)
    };

    vi.spyOn(ticketEmailServiceModule, 'getTicketEmailService').mockReturnValue(mockEmailService);

    // Mock request/response
    const mockReq = {
      method: 'GET',
      headers: {}
    };

    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn()
    };

    // Run cron job
    await processEmailQueueHandler(mockReq, mockRes);

    // Verify all 5 emails were processed
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        results: expect.objectContaining({
          processed: 5,
          succeeded: 5
        })
      })
    );

    // Verify all emails marked as sent
    const sentEmails = await db.execute({
      sql: `
        SELECT * FROM email_retry_queue
        WHERE transaction_id IN (?, ?, ?, ?, ?)
        AND is_test = 1
      `,
      args: transactionIds
    });

    expect(sentEmails.rows).toHaveLength(5);
    expect(sentEmails.rows.every(e => e.status === 'sent')).toBe(true);
  });

  test('retry cron skips emails not yet due for retry', async () => {
    // Create test transaction
    const transactionResult = await db.execute({
      sql: `
        INSERT INTO transactions
        (transaction_id, uuid, type, customer_email, customer_name, amount_cents, currency, status, order_data, is_test)
        VALUES (?, ?, 'tickets', ?, ?, ?, ?, ?, '{}', ?)
      `,
      args: ['trans_trans_future', 'trans_future', 'future@example.com', 'Future Retry', 4000, 'usd', 'completed', 1]
    });

    const transactionId = transactionResult.lastInsertRowid;

    // Add email with future retry time
    await db.execute({
      sql: `
        INSERT INTO email_retry_queue
        (transaction_id, email_address, email_type, next_retry_at, is_test)
        VALUES (?, ?, 'ticket_confirmation', datetime('now', '+10 minutes'), ?)
      `,
      args: [transactionId, 'future@example.com', 1]
    });

    // Mock email service
    const mockEmailService = {
      sendTicketConfirmation: vi.fn().mockResolvedValue(true)
    };

    vi.spyOn(ticketEmailServiceModule, 'getTicketEmailService').mockReturnValue(mockEmailService);

    // Mock request/response
    const mockReq = {
      method: 'GET',
      headers: {}
    };

    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn()
    };

    // Run cron job
    await processEmailQueueHandler(mockReq, mockRes);

    // Verify no emails were processed (future retry time)
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        processed: 0
      })
    );

    // Verify email still pending
    const queueStatus = await db.execute({
      sql: `SELECT * FROM email_retry_queue WHERE transaction_id = ?`,
      args: [transactionId]
    });

    expect(queueStatus.rows[0].status).toBe('pending');
    expect(queueStatus.rows[0].attempt_count).toBe(0); // Not incremented
  });

  test('retry cron handles authentication for manual triggers', async () => {
    // Mock request with invalid API key
    const mockReq = {
      method: 'POST',
      headers: {
        'x-internal-api-key': 'invalid-key'
      }
    };

    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn()
    };

    // Run cron job with invalid auth
    await processEmailQueueHandler(mockReq, mockRes);

    // Verify unauthorized response
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  test('retry cron returns empty result when no pending emails', async () => {
    // Ensure no pending emails in queue
    await db.execute({
      sql: 'DELETE FROM email_retry_queue WHERE is_test = 1',
      args: []
    });

    // Mock request/response
    const mockReq = {
      method: 'GET',
      headers: {}
    };

    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn()
    };

    // Run cron job
    await processEmailQueueHandler(mockReq, mockRes);

    // Verify empty result
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'No pending emails to process',
        processed: 0
      })
    );
  });

  test('retry cron achieves 99%+ delivery rate with retries', async () => {
    // Simulate 100 emails where first attempts fail, but retries succeed
    let attemptCounts = new Map();

    const mockEmailService = {
      sendTicketConfirmation: vi.fn().mockImplementation(async (transaction) => {
        const email = transaction.customer_email;
        const attempts = (attemptCounts.get(email) || 0) + 1;
        attemptCounts.set(email, attempts);

        // Fail first 2 attempts, succeed on 3rd
        if (attempts < 3) {
          throw new Error('Transient failure');
        }
        return true;
      })
    };

    vi.spyOn(ticketEmailServiceModule, 'getTicketEmailService').mockReturnValue(mockEmailService);

    // Create 100 test emails
    const transactionIds = [];
    for (let i = 0; i < 100; i++) {
      const transactionResult = await db.execute({
        sql: `
          INSERT INTO transactions
          (transaction_id, uuid, type, customer_email, customer_name, amount_cents, currency, status, order_data, is_test)
          VALUES (?, ?, 'tickets', ?, ?, ?, ?, ?, '{}', ?)
        `,
        args: [`trans_delivery_${i}`, `trans_delivery_${i}`, `delivery-${i}@example.com`, `Delivery ${i}`, 1000, 'usd', 'completed', 1]
      });

      transactionIds.push(transactionResult.lastInsertRowid);

      await db.execute({
        sql: `
          INSERT INTO email_retry_queue
          (transaction_id, email_address, email_type, next_retry_at, is_test)
          VALUES (?, ?, 'ticket_confirmation', datetime('now', '-1 minute'), ?)
        `,
        args: [transactionResult.lastInsertRowid, `delivery-${i}@example.com`, 1]
      });
    }

    // Mock request/response
    const mockReq = {
      method: 'GET',
      headers: {}
    };

    let mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn()
    };

    // Run cron job multiple times to process all 100 emails through retries
    // Since cron processes 10 emails per run, and emails need 3 attempts each:
    // - Retry round 1: 10 runs to process all 100 (all fail, attempt 1)
    // - Retry round 2: 10 runs to process all 100 (all fail, attempt 2)
    // - Retry round 3: 10 runs to process all 100 (all succeed, attempt 3)
    for (let retryRound = 0; retryRound < 3; retryRound++) {
      // Process all batches in this retry round
      for (let batch = 0; batch < 10; batch++) {
        await processEmailQueueHandler(mockReq, mockRes);

        // Reset mock for next iteration
        mockRes = {
          status: vi.fn().mockReturnThis(),
          json: vi.fn().mockReturnThis(),
          setHeader: vi.fn()
        };
      }

      // After each retry round, update next_retry_at for pending emails
      await db.execute({
        sql: `
          UPDATE email_retry_queue
          SET next_retry_at = datetime('now', '-1 minute')
          WHERE status = 'pending' AND is_test = 1
        `,
        args: []
      });
    }

    // Calculate delivery rate
    const sentEmails = await db.execute({
      sql: `
        SELECT COUNT(*) as count
        FROM email_retry_queue
        WHERE status = 'sent'
        AND transaction_id IN (${transactionIds.map(() => '?').join(',')})
        AND is_test = 1
      `,
      args: transactionIds
    });

    const deliveryRate = (sentEmails.rows[0].count / 100) * 100;

    // Should achieve 99%+ delivery rate
    expect(deliveryRate).toBeGreaterThanOrEqual(99);
  }, 30000); // 30 second timeout for large test
});

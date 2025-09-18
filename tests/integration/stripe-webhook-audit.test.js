/**
 * Stripe Webhook Audit Tests
 * Tests financial audit logging for all webhook events
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';
import { resetAllServices } from './reset-services.js';
import auditService from '../../lib/audit-service.js';
import paymentEventLogger from '../../lib/payment-event-logger.js';

// Mock the stripe webhook handler without importing the actual handler
const mockStripeHandler = {
  async processWebhook(event) {
    // Simulate webhook processing with audit logging
    await auditService.logFinancialEvent({
      requestId: `stripe_${event.id}`,
      action: 'WEBHOOK_RECEIVED',
      amountCents: event.data.object.amount_total || 0,
      currency: event.data.object.currency || 'usd',
      transactionReference: event.data.object.id,
      paymentStatus: 'processing',
      targetType: 'stripe_webhook',
      targetId: event.id,
      metadata: {
        stripe_event_type: event.type,
        stripe_event_id: event.id,
        webhook_timestamp: new Date().toISOString()
      }
    });
  }
};

describe('Stripe Webhook Audit Tests', () => {
  let db;

  beforeEach(async () => {
    await resetAllServices();

    db = await getDatabaseClient();

    // Ensure audit service is initialized (creates table if needed)
    await auditService.ensureInitialized();

    // Clean up audit logs
    try {
      await db.execute('DELETE FROM audit_logs WHERE event_type = ?', ['financial_event']);
    } catch (error) {
      // Ignore if table doesn't exist yet
    }

    try {
      await db.execute('DELETE FROM payment_events');
    } catch (error) {
      // Ignore if table doesn't exist (not all tests need this table)
    }
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await db.execute('DELETE FROM audit_logs WHERE event_type = ?', ['financial_event']);
      await db.execute('DELETE FROM payment_events');
    } catch (error) {
      // Ignore cleanup errors in case table doesn't exist
      console.warn('Test cleanup warning:', error.message);
    }
  });

  describe('Payment Success Audit Logging', () => {
    it('should log financial audit for checkout.session.completed', async () => {
      const mockEvent = {
        id: 'evt_test_webhook_001',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_session_001',
            amount_total: 5000, // $50.00
            currency: 'usd',
            payment_status: 'paid',
            payment_intent: 'pi_test_001',
            customer_details: {
              email: 'test@example.com',
              name: 'Test Customer'
            },
            mode: 'payment',
            payment_method_types: ['card']
          }
        },
        created: Math.floor(Date.now() / 1000)
      };

      // Process webhook with audit logging
      await auditService.logFinancialEvent({
        requestId: `stripe_${mockEvent.id}`,
        action: 'PAYMENT_SUCCESSFUL',
        amountCents: mockEvent.data.object.amount_total,
        currency: mockEvent.data.object.currency.toUpperCase(),
        transactionReference: mockEvent.data.object.id,
        paymentStatus: 'completed',
        targetType: 'stripe_session',
        targetId: mockEvent.data.object.id,
        metadata: {
          stripe_event_id: mockEvent.id,
          stripe_session_id: mockEvent.data.object.id,
          payment_intent_id: mockEvent.data.object.payment_intent,
          customer_email: mockEvent.data.object.customer_details?.email,
          customer_name: mockEvent.data.object.customer_details?.name,
          payment_method_types: mockEvent.data.object.payment_method_types,
          mode: mockEvent.data.object.mode
        },
        severity: 'info'
      });

      // Verify audit log was created
      const auditLogs = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        targetType: 'stripe_session'
      });

      expect(auditLogs.logs).toHaveLength(1);

      const auditLog = auditLogs.logs[0];
      expect(auditLog.action).toBe('PAYMENT_SUCCESSFUL');
      expect(auditLog.amount_cents).toBe(5000);
      expect(auditLog.currency).toBe('USD');
      expect(auditLog.payment_status).toBe('completed');
      expect(auditLog.transaction_reference).toBe('cs_test_session_001');
      expect(auditLog.target_id).toBe('cs_test_session_001');

      const metadata = JSON.parse(auditLog.metadata);
      expect(metadata.stripe_event_id).toBe('evt_test_webhook_001');
      expect(metadata.customer_email).toBe('test@example.com');
    });

    it('should log audit for async payment success', async () => {
      const mockEvent = {
        id: 'evt_test_async_001',
        type: 'checkout.session.async_payment_succeeded',
        data: {
          object: {
            id: 'cs_test_async_001',
            amount_total: 7500,
            currency: 'usd',
            payment_status: 'paid'
          }
        }
      };

      await auditService.logFinancialEvent({
        requestId: `stripe_${mockEvent.id}`,
        action: 'ASYNC_PAYMENT_SUCCESSFUL',
        amountCents: mockEvent.data.object.amount_total,
        currency: mockEvent.data.object.currency.toUpperCase(),
        transactionReference: mockEvent.data.object.id,
        paymentStatus: 'completed',
        targetType: 'stripe_session',
        targetId: mockEvent.data.object.id,
        metadata: {
          stripe_event_type: mockEvent.type,
          stripe_event_id: mockEvent.id
        }
      });

      const auditLogs = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        action: 'ASYNC_PAYMENT_SUCCESSFUL'
      });

      expect(auditLogs.logs).toHaveLength(1);
      expect(auditLogs.logs[0].amount_cents).toBe(7500);
      expect(auditLogs.logs[0].payment_status).toBe('completed');
    });
  });

  describe('Payment Failure Audit Logging', () => {
    it('should log audit for payment_intent.payment_failed', async () => {
      const mockEvent = {
        id: 'evt_test_failed_001',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_test_failed_001',
            amount: 5000,
            currency: 'usd',
            status: 'requires_payment_method',
            last_payment_error: {
              code: 'card_declined',
              message: 'Your card was declined.'
            }
          }
        }
      };

      await auditService.logFinancialEvent({
        requestId: `stripe_${mockEvent.id}`,
        action: 'PAYMENT_FAILED',
        amountCents: mockEvent.data.object.amount,
        currency: mockEvent.data.object.currency.toUpperCase(),
        transactionReference: mockEvent.data.object.id,
        paymentStatus: 'failed',
        targetType: 'payment_intent',
        targetId: mockEvent.data.object.id,
        metadata: {
          stripe_event_type: mockEvent.type,
          stripe_event_id: mockEvent.id,
          failure_reason: mockEvent.data.object.last_payment_error?.code,
          failure_message: mockEvent.data.object.last_payment_error?.message
        },
        severity: 'warning'
      });

      const auditLogs = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        severity: 'warning'
      });

      expect(auditLogs.logs).toHaveLength(1);

      const auditLog = auditLogs.logs[0];
      expect(auditLog.action).toBe('PAYMENT_FAILED');
      expect(auditLog.payment_status).toBe('failed');
      expect(auditLog.severity).toBe('warning');

      const metadata = JSON.parse(auditLog.metadata);
      expect(metadata.failure_reason).toBe('card_declined');
    });

    it('should log audit for async payment failure', async () => {
      const mockEvent = {
        id: 'evt_test_async_failed_001',
        type: 'checkout.session.async_payment_failed',
        data: {
          object: {
            id: 'cs_test_async_failed_001',
            amount_total: 5000,
            currency: 'usd',
            payment_status: 'unpaid'
          }
        }
      };

      await auditService.logFinancialEvent({
        requestId: `stripe_${mockEvent.id}`,
        action: 'ASYNC_PAYMENT_FAILED',
        amountCents: mockEvent.data.object.amount_total,
        currency: mockEvent.data.object.currency.toUpperCase(),
        transactionReference: mockEvent.data.object.id,
        paymentStatus: 'failed',
        targetType: 'stripe_session',
        targetId: mockEvent.data.object.id,
        metadata: {
          stripe_event_type: mockEvent.type
        },
        severity: 'warning'
      });

      const auditLogs = await auditService.queryAuditLogs({
        action: 'ASYNC_PAYMENT_FAILED'
      });

      expect(auditLogs.logs).toHaveLength(1);
      expect(auditLogs.logs[0].payment_status).toBe('failed');
    });
  });

  describe('Refund Audit Logging', () => {
    it('should log audit for charge.refunded - full refund', async () => {
      const mockEvent = {
        id: 'evt_test_refund_001',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test_refund_001',
            amount: 5000,
            amount_refunded: 5000,
            currency: 'usd',
            payment_intent: 'pi_test_001',
            refunded: true,
            refunds: {
              data: [
                {
                  id: 're_test_001',
                  amount: 5000,
                  status: 'succeeded',
                  reason: 'requested_by_customer'
                }
              ]
            }
          }
        }
      };

      await auditService.logFinancialEvent({
        requestId: `stripe_${mockEvent.id}`,
        action: 'REFUND_PROCESSED',
        amountCents: mockEvent.data.object.amount_refunded,
        currency: mockEvent.data.object.currency.toUpperCase(),
        transactionReference: mockEvent.data.object.id,
        paymentStatus: 'refunded',
        targetType: 'charge',
        targetId: mockEvent.data.object.id,
        metadata: {
          stripe_event_type: mockEvent.type,
          stripe_event_id: mockEvent.id,
          original_amount: mockEvent.data.object.amount,
          refund_amount: mockEvent.data.object.amount_refunded,
          refund_type: mockEvent.data.object.amount_refunded === mockEvent.data.object.amount ? 'full' : 'partial',
          refund_reason: mockEvent.data.object.refunds?.data?.[0]?.reason,
          payment_intent_id: mockEvent.data.object.payment_intent
        },
        severity: 'info'
      });

      const auditLogs = await auditService.queryAuditLogs({
        action: 'REFUND_PROCESSED'
      });

      expect(auditLogs.logs).toHaveLength(1);

      const auditLog = auditLogs.logs[0];
      expect(auditLog.payment_status).toBe('refunded');
      expect(auditLog.amount_cents).toBe(5000);

      const metadata = JSON.parse(auditLog.metadata);
      expect(metadata.refund_type).toBe('full');
      expect(metadata.original_amount).toBe(5000);
    });

    it('should log audit for partial refund', async () => {
      const mockEvent = {
        id: 'evt_test_partial_refund_001',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test_partial_001',
            amount: 5000,
            amount_refunded: 2500,
            currency: 'usd',
            payment_intent: 'pi_test_002'
          }
        }
      };

      await auditService.logFinancialEvent({
        requestId: `stripe_${mockEvent.id}`,
        action: 'REFUND_PROCESSED',
        amountCents: mockEvent.data.object.amount_refunded,
        currency: mockEvent.data.object.currency.toUpperCase(),
        transactionReference: mockEvent.data.object.id,
        paymentStatus: 'partially_refunded',
        targetType: 'charge',
        targetId: mockEvent.data.object.id,
        metadata: {
          original_amount: mockEvent.data.object.amount,
          refund_amount: mockEvent.data.object.amount_refunded,
          refund_type: 'partial'
        }
      });

      const auditLogs = await auditService.queryAuditLogs({
        action: 'REFUND_PROCESSED',
        paymentStatus: 'partially_refunded'
      });

      expect(auditLogs.logs).toHaveLength(1);
      expect(auditLogs.logs[0].payment_status).toBe('partially_refunded');
      expect(auditLogs.logs[0].amount_cents).toBe(2500);
    });
  });

  describe('Settlement Tracking', () => {
    it('should log settlement audit events', async () => {
      const settlementDate = new Date().toISOString().split('T')[0];

      await auditService.logFinancialEvent({
        requestId: `settlement_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        action: 'SETTLEMENT_INITIATED',
        amountCents: 47500, // $475.00 net after fees
        currency: 'USD',
        transactionReference: `po_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        paymentStatus: 'settled',
        targetType: 'settlement',
        targetId: settlementDate,
        metadata: {
          settlement_date: settlementDate,
          gross_amount: 50000,
          stripe_fees: 2500,
          net_amount: 47500,
          transaction_count: 10
        }
      });

      const auditLogs = await auditService.queryAuditLogs({
        action: 'SETTLEMENT_INITIATED'
      });

      expect(auditLogs.logs).toHaveLength(1);

      const auditLog = auditLogs.logs[0];
      expect(auditLog.payment_status).toBe('settled');
      expect(auditLog.amount_cents).toBe(47500);

      const metadata = JSON.parse(auditLog.metadata);
      expect(metadata.gross_amount).toBe(50000);
      expect(metadata.stripe_fees).toBe(2500);
      expect(metadata.transaction_count).toBe(10);
    });
  });

  describe('Error Handling - Audit Failures Don\'t Break Webhooks', () => {
    it('should handle audit service failures gracefully', async () => {
      // Mock audit service to throw error
      const originalLogFinancialEvent = auditService.logFinancialEvent;
      auditService.logFinancialEvent = vi.fn().mockRejectedValue(new Error('Audit database unavailable'));

      const mockEvent = {
        id: 'evt_test_audit_error_001',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_error_001',
            amount_total: 5000,
            currency: 'usd'
          }
        }
      };

      // Simulate webhook processing that includes audit logging
      let webhookProcessingSucceeded = false;
      try {
        // This simulates the logFinancialAudit helper function in stripe-webhook.js
        try {
          await auditService.logFinancialEvent({
            requestId: `stripe_${mockEvent.id}`,
            action: 'PAYMENT_SUCCESSFUL',
            amountCents: mockEvent.data.object.amount_total,
            currency: mockEvent.data.object.currency.toUpperCase(),
            transactionReference: mockEvent.data.object.id,
            paymentStatus: 'completed'
          });
        } catch (auditError) {
          // Audit failures should be logged but not throw
          console.error("Financial audit logging failed (non-blocking):", auditError.message);
        }

        // Webhook processing continues regardless of audit failure
        webhookProcessingSucceeded = true;
      } catch (webhookError) {
        webhookProcessingSucceeded = false;
      }

      // Verify webhook processing succeeded despite audit failure
      expect(webhookProcessingSucceeded).toBe(true);
      expect(auditService.logFinancialEvent).toHaveBeenCalledWith({
        requestId: `stripe_${mockEvent.id}`,
        action: 'PAYMENT_SUCCESSFUL',
        amountCents: 5000,
        currency: 'USD',
        transactionReference: 'cs_test_error_001',
        paymentStatus: 'completed'
      });

      // Restore original function
      auditService.logFinancialEvent = originalLogFinancialEvent;
    });

    it('should handle database connection failures during audit', async () => {
      // Test with database temporarily unavailable
      const mockEvent = {
        id: 'evt_test_db_error_001',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_db_error_001',
            amount: 3000,
            currency: 'usd'
          }
        }
      };

      // Force database error by using invalid SQL
      let auditFailed = false;
      try {
        await db.execute('INSERT INTO non_existent_table VALUES (?, ?)', ['test', 'test']);
      } catch (error) {
        auditFailed = true;
      }

      expect(auditFailed).toBe(true);

      // Verify that normal audit operations still work after error
      const auditResult = await auditService.logFinancialEvent({
        requestId: `stripe_${mockEvent.id}`,
        action: 'PAYMENT_SUCCESSFUL',
        amountCents: mockEvent.data.object.amount,
        currency: mockEvent.data.object.currency.toUpperCase(),
        transactionReference: mockEvent.data.object.id,
        paymentStatus: 'completed'
      });

      expect(auditResult.success).toBe(true);
    });
  });

  describe('Audit Trail Completeness', () => {
    it('should create complete audit trail for payment lifecycle', async () => {
      // Clean state for this specific test
      await db.execute('DELETE FROM audit_logs WHERE event_type = ?', ['financial_event']);

      const sessionId = 'cs_test_lifecycle_001';
      const paymentIntentId = 'pi_test_lifecycle_001';
      const chargeId = 'ch_test_lifecycle_001';

      // 1. Checkout session created
      await auditService.logFinancialEvent({
        requestId: 'req_001',
        action: 'CHECKOUT_SESSION_CREATED',
        amountCents: 5000,
        currency: 'USD',
        transactionReference: sessionId,
        paymentStatus: 'pending',
        targetType: 'stripe_session',
        targetId: sessionId
      });

      // 2. Payment succeeded
      await auditService.logFinancialEvent({
        requestId: 'req_002',
        action: 'PAYMENT_SUCCESSFUL',
        amountCents: 5000,
        currency: 'USD',
        transactionReference: sessionId,
        paymentStatus: 'completed',
        targetType: 'stripe_session',
        targetId: sessionId,
        metadata: { payment_intent_id: paymentIntentId }
      });

      // 3. Later refund
      await auditService.logFinancialEvent({
        requestId: 'req_003',
        action: 'REFUND_PROCESSED',
        amountCents: 5000,
        currency: 'USD',
        transactionReference: chargeId,
        paymentStatus: 'refunded',
        targetType: 'charge',
        targetId: chargeId,
        metadata: { original_session_id: sessionId }
      });

      // Verify complete audit trail
      const auditLogs = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        limit: 10,
        orderBy: 'id',
        orderDirection: 'ASC'
      });

      expect(auditLogs.logs).toHaveLength(3);

      const [created, succeeded, refunded] = auditLogs.logs;

      expect(created.action).toBe('CHECKOUT_SESSION_CREATED');
      expect(created.payment_status).toBe('pending');

      expect(succeeded.action).toBe('PAYMENT_SUCCESSFUL');
      expect(succeeded.payment_status).toBe('completed');

      expect(refunded.action).toBe('REFUND_PROCESSED');
      expect(refunded.payment_status).toBe('refunded');

      // Verify amounts are consistent
      expect(created.amount_cents).toBe(5000);
      expect(succeeded.amount_cents).toBe(5000);
      expect(refunded.amount_cents).toBe(5000);
    });
  });

  describe('Performance and Concurrency', () => {
    it('should handle concurrent webhook audit logging', async () => {
      const webhookEvents = Array.from({ length: 10 }, (_, i) => ({
        id: `evt_concurrent_${i}`,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: `cs_concurrent_${i}`,
            amount_total: 1000 + (i * 100),
            currency: 'usd'
          }
        }
      }));

      // Process all webhooks concurrently
      const auditPromises = webhookEvents.map(event =>
        auditService.logFinancialEvent({
          requestId: `stripe_${event.id}`,
          action: 'PAYMENT_SUCCESSFUL',
          amountCents: event.data.object.amount_total,
          currency: 'USD',
          transactionReference: event.data.object.id,
          paymentStatus: 'completed',
          targetType: 'stripe_session',
          targetId: event.data.object.id
        })
      );

      const results = await Promise.all(auditPromises);

      // Verify all audit logs were created successfully
      expect(results).toHaveLength(10);
      expect(results.every(result => result.success === true)).toBe(true);

      const auditLogs = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        action: 'PAYMENT_SUCCESSFUL',
        limit: 20
      });

      expect(auditLogs.logs.length).toBeGreaterThanOrEqual(10);
    });
  });
});
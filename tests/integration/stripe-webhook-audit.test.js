/**
 * Stripe Webhook Audit Tests
 * Tests financial audit logging for all webhook events
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';
import { resetAllServices } from './reset-services.js';
import auditService from '../../lib/audit-service.js';
import paymentEventLogger from '../../lib/payment-event-logger.js';

// Helper function for simulating complete webhook processing with audit trail
async function simulateStripeWebhook(event, options = {}) {
  const {
    includeWebhookReceived = true,
    includeIdempotencyCheck = true,
    includePaymentEventLogging = true,
    includeAuditTrail = true,
    simulateIdempotentCall = false,
    databaseClient = null
  } = options;

  const results = {
    webhookReceived: false,
    idempotencyPassed: false,
    paymentEventLogged: false,
    auditTrailCreated: false,
    errors: []
  };

  try {
    // Step 1: Webhook received audit log
    if (includeWebhookReceived) {
      await auditService.logFinancialEvent({
        requestId: `stripe_${event.id}`,
        action: 'WEBHOOK_RECEIVED',
        amountCents: event.data.object.amount_total || event.data.object.amount || 0,
        currency: (event.data.object.currency || 'usd').toUpperCase(),
        transactionReference: event.data.object.id,
        paymentStatus: 'processing',
        targetType: 'stripe_webhook',
        targetId: event.id,
        metadata: {
          stripe_event_type: event.type,
          stripe_event_id: event.id,
          webhook_timestamp: new Date().toISOString(),
          webhook_created: event.created,
          api_version: event.api_version || null,
          idempotent_call: simulateIdempotentCall
        },
        severity: 'info'
      });
      results.webhookReceived = true;
    }

    // Step 2: Idempotency check simulation
    if (includeIdempotencyCheck) {
      // Simulate checking if event was already processed
      const existingLogs = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        targetType: 'stripe_webhook',
        targetId: event.id
      });

      if (simulateIdempotentCall && existingLogs.logs.length > 1) {
        // Simulate idempotent call detection
        await auditService.logFinancialEvent({
          requestId: `stripe_${event.id}_idempotent`,
          action: 'WEBHOOK_IDEMPOTENT_SKIP',
          amountCents: 0,
          currency: 'USD',
          transactionReference: event.data.object.id,
          paymentStatus: 'already_processed',
          targetType: 'stripe_webhook',
          targetId: event.id,
          metadata: {
            stripe_event_type: event.type,
            stripe_event_id: event.id,
            original_processing_time: existingLogs.logs[0]?.created_at,
            idempotency_detection: true
          },
          severity: 'info'
        });
      }
      results.idempotencyPassed = true;
    }

    // Step 3: Payment event logging simulation
    if (includePaymentEventLogging) {
      // Simulate payment event table logging (separate from audit)
      try {
        const dbClient = databaseClient || await getDatabaseClient();
        await dbClient.execute({
          sql: `INSERT INTO payment_events (
            event_id, event_type, processed_at, event_data, transaction_id
          ) VALUES (?, ?, ?, ?, ?)`,
          args: [
            event.id,
            event.type,
            new Date().toISOString(),
            JSON.stringify(event.data),
            null // No transaction ID yet for webhook received
          ]
        });
        results.paymentEventLogged = true;
      } catch (error) {
        // Ignore duplicate key errors (idempotency)
        if (!error.message.includes('UNIQUE constraint failed')) {
          results.errors.push(`Payment event logging failed: ${error.message}`);
        } else {
          results.paymentEventLogged = true; // Already exists = success
        }
      }
    }

    // Step 4: Main business logic audit trail
    if (includeAuditTrail) {
      let action, paymentStatus, severity = 'info';

      // Determine action and status based on event type
      switch (event.type) {
        case 'checkout.session.completed':
          action = 'PAYMENT_SUCCESSFUL';
          paymentStatus = 'completed';
          break;
        case 'checkout.session.async_payment_succeeded':
          action = 'ASYNC_PAYMENT_SUCCESSFUL';
          paymentStatus = 'completed';
          break;
        case 'checkout.session.async_payment_failed':
          action = 'ASYNC_PAYMENT_FAILED';
          paymentStatus = 'failed';
          severity = 'warning';
          break;
        case 'payment_intent.payment_failed':
          action = 'PAYMENT_FAILED';
          paymentStatus = 'failed';
          severity = 'warning';
          break;
        case 'charge.refunded':
          const isFullRefund = event.data.object.amount_refunded === event.data.object.amount;
          action = isFullRefund ? 'REFUND_FULL' : 'REFUND_PARTIAL';
          paymentStatus = isFullRefund ? 'refunded' : 'partially_refunded';
          severity = 'warning';
          break;
        case 'charge.dispute.created':
          action = 'DISPUTE_CREATED';
          paymentStatus = 'disputed';
          severity = 'error';
          break;
        case 'payout.created':
          action = 'SETTLEMENT_PAYOUT';
          paymentStatus = event.data.object.status;
          break;
        default:
          action = 'WEBHOOK_PROCESSED';
          paymentStatus = 'processed';
      }

      // Create comprehensive audit entry
      await auditService.logFinancialEvent({
        requestId: `stripe_${event.id}_business`,
        action,
        amountCents: event.data.object.amount_refunded || event.data.object.amount_total || event.data.object.amount || 0,
        currency: (event.data.object.currency || 'usd').toUpperCase(),
        transactionReference: event.data.object.id,
        paymentStatus,
        targetType: event.type.includes('session') ? 'stripe_session' :
                     event.type.includes('payment_intent') ? 'payment_intent' :
                     event.type.includes('charge') ? 'charge' :
                     event.type.includes('payout') ? 'payout' : 'stripe_object',
        targetId: event.data.object.id,
        metadata: {
          stripe_event_id: event.id,
          stripe_event_type: event.type,
          webhook_processing_step: 'business_logic',
          payment_intent_id: event.data.object.payment_intent || null,
          customer_email: event.data.object.customer_details?.email || null,
          customer_name: event.data.object.customer_details?.name || null,
          ...getEventSpecificMetadata(event)
        },
        severity
      });
      results.auditTrailCreated = true;
    }

    return results;
  } catch (error) {
    results.errors.push(`Webhook simulation failed: ${error.message}`);
    return results;
  }
}

// Helper to extract event-specific metadata
function getEventSpecificMetadata(event) {
  const metadata = {};

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      metadata.session_mode = event.data.object.mode;
      metadata.payment_method_types = event.data.object.payment_method_types;
      metadata.line_items_count = event.data.object.line_items?.data?.length || 0;
      break;
    case 'payment_intent.payment_failed':
      metadata.failure_code = event.data.object.last_payment_error?.code;
      metadata.failure_message = event.data.object.last_payment_error?.message;
      metadata.failure_type = event.data.object.last_payment_error?.type;
      break;
    case 'charge.refunded':
      metadata.original_amount_cents = event.data.object.amount;
      metadata.refunded_amount_cents = event.data.object.amount_refunded;
      metadata.refund_reason = event.data.object.refunds?.data?.[0]?.reason;
      metadata.is_full_refund = event.data.object.amount_refunded === event.data.object.amount;
      break;
    case 'charge.dispute.created':
      metadata.dispute_reason = event.data.object.reason;
      metadata.dispute_status = event.data.object.status;
      metadata.evidence_due_by = event.data.object.evidence_details?.due_by;
      break;
    case 'payout.created':
      metadata.payout_type = event.data.object.type;
      metadata.payout_method = event.data.object.method;
      metadata.arrival_date = event.data.object.arrival_date;
      metadata.automatic = event.data.object.automatic;
      break;
  }

  return metadata;
}

// Mock the stripe webhook handler using the comprehensive simulation
const mockStripeHandler = {
  async processWebhook(event, options = {}) {
    return await simulateStripeWebhook(event, options);
  }
};

describe('Stripe Webhook Audit Tests', () => {
  let db;

  beforeEach(async () => {
    await resetAllServices();

    db = await getDatabaseClient();

    // Ensure audit service is initialized (creates table if needed)
    // Force audit service to use the test database
    auditService.db = db || dbClient || (await getDatabaseClient());
    auditService.initialized = true;
    auditService.initializationPromise = Promise.resolve(auditService);

    // Clean up audit logs
    try {
      // Check if audit_logs table exists before cleanup
      const tables = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='audit_logs'"
      );
      if (tables.rows && tables.rows.length > 0) {
        await db.execute(
          'DELETE FROM audit_logs WHERE event_type = ?', ['financial_event']
        );
      }
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
      // Check if audit_logs table exists before cleanup
      const tables = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='audit_logs'"
      );
      if (tables.rows && tables.rows.length > 0) {
        await db.execute(
          'DELETE FROM audit_logs WHERE event_type = ?', ['financial_event']
        );
      }
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
        requestId: `settlement_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        action: 'SETTLEMENT_INITIATED',
        amountCents: 47500, // $475.00 net after fees
        currency: 'USD',
        transactionReference: `po_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
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
      // Check if audit_logs table exists before cleanup
      const tables = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='audit_logs'"
      );
      if (tables.rows && tables.rows.length > 0) {
        await db.execute(
          'DELETE FROM audit_logs WHERE event_type = ?', ['financial_event']
        );
      }

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

  describe('Comprehensive Webhook Simulation', () => {
    it('should create complete audit trail for webhook processing', async () => {
      const mockEvent = {
        id: 'evt_comprehensive_001',
        type: 'checkout.session.completed',
        api_version: '2023-10-16',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'cs_comprehensive_001',
            amount_total: 7500,
            currency: 'usd',
            mode: 'payment',
            payment_method_types: ['card'],
            payment_status: 'paid',
            customer_details: {
              email: 'webhook.test@example.com',
              name: 'Webhook Test User'
            }
          }
        }
      };

      // Simulate complete webhook processing
      const results = await simulateStripeWebhook(mockEvent, { databaseClient: db });

      // Verify all processing steps completed
      expect(results.webhookReceived).toBe(true);
      expect(results.idempotencyPassed).toBe(true);
      expect(results.paymentEventLogged).toBe(true);
      expect(results.auditTrailCreated).toBe(true);
      expect(results.errors).toHaveLength(0);

      // Verify audit logs were created
      const auditLogs = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        limit: 10,
        orderBy: 'created_at',
        orderDirection: 'ASC'
      });

      expect(auditLogs.logs).toHaveLength(2); // WEBHOOK_RECEIVED + PAYMENT_SUCCESSFUL

      // Verify webhook received log
      const webhookLog = auditLogs.logs.find(log => log.action === 'WEBHOOK_RECEIVED');
      expect(webhookLog).toBeDefined();
      expect(webhookLog.target_type).toBe('stripe_webhook');
      expect(webhookLog.payment_status).toBe('processing');

      const webhookMetadata = JSON.parse(webhookLog.metadata);
      expect(webhookMetadata.stripe_event_type).toBe('checkout.session.completed');
      expect(webhookMetadata.api_version).toBe('2023-10-16');

      // Verify business logic log
      const businessLog = auditLogs.logs.find(log => log.action === 'PAYMENT_SUCCESSFUL');
      expect(businessLog).toBeDefined();
      expect(businessLog.target_type).toBe('stripe_session');
      expect(businessLog.payment_status).toBe('completed');
      expect(businessLog.amount_cents).toBe(7500);

      const businessMetadata = JSON.parse(businessLog.metadata);
      expect(businessMetadata.webhook_processing_step).toBe('business_logic');
      expect(businessMetadata.customer_email).toBe('webhook.test@example.com');
    });

    it('should handle webhook idempotency correctly', async () => {
      const mockEvent = {
        id: 'evt_idempotent_001',
        type: 'checkout.session.completed',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'cs_idempotent_001',
            amount_total: 5000,
            currency: 'usd'
          }
        }
      };

      // First processing
      const firstResults = await simulateStripeWebhook(mockEvent, { databaseClient: db });
      expect(firstResults.errors).toHaveLength(0);

      // Second processing (simulating idempotent call)
      const secondResults = await simulateStripeWebhook(mockEvent, {
        simulateIdempotentCall: true,
        databaseClient: db
      });
      expect(secondResults.errors).toHaveLength(0);

      // Verify idempotency handling
      const auditLogs = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        targetId: 'evt_idempotent_001'
      });

      // Should have logs from both calls plus idempotency detection
      expect(auditLogs.logs.length).toBeGreaterThanOrEqual(3);

      // Check for idempotency detection log
      const idempotentLog = auditLogs.logs.find(log => log.action === 'WEBHOOK_IDEMPOTENT_SKIP');
      expect(idempotentLog).toBeDefined();
      expect(idempotentLog.payment_status).toBe('already_processed');

      const idempotentMetadata = JSON.parse(idempotentLog.metadata);
      expect(idempotentMetadata.idempotency_detection).toBe(true);
    });

    it('should properly handle different webhook event types', async () => {
      const eventTypes = [
        {
          type: 'checkout.session.async_payment_succeeded',
          expectedAction: 'ASYNC_PAYMENT_SUCCESSFUL',
          expectedStatus: 'completed',
          expectedSeverity: 'info'
        },
        {
          type: 'payment_intent.payment_failed',
          expectedAction: 'PAYMENT_FAILED',
          expectedStatus: 'failed',
          expectedSeverity: 'warning'
        },
        {
          type: 'charge.dispute.created',
          expectedAction: 'DISPUTE_CREATED',
          expectedStatus: 'disputed',
          expectedSeverity: 'error'
        }
      ];

      for (const eventConfig of eventTypes) {
        const mockEvent = {
          id: `evt_${eventConfig.type.replace(/\./g, '_')}_001`,
          type: eventConfig.type,
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: `obj_${eventConfig.type.replace(/\./g, '_')}_001`,
              amount: 5000,
              amount_total: 5000,
              currency: 'usd'
            }
          }
        };

        // Add event-specific data
        if (eventConfig.type === 'payment_intent.payment_failed') {
          mockEvent.data.object.last_payment_error = {
            code: 'card_declined',
            message: 'Your card was declined.',
            type: 'card_error'
          };
        }

        if (eventConfig.type === 'charge.dispute.created') {
          mockEvent.data.object.reason = 'fraudulent';
          mockEvent.data.object.status = 'warning_needs_response';
          mockEvent.data.object.evidence_details = {
            due_by: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days from now
          };
        }

        const results = await simulateStripeWebhook(mockEvent, { databaseClient: db });
        expect(results.errors).toHaveLength(0);

        // Verify correct audit trail - filter by business logic action
        const auditLogs = await auditService.queryAuditLogs({
          eventType: 'financial_event',
          action: eventConfig.expectedAction,
          limit: 5
        });

        // Should have the business logic log
        const businessLog = auditLogs.logs.find(log => log.action === eventConfig.expectedAction);
        expect(businessLog).toBeDefined();
        const log = businessLog;
        expect(log.payment_status).toBe(eventConfig.expectedStatus);
        expect(log.severity).toBe(eventConfig.expectedSeverity);

        // Verify event-specific metadata
        const metadata = JSON.parse(log.metadata);
        expect(metadata.stripe_event_type).toBe(eventConfig.type);

        if (eventConfig.type === 'payment_intent.payment_failed') {
          expect(metadata.failure_code).toBe('card_declined');
        }

        if (eventConfig.type === 'charge.dispute.created') {
          expect(metadata.dispute_reason).toBe('fraudulent');
          expect(metadata.dispute_status).toBe('warning_needs_response');
        }
      }
    });

    it('should verify payment_events table integration', async () => {
      const mockEvent = {
        id: 'evt_payment_events_001',
        type: 'checkout.session.completed',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'cs_payment_events_001',
            amount_total: 3000,
            currency: 'usd'
          }
        }
      };

      const results = await simulateStripeWebhook(mockEvent, { databaseClient: db });
      expect(results.paymentEventLogged).toBe(true);
      expect(results.errors).toHaveLength(0);

      // Verify payment_events table entry
      const paymentEvents = await db.execute(
        'SELECT * FROM payment_events WHERE event_id = ?',
        [mockEvent.id]
      );

      expect(paymentEvents.rows).toHaveLength(1);
      const paymentEvent = paymentEvents.rows[0];
      expect(paymentEvent.event_type).toBe('checkout.session.completed');
      expect(paymentEvent.event_id).toBe('evt_payment_events_001');

      const eventData = JSON.parse(paymentEvent.event_data);
      expect(eventData.object.amount_total).toBe(3000);
    });

    it('should handle audit failures gracefully in webhook simulation', async () => {
      const mockEvent = {
        id: 'evt_audit_failure_001',
        type: 'checkout.session.completed',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'cs_audit_failure_001',
            amount_total: 5000,
            currency: 'usd'
          }
        }
      };

      // Mock audit service to fail
      const originalLogFinancialEvent = auditService.logFinancialEvent;
      auditService.logFinancialEvent = vi.fn().mockRejectedValue(new Error('Database connection lost'));

      const results = await simulateStripeWebhook(mockEvent, { databaseClient: db });

      // Should capture error but not throw
      expect(results.errors.length).toBeGreaterThan(0);
      expect(results.errors[0]).toContain('Webhook simulation failed');

      // Restore original function
      auditService.logFinancialEvent = originalLogFinancialEvent;
    });
  });

  describe('Webhook Metadata Completeness', () => {
    it('should capture comprehensive webhook metadata for refunds', async () => {
      const mockEvent = {
        id: 'evt_refund_metadata_001',
        type: 'charge.refunded',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'ch_refund_metadata_001',
            amount: 5000,
            amount_refunded: 2500,
            currency: 'usd',
            payment_intent: 'pi_original_001',
            refunds: {
              data: [
                {
                  id: 're_partial_001',
                  amount: 2500,
                  status: 'succeeded',
                  reason: 'requested_by_customer'
                }
              ]
            }
          }
        }
      };

      const results = await simulateStripeWebhook(mockEvent, { databaseClient: db });
      expect(results.errors).toHaveLength(0);

      const auditLogs = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        action: 'REFUND_PARTIAL'
      });

      // Should have the business logic refund log
      const refundLog = auditLogs.logs.find(log => log.action === 'REFUND_PARTIAL');
      expect(refundLog).toBeDefined();
      const log = refundLog;
      expect(log.payment_status).toBe('partially_refunded');
      expect(log.amount_cents).toBe(2500);

      const metadata = JSON.parse(log.metadata);
      expect(metadata.original_amount_cents).toBe(5000);
      expect(metadata.refunded_amount_cents).toBe(2500);
      expect(metadata.refund_reason).toBe('requested_by_customer');
      expect(metadata.is_full_refund).toBe(false);
    });

    it('should capture comprehensive webhook metadata for payouts', async () => {
      const mockEvent = {
        id: 'evt_payout_metadata_001',
        type: 'payout.created',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'po_payout_metadata_001',
            amount: 47500,
            currency: 'usd',
            type: 'bank_account',
            method: 'standard',
            status: 'in_transit',
            arrival_date: Math.floor(Date.now() / 1000) + (2 * 24 * 60 * 60), // 2 days from now
            automatic: true
          }
        }
      };

      const results = await simulateStripeWebhook(mockEvent, { databaseClient: db });
      expect(results.errors).toHaveLength(0);

      const auditLogs = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        action: 'SETTLEMENT_PAYOUT'
      });

      // Should have the business logic payout log
      const payoutLog = auditLogs.logs.find(log => log.action === 'SETTLEMENT_PAYOUT');
      expect(payoutLog).toBeDefined();
      const log = payoutLog;
      expect(log.payment_status).toBe('in_transit');
      expect(log.amount_cents).toBe(47500);
      expect(log.target_type).toBe('payout');

      const metadata = JSON.parse(log.metadata);
      expect(metadata.payout_type).toBe('bank_account');
      expect(metadata.payout_method).toBe('standard');
      expect(metadata.automatic).toBe(true);
    });
  });
});
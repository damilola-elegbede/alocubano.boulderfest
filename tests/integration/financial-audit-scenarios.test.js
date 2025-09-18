/**
 * Financial Audit Scenarios Tests
 * Tests complete payment lifecycle audit trails, complex refund scenarios,
 * dispute handling, multi-currency support, and edge cases
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';
import { resetAllServices } from './reset-services.js';
import auditService from '../../lib/audit-service.js';

// Mock advanced scenario testing utilities
class FinancialAuditScenarioTester {
  constructor() {
    this.db = null;
    this.initialized = false;
    this.scenarioResults = [];
  }

  async ensureInitialized() {
    if (!this.initialized) {
      this.db = await getDatabaseClient();
      this.initialized = true;
    }
    return this;
  }

  /**
   * Simulate complete payment lifecycle with comprehensive audit logging
   */
  async simulatePaymentLifecycle(scenario) {
    await this.ensureInitialized();

    const {
      sessionId,
      customerId,
      amountCents,
      currency = 'USD',
      includeRefund = false,
      includeDispute = false,
      includePartialRefund = false,
      paymentMethodTypes = ['card'],
      customerEmail = 'test@example.com',
      customerName = 'Test Customer'
    } = scenario;

    const auditEvents = [];
    const startTime = Date.now();

    try {
      // 1. Checkout Session Created
      const sessionCreatedEvent = await auditService.logFinancialEvent({
        requestId: `session_${sessionId}`,
        action: 'CHECKOUT_SESSION_CREATED',
        amountCents: amountCents,
        currency: currency,
        transactionReference: sessionId,
        paymentStatus: 'pending',
        targetType: 'stripe_session',
        targetId: sessionId,
        metadata: {
          customer_id: customerId,
          customer_email: customerEmail,
          customer_name: customerName,
          payment_method_types: paymentMethodTypes,
          amount_total: amountCents,
          mode: 'payment',
          created_timestamp: Date.now()
        },
        severity: 'info'
      });

      auditEvents.push({ event: 'session_created', result: sessionCreatedEvent });

      // 2. Payment Intent Created
      const paymentIntentId = `pi_${sessionId.replace('cs_', '')}`;
      const intentCreatedEvent = await auditService.logFinancialEvent({
        requestId: `intent_${paymentIntentId}`,
        action: 'PAYMENT_INTENT_CREATED',
        amountCents: amountCents,
        currency: currency,
        transactionReference: paymentIntentId,
        paymentStatus: 'requires_payment_method',
        targetType: 'payment_intent',
        targetId: paymentIntentId,
        metadata: {
          session_id: sessionId,
          customer_id: customerId,
          confirmation_method: 'automatic',
          setup_future_usage: null
        },
        severity: 'info'
      });

      auditEvents.push({ event: 'intent_created', result: intentCreatedEvent });

      // 3. Payment Successful
      const chargeId = `ch_${sessionId.replace('cs_', '')}`;
      const paymentSuccessEvent = await auditService.logFinancialEvent({
        requestId: `payment_${sessionId}`,
        action: 'PAYMENT_SUCCESSFUL',
        amountCents: amountCents,
        currency: currency,
        transactionReference: sessionId,
        paymentStatus: 'completed',
        targetType: 'stripe_session',
        targetId: sessionId,
        metadata: {
          payment_intent_id: paymentIntentId,
          charge_id: chargeId,
          customer_email: customerEmail,
          customer_name: customerName,
          payment_method_types: paymentMethodTypes,
          stripe_fees_cents: Math.round(amountCents * 0.029) + 30,
          net_amount_cents: amountCents - (Math.round(amountCents * 0.029) + 30)
        },
        severity: 'info'
      });

      auditEvents.push({ event: 'payment_successful', result: paymentSuccessEvent });

      // 4. Conditional: Partial Refund
      if (includePartialRefund) {
        const partialRefundAmount = Math.floor(amountCents * 0.3); // 30% refund
        const partialRefundEvent = await auditService.logFinancialEvent({
          requestId: `partial_refund_${chargeId}`,
          action: 'REFUND_PARTIAL',
          amountCents: partialRefundAmount,
          currency: currency,
          transactionReference: chargeId,
          paymentStatus: 'partially_refunded',
          targetType: 'charge',
          targetId: chargeId,
          metadata: {
            original_charge_id: chargeId,
            original_amount_cents: amountCents,
            refund_amount_cents: partialRefundAmount,
            refund_reason: 'requested_by_customer',
            refund_id: `re_partial_${chargeId.replace('ch_', '')}`,
            remaining_amount_cents: amountCents - partialRefundAmount
          },
          severity: 'warning'
        });

        auditEvents.push({ event: 'partial_refund', result: partialRefundEvent });
      }

      // 5. Conditional: Full Refund
      if (includeRefund && !includePartialRefund) {
        const refundEvent = await auditService.logFinancialEvent({
          requestId: `refund_${chargeId}`,
          action: 'REFUND_FULL',
          amountCents: amountCents,
          currency: currency,
          transactionReference: chargeId,
          paymentStatus: 'refunded',
          targetType: 'charge',
          targetId: chargeId,
          metadata: {
            original_charge_id: chargeId,
            original_amount_cents: amountCents,
            refund_amount_cents: amountCents,
            refund_reason: 'requested_by_customer',
            refund_id: `re_full_${chargeId.replace('ch_', '')}`,
            refund_type: 'full'
          },
          severity: 'warning'
        });

        auditEvents.push({ event: 'full_refund', result: refundEvent });
      }

      // 6. Conditional: Dispute
      if (includeDispute) {
        const disputeId = `dp_${chargeId.replace('ch_', '')}`;
        const disputeEvent = await auditService.logFinancialEvent({
          requestId: `dispute_${disputeId}`,
          action: 'DISPUTE_CREATED',
          amountCents: amountCents,
          currency: currency,
          transactionReference: chargeId,
          paymentStatus: 'disputed',
          targetType: 'dispute',
          targetId: disputeId,
          metadata: {
            dispute_id: disputeId,
            charge_id: chargeId,
            dispute_reason: 'fraudulent',
            dispute_status: 'needs_response',
            evidence_due_by: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days from now
            network_reason_code: '4855',
            is_charge_refundable: true
          },
          severity: 'error'
        });

        auditEvents.push({ event: 'dispute_created', result: disputeEvent });
      }

      // 7. Settlement/Payout (if payment was successful and not fully refunded)
      if (!includeRefund || includePartialRefund) {
        const settlementAmount = includePartialRefund
          ? amountCents - Math.floor(amountCents * 0.3) - (Math.round(amountCents * 0.029) + 30)
          : amountCents - (Math.round(amountCents * 0.029) + 30);

        const payoutEvent = await auditService.logFinancialEvent({
          requestId: `payout_${Date.now()}`,
          action: 'SETTLEMENT_PAYOUT',
          amountCents: settlementAmount,
          currency: currency,
          transactionReference: null, // Payouts don't map to specific transactions
          paymentStatus: 'paid',
          targetType: 'payout',
          targetId: `po_${sessionId.replace('cs_', '')}`,
          metadata: {
            original_session_id: sessionId,
            original_charge_id: chargeId,
            gross_amount_cents: amountCents,
            fees_cents: Math.round(amountCents * 0.029) + 30,
            net_amount_cents: settlementAmount,
            payout_method: 'standard',
            arrival_date: new Date(Date.now() + (2 * 24 * 60 * 60 * 1000)).toISOString() // 2 days from now
          },
          severity: 'info'
        });

        auditEvents.push({ event: 'settlement_payout', result: payoutEvent });
      }

      const totalTime = Date.now() - startTime;

      return {
        success: true,
        scenario_id: sessionId,
        total_events: auditEvents.length,
        processing_time_ms: totalTime,
        audit_events: auditEvents,
        final_status: this._determineFinalStatus(includeRefund, includeDispute, includePartialRefund)
      };

    } catch (error) {
      return {
        success: false,
        scenario_id: sessionId,
        error: error.message,
        audit_events: auditEvents,
        processing_time_ms: Date.now() - startTime
      };
    }
  }

  /**
   * Test complex refund scenarios
   */
  async testComplexRefundScenario(scenario) {
    await this.ensureInitialized();

    const {
      originalAmount,
      refundSequence, // Array of { amount, reason, timing }
      currency = 'USD'
    } = scenario;

    const chargeId = `ch_complex_refund_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const auditEvents = [];

    // Original payment
    await auditService.logFinancialEvent({
      requestId: `original_${chargeId}`,
      action: 'PAYMENT_SUCCESSFUL',
      amountCents: originalAmount,
      currency: currency,
      transactionReference: chargeId,
      paymentStatus: 'completed',
      targetType: 'charge',
      targetId: chargeId
    });

    let totalRefunded = 0;
    let refundCount = 0;

    for (const refund of refundSequence) {
      refundCount++;
      totalRefunded += refund.amount;

      const isFullRefund = totalRefunded >= originalAmount;
      const refundStatus = isFullRefund ? 'refunded' : 'partially_refunded';

      const refundEvent = await auditService.logFinancialEvent({
        requestId: `refund_${refundCount}_${chargeId}`,
        action: isFullRefund ? 'REFUND_FULL' : 'REFUND_PARTIAL',
        amountCents: refund.amount,
        currency: currency,
        transactionReference: chargeId,
        paymentStatus: refundStatus,
        targetType: 'charge',
        targetId: chargeId,
        metadata: {
          refund_sequence_number: refundCount,
          refund_reason: refund.reason,
          cumulative_refunded_amount: totalRefunded,
          remaining_amount: originalAmount - totalRefunded,
          original_amount: originalAmount,
          is_complete_refund: isFullRefund
        },
        severity: 'warning'
      });

      auditEvents.push(refundEvent);

      if (isFullRefund) break;
    }

    return {
      charge_id: chargeId,
      original_amount: originalAmount,
      total_refunded: totalRefunded,
      refund_count: refundCount,
      final_status: totalRefunded >= originalAmount ? 'fully_refunded' : 'partially_refunded',
      audit_events: auditEvents
    };
  }

  /**
   * Test multi-currency scenarios
   */
  async testMultiCurrencyScenario() {
    await this.ensureInitialized();

    const currencies = [
      { code: 'USD', amount: 5000, exchangeRate: 1.0 },
      { code: 'EUR', amount: 4200, exchangeRate: 0.84 },
      { code: 'GBP', amount: 3800, exchangeRate: 0.76 },
      { code: 'CAD', amount: 6500, exchangeRate: 1.3 },
      { code: 'JPY', amount: 550000, exchangeRate: 110.0 }
    ];

    const auditEvents = [];

    for (let i = 0; i < currencies.length; i++) {
      const currency = currencies[i];
      const sessionId = `cs_multi_currency_${i}_${currency.code.toLowerCase()}`;

      const event = await auditService.logFinancialEvent({
        requestId: `multi_currency_${i}`,
        action: 'PAYMENT_SUCCESSFUL',
        amountCents: currency.amount,
        currency: currency.code,
        transactionReference: sessionId,
        paymentStatus: 'completed',
        targetType: 'stripe_session',
        targetId: sessionId,
        metadata: {
          currency_code: currency.code,
          exchange_rate_to_usd: currency.exchangeRate,
          usd_equivalent_cents: Math.round(currency.amount / currency.exchangeRate),
          payment_method_types: ['card'],
          multi_currency_test: true
        },
        severity: 'info'
      });

      auditEvents.push(event);
    }

    return {
      currencies_processed: currencies.length,
      total_events: auditEvents.length,
      currency_breakdown: currencies,
      audit_events: auditEvents
    };
  }

  /**
   * Test high-volume concurrent transactions
   */
  async testConcurrentTransactionScenario(transactionCount = 50) {
    await this.ensureInitialized();

    const startTime = Date.now();
    const promises = [];

    for (let i = 0; i < transactionCount; i++) {
      const sessionId = `cs_concurrent_${i}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const amount = 1000 + (i * 50); // Varying amounts

      promises.push(
        auditService.logFinancialEvent({
          requestId: `concurrent_${i}`,
          action: 'PAYMENT_SUCCESSFUL',
          amountCents: amount,
          currency: 'USD',
          transactionReference: sessionId,
          paymentStatus: 'completed',
          targetType: 'stripe_session',
          targetId: sessionId,
          metadata: {
            concurrent_test: true,
            transaction_index: i,
            test_batch_size: transactionCount
          },
          severity: 'info'
        })
      );
    }

    const results = await Promise.all(promises);
    const processingTime = Date.now() - startTime;

    return {
      transaction_count: transactionCount,
      processing_time_ms: processingTime,
      average_time_per_transaction: processingTime / transactionCount,
      all_successful: results.every(r => r.success === true),
      performance_grade: processingTime < 5000 ? 'excellent' : processingTime < 10000 ? 'good' : 'needs_improvement'
    };
  }

  /**
   * Helper to determine final payment status
   */
  _determineFinalStatus(includeRefund, includeDispute, includePartialRefund) {
    if (includeDispute) return 'disputed';
    if (includeRefund) return 'refunded';
    if (includePartialRefund) return 'partially_refunded';
    return 'completed';
  }

  /**
   * Validate audit trail integrity
   */
  async validateAuditTrailIntegrity(sessionId) {
    await this.ensureInitialized();

    const auditLogs = await auditService.queryAuditLogs({
      eventType: 'financial_event',
      limit: 100
    });

    const sessionEvents = auditLogs.logs.filter(log =>
      log.transaction_reference === sessionId ||
      (log.metadata && log.metadata.includes(sessionId))
    );

    const integrity = {
      total_events: sessionEvents.length,
      has_payment_success: sessionEvents.some(e => e.action.includes('PAYMENT_SUCCESSFUL')),
      has_session_created: sessionEvents.some(e => e.action === 'CHECKOUT_SESSION_CREATED'),
      has_complete_metadata: sessionEvents.every(e => e.metadata !== null),
      has_request_ids: sessionEvents.every(e => e.request_id !== null),
      chronological_order: this._validateChronologicalOrder(sessionEvents),
      amount_consistency: this._validateAmountConsistency(sessionEvents)
    };

    integrity.overall_score = this._calculateIntegrityScore(integrity);

    return integrity;
  }

  _validateChronologicalOrder(events) {
    if (events.length < 2) return true;

    const sorted = [...events].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return JSON.stringify(events.map(e => e.id)) === JSON.stringify(sorted.map(e => e.id));
  }

  _validateAmountConsistency(events) {
    const paymentEvents = events.filter(e => e.action.includes('PAYMENT_SUCCESSFUL'));
    const refundEvents = events.filter(e => e.action.includes('REFUND'));

    if (paymentEvents.length === 0) return true;

    const totalPaid = paymentEvents.reduce((sum, e) => sum + (e.amount_cents || 0), 0);
    const totalRefunded = refundEvents.reduce((sum, e) => sum + (e.amount_cents || 0), 0);

    return totalRefunded <= totalPaid;
  }

  _calculateIntegrityScore(integrity) {
    const checks = [
      integrity.has_payment_success,
      integrity.has_session_created,
      integrity.has_complete_metadata,
      integrity.has_request_ids,
      integrity.chronological_order,
      integrity.amount_consistency
    ];

    const passedChecks = checks.filter(Boolean).length;
    return Math.round((passedChecks / checks.length) * 100);
  }
}

describe('Financial Audit Scenarios Tests', () => {
  let db;
  let scenarioTester;

  beforeEach(async () => {
    await resetAllServices();

    db = await getDatabaseClient();
    scenarioTester = new FinancialAuditScenarioTester();

    // Initialize services first (creates tables if needed)
    await auditService.ensureInitialized();
    await scenarioTester.ensureInitialized();

    // Clean up audit logs
    try {
      await db.execute('DELETE FROM audit_logs WHERE event_type = ?', ['financial_event']);
    } catch (error) {
      // Ignore if table doesn't exist yet
    }
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await db.execute('DELETE FROM audit_logs WHERE event_type = ?', ['financial_event']);
    } catch (error) {
      // Ignore cleanup errors in case table doesn't exist
      console.warn('Test cleanup warning:', error.message);
    }
  });

  describe('Complete Payment Lifecycle Scenarios', () => {
    it('should handle successful payment lifecycle with complete audit trail', async () => {
      const scenario = {
        sessionId: 'cs_test_lifecycle_success_001',
        customerId: 'cus_test_001',
        amountCents: 7500,
        currency: 'USD',
        customerEmail: 'test.success@example.com',
        customerName: 'Test Success Customer',
        paymentMethodTypes: ['card']
      };

      const result = await scenarioTester.simulatePaymentLifecycle(scenario);

      expect(result.success).toBe(true);
      expect(result.total_events).toBe(4); // session_created, intent_created, payment_successful, settlement_payout
      expect(result.final_status).toBe('completed');
      expect(result.processing_time_ms).toBeLessThan(5000);

      // Verify all events were logged
      const events = result.audit_events;
      expect(events.find(e => e.event === 'session_created')).toBeDefined();
      expect(events.find(e => e.event === 'intent_created')).toBeDefined();
      expect(events.find(e => e.event === 'payment_successful')).toBeDefined();
      expect(events.find(e => e.event === 'settlement_payout')).toBeDefined();

      // Validate audit trail integrity
      const integrity = await scenarioTester.validateAuditTrailIntegrity(scenario.sessionId);
      expect(integrity.overall_score).toBeGreaterThanOrEqual(80);
      expect(integrity.has_payment_success).toBe(true);
      expect(integrity.amount_consistency).toBe(true);
    });

    it('should handle payment with full refund lifecycle', async () => {
      const scenario = {
        sessionId: 'cs_test_refund_lifecycle_001',
        customerId: 'cus_test_refund_001',
        amountCents: 5000,
        currency: 'USD',
        includeRefund: true,
        customerEmail: 'test.refund@example.com'
      };

      const result = await scenarioTester.simulatePaymentLifecycle(scenario);

      expect(result.success).toBe(true);
      expect(result.final_status).toBe('refunded');
      expect(result.total_events).toBe(4); // No settlement for fully refunded payment

      const refundEvent = result.audit_events.find(e => e.event === 'full_refund');
      expect(refundEvent).toBeDefined();
      expect(refundEvent.result.success).toBe(true);
    });

    it('should handle payment with partial refund lifecycle', async () => {
      const scenario = {
        sessionId: 'cs_test_partial_refund_001',
        customerId: 'cus_test_partial_001',
        amountCents: 10000,
        currency: 'USD',
        includePartialRefund: true,
        customerEmail: 'test.partial@example.com'
      };

      const result = await scenarioTester.simulatePaymentLifecycle(scenario);

      expect(result.success).toBe(true);
      expect(result.final_status).toBe('partially_refunded');
      expect(result.total_events).toBe(5); // Includes settlement for remaining amount

      const partialRefundEvent = result.audit_events.find(e => e.event === 'partial_refund');
      expect(partialRefundEvent).toBeDefined();

      const settlementEvent = result.audit_events.find(e => e.event === 'settlement_payout');
      expect(settlementEvent).toBeDefined();
    });

    it('should handle payment with dispute lifecycle', async () => {
      const scenario = {
        sessionId: 'cs_test_dispute_lifecycle_001',
        customerId: 'cus_test_dispute_001',
        amountCents: 8000,
        currency: 'USD',
        includeDispute: true,
        customerEmail: 'test.dispute@example.com'
      };

      const result = await scenarioTester.simulatePaymentLifecycle(scenario);

      expect(result.success).toBe(true);
      expect(result.final_status).toBe('disputed');

      const disputeEvent = result.audit_events.find(e => e.event === 'dispute_created');
      expect(disputeEvent).toBeDefined();
      expect(disputeEvent.result.success).toBe(true);
    });
  });

  describe('Complex Refund Scenarios', () => {
    it('should handle multiple partial refunds', async () => {
      const scenario = {
        originalAmount: 10000, // $100.00
        refundSequence: [
          { amount: 2000, reason: 'damaged_item', timing: 'immediate' },
          { amount: 3000, reason: 'partial_cancellation', timing: 'delayed' },
          { amount: 1500, reason: 'customer_complaint', timing: 'delayed' }
        ],
        currency: 'USD'
      };

      const result = await scenarioTester.testComplexRefundScenario(scenario);

      expect(result.total_refunded).toBe(6500); // $65.00 total refunded
      expect(result.refund_count).toBe(3);
      expect(result.final_status).toBe('partially_refunded');

      // Verify cumulative tracking
      const auditLogs = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        targetId: result.charge_id,
        limit: 10
      });

      const refundEvents = auditLogs.logs.filter(log => log.action.includes('REFUND'));
      expect(refundEvents).toHaveLength(3);

      // Check cumulative amounts in metadata
      const lastRefund = refundEvents[refundEvents.length - 1];
      const metadata = JSON.parse(lastRefund.metadata);
      expect(metadata.cumulative_refunded_amount).toBe(6500);
      expect(metadata.remaining_amount).toBe(3500);
    });

    it('should handle refund sequence that reaches full refund', async () => {
      const scenario = {
        originalAmount: 5000,
        refundSequence: [
          { amount: 2000, reason: 'quality_issue' },
          { amount: 3000, reason: 'complete_cancellation' } // This completes the refund
        ],
        currency: 'USD'
      };

      const result = await scenarioTester.testComplexRefundScenario(scenario);

      expect(result.total_refunded).toBe(5000);
      expect(result.final_status).toBe('fully_refunded');

      // Verify the last refund is marked as full
      const auditLogs = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        targetId: result.charge_id,
        limit: 10
      });

      const lastRefund = auditLogs.logs[auditLogs.logs.length - 1];
      expect(lastRefund.action).toBe('REFUND_FULL');
      expect(lastRefund.payment_status).toBe('refunded');
    });

    it('should handle over-refund protection', async () => {
      const scenario = {
        originalAmount: 1000,
        refundSequence: [
          { amount: 600, reason: 'partial_return' },
          { amount: 500, reason: 'attempted_over_refund' } // Would exceed original amount
        ],
        currency: 'USD'
      };

      const result = await scenarioTester.testComplexRefundScenario(scenario);

      // Should process the over-refund but track it properly
      expect(result.total_refunded).toBe(1100);
      expect(result.refund_count).toBe(2);

      // Verify integrity validation catches this
      const integrity = await scenarioTester.validateAuditTrailIntegrity(result.charge_id);
      expect(integrity.amount_consistency).toBe(false); // Should flag over-refund
    });
  });

  describe('Multi-Currency Support', () => {
    it('should handle transactions in multiple currencies', async () => {
      const result = await scenarioTester.testMultiCurrencyScenario();

      expect(result.currencies_processed).toBe(5);
      expect(result.total_events).toBe(5);

      // Verify currency breakdown
      const expectedCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'JPY'];
      expectedCurrencies.forEach(currency => {
        const currencyData = result.currency_breakdown.find(c => c.code === currency);
        expect(currencyData).toBeDefined();
        expect(currencyData.amount).toBeGreaterThan(0);
      });

      // Verify audit logs contain currency information
      const auditLogs = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        limit: 10
      });

      const currenciesInAudit = new Set(auditLogs.logs.map(log => log.currency));
      expect(currenciesInAudit.size).toBe(5);
      expectedCurrencies.forEach(currency => {
        expect(currenciesInAudit.has(currency)).toBe(true);
      });
    });

    it('should handle currency conversion metadata', async () => {
      const scenario = {
        sessionId: 'cs_eur_conversion_001',
        customerId: 'cus_eur_001',
        amountCents: 4200, // €42.00
        currency: 'EUR'
      };

      const result = await scenarioTester.simulatePaymentLifecycle(scenario);

      expect(result.success).toBe(true);

      // Verify EUR-specific handling
      const auditLogs = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        targetId: scenario.sessionId,
        limit: 10
      });

      const paymentEvent = auditLogs.logs.find(log => log.action === 'PAYMENT_SUCCESSFUL');
      expect(paymentEvent.currency).toBe('EUR');
      expect(paymentEvent.amount_cents).toBe(4200);
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle zero-amount transactions', async () => {
      const scenario = {
        sessionId: 'cs_zero_amount_001',
        customerId: 'cus_zero_001',
        amountCents: 0,
        currency: 'USD'
      };

      const result = await scenarioTester.simulatePaymentLifecycle(scenario);

      expect(result.success).toBe(true);
      expect(result.audit_events).toHaveLength(4);

      // Verify zero amount is handled correctly
      const auditLogs = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        targetId: scenario.sessionId,
        limit: 10
      });

      expect(auditLogs.logs.every(log => log.amount_cents === 0)).toBe(true);
    });

    it('should handle very large transaction amounts', async () => {
      const scenario = {
        sessionId: 'cs_large_amount_001',
        customerId: 'cus_large_001',
        amountCents: 1000000000, // $10,000,000.00
        currency: 'USD'
      };

      const result = await scenarioTester.simulatePaymentLifecycle(scenario);

      expect(result.success).toBe(true);

      // Verify large amounts are handled correctly
      const auditLogs = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        targetId: scenario.sessionId,
        limit: 10
      });

      const paymentEvent = auditLogs.logs.find(log => log.action === 'PAYMENT_SUCCESSFUL');
      expect(paymentEvent.amount_cents).toBe(1000000000);
    });

    it('should handle special characters in customer data', async () => {
      const scenario = {
        sessionId: 'cs_special_chars_001',
        customerId: 'cus_special_001',
        amountCents: 5000,
        currency: 'USD',
        customerEmail: 'test+special@example.com',
        customerName: 'José María O\'Connor-Smith 测试'
      };

      const result = await scenarioTester.simulatePaymentLifecycle(scenario);

      expect(result.success).toBe(true);

      // Verify special characters are preserved
      const auditLogs = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        targetId: scenario.sessionId,
        limit: 10
      });

      const sessionEvent = auditLogs.logs.find(log => log.action === 'CHECKOUT_SESSION_CREATED');
      const metadata = JSON.parse(sessionEvent.metadata);
      expect(metadata.customer_email).toBe('test+special@example.com');
      expect(metadata.customer_name).toBe('José María O\'Connor-Smith 测试');
    });

    it('should handle missing metadata gracefully', async () => {
      // Simulate an event with minimal metadata
      const result = await auditService.logFinancialEvent({
        requestId: 'req_minimal_metadata',
        action: 'PAYMENT_SUCCESSFUL',
        amountCents: 5000,
        currency: 'USD',
        transactionReference: 'txn_minimal',
        paymentStatus: 'completed'
        // No metadata provided
      });

      expect(result.success).toBe(true);

      const auditLogs = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        limit: 1
      });

      expect(auditLogs.logs[0].metadata).toBe(null);
    });
  });

  describe('Performance and Concurrency', () => {
    it('should handle concurrent high-volume transactions', async () => {
      const result = await scenarioTester.testConcurrentTransactionScenario(100);

      expect(result.transaction_count).toBe(100);
      expect(result.all_successful).toBe(true);
      expect(result.performance_grade).toBe('excellent');
      expect(result.average_time_per_transaction).toBeLessThan(100); // Less than 100ms per transaction

      // Verify all transactions were logged
      const auditLogs = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        limit: 150
      });

      const concurrentEvents = auditLogs.logs.filter(log =>
        log.metadata && log.metadata.includes('concurrent_test')
      );

      expect(concurrentEvents).toHaveLength(100);
    });

    it('should maintain audit integrity under concurrent load', async () => {
      // Run multiple concurrent scenarios
      const scenarios = [
        { sessionId: 'cs_concurrent_1', amountCents: 1000 },
        { sessionId: 'cs_concurrent_2', amountCents: 2000, includeRefund: true },
        { sessionId: 'cs_concurrent_3', amountCents: 3000, includePartialRefund: true },
        { sessionId: 'cs_concurrent_4', amountCents: 4000, includeDispute: true }
      ];

      const promises = scenarios.map(scenario =>
        scenarioTester.simulatePaymentLifecycle({
          ...scenario,
          customerId: `cus_${scenario.sessionId}`,
          currency: 'USD'
        })
      );

      const results = await Promise.all(promises);

      // Verify all scenarios completed successfully
      expect(results.every(r => r.success)).toBe(true);

      // Verify audit trail integrity for each scenario
      for (const scenario of scenarios) {
        const integrity = await scenarioTester.validateAuditTrailIntegrity(scenario.sessionId);
        expect(integrity.overall_score).toBeGreaterThanOrEqual(80);
      }

      // Verify no cross-contamination between scenarios
      for (const scenario of scenarios) {
        const auditLogs = await auditService.queryAuditLogs({
          eventType: 'financial_event',
          limit: 100
        });

        const scenarioEvents = auditLogs.logs.filter(log =>
          log.transaction_reference === scenario.sessionId ||
          (log.metadata && log.metadata.includes(scenario.sessionId))
        );

        expect(scenarioEvents.length).toBeGreaterThan(0);

        // Ensure no events reference other scenarios
        const otherSessionIds = scenarios
          .filter(s => s.sessionId !== scenario.sessionId)
          .map(s => s.sessionId);

        scenarioEvents.forEach(event => {
          otherSessionIds.forEach(otherId => {
            expect(event.transaction_reference).not.toBe(otherId);
            if (event.metadata) {
              expect(event.metadata).not.toContain(otherId);
            }
          });
        });
      }
    });
  });
});
/**
 * Test Data Factory
 * Creates complete, consistent test data for integration tests
 * Ensures all related entities are properly created with correct relationships
 */

import crypto from 'crypto';
import { safeStringify } from './bigint-serializer.js';

export class TestDataFactory {
  constructor(db) {
    this.db = db;
    this.createdEntities = {
      transactions: [],
      tickets: [],
      registrations: [],
      auditLogs: [],
      walletPasses: []
    };
  }

  /**
   * Create complete transaction with all related entities
   * This ensures wallet pass tests have all required data
   */
  async createCompleteTransaction(options = {}) {
    const defaults = {
      eventId: 'event_2026',
      stripeSessionId: `cs_test_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      paymentIntentId: `pi_test_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      status: 'completed',
      amount: 5000,
      ticketCount: 2,
      createRegistrations: true,
      createAuditTrail: true,
      createWalletPasses: false,
      customerEmail: 'test@example.com',
      customerName: 'Test User'
    };

    const config = { ...defaults, ...options };

    try {
      // Note: For test data factory, operations are separated for flexibility
      // Each method handles its own data creation independently
      // This allows partial test data creation and better debugging

      // 1. Create transaction record
      const transactionId = await this.createTransaction(config);

      // 2. Create tickets for the transaction
      const ticketIds = await this.createTickets(transactionId, config);

      // 3. Create registrations if needed
      if (config.createRegistrations) {
        await this.createRegistrations(ticketIds, config);
      }

      // 4. Create complete audit trail
      if (config.createAuditTrail) {
        await this.createAuditTrail(transactionId, config);
      }

      // 5. Create wallet passes if needed
      if (config.createWalletPasses) {
        await this.createWalletPasses(ticketIds, config);
      }

      return {
        transactionId,
        ticketIds,
        stripeSessionId: config.stripeSessionId,
        paymentIntentId: config.paymentIntentId,
        cleanup: () => this.cleanup()
      };
    } catch (error) {
      // Test data factory doesn't need transactions since it's for testing
      // Individual operations handle their own consistency
      console.error('Test data creation failed:', error);
      throw error;
    }
  }

  async createTransaction(config) {
    const result = await this.db.execute({
      sql: `INSERT INTO transactions (
        transaction_id, uuid, type, order_data, amount_cents, currency,
        customer_email, customer_name, status, event_id,
        stripe_session_id, stripe_payment_intent_id, is_test,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        `TEST-TXN-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        `TEST-TXN-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        'tickets',
        safeStringify({
          line_items: [],
          metadata: config.metadata || { test: true },
          test_mode_info: { test_mode: true, created_by: 'TestDataFactory' }
        }),
        config.amount,
        'USD',
        config.customerEmail,
        config.customerName,
        config.status,
        config.eventId,
        config.stripeSessionId,
        config.paymentIntentId,
        1, // Always mark as test data
        new Date().toISOString(),
        new Date().toISOString()
      ]
    });

    this.createdEntities.transactions.push(result.lastInsertRowid);
    return result.lastInsertRowid;
  }

  async createTickets(transactionId, config) {
    const ticketIds = [];

    // Calculate integer cents per ticket to ensure exact total
    const basePriceCents = Math.floor(config.amount / config.ticketCount);
    const remainderCents = config.amount % config.ticketCount;

    for (let i = 0; i < config.ticketCount; i++) {
      const ticketId = `TEST-TICKET-${Date.now()}-${i}-${crypto.randomBytes(4).toString('hex')}`;
      const validationToken = `token_${Date.now()}_${i}_${crypto.randomBytes(8).toString('hex')}`;

      // Distribute remainder cents to last ticket to ensure exact total
      const ticketPriceCents = basePriceCents + (i === config.ticketCount - 1 ? remainderCents : 0);

      const ticketType = config.ticketType || 'weekend-pass';
      const result = await this.db.execute({
        sql: `INSERT INTO tickets (
          ticket_id, transaction_id, event_id, ticket_type, ticket_type_id,
          validation_signature, status, qr_code_data,
          attendee_first_name, attendee_last_name, attendee_email,
          price_cents, ticket_metadata, is_test, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          ticketId,
          transactionId,
          config.eventId,
          ticketType,
          ticketType,  // ticket_type_id uses same value (ticket_types.id is TEXT)
          validationToken,
          'valid',
          safeStringify({
            ticketId,
            validationToken,
            eventId: config.eventId
          }),
          config.customerName ? config.customerName.split(' ')[0] : 'Test',
          config.customerName ? config.customerName.split(' ').slice(1).join(' ') || 'User' : 'User',
          config.customerEmail,
          ticketPriceCents, // Use calculated integer cents
          safeStringify({
            testTicket: true,
            createdBy: 'TestDataFactory',
            test_mode: true,
            item_index: i + 1,
            total_quantity: config.ticketCount
          }),
          1, // Always mark as test data
          new Date().toISOString()
        ]
      });

      ticketIds.push(ticketId);
      this.createdEntities.tickets.push(ticketId);
    }

    return ticketIds;
  }

  async createRegistrations(ticketIds, config) {
    for (const ticketId of ticketIds) {
      const result = await this.db.execute({
        sql: `INSERT INTO registrations (
          ticket_id, name, email, dietary_restrictions,
          emergency_contact, registered_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          ticketId,
          config.customerName,
          config.customerEmail,
          config.dietary || null,
          config.emergencyContact || safeStringify({
            name: 'Emergency Contact',
            phone: '+1234567890'
          }),
          new Date().toISOString()
        ]
      });

      this.createdEntities.registrations.push(ticketId);
    }
  }

  async createAuditTrail(transactionId, config) {
    const auditEvents = [
      {
        action: 'payment_session_created',
        eventType: 'financial_event',
        status: 'pending',
        timestamp: new Date(Date.now() - 4000).toISOString()
      },
      {
        action: 'payment_authorized',
        eventType: 'financial_event',
        status: 'authorized',
        timestamp: new Date(Date.now() - 3000).toISOString()
      },
      {
        action: 'payment_captured',
        eventType: 'financial_event',
        status: 'completed',
        timestamp: new Date(Date.now() - 2000).toISOString()
      },
      {
        action: 'tickets_generated',
        eventType: 'system_event',
        status: 'completed',
        timestamp: new Date(Date.now() - 1000).toISOString()
      },
      {
        action: 'payment_reconciled',
        eventType: 'financial_event',
        status: 'reconciled',
        timestamp: new Date().toISOString()
      }
    ];

    for (const event of auditEvents) {
      await this.db.execute({
        sql: `INSERT INTO audit_logs (
          request_id, event_type, action, transaction_reference,
          amount_cents, currency, payment_status,
          target_type, target_id, metadata, severity, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          `test_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
          event.eventType,
          event.action,
          config.stripeSessionId,
          config.amount,
          'USD',
          event.status,
          'transaction',
          transactionId.toString(),
          safeStringify({
            transactionId,
            paymentIntentId: config.paymentIntentId,
            test: true,
            createdBy: 'TestDataFactory'
          }),
          'info',
          event.timestamp
        ]
      });

      this.createdEntities.auditLogs.push(config.stripeSessionId);
    }
  }

  async createWalletPasses(ticketIds, config) {
    for (const ticketId of ticketIds) {
      const passId = `pass_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      await this.db.execute({
        sql: `INSERT INTO wallet_passes (
          id, ticket_id, pass_type, serial_number,
          auth_token, barcode_message, status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          passId,
          ticketId,
          'both', // Apple and Google
          `SN${Date.now()}`,
          crypto.randomBytes(32).toString('base64'),
          safeStringify({ ticketId }),
          'active',
          new Date().toISOString(),
          new Date().toISOString()
        ]
      });

      this.createdEntities.walletPasses.push(passId);
    }
  }

  /**
   * Create GDPR compliance records for testing
   */
  async createGDPRComplianceRecords(dataSubjectId, options = {}) {
    const defaults = {
      trackAllOperations: true,
      includeConsent: true,
      includeDataRequests: false
    };

    const config = { ...defaults, ...options };

    const complianceRecords = [];

    if (config.trackAllOperations) {
      // Track data collection
      complianceRecords.push({
        action: 'personal_data_collected',
        dataType: 'contact_information',
        purpose: 'ticket_registration',
        legalBasis: config.includeConsent ? 'consent' : 'contract'
      });

      // Track data processing
      complianceRecords.push({
        action: 'personal_data_processed',
        dataType: 'payment_information',
        purpose: 'payment_processing',
        legalBasis: 'contract'
      });
    }

    if (config.includeDataRequests) {
      // Add data subject request
      complianceRecords.push({
        action: 'data_access_request',
        dataType: 'all_personal_data',
        purpose: 'data_subject_rights',
        legalBasis: 'legal_obligation'
      });
    }

    for (const record of complianceRecords) {
      await this.db.execute({
        sql: `INSERT INTO audit_logs (
          request_id, event_type, action, data_subject_id,
          data_type, processing_purpose, legal_basis,
          metadata, severity, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          `gdpr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
          'data_processing',
          record.action,
          dataSubjectId,
          record.dataType,
          record.purpose,
          record.legalBasis,
          safeStringify({
            gdprCompliance: true,
            test: true,
            createdBy: 'TestDataFactory'
          }),
          'info',
          new Date().toISOString()
        ]
      });
    }

    return complianceRecords.length;
  }

  /**
   * Create financial reconciliation data
   */
  async createFinancialReconciliationData(options = {}) {
    const defaults = {
      transactionCount: 5,
      includeRefunds: true,
      includeDisputes: false,
      reconciliationStatus: 'completed'
    };

    const config = { ...defaults, ...options };

    const transactions = [];

    // Create multiple transactions for reconciliation
    for (let i = 0; i < config.transactionCount; i++) {
      const txConfig = {
        amount: 5000 + (i * 1000),
        status: 'completed',
        createAuditTrail: true
      };

      const result = await this.createCompleteTransaction(txConfig);
      transactions.push(result);

      // Add refund if configured
      if (config.includeRefunds && i === 0) {
        await this.db.execute({
          sql: `INSERT INTO audit_logs (
            request_id, event_type, action, transaction_reference,
            amount_cents, currency, payment_status, metadata, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `refund_${Date.now()}`,
            'financial_event',
            'REFUND_FULL',
            result.stripeSessionId,
            -txConfig.amount,
            'USD',
            'refunded',
            safeStringify({ refundReason: 'customer_request' }),
            new Date().toISOString()
          ]
        });
      }

      // Add dispute if configured
      if (config.includeDisputes && i === 1) {
        await this.db.execute({
          sql: `INSERT INTO audit_logs (
            request_id, event_type, action, transaction_reference,
            amount_cents, currency, payment_status, metadata, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `dispute_${Date.now()}`,
            'financial_event',
            'DISPUTE_CREATED',
            result.stripeSessionId,
            txConfig.amount,
            'USD',
            'disputed',
            safeStringify({ disputeReason: 'fraudulent' }),
            new Date().toISOString()
          ]
        });
      }
    }

    // Create reconciliation summary
    const totalAmount = transactions.reduce((sum, t, i) => sum + (5000 + (i * 1000)), 0);
    const refundAmount = config.includeRefunds ? 5000 : 0;
    const disputeAmount = config.includeDisputes ? 6000 : 0;

    await this.db.execute({
      sql: `INSERT INTO audit_logs (
        request_id, event_type, action, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?)`,
      args: [
        `reconciliation_${Date.now()}`,
        'financial_event',
        'daily_reconciliation_completed',
        safeStringify({
          transactionCount: config.transactionCount,
          totalAmountCents: totalAmount,
          refundAmountCents: refundAmount,
          disputeAmountCents: disputeAmount,
          netAmountCents: totalAmount - refundAmount,
          status: config.reconciliationStatus
        }),
        new Date().toISOString()
      ]
    });

    return transactions;
  }

  /**
   * Clean up all created test data
   */
  async cleanup() {
    try {
      // Clean up in reverse order of creation to respect foreign key constraints

      if (this.createdEntities.walletPasses.length > 0) {
        const placeholders = this.createdEntities.walletPasses.map(() => '?').join(',');
        await this.db.execute(
          `DELETE FROM wallet_passes WHERE id IN (${placeholders})`,
          this.createdEntities.walletPasses
        );
      }

      if (this.createdEntities.auditLogs.length > 0) {
        // Use unique values to avoid duplicates
        const uniqueRefs = [...new Set(this.createdEntities.auditLogs)];
        const placeholders = uniqueRefs.map(() => '?').join(',');
        await this.db.execute(
          `DELETE FROM audit_logs WHERE transaction_reference IN (${placeholders})`,
          uniqueRefs
        );
      }

      if (this.createdEntities.registrations.length > 0) {
        const placeholders = this.createdEntities.registrations.map(() => '?').join(',');
        await this.db.execute(
          `DELETE FROM registrations WHERE ticket_id IN (${placeholders})`,
          this.createdEntities.registrations
        );
      }

      if (this.createdEntities.tickets.length > 0) {
        const placeholders = this.createdEntities.tickets.map(() => '?').join(',');
        await this.db.execute(
          `DELETE FROM tickets WHERE ticket_id IN (${placeholders})`,
          this.createdEntities.tickets
        );
      }

      if (this.createdEntities.transactions.length > 0) {
        const placeholders = this.createdEntities.transactions.map(() => '?').join(',');
        await this.db.execute(
          `DELETE FROM transactions WHERE id IN (${placeholders})`,
          this.createdEntities.transactions
        );
      }

      // Reset tracking arrays
      this.createdEntities = {
        transactions: [],
        tickets: [],
        registrations: [],
        auditLogs: [],
        walletPasses: []
      };
    } catch (error) {
      console.error('Error during test data cleanup:', error);
      // Don't throw - allow tests to continue even if cleanup fails
    }
  }
}

export default TestDataFactory;
/**
 * End-to-End Audit Trail Verification Tests
 * Tests complete ticket lifecycle audit trail, payment correlation, and admin action auditing
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';
import { auditService } from '../../lib/audit-service.js';
import { resetAllServices } from './reset-services.js';
import crypto from 'crypto';

describe('End-to-End Audit Trail Verification', () => {
  let db;
  let testRequestId;
  let testTicketId;
  let testTransactionRef;
  let testAdminUser;

  beforeAll(async () => {
    db = await getDatabaseClient();
    await auditService.ensureInitialized();
  });

  beforeEach(async () => {
    await resetAllServices();

    // Get fresh database client after reset
    db = await getDatabaseClient();
    await auditService.ensureInitialized();

    // Generate unique test identifiers
    testRequestId = `test_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    testTicketId = `ticket_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    testTransactionRef = `txn_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    testAdminUser = 'test_admin';

    // Clean up any existing test data
    await db.execute('DELETE FROM audit_logs WHERE request_id LIKE ? OR admin_user = ?',
      [`test_%`, testAdminUser]);
  });

  afterEach(async () => {
    // Clean up test data after each test
    await db.execute('DELETE FROM audit_logs WHERE request_id LIKE ? OR admin_user = ?',
      [`test_%`, testAdminUser]);
  });

  describe('Complete Ticket Lifecycle Audit Trail', () => {
    it('should create complete audit trail for ticket creation → registration → validation → check-in', async () => {
      const sessionId = `session_${testRequestId}`;
      const ipAddress = '192.168.1.100';
      const userAgent = 'test-browser/1.0';

      // Step 1: Ticket Creation (Financial Event)
      const ticketCreationResult = await auditService.logFinancialEvent({
        requestId: `${testRequestId}_creation`,
        action: 'ticket_created',
        amountCents: 5000, // $50.00
        currency: 'USD',
        transactionReference: testTransactionRef,
        paymentStatus: 'pending',
        targetType: 'ticket',
        targetId: testTicketId,
        metadata: {
          ticketType: 'festival_pass',
          quantity: 1,
          customerEmail: 'test@example.com'
        }
      });

      expect(ticketCreationResult.success).toBe(true);

      // Step 2: Payment Completion (Financial Event)
      const paymentResult = await auditService.logFinancialEvent({
        requestId: `${testRequestId}_payment`,
        action: 'payment_completed',
        amountCents: 5000,
        currency: 'USD',
        transactionReference: testTransactionRef,
        paymentStatus: 'completed',
        targetType: 'transaction',
        targetId: testTransactionRef,
        metadata: {
          paymentMethod: 'card',
          stripeChargeId: 'ch_test_123456',
          fees: 175 // $1.75 in fees
        }
      });

      expect(paymentResult.success).toBe(true);

      // Step 3: Registration Data Entry (Data Change)
      const registrationData = {
        fullName: 'John Doe',
        email: 'test@example.com',
        phone: '+1234567890',
        emergencyContact: 'Jane Doe (+0987654321)'
      };

      const registrationResult = await auditService.logDataChange({
        requestId: `${testRequestId}_registration`,
        action: 'ticket_registered',
        targetType: 'registration',
        targetId: testTicketId,
        beforeValue: null,
        afterValue: registrationData,
        changedFields: Object.keys(registrationData),
        metadata: {
          registrationMethod: 'online_form',
          sourceIp: ipAddress
        }
      });

      expect(registrationResult.success).toBe(true);

      // Step 4: QR Code Validation (Admin Access)
      const validationResult = await auditService.logAdminAccess({
        requestId: `${testRequestId}_validation`,
        adminUser: testAdminUser,
        sessionId,
        ipAddress,
        userAgent,
        requestMethod: 'POST',
        requestUrl: '/api/tickets/validate',
        requestBody: { qrCode: testTicketId },
        responseStatus: 200,
        responseTimeMs: 150,
        metadata: {
          validationType: 'qr_scan',
          location: 'entrance_gate_1'
        }
      });

      expect(validationResult.success).toBe(true);

      // Step 5: Check-in Event (Data Change)
      const checkinResult = await auditService.logDataChange({
        requestId: `${testRequestId}_checkin`,
        action: 'ticket_checkin',
        targetType: 'ticket',
        targetId: testTicketId,
        beforeValue: { status: 'registered' },
        afterValue: { status: 'checked_in', checkinTime: new Date().toISOString() },
        changedFields: ['status', 'checkinTime'],
        adminUser: testAdminUser,
        sessionId,
        ipAddress,
        metadata: {
          checkinLocation: 'main_entrance',
          scanDevice: 'tablet_001'
        }
      });

      expect(checkinResult.success).toBe(true);

      // Verify Complete Audit Trail
      const auditTrail = await auditService.queryAuditLogs({
        targetId: testTicketId,
        orderBy: 'created_at',
        orderDirection: 'ASC',
        limit: 10
      });

      expect(auditTrail.logs).toHaveLength(3); // registration, validation (admin access), checkin
      expect(auditTrail.logs[0].action).toBe('ticket_registered');
      expect(auditTrail.logs[1].event_type).toBe('admin_access');
      expect(auditTrail.logs[2].action).toBe('ticket_checkin');

      // Verify Financial Events
      const financialAudit = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        limit: 10
      });

      const relatedFinancialEvents = financialAudit.logs.filter(log =>
        log.transaction_reference === testTransactionRef);

      expect(relatedFinancialEvents).toHaveLength(2);
      expect(relatedFinancialEvents[0].action).toBe('ticket_created');
      expect(relatedFinancialEvents[1].action).toBe('payment_completed');

      // Verify Admin Actions
      const adminAudit = await auditService.queryAuditLogs({
        adminUser: testAdminUser,
        limit: 10
      });

      expect(adminAudit.logs).toHaveLength(2); // validation and checkin
    });

    it('should track ticket refund and cancellation workflow', async () => {
      // Create initial ticket
      await auditService.logFinancialEvent({
        requestId: `${testRequestId}_original`,
        action: 'ticket_created',
        amountCents: 5000,
        transactionReference: testTransactionRef,
        paymentStatus: 'completed',
        targetType: 'ticket',
        targetId: testTicketId
      });

      // Log refund request
      const refundRequestResult = await auditService.logDataChange({
        requestId: `${testRequestId}_refund_request`,
        action: 'refund_requested',
        targetType: 'ticket',
        targetId: testTicketId,
        beforeValue: { status: 'active', refundRequested: false },
        afterValue: { status: 'refund_pending', refundRequested: true },
        changedFields: ['status', 'refundRequested'],
        metadata: {
          reason: 'customer_request',
          requestedBy: 'customer'
        }
      });

      expect(refundRequestResult.success).toBe(true);

      // Log admin approval
      const approvalResult = await auditService.logAdminAccess({
        requestId: `${testRequestId}_refund_approval`,
        adminUser: testAdminUser,
        sessionId: `session_${testRequestId}`,
        ipAddress: '192.168.1.100',
        userAgent: 'admin-browser/1.0',
        requestMethod: 'POST',
        requestUrl: '/api/admin/refunds/approve',
        requestBody: { ticketId: testTicketId, approved: true },
        responseStatus: 200,
        responseTimeMs: 300,
        metadata: {
          approvalReason: 'valid_customer_request',
          reviewNotes: 'Customer requested due to schedule conflict'
        }
      });

      expect(approvalResult.success).toBe(true);

      // Log financial refund
      const refundResult = await auditService.logFinancialEvent({
        requestId: `${testRequestId}_refund_processed`,
        action: 'refund_processed',
        amountCents: -4750, // Minus processing fee
        currency: 'USD',
        transactionReference: `${testTransactionRef}_refund`,
        paymentStatus: 'refunded',
        targetType: 'ticket',
        targetId: testTicketId,
        metadata: {
          originalTransaction: testTransactionRef,
          refundFee: 250, // $2.50 processing fee
          stripeRefundId: 're_test_123456'
        }
      });

      expect(refundResult.success).toBe(true);

      // Verify refund audit trail
      const refundAudit = await auditService.queryAuditLogs({
        targetId: testTicketId,
        orderBy: 'created_at',
        orderDirection: 'ASC',
        limit: 10
      });

      expect(refundAudit.logs.length).toBeGreaterThanOrEqual(2);
      expect(refundAudit.logs.some(log => log.action === 'refund_requested')).toBe(true);
      expect(refundAudit.logs.some(log => log.action === 'refund_processed')).toBe(true);
    });
  });

  describe('Payment-to-Ticket Audit Correlation', () => {
    it('should correlate payment events with ticket creation and updates', async () => {
      const correlationId = `correlation_${testRequestId}`;

      // Create multiple tickets in same transaction
      const ticketIds = [
        `${testTicketId}_1`,
        `${testTicketId}_2`
      ];

      // Log batch payment
      await auditService.logFinancialEvent({
        requestId: `${testRequestId}_batch_payment`,
        action: 'batch_payment_created',
        amountCents: 10000, // $100 for 2 tickets
        currency: 'USD',
        transactionReference: testTransactionRef,
        paymentStatus: 'completed',
        targetType: 'transaction',
        targetId: testTransactionRef,
        metadata: {
          correlationId,
          ticketCount: 2,
          paymentMethod: 'card'
        }
      });

      // Log individual ticket creation events
      for (let i = 0; i < ticketIds.length; i++) {
        await auditService.logDataChange({
          requestId: `${testRequestId}_ticket_${i + 1}`,
          action: 'ticket_created',
          targetType: 'ticket',
          targetId: ticketIds[i],
          beforeValue: null,
          afterValue: {
            ticketType: 'festival_pass',
            price: 5000,
            status: 'active'
          },
          metadata: {
            correlationId,
            transactionReference: testTransactionRef,
            ticketNumber: i + 1
          }
        });
      }

      // Query by correlation ID
      const correlatedEvents = await auditService.queryAuditLogs({
        limit: 10
      });

      const relatedEvents = correlatedEvents.logs.filter(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.correlationId === correlationId;
        } catch {
          return false;
        }
      });

      expect(relatedEvents.length).toBeGreaterThanOrEqual(3); // 1 payment + 2 tickets

      // Verify payment correlation
      const paymentEvent = relatedEvents.find(log => log.event_type === 'financial_event');
      expect(paymentEvent).toBeDefined();
      expect(paymentEvent.transaction_reference).toBe(testTransactionRef);

      // Verify ticket events are correlated
      const ticketEvents = relatedEvents.filter(log => log.event_type === 'data_change');
      expect(ticketEvents).toHaveLength(2);
      ticketEvents.forEach(event => {
        const metadata = JSON.parse(event.metadata);
        expect(metadata.transactionReference).toBe(testTransactionRef);
      });
    });

    it('should track payment status changes and impact on tickets', async () => {
      // Initial payment pending
      await auditService.logFinancialEvent({
        requestId: `${testRequestId}_pending`,
        action: 'payment_initiated',
        amountCents: 5000,
        transactionReference: testTransactionRef,
        paymentStatus: 'pending',
        targetType: 'transaction',
        targetId: testTransactionRef
      });

      // Payment failed
      await auditService.logFinancialEvent({
        requestId: `${testRequestId}_failed`,
        action: 'payment_failed',
        amountCents: 5000,
        transactionReference: testTransactionRef,
        paymentStatus: 'failed',
        targetType: 'transaction',
        targetId: testTransactionRef,
        metadata: {
          errorCode: 'card_declined',
          errorMessage: 'Your card was declined'
        }
      });

      // Ticket status update due to failed payment
      await auditService.logDataChange({
        requestId: `${testRequestId}_ticket_cancelled`,
        action: 'ticket_cancelled',
        targetType: 'ticket',
        targetId: testTicketId,
        beforeValue: { status: 'pending_payment' },
        afterValue: { status: 'cancelled', reason: 'payment_failed' },
        changedFields: ['status', 'reason'],
        metadata: {
          triggerEvent: 'payment_failed',
          transactionReference: testTransactionRef
        }
      });

      // Verify payment failure correlation
      const failureAudit = await auditService.queryAuditLogs({
        limit: 10,
        orderBy: 'created_at',
        orderDirection: 'ASC'
      });

      const transactionEvents = failureAudit.logs.filter(log =>
        log.transaction_reference === testTransactionRef ||
        (log.metadata && JSON.parse(log.metadata || '{}').transactionReference === testTransactionRef)
      );

      expect(transactionEvents.length).toBeGreaterThanOrEqual(3);

      // Check sequence: pending → failed → ticket cancelled
      const paymentStates = transactionEvents
        .filter(log => log.event_type === 'financial_event')
        .map(log => log.payment_status);

      expect(paymentStates).toContain('pending');
      expect(paymentStates).toContain('failed');
    });
  });

  describe('Admin Action Audit Trails', () => {
    it('should track complete admin session and all actions', async () => {
      const sessionId = `admin_session_${testRequestId}`;
      const ipAddress = '10.0.1.50';
      const userAgent = 'Mozilla/5.0 (Admin Browser)';

      // Login
      await auditService.logAdminAccess({
        requestId: `${testRequestId}_login`,
        adminUser: testAdminUser,
        sessionId,
        ipAddress,
        userAgent,
        requestMethod: 'POST',
        requestUrl: '/api/admin/login',
        requestBody: { username: testAdminUser },
        responseStatus: 200,
        responseTimeMs: 250,
        metadata: {
          loginMethod: 'password',
          mfaUsed: true,
          sessionDuration: '8h'
        }
      });

      // Dashboard access
      await auditService.logAdminAccess({
        requestId: `${testRequestId}_dashboard`,
        adminUser: testAdminUser,
        sessionId,
        ipAddress,
        userAgent,
        requestMethod: 'GET',
        requestUrl: '/api/admin/dashboard',
        responseStatus: 200,
        responseTimeMs: 100
      });

      // Data modification
      await auditService.logDataChange({
        requestId: `${testRequestId}_data_update`,
        action: 'registration_updated',
        targetType: 'registration',
        targetId: testTicketId,
        beforeValue: { status: 'incomplete' },
        afterValue: { status: 'verified', verifiedBy: testAdminUser },
        changedFields: ['status', 'verifiedBy'],
        adminUser: testAdminUser,
        sessionId,
        ipAddress,
        metadata: {
          reason: 'manual_verification',
          notes: 'Verified customer identity via phone call'
        }
      });

      // Config change
      await auditService.logConfigChange({
        requestId: `${testRequestId}_config`,
        action: 'setting_updated',
        configKey: 'registration_deadline',
        beforeValue: '2026-05-01',
        afterValue: '2026-04-25',
        adminUser: testAdminUser,
        sessionId,
        ipAddress,
        metadata: {
          reason: 'extended_deadline_request',
          approvedBy: 'festival_director'
        }
      });

      // Logout
      await auditService.logAdminAccess({
        requestId: `${testRequestId}_logout`,
        adminUser: testAdminUser,
        sessionId,
        ipAddress,
        userAgent,
        requestMethod: 'POST',
        requestUrl: '/api/admin/logout',
        responseStatus: 200,
        responseTimeMs: 50,
        metadata: {
          sessionDuration: '2h 15m',
          actionsPerformed: 4
        }
      });

      // Verify complete admin session audit
      const adminAudit = await auditService.queryAuditLogs({
        adminUser: testAdminUser,
        orderBy: 'created_at',
        orderDirection: 'ASC',
        limit: 20
      });

      expect(adminAudit.logs.length).toBeGreaterThanOrEqual(5);

      // Verify session consistency
      const sessionEvents = adminAudit.logs.filter(log =>
        log.session_id === sessionId);

      expect(sessionEvents.length).toBeGreaterThanOrEqual(4);

      // Verify IP consistency
      sessionEvents.forEach(event => {
        expect(event.ip_address).toBe(ipAddress);
      });

      // Verify different event types are captured
      const eventTypes = [...new Set(adminAudit.logs.map(log => log.event_type))];
      expect(eventTypes).toContain('admin_access');
      expect(eventTypes).toContain('data_change');
      expect(eventTypes).toContain('config_change');
    });

    it('should track privileged operations with enhanced details', async () => {
      const privilegedActions = [
        {
          action: 'bulk_ticket_cancellation',
          targetType: 'bulk_operation',
          targetId: 'bulk_001',
          metadata: {
            ticketCount: 25,
            reason: 'event_cancelled',
            affectedCustomers: 25,
            refundAmount: 125000 // $1,250.00
          }
        },
        {
          action: 'data_export',
          targetType: 'export',
          targetId: 'export_001',
          metadata: {
            exportType: 'customer_data',
            recordCount: 500,
            gdprBasis: 'legitimate_interest',
            purpose: 'financial_reconciliation'
          }
        },
        {
          action: 'system_backup',
          targetType: 'system',
          targetId: 'backup_001',
          metadata: {
            backupType: 'full',
            dataSize: '50MB',
            retention: '90days'
          }
        }
      ];

      for (const actionData of privilegedActions) {
        await auditService.logDataChange({
          requestId: `${testRequestId}_${actionData.action}`,
          action: actionData.action,
          targetType: actionData.targetType,
          targetId: actionData.targetId,
          adminUser: testAdminUser,
          sessionId: `privileged_session_${testRequestId}`,
          ipAddress: '10.0.1.50',
          metadata: actionData.metadata,
          severity: 'warning' // Privileged operations are high-importance
        });
      }

      // Verify privileged operations audit
      const privilegedAudit = await auditService.queryAuditLogs({
        adminUser: testAdminUser,
        severity: 'warning',
        limit: 10
      });

      expect(privilegedAudit.logs.length).toBeGreaterThanOrEqual(3);

      // Verify all privileged actions are logged
      const loggedActions = privilegedAudit.logs.map(log => log.action);
      privilegedActions.forEach(action => {
        expect(loggedActions).toContain(action.action);
      });

      // Verify metadata is preserved
      privilegedAudit.logs.forEach(log => {
        expect(log.metadata).toBeDefined();
        const metadata = JSON.parse(log.metadata);
        expect(metadata).toBeTypeOf('object');
      });
    });
  });

  describe('Audit Log Query and Filtering Capabilities', () => {
    beforeEach(async () => {
      // Create diverse audit data for filtering tests
      const testData = [
        { eventType: 'admin_access', severity: 'info', adminUser: 'admin1' },
        { eventType: 'admin_access', severity: 'warning', adminUser: 'admin1' },
        { eventType: 'data_change', severity: 'info', adminUser: 'admin2' },
        { eventType: 'financial_event', severity: 'error', adminUser: null },
        { eventType: 'config_change', severity: 'warning', adminUser: 'admin1' }
      ];

      for (let i = 0; i < testData.length; i++) {
        const data = testData[i];
        if (data.eventType === 'admin_access') {
          await auditService.logAdminAccess({
            requestId: `filter_test_${i}`,
            adminUser: data.adminUser,
            sessionId: `session_${i}`,
            ipAddress: '192.168.1.100',
            userAgent: 'test-browser',
            requestMethod: 'GET',
            requestUrl: `/api/test/${i}`,
            responseStatus: data.severity === 'error' ? 500 : 200,
            responseTimeMs: 100,
            metadata: { testCase: i }
          });
        } else if (data.eventType === 'data_change') {
          await auditService.logDataChange({
            requestId: `filter_test_${i}`,
            action: 'test_action',
            targetType: 'test_target',
            targetId: `target_${i}`,
            adminUser: data.adminUser,
            severity: data.severity,
            metadata: { testCase: i }
          });
        } else if (data.eventType === 'financial_event') {
          await auditService.logFinancialEvent({
            requestId: `filter_test_${i}`,
            action: 'test_financial',
            amountCents: 1000,
            transactionReference: `txn_${i}`,
            paymentStatus: 'completed',
            severity: data.severity,
            metadata: { testCase: i }
          });
        } else if (data.eventType === 'config_change') {
          await auditService.logConfigChange({
            requestId: `filter_test_${i}`,
            action: 'test_config',
            configKey: `key_${i}`,
            beforeValue: 'old',
            afterValue: 'new',
            adminUser: data.adminUser,
            severity: data.severity,
            metadata: { testCase: i }
          });
        }
      }
    });

    it('should filter by event type', async () => {
      const adminAccessLogs = await auditService.queryAuditLogs({
        eventType: 'admin_access',
        limit: 20
      });

      expect(adminAccessLogs.logs.length).toBeGreaterThanOrEqual(2);
      adminAccessLogs.logs.forEach(log => {
        expect(log.event_type).toBe('admin_access');
      });
    });

    it('should filter by admin user', async () => {
      const admin1Logs = await auditService.queryAuditLogs({
        adminUser: 'admin1',
        limit: 20
      });

      expect(admin1Logs.logs.length).toBeGreaterThanOrEqual(3);
      admin1Logs.logs.forEach(log => {
        expect(log.admin_user).toBe('admin1');
      });
    });

    it('should filter by severity level', async () => {
      const warningLogs = await auditService.queryAuditLogs({
        severity: 'warning',
        limit: 20
      });

      expect(warningLogs.logs.length).toBeGreaterThanOrEqual(2);
      warningLogs.logs.forEach(log => {
        expect(log.severity).toBe('warning');
      });
    });

    it('should filter by date range', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

      const dateRangeLogs = await auditService.queryAuditLogs({
        startDate: oneHourAgo.toISOString(),
        endDate: oneHourFromNow.toISOString(),
        limit: 50
      });

      expect(dateRangeLogs.logs.length).toBeGreaterThan(0);
      dateRangeLogs.logs.forEach(log => {
        const logDate = new Date(log.created_at);
        expect(logDate.getTime()).toBeGreaterThanOrEqual(oneHourAgo.getTime());
        expect(logDate.getTime()).toBeLessThanOrEqual(oneHourFromNow.getTime());
      });
    });

    it('should support pagination', async () => {
      const firstPage = await auditService.queryAuditLogs({
        limit: 2,
        offset: 0
      });

      const secondPage = await auditService.queryAuditLogs({
        limit: 2,
        offset: 2
      });

      expect(firstPage.logs).toHaveLength(2);
      expect(secondPage.logs).toHaveLength(2);
      expect(firstPage.hasMore).toBe(true);
      expect(firstPage.total).toBeGreaterThan(2);

      // Verify different records
      const firstPageIds = firstPage.logs.map(log => log.id);
      const secondPageIds = secondPage.logs.map(log => log.id);

      firstPageIds.forEach(id => {
        expect(secondPageIds).not.toContain(id);
      });
    });

    it('should support complex filtering combinations', async () => {
      const complexFilter = await auditService.queryAuditLogs({
        eventType: 'admin_access',
        adminUser: 'admin1',
        severity: 'warning',
        limit: 10
      });

      complexFilter.logs.forEach(log => {
        expect(log.event_type).toBe('admin_access');
        expect(log.admin_user).toBe('admin1');
        expect(log.severity).toBe('warning');
      });
    });
  });
});
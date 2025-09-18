/**
 * Compliance Verification Tests
 * Tests GDPR audit trail completeness, verifies financial audit compliance,
 * tests admin access audit coverage, validates data change tracking completeness
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';
import auditService from '../../lib/audit-service.js';
import securityAlertService from '../../lib/security-alert-service.js';
import sessionMonitorService from '../../lib/session-monitor-service.js';
import crypto from 'crypto';

describe('Compliance Verification Tests', () => {
  let db;
  let testRequestId;
  let testDataSubjectId;
  let testAdminUser;
  let testTransactionRef;

  // Helper function to add small delays between operations for unique timestamps
  const addTimestampDelay = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));

  beforeAll(async () => {
    db = await getDatabaseClient();
    await auditService.ensureInitialized();
  });

  beforeEach(async () => {
    // Reset ALL service states that cache database connections
    // This prevents CLIENT_CLOSED errors from stale connections

    // Reset audit service state
    auditService.initialized = false;
    auditService.initializationPromise = null;
    auditService.db = null;

    // Reset security alert service state
    securityAlertService.initialized = false;
    securityAlertService.initializationPromise = null;
    securityAlertService.db = null;

    // Reset session monitor service state
    sessionMonitorService.initialized = false;
    sessionMonitorService.initializationPromise = null;
    sessionMonitorService.db = null;

    // Re-initialize audit service
    await auditService.ensureInitialized();

    // Generate unique test identifiers
    testRequestId = `compliance_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    testDataSubjectId = `subject_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    testAdminUser = 'compliance_admin';
    testTransactionRef = `txn_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Clean up any existing test data
    await db.execute('DELETE FROM audit_logs WHERE request_id LIKE ? OR admin_user = ?',
      [`compliance_%`, testAdminUser]);
  });

  afterEach(async () => {
    // Clean up test data after each test
    await db.execute('DELETE FROM audit_logs WHERE request_id LIKE ? OR admin_user = ?',
      [`compliance_%`, testAdminUser]);
  });

  describe('GDPR Audit Trail Completeness', () => {
    it('should track all personal data processing activities comprehensively', async () => {
      const gdprProcessingActivities = [
        {
          action: 'personal_data_collected',
          dataType: 'contact_information',
          purpose: 'customer_registration',
          legalBasis: 'contract',
          retention: '7_years'
        },
        {
          action: 'personal_data_processed',
          dataType: 'payment_information',
          purpose: 'payment_processing',
          legalBasis: 'contract',
          retention: '7_years_financial'
        },
        {
          action: 'personal_data_shared',
          dataType: 'email_address',
          purpose: 'marketing_communications',
          legalBasis: 'consent',
          retention: '2_years_marketing'
        },
        {
          action: 'personal_data_updated',
          dataType: 'contact_information',
          purpose: 'data_accuracy',
          legalBasis: 'legitimate_interests',
          retention: '7_years'
        },
        {
          action: 'personal_data_deleted',
          dataType: 'all_personal_data',
          purpose: 'data_subject_request',
          legalBasis: 'legal_obligation',
          retention: 'immediate_deletion'
        }
      ];

      // Log all GDPR processing activities with small delays to ensure unique timestamps
      for (let i = 0; i < gdprProcessingActivities.length; i++) {
        const activity = gdprProcessingActivities[i];

        await auditService.logDataProcessing({
          requestId: `${testRequestId}_gdpr_${i}`,
          action: activity.action,
          dataSubjectId: testDataSubjectId,
          dataType: activity.dataType,
          processingPurpose: activity.purpose,
          legalBasis: activity.legalBasis,
          retentionPeriod: activity.retention,
          metadata: {
            gdprCompliance: true,
            testCase: 'gdpr_processing',
            activityIndex: i,
            dataController: 'A Lo Cubano Boulder Fest',
            dataProcessor: 'festival_platform'
          }
        });

        // Add small delay to ensure unique timestamps for reliable ordering
        if (i < gdprProcessingActivities.length - 1) {
          await addTimestampDelay();
        }
      }

      // Verify comprehensive GDPR audit coverage
      const gdprAudit = await auditService.queryAuditLogs({
        eventType: 'data_processing',
        limit: 50,
        orderBy: 'created_at',
        orderDirection: 'ASC'  // Fix: match insertion order for correct test validation
      });

      const gdprLogs = gdprAudit.logs.filter(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.testCase === 'gdpr_processing' && log.data_subject_id === testDataSubjectId;
        } catch {
          return false;
        }
      });

      expect(gdprLogs).toHaveLength(gdprProcessingActivities.length);

      // Verify all required GDPR fields are captured
      gdprLogs.forEach((log, index) => {
        const activity = gdprProcessingActivities[index];

        expect(log.data_subject_id).toBe(testDataSubjectId);
        expect(log.data_type).toBe(activity.dataType);
        expect(log.processing_purpose).toBe(activity.purpose);
        expect(log.legal_basis).toBe(activity.legalBasis);
        expect(log.retention_period).toBe(activity.retention);

        const metadata = JSON.parse(log.metadata);
        expect(metadata.gdprCompliance).toBe(true);
        expect(metadata.dataController).toBe('A Lo Cubano Boulder Fest');
      });

      // Verify legal basis coverage
      const legalBases = [...new Set(gdprLogs.map(log => log.legal_basis))];
      expect(legalBases).toContain('contract');
      expect(legalBases).toContain('consent');
      expect(legalBases).toContain('legitimate_interests');
      expect(legalBases).toContain('legal_obligation');

      // Verify data lifecycle tracking
      const actions = gdprLogs.map(log => log.action);
      expect(actions).toContain('personal_data_collected');
      expect(actions).toContain('personal_data_processed');
      expect(actions).toContain('personal_data_updated');
      expect(actions).toContain('personal_data_deleted');
    });

    it('should support data subject rights audit trail', async () => {
      const dataSubjectRights = [
        {
          right: 'right_of_access',
          action: 'data_access_request_received',
          response: 'data_provided'
        },
        {
          right: 'right_of_rectification',
          action: 'data_correction_request_received',
          response: 'data_corrected'
        },
        {
          right: 'right_of_erasure',
          action: 'data_deletion_request_received',
          response: 'data_deleted'
        },
        {
          right: 'right_of_portability',
          action: 'data_portability_request_received',
          response: 'data_exported'
        },
        {
          right: 'right_to_object',
          action: 'processing_objection_received',
          response: 'processing_stopped'
        }
      ];

      // Log data subject rights requests and responses
      for (let i = 0; i < dataSubjectRights.length; i++) {
        const right = dataSubjectRights[i];

        // Log the request
        await auditService.logDataProcessing({
          requestId: `${testRequestId}_right_request_${i}`,
          action: right.action,
          dataSubjectId: testDataSubjectId,
          dataType: 'data_subject_request',
          processingPurpose: 'data_subject_rights_fulfillment',
          legalBasis: 'legal_obligation',
          metadata: {
            gdprRight: right.right,
            requestType: 'initial_request',
            testCase: 'data_subject_rights',
            requestDate: new Date().toISOString()
          }
        });

        // Log the response
        await auditService.logDataProcessing({
          requestId: `${testRequestId}_right_response_${i}`,
          action: right.response,
          dataSubjectId: testDataSubjectId,
          dataType: 'data_subject_response',
          processingPurpose: 'data_subject_rights_fulfillment',
          legalBasis: 'legal_obligation',
          metadata: {
            gdprRight: right.right,
            requestType: 'response',
            testCase: 'data_subject_rights',
            responseDate: new Date().toISOString(),
            timeTaken: '5_days'
          }
        });
      }

      // Verify data subject rights audit trail
      const rightsAudit = await auditService.queryAuditLogs({
        eventType: 'data_processing',
        dataSubjectId: testDataSubjectId,
        limit: 50
      });

      const rightsLogs = rightsAudit.logs.filter(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.testCase === 'data_subject_rights';
        } catch {
          return false;
        }
      });

      expect(rightsLogs).toHaveLength(dataSubjectRights.length * 2); // Request + Response for each right

      // Verify all GDPR rights are covered
      const coveredRights = new Set();
      rightsLogs.forEach(log => {
        const metadata = JSON.parse(log.metadata);
        coveredRights.add(metadata.gdprRight);
      });

      expect(coveredRights.size).toBe(dataSubjectRights.length);
      dataSubjectRights.forEach(right => {
        expect(coveredRights.has(right.right)).toBe(true);
      });

      // Verify request-response pairing
      const rightsPairs = {};
      rightsLogs.forEach(log => {
        const metadata = JSON.parse(log.metadata);
        const right = metadata.gdprRight;

        if (!rightsPairs[right]) {
          rightsPairs[right] = { request: null, response: null };
        }

        if (metadata.requestType === 'initial_request') {
          rightsPairs[right].request = log;
        } else if (metadata.requestType === 'response') {
          rightsPairs[right].response = log;
        }
      });

      // Verify each right has both request and response
      Object.keys(rightsPairs).forEach(right => {
        expect(rightsPairs[right].request).toBeDefined();
        expect(rightsPairs[right].response).toBeDefined();

        const requestTime = new Date(rightsPairs[right].request.created_at);
        const responseTime = new Date(rightsPairs[right].response.created_at);
        expect(responseTime.getTime()).toBeGreaterThanOrEqual(requestTime.getTime());
      });
    });

    it('should track data retention and deletion compliance', async () => {
      const retentionScenarios = [
        {
          dataType: 'customer_data',
          retentionPeriod: '7_years',
          deleteAfter: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000),
          status: 'active'
        },
        {
          dataType: 'marketing_data',
          retentionPeriod: '2_years',
          deleteAfter: new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000),
          status: 'active'
        },
        {
          dataType: 'session_data',
          retentionPeriod: '30_days',
          deleteAfter: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: 'active'
        },
        {
          dataType: 'expired_data',
          retentionPeriod: '1_year',
          deleteAfter: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // Already expired
          status: 'should_delete'
        }
      ];

      // Log data retention tracking
      for (let i = 0; i < retentionScenarios.length; i++) {
        const scenario = retentionScenarios[i];

        await auditService.logDataProcessing({
          requestId: `${testRequestId}_retention_${i}`,
          action: 'data_retention_tracked',
          dataSubjectId: testDataSubjectId,
          dataType: scenario.dataType,
          processingPurpose: 'data_retention_compliance',
          legalBasis: 'legal_obligation',
          retentionPeriod: scenario.retentionPeriod,
          metadata: {
            retentionCompliance: true,
            deleteAfter: scenario.deleteAfter.toISOString(),
            currentStatus: scenario.status,
            testCase: 'retention_tracking'
          }
        });

        // If data should be deleted, log the deletion
        if (scenario.status === 'should_delete') {
          await auditService.logDataProcessing({
            requestId: `${testRequestId}_deletion_${i}`,
            action: 'data_deleted_for_retention',
            dataSubjectId: testDataSubjectId,
            dataType: scenario.dataType,
            processingPurpose: 'data_retention_compliance',
            legalBasis: 'legal_obligation',
            metadata: {
              retentionCompliance: true,
              deletionReason: 'retention_period_expired',
              originalRetentionPeriod: scenario.retentionPeriod,
              testCase: 'retention_deletion'
            }
          });
        }
      }

      // Verify retention tracking audit
      const retentionAudit = await auditService.queryAuditLogs({
        eventType: 'data_processing',
        dataSubjectId: testDataSubjectId,
        limit: 50
      });

      const retentionLogs = retentionAudit.logs.filter(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.testCase === 'retention_tracking' || metadata.testCase === 'retention_deletion';
        } catch {
          return false;
        }
      });

      expect(retentionLogs.length).toBeGreaterThanOrEqual(retentionScenarios.length);

      // Verify retention periods are tracked
      const retentionPeriods = retentionLogs
        .filter(log => log.retention_period)
        .map(log => log.retention_period);

      expect(retentionPeriods).toContain('7_years');
      expect(retentionPeriods).toContain('2_years');
      expect(retentionPeriods).toContain('30_days');
      expect(retentionPeriods).toContain('1_year');

      // Verify deletion tracking for expired data
      const deletionLogs = retentionLogs.filter(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.testCase === 'retention_deletion';
        } catch {
          return false;
        }
      });

      expect(deletionLogs.length).toBeGreaterThan(0);
      deletionLogs.forEach(log => {
        expect(log.action).toBe('data_deleted_for_retention');
        const metadata = JSON.parse(log.metadata);
        expect(metadata.deletionReason).toBe('retention_period_expired');
      });
    });
  });

  describe('Financial Audit Compliance', () => {
    it('should maintain complete financial transaction audit trail', async () => {
      const financialTransactionFlow = [
        {
          stage: 'initiation',
          action: 'payment_session_created',
          amount: 5000,
          status: 'pending',
          details: { method: 'card', processor: 'stripe' }
        },
        {
          stage: 'authorization',
          action: 'payment_authorized',
          amount: 5000,
          status: 'authorized',
          details: { authCode: 'AUTH123', cardLast4: '4242' }
        },
        {
          stage: 'capture',
          action: 'payment_captured',
          amount: 5000,
          status: 'completed',
          details: { chargeId: 'ch_test_123', fees: 175 }
        },
        {
          stage: 'reconciliation',
          action: 'payment_reconciled',
          amount: 5000,
          status: 'reconciled',
          details: { settlementId: 'po_test_123', netAmount: 4825 }
        }
      ];

      // Log complete financial transaction flow
      for (let i = 0; i < financialTransactionFlow.length; i++) {
        const stage = financialTransactionFlow[i];

        await auditService.logFinancialEvent({
          requestId: `${testRequestId}_financial_${i}`,
          action: stage.action,
          amountCents: stage.amount,
          currency: 'USD',
          transactionReference: testTransactionRef,
          paymentStatus: stage.status,
          targetType: 'financial_transaction',
          targetId: testTransactionRef,
          metadata: {
            financialCompliance: true,
            transactionStage: stage.stage,
            stageIndex: i,
            processorDetails: stage.details,
            testCase: 'financial_audit_compliance'
          }
        });
      }

      // Verify complete financial audit trail
      const financialAudit = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        transactionReference: testTransactionRef,
        limit: 50
      });

      const financialLogs = financialAudit.logs.filter(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.testCase === 'financial_audit_compliance';
        } catch {
          return false;
        }
      });

      expect(financialLogs).toHaveLength(financialTransactionFlow.length);

      // Verify transaction flow sequence
      const sortedLogs = financialLogs.sort((a, b) => {
        const aMetadata = JSON.parse(a.metadata);
        const bMetadata = JSON.parse(b.metadata);
        return aMetadata.stageIndex - bMetadata.stageIndex;
      });

      sortedLogs.forEach((log, index) => {
        const stage = financialTransactionFlow[index];
        expect(log.action).toBe(stage.action);
        expect(log.amount_cents).toBe(stage.amount);
        expect(log.payment_status).toBe(stage.status);
        expect(log.transaction_reference).toBe(testTransactionRef);

        const metadata = JSON.parse(log.metadata);
        expect(metadata.transactionStage).toBe(stage.stage);
        expect(metadata.financialCompliance).toBe(true);
      });

      // Verify financial data integrity
      const amounts = financialLogs.map(log => log.amount_cents);
      expect(new Set(amounts)).toEqual(new Set([5000])); // All amounts should be consistent

      const currencies = financialLogs.map(log => log.currency);
      expect(new Set(currencies)).toEqual(new Set(['USD'])); // Currency should be consistent
    });

    it('should track financial reconciliation and settlement audit trail', async () => {
      const reconciliationEvents = [
        {
          action: 'daily_reconciliation_started',
          scope: 'daily_batch',
          metadata: { batchDate: '2026-05-15', expectedTransactions: 50 }
        },
        {
          action: 'stripe_data_fetched',
          scope: 'external_data',
          metadata: { dataSource: 'stripe_api', recordCount: 48, fetchTime: '2026-05-15T10:00:00Z' }
        },
        {
          action: 'database_data_aggregated',
          scope: 'internal_data',
          metadata: { dataSource: 'local_database', recordCount: 50, aggregationTime: '2026-05-15T10:05:00Z' }
        },
        {
          action: 'discrepancy_detected',
          scope: 'reconciliation',
          metadata: { discrepancyType: 'count_mismatch', expected: 50, actual: 48, variance: -2 }
        },
        {
          action: 'discrepancy_investigated',
          scope: 'investigation',
          metadata: { investigationResult: 'pending_transactions', resolutionRequired: true }
        },
        {
          action: 'reconciliation_completed',
          scope: 'final',
          metadata: { status: 'reconciled_with_notes', totalAmount: 250000, reconciled: true }
        }
      ];

      // Log reconciliation audit trail
      for (let i = 0; i < reconciliationEvents.length; i++) {
        const event = reconciliationEvents[i];

        await auditService.logFinancialEvent({
          requestId: `${testRequestId}_reconciliation_${i}`,
          action: event.action,
          amountCents: event.metadata.totalAmount || null,
          currency: 'USD',
          transactionReference: `reconciliation_${testRequestId}`,
          paymentStatus: 'reconciliation_process',
          targetType: 'reconciliation',
          targetId: `recon_${testRequestId}`,
          metadata: {
            reconciliationCompliance: true,
            reconciliationScope: event.scope,
            eventIndex: i,
            ...event.metadata,
            testCase: 'reconciliation_audit'
          }
        });
      }

      // Verify reconciliation audit trail
      const reconciliationAudit = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        limit: 50
      });

      const reconciliationLogs = reconciliationAudit.logs.filter(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.testCase === 'reconciliation_audit';
        } catch {
          return false;
        }
      });

      expect(reconciliationLogs).toHaveLength(reconciliationEvents.length);

      // Verify reconciliation process completeness
      const reconciliationActions = reconciliationLogs.map(log => log.action);
      expect(reconciliationActions).toContain('daily_reconciliation_started');
      expect(reconciliationActions).toContain('stripe_data_fetched');
      expect(reconciliationActions).toContain('database_data_aggregated');
      expect(reconciliationActions).toContain('discrepancy_detected');
      expect(reconciliationActions).toContain('reconciliation_completed');

      // Verify discrepancy tracking
      const discrepancyLogs = reconciliationLogs.filter(log =>
        log.action.includes('discrepancy'));

      expect(discrepancyLogs.length).toBeGreaterThan(0);
      discrepancyLogs.forEach(log => {
        const metadata = JSON.parse(log.metadata);
        expect(metadata.reconciliationCompliance).toBe(true);
      });

      // Verify data source tracking
      const dataSourceLogs = reconciliationLogs.filter(log => {
        const metadata = JSON.parse(log.metadata);
        return metadata.dataSource;
      });

      const dataSources = dataSourceLogs.map(log => {
        const metadata = JSON.parse(log.metadata);
        return metadata.dataSource;
      });

      expect(dataSources).toContain('stripe_api');
      expect(dataSources).toContain('local_database');
    });

    it('should maintain audit trail for financial corrections and adjustments', async () => {
      const financialCorrections = [
        {
          type: 'refund_processing',
          action: 'refund_initiated',
          originalAmount: 5000,
          refundAmount: -4750,
          reason: 'customer_request'
        },
        {
          type: 'fee_adjustment',
          action: 'fee_corrected',
          originalAmount: 175,
          adjustedAmount: 145,
          reason: 'incorrect_rate_applied'
        },
        {
          type: 'chargeback_handling',
          action: 'chargeback_received',
          originalAmount: 5000,
          chargebackAmount: -5000,
          reason: 'disputed_transaction'
        },
        {
          type: 'settlement_correction',
          action: 'settlement_adjusted',
          originalAmount: 4825,
          adjustedAmount: 4855,
          reason: 'bank_fee_refund'
        }
      ];

      // Log financial corrections
      for (let i = 0; i < financialCorrections.length; i++) {
        const correction = financialCorrections[i];

        // Log original transaction if it's not a correction to existing
        if (correction.type !== 'fee_adjustment') {
          await auditService.logFinancialEvent({
            requestId: `${testRequestId}_original_${i}`,
            action: 'original_transaction',
            amountCents: correction.originalAmount,
            currency: 'USD',
            transactionReference: `${testTransactionRef}_${i}`,
            paymentStatus: 'completed',
            targetType: 'transaction',
            targetId: `${testTransactionRef}_${i}`,
            metadata: {
              correctionCompliance: true,
              transactionType: 'original',
              testCase: 'financial_corrections'
            }
          });
        }

        // Log the correction
        await auditService.logFinancialEvent({
          requestId: `${testRequestId}_correction_${i}`,
          action: correction.action,
          amountCents: correction.type === 'fee_adjustment' ? correction.adjustedAmount :
                      correction.refundAmount || correction.chargebackAmount || correction.adjustedAmount,
          currency: 'USD',
          transactionReference: `${testTransactionRef}_${i}`,
          paymentStatus: 'adjustment',
          targetType: 'correction',
          targetId: `correction_${i}`,
          metadata: {
            correctionCompliance: true,
            correctionType: correction.type,
            correctionReason: correction.reason,
            originalAmount: correction.originalAmount,
            adjustedAmount: correction.type === 'fee_adjustment' ? correction.adjustedAmount :
                          correction.refundAmount || correction.chargebackAmount || correction.adjustedAmount,
            testCase: 'financial_corrections'
          }
        });
      }

      // Verify financial corrections audit trail
      const correctionsAudit = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        limit: 50
      });

      const correctionsLogs = correctionsAudit.logs.filter(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.testCase === 'financial_corrections';
        } catch {
          return false;
        }
      });

      expect(correctionsLogs.length).toBeGreaterThan(financialCorrections.length);

      // Verify all correction types are tracked
      const correctionLogs = correctionsLogs.filter(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.transactionType !== 'original';
        } catch {
          return false;
        }
      });

      const correctionTypes = correctionLogs.map(log => {
        const metadata = JSON.parse(log.metadata);
        return metadata.correctionType;
      });

      expect(correctionTypes).toContain('refund_processing');
      expect(correctionTypes).toContain('fee_adjustment');
      expect(correctionTypes).toContain('chargeback_handling');
      expect(correctionTypes).toContain('settlement_correction');

      // Verify correction reasons are documented
      correctionLogs.forEach(log => {
        const metadata = JSON.parse(log.metadata);
        expect(metadata.correctionReason).toBeDefined();
        expect(metadata.originalAmount).toBeDefined();
        expect(metadata.adjustedAmount).toBeDefined();
      });
    });
  });

  describe('Admin Access Audit Coverage', () => {
    it('should track all privileged admin operations comprehensively', async () => {
      const privilegedOperations = [
        {
          category: 'user_management',
          operation: 'admin_user_created',
          url: '/api/admin/users',
          method: 'POST',
          sensitivity: 'high'
        },
        {
          category: 'financial_access',
          operation: 'financial_data_accessed',
          url: '/api/admin/financial/transactions',
          method: 'GET',
          sensitivity: 'critical'
        },
        {
          category: 'system_configuration',
          operation: 'system_settings_modified',
          url: '/api/admin/system/config',
          method: 'PUT',
          sensitivity: 'high'
        },
        {
          category: 'data_export',
          operation: 'bulk_data_exported',
          url: '/api/admin/export/customer-data',
          method: 'POST',
          sensitivity: 'critical'
        },
        {
          category: 'security_management',
          operation: 'security_policy_updated',
          url: '/api/admin/security/policies',
          method: 'PUT',
          sensitivity: 'critical'
        },
        {
          category: 'audit_access',
          operation: 'audit_logs_accessed',
          url: '/api/admin/audit-logs',
          method: 'GET',
          sensitivity: 'high'
        }
      ];

      const sessionId = `admin_session_${testRequestId}`;
      const ipAddress = '10.0.1.100';

      // Log all privileged operations
      for (let i = 0; i < privilegedOperations.length; i++) {
        const operation = privilegedOperations[i];

        await auditService.logAdminAccess({
          requestId: `${testRequestId}_privileged_${i}`,
          adminUser: testAdminUser,
          sessionId,
          ipAddress,
          userAgent: 'AdminBrowser/1.0',
          requestMethod: operation.method,
          requestUrl: operation.url,
          requestBody: operation.method === 'POST' || operation.method === 'PUT' ?
            { operation: operation.operation } : null,
          responseStatus: 200,
          responseTimeMs: 150 + (i * 25),
          metadata: {
            adminCompliance: true,
            operationCategory: operation.category,
            operationSensitivity: operation.sensitivity,
            privilegedOperation: true,
            testCase: 'privileged_operations'
          }
        });
      }

      // Verify privileged operations audit coverage
      const privilegedAudit = await auditService.queryAuditLogs({
        eventType: 'admin_access',
        adminUser: testAdminUser,
        limit: 50
      });

      const privilegedLogs = privilegedAudit.logs.filter(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.testCase === 'privileged_operations';
        } catch {
          return false;
        }
      });

      expect(privilegedLogs).toHaveLength(privilegedOperations.length);

      // Verify all operation categories are covered
      const categories = privilegedLogs.map(log => {
        const metadata = JSON.parse(log.metadata);
        return metadata.operationCategory;
      });

      const uniqueCategories = new Set(categories);
      expect(uniqueCategories.size).toBe(privilegedOperations.length);

      // Verify critical operations are flagged appropriately
      const criticalOperations = privilegedLogs.filter(log => {
        const metadata = JSON.parse(log.metadata);
        return metadata.operationSensitivity === 'critical';
      });

      expect(criticalOperations.length).toBeGreaterThan(0);
      criticalOperations.forEach(log => {
        const metadata = JSON.parse(log.metadata);
        expect(['financial_access', 'data_export', 'security_management'])
          .toContain(metadata.operationCategory);
      });

      // Verify session consistency across operations
      privilegedLogs.forEach(log => {
        expect(log.session_id).toBe(sessionId);
        expect(log.ip_address).toBe(ipAddress);
        expect(log.admin_user).toBe(testAdminUser);
      });
    });

    it('should track admin session security events', async () => {
      const securityEvents = [
        {
          event: 'mfa_authentication_successful',
          severity: 'info',
          details: { method: 'totp', device: 'mobile_app' }
        },
        {
          event: 'suspicious_ip_detected',
          severity: 'warning',
          details: { previousIp: '10.0.1.100', currentIp: '192.168.1.200', location: 'different_country' }
        },
        {
          event: 'concurrent_session_detected',
          severity: 'warning',
          details: { sessionCount: 2, locations: ['office', 'remote'] }
        },
        {
          event: 'failed_privilege_escalation',
          severity: 'error',
          details: { attemptedOperation: 'root_access', deniedReason: 'insufficient_privileges' }
        },
        {
          event: 'session_timeout_extended',
          severity: 'warning',
          details: { originalTimeout: '8h', newTimeout: '12h', justification: 'critical_maintenance' }
        }
      ];

      // Log security events
      for (let i = 0; i < securityEvents.length; i++) {
        const event = securityEvents[i];

        await auditService.logAdminAccess({
          requestId: `${testRequestId}_security_${i}`,
          adminUser: testAdminUser,
          sessionId: `session_${testRequestId}`,
          ipAddress: event.details.currentIp || '10.0.1.100',
          userAgent: 'SecureBrowser/1.0',
          requestMethod: 'POST',
          requestUrl: '/api/admin/security/event',
          responseStatus: event.severity === 'error' ? 403 : 200,
          responseTimeMs: 100,
          metadata: {
            securityCompliance: true,
            securityEvent: event.event,
            securityDetails: event.details,
            testCase: 'admin_security_events'
          }
        });
      }

      // Verify security events audit trail
      const securityAudit = await auditService.queryAuditLogs({
        eventType: 'admin_access',
        adminUser: testAdminUser,
        limit: 50
      });

      const securityLogs = securityAudit.logs.filter(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.testCase === 'admin_security_events';
        } catch {
          return false;
        }
      });

      expect(securityLogs).toHaveLength(securityEvents.length);

      // Verify security event types are tracked
      const eventTypes = securityLogs.map(log => {
        const metadata = JSON.parse(log.metadata);
        return metadata.securityEvent;
      });

      expect(eventTypes).toContain('mfa_authentication_successful');
      expect(eventTypes).toContain('suspicious_ip_detected');
      expect(eventTypes).toContain('concurrent_session_detected');
      expect(eventTypes).toContain('failed_privilege_escalation');
      expect(eventTypes).toContain('session_timeout_extended');

      // Verify failed operations have appropriate response status
      const failedOperations = securityLogs.filter(log => {
        const metadata = JSON.parse(log.metadata);
        return metadata.securityEvent.includes('failed');
      });

      failedOperations.forEach(log => {
        expect(log.response_status).toBe(403);
      });

      // Verify security details are preserved
      securityLogs.forEach(log => {
        const metadata = JSON.parse(log.metadata);
        expect(metadata.securityDetails).toBeDefined();
        expect(typeof metadata.securityDetails).toBe('object');
      });
    });

    it('should maintain admin accountability through comprehensive session tracking', async () => {
      const sessionActivities = [
        { action: 'session_started', timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000) }, // 2 hours ago
        { action: 'dashboard_accessed', timestamp: new Date(Date.now() - 115 * 60 * 1000) }, // 115 minutes ago
        { action: 'customer_data_viewed', timestamp: new Date(Date.now() - 110 * 60 * 1000) }, // 110 minutes ago
        { action: 'transaction_modified', timestamp: new Date(Date.now() - 105 * 60 * 1000) }, // 105 minutes ago
        { action: 'report_generated', timestamp: new Date(Date.now() - 100 * 60 * 1000) }, // 100 minutes ago
        { action: 'settings_updated', timestamp: new Date(Date.now() - 95 * 60 * 1000) }, // 95 minutes ago
        { action: 'session_idle_warning', timestamp: new Date(Date.now() - 30 * 60 * 1000) }, // 30 minutes ago
        { action: 'session_extended', timestamp: new Date(Date.now() - 25 * 60 * 1000) }, // 25 minutes ago
        { action: 'session_ended', timestamp: new Date(Date.now() - 5 * 60 * 1000) } // 5 minutes ago
      ];

      const accountabilitySessionId = `accountability_${testRequestId}`;

      // Log session activities with timestamps
      for (let i = 0; i < sessionActivities.length; i++) {
        const activity = sessionActivities[i];

        // Manually insert with specific timestamp for testing
        await db.execute(`
          INSERT INTO audit_logs (
            request_id, event_type, action, admin_user, session_id,
            ip_address, user_agent, request_method, request_url,
            response_status, response_time_ms, metadata, severity, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          `${testRequestId}_accountability_${i}`,
          'admin_access',
          activity.action,
          testAdminUser,
          accountabilitySessionId,
          '10.0.1.100',
          'AccountabilityBrowser/1.0',
          'POST',
          `/api/admin/${activity.action.replace('_', '/')}`,
          200,
          100,
          JSON.stringify({
            accountabilityTracking: true,
            sessionPhase: i < 6 ? 'active' : i < 8 ? 'idle_management' : 'termination',
            testCase: 'admin_accountability'
          }),
          'info',
          activity.timestamp.toISOString()
        ]);
      }

      // Verify comprehensive session tracking
      const accountabilityAudit = await auditService.queryAuditLogs({
        eventType: 'admin_access',
        adminUser: testAdminUser,
        sessionId: accountabilitySessionId,
        orderBy: 'created_at',
        orderDirection: 'ASC',
        limit: 50
      });

      const accountabilityLogs = accountabilityAudit.logs.filter(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.testCase === 'admin_accountability';
        } catch {
          return false;
        }
      });

      expect(accountabilityLogs).toHaveLength(sessionActivities.length);

      // Verify session lifecycle tracking
      const sessionActions = accountabilityLogs.map(log => log.action);
      expect(sessionActions[0]).toBe('session_started');
      expect(sessionActions[sessionActions.length - 1]).toBe('session_ended');

      // Verify chronological order
      for (let i = 1; i < accountabilityLogs.length; i++) {
        const prevTime = new Date(accountabilityLogs[i - 1].created_at);
        const currentTime = new Date(accountabilityLogs[i].created_at);
        expect(currentTime.getTime()).toBeGreaterThanOrEqual(prevTime.getTime());
      }

      // Verify session duration tracking
      const sessionStart = new Date(accountabilityLogs[0].created_at);
      const sessionEnd = new Date(accountabilityLogs[accountabilityLogs.length - 1].created_at);
      const sessionDuration = sessionEnd.getTime() - sessionStart.getTime();

      // Session should be approximately 2 hours (115 minutes = 6.9 million ms)
      expect(sessionDuration).toBeGreaterThan(6 * 60 * 1000); // At least 6 minutes
      expect(sessionDuration).toBeLessThan(3 * 60 * 60 * 1000); // Less than 3 hours

      // Verify activity phases are tracked
      const activePhase = accountabilityLogs.filter(log => {
        const metadata = JSON.parse(log.metadata);
        return metadata.sessionPhase === 'active';
      });

      const idlePhase = accountabilityLogs.filter(log => {
        const metadata = JSON.parse(log.metadata);
        return metadata.sessionPhase === 'idle_management';
      });

      const terminationPhase = accountabilityLogs.filter(log => {
        const metadata = JSON.parse(log.metadata);
        return metadata.sessionPhase === 'termination';
      });

      expect(activePhase.length).toBeGreaterThan(0);
      expect(idlePhase.length).toBeGreaterThan(0);
      expect(terminationPhase.length).toBeGreaterThan(0);
    });
  });

  describe('Data Change Tracking Completeness', () => {
    it('should track all CRUD operations with complete before/after state capture', async () => {
      const crudOperations = [
        {
          operation: 'CREATE',
          action: 'customer_record_created',
          beforeValue: null,
          afterValue: {
            id: 'customer_001',
            name: 'John Doe',
            email: 'john@example.com',
            status: 'active',
            created: new Date().toISOString()
          }
        },
        {
          operation: 'READ',
          action: 'customer_record_accessed',
          beforeValue: null, // Read operations don't change data
          afterValue: null,
          metadata: { accessPurpose: 'customer_support', fieldsAccessed: ['name', 'email', 'order_history'] }
        },
        {
          operation: 'UPDATE',
          action: 'customer_record_updated',
          beforeValue: {
            id: 'customer_001',
            name: 'John Doe',
            email: 'john@example.com',
            status: 'active',
            phone: null
          },
          afterValue: {
            id: 'customer_001',
            name: 'John Doe',
            email: 'john.doe@example.com',
            status: 'active',
            phone: '+1234567890'
          }
        },
        {
          operation: 'DELETE',
          action: 'customer_record_deleted',
          beforeValue: {
            id: 'customer_001',
            name: 'John Doe',
            email: 'john.doe@example.com',
            status: 'active',
            phone: '+1234567890'
          },
          afterValue: null
        }
      ];

      // Log CRUD operations
      for (let i = 0; i < crudOperations.length; i++) {
        const op = crudOperations[i];

        if (op.operation === 'READ') {
          // For read operations, use data processing log
          await auditService.logDataProcessing({
            requestId: `${testRequestId}_crud_${i}`,
            action: op.action,
            dataSubjectId: 'customer_001',
            dataType: 'customer_record',
            processingPurpose: 'customer_support',
            legalBasis: 'legitimate_interests',
            metadata: {
              dataChangeCompliance: true,
              crudOperation: op.operation,
              operationIndex: i,
              ...op.metadata,
              testCase: 'crud_operations'
            }
          });
        } else {
          // For CUD operations, use data change log
          await auditService.logDataChange({
            requestId: `${testRequestId}_crud_${i}`,
            action: op.action,
            targetType: 'customer',
            targetId: 'customer_001',
            beforeValue: op.beforeValue,
            afterValue: op.afterValue,
            changedFields: op.operation === 'UPDATE' ? ['email', 'phone'] :
                          op.operation === 'CREATE' ? ['id', 'name', 'email', 'status', 'created'] :
                          ['deleted'],
            adminUser: testAdminUser,
            metadata: {
              dataChangeCompliance: true,
              crudOperation: op.operation,
              operationIndex: i,
              testCase: 'crud_operations'
            }
          });
        }
      }

      // Verify CRUD operations tracking
      const crudAudit = await auditService.queryAuditLogs({
        limit: 50
      });

      const crudLogs = crudAudit.logs.filter(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.testCase === 'crud_operations';
        } catch {
          return false;
        }
      });

      expect(crudLogs).toHaveLength(crudOperations.length);

      // Verify all CRUD operations are tracked
      const operations = crudLogs.map(log => {
        const metadata = JSON.parse(log.metadata);
        return metadata.crudOperation;
      });

      expect(operations).toContain('CREATE');
      expect(operations).toContain('READ');
      expect(operations).toContain('UPDATE');
      expect(operations).toContain('DELETE');

      // Verify before/after state capture
      const createLog = crudLogs.find(log => {
        const metadata = JSON.parse(log.metadata);
        return metadata.crudOperation === 'CREATE';
      });

      expect(createLog.before_value).toBeNull();
      expect(createLog.after_value).toBeDefined();

      const beforeAfterCreate = JSON.parse(createLog.after_value);
      expect(beforeAfterCreate.id).toBe('customer_001');
      expect(beforeAfterCreate.name).toBe('John Doe');

      const updateLog = crudLogs.find(log => {
        const metadata = JSON.parse(log.metadata);
        return metadata.crudOperation === 'UPDATE';
      });

      expect(updateLog.before_value).toBeDefined();
      expect(updateLog.after_value).toBeDefined();

      const beforeUpdate = JSON.parse(updateLog.before_value);
      const afterUpdate = JSON.parse(updateLog.after_value);

      expect(beforeUpdate.email).toBe('john@example.com');
      expect(afterUpdate.email).toBe('john.doe@example.com');
      expect(beforeUpdate.phone).toBeNull();
      expect(afterUpdate.phone).toBe('+1234567890');

      const deleteLog = crudLogs.find(log => {
        const metadata = JSON.parse(log.metadata);
        return metadata.crudOperation === 'DELETE';
      });

      expect(deleteLog.before_value).toBeDefined();
      expect(deleteLog.after_value).toBeNull();
    });

    it('should track bulk operations with complete audit trail', async () => {
      const bulkOperations = [
        {
          operation: 'bulk_create',
          action: 'bulk_customers_created',
          recordCount: 100,
          affectedRecords: Array.from({ length: 5 }, (_, i) => `customer_${i + 100}`)
        },
        {
          operation: 'bulk_update',
          action: 'bulk_status_updated',
          recordCount: 50,
          affectedRecords: Array.from({ length: 3 }, (_, i) => `customer_${i + 100}`),
          changes: { status: 'inactive', updatedBy: testAdminUser }
        },
        {
          operation: 'bulk_delete',
          action: 'bulk_records_deleted',
          recordCount: 25,
          affectedRecords: Array.from({ length: 2 }, (_, i) => `customer_${i + 103}`)
        }
      ];

      // Log bulk operations
      for (let i = 0; i < bulkOperations.length; i++) {
        const bulkOp = bulkOperations[i];

        // Log the bulk operation summary
        await auditService.logDataChange({
          requestId: `${testRequestId}_bulk_summary_${i}`,
          action: bulkOp.action,
          targetType: 'bulk_operation',
          targetId: `bulk_${i}`,
          beforeValue: null,
          afterValue: {
            operation: bulkOp.operation,
            recordCount: bulkOp.recordCount,
            status: 'completed'
          },
          changedFields: ['operation', 'recordCount', 'status'],
          adminUser: testAdminUser,
          metadata: {
            bulkCompliance: true,
            bulkOperation: bulkOp.operation,
            totalRecords: bulkOp.recordCount,
            affectedRecords: bulkOp.affectedRecords,
            testCase: 'bulk_operations'
          }
        });

        // Log individual record changes (sample)
        for (const recordId of bulkOp.affectedRecords) {
          await auditService.logDataChange({
            requestId: `${testRequestId}_bulk_detail_${i}_${recordId}`,
            action: `individual_${bulkOp.operation}`,
            targetType: 'customer',
            targetId: recordId,
            beforeValue: bulkOp.operation === 'bulk_create' ? null :
                        bulkOp.operation === 'bulk_update' ? { status: 'active' } :
                        { id: recordId, status: 'inactive' },
            afterValue: bulkOp.operation === 'bulk_delete' ? null :
                       bulkOp.operation === 'bulk_create' ? { id: recordId, status: 'active' } :
                       { id: recordId, status: 'inactive', updatedBy: testAdminUser },
            changedFields: bulkOp.operation === 'bulk_create' ? ['id', 'status'] :
                          bulkOp.operation === 'bulk_update' ? ['status', 'updatedBy'] :
                          ['deleted'],
            adminUser: testAdminUser,
            metadata: {
              bulkCompliance: true,
              bulkOperationId: `bulk_${i}`,
              partOfBulkOperation: true,
              testCase: 'bulk_operations_detail'
            }
          });
        }
      }

      // Verify bulk operations tracking
      const bulkAudit = await auditService.queryAuditLogs({
        adminUser: testAdminUser,
        limit: 100
      });

      const bulkSummaryLogs = bulkAudit.logs.filter(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.testCase === 'bulk_operations';
        } catch {
          return false;
        }
      });

      const bulkDetailLogs = bulkAudit.logs.filter(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.testCase === 'bulk_operations_detail';
        } catch {
          return false;
        }
      });

      expect(bulkSummaryLogs).toHaveLength(bulkOperations.length);
      expect(bulkDetailLogs.length).toBeGreaterThan(0);

      // Verify bulk operation summary tracking
      bulkSummaryLogs.forEach((log, index) => {
        const bulkOp = bulkOperations[index];
        const afterValue = JSON.parse(log.after_value);

        expect(afterValue.operation).toBe(bulkOp.operation);
        expect(afterValue.recordCount).toBe(bulkOp.recordCount);

        const metadata = JSON.parse(log.metadata);
        expect(metadata.totalRecords).toBe(bulkOp.recordCount);
        expect(metadata.affectedRecords).toEqual(bulkOp.affectedRecords);
      });

      // Verify individual record tracking within bulk operations
      const bulkCreateDetails = bulkDetailLogs.filter(log => log.action === 'individual_bulk_create');
      const bulkUpdateDetails = bulkDetailLogs.filter(log => log.action === 'individual_bulk_update');
      const bulkDeleteDetails = bulkDetailLogs.filter(log => log.action === 'individual_bulk_delete');

      expect(bulkCreateDetails.length).toBe(5); // 5 records in bulk create
      expect(bulkUpdateDetails.length).toBe(3); // 3 records in bulk update
      expect(bulkDeleteDetails.length).toBe(2); // 2 records in bulk delete

      // Verify correlation between summary and detail logs
      bulkDetailLogs.forEach(log => {
        const metadata = JSON.parse(log.metadata);
        expect(metadata.partOfBulkOperation).toBe(true);
        expect(metadata.bulkOperationId).toMatch(/^bulk_\d+$/);
      });
    });
  });
});
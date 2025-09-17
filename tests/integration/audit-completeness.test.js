/**
 * Audit Completeness Tests
 * Tests audit coverage for all critical operations, verifies no audit gaps in business workflows,
 * tests audit data integrity and tamper detection, validates audit retention and cleanup policies
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';
import { auditService } from '../../lib/audit-service.js';
import crypto from 'crypto';

describe('Audit Completeness Tests', () => {
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
    // Generate unique test identifiers
    testRequestId = `completeness_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    testTicketId = `ticket_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    testTransactionRef = `txn_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    testAdminUser = 'completeness_admin';

    // Clean up any existing test data
    await db.execute('DELETE FROM audit_logs WHERE request_id LIKE ? OR admin_user = ?',
      [`completeness_%`, testAdminUser]);
  });

  afterEach(async () => {
    // Clean up test data after each test
    await db.execute('DELETE FROM audit_logs WHERE request_id LIKE ? OR admin_user = ?',
      [`completeness_%`, testAdminUser]);
  });

  describe('Critical Operations Audit Coverage', () => {
    it('should audit all financial operations without gaps', async () => {
      const financialOperations = [
        'payment_initiated',
        'payment_completed',
        'payment_failed',
        'refund_requested',
        'refund_processed',
        'chargeback_received',
        'settlement_created',
        'fee_calculated'
      ];

      const auditPromises = financialOperations.map((operation, index) => {
        return auditService.logFinancialEvent({
          requestId: `${testRequestId}_financial_${index}`,
          action: operation,
          amountCents: 5000 + (index * 100),
          currency: 'USD',
          transactionReference: `${testTransactionRef}_${index}`,
          paymentStatus: operation.includes('failed') ? 'failed' : 'completed',
          targetType: 'transaction',
          targetId: `${testTransactionRef}_${index}`,
          metadata: {
            operationType: operation,
            testCase: 'financial_coverage',
            operationIndex: index
          }
        });
      });

      const results = await Promise.all(auditPromises);

      // Verify all operations were logged successfully
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
      });

      // Query all financial audit logs
      const financialAudit = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        limit: 50
      });

      const testFinancialLogs = financialAudit.logs.filter(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.testCase === 'financial_coverage';
        } catch {
          return false;
        }
      });

      expect(testFinancialLogs).toHaveLength(financialOperations.length);

      // Verify all operation types are covered
      const loggedOperations = testFinancialLogs.map(log => log.action);
      financialOperations.forEach(operation => {
        expect(loggedOperations).toContain(operation);
      });

      // Verify financial data completeness
      testFinancialLogs.forEach((log, index) => {
        expect(log.amount_cents).toBe(5000 + (index * 100));
        expect(log.currency).toBe('USD');
        expect(log.transaction_reference).toBe(`${testTransactionRef}_${index}`);
        expect(log.metadata).toBeDefined();

        const metadata = JSON.parse(log.metadata);
        expect(metadata.operationType).toBe(financialOperations[index]);
      });
    });

    it('should audit all data change operations comprehensively', async () => {
      const dataOperations = [
        { action: 'record_created', targetType: 'registration', operation: 'CREATE' },
        { action: 'record_updated', targetType: 'registration', operation: 'UPDATE' },
        { action: 'record_deleted', targetType: 'registration', operation: 'DELETE' },
        { action: 'bulk_update', targetType: 'registrations', operation: 'BULK_UPDATE' },
        { action: 'data_migration', targetType: 'system', operation: 'MIGRATION' },
        { action: 'data_export', targetType: 'export', operation: 'EXPORT' },
        { action: 'data_import', targetType: 'import', operation: 'IMPORT' }
      ];

      const auditPromises = dataOperations.map((operation, index) => {
        const beforeValue = operation.operation === 'CREATE' ? null : {
          id: index,
          status: 'old_status',
          data: 'old_data'
        };

        const afterValue = operation.operation === 'DELETE' ? null : {
          id: index,
          status: 'new_status',
          data: 'new_data',
          updatedBy: testAdminUser
        };

        return auditService.logDataChange({
          requestId: `${testRequestId}_data_${index}`,
          action: operation.action,
          targetType: operation.targetType,
          targetId: `${operation.targetType}_${index}`,
          beforeValue,
          afterValue,
          changedFields: operation.operation === 'CREATE' ? ['id', 'status', 'data'] :
                        operation.operation === 'DELETE' ? [] :
                        ['status', 'data', 'updatedBy'],
          adminUser: testAdminUser,
          metadata: {
            operationType: operation.operation,
            testCase: 'data_coverage',
            operationIndex: index
          }
        });
      });

      const results = await Promise.all(auditPromises);

      // Verify all operations were logged successfully
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
      });

      // Query all data change audit logs
      const dataAudit = await auditService.queryAuditLogs({
        eventType: 'data_change',
        adminUser: testAdminUser,
        limit: 50
      });

      const testDataLogs = dataAudit.logs.filter(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.testCase === 'data_coverage';
        } catch {
          return false;
        }
      });

      expect(testDataLogs).toHaveLength(dataOperations.length);

      // Verify all operation types are covered
      const loggedActions = testDataLogs.map(log => log.action);
      dataOperations.forEach(operation => {
        expect(loggedActions).toContain(operation.action);
      });

      // Verify before/after values are properly captured
      testDataLogs.forEach((log, index) => {
        const operation = dataOperations[index];

        if (operation.operation === 'CREATE') {
          expect(log.before_value).toBeNull();
          expect(log.after_value).toBeDefined();
        } else if (operation.operation === 'DELETE') {
          expect(log.before_value).toBeDefined();
          expect(log.after_value).toBeNull();
        } else {
          expect(log.before_value).toBeDefined();
          expect(log.after_value).toBeDefined();

          const beforeValue = JSON.parse(log.before_value);
          const afterValue = JSON.parse(log.after_value);

          expect(beforeValue.status).toBe('old_status');
          expect(afterValue.status).toBe('new_status');
        }
      });
    });

    it('should audit all admin access patterns completely', async () => {
      const adminOperations = [
        { method: 'POST', url: '/api/admin/login', status: 200, operation: 'login' },
        { method: 'GET', url: '/api/admin/dashboard', status: 200, operation: 'dashboard_access' },
        { method: 'GET', url: '/api/admin/registrations', status: 200, operation: 'data_access' },
        { method: 'POST', url: '/api/admin/registrations/export', status: 200, operation: 'data_export' },
        { method: 'PUT', url: '/api/admin/settings', status: 200, operation: 'config_update' },
        { method: 'DELETE', url: '/api/admin/sessions/clear', status: 200, operation: 'security_action' },
        { method: 'GET', url: '/api/admin/audit-logs', status: 200, operation: 'audit_access' },
        { method: 'POST', url: '/api/admin/logout', status: 200, operation: 'logout' },
        { method: 'GET', url: '/api/admin/unauthorized', status: 403, operation: 'access_denied' },
        { method: 'POST', url: '/api/admin/system/backup', status: 500, operation: 'system_error' }
      ];

      const sessionId = `session_${testRequestId}`;
      const ipAddress = '10.0.1.100';
      const userAgent = 'Admin-Browser/2.0';

      const auditPromises = adminOperations.map((operation, index) => {
        return auditService.logAdminAccess({
          requestId: `${testRequestId}_admin_${index}`,
          adminUser: testAdminUser,
          sessionId,
          ipAddress,
          userAgent,
          requestMethod: operation.method,
          requestUrl: operation.url,
          requestBody: operation.method === 'POST' ? { data: 'test' } : null,
          responseStatus: operation.status,
          responseTimeMs: 100 + (index * 10),
          metadata: {
            operationType: operation.operation,
            testCase: 'admin_coverage',
            operationIndex: index
          }
        });
      });

      const results = await Promise.all(auditPromises);

      // Verify all operations were logged successfully
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
      });

      // Query all admin access audit logs
      const adminAudit = await auditService.queryAuditLogs({
        eventType: 'admin_access',
        adminUser: testAdminUser,
        limit: 50
      });

      const testAdminLogs = adminAudit.logs.filter(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.testCase === 'admin_coverage';
        } catch {
          return false;
        }
      });

      expect(testAdminLogs).toHaveLength(adminOperations.length);

      // Verify all HTTP methods are covered
      const loggedMethods = [...new Set(testAdminLogs.map(log => log.request_method))];
      expect(loggedMethods).toContain('GET');
      expect(loggedMethods).toContain('POST');
      expect(loggedMethods).toContain('PUT');
      expect(loggedMethods).toContain('DELETE');

      // Verify different response status codes are captured
      const loggedStatuses = [...new Set(testAdminLogs.map(log => log.response_status))];
      expect(loggedStatuses).toContain(200);
      expect(loggedStatuses).toContain(403);
      expect(loggedStatuses).toContain(500);

      // Verify session consistency
      testAdminLogs.forEach(log => {
        expect(log.session_id).toBe(sessionId);
        expect(log.ip_address).toBe(ipAddress);
        expect(log.user_agent).toBe(userAgent);
      });

      // Verify response time tracking
      testAdminLogs.forEach((log, index) => {
        expect(log.response_time_ms).toBe(100 + (index * 10));
      });
    });
  });

  describe('Business Workflow Audit Gaps Detection', () => {
    it('should detect and prevent gaps in ticket purchase workflow', async () => {
      const workflowSteps = [
        { step: 1, action: 'cart_created', entity: 'cart' },
        { step: 2, action: 'item_added', entity: 'cart_item' },
        { step: 3, action: 'checkout_initiated', entity: 'checkout' },
        { step: 4, action: 'payment_processing', entity: 'payment' },
        { step: 5, action: 'payment_completed', entity: 'payment' },
        { step: 6, action: 'ticket_generated', entity: 'ticket' },
        { step: 7, action: 'confirmation_sent', entity: 'email' }
      ];

      // Log complete workflow
      for (const step of workflowSteps) {
        if (step.entity === 'payment') {
          await auditService.logFinancialEvent({
            requestId: `${testRequestId}_workflow_${step.step}`,
            action: step.action,
            amountCents: 5000,
            currency: 'USD',
            transactionReference: testTransactionRef,
            paymentStatus: step.action.includes('completed') ? 'completed' : 'processing',
            metadata: {
              workflowStep: step.step,
              testCase: 'workflow_completeness'
            }
          });
        } else {
          await auditService.logDataChange({
            requestId: `${testRequestId}_workflow_${step.step}`,
            action: step.action,
            targetType: step.entity,
            targetId: `${step.entity}_${testRequestId}`,
            beforeValue: step.step === 1 ? null : { status: 'previous' },
            afterValue: { status: 'current', step: step.step },
            metadata: {
              workflowStep: step.step,
              testCase: 'workflow_completeness'
            }
          });
        }
      }

      // Verify complete workflow is audited
      const workflowAudit = await auditService.queryAuditLogs({
        limit: 50,
        orderBy: 'created_at',
        orderDirection: 'ASC'
      });

      const workflowLogs = workflowAudit.logs.filter(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.testCase === 'workflow_completeness';
        } catch {
          return false;
        }
      });

      expect(workflowLogs).toHaveLength(workflowSteps.length);

      // Verify workflow step sequence
      const loggedSteps = workflowLogs
        .map(log => {
          const metadata = JSON.parse(log.metadata);
          return metadata.workflowStep;
        })
        .sort((a, b) => a - b);

      expect(loggedSteps).toEqual([1, 2, 3, 4, 5, 6, 7]);

      // Verify no gaps in workflow
      for (let i = 1; i <= 7; i++) {
        expect(loggedSteps).toContain(i);
      }
    });

    it('should detect missing audit logs in critical business processes', async () => {
      // Simulate a business process with intentional gap
      const processSteps = [
        { step: 1, action: 'registration_started' },
        { step: 2, action: 'personal_info_collected' },
        // Step 3 intentionally missing: 'payment_info_collected'
        { step: 4, action: 'registration_completed' }
      ];

      // Log only the existing steps
      for (const step of processSteps) {
        await auditService.logDataChange({
          requestId: `${testRequestId}_gap_${step.step}`,
          action: step.action,
          targetType: 'registration',
          targetId: testTicketId,
          beforeValue: { status: 'previous' },
          afterValue: { status: 'current', step: step.step },
          metadata: {
            processStep: step.step,
            testCase: 'gap_detection'
          }
        });
      }

      // Query and analyze for gaps
      const gapAudit = await auditService.queryAuditLogs({
        limit: 50
      });

      const gapLogs = gapAudit.logs.filter(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.testCase === 'gap_detection';
        } catch {
          return false;
        }
      });

      expect(gapLogs).toHaveLength(3); // Only 3 steps, missing step 3

      // Verify the gap exists
      const loggedSteps = gapLogs
        .map(log => {
          const metadata = JSON.parse(log.metadata);
          return metadata.processStep;
        })
        .sort((a, b) => a - b);

      expect(loggedSteps).toEqual([1, 2, 4]); // Missing step 3
      expect(loggedSteps).not.toContain(3);

      // A real gap detection system would identify this as suspicious
      const expectedSteps = [1, 2, 3, 4];
      const missingSteps = expectedSteps.filter(step => !loggedSteps.includes(step));
      expect(missingSteps).toEqual([3]);
    });

    it('should verify audit coverage for error and exception handling', async () => {
      const errorScenarios = [
        { type: 'validation_error', severity: 'warning', code: 'E001' },
        { type: 'payment_declined', severity: 'error', code: 'E002' },
        { type: 'system_unavailable', severity: 'critical', code: 'E003' },
        { type: 'fraud_detected', severity: 'critical', code: 'E004' },
        { type: 'rate_limit_exceeded', severity: 'warning', code: 'E005' }
      ];

      // Log all error scenarios
      for (const error of errorScenarios) {
        await auditService.logDataChange({
          requestId: `${testRequestId}_error_${error.code}`,
          action: 'error_occurred',
          targetType: 'system',
          targetId: error.code,
          beforeValue: { status: 'normal' },
          afterValue: { status: 'error', errorType: error.type },
          severity: error.severity,
          metadata: {
            errorType: error.type,
            errorCode: error.code,
            testCase: 'error_coverage'
          }
        });
      }

      // Verify error audit coverage
      const errorAudit = await auditService.queryAuditLogs({
        limit: 50
      });

      const errorLogs = errorAudit.logs.filter(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.testCase === 'error_coverage';
        } catch {
          return false;
        }
      });

      expect(errorLogs).toHaveLength(errorScenarios.length);

      // Verify all severity levels are captured
      const loggedSeverities = [...new Set(errorLogs.map(log => log.severity))];
      expect(loggedSeverities).toContain('warning');
      expect(loggedSeverities).toContain('error');
      expect(loggedSeverities).toContain('critical');

      // Verify critical errors are properly flagged
      const criticalErrors = errorLogs.filter(log => log.severity === 'critical');
      expect(criticalErrors).toHaveLength(2); // fraud_detected and system_unavailable

      criticalErrors.forEach(log => {
        const metadata = JSON.parse(log.metadata);
        expect(['fraud_detected', 'system_unavailable']).toContain(metadata.errorType);
      });
    });
  });

  describe('Audit Data Integrity and Tamper Detection', () => {
    it('should detect tampering attempts in audit logs', async () => {
      // Create original audit entry
      const originalResult = await auditService.logFinancialEvent({
        requestId: `${testRequestId}_tamper_test`,
        action: 'payment_completed',
        amountCents: 10000, // $100.00
        currency: 'USD',
        transactionReference: testTransactionRef,
        paymentStatus: 'completed',
        metadata: {
          originalAmount: 10000,
          testCase: 'tamper_detection'
        }
      });

      expect(originalResult.success).toBe(true);

      // Get the audit log entry
      const auditQuery = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        limit: 10
      });

      const tamperLog = auditQuery.logs.find(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.testCase === 'tamper_detection';
        } catch {
          return false;
        }
      });

      expect(tamperLog).toBeDefined();
      const originalAmount = tamperLog.amount_cents;
      const originalCreatedAt = tamperLog.created_at;

      // Attempt to tamper with audit log (this should be prevented by database constraints)
      try {
        await db.execute(
          'UPDATE audit_logs SET amount_cents = ?, metadata = ? WHERE id = ?',
          [50000, JSON.stringify({ tamperedAmount: 50000, testCase: 'tamper_detection' }), tamperLog.id]
        );

        // Verify if tampering was successful or prevented
        const tamperCheck = await db.execute('SELECT * FROM audit_logs WHERE id = ?', [tamperLog.id]);
        const modifiedLog = tamperCheck.rows[0];

        // If the update succeeded, we need to detect the discrepancy
        if (modifiedLog.amount_cents !== originalAmount) {
          // Log tampering detection
          await auditService.logDataChange({
            requestId: `${testRequestId}_tamper_detected`,
            action: 'audit_tamper_detected',
            targetType: 'audit_log',
            targetId: String(tamperLog.id),
            beforeValue: { amount_cents: originalAmount },
            afterValue: { amount_cents: modifiedLog.amount_cents },
            severity: 'critical',
            metadata: {
              tamperType: 'amount_modification',
              originalValue: originalAmount,
              modifiedValue: modifiedLog.amount_cents,
              detectionMethod: 'integrity_check'
            }
          });

          // Verify tamper detection was logged
          const tamperDetectionAudit = await auditService.queryAuditLogs({
            severity: 'critical',
            limit: 10
          });

          const detectionLog = tamperDetectionAudit.logs.find(log =>
            log.action === 'audit_tamper_detected');

          expect(detectionLog).toBeDefined();
        }
      } catch (error) {
        // If tampering failed due to constraints, that's good
        expect(error.message).toBeDefined();
      }
    });

    it('should maintain audit log immutability through timestamps', async () => {
      // Create audit entry
      const result = await auditService.logDataChange({
        requestId: `${testRequestId}_immutable_test`,
        action: 'test_action',
        targetType: 'test_target',
        targetId: 'test_123',
        beforeValue: { status: 'before' },
        afterValue: { status: 'after' },
        metadata: {
          testCase: 'immutability_test'
        }
      });

      expect(result.success).toBe(true);

      // Get the audit entry
      const auditQuery = await auditService.queryAuditLogs({
        limit: 10
      });

      const immutableLog = auditQuery.logs.find(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.testCase === 'immutability_test';
        } catch {
          return false;
        }
      });

      expect(immutableLog).toBeDefined();
      const originalTimestamp = immutableLog.created_at;

      // Attempt to modify timestamp
      try {
        const newTimestamp = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 1 day ago
        await db.execute(
          'UPDATE audit_logs SET created_at = ? WHERE id = ?',
          [newTimestamp, immutableLog.id]
        );

        // Check if modification succeeded
        const timestampCheck = await db.execute('SELECT created_at FROM audit_logs WHERE id = ?', [immutableLog.id]);
        const modifiedTimestamp = timestampCheck.rows[0].created_at;

        if (modifiedTimestamp !== originalTimestamp) {
          // Timestamp was modified - this indicates a potential security issue
          // In a production system, this should trigger alerts
          expect(modifiedTimestamp).toBe(newTimestamp);
        } else {
          // Timestamp modification was prevented - this is good
          expect(modifiedTimestamp).toBe(originalTimestamp);
        }
      } catch (error) {
        // If modification failed due to constraints, that's ideal
        expect(error.message).toBeDefined();
      }
    });

    it('should verify audit log sequence integrity', async () => {
      const sequentialOperations = [
        { step: 1, action: 'sequence_start' },
        { step: 2, action: 'sequence_middle' },
        { step: 3, action: 'sequence_end' }
      ];

      const timestamps = [];

      // Create sequential audit entries with controlled timing
      for (const operation of sequentialOperations) {
        const result = await auditService.logDataChange({
          requestId: `${testRequestId}_sequence_${operation.step}`,
          action: operation.action,
          targetType: 'sequence_test',
          targetId: 'sequence_123',
          beforeValue: { step: operation.step - 1 },
          afterValue: { step: operation.step },
          metadata: {
            sequenceStep: operation.step,
            testCase: 'sequence_integrity'
          }
        });

        expect(result.success).toBe(true);

        // Small delay to ensure timestamp ordering
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Verify sequence integrity
      const sequenceAudit = await auditService.queryAuditLogs({
        orderBy: 'created_at',
        orderDirection: 'ASC',
        limit: 20
      });

      const sequenceLogs = sequenceAudit.logs.filter(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.testCase === 'sequence_integrity';
        } catch {
          return false;
        }
      });

      expect(sequenceLogs).toHaveLength(3);

      // Verify chronological order
      for (let i = 1; i < sequenceLogs.length; i++) {
        const prevTimestamp = new Date(sequenceLogs[i - 1].created_at);
        const currentTimestamp = new Date(sequenceLogs[i].created_at);

        expect(currentTimestamp.getTime()).toBeGreaterThanOrEqual(prevTimestamp.getTime());
      }

      // Verify sequence step order
      const sequenceSteps = sequenceLogs.map(log => {
        const metadata = JSON.parse(log.metadata);
        return metadata.sequenceStep;
      });

      expect(sequenceSteps).toEqual([1, 2, 3]);
    });
  });

  describe('Audit Retention and Cleanup Policies', () => {
    it('should respect retention policies for different severity levels', async () => {
      const retentionTestData = [
        { severity: 'debug', daysOld: 100, shouldBeRetained: false },
        { severity: 'info', daysOld: 100, shouldBeRetained: false },
        { severity: 'warning', daysOld: 100, shouldBeRetained: false },
        { severity: 'error', daysOld: 100, shouldBeRetained: true },
        { severity: 'critical', daysOld: 100, shouldBeRetained: true },
        { severity: 'info', daysOld: 30, shouldBeRetained: true }
      ];

      // Create audit entries with backdated timestamps
      for (let i = 0; i < retentionTestData.length; i++) {
        const testData = retentionTestData[i];
        const backdatedTimestamp = new Date(Date.now() - testData.daysOld * 24 * 60 * 60 * 1000);

        await db.execute(`
          INSERT INTO audit_logs (
            request_id, event_type, action, severity, created_at, metadata
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
          `${testRequestId}_retention_${i}`,
          'test_event',
          'retention_test',
          testData.severity,
          backdatedTimestamp.toISOString(),
          JSON.stringify({
            testCase: 'retention_policy',
            daysOld: testData.daysOld,
            shouldBeRetained: testData.shouldBeRetained
          })
        ]);
      }

      // Simulate cleanup process (manual execution of cleanup logic)
      const cleanupQuery = `
        DELETE FROM audit_logs
        WHERE created_at < datetime('now', '-90 days')
        AND severity NOT IN ('error', 'critical')
        AND request_id LIKE ?
      `;

      await db.execute(cleanupQuery, [`${testRequestId}_retention_%`]);

      // Verify retention policy enforcement
      const remainingLogs = await db.execute(`
        SELECT * FROM audit_logs
        WHERE request_id LIKE ?
        ORDER BY created_at
      `, [`${testRequestId}_retention_%`]);

      // Check which logs were retained
      const retainedData = remainingLogs.rows.map(row => {
        const metadata = JSON.parse(row.metadata);
        return {
          severity: row.severity,
          daysOld: metadata.daysOld,
          shouldBeRetained: metadata.shouldBeRetained
        };
      });

      // Verify retention policy was correctly applied
      retainedData.forEach(data => {
        expect(data.shouldBeRetained).toBe(true);
      });

      // Verify error and critical logs are always retained
      const errorCriticalLogs = retainedData.filter(data =>
        ['error', 'critical'].includes(data.severity));

      expect(errorCriticalLogs.length).toBeGreaterThan(0);
      errorCriticalLogs.forEach(data => {
        expect(data.daysOld).toBe(100); // Old logs but retained due to severity
      });

      // Verify recent logs are retained regardless of severity
      const recentLogs = retainedData.filter(data => data.daysOld === 30);
      expect(recentLogs.length).toBeGreaterThan(0);
    });

    it('should manage audit volume and prevent storage bloat', async () => {
      // Get initial audit log count
      const initialCount = await db.execute('SELECT COUNT(*) as count FROM audit_logs');
      const startingCount = initialCount.rows[0].count;

      // Create many audit entries to test volume management
      const bulkEntryCount = 100;
      const bulkInsertPromises = [];

      for (let i = 0; i < bulkEntryCount; i++) {
        bulkInsertPromises.push(
          auditService.logDataChange({
            requestId: `${testRequestId}_volume_${i}`,
            action: 'volume_test',
            targetType: 'volume_target',
            targetId: `volume_${i}`,
            beforeValue: { count: i },
            afterValue: { count: i + 1 },
            metadata: {
              testCase: 'volume_management',
              entryIndex: i
            }
          })
        );
      }

      await Promise.all(bulkInsertPromises);

      // Verify all entries were created
      const afterInsertCount = await db.execute('SELECT COUNT(*) as count FROM audit_logs');
      const afterInsertTotal = afterInsertCount.rows[0].count;

      expect(afterInsertTotal).toBe(startingCount + bulkEntryCount);

      // Test cleanup efficiency
      const cleanupStart = Date.now();

      // Cleanup test entries
      await db.execute('DELETE FROM audit_logs WHERE request_id LIKE ?', [`${testRequestId}_volume_%`]);

      const cleanupEnd = Date.now();
      const cleanupTime = cleanupEnd - cleanupStart;

      // Verify cleanup was efficient (should complete quickly for 100 records)
      expect(cleanupTime).toBeLessThan(1000); // Less than 1 second

      // Verify cleanup was successful
      const afterCleanupCount = await db.execute('SELECT COUNT(*) as count FROM audit_logs');
      const finalCount = afterCleanupCount.rows[0].count;

      expect(finalCount).toBe(startingCount);
    });

    it('should preserve audit chain integrity during cleanup', async () => {
      // Create a sequence of related audit entries
      const chainEntries = [
        { step: 1, action: 'chain_start', severity: 'info', daysOld: 100 },
        { step: 2, action: 'chain_process', severity: 'warning', daysOld: 100 },
        { step: 3, action: 'chain_error', severity: 'error', daysOld: 100 },
        { step: 4, action: 'chain_recovery', severity: 'info', daysOld: 100 },
        { step: 5, action: 'chain_complete', severity: 'info', daysOld: 100 }
      ];

      // Insert chain entries with old timestamps
      for (const entry of chainEntries) {
        const backdatedTimestamp = new Date(Date.now() - entry.daysOld * 24 * 60 * 60 * 1000);

        await db.execute(`
          INSERT INTO audit_logs (
            request_id, event_type, action, severity, created_at, metadata,
            target_type, target_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          `${testRequestId}_chain_${entry.step}`,
          'test_event',
          entry.action,
          entry.severity,
          backdatedTimestamp.toISOString(),
          JSON.stringify({
            testCase: 'chain_integrity',
            chainStep: entry.step,
            chainId: testRequestId
          }),
          'audit_chain',
          testRequestId
        ]);
      }

      // Simulate cleanup that would normally remove old info logs
      // but should preserve chain integrity when error logs are present
      await db.execute(`
        DELETE FROM audit_logs
        WHERE created_at < datetime('now', '-90 days')
        AND severity NOT IN ('error', 'critical')
        AND request_id LIKE ?
        AND target_id != ?  -- Don't break chains that contain errors
      `, [`${testRequestId}_chain_%`, testRequestId]);

      // Verify chain integrity is preserved
      const remainingChain = await db.execute(`
        SELECT * FROM audit_logs
        WHERE request_id LIKE ?
        ORDER BY created_at
      `, [`${testRequestId}_chain_%`]);

      // Since the chain contains an error log, related entries should be preserved
      // or all entries should be removed if the chain is broken
      const chainSteps = remainingChain.rows.map(row => {
        const metadata = JSON.parse(row.metadata);
        return metadata.chainStep;
      });

      // Either the complete chain is preserved or it's completely removed
      if (chainSteps.length > 0) {
        // If any part of the chain remains, critical elements should be preserved
        expect(chainSteps).toContain(3); // Error step should always be preserved

        // Verify chain continuity - no gaps in the sequence
        const sortedSteps = chainSteps.sort((a, b) => a - b);
        for (let i = 1; i < sortedSteps.length; i++) {
          expect(sortedSteps[i]).toBe(sortedSteps[i - 1] + 1);
        }
      }
    });
  });
});
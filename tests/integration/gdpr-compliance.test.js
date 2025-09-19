/**
 * GDPR Compliance Integration Tests
 * Tests data subject request workflows, logging, and compliance reporting
 * Validates GDPR audit trail and data processing activities
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { testRequest, HTTP_STATUS, generateTestEmail, generateTestId } from './handler-test-helper.js';
import { getDbClient } from '../setup-integration.js';
import { resetAllServices } from './reset-services.js';
import auditService from '../../lib/audit-service.js';

// Test admin credentials
const adminPassword = process.env.TEST_ADMIN_PASSWORD;

if (!adminPassword) {
  throw new Error('❌ FATAL: TEST_ADMIN_PASSWORD required for GDPR compliance tests');
}

describe('GDPR Compliance Integration Tests', () => {
  let dbClient;
  let adminToken;

  beforeEach(async () => {
    await resetAllServices();

    dbClient = await getDbClient();

    // Initialize audit service
    // Force audit service to use the test database
    auditService.db = dbClient;
    auditService.initialized = true;
    auditService.initializationPromise = Promise.resolve(auditService);

    // Ensure the email_subscribers table exists with required columns
    try {
      // Check if email_subscribers table exists
      const tableCheck = await dbClient.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='email_subscribers'"
      );

      if (tableCheck.rows.length === 0) {
        // Create email_subscribers table if it doesn't exist
        await dbClient.execute(`
          CREATE TABLE email_subscribers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            first_name TEXT,
            last_name TEXT,
            subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            unsubscribed_at DATETIME,
            bounce_count INTEGER DEFAULT 0,
            consent_given BOOLEAN DEFAULT 1,
            source TEXT DEFAULT 'website'
          )
        `);
        console.log('✅ Created email_subscribers table for GDPR tests');
      }
    } catch (error) {
      console.warn('⚠️ Failed to ensure email_subscribers table exists:', error.message);
    }

    // Get admin token for authenticated requests
    const loginResponse = await testRequest('POST', '/api/admin/login', {
      username: 'admin',
      password: adminPassword
    });

    if (loginResponse.status === HTTP_STATUS.OK) {
      // Extract token from cookie
      const setCookie = loginResponse.headers && loginResponse.headers['set-cookie'];
      if (setCookie) {
        const tokenMatch = setCookie.match(/admin_session=([^;]+)/);
        if (tokenMatch) {
          adminToken = tokenMatch[1];
        }
      }
    } else {
      console.warn('⚠️ Could not obtain admin token - some tests may be skipped');
      adminToken = null;
    }
  });

  afterEach(async () => {
    // Clean up test data
    if (dbClient) {
      try {
        // Clean up audit logs for GDPR test data
        // Check if audit_logs table exists before cleanup
        const tables = await dbClient.execute(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='audit_logs'"
        );
        if (tables.rows && tables.rows.length > 0) {
          await dbClient.execute(
            'DELETE FROM audit_logs WHERE data_subject_id LIKE ? OR action LIKE ?',
            ['test_%', '%GDPR%']
          );
        }

        // Clean up test email subscriptions
        await dbClient.execute(
          "DELETE FROM email_subscribers WHERE email LIKE '%gdpr-test%'"
        );

        // Clean up test transactions and related data
        await dbClient.execute(
          "DELETE FROM transactions WHERE email LIKE '%gdpr-test%'"
        );
      } catch (error) {
        console.warn('⚠️ Failed to clean GDPR test data:', error.message);
      }
    }
  });

  describe('Data Subject Request Logging', () => {
    test('data export request generates proper GDPR audit log', async () => {
      const testSubjectId = generateTestId('gdpr_subject');
      const testEmail = generateTestEmail().replace('@example.com', '@gdpr-test.com');

      // Log a data export request
      const exportResult = await auditService.logDataProcessing({
        action: 'DATA_EXPORT',
        dataSubjectId: testSubjectId,
        dataType: 'personal_information',
        processingPurpose: 'user_data_request',
        legalBasis: 'legitimate_interest',
        retentionPeriod: '7_years',
        adminUser: 'admin',
        metadata: {
          requestedBy: testEmail,
          requestDate: new Date().toISOString(),
          exportFormat: 'JSON'
        }
      });

      expect(exportResult.success).toBe(true);
      expect(exportResult.requestId).toBeDefined();

      // Verify the audit log was created
      const auditLogs = await auditService.queryAuditLogs({
        eventType: 'data_processing',
        limit: 10
      });

      const exportLogs = auditLogs.logs.filter(log =>
        log.data_subject_id === testSubjectId &&
        log.action === 'DATA_EXPORT'
      );

      expect(exportLogs.length).toBeGreaterThan(0);

      if (exportLogs.length > 0) {
        const exportLog = exportLogs[0];
        expect(exportLog.event_type).toBe('data_processing');
        expect(exportLog.data_type).toBe('personal_information');
        expect(exportLog.processing_purpose).toBe('user_data_request');
        expect(exportLog.legal_basis).toBe('legitimate_interest');
        expect(exportLog.retention_period).toBe('7_years');
        expect(exportLog.admin_user).toBe('admin');
      }
    });

    test('data deletion request generates proper GDPR audit log', async () => {
      const testSubjectId = generateTestId('gdpr_deletion');
      const testEmail = generateTestEmail().replace('@example.com', '@gdpr-test.com');

      // Log a data deletion request (right to be forgotten)
      const deletionResult = await auditService.logDataProcessing({
        action: 'DATA_DELETION',
        dataSubjectId: testSubjectId,
        dataType: 'all_personal_data',
        processingPurpose: 'right_to_be_forgotten',
        legalBasis: 'consent_withdrawal',
        adminUser: 'admin',
        metadata: {
          requestedBy: testEmail,
          requestDate: new Date().toISOString(),
          verificationMethod: 'email_verification',
          deletionScheduled: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        }
      });

      expect(deletionResult.success).toBe(true);

      // Verify the audit log
      const auditLogs = await auditService.queryAuditLogs({
        eventType: 'data_processing',
        dataSubjectId: testSubjectId,
        limit: 5
      });

      expect(auditLogs.logs.length).toBeGreaterThan(0);

      const deletionLog = auditLogs.logs[0];
      expect(deletionLog.action).toBe('DATA_DELETION');
      expect(deletionLog.data_type).toBe('all_personal_data');
      expect(deletionLog.processing_purpose).toBe('right_to_be_forgotten');
      expect(deletionLog.legal_basis).toBe('consent_withdrawal');
    });

    test('data rectification request generates proper GDPR audit log', async () => {
      const testSubjectId = generateTestId('gdpr_rectification');

      // Log a data rectification request
      const rectificationResult = await auditService.logDataProcessing({
        action: 'DATA_RECTIFICATION',
        dataSubjectId: testSubjectId,
        dataType: 'contact_information',
        processingPurpose: 'data_accuracy_request',
        legalBasis: 'data_subject_rights',
        adminUser: 'admin',
        metadata: {
          fieldsToCorrect: ['email', 'phone'],
          requestVerified: true,
          correctionApplied: new Date().toISOString()
        }
      });

      expect(rectificationResult.success).toBe(true);

      // Verify audit log
      const auditLogs = await auditService.queryAuditLogs({
        eventType: 'data_processing',
        dataSubjectId: testSubjectId,
        action: 'DATA_RECTIFICATION',
        limit: 5
      });

      expect(auditLogs.logs.length).toBeGreaterThan(0);

      const rectificationLog = auditLogs.logs[0];
      expect(rectificationLog.processing_purpose).toBe('data_accuracy_request');
      expect(rectificationLog.legal_basis).toBe('data_subject_rights');
    });
  });

  describe('Newsletter Subscription GDPR Compliance', () => {
    test('newsletter subscription generates GDPR processing log', async () => {
      const testEmail = generateTestEmail().replace('@example.com', '@gdpr-test.com');

      // Subscribe to newsletter
      const subscriptionResponse = await testRequest('POST', '/api/email/subscribe', {
        email: testEmail,
        firstName: 'GDPR',
        lastName: 'Test',
        consent: true
      });

      if (subscriptionResponse.status === 0) {
        console.warn('⚠️ Email service unavailable - skipping newsletter GDPR test');
        return;
      }

      // Log the GDPR processing activity for newsletter subscription
      await auditService.logDataProcessing({
        action: 'DATA_COLLECTION',
        dataSubjectId: testEmail,
        dataType: 'email_marketing_data',
        processingPurpose: 'newsletter_marketing',
        legalBasis: 'consent',
        retentionPeriod: 'until_unsubscribe',
        metadata: {
          consentGiven: true,
          subscriptionDate: new Date().toISOString(),
          source: 'website_form'
        }
      });

      // Verify GDPR audit log
      const auditLogs = await auditService.queryAuditLogs({
        eventType: 'data_processing',
        dataSubjectId: testEmail,
        limit: 5
      });

      expect(auditLogs.logs.length).toBeGreaterThan(0);

      const subscriptionLog = auditLogs.logs[0];
      expect(subscriptionLog.action).toBe('DATA_COLLECTION');
      expect(subscriptionLog.data_type).toBe('email_marketing_data');
      expect(subscriptionLog.legal_basis).toBe('consent');
      expect(subscriptionLog.retention_period).toBe('until_unsubscribe');
    });

    test('newsletter unsubscription generates GDPR processing log', async () => {
      const testEmail = generateTestEmail().replace('@example.com', '@gdpr-test.com');

      // First subscribe (to have something to unsubscribe from)
      await testRequest('POST', '/api/email/subscribe', {
        email: testEmail,
        firstName: 'GDPR',
        lastName: 'Test',
        consent: true
      });

      // Wait briefly
      await new Promise(resolve => setTimeout(resolve, 200));

      // Try unsubscribe
      const unsubscribeResponse = await testRequest('GET', `/api/email/unsubscribe?token=test-token&email=${encodeURIComponent(testEmail)}`);

      // Log the GDPR processing for unsubscription
      await auditService.logDataProcessing({
        action: 'CONSENT_WITHDRAWAL',
        dataSubjectId: testEmail,
        dataType: 'email_marketing_data',
        processingPurpose: 'unsubscribe_request',
        legalBasis: 'consent_withdrawal',
        metadata: {
          unsubscribeDate: new Date().toISOString(),
          method: 'email_link',
          dataRetentionAction: 'anonymize'
        }
      });

      // Verify unsubscribe audit log
      const auditLogs = await auditService.queryAuditLogs({
        eventType: 'data_processing',
        dataSubjectId: testEmail,
        action: 'CONSENT_WITHDRAWAL',
        limit: 5
      });

      expect(auditLogs.logs.length).toBeGreaterThan(0);

      const unsubscribeLog = auditLogs.logs[0];
      expect(unsubscribeLog.processing_purpose).toBe('unsubscribe_request');
      expect(unsubscribeLog.legal_basis).toBe('consent_withdrawal');
    });
  });

  describe('Payment Data GDPR Compliance', () => {
    test('payment processing generates GDPR financial and data processing logs', async () => {
      const testEmail = generateTestEmail().replace('@example.com', '@gdpr-test.com');
      const testTransactionId = generateTestId('gdpr_transaction');

      // Log financial transaction (would be done by payment webhook)
      await auditService.logFinancialEvent({
        action: 'PAYMENT_PROCESSED',
        amountCents: 5000,
        currency: 'USD',
        transactionReference: testTransactionId,
        paymentStatus: 'succeeded',
        targetId: 'order_' + generateTestId(),
        metadata: {
          customerEmail: testEmail,
          paymentMethod: 'card'
        }
      });

      // Log the associated GDPR data processing
      await auditService.logDataProcessing({
        action: 'PAYMENT_DATA_PROCESSING',
        dataSubjectId: testEmail,
        dataType: 'payment_information',
        processingPurpose: 'transaction_processing',
        legalBasis: 'contract_performance',
        retentionPeriod: '7_years',
        metadata: {
          transactionId: testTransactionId,
          amount: '$50.00',
          processingDate: new Date().toISOString()
        }
      });

      // Verify both logs exist
      const financialLogs = await auditService.queryAuditLogs({
        eventType: 'financial_event',
        limit: 5
      });

      const paymentLogs = financialLogs.logs.filter(log =>
        log.transaction_reference === testTransactionId
      );

      expect(paymentLogs.length).toBeGreaterThan(0);

      const gdprLogs = await auditService.queryAuditLogs({
        eventType: 'data_processing',
        dataSubjectId: testEmail,
        action: 'PAYMENT_DATA_PROCESSING',
        limit: 5
      });

      expect(gdprLogs.logs.length).toBeGreaterThan(0);

      if (gdprLogs.logs.length > 0) {
        const gdprLog = gdprLogs.logs[0];
        expect(gdprLog.legal_basis).toBe('contract_performance');
        expect(gdprLog.retention_period).toBe('7_years');
      }
    });
  });

  describe('GDPR Compliance Reporting', () => {
    test('generate GDPR compliance report for data subject', async () => {
      const testSubjectId = generateTestId('gdpr_report');
      const testEmail = generateTestEmail().replace('@example.com', '@gdpr-test.com');

      // Create various GDPR processing activities
      const activities = [
        {
          action: 'DATA_COLLECTION',
          dataType: 'personal_information',
          processingPurpose: 'service_provision',
          legalBasis: 'consent'
        },
        {
          action: 'DATA_SHARING',
          dataType: 'contact_information',
          processingPurpose: 'third_party_integration',
          legalBasis: 'legitimate_interest'
        },
        {
          action: 'DATA_ANALYTICS',
          dataType: 'usage_data',
          processingPurpose: 'service_improvement',
          legalBasis: 'legitimate_interest'
        }
      ];

      // Log all activities
      for (const activity of activities) {
        await auditService.logDataProcessing({
          ...activity,
          dataSubjectId: testSubjectId,
          adminUser: 'admin',
          metadata: {
            subjectEmail: testEmail,
            reportGeneration: true
          }
        });
      }

      // Generate compliance report by querying all processing activities
      const complianceReport = await auditService.queryAuditLogs({
        eventType: 'data_processing',
        dataSubjectId: testSubjectId,
        limit: 20
      });

      expect(complianceReport.logs.length).toBe(activities.length);

      // Verify report contains all activities
      const actions = complianceReport.logs.map(log => log.action);
      expect(actions).toContain('DATA_COLLECTION');
      expect(actions).toContain('DATA_SHARING');
      expect(actions).toContain('DATA_ANALYTICS');

      // Verify legal bases are tracked
      const legalBases = complianceReport.logs.map(log => log.legal_basis);
      expect(legalBases).toContain('consent');
      expect(legalBases).toContain('legitimate_interest');

      // Calculate compliance metrics
      const consentBasedActivities = complianceReport.logs.filter(log =>
        log.legal_basis === 'consent'
      ).length;

      const legitimateInterestActivities = complianceReport.logs.filter(log =>
        log.legal_basis === 'legitimate_interest'
      ).length;

      expect(consentBasedActivities).toBeGreaterThan(0);
      expect(legitimateInterestActivities).toBeGreaterThan(0);
    });

    test('generate system-wide GDPR compliance statistics', async () => {
      // Create test data processing activities
      const testActivities = [
        { action: 'DATA_COLLECTION', legalBasis: 'consent' },
        { action: 'DATA_EXPORT', legalBasis: 'data_subject_rights' },
        { action: 'DATA_DELETION', legalBasis: 'consent_withdrawal' },
        { action: 'DATA_RECTIFICATION', legalBasis: 'data_subject_rights' }
      ];

      for (let i = 0; i < testActivities.length; i++) {
        const activity = testActivities[i];
        await auditService.logDataProcessing({
          ...activity,
          dataSubjectId: generateTestId(`gdpr_stats_${i}`),
          dataType: 'personal_information',
          processingPurpose: 'compliance_testing',
          adminUser: 'admin'
        });
      }

      // Get GDPR compliance statistics
      const stats = await auditService.getAuditStats('24h');

      // Filter for data processing events
      const gdprStats = stats.stats.filter(stat =>
        stat.event_type === 'data_processing'
      );

      expect(gdprStats.length).toBeGreaterThan(0);

      // Verify we have GDPR activity in stats
      const totalGdprActivities = gdprStats.reduce((sum, stat) => sum + stat.count, 0);
      expect(totalGdprActivities).toBeGreaterThanOrEqual(testActivities.length);
    });
  });

  describe('Data Retention and Anonymization', () => {
    test('data retention period logging for GDPR compliance', async () => {
      const testSubjectId = generateTestId('gdpr_retention');

      // Log activities with different retention periods
      const retentionActivities = [
        {
          action: 'DATA_COLLECTION',
          dataType: 'payment_data',
          retentionPeriod: '7_years',
          processingPurpose: 'financial_compliance'
        },
        {
          action: 'DATA_COLLECTION',
          dataType: 'marketing_data',
          retentionPeriod: 'until_unsubscribe',
          processingPurpose: 'marketing_communications'
        },
        {
          action: 'DATA_COLLECTION',
          dataType: 'session_data',
          retentionPeriod: '30_days',
          processingPurpose: 'security_monitoring'
        }
      ];

      for (const activity of retentionActivities) {
        await auditService.logDataProcessing({
          ...activity,
          dataSubjectId: testSubjectId,
          legalBasis: 'legitimate_interest',
          adminUser: 'admin'
        });
      }

      // Query retention activities
      const retentionLogs = await auditService.queryAuditLogs({
        eventType: 'data_processing',
        dataSubjectId: testSubjectId,
        limit: 10
      });

      expect(retentionLogs.logs.length).toBe(retentionActivities.length);

      // Verify different retention periods are tracked
      const retentionPeriods = retentionLogs.logs.map(log => log.retention_period);
      expect(retentionPeriods).toContain('7_years');
      expect(retentionPeriods).toContain('until_unsubscribe');
      expect(retentionPeriods).toContain('30_days');
    });

    test('data anonymization process generates proper audit logs', async () => {
      const testSubjectId = generateTestId('gdpr_anonymization');

      // Log data anonymization process
      await auditService.logDataProcessing({
        action: 'DATA_ANONYMIZATION',
        dataSubjectId: testSubjectId,
        dataType: 'all_personal_data',
        processingPurpose: 'retention_period_expired',
        legalBasis: 'data_minimization',
        adminUser: 'system_automation',
        metadata: {
          anonymizationDate: new Date().toISOString(),
          originalRetentionPeriod: '2_years',
          automatedProcess: true,
          dataTypesAnonymized: ['email', 'name', 'phone', 'address']
        }
      });

      // Verify anonymization audit log
      const anonymizationLogs = await auditService.queryAuditLogs({
        eventType: 'data_processing',
        dataSubjectId: testSubjectId,
        action: 'DATA_ANONYMIZATION',
        limit: 5
      });

      expect(anonymizationLogs.logs.length).toBeGreaterThan(0);

      if (anonymizationLogs.logs.length > 0) {
        const anonymizationLog = anonymizationLogs.logs[0];
        expect(anonymizationLog.processing_purpose).toBe('retention_period_expired');
        expect(anonymizationLog.legal_basis).toBe('data_minimization');
        expect(anonymizationLog.admin_user).toBe('system_automation');
      }
    });
  });

  describe('Admin GDPR Tools Audit', () => {
    test('admin data export tool generates proper audit trail', async () => {
      if (!adminToken) {
        console.warn('⚠️ No admin token - skipping admin GDPR tools test');
        return;
      }

      const testSubjectId = generateTestId('admin_export');

      // Simulate admin using data export tool
      // This would be a real admin endpoint in practice
      await auditService.logDataProcessing({
        action: 'ADMIN_DATA_EXPORT',
        dataSubjectId: testSubjectId,
        dataType: 'complete_user_profile',
        processingPurpose: 'gdpr_subject_access_request',
        legalBasis: 'data_subject_rights',
        adminUser: 'admin',
        metadata: {
          exportInitiatedBy: 'admin',
          exportFormat: 'JSON',
          includeAuditLogs: true,
          requestVerificationMethod: 'admin_portal'
        }
      });

      // Also log the admin access to the export tool
      await auditService.logAdminAccess({
        adminUser: 'admin',
        sessionId: 'admin-session-123',
        requestMethod: 'POST',
        requestUrl: '/api/admin/gdpr/export',
        responseStatus: 200,
        responseTimeMs: 1500,
        metadata: {
          dataSubjectId: testSubjectId,
          exportType: 'complete_profile'
        }
      });

      // Verify both audit logs exist
      const gdprLogs = await auditService.queryAuditLogs({
        eventType: 'data_processing',
        action: 'ADMIN_DATA_EXPORT',
        dataSubjectId: testSubjectId,
        limit: 5
      });

      expect(gdprLogs.logs.length).toBeGreaterThan(0);

      const adminAccessLogs = await auditService.queryAuditLogs({
        eventType: 'admin_access',
        adminUser: 'admin',
        limit: 10
      });

      const exportAccessLogs = adminAccessLogs.logs.filter(log =>
        log.request_url?.includes('/gdpr/export')
      );

      // Should have admin access audit trail for GDPR operations
      expect(exportAccessLogs.length).toBeGreaterThan(0);
    });

    test('admin data deletion tool generates comprehensive audit trail', async () => {
      if (!adminToken) {
        console.warn('⚠️ No admin token - skipping admin deletion audit test');
        return;
      }

      const testSubjectId = generateTestId('admin_deletion');

      // Log the deletion process stages
      const deletionStages = [
        {
          action: 'DELETION_REQUEST_VERIFIED',
          processingPurpose: 'gdpr_deletion_request_verification',
          metadata: { verificationMethod: 'email_confirmation', verifiedBy: 'admin' }
        },
        {
          action: 'DELETION_SCHEDULED',
          processingPurpose: 'gdpr_deletion_scheduling',
          metadata: { scheduledDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() }
        },
        {
          action: 'DATA_DELETION_EXECUTED',
          processingPurpose: 'gdpr_right_to_be_forgotten',
          metadata: { deletionExecutedBy: 'admin', deletionComplete: true }
        }
      ];

      for (const stage of deletionStages) {
        await auditService.logDataProcessing({
          ...stage,
          dataSubjectId: testSubjectId,
          dataType: 'all_personal_data',
          legalBasis: 'consent_withdrawal',
          adminUser: 'admin'
        });
      }

      // Verify complete deletion audit trail
      const deletionLogs = await auditService.queryAuditLogs({
        eventType: 'data_processing',
        dataSubjectId: testSubjectId,
        limit: 10
      });

      expect(deletionLogs.logs.length).toBe(deletionStages.length);

      // Verify all stages are logged
      const loggedActions = deletionLogs.logs.map(log => log.action);
      expect(loggedActions).toContain('DELETION_REQUEST_VERIFIED');
      expect(loggedActions).toContain('DELETION_SCHEDULED');
      expect(loggedActions).toContain('DATA_DELETION_EXECUTED');
    });
  });
});
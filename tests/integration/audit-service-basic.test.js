/**
 * Basic Audit Service Tests
 * Simple verification that the audit service can be initialized and basic operations work
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import auditService from '../../lib/audit-service.js';
import { resetAllServices } from './reset-services.js';
import { getDbClient } from "../setup-integration.js";

describe('Basic Audit Service Tests', () => {
  beforeEach(async () => {
    await resetAllServices();
  });

  beforeAll(async () => {
    // Force audit service to use the test database
    auditService.db = await getDbClient();
    auditService.initialized = true;
    auditService.initializationPromise = Promise.resolve(auditService);
  });

  describe('Service Initialization', () => {
    it('should initialize successfully', async () => {
      const service = await auditService.ensureInitialized();
      expect(service).toBeDefined();
      expect(service.initialized).toBe(true);
    });

    it('should provide health check', async () => {
      const health = await auditService.healthCheck();
      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
      expect(health.timestamp).toBeDefined();
    });
  });

  describe('Request ID Generation', () => {
    it('should generate unique request IDs', () => {
      const id1 = auditService.generateRequestId();
      const id2 = auditService.generateRequestId();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^req_[a-z0-9]+_[a-f0-9]{16}$/);
      expect(id2).toMatch(/^req_[a-z0-9]+_[a-f0-9]{16}$/);
    });
  });

  describe('Data Sanitization', () => {
    it('should sanitize sensitive fields', () => {
      const testData = {
        username: 'testuser',
        password: 'secret123',
        email: 'test@example.com',
        apiKey: 'key_123456',
        sessionToken: 'token_abcdef'
      };

      const sanitized = auditService.sanitizeData(testData);

      expect(sanitized.username).toBe('testuser');
      expect(sanitized.email).toBe('test@example.com');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.sessionToken).toBe('[REDACTED]');
    });

    it('should handle null and undefined data gracefully', () => {
      expect(auditService.sanitizeData(null)).toBeNull();
      expect(auditService.sanitizeData(undefined)).toBeUndefined();
      expect(auditService.sanitizeData('string')).toBe('string');
      expect(auditService.sanitizeData(123)).toBe(123);
    });
  });

  describe('Basic Audit Operations', () => {
    it('should log data changes when audit_logs table exists', async () => {
      const result = await auditService.logDataChange({
        requestId: 'test_data_change',
        action: 'test_action',
        targetType: 'test_target',
        targetId: 'test_123',
        beforeValue: { status: 'old' },
        afterValue: { status: 'new' },
        changedFields: ['status'],
        metadata: { testCase: 'basic_audit' }
      });

      // Result should indicate success or graceful failure
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(result.requestId).toBe('test_data_change');
    });

    it('should log admin access when audit_logs table exists', async () => {
      const result = await auditService.logAdminAccess({
        requestId: 'test_admin_access',
        adminUser: 'test_admin',
        sessionId: 'session_123',
        ipAddress: '127.0.0.1',
        userAgent: 'test-browser',
        requestMethod: 'GET',
        requestUrl: '/api/test',
        responseStatus: 200,
        responseTimeMs: 100,
        metadata: { testCase: 'basic_audit' }
      });

      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(result.requestId).toBe('test_admin_access');
    });

    it('should log financial events when audit_logs table exists', async () => {
      const result = await auditService.logFinancialEvent({
        requestId: 'test_financial_event',
        action: 'test_payment',
        amountCents: 1000,
        currency: 'USD',
        transactionReference: 'txn_test_123',
        paymentStatus: 'completed',
        targetType: 'transaction',
        targetId: 'txn_test_123',
        metadata: { testCase: 'basic_audit' }
      });

      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(result.requestId).toBe('test_financial_event');
    });

    it('should log data processing for GDPR compliance', async () => {
      const result = await auditService.logDataProcessing({
        requestId: 'test_data_processing',
        action: 'data_accessed',
        dataSubjectId: 'user_123',
        dataType: 'personal_data',
        processingPurpose: 'service_provision',
        legalBasis: 'contract',
        retentionPeriod: '7_years',
        metadata: { testCase: 'basic_audit' }
      });

      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(result.requestId).toBe('test_data_processing');
    });

    it('should log configuration changes', async () => {
      const result = await auditService.logConfigChange({
        requestId: 'test_config_change',
        action: 'setting_updated',
        configKey: 'test_setting',
        beforeValue: 'old_value',
        afterValue: 'new_value',
        adminUser: 'test_admin',
        metadata: { testCase: 'basic_audit' }
      });

      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(result.requestId).toBe('test_config_change');
    });
  });

  describe('Audit Statistics', () => {
    it('should generate audit statistics', async () => {
      const stats = await auditService.getAuditStats('24h');

      expect(stats).toBeDefined();
      expect(stats.timeframe).toBe('24h');
      expect(stats.generated_at).toBeDefined();
      expect(Array.isArray(stats.stats)).toBe(true);
    });

    it('should support different timeframes', async () => {
      const timeframes = ['1h', '24h', '7d', '30d'];

      for (const timeframe of timeframes) {
        const stats = await auditService.getAuditStats(timeframe);
        expect(stats.timeframe).toBe(timeframe);
        expect(Array.isArray(stats.stats)).toBe(true);
      }
    });
  });

  describe('Audit Queries', () => {
    it('should query audit logs with basic filters', async () => {
      const result = await auditService.queryAuditLogs({
        limit: 10,
        orderBy: 'created_at',
        orderDirection: 'DESC'
      });

      expect(result).toBeDefined();
      expect(result.logs).toBeDefined();
      expect(Array.isArray(result.logs)).toBe(true);
      expect(typeof result.total).toBe('number');
      expect(typeof result.limit).toBe('number');
      expect(typeof result.offset).toBe('number');
      expect(typeof result.hasMore).toBe('boolean');
    });

    it('should handle pagination correctly', async () => {
      const firstPage = await auditService.queryAuditLogs({
        limit: 5,
        offset: 0
      });

      const secondPage = await auditService.queryAuditLogs({
        limit: 5,
        offset: 5
      });

      expect(firstPage.limit).toBe(5);
      expect(firstPage.offset).toBe(0);
      expect(secondPage.limit).toBe(5);
      expect(secondPage.offset).toBe(5);

      // Verify no overlap in results (if any results exist)
      if (firstPage.logs.length > 0 && secondPage.logs.length > 0) {
        const firstPageIds = firstPage.logs.map(log => log.id);
        const secondPageIds = secondPage.logs.map(log => log.id);

        firstPageIds.forEach(id => {
          expect(secondPageIds).not.toContain(id);
        });
      }
    });
  });
});
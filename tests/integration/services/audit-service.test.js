import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import auditService from '../../../lib/audit-service.js';
import { resetDatabaseInstance, getDatabaseClient } from '../../../lib/database.js';

describe('AuditService', () => {
  beforeEach(async () => {
    // Reset database for clean state
    await resetDatabaseInstance();
    // Reset audit service for clean state
    auditService.initialized = false;
    auditService.initializationPromise = null;
    auditService.db = null;
  });

  afterEach(async () => {
    // Clean up
    await resetDatabaseInstance();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const service = await auditService.ensureInitialized();
      expect(service).toBeDefined();
      expect(auditService.initialized).toBe(true);
      expect(auditService.db).toBeDefined();
    });

    it('should handle multiple initialization calls', async () => {
      const service1 = await auditService.ensureInitialized();
      const service2 = await auditService.ensureInitialized();

      expect(service1).toBe(service2);
      expect(auditService.initialized).toBe(true);
    });

    it('should perform health check', async () => {
      await auditService.ensureInitialized();
      const health = await auditService.healthCheck();

      expect(health.status).toBeDefined();
      expect(health.initialized).toBe(true);
      expect(health.timestamp).toBeDefined();
    });
  });

  describe('Request ID Generation', () => {
    it('should generate unique request IDs', async () => {
      await auditService.ensureInitialized();

      const id1 = auditService.generateRequestId();
      const id2 = auditService.generateRequestId();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^req_/);
      expect(id2).toMatch(/^req_/);
    });
  });

  describe('Data Sanitization', () => {
    it('should sanitize sensitive data', async () => {
      await auditService.ensureInitialized();

      const data = {
        username: 'admin',
        password: 'secret123',
        apiKey: 'sk_12345',
        normalField: 'value'
      };

      const sanitized = await auditService.sanitizeData(data);

      expect(sanitized.username).toBe('admin');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.normalField).toBe('value');
    });

    it('should handle non-object data', async () => {
      await auditService.ensureInitialized();

      expect(await auditService.sanitizeData('string')).toBe('string');
      expect(await auditService.sanitizeData(123)).toBe(123);
      expect(await auditService.sanitizeData(null)).toBeNull();
      expect(await auditService.sanitizeData(undefined)).toBeUndefined();
    });
  });

  describe('Data Change Logging', () => {
    it('should log data changes successfully', async () => {
      await auditService.ensureInitialized();

      const result = await auditService.logDataChange({
        action: 'CREATE',
        targetType: 'user',
        targetId: 'user123',
        adminUser: 'admin',
        afterValue: { name: 'John Doe', email: 'john@example.com' }
      });

      expect(result.success).toBe(true);
      expect(result.requestId).toBeDefined();
      expect(result.requestId).toMatch(/^req_/);
    });

    it('should log UPDATE operations with before/after values', async () => {
      await auditService.ensureInitialized();

      const result = await auditService.logDataChange({
        action: 'UPDATE',
        targetType: 'user',
        targetId: 'user123',
        adminUser: 'admin',
        beforeValue: { name: 'John', email: 'john@old.com' },
        afterValue: { name: 'John Doe', email: 'john@new.com' },
        changedFields: ['name', 'email']
      });

      expect(result.success).toBe(true);
      expect(result.requestId).toBeDefined();
    });
  });

  describe('Admin Access Logging', () => {
    it('should log admin endpoint access', async () => {
      await auditService.ensureInitialized();

      const result = await auditService.logAdminAccess({
        adminUser: 'admin',
        sessionId: 'sess_123',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0...',
        requestMethod: 'GET',
        requestUrl: '/api/admin/dashboard',
        responseStatus: 200,
        responseTimeMs: 150
      });

      expect(result.success).toBe(true);
      expect(result.requestId).toBeDefined();
    });

    it('should handle error responses', async () => {
      await auditService.ensureInitialized();

      const result = await auditService.logAdminAccess({
        adminUser: 'admin',
        requestMethod: 'POST',
        requestUrl: '/api/admin/users',
        responseStatus: 500,
        error: 'Internal server error'
      });

      expect(result.success).toBe(true);
      expect(result.requestId).toBeDefined();
    });
  });

  describe('Financial Event Logging', () => {
    it('should log financial transactions', async () => {
      await auditService.ensureInitialized();

      const result = await auditService.logFinancialEvent({
        action: 'PAYMENT_PROCESSED',
        amountCents: 5000,
        currency: 'USD',
        transactionReference: 'txn_123',
        paymentStatus: 'completed',
        targetId: 'payment_123'
      });

      expect(result.success).toBe(true);
      expect(result.requestId).toBeDefined();
    });

    it('should handle refunds', async () => {
      await auditService.ensureInitialized();

      const result = await auditService.logFinancialEvent({
        action: 'REFUND_PROCESSED',
        amountCents: -2500,
        currency: 'USD',
        transactionReference: 'txn_123_refund',
        paymentStatus: 'refunded',
        targetId: 'refund_123'
      });

      expect(result.success).toBe(true);
      expect(result.requestId).toBeDefined();
    });
  });

  describe('GDPR Data Processing Logging', () => {
    it('should log data processing activities', async () => {
      await auditService.ensureInitialized();

      const result = await auditService.logDataProcessing({
        action: 'DATA_EXPORTED',
        dataSubjectId: 'user123',
        dataType: 'personal_data',
        processingPurpose: 'gdpr_request',
        legalBasis: 'consent'
      });

      expect(result.success).toBe(true);
      expect(result.requestId).toBeDefined();
    });

    it('should log deletion requests', async () => {
      await auditService.ensureInitialized();

      const result = await auditService.logDataProcessing({
        action: 'DATA_DELETED',
        dataSubjectId: 'user123',
        dataType: 'personal_data',
        processingPurpose: 'gdpr_deletion',
        legalBasis: 'right_to_erasure'
      });

      expect(result.success).toBe(true);
      expect(result.requestId).toBeDefined();
    });
  });

  describe('Configuration Change Logging', () => {
    it('should log config changes', async () => {
      await auditService.ensureInitialized();

      const result = await auditService.logConfigChange({
        action: 'CONFIG_UPDATED',
        configKey: 'max_login_attempts',
        beforeValue: 3,
        afterValue: 5,
        adminUser: 'admin'
      });

      expect(result.success).toBe(true);
      expect(result.requestId).toBeDefined();
    });
  });

  describe('Audit Log Querying', () => {
    it('should query audit logs with filtering', async () => {
      await auditService.ensureInitialized();

      // Log some test data first
      await auditService.logDataChange({
        action: 'CREATE',
        targetType: 'test',
        targetId: 'test123',
        adminUser: 'admin'
      });

      const result = await auditService.queryAuditLogs({
        eventType: 'data_change',
        limit: 10
      });

      expect(result).toBeDefined();
      expect(result.logs).toBeInstanceOf(Array);
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(0);
    });

    it('should filter by admin user', async () => {
      await auditService.ensureInitialized();

      const result = await auditService.queryAuditLogs({
        adminUser: 'specific_admin',
        limit: 5
      });

      expect(result).toBeDefined();
      expect(result.logs).toBeInstanceOf(Array);
    });

    it('should handle pagination', async () => {
      await auditService.ensureInitialized();

      const result = await auditService.queryAuditLogs({
        limit: 5,
        offset: 10
      });

      expect(result).toBeDefined();
      expect(result.limit).toBe(5);
      expect(result.offset).toBe(10);
    });
  });

  describe('Audit Statistics', () => {
    it('should generate audit statistics', async () => {
      await auditService.ensureInitialized();

      const stats = await auditService.getAuditStats('24h');

      expect(stats).toBeDefined();
      expect(stats.timeframe).toBe('24h');
      expect(stats.stats).toBeInstanceOf(Array);
      expect(stats.generated_at).toBeDefined();
    });

    it('should handle different timeframes', async () => {
      await auditService.ensureInitialized();

      const stats1h = await auditService.getAuditStats('1h');
      const stats7d = await auditService.getAuditStats('7d');

      expect(stats1h.timeframe).toBe('1h');
      expect(stats7d.timeframe).toBe('7d');
    });
  });
});
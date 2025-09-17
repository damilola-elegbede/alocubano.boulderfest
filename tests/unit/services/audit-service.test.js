import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import auditService from '../../../lib/audit-service.js';
import { resetDatabaseInstance } from '../../../lib/database.js';

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

      expect(health.status).toBe('healthy');
      expect(health.initialized).toBe(true);
      expect(health.database_connected).toBe(true);
      expect(typeof health.total_logs).toBe('number');
    });
  });

  describe('Request ID Generation', () => {
    it('should generate unique request IDs', async () => {
      await auditService.ensureInitialized();

      const id1 = auditService.generateRequestId();
      const id2 = auditService.generateRequestId();

      expect(id1).toMatch(/^req_\d+_[a-f0-9]{16}$/);
      expect(id2).toMatch(/^req_\d+_[a-f0-9]{16}$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('Data Sanitization', () => {
    it('should sanitize sensitive data', async () => {
      await auditService.ensureInitialized();

      const sensitiveData = {
        username: 'admin',
        password: 'secret123',
        token: 'abc123',
        apiKey: 'xyz789',
        normal_field: 'public_data'
      };

      const sanitized = auditService.sanitizeData(sensitiveData);

      expect(sanitized.username).toBe('admin');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.normal_field).toBe('public_data');
    });

    it('should handle non-object data', async () => {
      await auditService.ensureInitialized();

      expect(auditService.sanitizeData('string')).toBe('string');
      expect(auditService.sanitizeData(123)).toBe(123);
      expect(auditService.sanitizeData(null)).toBe(null);
      expect(auditService.sanitizeData(undefined)).toBe(undefined);
    });
  });

  describe('Data Change Logging', () => {
    it('should log data changes successfully', async () => {
      await auditService.ensureInitialized();

      const result = await auditService.logDataChange({
        action: 'CREATE',
        targetType: 'user',
        targetId: 'user_123',
        afterValue: { name: 'Test User', email: 'test@example.com' },
        adminUser: 'admin_1',
        ipAddress: '192.168.1.1'
      });

      expect(result.success).toBe(true);
      expect(result.requestId).toMatch(/^req_\d+_[a-f0-9]{16}$/);
    });

    it('should log UPDATE operations with before/after values', async () => {
      await auditService.ensureInitialized();

      const result = await auditService.logDataChange({
        action: 'UPDATE',
        targetType: 'ticket',
        targetId: 'ticket_456',
        beforeValue: { status: 'pending', price: 50 },
        afterValue: { status: 'confirmed', price: 50 },
        changedFields: ['status'],
        adminUser: 'admin_1'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Admin Access Logging', () => {
    it('should log admin endpoint access', async () => {
      await auditService.ensureInitialized();

      const result = await auditService.logAdminAccess({
        adminUser: 'admin_1',
        sessionId: 'session_123',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Test Browser',
        requestMethod: 'POST',
        requestUrl: '/api/admin/dashboard',
        responseStatus: 200,
        responseTimeMs: 150
      });

      expect(result.success).toBe(true);
      expect(result.requestId).toMatch(/^req_\d+_[a-f0-9]{16}$/);
    });

    it('should handle error responses', async () => {
      await auditService.ensureInitialized();

      const result = await auditService.logAdminAccess({
        adminUser: 'admin_1',
        requestMethod: 'GET',
        requestUrl: '/api/admin/restricted',
        responseStatus: 403,
        responseTimeMs: 50,
        error: 'Access denied'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Financial Event Logging', () => {
    it('should log financial transactions', async () => {
      await auditService.ensureInitialized();

      const result = await auditService.logFinancialEvent({
        action: 'PAYMENT_PROCESSED',
        amountCents: 5000,
        currency: 'USD',
        transactionReference: 'stripe_pi_123',
        paymentStatus: 'succeeded',
        targetId: 'order_789'
      });

      expect(result.success).toBe(true);
    });

    it('should handle refunds', async () => {
      await auditService.ensureInitialized();

      const result = await auditService.logFinancialEvent({
        action: 'REFUND_ISSUED',
        amountCents: 2500,
        transactionReference: 'stripe_re_456',
        paymentStatus: 'refunded',
        targetId: 'order_789',
        adminUser: 'admin_1'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('GDPR Data Processing Logging', () => {
    it('should log data processing activities', async () => {
      await auditService.ensureInitialized();

      const result = await auditService.logDataProcessing({
        action: 'DATA_EXPORT',
        dataSubjectId: 'user_123',
        dataType: 'personal_information',
        processingPurpose: 'user_data_request',
        legalBasis: 'legitimate_interest',
        retentionPeriod: '7_years'
      });

      expect(result.success).toBe(true);
    });

    it('should log deletion requests', async () => {
      await auditService.ensureInitialized();

      const result = await auditService.logDataProcessing({
        action: 'DATA_DELETION',
        dataSubjectId: 'user_456',
        dataType: 'all_personal_data',
        processingPurpose: 'right_to_be_forgotten',
        legalBasis: 'consent_withdrawal',
        adminUser: 'admin_1'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Configuration Change Logging', () => {
    it('should log config changes', async () => {
      await auditService.ensureInitialized();

      const result = await auditService.logConfigChange({
        action: 'UPDATE_SETTING',
        configKey: 'ticket_price',
        beforeValue: { price: 45 },
        afterValue: { price: 50 },
        adminUser: 'admin_1',
        ipAddress: '192.168.1.1'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Audit Log Querying', () => {
    beforeEach(async () => {
      await auditService.ensureInitialized();

      // Create test data
      await auditService.logDataChange({
        action: 'CREATE',
        targetType: 'user',
        targetId: 'user_1',
        adminUser: 'admin_1'
      });

      await auditService.logAdminAccess({
        adminUser: 'admin_1',
        requestMethod: 'GET',
        requestUrl: '/api/admin/dashboard',
        responseStatus: 200,
        responseTimeMs: 100
      });
    });

    it('should query audit logs with filtering', async () => {
      const result = await auditService.queryAuditLogs({
        eventType: 'data_change',
        limit: 10
      });

      expect(result.logs).toBeInstanceOf(Array);
      expect(result.logs.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
      expect(result.hasMore).toBeDefined();
    });

    it('should filter by admin user', async () => {
      const result = await auditService.queryAuditLogs({
        adminUser: 'admin_1',
        limit: 5
      });

      expect(result.logs).toBeInstanceOf(Array);
      expect(result.logs.every(log => log.admin_user === 'admin_1' || log.admin_user === null)).toBe(true);
    });

    it('should handle pagination', async () => {
      const firstPage = await auditService.queryAuditLogs({
        limit: 1,
        offset: 0
      });

      const secondPage = await auditService.queryAuditLogs({
        limit: 1,
        offset: 1
      });

      expect(firstPage.logs).toHaveLength(1);
      expect(secondPage.logs).toHaveLength(1);

      if (firstPage.logs[0] && secondPage.logs[0]) {
        expect(firstPage.logs[0].id).not.toBe(secondPage.logs[0].id);
      }
    });
  });

  describe('Audit Statistics', () => {
    beforeEach(async () => {
      await auditService.ensureInitialized();

      // Create test data with different event types and severities
      await auditService.logDataChange({
        action: 'CREATE',
        targetType: 'user',
        targetId: 'user_1',
        adminUser: 'admin_1',
        severity: 'info'
      });

      await auditService.logAdminAccess({
        adminUser: 'admin_2',
        requestMethod: 'POST',
        requestUrl: '/api/admin/config',
        responseStatus: 500,
        responseTimeMs: 200,
        error: 'Server error'
      });
    });

    it('should generate audit statistics', async () => {
      const stats = await auditService.getAuditStats('24h');

      expect(stats.timeframe).toBe('24h');
      expect(stats.stats).toBeInstanceOf(Array);
      expect(stats.generated_at).toBeDefined();

      if (stats.stats.length > 0) {
        const stat = stats.stats[0];
        expect(stat).toHaveProperty('event_type');
        expect(stat).toHaveProperty('severity');
        expect(stat).toHaveProperty('count');
        expect(stat).toHaveProperty('unique_users');
      }
    });

    it('should handle different timeframes', async () => {
      const hourlyStats = await auditService.getAuditStats('1h');
      const dailyStats = await auditService.getAuditStats('24h');
      const weeklyStats = await auditService.getAuditStats('7d');

      expect(hourlyStats.timeframe).toBe('1h');
      expect(dailyStats.timeframe).toBe('24h');
      expect(weeklyStats.timeframe).toBe('7d');
    });
  });
});
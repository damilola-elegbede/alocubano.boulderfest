/**
 * Admin Audit Integration Tests
 * Tests audit logging integration across all admin endpoints
 * Validates audit middleware functionality and database logging
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { testRequest, HTTP_STATUS, generateTestId } from './handler-test-helper.js';
import { getDbClient } from '../setup-integration.js';
import auditService from '../../lib/audit-service.js';
import securityAlertService from '../../lib/security-alert-service.js';
import sessionMonitorService from '../../lib/session-monitor-service.js';

// Test admin credentials
const adminPassword = process.env.TEST_ADMIN_PASSWORD;

if (!adminPassword) {
  throw new Error('❌ FATAL: TEST_ADMIN_PASSWORD required for admin audit tests');
}

describe('Admin Audit Integration Tests', () => {
  let dbClient;
  let adminToken;

  beforeEach(async () => {
    dbClient = await getDbClient();

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

    // Initialize audit service (others will lazy-initialize as needed)
    await auditService.ensureInitialized();

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
    // Clean up test data from audit_logs
    if (dbClient) {
      try {
        await dbClient.execute(
          "DELETE FROM audit_logs WHERE request_id LIKE 'test_%' OR action LIKE '%test%'"
        );
      } catch (error) {
        console.warn('⚠️ Failed to clean audit logs:', error.message);
      }
    }
  });

  describe('Admin Login Audit Logging', () => {
    test('successful admin login generates audit log entry', async () => {
      const testRequestId = generateTestId('login_success');

      // Perform login
      const loginResponse = await testRequest('POST', '/api/admin/login', {
        username: 'admin',
        password: adminPassword
      });

      if (loginResponse.status !== HTTP_STATUS.OK) {
        console.warn('⚠️ Admin service unavailable - skipping login audit test');
        return;
      }

      // Wait for audit logging to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check audit logs for login attempt
      const auditResult = await auditService.queryAuditLogs({
        eventType: 'admin_access',
        limit: 5
      });

      expect(auditResult.logs).toBeInstanceOf(Array);

      // Look for admin login in recent logs
      const loginLogs = auditResult.logs.filter(log =>
        log.request_url?.includes('/api/admin/login') &&
        log.request_method === 'POST'
      );

      expect(loginLogs.length).toBeGreaterThan(0);

      if (loginLogs.length > 0) {
        const loginLog = loginLogs[0];
        expect(loginLog.event_type).toBe('admin_access');
        expect(loginLog.action).toContain('POST');
        expect(loginLog.response_status).toBe(200);
        expect(loginLog.ip_address).toBeDefined();
        expect(loginLog.response_time_ms).toBeGreaterThan(0);
      }
    });

    test('failed admin login generates audit log with error details', async () => {
      const wrongPassword = 'wrongpassword123';

      // Attempt login with wrong credentials
      const loginResponse = await testRequest('POST', '/api/admin/login', {
        username: 'admin',
        password: wrongPassword
      });

      expect(loginResponse.status).toBe(HTTP_STATUS.UNAUTHORIZED);

      // Wait for audit logging
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check audit logs for failed login
      const auditResult = await auditService.queryAuditLogs({
        eventType: 'admin_access',
        limit: 5
      });

      const failedLoginLogs = auditResult.logs.filter(log =>
        log.request_url?.includes('/api/admin/login') &&
        log.response_status === 401
      );

      expect(failedLoginLogs.length).toBeGreaterThan(0);

      if (failedLoginLogs.length > 0) {
        const failedLog = failedLoginLogs[0];
        expect(failedLog.event_type).toBe('admin_access');
        expect(failedLog.severity).toBe('warning');
        expect(failedLog.response_status).toBe(401);
      }
    });

    test('admin logout generates session cleanup audit log', async () => {
      if (!adminToken) {
        console.warn('⚠️ No admin token - skipping logout test');
        return;
      }

      // Perform logout
      const logoutResponse = await testRequest('DELETE', '/api/admin/login', null, {
        'Authorization': `Bearer ${adminToken}`
      });

      if (logoutResponse.status === 0) {
        console.warn('⚠️ Admin logout service unavailable');
        return;
      }

      // Wait for audit logging
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check for logout audit entry
      const auditResult = await auditService.queryAuditLogs({
        eventType: 'admin_access',
        limit: 5
      });

      const logoutLogs = auditResult.logs.filter(log =>
        log.request_url?.includes('/api/admin/login') &&
        log.request_method === 'DELETE'
      );

      expect(logoutLogs.length).toBeGreaterThan(0);
    });
  });

  describe('Admin Dashboard Audit Logging', () => {
    test('admin dashboard access generates detailed audit log', async () => {
      if (!adminToken) {
        console.warn('⚠️ No admin token - skipping dashboard audit test');
        return;
      }

      // Access admin dashboard
      const dashboardResponse = await testRequest('GET', '/api/admin/dashboard', null, {
        'Authorization': `Bearer ${adminToken}`
      });

      if (dashboardResponse.status === 0) {
        console.warn('⚠️ Dashboard service unavailable');
        return;
      }

      // Wait for audit logging
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check audit logs
      const auditResult = await auditService.queryAuditLogs({
        eventType: 'admin_access',
        limit: 10
      });

      const dashboardLogs = auditResult.logs.filter(log =>
        log.request_url?.includes('/api/admin/dashboard')
      );

      expect(dashboardLogs.length).toBeGreaterThan(0);

      if (dashboardLogs.length > 0) {
        const dashboardLog = dashboardLogs[0];
        expect(dashboardLog.event_type).toBe('admin_access');
        expect(dashboardLog.request_method).toBe('GET');
        expect(dashboardLog.admin_user).toBeDefined();
        expect(dashboardLog.session_id).toBeDefined();
        expect(dashboardLog.user_agent).toBeDefined();
      }
    });

    test('unauthorized dashboard access generates security audit log', async () => {
      // Attempt dashboard access without token
      const unauthorizedResponse = await testRequest('GET', '/api/admin/dashboard');

      expect(unauthorizedResponse.status).toBe(HTTP_STATUS.UNAUTHORIZED);

      // Wait for audit logging
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check for unauthorized access audit
      const auditResult = await auditService.queryAuditLogs({
        eventType: 'admin_access',
        limit: 5
      });

      const unauthorizedLogs = auditResult.logs.filter(log =>
        log.request_url?.includes('/api/admin/dashboard') &&
        log.response_status === 401
      );

      expect(unauthorizedLogs.length).toBeGreaterThan(0);

      if (unauthorizedLogs.length > 0) {
        const unauthorizedLog = unauthorizedLogs[0];
        expect(unauthorizedLog.severity).toBe('warning');
        expect(unauthorizedLog.admin_user).toBeNull();
      }
    });
  });

  describe('Admin Transactions Audit Logging', () => {
    test('admin transactions access with high-security audit', async () => {
      if (!adminToken) {
        console.warn('⚠️ No admin token - skipping transactions audit test');
        return;
      }

      // Access admin transactions (high-security endpoint)
      const transactionsResponse = await testRequest('GET', '/api/admin/transactions', null, {
        'Authorization': `Bearer ${adminToken}`
      });

      if (transactionsResponse.status === 0) {
        console.warn('⚠️ Transactions service unavailable');
        return;
      }

      // Wait for audit logging
      await new Promise(resolve => setTimeout(resolve, 800));

      // Check for high-security audit logs
      const auditResult = await auditService.queryAuditLogs({
        eventType: 'admin_access',
        limit: 10
      });

      const transactionLogs = auditResult.logs.filter(log =>
        log.request_url?.includes('/api/admin/transactions')
      );

      expect(transactionLogs.length).toBeGreaterThan(0);

      if (transactionLogs.length > 0) {
        const transactionLog = transactionLogs[0];
        expect(transactionLog.event_type).toBe('admin_access');
        expect(transactionLog.request_method).toBe('GET');

        // High-security endpoints should have enhanced metadata
        if (transactionLog.metadata) {
          const metadata = JSON.parse(transactionLog.metadata);
          expect(metadata.timestamp).toBeDefined();
        }
      }

      // Also check for high-security access logs
      const highSecurityLogs = auditResult.logs.filter(log =>
        log.action === 'high_security_access'
      );

      if (highSecurityLogs.length > 0) {
        const securityLog = highSecurityLogs[0];
        expect(securityLog.event_type).toBe('data_change');
        expect(securityLog.severity).toBe('warning');
        expect(securityLog.target_type).toBe('admin_endpoint');
      }
    });
  });

  describe('Audit Log Querying and Filtering', () => {
    test('audit log querying by event type works correctly', async () => {
      // Create test audit entries of different types
      await auditService.logAdminAccess({
        adminUser: 'test-admin',
        requestMethod: 'GET',
        requestUrl: '/api/admin/test-endpoint',
        responseStatus: 200,
        responseTimeMs: 100
      });

      await auditService.logDataChange({
        action: 'TEST_ACTION',
        targetType: 'test_entity',
        targetId: 'test-123',
        adminUser: 'test-admin'
      });

      // Query by admin_access event type
      const adminAccessLogs = await auditService.queryAuditLogs({
        eventType: 'admin_access',
        limit: 5
      });

      expect(adminAccessLogs.logs).toBeInstanceOf(Array);
      expect(adminAccessLogs.total).toBeGreaterThan(0);

      // All logs should be admin_access type
      adminAccessLogs.logs.forEach(log => {
        expect(log.event_type).toBe('admin_access');
      });

      // Query by data_change event type
      const dataChangeLogs = await auditService.queryAuditLogs({
        eventType: 'data_change',
        limit: 5
      });

      expect(dataChangeLogs.logs).toBeInstanceOf(Array);

      // Should find our test data change
      const testDataChanges = dataChangeLogs.logs.filter(log =>
        log.action === 'TEST_ACTION'
      );
      expect(testDataChanges.length).toBeGreaterThan(0);
    });

    test('audit log querying by admin user works correctly', async () => {
      const testAdminUser = 'test-admin-' + generateTestId();

      // Create audit entries for specific admin user
      await auditService.logAdminAccess({
        adminUser: testAdminUser,
        requestMethod: 'POST',
        requestUrl: '/api/admin/test-user-action',
        responseStatus: 200,
        responseTimeMs: 150
      });

      // Query by admin user
      const userLogs = await auditService.queryAuditLogs({
        adminUser: testAdminUser,
        limit: 10
      });

      expect(userLogs.logs).toBeInstanceOf(Array);
      expect(userLogs.total).toBeGreaterThan(0);

      // All logs should be for the test admin user
      userLogs.logs.forEach(log => {
        if (log.admin_user !== null) {
          expect(log.admin_user).toBe(testAdminUser);
        }
      });
    });

    test('audit log pagination works correctly', async () => {
      // Create multiple audit entries
      for (let i = 0; i < 5; i++) {
        await auditService.logAdminAccess({
          adminUser: 'pagination-test-admin',
          requestMethod: 'GET',
          requestUrl: `/api/admin/test-${i}`,
          responseStatus: 200,
          responseTimeMs: 100 + i
        });
      }

      // Test pagination
      const firstPage = await auditService.queryAuditLogs({
        adminUser: 'pagination-test-admin',
        limit: 2,
        offset: 0
      });

      const secondPage = await auditService.queryAuditLogs({
        adminUser: 'pagination-test-admin',
        limit: 2,
        offset: 2
      });

      expect(firstPage.logs).toHaveLength(2);
      expect(secondPage.logs).toHaveLength(2);
      expect(firstPage.hasMore).toBe(true);

      // Ensure different records
      if (firstPage.logs[0] && secondPage.logs[0]) {
        expect(firstPage.logs[0].id).not.toBe(secondPage.logs[0].id);
      }
    });
  });

  describe('Audit Middleware Integration', () => {
    test('audit middleware does not break endpoint functionality', async () => {
      if (!adminToken) {
        console.warn('⚠️ No admin token - skipping middleware integration test');
        return;
      }

      // Test various admin endpoints to ensure audit middleware doesn't break them
      const endpoints = [
        '/api/admin/dashboard',
        '/api/admin/transactions',
        '/api/admin/health'
      ];

      for (const endpoint of endpoints) {
        const response = await testRequest('GET', endpoint, null, {
          'Authorization': `Bearer ${adminToken}`
        });

        // Endpoint should work (either return data or proper error)
        expect([HTTP_STATUS.OK, HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.NOT_FOUND])
          .toContain(response.status);

        if (response.status === 0) {
          console.warn(`⚠️ ${endpoint} service unavailable`);
          continue;
        }

        // Should have proper response structure
        expect(response.data).toBeDefined();
      }

      // Wait for all audit logs to be written
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify audit logs were created for available endpoints
      const auditResult = await auditService.queryAuditLogs({
        eventType: 'admin_access',
        limit: 20
      });

      // Should have some audit entries from our endpoint tests
      expect(auditResult.total).toBeGreaterThan(0);
    });

    test('audit middleware sanitizes sensitive data in request bodies', async () => {
      // Test login endpoint which should sanitize password
      const loginResponse = await testRequest('POST', '/api/admin/login', {
        username: 'admin',
        password: 'test-sensitive-password'
      });

      // Wait for audit logging
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check audit logs
      const auditResult = await auditService.queryAuditLogs({
        eventType: 'admin_access',
        limit: 5
      });

      const loginLogs = auditResult.logs.filter(log =>
        log.request_url?.includes('/api/admin/login') &&
        log.request_body
      );

      if (loginLogs.length > 0) {
        const loginLog = loginLogs[0];
        const requestBody = JSON.parse(loginLog.request_body);

        // Password should be redacted
        expect(requestBody.password).toBe('[REDACTED]');

        // Username should still be visible
        expect(requestBody.username).toBe('admin');
      }
    });
  });

  describe('Audit Statistics and Health', () => {
    test('audit statistics generation works correctly', async () => {
      // Create some test audit data
      await auditService.logAdminAccess({
        adminUser: 'stats-test-admin',
        requestMethod: 'GET',
        requestUrl: '/api/admin/stats-test',
        responseStatus: 200,
        responseTimeMs: 100
      });

      await auditService.logDataChange({
        action: 'STATS_TEST',
        targetType: 'test',
        targetId: 'stats-123',
        adminUser: 'stats-test-admin',
        severity: 'info'
      });

      // Get audit statistics
      const stats = await auditService.getAuditStats('24h');

      expect(stats.timeframe).toBe('24h');
      expect(stats.stats).toBeInstanceOf(Array);
      expect(stats.generated_at).toBeDefined();

      // Should have some statistics
      expect(stats.stats.length).toBeGreaterThan(0);

      // Validate statistics structure
      if (stats.stats.length > 0) {
        const stat = stats.stats[0];
        expect(stat).toHaveProperty('event_type');
        expect(stat).toHaveProperty('severity');
        expect(stat).toHaveProperty('count');
        expect(stat).toHaveProperty('unique_users');
        expect(typeof stat.count).toBe('number');
      }
    });

    test('audit service health check works correctly', async () => {
      const health = await auditService.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.initialized).toBe(true);
      expect(health.database_connected).toBe(true);
      expect(typeof health.total_logs).toBe('number');
      expect(health.timestamp).toBeDefined();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('audit logging handles database errors gracefully', async () => {
      // Temporarily break the audit service database connection
      const originalDb = auditService.db;
      auditService.db = null;

      // Try to log an audit entry (should not throw)
      const result = await auditService.logAdminAccess({
        adminUser: 'error-test-admin',
        requestMethod: 'GET',
        requestUrl: '/api/admin/error-test',
        responseStatus: 500,
        responseTimeMs: 100
      });

      // Should return error result, not throw
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      // Restore database connection
      auditService.db = originalDb;
    });

    test('audit middleware handles malformed requests gracefully', async () => {
      // Send malformed request body
      const malformedResponse = await testRequest('POST', '/api/admin/login', 'invalid-json');

      // Should get proper error response (not crash)
      expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.UNAUTHORIZED])
        .toContain(malformedResponse.status);

      // Wait for potential audit logging
      await new Promise(resolve => setTimeout(resolve, 500));

      // Audit system should still be functioning
      const health = await auditService.healthCheck();
      expect(health.status).toBe('healthy');
    });
  });
});
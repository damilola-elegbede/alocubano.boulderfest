/**
 * Security Monitoring Services Tests
 * Basic verification that security monitoring services initialize correctly
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { adminSessionMonitor } from '../../lib/admin-session-monitor.js';
import { securityAlertService } from '../../lib/security-alert-service.js';

describe('Security Monitoring Services', () => {
  describe('Admin Session Monitor', () => {
    it('should initialize correctly', async () => {
      const monitor = await adminSessionMonitor.ensureInitialized();
      expect(monitor).toBeDefined();
      expect(monitor.initialized).toBe(true);
    });

    it('should provide health check', async () => {
      const health = await adminSessionMonitor.healthCheck();
      expect(health).toBeDefined();
      expect(health.status).toBe('healthy');
      expect(health.timestamp).toBeDefined();
    });

    it('should track session start', async () => {
      const result = await adminSessionMonitor.trackSessionStart({
        sessionToken: 'test_session_token_123',
        adminId: 'admin',
        ipAddress: '127.0.0.1',
        userAgent: 'test-browser',
        mfaUsed: false,
        loginMethod: 'password'
      });

      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      if (result.success) {
        expect(result.securityScore).toBeGreaterThanOrEqual(0);
        expect(result.securityScore).toBeLessThanOrEqual(100);
        expect(result.riskLevel).toMatch(/^(low|medium|high|critical)$/);
      }
    });
  });

  describe('Security Alert Service', () => {
    it('should initialize correctly', async () => {
      const service = await securityAlertService.ensureInitialized();
      expect(service).toBeDefined();
      expect(service.initialized).toBe(true);
    });

    it('should provide health check', async () => {
      const health = await securityAlertService.healthCheck();
      expect(health).toBeDefined();
      expect(health.status).toBe('healthy');
      expect(health.timestamp).toBeDefined();
    });

    it('should trigger security alert', async () => {
      const result = await securityAlertService.triggerAlert({
        alertType: 'test_alert',
        severity: 'low',
        title: 'Test Security Alert',
        description: 'This is a test alert for unit testing',
        evidence: { testData: 'test' },
        indicators: ['test'],
        adminId: 'admin',
        ipAddress: '127.0.0.1'
      });

      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      if (result.success) {
        expect(result.alertId).toBeDefined();
        expect(result.severity).toBe('low');
      }
    });

    it('should record metrics', async () => {
      const result = await securityAlertService.recordMetric({
        metricType: 'test_metric',
        metricValue: 1,
        timeframe: '1h',
        entityType: 'test_entity',
        entityId: 'test_123',
        ipAddress: '127.0.0.1',
        metadata: { test: true }
      });

      // Should not throw error
      expect(result).toBeUndefined(); // recordMetric doesn't return anything
    });

    it('should check security patterns', async () => {
      const result = await securityAlertService.checkSecurityPatterns({
        adminId: 'admin',
        sessionToken: 'test_token_123',
        ipAddress: '127.0.0.1',
        userAgent: 'test-browser',
        eventType: 'login_attempt',
        success: true,
        metadata: { test: true }
      });

      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.alertsTriggered).toBe('number');
    });
  });

  describe('Integration Tests', () => {
    it('should work together for session monitoring', async () => {
      // Start session monitoring
      const sessionResult = await adminSessionMonitor.trackSessionStart({
        sessionToken: 'integration_test_token',
        adminId: 'admin',
        ipAddress: '192.168.1.100',
        userAgent: 'test-browser',
        mfaUsed: true,
        loginMethod: 'mfa'
      });

      // Check security patterns
      const patternResult = await securityAlertService.checkSecurityPatterns({
        adminId: 'admin',
        sessionToken: 'integration_test_token',
        ipAddress: '192.168.1.100',
        userAgent: 'test-browser',
        eventType: 'session_start',
        success: sessionResult.success,
        metadata: {
          securityScore: sessionResult.securityScore,
          riskLevel: sessionResult.riskLevel
        }
      });

      expect(sessionResult).toBeDefined();
      expect(patternResult).toBeDefined();
      expect(typeof patternResult.success).toBe('boolean');
    });

    it('should provide dashboard data', async () => {
      const sessionDashboard = await adminSessionMonitor.getSessionDashboard(1);
      const alertDashboard = await securityAlertService.getAlertDashboard(1);

      expect(sessionDashboard).toBeDefined();
      expect(sessionDashboard.timeframe).toBe('1h');
      expect(sessionDashboard.generatedAt).toBeDefined();

      expect(alertDashboard).toBeDefined();
      expect(alertDashboard.timeframe).toBe('1h');
      expect(alertDashboard.generatedAt).toBeDefined();
    });
  });
});
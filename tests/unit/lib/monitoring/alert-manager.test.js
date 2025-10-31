/**
 * Alert Manager Unit Tests
 * Comprehensive tests for alert creation, delivery, and deduplication
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  AlertManager,
  AlertSeverity,
  AlertCategory,
  getAlertManager
} from '../../../../lib/monitoring/alert-manager.js';

// Mock dependencies
vi.mock('node-fetch', () => ({
  default: vi.fn()
}));

vi.mock('../../../../lib/monitoring/sentry-config.js', () => ({
  captureMessage: vi.fn()
}));

describe('AlertManager', () => {
  let alertManager;

  beforeEach(() => {
    alertManager = new AlertManager({
      enabled: true,
      thresholds: {
        payment_failure_rate: 0.01,
        database_response_time: 1000,
        error_rate: 0.05
      },
      alertChannels: {
        webhookUrl: 'https://hooks.example.com/webhook'
      }
    });
    vi.clearAllTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(alertManager).toBeDefined();
      expect(alertManager.thresholds.payment_failure_rate).toBe(0.01);
      expect(alertManager.enabled).toBe(true);
    });

    it('should initialize with default thresholds', () => {
      const manager = new AlertManager();
      expect(manager.thresholds.payment_failure_rate).toBe(0.01);
      expect(manager.thresholds.database_response_time).toBe(1000);
    });

    it('should merge custom thresholds with defaults', () => {
      const manager = new AlertManager({
        thresholds: {
          payment_failure_rate: 0.02
        }
      });

      expect(manager.thresholds.payment_failure_rate).toBe(0.02);
      expect(manager.thresholds.database_response_time).toBe(1000); // Default
    });

    it('should be enabled by default', () => {
      const manager = new AlertManager();
      expect(manager.enabled).toBe(true);
    });

    it('should be disabled when configured', () => {
      const manager = new AlertManager({ enabled: false });
      expect(manager.enabled).toBe(false);
    });
  });

  describe('Severity Calculation', () => {
    it('should calculate CRITICAL for high payment failure rate', () => {
      const severity = alertManager.calculateSeverity({
        category: AlertCategory.PAYMENT,
        metrics: { failure_rate: 0.03 } // > 2x threshold (0.02)
      });

      expect(severity).toBe(AlertSeverity.CRITICAL);
    });

    it('should calculate CRITICAL for unavailable database', () => {
      const severity = alertManager.calculateSeverity({
        category: AlertCategory.DATABASE,
        metrics: { available: false }
      });

      expect(severity).toBe(AlertSeverity.CRITICAL);
    });

    it('should calculate HIGH for very high error rate', () => {
      const severity = alertManager.calculateSeverity({
        category: AlertCategory.EXTERNAL_SERVICE,
        metrics: { error_rate: 0.15 } // > 2x threshold (0.10)
      });

      expect(severity).toBe(AlertSeverity.HIGH);
    });

    it('should calculate HIGH for very slow performance', () => {
      const severity = alertManager.calculateSeverity({
        category: AlertCategory.PERFORMANCE,
        metrics: { response_time: 5000 } // > 2x threshold (4000)
      });

      expect(severity).toBe(AlertSeverity.HIGH);
    });

    it('should calculate MEDIUM for moderate performance issues', () => {
      const severity = alertManager.calculateSeverity({
        category: AlertCategory.PERFORMANCE,
        metrics: { response_time: 3000 }
      });

      expect(severity).toBe(AlertSeverity.MEDIUM);
    });

    it('should calculate MEDIUM for high capacity usage', () => {
      const severity = alertManager.calculateSeverity({
        category: AlertCategory.CAPACITY,
        metrics: { usage_percent: 92 }
      });

      expect(severity).toBe(AlertSeverity.MEDIUM);
    });

    it('should calculate HIGH for very high capacity usage', () => {
      const severity = alertManager.calculateSeverity({
        category: AlertCategory.CAPACITY,
        metrics: { usage_percent: 97 }
      });

      expect(severity).toBe(AlertSeverity.HIGH);
    });

    it('should default to LOW severity', () => {
      const severity = alertManager.calculateSeverity({
        category: AlertCategory.BUSINESS,
        metrics: {}
      });

      expect(severity).toBe(AlertSeverity.LOW);
    });
  });

  describe('Alert Deduplication', () => {
    it('should generate consistent alert key', () => {
      const key1 = alertManager.generateAlertKey({
        category: AlertCategory.PAYMENT,
        service: 'stripe',
        type: 'failure'
      });

      const key2 = alertManager.generateAlertKey({
        category: AlertCategory.PAYMENT,
        service: 'stripe',
        type: 'failure'
      });

      expect(key1).toBe(key2);
      expect(key1).toBe('payment:stripe:failure');
    });

    it('should suppress duplicate alerts within aggregation window', () => {
      const alertKey = 'test:service:alert';
      const now = Date.now();

      alertManager.state.recordAlert(alertKey, { test: true });

      vi.setSystemTime(now + 60000); // 1 minute later

      const shouldSuppress = alertManager.state.shouldSuppress(alertKey);
      expect(shouldSuppress).toBe(true);
    });

    it('should not suppress alerts after aggregation window', () => {
      const alertKey = 'test:service:alert';
      const now = Date.now();

      alertManager.state.recordAlert(alertKey, { test: true });

      vi.setSystemTime(now + 6 * 60 * 1000); // 6 minutes later

      const shouldSuppress = alertManager.state.shouldSuppress(alertKey);
      expect(shouldSuppress).toBe(false);
    });

    it('should increment alert count on duplicate', () => {
      const alertKey = 'test:service:alert';

      alertManager.state.recordAlert(alertKey, { title: 'Test' });
      alertManager.state.recordAlert(alertKey, { title: 'Test' });
      alertManager.state.recordAlert(alertKey, { title: 'Test' });

      const alert = alertManager.state.activeAlerts.get(alertKey);
      expect(alert.count).toBe(3);
    });

    it('should track first and last occurrence', () => {
      const alertKey = 'test:service:alert';
      const now = Date.now();

      vi.setSystemTime(now);
      alertManager.state.recordAlert(alertKey, { title: 'Test' });

      vi.setSystemTime(now + 60000);
      alertManager.state.recordAlert(alertKey, { title: 'Test' });

      const alert = alertManager.state.activeAlerts.get(alertKey);
      expect(alert.firstOccurrence).toBe(now);
      expect(alert.lastOccurrence).toBe(now + 60000);
    });

    it('should maintain alert history', () => {
      for (let i = 0; i < 5; i++) {
        alertManager.state.recordAlert(`alert-${i}`, { title: `Alert ${i}` });
      }

      expect(alertManager.state.alertHistory).toHaveLength(5);
    });

    it('should trim alert history to 1000 entries', () => {
      for (let i = 0; i < 1100; i++) {
        alertManager.state.recordAlert(`alert-${i}`, { title: `Alert ${i}` });
      }

      expect(alertManager.state.alertHistory).toHaveLength(1000);
    });
  });

  describe('Maintenance Windows', () => {
    it('should detect maintenance window', () => {
      const now = new Date();
      const manager = new AlertManager({
        maintenanceWindows: [
          {
            start: new Date(now.getTime() - 3600000).toISOString(),
            end: new Date(now.getTime() + 3600000).toISOString()
          }
        ]
      });

      expect(manager.isInMaintenanceWindow()).toBe(true);
    });

    it('should not send alerts during maintenance', () => {
      const now = new Date();
      const manager = new AlertManager({
        maintenanceWindows: [
          {
            start: new Date(now.getTime() - 3600000).toISOString(),
            end: new Date(now.getTime() + 3600000).toISOString()
          }
        ]
      });

      const shouldSend = manager.shouldSendAlert({
        category: AlertCategory.PAYMENT
      }, AlertSeverity.HIGH);

      expect(shouldSend).toBe(false);
    });

    it('should send alerts outside maintenance window', () => {
      const now = new Date();
      const manager = new AlertManager({
        maintenanceWindows: [
          {
            start: new Date(now.getTime() - 7200000).toISOString(),
            end: new Date(now.getTime() - 3600000).toISOString()
          }
        ]
      });

      expect(manager.isInMaintenanceWindow()).toBe(false);
    });
  });

  describe('Suppression Rules', () => {
    it('should suppress alerts below minimum severity', () => {
      const manager = new AlertManager({
        suppressionRules: {
          minSeverity: AlertSeverity.MEDIUM
        }
      });

      const shouldSend = manager.shouldSendAlert({
        category: AlertCategory.BUSINESS
      }, AlertSeverity.LOW);

      expect(shouldSend).toBe(false);
    });

    it('should send alerts at or above minimum severity', () => {
      const manager = new AlertManager({
        suppressionRules: {
          minSeverity: AlertSeverity.MEDIUM
        }
      });

      const shouldSend = manager.shouldSendAlert({
        category: AlertCategory.PAYMENT
      }, AlertSeverity.HIGH);

      expect(shouldSend).toBe(true);
    });

    it('should not send alerts when disabled', () => {
      const manager = new AlertManager({ enabled: false });

      const shouldSend = manager.shouldSendAlert({}, AlertSeverity.CRITICAL);

      expect(shouldSend).toBe(false);
    });
  });

  describe('Alert Escalation', () => {
    it('should detect escalation needed for critical alerts', () => {
      const alertKey = 'critical:service:alert';
      const now = Date.now();

      vi.setSystemTime(now);
      alertManager.state.recordAlert(alertKey, { severity: AlertSeverity.CRITICAL });

      vi.setSystemTime(now + 20 * 60 * 1000); // 20 minutes later

      const needsEscalation = alertManager.state.needsEscalation(alertKey);
      expect(needsEscalation).toBe(true);
    });

    it('should not escalate before timeout', () => {
      const alertKey = 'critical:service:alert';
      const now = Date.now();

      vi.setSystemTime(now);
      alertManager.state.recordAlert(alertKey, { severity: AlertSeverity.CRITICAL });

      vi.setSystemTime(now + 5 * 60 * 1000); // 5 minutes later

      const needsEscalation = alertManager.state.needsEscalation(alertKey);
      expect(needsEscalation).toBe(false);
    });

    it('should not escalate already escalated alerts', () => {
      const alertKey = 'critical:service:alert';
      alertManager.state.recordAlert(alertKey, { severity: AlertSeverity.CRITICAL });
      alertManager.state.markEscalated(alertKey);

      const needsEscalation = alertManager.state.needsEscalation(alertKey);
      expect(needsEscalation).toBe(false);
    });

    it('should escalate alert', async () => {
      const manager = new AlertManager({
        alertChannels: {
          escalationWebhookUrl: 'https://hooks.example.com/escalation'
        }
      });

      const fetch = vi.mocked(await import('node-fetch')).default;
      fetch.mockResolvedValue({ ok: true });

      const alertKey = 'test:alert';
      const alert = { title: 'Test Alert', severity: AlertSeverity.CRITICAL };

      await manager.escalateAlert(alertKey, alert);

      expect(manager.state.escalatedAlerts.has(alertKey)).toBe(true);
    });
  });

  describe('Webhook Delivery', () => {
    it('should send webhook alert', async () => {
      const fetch = vi.mocked(await import('node-fetch')).default;
      fetch.mockResolvedValue({ ok: true, status: 200 });

      const alert = {
        title: 'Test Alert',
        description: 'Test description',
        severity: AlertSeverity.HIGH,
        details: { metric: 'value' }
      };

      const result = await alertManager.sendWebhookAlert(
        alert,
        'https://hooks.example.com/test'
      );

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        'https://hooks.example.com/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });

    it('should handle webhook failures', async () => {
      const fetch = vi.mocked(await import('node-fetch')).default;
      fetch.mockResolvedValue({ ok: false, status: 500 });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await alertManager.sendWebhookAlert(
        { title: 'Test' },
        'https://hooks.example.com/test'
      );

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should format webhook payload correctly', async () => {
      const fetch = vi.mocked(await import('node-fetch')).default;
      let capturedPayload;

      fetch.mockImplementation((url, options) => {
        capturedPayload = JSON.parse(options.body);
        return Promise.resolve({ ok: true });
      });

      const alert = {
        title: 'Test Alert',
        description: 'Test',
        severity: AlertSeverity.CRITICAL,
        details: { key: 'value' }
      };

      await alertManager.sendWebhookAlert(alert, 'https://test.com');

      expect(capturedPayload.text).toBe('Test Alert');
      expect(capturedPayload.username).toBe('A Lo Cubano Alert System');
      expect(capturedPayload.attachments[0].color).toBe('#FF0000'); // CRITICAL = red
    });
  });

  describe('Alert Formatting', () => {
    it('should format alert message correctly', () => {
      const formatted = alertManager.formatAlertMessage({
        category: AlertCategory.PAYMENT,
        service: 'stripe',
        type: 'failure',
        description: 'Payment failed',
        metrics: { count: 10 }
      }, AlertSeverity.HIGH);

      expect(formatted.title).toContain('HIGH');
      expect(formatted.title).toContain('payment');
      expect(formatted.title).toContain('stripe');
      expect(formatted.description).toBe('Payment failed');
      expect(formatted.details.count).toBe(10);
      expect(formatted.timestamp).toBeDefined();
    });

    it('should get correct emoji for severity', () => {
      expect(alertManager.getAlertEmoji(AlertSeverity.CRITICAL)).toBe(':rotating_light:');
      expect(alertManager.getAlertEmoji(AlertSeverity.HIGH)).toBe(':warning:');
      expect(alertManager.getAlertEmoji(AlertSeverity.MEDIUM)).toBe(':exclamation:');
      expect(alertManager.getAlertEmoji(AlertSeverity.LOW)).toBe(':information_source:');
      expect(alertManager.getAlertEmoji(AlertSeverity.INFO)).toBe(':speech_balloon:');
    });

    it('should get correct color for severity', () => {
      expect(alertManager.getAlertColor(AlertSeverity.CRITICAL)).toBe('#FF0000');
      expect(alertManager.getAlertColor(AlertSeverity.HIGH)).toBe('#FF8C00');
      expect(alertManager.getAlertColor(AlertSeverity.MEDIUM)).toBe('#FFD700');
      expect(alertManager.getAlertColor(AlertSeverity.LOW)).toBe('#00CED1');
      expect(alertManager.getAlertColor(AlertSeverity.INFO)).toBe('#808080');
    });
  });

  describe('Alert Processing', () => {
    it('should process alert successfully', async () => {
      const { captureMessage } = vi.mocked(await import('../../../../lib/monitoring/sentry-config.js'));

      const result = await alertManager.processAlert({
        category: AlertCategory.PERFORMANCE,
        service: 'api',
        type: 'slow_response',
        description: 'API is slow',
        metrics: { response_time: 3000 }
      });

      expect(result.sent).toBe(true);
      expect(result.alert).toBeDefined();
      expect(result.channels).toBeDefined();
      expect(captureMessage).toHaveBeenCalled();
    });

    it('should use provided severity', async () => {
      const result = await alertManager.processAlert({
        category: AlertCategory.PAYMENT,
        service: 'stripe',
        severity: AlertSeverity.CRITICAL,
        description: 'Test'
      });

      expect(result.alert.severity).toBe(AlertSeverity.CRITICAL);
    });

    it('should calculate severity if not provided', async () => {
      const result = await alertManager.processAlert({
        category: AlertCategory.PAYMENT,
        service: 'stripe',
        metrics: { failure_rate: 0.05 },
        description: 'Test'
      });

      expect(result.alert.severity).toBe(AlertSeverity.CRITICAL);
    });

    it('should suppress duplicate alerts', async () => {
      // First alert
      await alertManager.processAlert({
        category: AlertCategory.PAYMENT,
        service: 'test',
        type: 'duplicate'
      });

      // Duplicate within window
      const result = await alertManager.processAlert({
        category: AlertCategory.PAYMENT,
        service: 'test',
        type: 'duplicate'
      });

      expect(result.sent).toBe(false);
      expect(result.reason).toBe('suppressed');
    });

    it('should send to webhook if configured', async () => {
      const fetch = vi.mocked(await import('node-fetch')).default;
      fetch.mockResolvedValue({ ok: true });

      const result = await alertManager.processAlert({
        category: AlertCategory.SECURITY,
        description: 'Security issue'
      });

      expect(result.channels).toContainEqual(
        expect.objectContaining({ channel: 'webhook' })
      );
    });

    it('should handle processing errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Force error by passing invalid data
      const result = await alertManager.processAlert(null);

      expect(result.sent).toBe(false);
      expect(result.error).toBeDefined();
      consoleSpy.mockRestore();
    });
  });

  describe('Alert Management', () => {
    it('should get active alerts', () => {
      alertManager.state.recordAlert('alert-1', { title: 'Alert 1', severity: AlertSeverity.HIGH });
      alertManager.state.recordAlert('alert-2', { title: 'Alert 2', severity: AlertSeverity.LOW });

      const active = alertManager.getActiveAlerts();

      expect(active).toHaveLength(2);
    });

    it('should clear alert', () => {
      const alertKey = 'test:alert';
      alertManager.state.recordAlert(alertKey, { title: 'Test' });

      alertManager.clearAlert(alertKey);

      expect(alertManager.state.activeAlerts.has(alertKey)).toBe(false);
    });

    it('should get alert statistics', () => {
      alertManager.state.recordAlert('critical-1', {
        title: 'Critical',
        severity: AlertSeverity.CRITICAL,
        details: { Category: AlertCategory.PAYMENT }
      });
      alertManager.state.recordAlert('high-1', {
        title: 'High',
        severity: AlertSeverity.HIGH,
        details: { Category: AlertCategory.DATABASE }
      });

      const stats = alertManager.getStatistics();

      expect(stats.total_active).toBe(2);
      expect(stats.severity_breakdown[AlertSeverity.CRITICAL]).toBe(1);
      expect(stats.severity_breakdown[AlertSeverity.HIGH]).toBe(1);
      expect(stats.category_breakdown[AlertCategory.PAYMENT]).toBe(1);
    });
  });

  describe('Configuration Updates', () => {
    it('should update thresholds', () => {
      alertManager.updateConfiguration({
        thresholds: {
          payment_failure_rate: 0.02
        }
      });

      expect(alertManager.thresholds.payment_failure_rate).toBe(0.02);
    });

    it('should update alert channels', () => {
      alertManager.updateConfiguration({
        alertChannels: {
          webhookUrl: 'https://new-webhook.com'
        }
      });

      expect(alertManager.alertChannels.webhookUrl).toBe('https://new-webhook.com');
    });

    it('should update suppression rules', () => {
      alertManager.updateConfiguration({
        suppressionRules: {
          minSeverity: AlertSeverity.HIGH
        }
      });

      expect(alertManager.suppressionRules.minSeverity).toBe(AlertSeverity.HIGH);
    });

    it('should update maintenance windows', () => {
      const windows = [{ start: '2024-01-01', end: '2024-01-02' }];

      alertManager.updateConfiguration({
        maintenanceWindows: windows
      });

      expect(alertManager.maintenanceWindows).toEqual(windows);
    });

    it('should enable/disable alerts', () => {
      alertManager.updateConfiguration({ enabled: false });
      expect(alertManager.enabled).toBe(false);

      alertManager.updateConfiguration({ enabled: true });
      expect(alertManager.enabled).toBe(true);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const instance1 = getAlertManager();
      const instance2 = getAlertManager();

      expect(instance1).toBe(instance2);
    });

    it('should initialize with environment variables', async () => {
      process.env.PAYMENT_FAILURE_THRESHOLD = '0.03';
      process.env.DB_RESPONSE_THRESHOLD = '2000';

      // Clear singleton to reinitialize
      vi.resetModules();
      const { getAlertManager } = await import('../../../../lib/monitoring/alert-manager.js');

      const instance = getAlertManager();

      expect(instance.thresholds.payment_failure_rate).toBe(0.03);
      expect(instance.thresholds.database_response_time).toBe(2000);

      delete process.env.PAYMENT_FAILURE_THRESHOLD;
      delete process.env.DB_RESPONSE_THRESHOLD;
    });
  });
});

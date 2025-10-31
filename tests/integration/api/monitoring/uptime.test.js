/**
 * Uptime API Integration Tests
 * Tests uptime monitoring, SLA calculations, and availability tracking
 */

import { describe, it, expect } from 'vitest';
import { testApiHandler } from '../../handler-test-helper.js';

describe('Uptime API Integration', () => {
  describe('GET /api/monitoring/uptime - Uptime Metrics', () => {
    it('should return uptime metrics successfully', async () => {
      const response = await testApiHandler(
        'api/monitoring/uptime',
        'GET',
        '/api/monitoring/uptime'
      );

      expect(response.status).toBe(200);
      expect(response.data.status).toMatch(/healthy|degraded|unhealthy/);
      expect(response.data.timestamp).toBeDefined();
      expect(response.data.uptime).toBeDefined();
    });

    it('should include uptime duration', async () => {
      const response = await testApiHandler(
        'api/monitoring/uptime',
        'GET',
        '/api/monitoring/uptime'
      );

      expect(response.status).toBe(200);
      expect(response.data.uptime.startTime).toBeDefined();
      expect(response.data.uptime.currentTime).toBeDefined();
      expect(response.data.uptime.uptime).toBeDefined();
      expect(response.data.uptime.uptime.seconds).toBeGreaterThanOrEqual(0);
      expect(response.data.uptime.uptime.formatted).toBeDefined();
    });

    it('should track request statistics', async () => {
      const response = await testApiHandler(
        'api/monitoring/uptime',
        'GET',
        '/api/monitoring/uptime'
      );

      expect(response.status).toBe(200);
      expect(response.data.uptime.requests).toBeDefined();
      expect(response.data.uptime.requests.total).toBeGreaterThanOrEqual(0);
      expect(response.data.uptime.requests.errors).toBeGreaterThanOrEqual(0);
      expect(response.data.uptime.requests.successRate).toBeGreaterThanOrEqual(0);
      expect(response.data.uptime.requests.successRate).toBeLessThanOrEqual(100);
    });

    it('should include availability information', async () => {
      const response = await testApiHandler(
        'api/monitoring/uptime',
        'GET',
        '/api/monitoring/uptime'
      );

      expect(response.status).toBe(200);
      expect(response.data.availability).toBeDefined();
      expect(response.data.availability.percentage).toBeDefined();
      expect(response.data.availability.zones).toBeDefined();
    });

    it('should check dependencies status', async () => {
      const response = await testApiHandler(
        'api/monitoring/uptime',
        'GET',
        '/api/monitoring/uptime'
      );

      expect(response.status).toBe(200);
      expect(response.data.dependencies).toBeDefined();
      expect(typeof response.data.dependencies).toBe('object');
    });

    it('should include SLA metrics', async () => {
      const response = await testApiHandler(
        'api/monitoring/uptime',
        'GET',
        '/api/monitoring/uptime'
      );

      expect(response.status).toBe(200);
      expect(response.data.sla).toBeDefined();
      expect(response.data.sla.targets).toBeDefined();
      expect(response.data.sla.targets.uptime).toBe(99.9);
      expect(response.data.sla.targets.errorRate).toBe(1.0);
      expect(response.data.sla.compliance).toBeDefined();
      expect(response.data.sla.monthlyDowntimeAllowance).toBeDefined();
    });

    it('should include incident history', async () => {
      const response = await testApiHandler(
        'api/monitoring/uptime',
        'GET',
        '/api/monitoring/uptime'
      );

      expect(response.status).toBe(200);
      expect(response.data.incidents).toBeDefined();
      expect(response.data.incidents.total).toBeDefined();
      expect(response.data.incidents.recentIncidents).toBeDefined();
      expect(Array.isArray(response.data.incidents.recentIncidents)).toBe(true);
    });

    it('should include performance summary', async () => {
      const response = await testApiHandler(
        'api/monitoring/uptime',
        'GET',
        '/api/monitoring/uptime'
      );

      expect(response.status).toBe(200);
      expect(response.data.performance).toBeDefined();
      expect(response.data.performance.avgResponseTime).toBeDefined();
      expect(response.data.performance.p95ResponseTime).toBeDefined();
      expect(response.data.performance.requestsPerMinute).toBeDefined();
    });

    it('should include monitoring configuration', async () => {
      const response = await testApiHandler(
        'api/monitoring/uptime',
        'GET',
        '/api/monitoring/uptime'
      );

      expect(response.status).toBe(200);
      expect(response.data.monitoring).toBeDefined();
      expect(response.data.monitoring.lastCheck).toBeDefined();
      expect(response.data.monitoring.nextCheck).toBeDefined();
      expect(response.data.monitoring.checksPerHour).toBeDefined();
    });
  });

  describe('Response Headers', () => {
    it('should include uptime status headers', async () => {
      const response = await testApiHandler(
        'api/monitoring/uptime',
        'GET',
        '/api/monitoring/uptime'
      );

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toContain('no-cache');
      expect(response.headers['x-uptime-status']).toBeDefined();
      expect(response.headers['x-uptime-percentage']).toBeDefined();
      expect(response.headers['x-sla-compliance']).toMatch(/true|false/);
    });

    it('should prevent caching', async () => {
      const response = await testApiHandler(
        'api/monitoring/uptime',
        'GET',
        '/api/monitoring/uptime'
      );

      expect(response.headers['cache-control']).toContain('no-store');
      expect(response.headers['cache-control']).toContain('must-revalidate');
    });
  });

  describe('SLA Compliance Validation', () => {
    it('should calculate uptime compliance', async () => {
      const response = await testApiHandler(
        'api/monitoring/uptime',
        'GET',
        '/api/monitoring/uptime'
      );

      expect(response.status).toBe(200);
      expect(response.data.sla.compliance.uptime).toBeDefined();
      expect(typeof response.data.sla.compliance.uptime).toBe('boolean');
    });

    it('should calculate error rate compliance', async () => {
      const response = await testApiHandler(
        'api/monitoring/uptime',
        'GET',
        '/api/monitoring/uptime'
      );

      expect(response.status).toBe(200);
      expect(response.data.sla.compliance.errorRate).toBeDefined();
      expect(typeof response.data.sla.compliance.errorRate).toBe('boolean');
    });

    it('should calculate overall SLA compliance', async () => {
      const response = await testApiHandler(
        'api/monitoring/uptime',
        'GET',
        '/api/monitoring/uptime'
      );

      expect(response.status).toBe(200);
      expect(response.data.sla.compliance.overall).toBeDefined();
      expect(typeof response.data.sla.compliance.overall).toBe('boolean');
    });

    it('should include downtime allowance', async () => {
      const response = await testApiHandler(
        'api/monitoring/uptime',
        'GET',
        '/api/monitoring/uptime'
      );

      expect(response.status).toBe(200);
      expect(response.data.sla.monthlyDowntimeAllowance.minutes).toBe(43.2);
      expect(response.data.sla.monthlyDowntimeAllowance.seconds).toBe(2592);
    });
  });

  describe('Method Validation', () => {
    it('should only allow GET requests', async () => {
      const response = await testApiHandler(
        'api/monitoring/uptime',
        'POST',
        '/api/monitoring/uptime'
      );

      expect(response.status).toBe(405);
      expect(response.data.error).toContain('Method not allowed');
    });
  });

  describe('Error Handling', () => {
    it('should handle service check failures gracefully', async () => {
      const response = await testApiHandler(
        'api/monitoring/uptime',
        'GET',
        '/api/monitoring/uptime'
      );

      // Should still return 200 even if some checks fail
      expect(response.status).toBe(200);
      expect(response.data.dependencies).toBeDefined();
    });
  });
});

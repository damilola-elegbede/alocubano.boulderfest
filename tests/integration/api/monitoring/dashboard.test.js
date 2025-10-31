/**
 * Dashboard API Integration Tests
 * Tests dashboard data aggregation and visualization endpoints
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { testApiHandler } from '../../handler-test-helper.js';

describe('Dashboard API Integration', () => {
  describe('GET /api/monitoring/dashboard - Dashboard Data', () => {
    it('should return dashboard data successfully', async () => {
      const response = await testApiHandler(
        'api/monitoring/dashboard',
        'GET',
        '/api/monitoring/dashboard'
      );

      expect(response.status).toBe(200);
      expect(response.data.timestamp).toBeDefined();
      expect(response.data.overview).toBeDefined();
      expect(response.data.performance).toBeDefined();
      expect(response.data.business).toBeDefined();
      expect(response.data.infrastructure).toBeDefined();
      expect(response.data.alerts).toBeDefined();
    });

    it('should include system overview', async () => {
      const response = await testApiHandler(
        'api/monitoring/dashboard',
        'GET',
        '/api/monitoring/dashboard'
      );

      expect(response.status).toBe(200);
      expect(response.data.overview.status).toMatch(/healthy|degraded|unhealthy/);
      expect(response.data.overview.uptime).toBeDefined();
      expect(response.data.overview.sla_compliance).toBeDefined();
    });

    it('should include performance metrics', async () => {
      const response = await testApiHandler(
        'api/monitoring/dashboard',
        'GET',
        '/api/monitoring/dashboard'
      );

      expect(response.status).toBe(200);
      expect(response.data.performance.current).toBeDefined();
      expect(response.data.performance.current.response_time).toBeDefined();
      expect(response.data.performance.current.error_rate).toBeDefined();
      expect(response.data.performance.percentiles).toBeDefined();
    });

    it('should include business metrics', async () => {
      const response = await testApiHandler(
        'api/monitoring/dashboard',
        'GET',
        '/api/monitoring/dashboard'
      );

      expect(response.status).toBe(200);
      expect(response.data.business.revenue).toBeDefined();
      expect(response.data.business.users).toBeDefined();
      expect(response.data.business.tickets).toBeDefined();
    });

    it('should include infrastructure metrics', async () => {
      const response = await testApiHandler(
        'api/monitoring/dashboard',
        'GET',
        '/api/monitoring/dashboard'
      );

      expect(response.status).toBe(200);
      expect(response.data.infrastructure.memory).toBeDefined();
      expect(response.data.infrastructure.memory.used).toBeDefined();
      expect(response.data.infrastructure.memory.percentage).toBeDefined();
    });

    it('should include alert statistics', async () => {
      const response = await testApiHandler(
        'api/monitoring/dashboard',
        'GET',
        '/api/monitoring/dashboard'
      );

      expect(response.status).toBe(200);
      expect(response.data.alerts.active_count).toBeDefined();
      expect(response.data.alerts.by_severity).toBeDefined();
      expect(response.data.alerts.by_category).toBeDefined();
    });
  });

  describe('Platform-Specific Configuration', () => {
    it('should generate Grafana configuration', async () => {
      const response = await testApiHandler(
        'api/monitoring/dashboard',
        'GET',
        '/api/monitoring/dashboard?platform=grafana'
      );

      expect(response.status).toBe(200);
      expect(response.data.name).toContain('A Lo Cubano');
      expect(response.data.panels).toBeDefined();
      expect(Array.isArray(response.data.panels)).toBe(true);
    });

    it('should generate Datadog configuration', async () => {
      const response = await testApiHandler(
        'api/monitoring/dashboard',
        'GET',
        '/api/monitoring/dashboard?platform=datadog'
      );

      expect(response.status).toBe(200);
      expect(response.data.widgets).toBeDefined();
      expect(Array.isArray(response.data.widgets)).toBe(true);
    });

    it('should generate New Relic configuration', async () => {
      const response = await testApiHandler(
        'api/monitoring/dashboard',
        'GET',
        '/api/monitoring/dashboard?platform=newrelic'
      );

      expect(response.status).toBe(200);
      expect(response.data.dashboards).toBeDefined();
    });

    it('should reject invalid platform', async () => {
      const response = await testApiHandler(
        'api/monitoring/dashboard',
        'GET',
        '/api/monitoring/dashboard?platform=invalid'
      );

      expect(response.status).toBe(400);
      expect(response.data.error).toContain('Invalid platform');
      expect(response.data.supported).toBeDefined();
    });
  });

  describe('Response Headers', () => {
    it('should include dashboard status headers', async () => {
      const response = await testApiHandler(
        'api/monitoring/dashboard',
        'GET',
        '/api/monitoring/dashboard'
      );

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/json');
      expect(response.headers['cache-control']).toContain('no-cache');
      expect(response.headers['x-dashboard-status']).toBeDefined();
    });

    it('should prevent caching', async () => {
      const response = await testApiHandler(
        'api/monitoring/dashboard',
        'GET',
        '/api/monitoring/dashboard'
      );

      expect(response.headers['cache-control']).toContain('no-store');
      expect(response.headers['cache-control']).toContain('must-revalidate');
    });
  });

  describe('Method Validation', () => {
    it('should only allow GET requests', async () => {
      const response = await testApiHandler(
        'api/monitoring/dashboard',
        'POST',
        '/api/monitoring/dashboard'
      );

      expect(response.status).toBe(405);
      expect(response.data.error).toContain('Method not allowed');
    });
  });
});

/**
 * Alerts API Integration Tests
 * Tests alert management endpoints with authentication and operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testApiHandler } from '../../handler-test-helper.js';

describe('Alerts API Integration', () => {
  const ADMIN_API_KEY = 'test_admin_key';

  beforeEach(() => {
    process.env.ADMIN_API_KEY = ADMIN_API_KEY;
  });

  afterEach(() => {
    delete process.env.ADMIN_API_KEY;
  });

  describe('GET /api/monitoring/alerts - Authentication', () => {
    it('should require admin key for sensitive operations', async () => {
      const response = await testApiHandler(
        'api/monitoring/alerts',
        'GET',
        '/api/monitoring/alerts?action=status'
      );

      expect(response.status).toBe(401);
      expect(response.data.error).toBe('Unauthorized');
    });

    it('should allow access with valid admin key', async () => {
      const response = await testApiHandler(
        'api/monitoring/alerts',
        'GET',
        `/api/monitoring/alerts?action=status&admin_key=${ADMIN_API_KEY}`
      );

      expect(response.status).toBe(200);
    });

    it('should allow access with header authentication', async () => {
      const response = await testApiHandler(
        'api/monitoring/alerts',
        'GET',
        '/api/monitoring/alerts?action=status',
        null,
        { 'x-admin-key': ADMIN_API_KEY }
      );

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/monitoring/alerts - Alert Status', () => {
    it('should return alert statistics', async () => {
      const response = await testApiHandler(
        'api/monitoring/alerts',
        'GET',
        `/api/monitoring/alerts?action=status&admin_key=${ADMIN_API_KEY}`
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toBeDefined();
      expect(response.data.data.total_active).toBeDefined();
      expect(response.data.data.severity_breakdown).toBeDefined();
    });

    it('should get active alerts', async () => {
      const response = await testApiHandler(
        'api/monitoring/alerts',
        'GET',
        '/api/monitoring/alerts?action=active'
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(Array.isArray(response.data.alerts)).toBe(true);
      expect(response.data.count).toBeDefined();
    });

    it('should get alert templates', async () => {
      const response = await testApiHandler(
        'api/monitoring/alerts',
        'GET',
        '/api/monitoring/alerts?action=templates'
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.templates).toBeDefined();
      expect(response.data.templates.high_error_rate).toBeDefined();
      expect(response.data.templates.payment_failures).toBeDefined();
    });

    it('should get alert configuration', async () => {
      const response = await testApiHandler(
        'api/monitoring/alerts',
        'GET',
        `/api/monitoring/alerts?action=configuration&admin_key=${ADMIN_API_KEY}`
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.configuration).toBeDefined();
      expect(response.data.configuration.thresholds).toBeDefined();
      expect(response.data.configuration.enabled).toBeDefined();
    });
  });

  describe('POST /api/monitoring/alerts - Create Alert', () => {
    it('should test alert configuration', async () => {
      const response = await testApiHandler(
        'api/monitoring/alerts',
        'POST',
        '/api/monitoring/alerts',
        { action: 'test' },
        { 'x-admin-key': ADMIN_API_KEY }
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.test).toBeDefined();
    });

    it('should trigger manual alert', async () => {
      const response = await testApiHandler(
        'api/monitoring/alerts',
        'POST',
        '/api/monitoring/alerts',
        {
          action: 'trigger',
          category: 'external_service',
          service: 'test',
          type: 'manual_test',
          description: 'Test alert',
          severity: 'info'
        },
        { 'x-admin-key': ADMIN_API_KEY }
      );

      expect(response.status).toBe(200);
      expect(response.data.alert).toBeDefined();
      expect(response.data.channels).toBeDefined();
    });

    it('should create alert rule', async () => {
      const response = await testApiHandler(
        'api/monitoring/alerts',
        'POST',
        '/api/monitoring/alerts',
        {
          action: 'create_rule',
          name: 'Test Rule',
          description: 'Test alert rule',
          conditions: {
            metric: 'test.metric',
            operator: '>',
            threshold: 100
          },
          actions: {
            severity: 'medium',
            category: 'performance'
          }
        },
        { 'x-admin-key': ADMIN_API_KEY }
      );

      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.rule).toBeDefined();
      expect(response.data.rule.name).toBe('Test Rule');
    });

    it('should validate alert rule', async () => {
      const response = await testApiHandler(
        'api/monitoring/alerts',
        'POST',
        '/api/monitoring/alerts',
        {
          action: 'create_rule',
          description: 'Missing name and conditions'
        },
        { 'x-admin-key': ADMIN_API_KEY }
      );

      expect(response.status).toBe(400);
      expect(response.data.errors).toBeDefined();
      expect(response.data.errors.length).toBeGreaterThan(0);
    });

    it('should clear specific alert', async () => {
      const response = await testApiHandler(
        'api/monitoring/alerts',
        'POST',
        '/api/monitoring/alerts',
        {
          action: 'clear',
          alertKey: 'test:service:alert'
        },
        { 'x-admin-key': ADMIN_API_KEY }
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it('should update alert configuration', async () => {
      const response = await testApiHandler(
        'api/monitoring/alerts',
        'POST',
        '/api/monitoring/alerts',
        {
          action: 'update_config',
          configuration: {
            thresholds: {
              payment_failure_rate: 0.02
            }
          }
        },
        { 'x-admin-key': ADMIN_API_KEY }
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it('should set maintenance window', async () => {
      const response = await testApiHandler(
        'api/monitoring/alerts',
        'POST',
        '/api/monitoring/alerts',
        {
          action: 'maintenance',
          start: new Date().toISOString(),
          end: new Date(Date.now() + 3600000).toISOString(),
          reason: 'Scheduled maintenance'
        },
        { 'x-admin-key': ADMIN_API_KEY }
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.maintenanceWindow).toBeDefined();
    });

    it('should reject invalid action', async () => {
      const response = await testApiHandler(
        'api/monitoring/alerts',
        'POST',
        '/api/monitoring/alerts',
        { action: 'invalid' },
        { 'x-admin-key': ADMIN_API_KEY }
      );

      expect(response.status).toBe(400);
      expect(response.data.error).toContain('Invalid action');
    });
  });

  describe('DELETE /api/monitoring/alerts - Delete Alert', () => {
    it('should delete specific alert', async () => {
      const response = await testApiHandler(
        'api/monitoring/alerts',
        'DELETE',
        `/api/monitoring/alerts?alertKey=test:alert&admin_key=${ADMIN_API_KEY}`
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it('should require alert key', async () => {
      const response = await testApiHandler(
        'api/monitoring/alerts',
        'DELETE',
        `/api/monitoring/alerts?admin_key=${ADMIN_API_KEY}`
      );

      expect(response.status).toBe(400);
      expect(response.data.error).toContain('Alert key required');
    });
  });

  describe('Method Validation', () => {
    it('should reject unsupported methods', async () => {
      const response = await testApiHandler(
        'api/monitoring/alerts',
        'PUT',
        '/api/monitoring/alerts'
      );

      expect(response.status).toBe(405);
      expect(response.data.error).toContain('not allowed');
    });
  });
});

/**
 * API Health Integration Tests
 * Tests the health check endpoints with real server
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { httpClient } from '../core/http.js';
import { databaseHelper } from '../core/database.js';

describe('API Health Integration', () => {
  beforeEach(async () => {
    // Ensure database is ready
    await databaseHelper.initialize();
  });

  describe('Health Check Endpoint', () => {
    it('should return healthy status', async () => {
      const response = await httpClient.get('/api/health/check');
      
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        version: expect.any(String)
      });
    });

    it('should include system information', async () => {
      const response = await httpClient.get('/api/health/check');
      
      expect(response.data).toHaveProperty('system');
      expect(response.data.system).toMatchObject({
        nodeVersion: expect.any(String),
        uptime: expect.any(Number)
      });
    });
  });

  describe('Database Health Check', () => {
    it('should return database connection status', async () => {
      const response = await httpClient.get('/api/health/database');
      
      expect(response.ok).toBe(true);
      expect(response.data).toMatchObject({
        status: 'healthy',
        database: {
          connected: true,
          type: expect.any(String)
        }
      });
    });

    it('should handle database queries', async () => {
      const response = await httpClient.get('/api/health/database');
      
      expect(response.data.database).toHaveProperty('lastQuery');
      expect(response.data.database.lastQuery).toMatchObject({
        success: true,
        duration: expect.any(Number)
      });
    });
  });

  describe('Stripe Health Check', () => {
    it('should return Stripe connection status', async () => {
      const response = await httpClient.get('/api/health/stripe');
      
      expect(response.ok).toBe(true);
      expect(response.data).toMatchObject({
        status: expect.stringMatching(/^(healthy|degraded)$/),
        stripe: {
          configured: true,
          testMode: expect.any(Boolean)
        }
      });
    });

    it('should validate Stripe configuration', async () => {
      const response = await httpClient.get('/api/health/stripe');
      
      if (response.data.stripe.configured) {
        expect(response.data.stripe).toHaveProperty('accountId');
        expect(response.data.stripe.testMode).toBe(true); // Should be test mode in integration tests
      }
    });
  });

  describe('Brevo Health Check', () => {
    it('should return Brevo email service status', async () => {
      const response = await httpClient.get('/api/health/brevo');
      
      expect(response.ok).toBe(true);
      expect(response.data).toMatchObject({
        status: expect.stringMatching(/^(healthy|degraded|unhealthy)$/),
        brevo: {
          configured: expect.any(Boolean)
        }
      });
    });

    it('should validate API connectivity if configured', async () => {
      const response = await httpClient.get('/api/health/brevo');
      
      if (response.data.brevo.configured) {
        expect(response.data.brevo).toHaveProperty('apiReachable');
      }
    });
  });

  describe('Simple Health Check', () => {
    it('should return minimal health status', async () => {
      const response = await httpClient.get('/api/health/simple');
      
      expect(response.ok).toBe(true);
      expect(response.data).toEqual({
        status: 'ok',
        timestamp: expect.any(String)
      });
    });

    it('should respond quickly', async () => {
      const startTime = Date.now();
      const response = await httpClient.get('/api/health/simple');
      const duration = Date.now() - startTime;
      
      expect(response.ok).toBe(true);
      // Relax timing for CI environment
      const maxResponseTime = process.env.CI ? 3000 : 1000;
      expect(duration).toBeLessThan(maxResponseTime); // Should respond within reasonable time
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid health endpoints gracefully', async () => {
      const response = await httpClient.get('/api/health/nonexistent');
      
      expect(response.status).toBe(404);
    });

    it('should return consistent error format', async () => {
      const response = await httpClient.get('/api/health/nonexistent');
      
      expect(response.data).toMatchObject({
        error: expect.any(String),
        status: 404
      });
    });
  });
});
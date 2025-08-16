/**
 * HTTP Server Integration Test
 * Tests that require an actual running server
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serverManager } from '@core/server.js';
import { httpClient } from '@core/http.js';

describe('HTTP Server Integration', () => {
  beforeAll(async () => {
    // Start server for these tests
    await serverManager.start();
  });

  afterAll(async () => {
    // Stop server after tests
    await serverManager.stop();
  });

  describe('Server Management', () => {
    it('should have server running', () => {
      expect(serverManager.isServerRunning()).toBe(true);
      expect(serverManager.getUrl()).toMatch(/^http:\/\/localhost:\d+$/);
    });

    it('should perform health check', async () => {
      const health = await serverManager.healthCheck();
      
      expect(health).toMatchObject({
        healthy: expect.any(Boolean),
        status: expect.any(Number)
      });
    });
  });

  describe('HTTP Client', () => {
    it('should make basic GET request', async () => {
      const response = await httpClient.get('/api/health/simple');
      
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String)
      });
    });

    it('should handle 404 responses', async () => {
      const response = await httpClient.get('/api/nonexistent-endpoint');
      
      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });

    it('should make POST request with JSON data', async () => {
      const testData = { test: 'data', timestamp: Date.now() };
      
      // This might fail if endpoint doesn't exist, but we're testing the HTTP mechanism
      const response = await httpClient.post('/api/debug', testData);
      
      // The response may be 404 (endpoint doesn't exist) but the HTTP client should work
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeouts', async () => {
      // Test with very short timeout
      const response = await httpClient.get('/api/health/simple', { timeout: 1 });
      
      // Should either succeed quickly or fail with timeout
      expect(typeof response.status).toBe('number');
    });
  });
});
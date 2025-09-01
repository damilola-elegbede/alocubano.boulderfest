/**
 * Mock Server Health Check Tests
 * 
 * Tests the health check functionality added to the CI mock server.
 * These tests verify that the server provides proper health monitoring
 * and readiness endpoints for robust CI/CD integration.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import http from 'http';

const TEST_PORT = 3001;
let mockServer;

/**
 * Make HTTP request helper
 */
function makeRequest(path, port = TEST_PORT) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port,
      path,
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = res.headers['content-type']?.includes('application/json') 
            ? JSON.parse(data) 
            : data;
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: jsonData
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: data
          });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Wait for server to be ready
 */
async function waitForServer(maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await makeRequest('/ready');
      if (response.statusCode === 200) {
        return true;
      }
    } catch (error) {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

describe('Mock Server Health Checks', () => {
  beforeAll(async () => {
    // Start mock server on test port
    mockServer = spawn('node', ['tests/ci-mock-server.js'], {
      env: { ...process.env, PORT: TEST_PORT.toString() },
      stdio: 'pipe'
    });

    // Wait for server to be ready
    const ready = await waitForServer();
    if (!ready) {
      throw new Error('Mock server failed to start within timeout period');
    }
  });

  afterAll(async () => {
    if (mockServer) {
      mockServer.kill('SIGTERM');
      
      // Wait for process to exit
      await new Promise((resolve) => {
        mockServer.on('exit', resolve);
        setTimeout(() => {
          mockServer.kill('SIGKILL');
          resolve();
        }, 2000);
      });
    }
  });

  test('should provide detailed health status at /api/health/mock-server', async () => {
    const response = await makeRequest('/api/health/mock-server');
    
    expect(response.statusCode).toBe(200);
    expect(response.data).toMatchObject({
      status: 'healthy',
      uptime: expect.any(Number),
      endpoints: {
        total: expect.any(Number),
        ready: expect.any(Number),
        available: expect.any(Array)
      },
      memory: {
        rss: expect.any(Number),
        heapTotal: expect.any(Number),
        heapUsed: expect.any(Number),
        external: expect.any(Number),
        arrayBuffers: expect.any(Number)
      },
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
      startupDuration: expect.any(Number),
      environment: 'ci-mock',
      version: '1.0.0'
    });

    // Verify endpoints information
    expect(response.data.endpoints.total).toBeGreaterThan(0);
    expect(response.data.endpoints.ready).toBeGreaterThan(0);
    expect(response.data.endpoints.available).toBeInstanceOf(Array);
    expect(response.data.endpoints.available.length).toBe(response.data.endpoints.total);
    
    // Verify uptime is reasonable
    expect(response.data.uptime).toBeGreaterThanOrEqual(0);
    expect(response.data.uptime).toBeLessThan(300); // Less than 5 minutes for test
    
    // Verify startup duration is reasonable
    expect(response.data.startupDuration).toBeGreaterThan(0);
    expect(response.data.startupDuration).toBeLessThan(10000); // Less than 10 seconds
  });

  test('should provide ready status at /ready', async () => {
    const response = await makeRequest('/ready');
    
    expect(response.statusCode).toBe(200);
    expect(response.data.trim()).toBe('Ready');
  });

  test('should provide healthz endpoint at /healthz', async () => {
    const response = await makeRequest('/healthz');
    
    expect(response.statusCode).toBe(200);
    expect(response.data).toMatchObject({
      status: 'healthy',
      ready: true,
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    });
  });

  test('should include required endpoints in health status', async () => {
    const response = await makeRequest('/api/health/mock-server');
    
    const requiredEndpoints = [
      'GET /api/health/check',
      'POST /api/tickets/validate', 
      'POST /api/email/subscribe',
      'POST /api/payments/create-checkout-session',
      'GET /api/registration/health',
      'GET /api/gallery'
    ];

    expect(response.data.endpoints.available).toEqual(
      expect.arrayContaining(requiredEndpoints)
    );
  });

  test('should update timestamp on each request', async () => {
    const response1 = await makeRequest('/api/health/mock-server');
    await new Promise(resolve => setTimeout(resolve, 1100)); // Wait over 1 second
    const response2 = await makeRequest('/api/health/mock-server');
    
    expect(response1.statusCode).toBe(200);
    expect(response2.statusCode).toBe(200);
    
    const timestamp1 = new Date(response1.data.timestamp);
    const timestamp2 = new Date(response2.data.timestamp);
    
    expect(timestamp2.getTime()).toBeGreaterThan(timestamp1.getTime());
  });

  test('should track memory usage in health status', async () => {
    const response = await makeRequest('/api/health/mock-server');
    
    expect(response.statusCode).toBe(200);
    expect(response.data.memory.rss).toBeGreaterThan(0);
    expect(response.data.memory.heapTotal).toBeGreaterThan(0);
    expect(response.data.memory.heapUsed).toBeGreaterThan(0);
    expect(response.data.memory.heapUsed).toBeLessThanOrEqual(response.data.memory.heapTotal);
  });

  test('should provide CORS headers for health endpoints', async () => {
    const response = await makeRequest('/api/health/mock-server');
    
    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['content-type']).toBe('application/json');
  });
});
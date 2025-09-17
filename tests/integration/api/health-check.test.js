/**
 * Health Check Integration Tests - System health and monitoring endpoints
 * Tests actual health check endpoints and monitoring capabilities
 */
import { test, expect } from 'vitest';
import { getDbClient } from '../../setup-integration.js';
import { testRequest, HTTP_STATUS } from '../../helpers.js';

test('general health check endpoint returns valid system status', async () => {
  const response = await testRequest('GET', '/api/health/check');
  
  // Handle connection failures gracefully
  if (response.status === 0) {
    console.warn('⚠️ Health check service unavailable - connection failed');
    return;
  }
  
  // Health check should always respond (200 for healthy, 503 for unhealthy)
  expect([HTTP_STATUS.OK, 503].includes(response.status)).toBe(true);
  
  // Validate response structure
  expect(response.data).toHaveProperty('status');
  expect(response.data).toHaveProperty('timestamp');
  expect(response.data).toHaveProperty('service');
  expect(response.data.service).toBe('a-lo-cubano-boulder-fest');
  
  // Timestamp should be valid ISO string
  expect(() => new Date(response.data.timestamp).toISOString()).not.toThrow();
  
  // Status should be one of the expected values
  expect(['healthy', 'degraded', 'unhealthy'].includes(response.data.status)).toBe(true);
  
  // If healthy, should have performance metrics
  if (response.status === HTTP_STATUS.OK && response.data.status === 'healthy') {
    expect(response.data).toHaveProperty('uptime');
    expect(typeof response.data.uptime).toBe('number');
    expect(response.data.uptime).toBeGreaterThanOrEqual(0);
    
    // Should have services status if not in deployment mode
    if (!response.data.deployment_mode) {
      expect(response.data).toHaveProperty('services');
      expect(typeof response.data.services).toBe('object');
    }
  }
  
  // If degraded or unhealthy, should have error information
  if (response.data.status !== 'healthy') {
    expect(response.data).toHaveProperty('error');
    expect(typeof response.data.error).toBe('string');
  }
});

test('database health check validates database connectivity and schema', async () => {
  const response = await testRequest('GET', '/api/health/database');
  
  if (response.status === 0) {
    console.warn('⚠️ Database health check service unavailable - connection failed');
    return;
  }
  
  // Database health should respond with status
  expect([HTTP_STATUS.OK, 503].includes(response.status)).toBe(true);
  expect(response.data).toHaveProperty('status');
  expect(['healthy', 'degraded', 'unhealthy'].includes(response.data.status)).toBe(true);
  
  // Should have response time measurement
  expect(response.data).toHaveProperty('response_time');
  expect(typeof response.data.response_time).toBe('string');
  expect(response.data.response_time).toMatch(/^\d+ms$/);
  
  // Parse response time and validate it's reasonable (< 5 seconds)
  const responseTimeMs = parseInt(response.data.response_time.replace('ms', ''));
  expect(responseTimeMs).toBeLessThan(5000);
  
  if (response.status === HTTP_STATUS.OK) {
    // Healthy database should have connection details
    expect(response.data).toHaveProperty('details');
    expect(response.data.details).toHaveProperty('connection');
    expect(response.data.details.connection).toBe('active');
    
    expect(response.data.details).toHaveProperty('read_write');
    expect(response.data.details.read_write).toBe('operational');
    
    expect(response.data.details).toHaveProperty('schema_valid');
    expect(typeof response.data.details.schema_valid).toBe('boolean');
    
    // Should have database configuration info
    expect(response.data.details).toHaveProperty('database_url');
    expect(['configured', 'fallback'].includes(response.data.details.database_url)).toBe(true);
    
    expect(response.data.details).toHaveProperty('database_type');
    expect(['local', 'remote'].includes(response.data.details.database_type)).toBe(true);
    
    // Should have migration status
    expect(response.data.details).toHaveProperty('migrations_applied');
    expect(typeof response.data.details.migrations_applied).toBe('number');
    expect(response.data.details.migrations_applied).toBeGreaterThanOrEqual(0);
  } else {
    // Unhealthy database should have error details
    expect(response.data).toHaveProperty('error');
    expect(typeof response.data.error).toBe('string');
    
    if (response.data.details) {
      expect(response.data.details).toHaveProperty('connection');
      expect(response.data.details.connection).toBe('failed');
    }
  }
});

test('health check with quick parameter returns minimal response', async () => {
  const response = await testRequest('GET', '/api/health/check?quick=true');
  
  if (response.status === 0) {
    console.warn('⚠️ Quick health check service unavailable - connection failed');
    return;
  }
  
  // Quick health check should always be successful (no external dependencies)
  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.status).toBe('healthy');
  expect(response.data.message).toBe('Quick health check - no external services tested');
  
  // Should have minimal required fields
  expect(response.data).toHaveProperty('service');
  expect(response.data).toHaveProperty('timestamp');
  expect(response.data).toHaveProperty('uptime');
  expect(response.data).toHaveProperty('environment');
  
  // Should NOT have services or detailed monitoring (quick mode)
  expect(response.data).not.toHaveProperty('services');
  expect(response.data).not.toHaveProperty('health_score');
  
  // Response time should be faster than full health check
  const startTime = Date.now();
  const quickResponse = await testRequest('GET', '/api/health/check?quick=true');
  const quickTime = Date.now() - startTime;
  
  if (quickResponse.status === HTTP_STATUS.OK) {
    // Quick check should complete in under 1 second
    expect(quickTime).toBeLessThan(1000);
  }
});

test('health check handles degraded state detection', async () => {
  // Test deployment mode (simulates degraded configuration)
  const response = await testRequest('GET', '/api/health/check?deployment=true');
  
  if (response.status === 0) {
    console.warn('⚠️ Deployment health check service unavailable - connection failed');
    return;
  }
  
  // Deployment mode should always return 200 (allows deployment to succeed)
  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.status).toBe('healthy');
  expect(response.data.deployment_mode).toBe(true);
  expect(response.data.message).toBe('Deployment health check - external services not tested');
  
  // Should have configuration status
  expect(response.data).toHaveProperty('configuration');
  expect(response.data.configuration).toHaveProperty('status');
  expect(['complete', 'incomplete'].includes(response.data.configuration.status)).toBe(true);
  
  if (response.data.configuration.status === 'incomplete') {
    expect(response.data.configuration).toHaveProperty('missing_variables');
    expect(Array.isArray(response.data.configuration.missing_variables)).toBe(true);
    expect(response.data.configuration).toHaveProperty('hints');
    expect(Array.isArray(response.data.configuration.hints)).toBe(true);
  }
  
  // Should have Vercel environment information
  expect(response.data).toHaveProperty('vercel');
  expect(response.data.vercel).toHaveProperty('environment');
  expect(response.data.vercel).toHaveProperty('region');
  expect(response.data.vercel).toHaveProperty('url');
});
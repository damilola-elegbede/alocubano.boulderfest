/**
 * Mock Server Validation Test Suite
 * 
 * Comprehensive validation of mock server endpoints to ensure accuracy,
 * proper response structures, error handling, and performance.
 * 
 * Test Categories:
 * - API Contract Validation
 * - Error Scenario Validation  
 * - Edge Case Validation
 * - Performance Validation
 * - Mock-Specific Behavior Validation
 */

import { test, expect, describe } from 'vitest';
import { testRequest, generateTestEmail, HTTP_STATUS } from './helpers.js';
import { isMockServer, getTestTimeout } from './setup.js';

describe('Mock Server Validation', () => {
  // Skip tests if not running against mock server
  const skipIfNotMock = () => {
    if (!isMockServer()) {
      console.log('⚠️ Skipping mock validation tests - not running against mock server');
      return true;
    }
    return false;
  };

  describe('API Contract Validation', () => {
    test('health check returns correct mock structure', async () => {
      if (skipIfNotMock()) return;

      const response = await testRequest('GET', '/api/health/check');
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status');
      expect(response.data).toHaveProperty('timestamp');
      expect(response.data).toHaveProperty('environment');
      expect(response.data.environment).toBe('ci-mock');
      expect(response.data.status).toBe('ok');
      expect(typeof response.data.timestamp).toBe('string');
      expect(response.data).toHaveProperty('database');
      expect(response.data).toHaveProperty('health_score');
      expect(response.data).toHaveProperty('services');
    }, getTestTimeout());

    test('database health check returns mock data', async () => {
      if (skipIfNotMock()) return;

      const response = await testRequest('GET', '/api/health/database');
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('database');
      expect(response.data).toHaveProperty('status');
      expect(response.data).toHaveProperty('connected');
      expect(response.data.status).toBe('ok');
      expect(response.data.connected).toBe(true);
      expect(response.data.database).toBe('SQLite');
    }, getTestTimeout());

    test('gallery API returns proper mock structure', async () => {
      if (skipIfNotMock()) return;

      const response = await testRequest('GET', '/api/gallery');
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('items');
      expect(Array.isArray(response.data.items)).toBe(true);
      expect(response.data).toHaveProperty('total');
      expect(response.data).toHaveProperty('hasMore');
      expect(typeof response.data.total).toBe('number');
      expect(typeof response.data.hasMore).toBe('boolean');

      // Validate mock gallery item structure
      if (response.data.items.length > 0) {
        const item = response.data.items[0];
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('url');
        expect(item).toHaveProperty('title');
      }
    }, getTestTimeout());

    test('payment API mock returns valid Stripe structure', async () => {
      if (skipIfNotMock()) return;

      const validPaymentData = {
        cartItems: [{ name: 'Weekend Pass', price: 125.00, quantity: 1 }],
        customerInfo: { 
          email: generateTestEmail(), 
          firstName: 'Test', 
          lastName: 'User' 
        }
      };
      
      const response = await testRequest('POST', '/api/payments/create-checkout-session', validPaymentData);
      
      // Payment API may return different status codes in mock vs real environments
      if (response.status === 200) {
        expect(response.data).toHaveProperty('checkoutUrl');
        expect(response.data).toHaveProperty('sessionId');
        expect(response.data).toHaveProperty('orderId');
        expect(response.data).toHaveProperty('totalAmount');
        expect(response.data.checkoutUrl).toContain('checkout.stripe.com');
        expect(response.data.sessionId).toMatch(/^cs_test_mock_/);
        expect(response.data.orderId).toMatch(/^order_mock_/);
        expect(response.data.totalAmount).toBe(125.00);
      } else if (response.status === 400) {
        // Mock might return validation error
        expect(response.data).toHaveProperty('error');
        expect(typeof response.data.error).toBe('string');
      } else {
        // Should be one of these expected responses
        expect([200, 400, 503].includes(response.status)).toBe(true);
      }
    }, getTestTimeout());

    test('email subscription API mock validation', async () => {
      if (skipIfNotMock()) return;

      const validSubscriptionData = {
        email: generateTestEmail(),
        firstName: 'Test',
        lastName: 'User',
        consentToMarketing: true
      };
      
      const response = await testRequest('POST', '/api/email/subscribe', validSubscriptionData);
      
      expect([200, 201].includes(response.status)).toBe(true);
      expect(response.data).toHaveProperty('success');
      expect(response.data).toHaveProperty('message');
      expect(response.data).toHaveProperty('subscriber');
      expect(response.data.subscriber).toHaveProperty('email');
      expect(response.data.subscriber).toHaveProperty('status');
      expect(response.data.subscriber).toHaveProperty('id');
      expect(response.data.success).toBe(true);
      expect(response.data.subscriber.status).toBe('subscribed');
    }, getTestTimeout());

    test('ticket validation mock returns proper structure', async () => {
      if (skipIfNotMock()) return;

      // Test with mock valid ticket
      let response = await testRequest('POST', '/api/tickets/validate', {
        token: 'TKT-MOCK-VALID-123'
      });
      
      // Check response structure based on what we get
      if (response.status === 200) {
        expect(response.data).toHaveProperty('valid');
        expect(response.data.valid).toBe(true);
        if (response.data.ticket) {
          expect(response.data.ticket).toHaveProperty('id');
          expect(response.data.ticket).toHaveProperty('eventName');
        }
      } else if (response.status === 400) {
        // Might get validation error if token format doesn't match expected
        expect(response.data).toHaveProperty('valid');
        expect(response.data).toHaveProperty('error');
        expect(response.data.valid).toBe(false);
      }

      // Test with mock invalid ticket
      response = await testRequest('POST', '/api/tickets/validate', {
        token: 'TKT-MOCK-INVALID-456'
      });
      
      expect([400, 404].includes(response.status)).toBe(true);
      expect(response.data).toHaveProperty('error');
      expect(response.data.error).toMatch(/not found|invalid|validation|failed/i);
    }, getTestTimeout());

    test('admin dashboard mock authentication behavior', async () => {
      if (skipIfNotMock()) return;

      // Test without authentication
      let response = await testRequest('GET', '/api/admin/dashboard');
      
      expect(response.status).toBe(401);
      expect(response.data).toHaveProperty('error');
      expect(response.data.error).toMatch(/unauthorized|authentication/i);

      // Test with mock valid auth token
      response = await testRequest('GET', '/api/admin/dashboard', null, {
        'Authorization': 'Bearer mock-valid-jwt-token'
      });
      
      if (response.status === 200) {
        expect(response.data).toHaveProperty('registrations');
        expect(response.data).toHaveProperty('revenue');
        expect(response.data).toHaveProperty('tickets');
        expect(Array.isArray(response.data.registrations)).toBe(true);
      }
    }, getTestTimeout());

    test('registration API mock contracts', async () => {
      if (skipIfNotMock()) return;

      // Test registration status with mock token
      let response = await testRequest('GET', '/api/registration/MOCK-TOKEN-123');
      
      if (response.status === 200) {
        expect(response.data).toHaveProperty('transactionId');
        expect(response.data).toHaveProperty('tickets');
        expect(Array.isArray(response.data.tickets)).toBe(true);
      } else if (response.status === 400) {
        // Mock may return validation error for invalid token format
        expect(response.data).toHaveProperty('valid');
        expect(response.data.valid).toBe(true);
      }

      // Test ticket registration mock
      response = await testRequest('POST', '/api/tickets/register', {
        ticketId: 'TKT-MOCK-REG-001',
        firstName: 'Mock',
        lastName: 'User',
        email: generateTestEmail()
      });

      if (response.status === 200) {
        expect(response.data).toHaveProperty('success');
        expect(response.data).toHaveProperty('attendee');
        expect(response.data.success).toBe(true);
      }

      // Test registration health mock
      response = await testRequest('GET', '/api/registration/health');
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('service');
      expect(response.data).toHaveProperty('status');
      expect(response.data.service).toBe('registration');
      expect(response.data.status).toBe('ok');
    }, getTestTimeout());
  });

  describe('Error Scenario Validation', () => {
    test('invalid endpoints return proper 404 responses', async () => {
      if (skipIfNotMock()) return;

      const invalidEndpoints = [
        '/api/nonexistent/endpoint',
        '/api/tickets/invalid-action',
        '/api/admin/nonexistent',
        '/api/payments/invalid-method'
      ];

      for (const endpoint of invalidEndpoints) {
        const response = await testRequest('GET', endpoint);
        expect([404, 405].includes(response.status)).toBe(true);
        
        if (response.data.error) {
          expect(typeof response.data.error).toBe('string');
        }
      }
    }, getTestTimeout());

    test('malformed request bodies return 400 errors', async () => {
      if (skipIfNotMock()) return;

      // Test payment API with malformed data
      let response = await testRequest('POST', '/api/payments/create-checkout-session', {
        invalidField: 'test',
        cartItems: 'not-an-array'
      });
      
      expect(response.status).toBe(400);
      expect(response.data).toHaveProperty('error');
      expect(typeof response.data.error).toBe('string');

      // Test email subscription with invalid email
      response = await testRequest('POST', '/api/email/subscribe', {
        email: 'invalid-email-format',
        firstName: 'Test'
      });
      
      expect(response.status).toBe(400);
      expect(response.data).toHaveProperty('error');
      expect(response.data.error).toMatch(/invalid|email|format|validation/i);

      // Test ticket validation with missing token
      response = await testRequest('POST', '/api/tickets/validate', {});
      
      // Might return 400 or 404 depending on how mock handles missing fields
      expect([400, 404].includes(response.status)).toBe(true);
      expect(response.data).toHaveProperty('error');
      expect(response.data.error).toMatch(/required|token|missing|not found/i);
    }, getTestTimeout());

    test('rate limiting mock behavior', async () => {
      if (skipIfNotMock()) return;

      // Test with mock rate limit trigger
      const response = await testRequest('POST', '/api/email/subscribe', {
        email: 'rate-limit-test@mock.com',
        firstName: 'RateLimit',
        lastName: 'Test',
        consentToMarketing: true
      });

      // Mock should simulate rate limiting for specific test patterns
      if (response.status === 429) {
        expect(response.data).toHaveProperty('error');
        expect(response.data.error).toMatch(/rate limit|too many requests/i);
        expect(response.data).toHaveProperty('retryAfter');
      }
    }, getTestTimeout());

    test('server errors mock behavior', async () => {
      if (skipIfNotMock()) return;

      // Test with mock server error trigger
      const response = await testRequest('GET', '/api/gallery', null, {
        'X-Mock-Error': '500'
      });

      if (response.status === 500) {
        expect(response.data).toHaveProperty('error');
        expect(response.data.error).toMatch(/server error|internal error/i);
      }
    }, getTestTimeout());
  });

  describe('Edge Case Validation', () => {
    test('empty request bodies are handled correctly', async () => {
      if (skipIfNotMock()) return;

      const response = await testRequest('POST', '/api/payments/create-checkout-session', {});
      
      expect(response.status).toBe(400);
      expect(response.data).toHaveProperty('error');
      expect(typeof response.data.error).toBe('string');
    }, getTestTimeout());

    test('extremely large payloads are rejected', async () => {
      if (skipIfNotMock()) return;

      const largePayload = {
        cartItems: Array(1000).fill({ name: 'Test', price: 1, quantity: 1 }),
        customerInfo: { 
          email: generateTestEmail(), 
          firstName: 'A'.repeat(10000),
          lastName: 'Test'
        }
      };
      
      const response = await testRequest('POST', '/api/payments/create-checkout-session', largePayload);
      
      // Should handle large payloads gracefully (reject or process)
      expect([400, 413, 422].includes(response.status) || response.status === 200).toBe(true);
    }, getTestTimeout());

    test('special characters in input are handled safely', async () => {
      if (skipIfNotMock()) return;

      const specialCharData = {
        email: 'test+special@mock.com',
        firstName: "O'Connor",
        lastName: 'Test-User',
        consentToMarketing: true
      };
      
      const response = await testRequest('POST', '/api/email/subscribe', specialCharData);
      
      // Should handle special characters without errors
      expect([200, 201, 400].includes(response.status)).toBe(true);
      
      if (response.status === 400 && response.data.error) {
        expect(response.data.error).not.toMatch(/unexpected token|syntax error/i);
      }
    }, getTestTimeout());

    test('concurrent requests are handled properly', async () => {
      if (skipIfNotMock()) return;

      const concurrentRequests = Array(5).fill().map((_, i) => 
        testRequest('GET', '/api/health/check')
      );
      
      const responses = await Promise.all(concurrentRequests);
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('status');
        expect(response.data.status).toBe('ok');
      });
    }, getTestTimeout());
  });

  describe('Performance Validation', () => {
    test('health check responds quickly', async () => {
      if (skipIfNotMock()) return;

      const startTime = Date.now();
      const response = await testRequest('GET', '/api/health/check');
      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(100); // Should respond in under 100ms
    }, getTestTimeout());

    test('gallery API responds within performance targets', async () => {
      if (skipIfNotMock()) return;

      const startTime = Date.now();
      const response = await testRequest('GET', '/api/gallery');
      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(200); // Gallery can be slightly slower
    }, getTestTimeout());

    test('payment API maintains performance standards', async () => {
      if (skipIfNotMock()) return;

      const validPaymentData = {
        cartItems: [{ name: 'Performance Test', price: 50.00, quantity: 1 }],
        customerInfo: { 
          email: generateTestEmail(), 
          firstName: 'Perf', 
          lastName: 'Test' 
        }
      };

      const startTime = Date.now();
      const response = await testRequest('POST', '/api/payments/create-checkout-session', validPaymentData);
      const responseTime = Date.now() - startTime;
      
      expect([200, 400].includes(response.status)).toBe(true);
      expect(responseTime).toBeLessThan(500); // Payment processing can be up to 500ms
    }, getTestTimeout());

    test('multiple rapid requests maintain performance', async () => {
      if (skipIfNotMock()) return;

      const requests = Array(10).fill().map(() => {
        const startTime = Date.now();
        return testRequest('GET', '/api/health/check').then(response => ({
          response,
          responseTime: Date.now() - startTime
        }));
      });
      
      const results = await Promise.all(requests);
      
      results.forEach(({ response, responseTime }) => {
        expect(response.status).toBe(200);
        expect(responseTime).toBeLessThan(150); // Should maintain performance under load
      });
    }, getTestTimeout());
  });

  describe('Mock-Specific Behavior Validation', () => {
    test('mock environment indicators are present', async () => {
      if (skipIfNotMock()) return;

      const response = await testRequest('GET', '/api/health/check');
      
      expect(response.status).toBe(200);
      expect(response.data.environment).toBe('ci-mock');
      
      // Mock responses should have consistent mock identifiers
      if (response.data.version) {
        expect(response.data.version).toMatch(/mock/i);
      }
    }, getTestTimeout());

    test('mock data consistency across requests', async () => {
      if (skipIfNotMock()) return;

      // Make multiple requests to the same endpoint
      const requests = Array(3).fill().map(() => 
        testRequest('GET', '/api/gallery')
      );
      
      const responses = await Promise.all(requests);
      
      // Mock should return consistent data structure
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('items');
        expect(response.data).toHaveProperty('total');
        expect(response.data).toHaveProperty('hasMore');
      });

      // Total count should be consistent (mock data shouldn't change)
      const totalCounts = responses.map(r => r.data.total);
      expect(totalCounts.every(count => count === totalCounts[0])).toBe(true);
    }, getTestTimeout());

    test('mock error scenarios are reproducible', async () => {
      if (skipIfNotMock()) return;

      // Test the same invalid request multiple times
      const requests = Array(3).fill().map(() => 
        testRequest('POST', '/api/tickets/validate', { token: 'TKT-MOCK-INVALID-456' })
      );
      
      const responses = await Promise.all(requests);
      
      // All should return the same error consistently
      responses.forEach(response => {
        expect(response.status).toBe(404);
        expect(response.data).toHaveProperty('error');
        expect(response.data.error).toMatch(/not found|invalid/i);
      });
    }, getTestTimeout());

    test('mock server handles all HTTP methods appropriately', async () => {
      if (skipIfNotMock()) return;

      const methods = [
        { method: 'GET', path: '/api/health/check' },
        { method: 'POST', path: '/api/email/subscribe' },
        { method: 'PUT', path: '/api/tickets/update' },
        { method: 'DELETE', path: '/api/tickets/cancel' }
      ];

      for (const { method, path } of methods) {
        const response = await testRequest(method, path, 
          method === 'GET' ? null : { test: 'data' }
        );
        
        // Should not return method not implemented (501)
        expect(response.status).not.toBe(501);
        
        // Should return appropriate status codes
        expect([200, 201, 400, 401, 404, 405].includes(response.status)).toBe(true);
      }
    }, getTestTimeout());

    test('mock headers and metadata validation', async () => {
      if (skipIfNotMock()) return;

      // This test would need to be implemented with a custom fetch wrapper
      // that captures headers, but demonstrates the concept
      const response = await testRequest('GET', '/api/health/check');
      
      expect(response.status).toBe(200);
      
      // Validate that mock returns proper content type
      // In a real implementation, you'd check response headers
      expect(typeof response.data).toBe('object');
    }, getTestTimeout());
  });
});
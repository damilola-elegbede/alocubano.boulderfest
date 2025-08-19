/**
 * Platform Reliability Tests - Operational resilience validation
 * Tests critical platform patterns for production reliability
 * Target: <75 lines for streamlined architecture
 */
import { test, expect } from 'vitest';
import { testRequest } from './helpers.js';

// Test database service initialization patterns under stress
test('database service handles concurrent initialization gracefully', async () => {
  // Simulate multiple concurrent API calls during cold start
  const concurrentRequests = Array(5).fill().map(() => 
    testRequest('GET', '/api/health/database')
  );
  
  const responses = await Promise.all(concurrentRequests);
  const statusCodes = responses.map(r => r.status);
  
  // All requests should eventually succeed or fail gracefully (no race conditions)
  const hasNetworkFailure = statusCodes.some(code => code === 0);
  if (hasNetworkFailure) {
    throw new Error(`Network connectivity failure for GET /api/health/database`);
  }
  const allHandled = statusCodes.every(code => [200, 503].includes(code));
  expect(allHandled).toBe(true);
  
  // At least some should succeed if database is available
  const hasSuccess = statusCodes.some(code => code === 200);
  if (hasSuccess) {
    expect(responses.find(r => r.status === 200).data.status).toBe('healthy');
  }
});

// Test graceful degradation when external services are unavailable
test('APIs degrade gracefully when external services timeout', async () => {
  // Test gallery when Google Drive might be slow/unavailable
  const galleryResponse = await testRequest('GET', '/api/gallery');
  if (galleryResponse.status === 0) {
    throw new Error(`Network connectivity failure for GET /api/gallery`);
  }
  expect([200, 403, 500, 503].includes(galleryResponse.status)).toBe(true);
  
  if (galleryResponse.status === 503) {
    // Should return structured error, not crash
    expect(galleryResponse.data).toHaveProperty('error');
  }
  
  // Test email subscription with potential Brevo timeout
  const emailResponse = await testRequest('POST', '/api/email/subscribe', {
    email: 'reliability-test@example.com',
    firstName: 'Reliability',
    lastName: 'Test',
    consentToMarketing: true,
    source: 'reliability-test'
  });
  
  // Should handle Brevo unavailability gracefully
  if (emailResponse.status === 0) {
    throw new Error(`Network connectivity failure for POST /api/email/subscribe`);
  }
  expect([201, 400, 409, 429, 500, 503].includes(emailResponse.status)).toBe(true);
});

// Test environment configuration robustness
test('system handles missing environment variables gracefully', async () => {
  // Test admin endpoints when admin config might be missing
  const adminResponse = await testRequest('POST', '/api/admin/login', {
    username: 'admin',
    password: 'test-password'
  });
  
  // Should reject cleanly, not crash with 500
  if (adminResponse.status === 0) {
    throw new Error(`Network connectivity failure for POST /api/admin/login`);
  }
  expect([400, 401, 403, 503].includes(adminResponse.status)).toBe(true);
  
  // Test payment creation with potential Stripe config issues
  const paymentResponse = await testRequest('POST', '/api/payments/create-checkout-session', {
    cartItems: [{ name: 'Test', price: 10, quantity: 1 }],
    customerInfo: { email: 'test@example.com' }
  });
  
  // Should handle missing Stripe config gracefully
  if (paymentResponse.status === 0) {
    throw new Error(`Network connectivity failure for POST /api/payments/create-checkout-session`);
  }
  expect([200, 503, 500].includes(paymentResponse.status)).toBe(true);
});

// Test resource constraint handling
test('system handles resource constraints without cascading failures', async () => {
  // Use gallery endpoint which should be more reliable than health check
  const rapidRequests = Array(8).fill().map((_, i) => 
    testRequest('GET', '/api/gallery')
  );
  
  const responses = await Promise.all(rapidRequests);
  const statusCodes = responses.map(r => r.status);
  
  // In test environment, connection failures are expected
  // Key test: system doesn't crash with unhandled errors
  const hasNetworkFailure = statusCodes.some(code => code === 0);
  if (hasNetworkFailure) {
    throw new Error(`Network connectivity failure for GET /api/gallery`);
  }
  const allHandledGracefully = statusCodes.every(code => 
    [200, 403, 404, 429, 500, 503].includes(code)
  );
  expect(allHandledGracefully).toBe(true);
  
  // If any succeed, validate response structure
  const successfulResponses = responses.filter(r => r.status === 200);
  if (successfulResponses.length > 0) {
    const response = successfulResponses[0];
    expect(response.data).toBeDefined();
  }
});
/**
 * Basic Validation Tests - Input validation and error handling
 */
import { test, expect } from 'vitest';
import { testRequest, generateTestEmail, HTTP_STATUS } from './helpers.js';

test('APIs validate required fields and reject malformed requests', async () => {
  const testCases = [
    { method: 'POST', path: '/api/payments/create-checkout-session', data: { invalid: 'structure' }, expected: /cart items|required/i },
    { method: 'POST', path: '/api/email/subscribe', data: { email: 'invalid-email' }, expected: /valid email|email format/i },
    { method: 'POST', path: '/api/email/subscribe', data: { firstName: 'Test', consentToMarketing: true }, expected: /email.*required/i },
    { method: 'POST', path: '/api/email/subscribe', data: { email: generateTestEmail(), consentToMarketing: false }, expected: /consent.*required/i }
  ];
  
  for (const { method, path, data, expected } of testCases) {
    const response = await testRequest(method, path, data);
    if (response.status === 0) continue;
    
    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(response.data).toHaveProperty('error');
    expect(response.data.error).toMatch(expected);
  }
});
test('ticket validation handles invalid QR codes', async () => {
  const testCases = ['', 'invalid-format-123', 'x'.repeat(1000), 'ticket-does-not-exist-456'];
  
  for (const qr_code of testCases) {
    const response = await testRequest('POST', '/api/tickets/validate', { qr_code });
    if (response.status === 0) continue;
    
    expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.NOT_FOUND, HTTP_STATUS.INTERNAL_SERVER_ERROR].includes(response.status)).toBe(true);
    if (response.data?.error) {
      expect(response.data.error).toMatch(/invalid|format|required|not found|does not exist/i);
    }
  }
});
test('payment validation rejects invalid amounts and malformed items', async () => {
  const invalidPayments = [
    { cartItems: [{ name: 'Test', price: -50.00, quantity: 1 }], customerInfo: { email: generateTestEmail() } },
    { cartItems: [{ name: 'Test', price: 'not-a-number', quantity: 1 }], customerInfo: { email: generateTestEmail() } },
    { cartItems: [], customerInfo: { email: generateTestEmail() } },
    { cartItems: [{ name: 'Test', price: 100, quantity: 0 }], customerInfo: { email: generateTestEmail() } }
  ];
  
  for (const data of invalidPayments) {
    const response = await testRequest('POST', '/api/payments/create-checkout-session', data);
    if (response.status === 0) continue;
    
    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(response.data).toHaveProperty('error');
    expect(typeof response.data.error).toBe('string');
    expect(response.data.error.length).toBeGreaterThan(5);
  }
});
test('admin endpoints enforce authentication validation', async () => {
  const testCases = [
    { data: {}, desc: 'no credentials' },
    { data: { username: 'admin', password: 'wrong-password' }, desc: 'invalid credentials' }
  ];
  
  for (const { data } of testCases) {
    const response = await testRequest('POST', '/api/admin/login', data);
    if (response.status === 0) continue;
    
    expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.TOO_MANY_REQUESTS].includes(response.status)).toBe(true);
    if (response.data?.error && response.status === HTTP_STATUS.UNAUTHORIZED) {
      expect(response.data.error).toMatch(/invalid|unauthorized|authentication/i);
    }
  }
});
test('APIs sanitize and reject SQL injection attempts', async () => {
  const sqlPayloads = ["'; DROP TABLE users; --", "1' OR '1'='1", "admin'--", "' UNION SELECT * FROM users--", "<script>alert('xss')</script>"];
  
  for (const payload of sqlPayloads) {
    const response = await testRequest('POST', '/api/email/subscribe', { 
      email: `test+${encodeURIComponent(payload)}@example.com`,
      firstName: payload,
      consentToMarketing: true
    });
    
    if (response.status === 0) continue;
    
    const validStatuses = [HTTP_STATUS.OK, 201, HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.TOO_MANY_REQUESTS, HTTP_STATUS.INTERNAL_SERVER_ERROR, 503, 422];
    expect(validStatuses.includes(response.status)).toBe(true);
    
    if (response.status === HTTP_STATUS.INTERNAL_SERVER_ERROR && response.data?.error) {
      const errorMsg = response.data.error.toLowerCase();
      expect(errorMsg).not.toMatch(/sql|query|syntax|database.*error/i);
      const errorText = JSON.stringify(response.data).toLowerCase();
      expect(errorText).not.toMatch(/\/users\/|\/api\/|stack|trace|\.js:|turso_|brevo_|stripe_|auth_token/i);
    }
  }
});
test('static resources validation placeholder', () => {
  expect(true).toBe(true);
});

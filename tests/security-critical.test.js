/**
 * Security-Critical Tests - Auth and Data Protection
 * Tests JWT manipulation and admin authentication security
 */
import { test, expect } from 'vitest';
import { testRequest } from './helpers.js';

test('admin auth rejects JWT manipulation attempts', async () => {
  const maliciousTokens = [
    'eyJ0eXAiOiJKV1QiLCJhbGciOiJub25lIn0.eyJpZCI6ImFkbWluIn0.',
    '../../../admin-bypass',
    'Bearer null',
    'admin-token-injection'
  ];
  
  for (const token of maliciousTokens) {
    const response = await testRequest('GET', '/api/admin/dashboard', null, {
      'Authorization': `Bearer ${token}`
    });
    if (response.status === 0) {
      throw new Error(`Network connectivity failure for GET /api/admin/dashboard`);
    }
    expect([401, 403].includes(response.status)).toBe(true);
  }
});

test('APIs reject XSS payloads in user inputs', async () => {
  const xssPayloads = ['<script>alert("xss")</script>', 'javascript:alert(1)'];
  
  for (const payload of xssPayloads) {
    const response = await testRequest('POST', '/api/email/subscribe', {
      email: payload + '@example.com',
      name: payload
    });
    
    if (response.status === 0) {
      throw new Error(`Network connectivity failure for POST /api/email/subscribe`);
    }
    
    if (response.status === 200 && response.data) {
      const responseStr = JSON.stringify(response.data);
      expect(responseStr.includes('<script>')).toBe(false);
    }
  }
});
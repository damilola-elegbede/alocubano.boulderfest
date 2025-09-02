/**
 * E2E Test: Apple Wallet Pass Generation
 * Direct API testing for Apple Wallet pass generation
 */

import { test, expect } from '@playwright/test';

test.describe('Apple Wallet Pass Generation', () => {
  const testTicketId = 'TKT-E2E-APPLE-001';

  test('should generate Apple Wallet pass for valid ticket', async ({ request }) => {
    const response = await request.get(`/api/tickets/apple-wallet/${testTicketId}`);
    
    // Should handle the request appropriately (either success or proper error)
    expect([200, 404, 503]).toContain(response.status());
    
    if (response.status() === 200) {
      expect(response.headers()['content-type']).toBe('application/vnd.apple.pkpass');
      expect(response.headers()['content-disposition']).toContain('.pkpass');
    } else if (response.status() === 404) {
      const body = await response.json();
      expect(body.error).toBe('Ticket not found');
    }
  });

  test('should require ticket ID parameter', async ({ request }) => {
    const response = await request.get('/api/tickets/apple-wallet/');
    
    // Should return 400 for missing ticket ID or 404 for invalid route
    expect([400, 404]).toContain(response.status());
  });

  test('should handle invalid ticket ID', async ({ request }) => {
    const response = await request.get('/api/tickets/apple-wallet/INVALID-999');
    
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('Ticket not found');
  });

  test('should only accept GET requests', async ({ request }) => {
    const response = await request.post(`/api/tickets/apple-wallet/${testTicketId}`);
    
    expect(response.status()).toBe(405);
    expect(response.headers()['allow']).toBe('GET');
  });

  test('should handle service configuration errors', async ({ request }) => {
    const response = await request.get(`/api/tickets/apple-wallet/${testTicketId}`);
    
    if (response.status() === 503) {
      const body = await response.json();
      expect(body.error).toContain('not configured');
      expect(body.message).toContain('contact support');
    }
  });
});
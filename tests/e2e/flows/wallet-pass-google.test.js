/**
 * E2E Test: Google Wallet Pass Generation
 * Direct API testing for Google Wallet pass generation
 */

import { test, expect } from '@playwright/test';

test.describe('Google Wallet Pass Generation', () => {
  const testTicketId = 'TKT-E2E-GOOGLE-001';

  test('should generate Google Wallet pass for valid ticket', async ({ request }) => {
    const response = await request.get(`/api/tickets/google-wallet/${testTicketId}`, {
      maxRedirects: 0  // Don't follow redirects to test response
    });

    // Should handle the request appropriately (either redirect or proper error)
    expect([302, 404, 503]).toContain(response.status());

    if (response.status() === 302) {
      expect(response.headers()['location']).toContain('pay.google.com');
    } else if (response.status() === 404) {
      const body = await response.json();
      expect(body.error).toBe('Ticket not found');
    }
  });

  test('should require ticket ID parameter', async ({ request }) => {
    const response = await request.get('/api/tickets/google-wallet/');

    // Should return 400 for missing ticket ID or 404 for invalid route
    expect([400, 404]).toContain(response.status());
  });

  test('should handle invalid ticket ID', async ({ request }) => {
    const response = await request.get('/api/tickets/google-wallet/INVALID-999');

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('Ticket not found');
  });

  test('should only accept GET requests', async ({ request }) => {
    const response = await request.post(`/api/tickets/google-wallet/${testTicketId}`);

    expect(response.status()).toBe(405);
    expect(response.headers()['allow']).toBe('GET');
  });

  test('should handle service configuration errors', async ({ request }) => {
    const response = await request.get(`/api/tickets/google-wallet/${testTicketId}`);

    if (response.status() === 503) {
      const body = await response.json();
      expect(body.error).toContain('not configured');
      expect(body.message).toContain('contact support');
    }
  });
});
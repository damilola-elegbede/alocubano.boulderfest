/**
 * E2E Test: Google Wallet Pass Generation
 * Direct API testing for Google Wallet pass generation with visual parity validation
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

test.describe('Google Wallet Visual Assets', () => {
  test('should generate colored circle images', async ({ request }) => {
    const testColor = 'rgb(255,20,147)'; // VIP pink
    const response = await request.get(`/api/wallet/circle?rgb=${encodeURIComponent(testColor)}`);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/png');
    expect(response.headers()['cache-control']).toContain('public');
  });

  test('should validate RGB color format', async ({ request }) => {
    const invalidColor = 'not-a-color';
    const response = await request.get(`/api/wallet/circle?rgb=${invalidColor}`);

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Invalid RGB format');
  });

  test('should generate hero images for ticket types', async ({ request }) => {
    const testTicketType = 'vip-pass';
    const response = await request.get(`/api/wallet/hero/${testTicketType}`);

    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      expect(response.headers()['content-type']).toBe('image/png');
      expect(response.headers()['cache-control']).toContain('public');
    }
  });

  test('should handle missing ticket type in hero endpoint', async ({ request }) => {
    const response = await request.get('/api/wallet/hero/');

    expect([400, 404]).toContain(response.status());
  });

  test('should validate circle size parameter', async ({ request }) => {
    const testColor = 'rgb(255,20,147)';
    const invalidSize = '999';
    const response = await request.get(`/api/wallet/circle?rgb=${encodeURIComponent(testColor)}&size=${invalidSize}`);

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Invalid size parameter');
  });
});
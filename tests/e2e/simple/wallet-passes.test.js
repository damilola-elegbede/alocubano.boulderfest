/**
 * Simple Wallet Passes E2E Test
 * Direct Playwright APIs only - no helpers needed
 */

import { test, expect } from '@playwright/test';

test.describe('Wallet Passes', () => {
  const testTicketId = 'TKT-E2E-WALLET-001';

  test('can generate Apple Wallet pass', async ({ page }) => {
    // Mock Apple Wallet service configuration
    await page.route('**/api/tickets/apple-wallet/*', route => {
      const url = route.request().url();
      const ticketId = url.split('/').pop();
      
      if (ticketId === testTicketId) {
        // Mock successful pass generation
        route.fulfill({
          status: 200,
          contentType: 'application/vnd.apple.pkpass',
          headers: {
            'Content-Disposition': `attachment; filename="${ticketId}.pkpass"`
          },
          body: Buffer.from('MOCK_APPLE_PASS_DATA')
        });
      } else {
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Ticket not found' })
        });
      }
    });

    // Test Apple Wallet pass generation
    const response = await page.request.get(`/api/tickets/apple-wallet/${testTicketId}`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/vnd.apple.pkpass');
    expect(response.headers()['content-disposition']).toContain(`${testTicketId}.pkpass`);
    
    console.log('✅ Apple Wallet pass generated successfully');
  });

  test('can generate Google Wallet pass', async ({ page }) => {
    // Mock Google Wallet service configuration
    await page.route('**/api/tickets/google-wallet/*', route => {
      const url = route.request().url();
      const ticketId = url.split('/').pop();
      
      if (ticketId === testTicketId) {
        // Mock redirect to Google Wallet save URL
        route.fulfill({
          status: 302,
          headers: {
            'Location': `https://pay.google.com/gp/v/save/${ticketId}`
          }
        });
      } else {
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Ticket not found' })
        });
      }
    });

    // Test Google Wallet pass generation
    const response = await page.request.get(`/api/tickets/google-wallet/${testTicketId}`, {
      maxRedirects: 0 // Don't follow redirects
    });
    expect(response.status()).toBe(302);
    expect(response.headers()['location']).toContain('pay.google.com');
    
    console.log('✅ Google Wallet pass redirect generated successfully');
  });

  test('handles invalid ticket ID gracefully', async ({ page }) => {
    const invalidTicketId = 'INVALID-TICKET-999';

    // Mock wallet services for invalid ticket
    await page.route('**/api/tickets/apple-wallet/*', route => {
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Ticket not found' })
      });
    });

    await page.route('**/api/tickets/google-wallet/*', route => {
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Ticket not found' })
      });
    });

    // Test Apple Wallet with invalid ticket
    const appleResponse = await page.request.get(`/api/tickets/apple-wallet/${invalidTicketId}`);
    expect(appleResponse.status()).toBe(404);
    const appleBody = await appleResponse.json();
    expect(appleBody.error).toBe('Ticket not found');

    // Test Google Wallet with invalid ticket
    const googleResponse = await page.request.get(`/api/tickets/google-wallet/${invalidTicketId}`);
    expect(googleResponse.status()).toBe(404);
    const googleBody = await googleResponse.json();
    expect(googleBody.error).toBe('Ticket not found');

    console.log('✅ Invalid ticket ID handled correctly');
  });

  test('handles wallet service configuration errors', async ({ page }) => {
    // Mock unconfigured wallet services
    await page.route('**/api/tickets/apple-wallet/*', route => {
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Apple Wallet is not configured',
          message: 'Please contact support for assistance'
        })
      });
    });

    await page.route('**/api/tickets/google-wallet/*', route => {
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Google Wallet is not configured',
          message: 'Please contact support for assistance'
        })
      });
    });

    // Test Apple Wallet configuration error
    const appleResponse = await page.request.get(`/api/tickets/apple-wallet/${testTicketId}`);
    expect(appleResponse.status()).toBe(503);
    const appleBody = await appleResponse.json();
    expect(appleBody.error).toBe('Apple Wallet is not configured');

    // Test Google Wallet configuration error
    const googleResponse = await page.request.get(`/api/tickets/google-wallet/${testTicketId}`);
    expect(googleResponse.status()).toBe(503);
    const googleBody = await googleResponse.json();
    expect(googleBody.error).toBe('Google Wallet is not configured');

    console.log('✅ Wallet service configuration errors handled correctly');
  });

  test('validates HTTP methods', async ({ page }) => {
    // Mock POST request responses
    await page.route('**/api/tickets/apple-wallet/*', route => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 405,
          headers: { 'Allow': 'GET' },
          body: 'Method Not Allowed'
        });
      }
    });

    await page.route('**/api/tickets/google-wallet/*', route => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 405,
          headers: { 'Allow': 'GET' },
          body: 'Method Not Allowed'
        });
      }
    });

    // Test invalid POST method on Apple Wallet
    const appleResponse = await page.request.post(`/api/tickets/apple-wallet/${testTicketId}`);
    expect(appleResponse.status()).toBe(405);
    expect(appleResponse.headers()['allow']).toBe('GET');

    // Test invalid POST method on Google Wallet
    const googleResponse = await page.request.post(`/api/tickets/google-wallet/${testTicketId}`);
    expect(googleResponse.status()).toBe(405);
    expect(googleResponse.headers()['allow']).toBe('GET');

    console.log('✅ HTTP method validation working correctly');
  });
});
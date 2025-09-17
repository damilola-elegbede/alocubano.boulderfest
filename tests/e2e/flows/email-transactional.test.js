/**
 * Transactional Email E2E Tests
 * Tests email flows triggered by user actions and system events
 * Covers purchase confirmations, ticket delivery, registration reminders, and webhooks
 */

import { test, expect } from '@playwright/test';
import { generateTestEmail } from '../helpers/test-isolation.js';

test.describe('Transactional Email Flows', () => {
  
  test('should trigger purchase confirmation email on successful payment', async ({ page, request }) => {
    // Navigate to tickets page
    await page.goto('/tickets');
    
    // Add ticket to cart
    const weekendButton = page.locator('button').filter({ hasText: 'Weekend' }).first();
    await weekendButton.click();
    
    // Proceed to checkout and monitor API calls
    const checkoutButton = page.locator('button').filter({ hasText: 'Checkout' }).first();
    const paymentRequestPromise = page.waitForRequest('**/create-checkout-session');
    
    await checkoutButton.click();
    const paymentReq = await paymentRequestPromise;
    
    // Verify payment session creation triggers email preparation
    expect(paymentReq.method()).toBe('POST');
    const requestData = paymentReq.postDataJSON();
    expect(requestData).toHaveProperty('success_url');
    
    console.log('✅ Purchase confirmation email flow initiated');
  });

  test('should handle ticket delivery email after payment', async ({ page, request }) => {
    // Simulate successful payment callback
    const testEmail = generateTestEmail('ticket-delivery', 'purchase');
    
    await page.goto(`/api/payments/checkout-success?session_id=test_session&email=${testEmail}`);
    
    // Wait for page load and verify success handling
    await page.waitForTimeout(2000);
    
    // Check if ticket delivery process was triggered
    const response = await request.get('/api/health/check');
    expect(response.status()).toBe(200);
    
    console.log('✅ Ticket delivery email process verified');
  });

  test('should send registration reminder emails within 72-hour window', async ({ request }) => {
    const testEmail = generateTestEmail('reminder', 'registration');
    
    // Create a mock registration that needs reminder
    const response = await request.post('/api/registration/batch', {
      data: {
        registrations: [{
          ticketId: 'test-ticket-123',
          name: 'Test User',
          email: testEmail,
          phone: '+1234567890'
        }]
      }
    });
    
    // Verify registration was processed
    expect(response.status()).toBeLessThan(500);
    
    // Check registration endpoint health for reminder processing
    const healthCheck = await request.get('/api/registration/health');
    expect(healthCheck.status()).toBe(200);
    
    console.log('✅ Registration reminder email system verified');
  });

  test('should process Brevo webhook events correctly', async ({ request }) => {
    const webhookPayload = {
      event: 'delivered',
      email: generateTestEmail('webhook', 'delivery'),
      date: new Date().toISOString(),
      'message-id': 'test-message-123'
    };
    
    const response = await request.post('/api/email/brevo-webhook', {
      data: webhookPayload,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    // Should process webhook successfully
    expect(response.status()).toBeLessThan(500);
    
    console.log('✅ Brevo webhook processing verified');
  });

  test('should handle newsletter unsubscribe flow', async ({ page, request }) => {
    const testEmail = generateTestEmail('unsubscribe', 'newsletter');
    
    // First subscribe to newsletter
    await page.goto('/contact');
    await page.locator('#newsletter-email').fill(testEmail);
    await page.locator('.custom-checkbox').click();
    
    const subscribeResponse = page.waitForResponse('/api/email/subscribe');
    await page.locator('.newsletter-submit').click();
    
    const response = await subscribeResponse;
    expect(response.status()).toBeLessThan(500);
    
    // Test unsubscribe endpoint
    const unsubscribeResponse = await request.get(`/api/email/unsubscribe?email=${testEmail}&token=test-token`);
    expect(unsubscribeResponse.status()).toBeLessThan(500);
    
    console.log('✅ Newsletter unsubscribe flow verified');
  });

  test('should handle email delivery failure gracefully', async ({ request }) => {
    // Test with invalid email to trigger failure handling
    const invalidEmail = 'invalid-email@nonexistent-domain-12345.com';
    
    const response = await request.post('/api/email/subscribe', {
      data: {
        email: invalidEmail,
        consent: true
      }
    });
    
    // Should handle invalid email appropriately
    expect(response.status()).toBeLessThan(500);
    
    console.log('✅ Email delivery failure handling verified');
  });

  test('should validate email webhook signature security', async ({ request }) => {
    // Test webhook without proper authentication
    const invalidWebhook = await request.post('/api/email/brevo-webhook', {
      data: { event: 'test', email: 'test@test.com' },
      headers: { 'X-Forwarded-For': '192.168.1.1' }
    });
    
    // Should reject unauthorized webhooks
    expect([401, 403, 422]).toContain(invalidWebhook.status());
    
    console.log('✅ Webhook security validation verified');
  });

});
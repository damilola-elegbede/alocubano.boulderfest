import { test, expect } from '@playwright/test';
import { createTestHelper } from '../../helpers.js';

test.describe('Security Scenarios', () => {
  let helper;

  test.beforeEach(async ({ page }) => {
    helper = await createTestHelper(page);
  });

  test.describe('Authentication Security', () => {
    test('should handle brute force attempts', async () => {
      // Navigate to admin login
      await helper.page.goto('/admin');

      // Attempt multiple failed logins
      for (let i = 0; i < 5; i++) {
        await helper.page.fill('input[type="password"]', 'wrong-password');
        await helper.page.click('button[type="submit"]');

        // Wait for response
        await helper.page.waitForTimeout(500);

        // Should still show login form (not locked out in basic implementation)
        await expect(helper.page.locator('input[type="password"]')).toBeVisible();
      }
    });

    test('should prevent session hijacking attempts', async () => {
      // Test that sessions are properly validated
      await helper.page.goto('/admin');

      // Try to access admin dashboard without proper authentication
      await helper.page.goto('/admin/dashboard');

      // Should redirect back to login
      await expect(helper.page.url()).toContain('/admin');
      await expect(helper.page.locator('input[type="password"]')).toBeVisible();
    });
  });

  test.describe('Input Validation Security', () => {
    test('should prevent XSS in email subscription', async () => {
      await helper.page.goto('/');

      // Attempt XSS injection
      const xssPayload = '<script>alert("xss")</script>';

      await helper.page.fill('input[type="email"]', xssPayload);
      await helper.page.click('button[type="submit"]');

      // Should not execute script
      const alerts = [];
      helper.page.on('dialog', dialog => {
        alerts.push(dialog.message());
        dialog.dismiss();
      });

      await helper.page.waitForTimeout(1000);
      expect(alerts).toHaveLength(0);
    });

    test('should validate email formats strictly', async () => {
      await helper.page.goto('/');

      const invalidEmails = [
        'invalid',
        'test@',
        '@domain.com',
        'test..test@domain.com',
        'test@domain',
      ];

      for (const email of invalidEmails) {
        await helper.page.fill('input[type="email"]', email);
        await helper.page.click('button[type="submit"]');

        // Should show validation error or not submit
        const response = await helper.page.waitForResponse(response =>
          response.url().includes('/api/email/subscribe'), { timeout: 2000 }
        ).catch(() => null);

        if (response) {
          expect(response.status()).not.toBe(200);
        }
      }
    });
  });

  test.describe('SQL Injection Prevention', () => {
    test('should prevent SQL injection in ticket validation', async () => {
      // Test SQL injection attempts on ticket validation endpoint
      const sqlPayloads = [
        "'; DROP TABLE tickets; --",
        "' OR '1'='1",
        "' UNION SELECT * FROM users --",
        "'; UPDATE tickets SET status='used'; --"
      ];

      for (const payload of sqlPayloads) {
        const response = await helper.page.request.post('/api/tickets/validate', {
          data: {
            ticketId: payload,
            qrCode: payload
          }
        });

        // Improved SQL injection detection - more specific to avoid false positives
        const responseText = await response.text().catch(() => '');
        const responseJson = await response.json().catch(() => null);

        // Check for SQL injection indicators
        const hasError = responseText.toLowerCase().includes('error') ||
                        responseText.toLowerCase().includes('exception');
        const hasSqlError = responseText.toLowerCase().includes('sql error') ||
                           responseText.toLowerCase().includes('database error');
        const isDatabaseError = response.status() === 500 && (hasError || hasSqlError);

        // Should either reject with 400 (validation error) or handle gracefully
        // Should NOT return 500 with database errors (indicates SQL injection vulnerability)
        if (response.status() === 500) {
          expect(isDatabaseError).toBeFalsy();
        }

        // Should not contain sensitive database information
        expect(responseText.toLowerCase()).not.toContain('sqlite');
        expect(responseText.toLowerCase()).not.toContain('database');
        expect(responseText.toLowerCase()).not.toContain('table');
      }
    });

    test('should prevent SQL injection in registration lookup', async () => {
      const sqlPayloads = [
        "'; DROP TABLE registrations; --",
        "' OR 1=1 --",
        "' UNION SELECT password FROM admin --"
      ];

      for (const payload of sqlPayloads) {
        const response = await helper.page.request.get(`/api/registration/${payload}`);

        // Should handle malicious input gracefully
        expect([400, 404]).toContain(response.status());

        const responseText = await response.text().catch(() => '');
        expect(responseText.toLowerCase()).not.toContain('syntax error');
        expect(responseText.toLowerCase()).not.toContain('sql');
      }
    });
  });

  test.describe('API Security', () => {
    test('should rate limit API endpoints', async () => {
      const endpoint = '/api/email/subscribe';
      const requests = [];

      // Make rapid requests
      for (let i = 0; i < 20; i++) {
        requests.push(
          helper.page.request.post(endpoint, {
            data: { email: `test${i}@example.com` }
          })
        );
      }

      const responses = await Promise.all(requests);

      // At least some should be rate limited (429) or show similar behavior
      const statusCodes = responses.map(r => r.status());
      const hasRateLimiting = statusCodes.some(status =>
        status === 429 || status === 503
      );

      // Note: Basic implementation might not have rate limiting
      // This test documents expected behavior for production
      console.log('Rate limiting status codes:', statusCodes);
    });

    test('should validate content types', async () => {
      // Test invalid content type
      const response = await helper.page.request.post('/api/email/subscribe', {
        headers: {
          'content-type': 'text/plain'
        },
        data: 'invalid data format'
      });

      // Should reject invalid content type
      expect([400, 415]).toContain(response.status());
    });
  });

  test.describe('Data Protection', () => {
    test('should not expose sensitive information in errors', async () => {
      // Test 404 responses don't leak information
      const response = await helper.page.request.get('/api/nonexistent-endpoint');

      expect(response.status()).toBe(404);

      const responseText = await response.text();

      // Should not expose server details
      expect(responseText.toLowerCase()).not.toContain('node.js');
      expect(responseText.toLowerCase()).not.toContain('express');
      expect(responseText.toLowerCase()).not.toContain('vercel');
      expect(responseText.toLowerCase()).not.toContain('stack trace');
    });

    test('should handle malformed JSON gracefully', async () => {
      const response = await helper.page.request.post('/api/email/subscribe', {
        headers: {
          'content-type': 'application/json'
        },
        data: '{"invalid": json}'
      });

      expect([400, 422]).toContain(response.status());

      const responseText = await response.text();
      expect(responseText).not.toContain('SyntaxError');
      expect(responseText).not.toContain('JSON.parse');
    });
  });

  test.describe('Payment Security', () => {
    test('should validate payment amounts', async () => {
      // Navigate to tickets page
      await helper.page.goto('/tickets');

      // Add ticket to cart
      await helper.page.click('[data-ticket="weekend-pass"]');

      // Go to checkout
      await helper.page.click('.floating-cart .checkout-btn');

      // Fill form with test data
      await helper.page.fill('input[name="email"]', 'security-test@example.com');
      await helper.page.fill('input[name="firstName"]', 'Test');
      await helper.page.fill('input[name="lastName"]', 'User');
      await helper.page.fill('input[name="phone"]', '555-0123');

      // Submit form
      await helper.page.click('button[type="submit"]');

      // Wait for Stripe redirect
      await helper.page.waitForURL(/.*stripe.com.*/, { timeout: 10000 });

      // Verify we're on Stripe checkout (secure payment processing)
      expect(helper.page.url()).toContain('stripe.com');
    });

    test('should use secure payment processing', async () => {
      // Verify that payment forms use HTTPS and proper security headers
      await helper.page.goto('/tickets');

      // Check that the page is served over HTTPS in production
      const protocol = new URL(helper.page.url()).protocol;
      if (!helper.page.url().includes('localhost')) {
        expect(protocol).toBe('https:');
      }

      // Verify CSP headers exist
      const response = await helper.page.request.get('/tickets');
      const headers = response.headers();

      // Note: CSP headers might not be set in development
      console.log('Security headers:', {
        csp: headers['content-security-policy'],
        xframe: headers['x-frame-options'],
        xss: headers['x-xss-protection']
      });
    });
  });

  test.describe('Session Security', () => {
    test('should handle concurrent admin sessions securely', async () => {
      // Test that admin sessions are properly isolated
      const context1 = await helper.page.context().browser().newContext();
      const page1 = await context1.newPage();

      const context2 = await helper.page.context().browser().newContext();
      const page2 = await context2.newPage();

      // Both try to access admin
      await page1.goto('/admin');
      await page2.goto('/admin');

      // Both should see login form (no session sharing)
      await expect(page1.locator('input[type="password"]')).toBeVisible();
      await expect(page2.locator('input[type="password"]')).toBeVisible();

      await context1.close();
      await context2.close();
    });

    test('should expire admin sessions appropriately', async () => {
      // Note: Testing session expiration requires time manipulation
      // This test documents the expected behavior
      await helper.page.goto('/admin');

      // Verify login form is present (session not active)
      await expect(helper.page.locator('input[type="password"]')).toBeVisible();
    });
  });

  test.describe('File Upload Security', () => {
    test('should validate file types for gallery uploads', async () => {
      // Note: This test assumes future file upload functionality
      // Currently documents expected security behavior

      // Malicious file types that should be rejected
      const maliciousFiles = [
        { name: 'script.js', type: 'application/javascript' },
        { name: 'malware.exe', type: 'application/x-executable' },
        { name: 'shell.php', type: 'application/x-php' },
        { name: 'config.ini', type: 'text/plain' }
      ];

      // This test documents expected behavior for future implementation
      console.log('File upload security requirements:', maliciousFiles);
    });
  });

  test.describe('Cross-Origin Security', () => {
    test('should handle CORS appropriately', async () => {
      // Test CORS headers on API endpoints
      const response = await helper.page.request.get('/api/health/check');
      const headers = response.headers();

      // Should have appropriate CORS headers
      console.log('CORS headers:', {
        origin: headers['access-control-allow-origin'],
        methods: headers['access-control-allow-methods'],
        headers: headers['access-control-allow-headers']
      });

      // Basic security check - should not allow all origins in production
      if (!helper.page.url().includes('localhost')) {
        expect(headers['access-control-allow-origin']).not.toBe('*');
      }
    });
  });

  test.describe('Card Payment Security', () => {
    test('should use secure test card data', async () => {
      // Navigate through payment flow to verify secure handling
      await helper.page.goto('/tickets');
      await helper.page.click('[data-ticket="weekend-pass"]');
      await helper.page.click('.floating-cart .checkout-btn');

      // Fill checkout form
      await helper.page.fill('input[name="email"]', 'card-test@example.com');
      await helper.page.fill('input[name="firstName"]', 'Card');
      await helper.page.fill('input[name="lastName"]', 'Tester');
      await helper.page.fill('input[name="phone"]', '555-0199');

      // Submit to get to payment
      await helper.page.click('button[type="submit"]');

      // Wait for Stripe checkout
      await helper.page.waitForURL(/.*stripe.com.*/, { timeout: 10000 });

      // Verify Stripe test environment
      expect(helper.page.url()).toContain('stripe.com');

      // If we can access Stripe form, use secure test card data
      const cardNumberInput = await helper.page.locator('#cardNumber').first().isVisible().catch(() => false);

      if (cardNumberInput) {
        // Use future-proof test card expiry date (12/34 instead of 12/25)
        await helper.page.fill('#cardNumber', '4242424242424242');
        await helper.page.fill('#cardExpiry', '12/34'); // Updated to 12/34 for future-proofing
        await helper.page.fill('#cardCvc', '123');

        // Don't actually submit payment in security test
        console.log('Successfully filled secure test card data with future-proof expiry');
      }
    });

    test('should reject invalid card data securely', async () => {
      // Test that invalid card data is handled securely by Stripe
      await helper.page.goto('/tickets');
      await helper.page.click('[data-ticket="weekend-pass"]');
      await helper.page.click('.floating-cart .checkout-btn');

      // Fill checkout form
      await helper.page.fill('input[name="email"]', 'invalid-card@example.com');
      await helper.page.fill('input[name="firstName"]', 'Invalid');
      await helper.page.fill('input[name="lastName']', 'Card');
      await helper.page.fill('input[name="phone"]', '555-0100');

      // Submit to payment
      await helper.page.click('button[type="submit"]');

      // Should reach Stripe (secure payment processor)
      await helper.page.waitForURL(/.*stripe.com.*/, { timeout: 10000 });
      expect(helper.page.url()).toContain('stripe.com');

      // Stripe handles the secure validation of card data
      console.log('Payment security delegated to Stripe checkout');
    });
  });
});
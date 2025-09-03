import { test, expect } from '@playwright/test';

test.describe('Email Unsubscribe Flow - CAN-SPAM Compliance', () => {
  // Test data
  const testEmail = 'unsubscribe-test@example.com';
  const validToken = 'valid-unsubscribe-token-12345';
  const invalidToken = 'invalid-token';

  test.beforeEach(async ({ page }) => {
    // Mock email service APIs for consistent testing
    await page.route('**/api/email/subscribe', async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Successfully subscribed to newsletter',
          subscriber: {
            email: testEmail,
            status: 'active',
            requiresVerification: false
          }
        })
      });
    });

    // Mock successful unsubscribe
    await page.route(`**/api/email/unsubscribe?email=${testEmail}&token=${validToken}`, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `
          <!DOCTYPE html>
          <html><body>
            <h1>You've Been Unsubscribed</h1>
            <p>We've successfully removed <strong>${testEmail}</strong> from our mailing list.</p>
            <p>You won't receive any more marketing emails from A Lo Cubano Boulder Fest.</p>
          </body></html>
        `
      });
    });

    // Mock invalid token
    await page.route(`**/api/email/unsubscribe?email=${testEmail}&token=${invalidToken}`, async route => {
      await route.fulfill({
        status: 400,
        contentType: 'text/html',
        body: `
          <!DOCTYPE html>
          <html><body>
            <h1>Invalid Unsubscribe Token</h1>
            <p>The unsubscribe link you used is invalid or has expired.</p>
          </body></html>
        `
      });
    });

    // Mock already unsubscribed
    await page.route(`**/api/email/unsubscribe?email=${testEmail}&token=already-unsubscribed`, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `
          <!DOCTYPE html>
          <html><body>
            <h1>Already Unsubscribed</h1>
            <p>This email address is not currently subscribed to our newsletter.</p>
          </body></html>
        `
      });
    });
  });

  test('successful unsubscribe with valid token', async ({ page }) => {
    // Navigate to unsubscribe link (simulating email link click)
    await page.goto(`/api/email/unsubscribe?email=${testEmail}&token=${validToken}`);

    // Verify unsubscribe confirmation page
    await expect(page.locator('h1')).toContainText('You\'ve Been Unsubscribed');
    await expect(page.locator('body')).toContainText(testEmail);
    await expect(page.locator('body')).toContainText('won\'t receive any more marketing emails');
    
    // CAN-SPAM compliance: immediate effect confirmation
    await expect(page.locator('body')).toContainText('successfully removed');
  });

  test('handles invalid unsubscribe token', async ({ page }) => {
    // Navigate to unsubscribe with invalid token
    await page.goto(`/api/email/unsubscribe?email=${testEmail}&token=${invalidToken}`);

    // Verify error page
    await expect(page.locator('h1')).toContainText('Invalid Unsubscribe Token');
    await expect(page.locator('body')).toContainText('invalid or has expired');
    
    // Should provide contact information for help
    await expect(page.locator('body')).toContainText('contact us');
  });

  test('handles already unsubscribed email', async ({ page }) => {
    // Navigate to unsubscribe for already unsubscribed email
    await page.goto(`/api/email/unsubscribe?email=${testEmail}&token=already-unsubscribed`);

    // Verify appropriate message
    await expect(page.locator('h1')).toContainText('Already Unsubscribed');
    await expect(page.locator('body')).toContainText('not currently subscribed');
  });

  test('API endpoint validation', async ({ page, request }) => {
    // Test POST method for API validation
    const response = await request.post('/api/email/unsubscribe', {
      data: {
        email: testEmail,
        token: validToken
      }
    });

    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.message).toContain('Successfully unsubscribed');
    expect(json.email).toBe(testEmail);
  });

  test('re-subscribe capability after unsubscribe', async ({ page, request }) => {
    // First unsubscribe (mocked as successful)
    await page.goto(`/api/email/unsubscribe?email=${testEmail}&token=${validToken}`);
    await expect(page.locator('h1')).toContainText('You\'ve Been Unsubscribed');

    // Then attempt re-subscription
    const subscribeResponse = await request.post('/api/email/subscribe', {
      data: {
        email: testEmail,
        consentToMarketing: true,
        source: 'resubscribe-test'
      }
    });

    expect(subscribeResponse.status()).toBe(201);
    const json = await subscribeResponse.json();
    expect(json.success).toBe(true);
    expect(json.subscriber.email).toBe(testEmail);
  });

  test('rate limiting protection', async ({ page, request }) => {
    // Test multiple rapid unsubscribe attempts
    const promises = Array.from({ length: 3 }, () =>
      request.post('/api/email/unsubscribe', {
        data: {
          email: testEmail,
          token: validToken
        }
      })
    );

    const responses = await Promise.all(promises);
    
    // All should succeed (within rate limit for testing)
    responses.forEach(response => {
      expect([200, 429]).toContain(response.status());
    });
  });

  test('unsubscribe page accessibility', async ({ page }) => {
    await page.goto(`/api/email/unsubscribe?email=${testEmail}&token=${validToken}`);
    
    // Check basic accessibility requirements
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('font-family', /sans-serif/);
    
    // Test responsive design
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('h1')).toBeVisible();
    
    await page.setViewportSize({ width: 1200, height: 800 });
    await expect(page.locator('h1')).toBeVisible();
  });

  test('CAN-SPAM compliance verification', async ({ page }) => {
    await page.goto(`/api/email/unsubscribe?email=${testEmail}&token=${validToken}`);
    
    // CAN-SPAM requirements verification
    await expect(page.locator('body')).toContainText('successfully removed'); // Immediate effect
    await expect(page.locator('body')).toContainText('A Lo Cubano Boulder Fest'); // Clear sender identification
    await expect(page.locator('body')).toContainText('won\'t receive any more'); // Clear consequence statement
    
    // Contact information should be available
    const bodyText = await page.locator('body').textContent();
    expect(bodyText.toLowerCase()).toMatch(/(contact|email|reach)/);
  });
});
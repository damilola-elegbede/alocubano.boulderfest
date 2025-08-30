import { test, expect } from '@playwright/test';

test.describe('Payment Recovery', () => {
  let page;
  
  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    
    // Mock successful Stripe checkout session creation
    await page.route('**/api/payments/create-checkout-session', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sessionId: 'cs_test_123',
          url: 'https://checkout.stripe.com/pay/cs_test_123'
        })
      });
    });
  });

  test('handles Stripe webhook failure gracefully', async () => {
    // Mock webhook endpoint failure
    await page.route('**/api/payments/stripe-webhook', route => {
      route.fulfill({ status: 500, body: 'Internal Server Error' });
    });
    
    await page.goto('/tickets');
    
    // Add ticket and attempt payment
    await page.click('[data-testid="weekend-pass-btn"]');
    await page.click('.checkout-btn');
    
    // Should show error message for webhook failure
    await expect(page.locator('.error-message')).toBeVisible();
    await expect(page.locator('.error-message')).toContainText('payment processing');
  });

  test('recovers from payment timeout', async () => {
    // Mock slow payment processing
    await page.route('**/api/payments/create-checkout-session', route => {
      // Delay response to simulate timeout
      setTimeout(() => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            sessionId: 'cs_test_timeout',
            url: 'https://checkout.stripe.com/pay/cs_test_timeout'
          })
        });
      }, 10000);
    });
    
    await page.goto('/tickets');
    await page.click('[data-testid="weekend-pass-btn"]');
    await page.click('.checkout-btn');
    
    // Should show loading state
    await expect(page.locator('.loading-spinner')).toBeVisible();
    
    // Should show timeout message
    await expect(page.locator('.timeout-message')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.retry-payment-btn')).toBeVisible();
  });

  test('prevents duplicate payments', async () => {
    let requestCount = 0;
    
    await page.route('**/api/payments/create-checkout-session', route => {
      requestCount++;
      if (requestCount > 1) {
        route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Duplicate payment attempt' })
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            sessionId: 'cs_test_duplicate',
            url: 'https://checkout.stripe.com/pay/cs_test_duplicate'
          })
        });
      }
    });
    
    await page.goto('/tickets');
    await page.click('[data-testid="weekend-pass-btn"]');
    
    // First payment attempt
    await page.click('.checkout-btn');
    await expect(page.locator('.checkout-btn')).toBeDisabled();
    
    // Attempt duplicate payment (should be prevented)
    await page.click('.checkout-btn', { force: true });
    await expect(page.locator('.error-message')).toContainText('already processing');
  });

  test('handles failed payment retry flow', async () => {
    let attemptCount = 0;
    
    await page.route('**/api/payments/create-checkout-session', route => {
      attemptCount++;
      if (attemptCount === 1) {
        // First attempt fails
        route.fulfill({
          status: 402,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Payment failed' })
        });
      } else {
        // Retry succeeds
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            sessionId: 'cs_test_retry_success',
            url: 'https://checkout.stripe.com/pay/cs_test_retry_success'
          })
        });
      }
    });
    
    await page.goto('/tickets');
    await page.click('[data-testid="weekend-pass-btn"]');
    await page.click('.checkout-btn');
    
    // Should show failure message
    await expect(page.locator('.payment-failed')).toBeVisible();
    await expect(page.locator('.retry-payment-btn')).toBeVisible();
    
    // Retry payment
    await page.click('.retry-payment-btn');
    
    // Should succeed on retry
    await expect(page.locator('.payment-success')).toBeVisible();
    expect(attemptCount).toBe(2);
  });
});
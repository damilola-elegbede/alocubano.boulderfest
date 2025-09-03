import { test, expect } from '@playwright/test';

test.describe('Multi-Ticket Registration Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock Stripe
    await page.route('**/api/payments/create-checkout-session', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ 
          id: 'cs_test_123',
          url: 'https://checkout.stripe.com/test/cs_test_123'
        })
      });
    });

    // Mock payment success
    await page.route('**/api/payments/checkout-success*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ 
          success: true,
          tickets: ['ticket1', 'ticket2', 'ticket3']
        })
      });
    });
  });

  test('should handle complete multi-ticket purchase and registration', async ({ page }) => {
    // Navigate and add multiple tickets
    await page.goto('/tickets');
    await page.click('[data-testid="add-weekend-pass"]');
    await page.click('[data-testid="add-weekend-pass"]');
    await page.click('[data-testid="add-single-day"]');

    // Verify cart shows 3 tickets
    const cartBadge = page.locator('.cart-badge');
    await expect(cartBadge).toHaveText('3');

    // Purchase tickets
    await page.click('.floating-cart .btn-primary');
    
    // Mock successful payment redirect
    await page.goto('/api/payments/checkout-success?session_id=cs_test_123');

    // Mock batch registration endpoint
    await page.route('**/api/registration/batch', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ 
          success: true,
          registered: 3,
          tickets: [
            { id: 'ticket1', registered: true, attendee: 'John Doe' },
            { id: 'ticket2', registered: true, attendee: 'Jane Smith' },
            { id: 'ticket3', registered: true, attendee: 'Bob Johnson' }
          ]
        })
      });
    });

    // Fill batch registration form
    await page.fill('input[name="attendee_0"]', 'John Doe');
    await page.fill('input[name="email_0"]', 'john@example.com');
    await page.fill('input[name="attendee_1"]', 'Jane Smith');
    await page.fill('input[name="email_1"]', 'jane@example.com');
    await page.fill('input[name="attendee_2"]', 'Bob Johnson');
    await page.fill('input[name="email_2"]', 'bob@example.com');

    await page.click('button[type="submit"]');

    // Verify success message
    await expect(page.locator('.success-message')).toContainText('All 3 tickets registered successfully');
  });

  test('should handle partial registration scenario', async ({ page }) => {
    // Mock partial registration response
    await page.route('**/api/registration/batch', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ 
          success: true,
          registered: 2,
          failed: 1,
          tickets: [
            { id: 'ticket1', registered: true, attendee: 'John Doe' },
            { id: 'ticket2', registered: true, attendee: 'Jane Smith' },
            { id: 'ticket3', registered: false, error: 'Email already registered' }
          ]
        })
      });
    });

    await page.goto('/registration/batch?tickets=ticket1,ticket2,ticket3');

    // Fill form with duplicate email
    await page.fill('input[name="attendee_0"]', 'John Doe');
    await page.fill('input[name="email_0"]', 'john@example.com');
    await page.fill('input[name="attendee_1"]', 'Jane Smith');
    await page.fill('input[name="email_1"]', 'jane@example.com');
    await page.fill('input[name="attendee_2"]', 'Bob Johnson');
    await page.fill('input[name="email_2"]', 'john@example.com'); // Duplicate

    await page.click('button[type="submit"]');

    // Verify partial success message
    await expect(page.locator('.warning-message')).toContainText('2 of 3 tickets registered successfully');
    await expect(page.locator('.error-details')).toContainText('Email already registered');
  });

  test('should enforce registration deadline', async ({ page }) => {
    // Mock expired registration
    await page.route('**/api/registration/batch', async route => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ 
          error: 'Registration deadline has passed',
          deadline: '2026-05-10T23:59:59Z'
        })
      });
    });

    await page.goto('/registration/batch?tickets=ticket1,ticket2');

    await page.fill('input[name="attendee_0"]', 'John Doe');
    await page.fill('input[name="email_0"]', 'john@example.com');
    await page.fill('input[name="attendee_1"]', 'Jane Smith');
    await page.fill('input[name="email_1"]', 'jane@example.com');

    await page.click('button[type="submit"]');

    // Verify deadline enforcement
    await expect(page.locator('.error-message')).toContainText('Registration deadline has passed');
    await expect(page.locator('.deadline-info')).toContainText('May 10, 2026');
  });

  test('should validate required fields for all tickets', async ({ page }) => {
    await page.goto('/registration/batch?tickets=ticket1,ticket2');

    // Submit with missing fields
    await page.fill('input[name="attendee_0"]', 'John Doe');
    // Leave email_0 empty
    await page.fill('input[name="attendee_1"]', ''); // Empty name
    await page.fill('input[name="email_1"]', 'jane@example.com');

    await page.click('button[type="submit"]');

    // Verify validation errors
    await expect(page.locator('.field-error[data-field="email_0"]')).toContainText('Email is required');
    await expect(page.locator('.field-error[data-field="attendee_1"]')).toContainText('Attendee name is required');
  });
});
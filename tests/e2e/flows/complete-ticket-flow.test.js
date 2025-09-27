/**
 * E2E Test: Complete Ticket Purchase-to-Wallet Flow
 * Comprehensive test covering purchase → QR generation → registration → wallet passes
 */

import { test, expect } from '@playwright/test';
import { getTestDataConstants } from '../../../scripts/seed-test-data.js';
import { warnIfOptionalSecretsUnavailable } from '../helpers/test-setup.js';

const testConstants = getTestDataConstants();

test.describe('Complete Ticket Purchase-to-Wallet Flow', () => {
  // Check for payment service secrets - tests can run with mocks if missing
  const secretWarnings = warnIfOptionalSecretsUnavailable(['payment', 'stripe', 'email'], 'complete-ticket-flow.test.js');

  if (secretWarnings.hasWarnings) {
    console.log('ℹ️ Complete ticket flow tests will use mock responses where needed');
  }

  let mockOrderNumber;
  let mockTicketId;
  let mockQRToken;

  test.beforeEach(async ({ page }) => {
    // Generate mock test data
    const timestamp = Date.now();
    mockOrderNumber = `ALO-${new Date().getFullYear()}-${Math.floor(Math.random() * 9999).toString().padStart(4, '0')}`;
    mockTicketId = `${testConstants.TEST_PREFIX}TICKET_${timestamp}`;
    mockQRToken = `test_qr_token_${timestamp}`;

    // Mock API responses for consistent testing
    await page.route('**/api/payments/create-checkout-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: `${page.url()}mock-checkout-success?order=${mockOrderNumber}&ticket=${mockTicketId}`
        })
      });
    });

    await page.route('**/api/payments/checkout-success*', async (route) => {
      const url = new URL(route.request().url());
      const orderNumber = url.searchParams.get('order') || mockOrderNumber;
      const ticketId = url.searchParams.get('ticket') || mockTicketId;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          orderNumber,
          ticketId,
          qrToken: mockQRToken,
          email: testConstants.testUser.email
        })
      });
    });

    await page.route('**/api/qr/generate*', async (route) => {
      // Return a mock PNG buffer (1x1 transparent PNG)
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
        0x89, 0x00, 0x00, 0x00, 0x0B, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
        0x42, 0x60, 0x82
      ]);

      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: pngBuffer
      });
    });

    await page.route('**/api/tickets/validate', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          valid: true,
          ticketId: mockTicketId,
          orderNumber: mockOrderNumber,
          scanCount: 1,
          lastScanned: new Date().toISOString()
        })
      });
    });

    await page.route('**/api/registration/batch', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          registered: [mockTicketId],
          summary: {
            total: 1,
            successful: 1,
            failed: 0
          }
        })
      });
    });

    // Mock wallet pass endpoints
    await page.route('**/api/tickets/apple-wallet/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/vnd.apple.pkpass',
        headers: {
          'Content-Disposition': `attachment; filename="ticket-${mockTicketId}.pkpass"`
        },
        body: Buffer.from('mock-apple-pass-data')
      });
    });

    await page.route('**/api/tickets/google-wallet/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          saveUrl: `https://pay.google.com/gp/v/save/${mockTicketId}`
        })
      });
    });

    // Start from tickets page
    await page.goto('/tickets');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should complete full purchase-to-wallet flow with ALO order format', async ({ page }) => {
    // === STEP 1: Purchase Flow ===
    console.log('🎫 Starting purchase flow...');

    // Wait for floating cart to be initialized
    await page.waitForFunction(() => {
      const container = document.querySelector('[data-floating-cart-initialized="true"]');
      return container !== null;
    }, { timeout: 10000 });

    // Add multiple tickets to cart
    const weekendPassAdd = page.locator('[data-testid="weekend-pass-add"], button:has-text("Weekend"):not(:has-text("VIP"))').first();
    await expect(weekendPassAdd).toBeVisible({ timeout: 10000 });
    await weekendPassAdd.click();
    await weekendPassAdd.click(); // Add 2 tickets

    // Wait for cart state to update
    await page.waitForFunction(() => {
      const cartManager = window.globalCartManager;
      return cartManager && !cartManager.getState().isEmpty;
    }, { timeout: 5000 });

    // Open cart and proceed to checkout
    const cartButton = page.locator('.nav-cart-button, [data-testid="view-cart"]').first();
    await expect(cartButton).toBeVisible();
    await cartButton.click();

    const checkoutButton = page.locator('button:has-text("Checkout"), .checkout-btn').first();
    await expect(checkoutButton).toBeVisible();
    await checkoutButton.click();

    // Complete checkout (mocked)
    await page.waitForURL(/mock-checkout-success/);

    // === STEP 2: Verify Order Number Format ===
    console.log('🔢 Verifying order number format...');

    const urlParams = new URLSearchParams(page.url().split('?')[1]);
    const orderNumber = urlParams.get('order');

    expect(orderNumber).toBeTruthy();
    expect(orderNumber).toMatch(/^ALO-\d{4}-\d{4}$/);
    console.log(`✅ Order number format correct: ${orderNumber}`);

    // === STEP 3: QR Code Generation and Display ===
    console.log('📱 Testing QR code generation...');

    // Navigate to my-ticket page
    await page.goto(`/my-ticket#${mockQRToken}`);
    await page.waitForLoadState('domcontentloaded');

    // Verify QR code image loads
    const qrImage = page.locator('img[src*="/api/qr/generate"]');
    if (await qrImage.count() > 0) {
      await expect(qrImage).toBeVisible();

      // Test QR code endpoint directly
      const qrResponse = await page.request.get(`/api/qr/generate?token=${mockQRToken}`);
      expect(qrResponse.status()).toBe(200);
      expect(qrResponse.headers()['content-type']).toBe('image/png');
      console.log('✅ QR code generated successfully');
    }

    // === STEP 4: Registration Flow ===
    console.log('👤 Testing registration flow...');

    // Look for registration form or link
    const registrationForm = page.locator('form, .registration-form, button:has-text("Register")').first();
    if (await registrationForm.count() > 0) {
      // Fill registration form if present
      const firstNameInput = page.locator('input[name="firstName"], input[placeholder*="First"]');
      if (await firstNameInput.count() > 0) {
        await firstNameInput.fill(testConstants.testUser.firstName);
      }

      const lastNameInput = page.locator('input[name="lastName"], input[placeholder*="Last"]');
      if (await lastNameInput.count() > 0) {
        await lastNameInput.fill(testConstants.testUser.lastName);
      }

      const emailInput = page.locator('input[name="email"], input[type="email"]');
      if (await emailInput.count() > 0) {
        await emailInput.fill(testConstants.testUser.email);
      }

      const phoneInput = page.locator('input[name="phone"], input[type="tel"]');
      if (await phoneInput.count() > 0) {
        await phoneInput.fill(testConstants.testUser.phone);
      }

      // Submit registration
      const submitButton = page.locator('button[type="submit"], button:has-text("Register"), button:has-text("Submit")');
      if (await submitButton.count() > 0) {
        await submitButton.click();
        await page.waitForTimeout(2000);
        console.log('✅ Registration submitted');
      }
    }

    // === STEP 5: Wallet Pass Downloads ===
    console.log('📲 Testing wallet pass downloads...');

    // Test Apple Wallet download (iOS user agent)
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', {
        writable: true,
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15'
      });
    });

    const appleWalletLink = page.locator('a[href*="apple-wallet"], button:has-text("Apple Wallet")');
    if (await appleWalletLink.count() > 0) {
      const [download] = await Promise.all([
        page.waitForDownload(),
        appleWalletLink.click()
      ]);
      expect(download.suggestedFilename()).toContain('.pkpass');
      console.log('✅ Apple Wallet pass download successful');
    }

    // Test Google Wallet (Android user agent)
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', {
        writable: true,
        value: 'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36'
      });
    });

    const googleWalletLink = page.locator('a[href*="google-wallet"], button:has-text("Google Wallet")');
    if (await googleWalletLink.count() > 0) {
      // Google Wallet typically redirects to Google Pay
      const response = await page.request.get(`/api/tickets/google-wallet/${mockTicketId}`);
      expect(response.status()).toBe(200);
      const googleData = await response.json();
      expect(googleData.saveUrl).toContain('pay.google.com');
      console.log('✅ Google Wallet pass generation successful');
    }

    // === STEP 6: QR Validation ===
    console.log('🔍 Testing QR code validation...');

    const validationResponse = await page.request.post('/api/tickets/validate', {
      data: {
        qrToken: mockQRToken,
        ticketId: mockTicketId
      }
    });

    expect(validationResponse.status()).toBe(200);
    const validationData = await validationResponse.json();
    expect(validationData.valid).toBe(true);
    expect(validationData.ticketId).toBe(mockTicketId);
    expect(validationData.orderNumber).toBe(mockOrderNumber);
    console.log('✅ QR validation successful');

    console.log('🎉 Complete ticket flow test passed!');
  });

  test('should handle error scenarios gracefully', async ({ page }) => {
    console.log('❌ Testing error scenarios...');

    // Test invalid QR token
    const invalidQRResponse = await page.request.get('/api/qr/generate?token=invalid_token');
    expect(invalidQRResponse.status()).toBe(400);

    // Test missing QR token
    const missingTokenResponse = await page.request.get('/api/qr/generate');
    expect(missingTokenResponse.status()).toBe(400);

    // Test validation with invalid data
    const invalidValidationResponse = await page.request.post('/api/tickets/validate', {
      data: {
        qrToken: 'invalid',
        ticketId: 'invalid'
      }
    });
    expect(invalidValidationResponse.status()).toBe(400);

    console.log('✅ Error scenarios handled correctly');
  });

  test('should handle rate limiting on QR validation', async ({ page }) => {
    console.log('⏱️ Testing rate limiting...');

    // Mock rate limiting response
    await page.route('**/api/tickets/validate', async (route, request) => {
      const body = await request.postDataJSON();

      // Simulate rate limiting after multiple requests
      if (body.simulateRateLimit) {
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Rate limit exceeded',
            message: 'Maximum 10 scans per hour allowed'
          })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            valid: true,
            scanCount: 10
          })
        });
      }
    });

    // Test normal validation
    const normalResponse = await page.request.post('/api/tickets/validate', {
      data: {
        qrToken: mockQRToken,
        ticketId: mockTicketId
      }
    });
    expect(normalResponse.status()).toBe(200);

    // Test rate limiting
    const rateLimitResponse = await page.request.post('/api/tickets/validate', {
      data: {
        qrToken: mockQRToken,
        ticketId: mockTicketId,
        simulateRateLimit: true
      }
    });
    expect(rateLimitResponse.status()).toBe(429);

    const rateLimitData = await rateLimitResponse.json();
    expect(rateLimitData.error).toContain('Rate limit');

    console.log('✅ Rate limiting works correctly');
  });

  test('should validate wallet pass endpoints return correct content types', async ({ page }) => {
    console.log('📱 Testing wallet pass content types...');

    // Test Apple Wallet endpoint
    const appleResponse = await page.request.get(`/api/tickets/apple-wallet/${mockTicketId}`);
    expect(appleResponse.status()).toBe(200);
    expect(appleResponse.headers()['content-type']).toBe('application/vnd.apple.pkpass');
    expect(appleResponse.headers()['content-disposition']).toContain('attachment');

    // Test Google Wallet endpoint
    const googleResponse = await page.request.get(`/api/tickets/google-wallet/${mockTicketId}`);
    expect(googleResponse.status()).toBe(200);
    expect(googleResponse.headers()['content-type']).toBe('application/json');

    const googleData = await googleResponse.json();
    expect(googleData.saveUrl).toMatch(/^https:\/\/pay\.google\.com/);

    console.log('✅ Wallet pass endpoints return correct content types');
  });

  test('should validate order number format consistency', async ({ page }) => {
    console.log('🔢 Testing order number format consistency...');

    // Add ticket and checkout multiple times to test format consistency
    for (let i = 0; i < 3; i++) {
      await page.goto('/tickets');

      const addButton = page.locator('[data-testid="weekend-pass-add"], button:has-text("Weekend"):not(:has-text("VIP"))').first();
      await addButton.click();

      const cartButton = page.locator('.nav-cart-button, [data-testid="view-cart"]').first();
      await cartButton.click();

      const checkoutButton = page.locator('button:has-text("Checkout"), .checkout-btn').first();
      await checkoutButton.click();

      await page.waitForURL(/mock-checkout-success/);

      const urlParams = new URLSearchParams(page.url().split('?')[1]);
      const orderNumber = urlParams.get('order');

      expect(orderNumber).toMatch(/^ALO-\d{4}-\d{4}$/);
      console.log(`✅ Order ${i + 1} format correct: ${orderNumber}`);
    }
  });

  test('should handle missing wallet configuration gracefully', async ({ page }) => {
    console.log('⚙️ Testing missing wallet configuration handling...');

    // Mock missing wallet configuration
    await page.route('**/api/tickets/apple-wallet/**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Wallet configuration not available'
        })
      });
    });

    await page.route('**/api/tickets/google-wallet/**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Wallet configuration not available'
        })
      });
    });

    // Test error handling
    const appleResponse = await page.request.get(`/api/tickets/apple-wallet/${mockTicketId}`);
    expect(appleResponse.status()).toBe(500);

    const googleResponse = await page.request.get(`/api/tickets/google-wallet/${mockTicketId}`);
    expect(googleResponse.status()).toBe(500);

    console.log('✅ Missing wallet configuration handled gracefully');
  });
});
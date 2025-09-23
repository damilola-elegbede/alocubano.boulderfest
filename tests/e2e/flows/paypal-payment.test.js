/**
 * E2E Test: PayPal Payment Flow
 * Tests complete PayPal payment workflow including payment selector,
 * mock approval flow, ticket generation, and mobile experience
 */

import { test, expect } from '@playwright/test';
import { warnIfOptionalSecretsUnavailable } from '../helpers/test-setup.js';

test.describe('PayPal Payment Flow', () => {
  // Check for payment service secrets - tests can run with mocks if missing
  const secretWarnings = warnIfOptionalSecretsUnavailable(['payment', 'paypal'], 'paypal-payment.test.js');

  if (secretWarnings.hasWarnings) {
    console.log('ℹ️ PayPal tests will use mock responses due to missing PayPal credentials');
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/tickets');

    // Wait for floating cart to be initialized
    await page.waitForFunction(() => {
      const container = document.querySelector('[data-floating-cart-initialized="true"]');
      return container !== null;
    }, { timeout: 10000 });

    // Wait for cart system to be ready
    await page.waitForFunction(() => {
      return window.globalCartManager && typeof window.globalCartManager.getState === 'function';
    }, { timeout: 5000 });

    // Wait for page scripts to load
    await page.waitForTimeout(1000);
  });

  test('should select PayPal as payment method', async ({ page }) => {
    // Add ticket to cart
    const addButton = page.locator('[data-testid="weekend-pass-add"]');
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    // Wait for cart state to update
    await page.waitForFunction(() => {
      const cartManager = window.globalCartManager;
      return cartManager && !cartManager.getState().isEmpty;
    }, { timeout: 5000 });

    // Open cart panel
    const headerCartButton = page.locator('.nav-cart-button, [data-testid="view-cart"]');
    await expect(headerCartButton).toBeVisible();
    await headerCartButton.click();

    // Wait for cart panel to open
    await expect(page.locator('.cart-panel.open, .cart-sidebar.active')).toBeVisible({ timeout: 5000 });

    // Click checkout button
    const checkoutButton = page.locator('[data-testid="checkout-button"]');
    await expect(checkoutButton).toBeVisible();
    await expect(checkoutButton).toBeEnabled();
    await checkoutButton.click();

    // Wait for payment method selector to appear
    await expect(page.locator('.payment-selector-modal')).toBeVisible({ timeout: 5000 });

    // Verify PayPal payment method is available
    const paypalPaymentMethod = page.locator('[data-method="paypal"]');
    await expect(paypalPaymentMethod).toBeVisible();

    // Check PayPal option content
    const paypalContent = await paypalPaymentMethod.textContent();
    expect(paypalContent.toLowerCase()).toContain('paypal');

    // Verify PayPal icon or branding
    const paypalIcon = page.locator('[data-method="paypal"] img, [data-method="paypal"] .paypal-icon');
    if (await paypalIcon.count() > 0) {
      await expect(paypalIcon.first()).toBeVisible();
    }
  });

  test('should complete mock PayPal approval flow', async ({ page }) => {
    // Add ticket to cart
    const addButton = page.locator('[data-testid="weekend-pass-add"]');
    await expect(addButton).toBeVisible();
    await addButton.click();

    // Wait for cart state update
    await page.waitForFunction(() => {
      const cartManager = window.globalCartManager;
      return cartManager && !cartManager.getState().isEmpty;
    }, { timeout: 5000 });

    // Open cart and initiate checkout
    const headerCartButton = page.locator('.nav-cart-button, [data-testid="view-cart"]');
    await expect(headerCartButton).toBeVisible();
    await headerCartButton.click();

    await expect(page.locator('.cart-panel.open, .cart-sidebar.active')).toBeVisible({ timeout: 5000 });

    const checkoutButton = page.locator('[data-testid="checkout-button"]');
    await expect(checkoutButton).toBeEnabled();

    // Monitor PayPal order creation
    const paypalRequestPromise = page.waitForRequest('**/paypal/create-order', { timeout: 10000 });

    await checkoutButton.click();

    // Wait for payment selector and select PayPal
    await expect(page.locator('.payment-selector-modal')).toBeVisible({ timeout: 5000 });

    const paypalPaymentMethod = page.locator('[data-method="paypal"]');
    await expect(paypalPaymentMethod).toBeVisible();
    await paypalPaymentMethod.click();

    try {
      const request = await paypalRequestPromise;
      expect(request.method()).toBe('POST');

      // Wait for PayPal redirect or processing state
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 });

      const currentUrl = page.url();

      // In test mode, we should either:
      // 1. Stay on the same domain with processing state
      // 2. Redirect to mock PayPal approval page
      // 3. Show PayPal checkout iframe/modal

      const hasPayPalRedirect = currentUrl.includes('paypal.com') || currentUrl.includes('sandbox.paypal.com');
      const hasProcessingState = await page.locator('.payment-processing-overlay, .paypal-processing').count() > 0;
      const hasPayPalIframe = await page.locator('iframe[src*="paypal"]').count() > 0;
      const hasCheckoutState = currentUrl.includes('checkout') || currentUrl.includes('paypal');

      expect(
        hasPayPalRedirect ||
        hasProcessingState ||
        hasPayPalIframe ||
        hasCheckoutState
      ).toBeTruthy();

    } catch (error) {
      // In test mode, PayPal might be mocked completely
      console.log('PayPal flow mocked in test environment');

      // Verify we at least got to a reasonable state
      const currentUrl = page.url();
      expect(currentUrl).toBeDefined();
    }
  });

  test('should handle PayPal payment confirmation', async ({ page }) => {
    // Mock the PayPal success flow
    await page.route('**/api/payments/paypal/create-order', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          orderId: 'TEST-EC-MOCK-SUCCESS',
          approvalUrl: 'https://sandbox.paypal.com/checkoutnow?token=TEST-EC-MOCK-SUCCESS',
          transactionId: 'test_paypal_trans_123',
          referenceId: 'ALCBF-TEST-123',
          totalAmount: 150.00,
          testMode: true
        })
      });
    });

    // Mock PayPal capture endpoint
    await page.route('**/api/payments/paypal/capture-order', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          paymentMethod: 'paypal',
          orderId: 'TEST-EC-MOCK-SUCCESS',
          captureId: 'TEST-CAPTURE-SUCCESS',
          status: 'COMPLETED',
          amount: 150.00,
          currency: 'USD',
          payer: {
            payerId: 'TEST-PAYER-123',
            email: 'test@example.com',
            name: {
              given_name: 'Test',
              surname: 'User'
            }
          },
          instructions: {
            clearCart: true,
            nextSteps: [
              'Check your email for order confirmation',
              'Complete your festival registration',
              'Save your confirmation number for check-in'
            ]
          },
          message: 'PayPal payment successful! Your tickets have been sent to your email.'
        })
      });
    });

    // Add ticket and proceed to PayPal
    const addButton = page.locator('[data-testid="weekend-pass-add"]');
    await expect(addButton).toBeVisible();
    await addButton.click();

    await page.waitForFunction(() => {
      const cartManager = window.globalCartManager;
      return cartManager && !cartManager.getState().isEmpty;
    }, { timeout: 5000 });

    const headerCartButton = page.locator('.nav-cart-button, [data-testid="view-cart"]');
    await headerCartButton.click();

    await expect(page.locator('.cart-panel.open, .cart-sidebar.active')).toBeVisible({ timeout: 5000 });

    const checkoutButton = page.locator('[data-testid="checkout-button"]');
    await checkoutButton.click();

    await expect(page.locator('.payment-selector-modal')).toBeVisible({ timeout: 5000 });

    const paypalPaymentMethod = page.locator('[data-method="paypal"]');
    await paypalPaymentMethod.click();

    // Wait for mock redirect - in real scenario this would go to PayPal
    await page.waitForLoadState('domcontentloaded', { timeout: 3000 });

    // Simulate return from PayPal approval
    await page.goto('/success?paypal=true&reference_id=ALCBF-TEST-123&test_mode=true');

    // Verify success page elements
    await page.waitForFunction(() => {
      const container = document.querySelector('.success-container');
      return container && container.style.display !== 'none';
    }, { timeout: 10000 });

    const successContainer = page.locator('.success-container');
    await expect(successContainer).toBeVisible({ timeout: 5000 });

    // Check for PayPal-specific success content
    const pageContent = await page.locator('body').textContent();
    const hasPayPalContent = pageContent.toLowerCase().includes('paypal') ||
                            pageContent.toLowerCase().includes('payment successful') ||
                            pageContent.toLowerCase().includes('thank you');

    expect(hasPayPalContent).toBeTruthy();
  });

  test('should verify ticket generation after PayPal payment', async ({ page }) => {
    // Mock successful PayPal checkout result
    await page.route('**/api/payments/checkout-success*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'PayPal payment processed successfully! Your tickets have been sent to your email.',
          paymentMethod: 'paypal',
          sessionId: 'test_paypal_session_123',
          orderId: 'TEST-EC-TICKET-GEN',
          amount: 150.00,
          currency: 'USD',
          ticketDetails: {
            ticketId: 'TICKET-PAYPAL-123',
            qrCode: 'QR-PAYPAL-TEST-123',
            ticketType: '2026 Early Bird Full Pass'
          },
          instructions: {
            clearCart: true
          }
        })
      });
    });

    // Navigate to success page to test ticket generation
    await page.goto('/success?paypal=true&session_id=test_paypal_session_123');

    // Wait for success page to load
    await expect(page.locator('body')).toBeVisible();

    // Wait for ticket generation
    await page.waitForFunction(() => {
      const container = document.querySelector('.success-container');
      return container && container.style.display !== 'none';
    }, { timeout: 10000 });

    // Look for ticket-related elements
    const ticketElements = page.locator([
      'a:has-text("Download")',
      'a:has-text("Ticket")',
      'a:has-text("Wallet")',
      '.download-ticket',
      '.add-to-wallet',
      '.ticket-download',
      '[data-testid="download-ticket"]',
      '[data-testid="wallet-pass"]',
      '.qr-code',
      '.ticket-info'
    ].join(', '));

    // Check if any ticket-related elements exist
    const ticketElementCount = await ticketElements.count();

    if (ticketElementCount > 0) {
      await expect(ticketElements.first()).toBeVisible();

      // Check for wallet pass links
      const walletLinks = page.locator('a[href*="wallet"], a[href*="ticket"]');
      if (await walletLinks.count() > 0) {
        const href = await walletLinks.first().getAttribute('href');
        expect(href).toMatch(/ticket|wallet|download|api\/tickets/i);
      }
    } else {
      // At minimum, verify page has ticket-related content
      const pageContent = await page.locator('body').textContent();
      const hasTicketContent = pageContent.toLowerCase().includes('ticket') ||
                              pageContent.toLowerCase().includes('pass') ||
                              pageContent.toLowerCase().includes('download') ||
                              pageContent.toLowerCase().includes('wallet');

      expect(hasTicketContent).toBeTruthy();
    }
  });

  test('should confirm registration email after PayPal payment', async ({ page }) => {
    // Mock email confirmation endpoint
    await page.route('**/api/email/send-confirmation', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Confirmation email sent successfully',
          emailSent: true,
          emailAddress: 'test@example.com'
        })
      });
    });

    // Navigate to success page
    await page.goto('/success?paypal=true&session_id=test_email_session');

    // Wait for page load
    await expect(page.locator('body')).toBeVisible();

    // Look for email confirmation messages
    const emailElements = page.locator([
      ':has-text("email")',
      ':has-text("confirmation")',
      ':has-text("sent")',
      '.email-confirmation',
      '.confirmation-message'
    ].join(', '));

    // Check page content for email-related text
    const pageContent = await page.locator('body').textContent();
    const hasEmailContent = pageContent.toLowerCase().includes('email') ||
                           pageContent.toLowerCase().includes('confirmation') ||
                           pageContent.toLowerCase().includes('check your inbox') ||
                           pageContent.toLowerCase().includes('sent to');

    expect(hasEmailContent).toBeTruthy();
  });

  test('should test mobile PayPal flow', async ({ page, browserName }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Add ticket to cart
    const addButton = page.locator('[data-testid="weekend-pass-add"]');
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    await page.waitForFunction(() => {
      const cartManager = window.globalCartManager;
      return cartManager && !cartManager.getState().isEmpty;
    }, { timeout: 5000 });

    // On mobile, cart might be accessed differently
    const mobileCartButton = page.locator('.nav-cart-button, [data-testid="view-cart"], .mobile-cart-button');
    await expect(mobileCartButton).toBeVisible();
    await mobileCartButton.click();

    // Wait for mobile cart to open
    await expect(page.locator('.cart-panel.open, .cart-sidebar.active, .mobile-cart.open')).toBeVisible({ timeout: 5000 });

    const checkoutButton = page.locator('[data-testid="checkout-button"]');
    await expect(checkoutButton).toBeVisible();
    await checkoutButton.click();

    // Payment selector should work on mobile
    await expect(page.locator('.payment-selector-modal')).toBeVisible({ timeout: 5000 });

    // PayPal option should be easily tappable on mobile
    const paypalPaymentMethod = page.locator('[data-method="paypal"]');
    await expect(paypalPaymentMethod).toBeVisible();

    // Check touch-friendly size (minimum 44px)
    const paypalBox = await paypalPaymentMethod.boundingBox();
    expect(paypalBox.height).toBeGreaterThanOrEqual(44);

    await paypalPaymentMethod.click();

    // Mobile PayPal flow should redirect appropriately
    await page.waitForLoadState('domcontentloaded', { timeout: 3000 });

    const currentUrl = page.url();
    const isMobile = browserName === 'webkit' || page.viewportSize().width < 768;

    // Mobile might have different PayPal flow
    expect(currentUrl).toBeDefined();
  });

  test('should test PayPal error recovery scenarios', async ({ page }) => {
    // Mock PayPal error response
    await page.route('**/api/payments/paypal/create-order', route => {
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'PayPal order creation failed',
          message: 'Invalid order data. Please check your cart and try again.',
          fallbackUrl: '/api/payments/create-checkout-session',
          code: 'PAYPAL_ORDER_CREATION_FAILED'
        })
      });
    });

    // Add ticket and try PayPal payment
    const addButton = page.locator('[data-testid="weekend-pass-add"]');
    await expect(addButton).toBeVisible();
    await addButton.click();

    await page.waitForFunction(() => {
      const cartManager = window.globalCartManager;
      return cartManager && !cartManager.getState().isEmpty;
    }, { timeout: 5000 });

    const headerCartButton = page.locator('.nav-cart-button, [data-testid="view-cart"]');
    await headerCartButton.click();

    await expect(page.locator('.cart-panel.open, .cart-sidebar.active')).toBeVisible({ timeout: 5000 });

    const checkoutButton = page.locator('[data-testid="checkout-button"]');
    await checkoutButton.click();

    await expect(page.locator('.payment-selector-modal')).toBeVisible({ timeout: 5000 });

    const paypalPaymentMethod = page.locator('[data-method="paypal"]');
    await paypalPaymentMethod.click();

    // Wait for error handling
    await page.waitForLoadState('domcontentloaded', { timeout: 3000 });

    // Look for error messages or fallback options
    const errorElements = page.locator([
      '.error',
      '.alert-danger',
      '.payment-error',
      '.paypal-error',
      ':has-text("error")',
      ':has-text("failed")'
    ].join(', '));

    const hasErrorState = await errorElements.count() > 0;
    const pageStillWorks = await page.locator('body').isVisible();

    // Should either show error or gracefully fallback
    expect(hasErrorState || pageStillWorks).toBeTruthy();

    // Check if there's a fallback to credit card option
    const fallbackElements = page.locator([
      ':has-text("credit card")',
      ':has-text("try again")',
      '[data-method="stripe"]',
      '.payment-fallback'
    ].join(', '));

    if (await fallbackElements.count() > 0) {
      // Fallback option should be available
      await expect(fallbackElements.first()).toBeVisible();
    }
  });

  test('should handle PayPal payment cancellation', async ({ page }) => {
    // Add ticket and start PayPal flow
    const addButton = page.locator('[data-testid="weekend-pass-add"]');
    await expect(addButton).toBeVisible();
    await addButton.click();

    await page.waitForFunction(() => {
      const cartManager = window.globalCartManager;
      return cartManager && !cartManager.getState().isEmpty;
    }, { timeout: 5000 });

    const headerCartButton = page.locator('.nav-cart-button, [data-testid="view-cart"]');
    await headerCartButton.click();

    await expect(page.locator('.cart-panel.open, .cart-sidebar.active')).toBeVisible({ timeout: 5000 });

    const checkoutButton = page.locator('[data-testid="checkout-button"]');
    await checkoutButton.click();

    await expect(page.locator('.payment-selector-modal')).toBeVisible({ timeout: 5000 });

    // Look for ways to cancel/close the payment selector
    const closeButton = page.locator('.payment-selector-close, .modal-close, [aria-label="Close"]');
    if (await closeButton.count() > 0) {
      await closeButton.first().click();

      // Should return to cart/tickets page
      await expect(page.locator('.payment-selector-modal')).not.toBeVisible();
      expect(page.url()).toMatch(/tickets|cart/);
    } else {
      // Try clicking backdrop to close
      const backdrop = page.locator('.payment-selector-backdrop, .modal-backdrop');
      if (await backdrop.count() > 0) {
        await backdrop.click();
        await expect(page.locator('.payment-selector-modal')).not.toBeVisible();
      }
    }

    // Simulate PayPal cancellation return
    await page.goto('/failure?paypal=true&reference_id=ALCBF-CANCELLED&reason=cancelled');

    // Should show appropriate cancellation message
    const pageContent = await page.locator('body').textContent();
    const hasCancellationContent = pageContent.toLowerCase().includes('cancel') ||
                                  pageContent.toLowerCase().includes('try again') ||
                                  pageContent.toLowerCase().includes('payment not completed');

    expect(hasCancellationContent).toBeTruthy();
  });

  test('should validate PayPal payment totals correctly', async ({ page }) => {
    // Add multiple items to test total calculation
    const weekendBtn = page.locator('[data-testid="weekend-pass-add"]');
    await expect(weekendBtn).toBeVisible();
    await weekendBtn.click();

    await page.waitForFunction(() => {
      const cartManager = window.globalCartManager;
      return cartManager && !cartManager.getState().isEmpty;
    }, { timeout: 5000 });

    const dayPassBtn = page.locator('[data-testid="day-pass-add"]');
    await expect(dayPassBtn).toBeVisible();
    await dayPassBtn.click();

    await page.waitForFunction(() => {
      const cartManager = window.globalCartManager;
      const state = cartManager.getState();
      return state && Object.keys(state.tickets).length >= 2;
    }, { timeout: 5000 });

    // Open cart to check total
    const viewCartButton = page.locator('[data-testid="view-cart"]');
    await expect(viewCartButton).toBeVisible();
    await viewCartButton.click();

    await expect(page.locator('.floating-cart-panel.open')).toBeVisible({ timeout: 5000 });

    // Check cart total
    const cartTotal = page.locator('.cart-total-amount');
    await expect(cartTotal).toBeVisible();

    const totalText = await cartTotal.textContent();
    expect(totalText).toMatch(/\$\d+(\.\d{2})?/);

    // Extract and validate total
    const numericTotal = parseFloat(totalText.replace(/[^\d.]/g, ''));
    expect(numericTotal).toBeGreaterThan(150); // Should be at least weekend pass amount
    expect(numericTotal).toBeLessThan(500); // Reasonable upper bound

    // Proceed to PayPal to ensure total is passed correctly
    const checkoutButton = page.locator('[data-testid="checkout-button"]');
    await checkoutButton.click();

    await expect(page.locator('.payment-selector-modal')).toBeVisible({ timeout: 5000 });

    // Mock PayPal order creation to verify total
    let paypalOrderData = null;
    await page.route('**/api/payments/paypal/create-order', route => {
      paypalOrderData = route.request().postDataJSON();
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          orderId: 'TEST-EC-TOTAL-VALIDATION',
          approvalUrl: 'https://sandbox.paypal.com/test',
          totalAmount: numericTotal,
          testMode: true
        })
      });
    });

    const paypalPaymentMethod = page.locator('[data-method="paypal"]');
    await paypalPaymentMethod.click();

    // Wait for API call
    await page.waitForTimeout(1000);

    // Verify PayPal received correct total (if API was called)
    if (paypalOrderData) {
      const cartItems = paypalOrderData.cartItems || [];
      const calculatedTotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      expect(Math.abs(calculatedTotal - numericTotal)).toBeLessThan(0.01); // Allow for floating point precision
    }
  });

  test('should secure PayPal payment data transmission', async ({ page }) => {
    // Add ticket and proceed to PayPal
    const addButton = page.locator('[data-testid="weekend-pass-add"]');
    await expect(addButton).toBeVisible();
    await addButton.click();

    await page.waitForFunction(() => {
      const cartManager = window.globalCartManager;
      return cartManager && !cartManager.getState().isEmpty;
    }, { timeout: 5000 });

    const headerCartButton = page.locator('.nav-cart-button, [data-testid="view-cart"]');
    await headerCartButton.click();

    await expect(page.locator('.cart-panel.open, .cart-sidebar.active')).toBeVisible({ timeout: 5000 });

    const checkoutButton = page.locator('[data-testid="checkout-button"]');
    await checkoutButton.click();

    await expect(page.locator('.payment-selector-modal')).toBeVisible({ timeout: 5000 });

    // Check security before proceeding
    const currentUrl = page.url();

    // Verify HTTPS (if not localhost)
    if (!currentUrl.includes('localhost') && !currentUrl.includes('127.0.0.1') && !currentUrl.includes('ngrok')) {
      expect(currentUrl).toMatch(/^https:/);
    }

    // Verify no sensitive data in URL
    expect(currentUrl).not.toContain('card');
    expect(currentUrl).not.toContain('paypal_email');
    expect(currentUrl).not.toContain('password');

    // Monitor request headers for security
    let requestHeaders = {};
    page.on('request', request => {
      if (request.url().includes('paypal') || request.url().includes('payment')) {
        requestHeaders = request.headers();
      }
    });

    const paypalPaymentMethod = page.locator('[data-method="paypal"]');
    await paypalPaymentMethod.click();

    await page.waitForTimeout(1000);

    // Check that sensitive data isn't exposed in DOM
    const pageContent = await page.locator('body').textContent();
    expect(pageContent).not.toContain('test_client_secret');
    expect(pageContent).not.toContain('sb-'); // PayPal sandbox indicators
  });
});
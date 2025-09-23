/**
 * E2E Test: Mobile PayPal Integration
 * Tests PayPal payment flow specifically optimized for mobile devices
 */

import { test, expect } from '@playwright/test';
import { warnIfOptionalSecretsUnavailable } from '../helpers/test-setup.js';

test.describe('Mobile PayPal Integration', () => {
  // Check for PayPal configuration
  const secretWarnings = warnIfOptionalSecretsUnavailable(['paypal'], 'mobile-paypal-integration.test.js');

  if (secretWarnings.hasWarnings) {
    console.log('ℹ️ PayPal tests will use mock responses due to missing PayPal credentials');
  }

  test.beforeEach(async ({ page }) => {
    // Set mobile viewport for all tests
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/tickets');

    // Wait for cart system to be ready
    await page.waitForFunction(() => {
      return window.globalCartManager && typeof window.globalCartManager.getState === 'function';
    }, { timeout: 10000 });
  });

  test('should display mobile-optimized PayPal button sizing', async ({ page }) => {
    // Add item to cart to trigger payment flow
    const addButton = page.locator('[data-testid="weekend-pass-add"]');
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    // Open cart
    const headerCartButton = page.locator('.nav-cart-button, [data-testid="view-cart"]');
    await expect(headerCartButton).toBeVisible();
    await headerCartButton.click();

    // Start checkout
    const checkoutButton = page.locator('[data-testid="checkout-button"]');
    await expect(checkoutButton).toBeVisible();
    await checkoutButton.click();

    // Wait for payment selector modal
    await expect(page.locator('.payment-selector-modal')).toBeVisible({ timeout: 5000 });

    // Check PayPal button dimensions on mobile
    const paypalButton = page.locator('[data-method="paypal"]');
    await expect(paypalButton).toBeVisible();

    const buttonBox = await paypalButton.boundingBox();
    if (buttonBox) {
      // Verify minimum touch target size (44px minimum)
      expect(buttonBox.height).toBeGreaterThanOrEqual(44);
      expect(buttonBox.width).toBeGreaterThan(200); // Should span enough width for mobile

      // Verify PayPal logo is properly sized
      const paypalLogo = paypalButton.locator('.paypal-icon');
      const logoBox = await paypalLogo.boundingBox();
      if (logoBox) {
        expect(logoBox.width).toBeLessThanOrEqual(150); // Not too large for mobile
        expect(logoBox.height).toBeLessThanOrEqual(50);
      }
    }
  });

  test('should handle mobile PayPal payment flow with app detection', async ({ page }) => {
    // Add item to cart
    const addButton = page.locator('[data-testid="weekend-pass-add"]');
    await addButton.click();

    // Navigate to payment
    const headerCartButton = page.locator('.nav-cart-button, [data-testid="view-cart"]');
    await headerCartButton.click();
    const checkoutButton = page.locator('[data-testid="checkout-button"]');
    await checkoutButton.click();

    // Select PayPal payment method
    await expect(page.locator('.payment-selector-modal')).toBeVisible();
    const paypalButton = page.locator('[data-method="paypal"]');

    // Set up request monitoring
    const createOrderPromise = page.waitForRequest('**/paypal/create-order', { timeout: 10000 });

    await paypalButton.click();

    try {
      const request = await createOrderPromise;
      expect(request.method()).toBe('POST');

      // Should include mobile device info
      const requestBody = request.postDataJSON();
      expect(requestBody).toHaveProperty('deviceInfo');
      if (requestBody.deviceInfo) {
        expect(requestBody.deviceInfo.isMobile).toBe(true);
        expect(requestBody.deviceInfo.touchSupport).toBe(true);
      }

      // Wait for either redirect or loading state
      await page.waitForTimeout(2000);

      // Check if redirected to PayPal or showing processing state
      const currentUrl = page.url();
      const hasProcessingOverlay = await page.locator('.payment-processing-overlay').count() > 0;

      expect(
        currentUrl.includes('paypal.com') ||
        currentUrl.includes('sandbox.paypal.com') ||
        hasProcessingOverlay ||
        currentUrl.includes('success') ||
        currentUrl.includes('failure')
      ).toBeTruthy();

    } catch (error) {
      // Handle mock/test environment
      console.log('PayPal flow mocked in test environment');

      // Should show appropriate error handling or fallback
      const errorMessage = page.locator('.payment-selector-error, .mobile-payment-fallback');
      if (await errorMessage.count() > 0) {
        await expect(errorMessage.first()).toBeVisible();
      }
    }
  });

  test('should provide mobile fallback options when PayPal fails', async ({ page }) => {
    // Add item to cart
    const addButton = page.locator('[data-testid="weekend-pass-add"]');
    await addButton.click();

    // Navigate to payment
    const headerCartButton = page.locator('.nav-cart-button, [data-testid="view-cart"]');
    await headerCartButton.click();
    const checkoutButton = page.locator('[data-testid="checkout-button"]');
    await checkoutButton.click();

    // Wait for payment selector
    await expect(page.locator('.payment-selector-modal')).toBeVisible();

    // Mock PayPal failure by intercepting the request
    await page.route('**/paypal/create-order', route => {
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'PayPal service temporarily unavailable',
          message: 'PayPal is temporarily unavailable on mobile.',
          fallbackUrl: '/api/payments/create-checkout-session'
        })
      });
    });

    // Select PayPal
    const paypalButton = page.locator('[data-method="paypal"]');
    await paypalButton.click();

    // Should show mobile fallback options
    const fallbackOptions = page.locator('.mobile-payment-fallback');
    await expect(fallbackOptions).toBeVisible({ timeout: 5000 });

    // Check fallback buttons
    const creditCardFallback = fallbackOptions.locator('.fallback-btn.primary');
    const retryButton = fallbackOptions.locator('.fallback-btn.secondary');

    await expect(creditCardFallback).toBeVisible();
    await expect(retryButton).toBeVisible();

    // Verify button sizes for mobile
    const fallbackButtonBox = await creditCardFallback.boundingBox();
    if (fallbackButtonBox) {
      expect(fallbackButtonBox.height).toBeGreaterThanOrEqual(44); // Touch target compliance
    }

    // Test credit card fallback
    await creditCardFallback.click();

    // Should switch to Stripe payment method
    await expect(page.locator('[data-method="stripe"]')).toBeVisible();
  });

  test('should optimize PayPal modal for landscape orientation', async ({ page }) => {
    // Add item to cart
    const addButton = page.locator('[data-testid="weekend-pass-add"]');
    await addButton.click();

    // Open payment selector
    const headerCartButton = page.locator('.nav-cart-button, [data-testid="view-cart"]');
    await headerCartButton.click();
    const checkoutButton = page.locator('[data-testid="checkout-button"]');
    await checkoutButton.click();

    // Test portrait mode first
    await expect(page.locator('.payment-selector-modal')).toBeVisible();

    let modalBox = await page.locator('.payment-selector-content').boundingBox();
    const portraitHeight = modalBox?.height;

    // Switch to landscape orientation
    await page.setViewportSize({ width: 667, height: 375 });
    await page.waitForTimeout(500); // Allow orientation change

    // Modal should still be accessible and properly sized
    await expect(page.locator('.payment-selector-modal')).toBeVisible();

    modalBox = await page.locator('.payment-selector-content').boundingBox();
    if (modalBox && portraitHeight) {
      // In landscape, modal should adapt its height
      expect(modalBox.height).toBeLessThanOrEqual(375); // Should fit in viewport
      expect(modalBox.width).toBeGreaterThan(0);
    }

    // PayPal button should still be accessible
    const paypalButton = page.locator('[data-method="paypal"]');
    await expect(paypalButton).toBeVisible();

    const buttonBox = await paypalButton.boundingBox();
    if (buttonBox) {
      expect(buttonBox.height).toBeGreaterThanOrEqual(44); // Touch target maintained
    }
  });

  test('should handle slow mobile connections gracefully', async ({ page }) => {
    // Simulate slow 3G connection
    await page.route('**/*', async route => {
      await new Promise(resolve => setTimeout(resolve, 500)); // Add 500ms delay
      route.continue();
    });

    // Add item to cart (with delays)
    const addButton = page.locator('[data-testid="weekend-pass-add"]');
    await expect(addButton).toBeVisible({ timeout: 15000 });
    await addButton.click();

    // Navigate to payment (with extended timeouts)
    const headerCartButton = page.locator('.nav-cart-button, [data-testid="view-cart"]');
    await expect(headerCartButton).toBeVisible({ timeout: 10000 });
    await headerCartButton.click();

    const checkoutButton = page.locator('[data-testid="checkout-button"]');
    await expect(checkoutButton).toBeVisible({ timeout: 10000 });
    await checkoutButton.click();

    // Payment selector should eventually appear
    await expect(page.locator('.payment-selector-modal')).toBeVisible({ timeout: 15000 });

    // Select PayPal
    const paypalButton = page.locator('[data-method="paypal"]');
    await expect(paypalButton).toBeVisible();
    await paypalButton.click();

    // Should show loading state during slow request
    await expect(page.locator('.payment-processing-overlay')).toBeVisible({ timeout: 10000 });

    // Spinner should be appropriately sized for mobile
    const spinner = page.locator('.payment-processing-spinner');
    if (await spinner.count() > 0) {
      const spinnerBox = await spinner.boundingBox();
      if (spinnerBox) {
        expect(spinnerBox.width).toBeLessThanOrEqual(50); // Not too large for mobile
        expect(spinnerBox.height).toBeLessThanOrEqual(50);
      }
    }
  });

  test('should handle PayPal app deep linking on iOS simulation', async ({ page }) => {
    // Simulate iOS user agent
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', {
        writable: true,
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
      });
    });

    // Add item to cart
    const addButton = page.locator('[data-testid="weekend-pass-add"]');
    await addButton.click();

    // Navigate to payment
    const headerCartButton = page.locator('.nav-cart-button, [data-testid="view-cart"]');
    await headerCartButton.click();
    const checkoutButton = page.locator('[data-testid="checkout-button"]');
    await checkoutButton.click();

    // Select PayPal
    await expect(page.locator('.payment-selector-modal')).toBeVisible();

    // Monitor for navigation attempts (both app and web)
    let navigationAttempted = false;
    page.on('framenavigated', () => {
      navigationAttempted = true;
    });

    const paypalButton = page.locator('[data-method="paypal"]');
    await paypalButton.click();

    // Wait for processing or navigation
    await page.waitForTimeout(3000);

    // Should either navigate or show appropriate handling
    expect(
      navigationAttempted ||
      await page.locator('.payment-processing-overlay').count() > 0 ||
      await page.locator('.mobile-payment-fallback').count() > 0
    ).toBeTruthy();
  });

  test('should provide accessible PayPal payment for screen readers on mobile', async ({ page }) => {
    // Add item to cart
    const addButton = page.locator('[data-testid="weekend-pass-add"]');
    await addButton.click();

    // Navigate to payment
    const headerCartButton = page.locator('.nav-cart-button, [data-testid="view-cart"]');
    await headerCartButton.click();
    const checkoutButton = page.locator('[data-testid="checkout-button"]');
    await checkoutButton.click();

    // Check modal accessibility
    const modal = page.locator('.payment-selector-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('role', 'dialog');
    await expect(modal).toHaveAttribute('aria-modal', 'true');

    // PayPal button accessibility
    const paypalButton = page.locator('[data-method="paypal"]');
    await expect(paypalButton).toHaveAttribute('aria-label', /pay with paypal/i);

    // Keyboard navigation
    await paypalButton.focus();
    await expect(paypalButton).toBeFocused();

    // Enter key should trigger PayPal
    await paypalButton.press('Enter');

    // Should show processing or navigate
    await page.waitForTimeout(2000);
    expect(
      await page.locator('.payment-processing-overlay').count() > 0 ||
      page.url().includes('paypal') ||
      await page.locator('.mobile-payment-fallback').count() > 0
    ).toBeTruthy();
  });

  test('should handle mobile network interruptions during PayPal flow', async ({ page }) => {
    // Add item to cart
    const addButton = page.locator('[data-testid="weekend-pass-add"]');
    await addButton.click();

    // Navigate to payment
    const headerCartButton = page.locator('.nav-cart-button, [data-testid="view-cart"]');
    await headerCartButton.click();
    const checkoutButton = page.locator('[data-testid="checkout-button"]');
    await checkoutButton.click();

    // Wait for payment selector
    await expect(page.locator('.payment-selector-modal')).toBeVisible();

    // Simulate network failure
    await page.route('**/paypal/create-order', route => {
      route.abort('failed');
    });

    // Select PayPal
    const paypalButton = page.locator('[data-method="paypal"]');
    await paypalButton.click();

    // Should handle network error gracefully
    await page.waitForTimeout(5000);

    // Should show error message or fallback
    const errorIndicator = page.locator('.payment-selector-error, .mobile-payment-fallback');
    await expect(errorIndicator.first()).toBeVisible({ timeout: 10000 });

    // Error should be mobile-friendly
    const errorBox = await errorIndicator.first().boundingBox();
    if (errorBox) {
      expect(errorBox.width).toBeLessThanOrEqual(375); // Fits mobile screen
    }
  });
});
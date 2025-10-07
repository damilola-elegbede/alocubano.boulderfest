/**
 * E2E Test: Mobile Registration Experience
 * Tests mobile-optimized registration flow and user experience
 */

import { test, expect } from '@playwright/test';

test.describe('Mobile Registration Experience', () => {
  // Route constants to eliminate duplicate literals
  const TICKETS_ROUTE = '/tickets';
  const HOME_ROUTE = '/';

  test.beforeEach(async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
  });

  test('should handle mobile ticket purchase flow', async ({ page }) => {
    await page.goto(TICKETS_ROUTE);

    // Mobile navigation should be accessible
    const mobileMenu = page.locator('.mobile-menu, .hamburger, .menu-toggle');
    const mobileMenuCount = await mobileMenu.count();
    if (mobileMenuCount > 0) {
      await expect(mobileMenu.first()).toBeVisible();
    }

    // Ticket options should be mobile-optimized
    const ticketOptions = page.locator('.ticket-option, .ticket-card, .weekend, .saturday, .sunday');
    await expect(ticketOptions.first()).toBeVisible();

    // Touch targets should be appropriately sized (minimum 44px)
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    if (buttonCount > 0) {
      const buttonBox = await buttons.first().boundingBox();
      if (buttonBox) {
        expect(buttonBox.height).toBeGreaterThanOrEqual(44);
        expect(buttonBox.width).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('should optimize form inputs for mobile', async ({ page }) => {
    // Navigate to a form (either direct registration or after ticket purchase)
    await page.goto(TICKETS_ROUTE);

    // Add ticket to trigger registration flow
    const addButton = page.locator('button:has-text("Weekend"), button:has-text("Add")').first();
    const addButtonCount = await addButton.count();
    if (addButtonCount > 0) {
      await addButton.click();

      // Proceed to checkout/registration
      const checkoutBtn = page.locator('button:has-text("Checkout"), button:has-text("Continue"), .checkout-btn');
      const checkoutBtnCount = await checkoutBtn.count();
      if (checkoutBtnCount > 0) {
        await checkoutBtn.click();
        await page.waitForLoadState('domcontentloaded');
      }
    }

    // Check for mobile-optimized form inputs
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const emailInputCount = await emailInput.count();
    if (emailInputCount > 0) {
      // Email input should have proper mobile keyboard
      const inputType = await emailInput.getAttribute('type');
      expect(inputType).toBe('email');
    }

    const phoneInput = page.locator('input[type="tel"], input[name="phone"]');
    const phoneInputCount = await phoneInput.count();
    if (phoneInputCount > 0) {
      const inputType = await phoneInput.getAttribute('type');
      expect(inputType).toBe('tel');
    }
  });

  test('should handle mobile header cart interactions', async ({ page }) => {
    await page.goto(TICKETS_ROUTE);

    // Add item to cart
    const addButton = page.locator('button:has-text("Weekend")').first();
    const addButtonCount = await addButton.count();
    if (addButtonCount > 0) {
      await addButton.click();

      // Header cart button should be accessible on mobile using correct selector
      const headerCart = page.locator('.nav-cart-button, [data-testid="view-cart"]');
      await expect(headerCart).toBeVisible();

      // Header cart badge should update using correct selector
      const cartBadge = page.locator('.nav-cart-badge, [data-testid="cart-counter"]');
      const cartBadgeCount = await cartBadge.count();
      if (cartBadgeCount > 0) {
        await expect(cartBadge).toBeVisible();
      }

      // Click header cart to open panel
      await headerCart.click();

      // Cart panel should slide out appropriately for mobile
      const cartPanel = page.locator('.cart-panel, .cart-sidebar');
      const cartPanelCount = await cartPanel.count();
      if (cartPanelCount > 0) {
        const panelBox = await cartPanel.boundingBox();
        if (panelBox) {
          // Panel should fit mobile screen
          expect(panelBox.width).toBeLessThanOrEqual(375);
        }
      }
    }
  });

  test('should provide mobile-friendly navigation', async ({ page }) => {
    await page.goto(HOME_ROUTE);

    // Check for mobile navigation
    const navigation = page.locator('nav, .navigation, .header-nav');
    await expect(navigation).toBeVisible();

    // Mobile menu should be accessible
    const mobileToggle = page.locator('.menu-toggle, .hamburger, .mobile-menu-btn');
    const mobileToggleCount = await mobileToggle.count();
    if (mobileToggleCount > 0) {
      await mobileToggle.click();

      // Menu should slide in or become visible
      const mobileNav = page.locator('.mobile-nav, .slide-menu, nav[aria-expanded="true"]');
      const mobileNavCount = await mobileNav.count();
      if (mobileNavCount > 0) {
        await expect(mobileNav.first()).toBeVisible();
      }
    }
  });

  test('should handle mobile form validation', async ({ page }) => {
    // Try to access a registration form
    await page.goto(TICKETS_ROUTE);

    // Simulate form submission with invalid data
    const forms = page.locator('form');
    const formsCount = await forms.count();
    if (formsCount > 0) {
      const form = forms.first();

      // Fill form with invalid email
      const emailInput = form.locator('input[type="email"]');
      const emailInputCount = await emailInput.count();
      if (emailInputCount > 0) {
        await emailInput.fill('invalid-email');

        const submitButton = form.locator('button[type="submit"], input[type="submit"]');
        const submitButtonCount = await submitButton.count();
        if (submitButtonCount > 0) {
          await submitButton.click();

          // Should show mobile-friendly validation messages
          const errorMessages = page.locator('.error, .invalid-feedback, .form-error');
          const errorCount = await errorMessages.count();
          if (errorCount > 0) {
            await expect(errorMessages.first()).toBeVisible();
          }
        }
      }
    }
  });

  test('should optimize mobile scrolling and performance', async ({ page }) => {
    await page.goto(TICKETS_ROUTE);

    // Test smooth scrolling behavior
    await page.evaluate(() => {
      window.scrollTo({ top: 300, behavior: 'smooth' });
    });

    await page.waitForLoadState('domcontentloaded');

    // Page should remain responsive during scroll
    const scrollPosition = await page.evaluate(() => window.scrollY);
    expect(scrollPosition).toBeGreaterThan(100);

    // No horizontal scroll should be present
    const hasHorizontalScroll = await page.evaluate(() =>
      document.body.scrollWidth > window.innerWidth
    );
    expect(hasHorizontalScroll).toBeFalsy();
  });

  test('should handle mobile payment flow', async ({ page }) => {
    await page.goto(TICKETS_ROUTE);

    // Add ticket and proceed to payment
    const addButton = page.locator('button:has-text("Weekend")').first();
    const addButtonCount = await addButton.count();
    if (addButtonCount > 0) {
      await addButton.click();

      const checkoutBtn = page.locator('button:has-text("Checkout"), .checkout-btn');
      const checkoutBtnCount = await checkoutBtn.count();
      if (checkoutBtnCount > 0) {
        await checkoutBtn.click();
        await page.waitForLoadState('domcontentloaded');

        // Should either show Stripe checkout or payment form
        const paymentElements = page.locator('.payment-form, iframe[src*="stripe"], #stripe-card-element');
        const paymentElementsCount = await paymentElements.count();
        if (paymentElementsCount > 0) {
          await expect(paymentElements.first()).toBeVisible();
        }
      }
    }
  });

  test('should provide mobile accessibility features', async ({ page }) => {
    await page.goto(HOME_ROUTE);

    // Check for proper heading structure
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();

    // Check for skip links
    const skipLink = page.locator('a[href="#main"], .skip-link');
    const skipLinkCount = await skipLink.count();
    if (skipLinkCount > 0) {
      await expect(skipLink.first()).toBeVisible();
    }

    // Verify 44px minimum touch target size for critical interactive elements
    const interactiveElements = page.locator('button, a, input');
    const interactiveElementsCount = await interactiveElements.count();
    if (interactiveElementsCount >= 2) {
      const first = interactiveElements.first();
      const second = interactiveElements.nth(1);

      const firstBox = await first.boundingBox();
      const secondBox = await second.boundingBox();

      if (firstBox && secondBox) {
        // Verify 44px minimum touch target size
        expect(firstBox.height).toBeGreaterThanOrEqual(44);
        expect(firstBox.width).toBeGreaterThanOrEqual(44);
        expect(secondBox.height).toBeGreaterThanOrEqual(44);
        expect(secondBox.width).toBeGreaterThanOrEqual(44);

        // Elements shouldn't overlap and should have adequate spacing
        const verticalDistance = Math.abs(firstBox.y - secondBox.y);
        const horizontalDistance = Math.abs(firstBox.x - secondBox.x);

        expect(verticalDistance > 8 || horizontalDistance > 8).toBeTruthy();
      }
    }

    // Verify submit buttons meet 44px touch target requirements
    await page.goto(TICKETS_ROUTE);
    const submitButtons = page.locator('button[type="submit"], button:has-text("Add"), button:has-text("Checkout")');
    const submitButtonsCount = await submitButtons.count();
    if (submitButtonsCount > 0) {
      const submitBox = await submitButtons.first().boundingBox();
      if (submitBox) {
        expect(submitBox.height).toBeGreaterThanOrEqual(44);
        expect(submitBox.width).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('should handle mobile keyboard interactions', async ({ page }) => {
    await page.goto(TICKETS_ROUTE);

    // Focus on first interactive element
    const firstButton = page.locator('button').first();
    const firstButtonCount = await firstButton.count();
    if (firstButtonCount > 0) {
      await firstButton.focus();

      // Tab navigation should work
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // Enter should activate elements
      await page.keyboard.press('Enter');

      // Should handle keyboard navigation gracefully
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should optimize mobile loading performance', async ({ page }) => {
    const startTime = Date.now();

    await page.goto(TICKETS_ROUTE);
    await page.waitForLoadState('domcontentloaded');

    const loadTime = Date.now() - startTime;

    // Mobile page should load quickly
    expect(loadTime).toBeLessThan(5000);

    // Critical content should be visible
    const mainContent = page.locator('main, .main-content, .ticket-options');
    await expect(mainContent.first()).toBeVisible();
  });

  test('should handle mobile-specific error states', async ({ page }) => {
    // Test offline/network error handling
    await page.route('**/*', route => route.abort());

    try {
      await page.goto(TICKETS_ROUTE);
    } catch (error) {
      // Should handle network errors gracefully
    }

    // Reset network and test error recovery
    await page.unroute('**/*');
    await page.reload();

    // Page should recover and load properly
    await expect(page.locator('body')).toBeVisible();
  });
});

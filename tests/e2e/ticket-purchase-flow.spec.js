/**
 * E2E Tests for Ticket Purchase Flow
 * Tests complete purchase journey from ticket selection to confirmation
 */

import { test, expect } from "@playwright/test";
import { injectAxe, checkA11y } from "@axe-core/playwright";

test.describe("Ticket Purchase Flow", () => {
  let baseURL;

  test.beforeAll(() => {
    baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
  });

  test.beforeEach(async ({ page }) => {
    // Clear any existing cart data
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test.describe("Happy Path - Complete Purchase Flow", () => {
    test("should complete full ticket purchase journey", async ({ page }) => {
      // Step 1: Navigate to tickets page
      await page.goto("/pages/tickets.html");
      await page.waitForLoadState("networkidle");

      // Verify page loaded correctly
      await expect(page.locator("h1")).toContainText("Tickets");
      await expect(
        page.locator('[data-testid="ticket-options"]'),
      ).toBeVisible();

      // Step 2: Select ticket type and quantity
      const weekendPassButton = page.locator(
        '[data-testid="weekend-pass-add"]',
      );
      await expect(weekendPassButton).toBeVisible();
      await weekendPassButton.click();

      // Verify cart updates
      const cartCounter = page.locator('[data-testid="cart-counter"]');
      await expect(cartCounter).toContainText("1");

      // Step 3: Add additional tickets
      await weekendPassButton.click(); // Add second ticket
      await expect(cartCounter).toContainText("2");

      // Step 4: Proceed to checkout
      const checkoutButton = page.locator('[data-testid="checkout-button"]');
      await expect(checkoutButton).toBeVisible();
      await checkoutButton.click();

      // Step 5: Fill customer information
      await page.waitForSelector('[data-testid="customer-form"]');

      await page.fill('[data-testid="customer-name"]', "Test User");
      await page.fill('[data-testid="customer-email"]', "test@example.com");
      await page.fill('[data-testid="customer-phone"]', "+1234567890");

      // Step 6: Proceed to payment
      const proceedToPaymentButton = page.locator(
        '[data-testid="proceed-to-payment"]',
      );
      await expect(proceedToPaymentButton).toBeEnabled();
      await proceedToPaymentButton.click();

      // Step 7: Verify redirect to Stripe (in test mode, check URL contains stripe)
      await page.waitForURL("**/create-checkout-session*", { timeout: 10000 });

      // Verify we're being redirected to payment processor
      const currentUrl = page.url();
      expect(currentUrl).toContain("/api/payments/create-checkout-session");
    });

    test("should handle cart persistence across page navigation", async ({
      page,
    }) => {
      // Add item to cart
      await page.goto("/pages/tickets.html");
      await page.waitForLoadState("networkidle");

      const addButton = page.locator('[data-testid="weekend-pass-add"]');
      await addButton.click();

      // Navigate away and back
      await page.goto("/pages/about.html");
      await page.goto("/pages/tickets.html");

      // Verify cart persists
      const cartCounter = page.locator('[data-testid="cart-counter"]');
      await expect(cartCounter).toContainText("1");
    });
  });

  test.describe("Error Scenarios", () => {
    test("should handle out of stock scenario", async ({ page }) => {
      // Mock API response for out of stock
      await page.route("**/api/tickets/**", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            available: false,
            message: "This ticket type is currently sold out",
          }),
        });
      });

      await page.goto("/pages/tickets.html");

      // Verify out of stock message displays
      const outOfStockMessage = page.locator('[data-testid="out-of-stock"]');
      await expect(outOfStockMessage).toBeVisible();
      await expect(outOfStockMessage).toContainText("sold out");

      // Verify add button is disabled
      const addButton = page.locator('[data-testid="weekend-pass-add"]');
      await expect(addButton).toBeDisabled();
    });

    test("should handle payment processing errors", async ({ page }) => {
      // Add item to cart
      await page.goto("/pages/tickets.html");
      const addButton = page.locator('[data-testid="weekend-pass-add"]');
      await addButton.click();

      // Mock payment API failure
      await page.route("**/api/payments/create-checkout-session", (route) => {
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Payment processing temporarily unavailable",
          }),
        });
      });

      // Proceed to checkout
      const checkoutButton = page.locator('[data-testid="checkout-button"]');
      await checkoutButton.click();

      // Fill form and submit
      await page.fill('[data-testid="customer-name"]', "Test User");
      await page.fill('[data-testid="customer-email"]', "test@example.com");
      await page.fill('[data-testid="customer-phone"]', "+1234567890");

      const proceedButton = page.locator('[data-testid="proceed-to-payment"]');
      await proceedButton.click();

      // Verify error message displays
      const errorMessage = page.locator('[data-testid="payment-error"]');
      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toContainText(
        "Payment processing temporarily unavailable",
      );
    });

    test("should validate customer information form", async ({ page }) => {
      await page.goto("/pages/tickets.html");

      // Add item to cart
      const addButton = page.locator('[data-testid="weekend-pass-add"]');
      await addButton.click();

      // Proceed to checkout
      const checkoutButton = page.locator('[data-testid="checkout-button"]');
      await checkoutButton.click();

      // Try to submit without required fields
      const proceedButton = page.locator('[data-testid="proceed-to-payment"]');
      await proceedButton.click();

      // Verify validation errors
      await expect(page.locator('[data-testid="name-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="email-error"]')).toBeVisible();

      // Fill invalid email
      await page.fill('[data-testid="customer-name"]', "Test User");
      await page.fill('[data-testid="customer-email"]', "invalid-email");
      await proceedButton.click();

      await expect(page.locator('[data-testid="email-error"]')).toContainText(
        "valid email",
      );
    });
  });

  test.describe("Cart Management", () => {
    test("should allow quantity changes in cart", async ({ page }) => {
      await page.goto("/pages/tickets.html");

      // Add multiple items
      const addButton = page.locator('[data-testid="weekend-pass-add"]');
      await addButton.click();
      await addButton.click();
      await addButton.click();

      // Open cart details
      const cartButton = page.locator('[data-testid="view-cart"]');
      await cartButton.click();

      // Increase quantity
      const increaseButton = page
        .locator('[data-testid="quantity-increase"]')
        .first();
      await increaseButton.click();

      await expect(page.locator('[data-testid="cart-counter"]')).toContainText(
        "4",
      );

      // Decrease quantity
      const decreaseButton = page
        .locator('[data-testid="quantity-decrease"]')
        .first();
      await decreaseButton.click();

      await expect(page.locator('[data-testid="cart-counter"]')).toContainText(
        "3",
      );
    });

    test("should allow item removal from cart", async ({ page }) => {
      await page.goto("/pages/tickets.html");

      // Add items
      const weekendButton = page.locator('[data-testid="weekend-pass-add"]');
      const dayPassButton = page.locator('[data-testid="day-pass-add"]');

      await weekendButton.click();
      await dayPassButton.click();

      await expect(page.locator('[data-testid="cart-counter"]')).toContainText(
        "2",
      );

      // Open cart and remove item
      await page.locator('[data-testid="view-cart"]').click();
      await page.locator('[data-testid="remove-item"]').first().click();

      await expect(page.locator('[data-testid="cart-counter"]')).toContainText(
        "1",
      );
    });

    test("should clear entire cart", async ({ page }) => {
      await page.goto("/pages/tickets.html");

      // Add items
      const addButton = page.locator('[data-testid="weekend-pass-add"]');
      await addButton.click();
      await addButton.click();

      // Clear cart
      await page.locator('[data-testid="view-cart"]').click();
      await page.locator('[data-testid="clear-cart"]').click();

      // Confirm clear
      await page.locator('[data-testid="confirm-clear"]').click();

      await expect(page.locator('[data-testid="cart-counter"]')).toContainText(
        "0",
      );
    });
  });

  test.describe("Mobile Experience", () => {
    test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE

    test("should work on mobile viewport", async ({ page }) => {
      await page.goto("/pages/tickets.html");

      // Verify mobile layout
      const mobileNav = page.locator('[data-testid="mobile-nav-toggle"]');
      await expect(mobileNav).toBeVisible();

      // Test ticket selection on mobile
      const addButton = page.locator('[data-testid="weekend-pass-add"]');
      await addButton.click();

      // Verify mobile cart
      const floatingCart = page.locator('[data-testid="floating-cart"]');
      await expect(floatingCart).toBeVisible();

      // Test mobile checkout flow
      await page.locator('[data-testid="checkout-button"]').click();

      // Verify mobile form layout
      const form = page.locator('[data-testid="customer-form"]');
      await expect(form).toBeVisible();
    });
  });

  test.describe("Accessibility", () => {
    test("should be accessible during purchase flow", async ({ page }) => {
      await page.goto("/pages/tickets.html");
      await injectAxe(page);

      // Check initial accessibility
      await checkA11y(page, null, {
        detailedReport: true,
        detailedReportOptions: { html: true },
      });

      // Add item and check accessibility
      await page.locator('[data-testid="weekend-pass-add"]').click();
      await checkA11y(page);

      // Check checkout form accessibility
      await page.locator('[data-testid="checkout-button"]').click();
      await checkA11y(page);
    });

    test("should support keyboard navigation", async ({ page }) => {
      await page.goto("/pages/tickets.html");

      // Navigate using keyboard
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");

      // Verify focus is on add button
      const focusedElement = await page.evaluateHandle(
        () => document.activeElement,
      );
      const tagName = await focusedElement.evaluate((el) =>
        el.tagName.toLowerCase(),
      );
      expect(tagName).toBe("button");

      // Add item using keyboard
      await page.keyboard.press("Enter");

      await expect(page.locator('[data-testid="cart-counter"]')).toContainText(
        "1",
      );
    });
  });

  test.describe("Performance", () => {
    test("should load quickly and respond to interactions", async ({
      page,
    }) => {
      const startTime = Date.now();

      await page.goto("/pages/tickets.html");
      await page.waitForLoadState("networkidle");

      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(3000); // Page should load within 3 seconds

      // Test interaction responsiveness
      const interactionStart = Date.now();
      await page.locator('[data-testid="weekend-pass-add"]').click();
      await page.waitForSelector('[data-testid="cart-counter"]');

      const interactionTime = Date.now() - interactionStart;
      expect(interactionTime).toBeLessThan(500); // Interaction should respond within 500ms
    });
  });

  test.describe("Cross-browser Compatibility", () => {
    ["chromium", "firefox", "webkit"].forEach((browserName) => {
      test(`should work in ${browserName}`, async ({
        page,
        browserName: currentBrowser,
      }) => {
        test.skip(
          currentBrowser !== browserName,
          `Skipping ${browserName} test`,
        );

        await page.goto("/pages/tickets.html");

        // Basic functionality test
        const addButton = page.locator('[data-testid="weekend-pass-add"]');
        await addButton.click();

        await expect(
          page.locator('[data-testid="cart-counter"]'),
        ).toContainText("1");
      });
    });
  });
});

/**
 * E2E Tests for Email Newsletter Signup
 * Tests the complete user flow from frontend to backend
 */

const { test, expect } = require("@playwright/test");

test.describe("Email Newsletter Signup E2E", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to contact page
    await page.goto("/contact");

    // Wait for the newsletter form to be visible
    await page.waitForSelector("#newsletter-form", { state: "visible" });
  });

  test("should display newsletter signup form", async ({ page }) => {
    // Check that all form elements are present
    await expect(page.locator("#newsletter-form")).toBeVisible();
    await expect(page.locator("#newsletter-email")).toBeVisible();
    await expect(page.locator(".newsletter-submit")).toBeVisible();
    await expect(page.locator('input[name="consent"]')).toBeVisible();

    // Check form labels and placeholders
    await expect(page.locator("#newsletter-email")).toHaveAttribute(
      "placeholder",
      "YOUR EMAIL ADDRESS",
    );
    await expect(page.locator(".newsletter-submit .button-text")).toHaveText(
      "SUBSCRIBE",
    );
    await expect(page.locator(".checkbox-label")).toContainText(
      "I agree to receive marketing emails",
    );
  });

  test("should successfully subscribe to newsletter with valid data", async ({
    page,
  }) => {
    // Mock the API response
    await page.route("/api/email/subscribe", async (route) => {
      const request = route.request();
      const postData = JSON.parse(request.postData());

      expect(postData).toMatchObject({
        email: "test@example.com",
        source: "contact_page",
        consentToMarketing: true,
      });

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "Successfully subscribed to newsletter",
          subscriber: {
            email: "test@example.com",
            status: "active",
            requiresVerification: false,
          },
        }),
      });
    });

    // Fill in the form
    await page.fill("#newsletter-email", "test@example.com");
    await page.check('input[name="consent"]');

    // Submit the form
    await page.click(".newsletter-submit");

    // Wait for success message
    await expect(page.locator(".newsletter-success")).toBeVisible();
    await expect(page.locator(".newsletter-success .success-text")).toHaveText(
      "Welcome to the A Lo Cubano family!",
    );

    // Verify form was reset
    await expect(page.locator("#newsletter-email")).toHaveValue("");
    await expect(page.locator('input[name="consent"]')).not.toBeChecked();
  });

  test("should validate email format", async ({ page }) => {
    // Try to submit with invalid email
    await page.fill("#newsletter-email", "invalid-email");
    await page.check('input[name="consent"]');
    await page.click(".newsletter-submit");

    // Check for error message
    await expect(page.locator("#newsletter-error")).toBeVisible();
    await expect(page.locator("#newsletter-error")).toContainText(
      "valid email",
    );

    // Verify error styling
    await expect(page.locator(".newsletter-input-wrapper")).toHaveClass(
      /error/,
    );
    await expect(page.locator("#newsletter-email")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  test("should require email address", async ({ page }) => {
    // Try to submit without email
    await page.check('input[name="consent"]');
    await page.click(".newsletter-submit");

    // Check for error message
    await expect(page.locator("#newsletter-error")).toBeVisible();
    await expect(page.locator("#newsletter-error")).toContainText(
      "Please enter your email address",
    );
  });

  test("should require consent checkbox", async ({ page }) => {
    // Fill email but don't check consent
    await page.fill("#newsletter-email", "test@example.com");
    await page.click(".newsletter-submit");

    // Check for error message
    await expect(page.locator("#newsletter-error")).toBeVisible();
    await expect(page.locator("#newsletter-error")).toContainText("agree");
  });

  test("should clear errors when user corrects input", async ({ page }) => {
    // Trigger an error first
    await page.fill("#newsletter-email", "invalid-email");
    await page.check('input[name="consent"]');
    await page.click(".newsletter-submit");

    // Verify error is shown
    await expect(page.locator("#newsletter-error")).toBeVisible();

    // Start typing in email field
    await page.fill("#newsletter-email", "test@example.com");

    // Error should be cleared
    await expect(page.locator("#newsletter-error")).not.toBeVisible();
    await expect(page.locator(".newsletter-input-wrapper")).not.toHaveClass(
      /error/,
    );
    await expect(page.locator("#newsletter-email")).toHaveAttribute(
      "aria-invalid",
      "false",
    );
  });

  test("should show loading state during submission", async ({ page }) => {
    // Mock a delayed API response
    await page.route("/api/email/subscribe", async (route) => {
      // Delay response to see loading state
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "Successfully subscribed to newsletter",
        }),
      });
    });

    // Fill and submit form
    await page.fill("#newsletter-email", "test@example.com");
    await page.check('input[name="consent"]');
    await page.click(".newsletter-submit");

    // Check loading state
    await expect(page.locator(".newsletter-submit")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(page.locator(".newsletter-submit")).toBeDisabled();
    await expect(page.locator("#newsletter-email")).toHaveAttribute("readonly");
    await expect(page.locator('input[name="consent"]')).toBeDisabled();

    // Wait for loading to finish
    await expect(page.locator(".newsletter-success")).toBeVisible();

    // Check loading state is cleared
    await expect(page.locator(".newsletter-submit")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await expect(page.locator(".newsletter-submit")).not.toBeDisabled();
  });

  test("should handle duplicate email subscription", async ({ page }) => {
    // Mock duplicate error response
    await page.route("/api/email/subscribe", async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: "This email address is already subscribed to our newsletter",
        }),
      });
    });

    // Fill and submit form
    await page.fill("#newsletter-email", "existing@example.com");
    await page.check('input[name="consent"]');
    await page.click(".newsletter-submit");

    // Check for error message
    await expect(page.locator("#newsletter-error")).toBeVisible();
    await expect(page.locator("#newsletter-error")).toContainText(
      "already subscribed",
    );
  });

  test("should handle server errors gracefully", async ({ page }) => {
    // Mock server error response
    await page.route("/api/email/subscribe", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error:
            "An error occurred while processing your subscription. Please try again.",
        }),
      });
    });

    // Fill and submit form
    await page.fill("#newsletter-email", "test@example.com");
    await page.check('input[name="consent"]');
    await page.click(".newsletter-submit");

    // Check for error message
    await expect(page.locator("#newsletter-error")).toBeVisible();
    await expect(page.locator("#newsletter-error")).toContainText(
      "error occurred",
    );
  });

  test("should handle network errors", async ({ page }) => {
    // Mock network failure
    await page.route("/api/email/subscribe", async (route) => {
      await route.abort("failed");
    });

    // Fill and submit form
    await page.fill("#newsletter-email", "test@example.com");
    await page.check('input[name="consent"]');
    await page.click(".newsletter-submit");

    // Check for network error message
    await expect(page.locator("#newsletter-error")).toBeVisible();
    await expect(page.locator("#newsletter-error")).toContainText(
      "Network error",
    );
  });

  test("should auto-hide success message after 10 seconds", async ({
    page,
  }) => {
    // Mock successful response
    await page.route("/api/email/subscribe", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "Successfully subscribed to newsletter",
        }),
      });
    });

    // Fill and submit form
    await page.fill("#newsletter-email", "test@example.com");
    await page.check('input[name="consent"]');
    await page.click(".newsletter-submit");

    // Success message should be visible
    await expect(page.locator(".newsletter-success")).toBeVisible();

    // Wait for auto-hide (using shorter timeout for test)
    await page.waitForTimeout(11000);

    // Success message should be hidden
    await expect(page.locator(".newsletter-success")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  test("should be accessible via keyboard navigation", async ({ page }) => {
    // Navigate to email field with Tab
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    // Email field should be focused
    await expect(page.locator("#newsletter-email")).toBeFocused();

    // Type email
    await page.keyboard.type("test@example.com");

    // Tab to consent checkbox
    await page.keyboard.press("Tab");
    await expect(page.locator('input[name="consent"]')).toBeFocused();

    // Check consent with Space
    await page.keyboard.press("Space");
    await expect(page.locator('input[name="consent"]')).toBeChecked();

    // Tab to submit button
    await page.keyboard.press("Tab");
    await expect(page.locator(".newsletter-submit")).toBeFocused();

    // Mock successful response
    await page.route("/api/email/subscribe", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "Successfully subscribed to newsletter",
        }),
      });
    });

    // Submit with Enter
    await page.keyboard.press("Enter");

    // Success message should appear
    await expect(page.locator(".newsletter-success")).toBeVisible();
  });

  test("should track Google Analytics event on successful signup", async ({
    page,
  }) => {
    // Mock gtag function
    await page.addInitScript(() => {
      window.gtagEvents = [];
      window.gtag = function (type, event, params) {
        window.gtagEvents.push({ type, event, params });
      };
    });

    // Mock successful response
    await page.route("/api/email/subscribe", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "Successfully subscribed to newsletter",
        }),
      });
    });

    // Fill and submit form
    await page.fill("#newsletter-email", "test@example.com");
    await page.check('input[name="consent"]');
    await page.click(".newsletter-submit");

    // Wait for success
    await expect(page.locator(".newsletter-success")).toBeVisible();

    // Check that analytics event was tracked
    const gtagEvents = await page.evaluate(() => window.gtagEvents);
    expect(gtagEvents).toContainEqual({
      type: "event",
      event: "newsletter_signup",
      params: {
        event_category: "engagement",
        event_label: "contact_page",
      },
    });
  });

  test("should be mobile responsive", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Check that form is still visible and usable
    await expect(page.locator("#newsletter-form")).toBeVisible();
    await expect(page.locator("#newsletter-email")).toBeVisible();
    await expect(page.locator(".newsletter-submit")).toBeVisible();

    // Check that input layout changes for mobile
    const inputWrapper = page.locator(".newsletter-input-wrapper");
    const flexDirection = await inputWrapper.evaluate(
      (el) => window.getComputedStyle(el).flexDirection,
    );
    expect(flexDirection).toBe("column");

    // Form should still work on mobile
    await page.fill("#newsletter-email", "mobile@example.com");
    await page.check('input[name="consent"]');

    // Mock successful response
    await page.route("/api/email/subscribe", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "Successfully subscribed to newsletter",
        }),
      });
    });

    await page.click(".newsletter-submit");

    // Success message should appear
    await expect(page.locator(".newsletter-success")).toBeVisible();
  });
});

/**
 * E2E Tests for Email Newsletter Signup
 * Tests the complete user flow from frontend to backend
 */

import { test, expect } from "@playwright/test";

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
    // The actual checkbox is hidden, check for the custom checkbox label
    await expect(page.locator('.custom-checkbox')).toBeVisible();

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
    // Force native checkbox interaction to handle custom styling
    await page.locator('input[name="consent"]').evaluate(el => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Submit the form
    await page.click(".newsletter-submit");

    // Wait for success message
    await expect(page.locator(".newsletter-success")).toBeVisible();
    await expect(page.locator(".newsletter-success .success-text")).toHaveText(
      "Welcome to the A Lo Cubano family!",
    );

    // Verify form was reset
    await expect(page.locator("#newsletter-email")).toHaveValue("");
    // Check if the hidden checkbox is unchecked (force: true to check hidden element)
    await expect(page.locator('input[name="consent"]')).not.toBeChecked();
  });

  test("should validate email format", async ({ page }) => {
    // Try to submit with invalid email
    await page.fill("#newsletter-email", "invalid-email");
    // Force native checkbox interaction
    await page.locator('input[name="consent"]').evaluate(el => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    
    // The button should still be disabled due to invalid email
    await expect(page.locator(".newsletter-submit")).toBeDisabled();
    
    // Trigger validation by blurring the email field
    await page.locator("#newsletter-email").blur();
    
    // Wait a moment for validation to complete
    await page.waitForTimeout(100);

    // Check for error message
    await expect(page.locator("#newsletter-error")).toBeVisible();
    await expect(page.locator("#newsletter-error")).toContainText(
      "valid email",
    );

    // Verify error styling - wait for class to be added
    await page.waitForFunction(
      () => document.querySelector('.newsletter-input-wrapper')?.classList.contains('error'),
      { timeout: 2000 }
    );
    await expect(page.locator("#newsletter-email")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  test("should require email address", async ({ page }) => {
    // Try to submit without email - force native checkbox interaction
    await page.locator('input[name="consent"]').evaluate(el => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    
    // The button should be disabled without a valid email
    await expect(page.locator(".newsletter-submit")).toBeDisabled();
    
    // Focus and blur the email field to trigger validation
    await page.locator("#newsletter-email").focus();
    await page.locator("#newsletter-email").blur();

    // Check for error message
    await expect(page.locator("#newsletter-error")).toBeVisible();
    await expect(page.locator("#newsletter-error")).toContainText(
      "Please enter your email address",
    );
  });

  test("should require consent checkbox", async ({ page }) => {
    // Fill email but don't check consent
    await page.fill("#newsletter-email", "test@example.com");
    
    // The button should be disabled without consent
    await expect(page.locator(".newsletter-submit")).toBeDisabled();
    
    // Verify button state changes when checkbox is toggled
    await page.locator('input[name="consent"]').evaluate(el => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator(".newsletter-submit")).not.toBeDisabled();
    
    // Uncheck and verify button is disabled again
    await page.locator('input[name="consent"]').evaluate(el => {
      el.checked = false;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator(".newsletter-submit")).toBeDisabled();
  });

  test("should clear errors when user corrects input", async ({ page }) => {
    // Trigger an error first
    await page.fill("#newsletter-email", "invalid-email");
    // Force native checkbox interaction
    await page.locator('input[name="consent"]').evaluate(el => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
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
    await page.locator('input[name="consent"]').evaluate(el => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.click(".newsletter-submit");

    // Check loading state
    await expect(page.locator(".newsletter-submit")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(page.locator(".newsletter-submit")).toBeDisabled();
    await expect(page.locator("#newsletter-email")).toHaveAttribute("readonly");
    // Check the hidden input is disabled
    await expect(page.locator('input[name="consent"]')).toBeDisabled();

    // Wait for loading to finish
    await expect(page.locator(".newsletter-success")).toBeVisible();

    // Check loading state is cleared
    await expect(page.locator(".newsletter-submit")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    // After success, form resets so button should be disabled (no consent)
    await expect(page.locator(".newsletter-submit")).toBeDisabled();
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
    await page.locator('input[name="consent"]').evaluate(el => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
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
    await page.locator('input[name="consent"]').evaluate(el => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
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
    await page.locator('input[name="consent"]').evaluate(el => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
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
    await page.locator('input[name="consent"]').evaluate(el => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
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

    // Tab to consent checkbox - the custom checkbox label should be focusable
    await page.keyboard.press("Tab");
    // The focus should be on the hidden input, but we check via the custom checkbox
    await expect(page.locator('input[name="consent"]')).toBeFocused();

    // Check consent with Space
    await page.keyboard.press("Space");
    // Verify the hidden checkbox is checked
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
    await page.locator('input[name="consent"]').evaluate(el => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
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
    await page.locator('input[name="consent"]').evaluate(el => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
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

    await page.click(".newsletter-submit");

    // Success message should appear
    await expect(page.locator(".newsletter-success")).toBeVisible();
  });
});

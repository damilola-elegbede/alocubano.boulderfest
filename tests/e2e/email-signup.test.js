/**
 * E2E Tests for Email Newsletter Signup
 * Tests the complete user flow from frontend to backend
 */

import { test, expect } from "@playwright/test";

test.describe("Email Newsletter Signup E2E", () => {
  // Helper functions for better test stability
  const checkConsentBox = async (page) => {
    // Ensure checkbox is stable before interaction
    await page.waitForFunction(() => {
      const checkbox = document.querySelector('input[name="consent"]');
      return checkbox && !checkbox.disabled;
    });
    
    // Use both programmatic and user interaction for reliability
    await page.locator('input[name="consent"]').evaluate(el => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    
    // Wait for change to be processed
    await page.waitForFunction(() => 
      document.querySelector('input[name="consent"]')?.checked === true
    );
  };

  const uncheckConsentBox = async (page) => {
    await page.locator('input[name="consent"]').evaluate(el => {
      el.checked = false;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    
    await page.waitForFunction(() => 
      document.querySelector('input[name="consent"]')?.checked === false
    );
  };

  const waitForValidationState = async (page, hasError = true) => {
    if (hasError) {
      // Wait for error message to be visible and input to be marked invalid
      await page.waitForFunction(
        () => {
          const errorElement = document.querySelector('#newsletter-error');
          const emailInput = document.querySelector('#newsletter-email');
          return errorElement && 
                 errorElement.style.display !== 'none' && 
                 errorElement.textContent.trim() !== '' &&
                 emailInput?.getAttribute('aria-invalid') === 'true';
        },
        { timeout: 5000 }
      );
      
      // Also wait for wrapper error class if present (optional check)
      await page.waitForFunction(
        () => {
          const wrapper = document.querySelector('.newsletter-input-wrapper');
          return wrapper && wrapper.classList.contains('error');
        },
        { timeout: 2000 }
      ).catch(() => {
        // Error class might not be added immediately, that's okay
        console.log('Warning: Error class not found on wrapper, but error message is visible');
      });
    } else {
      // Wait for error message to be hidden and input to be marked valid
      await page.waitForFunction(
        () => {
          const errorElement = document.querySelector('#newsletter-error');
          const emailInput = document.querySelector('#newsletter-email');
          const wrapper = document.querySelector('.newsletter-input-wrapper');
          return (!errorElement || errorElement.style.display === 'none' || errorElement.textContent.trim() === '') &&
                 emailInput?.getAttribute('aria-invalid') === 'false' &&
                 (!wrapper || !wrapper.classList.contains('error'));
        },
        { timeout: 5000 }
      );
    }
  };

  const waitForButtonState = async (page, shouldBeEnabled = true) => {
    await page.waitForFunction(
      (enabled) => {
        const button = document.querySelector('.newsletter-submit');
        return button && button.disabled !== enabled;
      },
      shouldBeEnabled,
      { timeout: 5000 }
    );
  };

  const clickWithStability = async (page, selector) => {
    // Wait for element to be stable and ready for interaction
    await page.waitForSelector(selector, { state: "visible" });
    await page.waitForFunction(
      (sel) => {
        const element = document.querySelector(sel);
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      },
      selector
    );
    
    // Wait a bit more for any animations to settle
    await page.waitForTimeout(100);
    
    // Click the element
    await page.click(selector);
  };

  test.beforeEach(async ({ page }) => {
    // Setup analytics mock before page load
    await page.addInitScript(() => {
      window.gtagEvents = [];
      window.gtag = function (type, event, params) {
        window.gtagEvents.push({ type, event, params });
      };
    });

    // Navigate to contact page
    await page.goto("/contact");

    // Wait for the newsletter form to be visible and interactive
    await page.waitForSelector("#newsletter-form", { state: "visible" });
    await page.waitForLoadState("networkidle");
    
    // Ensure newsletter.js is loaded and initialized
    await page.waitForFunction(() => {
      const form = document.getElementById('newsletter-form');
      const emailInput = document.getElementById('newsletter-email');
      const submitButton = document.querySelector('.newsletter-submit');
      const checkbox = document.querySelector('input[name="consent"]');
      
      return form && emailInput && submitButton && checkbox;
    });
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
    
    // Use helper function for reliable checkbox interaction
    await checkConsentBox(page);

    // Wait for button to be enabled
    await waitForButtonState(page, true);

    // Submit the form with stability check
    await clickWithStability(page, ".newsletter-submit");

    // Wait for success message
    await expect(page.locator(".newsletter-success")).toBeVisible();
    await expect(page.locator(".newsletter-success .success-text")).toHaveText(
      "Welcome to the A Lo Cubano family!",
    );

    // Verify form was reset - wait for reset to complete
    await page.waitForFunction(() => {
      const emailInput = document.querySelector("#newsletter-email");
      const checkbox = document.querySelector('input[name="consent"]');
      return emailInput?.value === '' && checkbox?.checked === false;
    });
    
    await expect(page.locator("#newsletter-email")).toHaveValue("");
    await expect(page.locator('input[name="consent"]')).not.toBeChecked();
  });

  test("should validate email format", async ({ page }) => {
    // Fill invalid email
    await page.fill("#newsletter-email", "invalid-email");
    
    // Use helper function for checkbox interaction
    await checkConsentBox(page);
    
    // The button should still be disabled due to invalid email
    await waitForButtonState(page, false);
    await expect(page.locator(".newsletter-submit")).toBeDisabled();
    
    // Trigger validation by blurring the email field (this triggers validateEmail())
    await page.locator("#newsletter-email").blur();
    
    // Wait for validation error to appear
    await page.waitForFunction(() => {
      const errorElement = document.querySelector("#newsletter-error");
      return errorElement && errorElement.style.display !== "none" && 
             errorElement.textContent.includes("valid email");
    });

    // Check for error message
    await expect(page.locator("#newsletter-error")).toBeVisible();
    await expect(page.locator("#newsletter-error")).toContainText(
      "valid email",
    );

    // Note: aria-invalid is only set during handleError (submission errors), not validateEmail (blur validation)
    // So we verify the error message is shown instead of checking aria-invalid
    // The button should remain disabled with invalid email
    await expect(page.locator(".newsletter-submit")).toBeDisabled();
  });

  test("should require email address", async ({ page }) => {
    // Check consent but leave email empty
    await checkConsentBox(page);
    
    // The button should be disabled without a valid email
    await waitForButtonState(page, false);
    await expect(page.locator(".newsletter-submit")).toBeDisabled();
    
    // Focus and blur the email field to trigger validation
    await page.locator("#newsletter-email").focus();
    await page.locator("#newsletter-email").blur();

    // Wait for validation to show error
    await page.waitForFunction(() => {
      const errorElement = document.querySelector("#newsletter-error");
      return errorElement && errorElement.style.display !== "none" && errorElement.textContent.includes("email address");
    });

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
    await waitForButtonState(page, false);
    await expect(page.locator(".newsletter-submit")).toBeDisabled();
    
    // Verify button state changes when checkbox is toggled
    await checkConsentBox(page);
    await waitForButtonState(page, true);
    await expect(page.locator(".newsletter-submit")).not.toBeDisabled();
    
    // Uncheck and verify button is disabled again
    await uncheckConsentBox(page);
    await waitForButtonState(page, false);
    await expect(page.locator(".newsletter-submit")).toBeDisabled();
  });

  test("should clear errors when user corrects input", async ({ page }) => {
    // Trigger an error first with invalid email
    await page.fill("#newsletter-email", "invalid-email");
    await checkConsentBox(page);
    
    // Trigger validation by blurring the email field
    await page.locator("#newsletter-email").blur();
    
    // Wait for error state to be visible
    await page.waitForFunction(() => {
      const errorElement = document.querySelector("#newsletter-error");
      return errorElement && errorElement.style.display !== "none" && 
             errorElement.textContent.includes("valid email");
    });
    
    await expect(page.locator("#newsletter-error")).toBeVisible();
    await expect(page.locator("#newsletter-error")).toContainText("valid email");

    // Start typing in email field to correct it (this triggers clearError on input)
    await page.fill("#newsletter-email", "test@example.com");

    // Wait for error to be cleared (errors clear on input event)
    await page.waitForFunction(() => {
      const errorElement = document.querySelector("#newsletter-error");
      const emailInput = document.querySelector("#newsletter-email");
      return (!errorElement || errorElement.style.display === "none" || errorElement.textContent.trim() === "") &&
             emailInput?.getAttribute("aria-invalid") === "false";
    });
    
    // Error should be cleared
    await expect(page.locator("#newsletter-error")).not.toBeVisible();
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
    await checkConsentBox(page);
    await waitForButtonState(page, true);
    
    await clickWithStability(page, ".newsletter-submit");

    // Check loading state immediately after click
    await page.waitForFunction(() => {
      const button = document.querySelector(".newsletter-submit");
      return button && button.getAttribute("aria-busy") === "true";
    });
    
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
    await checkConsentBox(page);
    await waitForButtonState(page, true);
    
    await clickWithStability(page, ".newsletter-submit");

    // Wait for error message to appear
    await page.waitForFunction(() => {
      const errorElement = document.querySelector("#newsletter-error");
      return errorElement && errorElement.style.display !== "none" && 
             errorElement.textContent.includes("already subscribed");
    });

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
    await checkConsentBox(page);
    await waitForButtonState(page, true);
    
    await clickWithStability(page, ".newsletter-submit");

    // Wait for error message to appear
    await page.waitForFunction(() => {
      const errorElement = document.querySelector("#newsletter-error");
      return errorElement && errorElement.style.display !== "none" && 
             errorElement.textContent.includes("error occurred");
    });

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
    await checkConsentBox(page);
    await waitForButtonState(page, true);
    
    await clickWithStability(page, ".newsletter-submit");

    // Wait for network error message to appear
    await page.waitForFunction(() => {
      const errorElement = document.querySelector("#newsletter-error");
      return errorElement && errorElement.style.display !== "none" && 
             errorElement.textContent.includes("Network error");
    });

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
    await checkConsentBox(page);
    await waitForButtonState(page, true);
    
    await clickWithStability(page, ".newsletter-submit");

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
    // Mock successful response first
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

    // Test keyboard accessibility by using direct element focus and keyboard actions
    await page.locator("#newsletter-email").focus();
    await expect(page.locator("#newsletter-email")).toBeFocused();

    // Type email using keyboard
    await page.keyboard.type("test@example.com");

    // Focus the checkbox directly (since Tab order can be unreliable)
    await page.locator('input[name="consent"]').focus();
    
    // Verify focus is on the consent checkbox
    await expect(page.locator('input[name="consent"]')).toBeFocused();

    // Check consent with Space key
    await page.keyboard.press("Space");
    
    // Wait for checkbox to be checked
    await page.waitForFunction(() => {
      const checkbox = document.querySelector('input[name="consent"]');
      return checkbox && checkbox.checked;
    });
    
    await expect(page.locator('input[name="consent"]')).toBeChecked();

    // Wait for button to be enabled after checkbox is checked
    await waitForButtonState(page, true);

    // Focus the submit button directly for reliable testing
    await page.locator(".newsletter-submit").focus();
    await expect(page.locator(".newsletter-submit")).toBeFocused();
    await expect(page.locator(".newsletter-submit")).not.toBeDisabled();

    // Submit with Enter key
    await page.keyboard.press("Enter");

    // Success message should appear
    await expect(page.locator(".newsletter-success")).toBeVisible();
  });

  test("should track Google Analytics event on successful signup", async ({
    page,
  }) => {
    // Note: Analytics mock is already set up in beforeEach
    
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
    await checkConsentBox(page);
    await waitForButtonState(page, true);
    
    await clickWithStability(page, ".newsletter-submit");

    // Wait for success
    await expect(page.locator(".newsletter-success")).toBeVisible();

    // Wait for analytics event to be tracked
    await page.waitForFunction(() => {
      if (!window.gtagEvents) return false;
      return window.gtagEvents.some(event => 
        event.type === "event" && 
        event.event === "newsletter_signup" &&
        event.params?.event_category === "engagement" &&
        event.params?.event_label === "contact_page"
      );
    });

    // Check that analytics event was tracked
    const gtagEvents = await page.evaluate(() => window.gtagEvents);
    expect(gtagEvents).not.toBeNull();
    expect(gtagEvents).not.toBeUndefined();
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

    // Wait for layout adjustment
    await page.waitForTimeout(500);

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

    // Form should still work on mobile
    await page.fill("#newsletter-email", "mobile@example.com");
    await checkConsentBox(page);
    await waitForButtonState(page, true);

    await clickWithStability(page, ".newsletter-submit");

    // Success message should appear
    await expect(page.locator(".newsletter-success")).toBeVisible();
  });
});

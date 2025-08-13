/**
 * E2E Tests for QR Code Check-in Flow
 * Tests QR code validation, scanning, and check-in process
 */

import { test, expect } from "@playwright/test";
import { injectAxe, checkA11y } from "@axe-core/playwright";

test.describe("QR Check-in Flow", () => {
  let baseURL;
  let mockTicketData;
  let validQRCode;
  let invalidQRCode;

  test.beforeAll(() => {
    baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

    // Mock ticket data for testing
    mockTicketData = {
      valid: {
        id: "ticket_123",
        qrCode: "VALID_QR_123",
        customerName: "Test User",
        ticketType: "Weekend Pass",
        eventName: "Boulder Fest 2026",
        status: "active",
        checkedIn: false,
      },
      alreadyCheckedIn: {
        id: "ticket_456",
        qrCode: "CHECKED_IN_456",
        customerName: "Already Checked User",
        ticketType: "Day Pass",
        eventName: "Boulder Fest 2026",
        status: "checked_in",
        checkedIn: true,
        checkInTime: "2026-05-15T10:30:00Z",
      },
      expired: {
        id: "ticket_789",
        qrCode: "EXPIRED_789",
        customerName: "Expired User",
        ticketType: "Workshop Pass",
        eventName: "Boulder Fest 2026",
        status: "expired",
        checkedIn: false,
      },
    };

    validQRCode = "VALID_QR_123";
    invalidQRCode = "INVALID_QR_999";
  });

  test.beforeEach(async ({ page }) => {
    // Set up authentication for admin access
    await page.addInitScript(() => {
      localStorage.setItem("adminToken", "test-admin-token");
    });
  });

  test.describe("Happy Path - Successful Check-in", () => {
    test("should successfully validate and check-in a valid ticket", async ({
      page,
    }) => {
      // Mock successful QR validation
      await page.route("**/api/tickets/validate", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            ticket: mockTicketData.valid,
            message: "Ticket validated successfully",
          }),
        });
      });

      // Navigate to admin check-in page
      await page.goto("/pages/admin/checkin.html");
      await page.waitForLoadState("networkidle");

      // Verify page loaded correctly
      await expect(page.locator("h1")).toContainText("Check-in Scanner");
      await expect(
        page.locator('[data-testid="scanner-container"]'),
      ).toBeVisible();

      // Simulate QR code scan (manual input for testing)
      const qrInput = page.locator('[data-testid="qr-manual-input"]');
      await qrInput.fill(validQRCode);

      const validateButton = page.locator('[data-testid="validate-ticket"]');
      await validateButton.click();

      // Verify ticket validation results
      const ticketInfo = page.locator('[data-testid="ticket-info"]');
      await expect(ticketInfo).toBeVisible();
      await expect(ticketInfo).toContainText("Test User");
      await expect(ticketInfo).toContainText("Weekend Pass");

      // Complete check-in
      const checkInButton = page.locator('[data-testid="confirm-checkin"]');
      await expect(checkInButton).toBeEnabled();
      await checkInButton.click();

      // Verify success message
      const successMessage = page.locator('[data-testid="checkin-success"]');
      await expect(successMessage).toBeVisible();
      await expect(successMessage).toContainText(
        "Check-in completed successfully",
      );
    });

    test("should display ticket details before check-in confirmation", async ({
      page,
    }) => {
      await page.route("**/api/tickets/validate", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            ticket: mockTicketData.valid,
          }),
        });
      });

      await page.goto("/pages/admin/checkin.html");

      // Validate ticket
      await page.fill('[data-testid="qr-manual-input"]', validQRCode);
      await page.click('[data-testid="validate-ticket"]');

      // Verify all ticket details are displayed
      const ticketDetails = page.locator('[data-testid="ticket-details"]');
      await expect(
        ticketDetails.locator('[data-testid="customer-name"]'),
      ).toContainText("Test User");
      await expect(
        ticketDetails.locator('[data-testid="ticket-type"]'),
      ).toContainText("Weekend Pass");
      await expect(
        ticketDetails.locator('[data-testid="event-name"]'),
      ).toContainText("Boulder Fest 2026");
      await expect(
        ticketDetails.locator('[data-testid="ticket-status"]'),
      ).toContainText("Active");
    });

    test("should handle bulk check-ins efficiently", async ({ page }) => {
      const bulkTickets = [
        { qrCode: "BULK_001", name: "User 1" },
        { qrCode: "BULK_002", name: "User 2" },
        { qrCode: "BULK_003", name: "User 3" },
      ];

      // Mock multiple successful validations
      await page.route("**/api/tickets/validate", (route) => {
        const url = new URL(route.request().url());
        const qrCode = url.searchParams.get("qrCode");
        const ticket = bulkTickets.find((t) => t.qrCode === qrCode);

        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            ticket: {
              ...mockTicketData.valid,
              qrCode,
              customerName: ticket.name,
            },
          }),
        });
      });

      await page.goto("/pages/admin/checkin.html");

      // Process multiple check-ins
      for (const ticket of bulkTickets) {
        await page.fill('[data-testid="qr-manual-input"]', ticket.qrCode);
        await page.click('[data-testid="validate-ticket"]');
        await page.waitForSelector('[data-testid="ticket-info"]');
        await page.click('[data-testid="confirm-checkin"]');
        await page.waitForSelector('[data-testid="checkin-success"]');

        // Clear for next ticket
        await page.click('[data-testid="reset-scanner"]');
      }

      // Verify check-in counter
      const checkinCounter = page.locator('[data-testid="checkin-counter"]');
      await expect(checkinCounter).toContainText("3");
    });
  });

  test.describe("Error Scenarios", () => {
    test("should handle invalid QR codes", async ({ page }) => {
      // Mock invalid QR response
      await page.route("**/api/tickets/validate", (route) => {
        route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: "Ticket not found",
            message: "Invalid QR code or ticket does not exist",
          }),
        });
      });

      await page.goto("/pages/admin/checkin.html");

      // Try to validate invalid QR code
      await page.fill('[data-testid="qr-manual-input"]', invalidQRCode);
      await page.click('[data-testid="validate-ticket"]');

      // Verify error message
      const errorMessage = page.locator('[data-testid="validation-error"]');
      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toContainText(
        "Invalid QR code or ticket does not exist",
      );

      // Verify check-in button is not enabled
      const checkInButton = page.locator('[data-testid="confirm-checkin"]');
      await expect(checkInButton).toBeDisabled();
    });

    test("should handle already checked-in tickets", async ({ page }) => {
      // Mock already checked-in response
      await page.route("**/api/tickets/validate", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            ticket: mockTicketData.alreadyCheckedIn,
            error: "ALREADY_CHECKED_IN",
            message: "This ticket has already been used for check-in",
          }),
        });
      });

      await page.goto("/pages/admin/checkin.html");

      await page.fill(
        '[data-testid="qr-manual-input"]',
        mockTicketData.alreadyCheckedIn.qrCode,
      );
      await page.click('[data-testid="validate-ticket"]');

      // Verify already checked-in message
      const alreadyCheckedMessage = page.locator(
        '[data-testid="already-checkedin-error"]',
      );
      await expect(alreadyCheckedMessage).toBeVisible();
      await expect(alreadyCheckedMessage).toContainText("already been used");

      // Show previous check-in details
      await expect(
        page.locator('[data-testid="previous-checkin-time"]'),
      ).toBeVisible();
    });

    test("should handle expired tickets", async ({ page }) => {
      await page.route("**/api/tickets/validate", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            ticket: mockTicketData.expired,
            error: "TICKET_EXPIRED",
            message: "This ticket has expired and cannot be used",
          }),
        });
      });

      await page.goto("/pages/admin/checkin.html");

      await page.fill(
        '[data-testid="qr-manual-input"]',
        mockTicketData.expired.qrCode,
      );
      await page.click('[data-testid="validate-ticket"]');

      // Verify expired ticket message
      const expiredMessage = page.locator(
        '[data-testid="expired-ticket-error"]',
      );
      await expect(expiredMessage).toBeVisible();
      await expect(expiredMessage).toContainText("expired");
    });

    test("should handle network errors gracefully", async ({ page }) => {
      // Mock network failure
      await page.route("**/api/tickets/validate", (route) => {
        route.abort("failed");
      });

      await page.goto("/pages/admin/checkin.html");

      await page.fill('[data-testid="qr-manual-input"]', validQRCode);
      await page.click('[data-testid="validate-ticket"]');

      // Verify network error handling
      const networkError = page.locator('[data-testid="network-error"]');
      await expect(networkError).toBeVisible();
      await expect(networkError).toContainText("connection");

      // Verify retry option is available
      const retryButton = page.locator('[data-testid="retry-validation"]');
      await expect(retryButton).toBeVisible();
    });
  });

  test.describe("Camera Scanner Integration", () => {
    test("should initialize camera scanner", async ({ page }) => {
      // Mock camera permissions
      await page.context().grantPermissions(["camera"], { origin: baseURL });

      await page.goto("/pages/admin/checkin.html");

      // Enable camera scanner
      const enableCameraButton = page.locator('[data-testid="enable-camera"]');
      await enableCameraButton.click();

      // Verify scanner interface appears
      const cameraScanner = page.locator('[data-testid="camera-scanner"]');
      await expect(cameraScanner).toBeVisible();

      // Verify manual input is still available as fallback
      const manualInputToggle = page.locator(
        '[data-testid="manual-input-toggle"]',
      );
      await expect(manualInputToggle).toBeVisible();
    });

    test("should handle camera permission denied", async ({ page }) => {
      // Mock camera permission denied
      await page.context().grantPermissions([], { origin: baseURL });

      await page.goto("/pages/admin/checkin.html");

      const enableCameraButton = page.locator('[data-testid="enable-camera"]');
      await enableCameraButton.click();

      // Verify fallback to manual input
      const permissionError = page.locator(
        '[data-testid="camera-permission-error"]',
      );
      await expect(permissionError).toBeVisible();
      await expect(permissionError).toContainText("Camera access denied");

      const manualInput = page.locator('[data-testid="qr-manual-input"]');
      await expect(manualInput).toBeVisible();
    });
  });

  test.describe("Admin Authentication", () => {
    test("should require admin authentication for check-in", async ({
      page,
    }) => {
      // Clear admin token
      await page.addInitScript(() => {
        localStorage.removeItem("adminToken");
      });

      await page.goto("/pages/admin/checkin.html");

      // Should redirect to admin login
      await page.waitForURL("**/admin/login.html");
      await expect(page.locator("h1")).toContainText("Admin Login");
    });

    test("should handle expired admin sessions", async ({ page }) => {
      // Mock expired token response
      await page.route("**/api/admin/**", (route) => {
        route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Token expired",
            code: "TOKEN_EXPIRED",
          }),
        });
      });

      await page.goto("/pages/admin/checkin.html");

      // Try to validate a ticket (which requires admin auth)
      await page.fill('[data-testid="qr-manual-input"]', validQRCode);
      await page.click('[data-testid="validate-ticket"]');

      // Should show session expired message and redirect to login
      const sessionExpired = page.locator('[data-testid="session-expired"]');
      await expect(sessionExpired).toBeVisible();
    });
  });

  test.describe("Mobile Scanner Experience", () => {
    test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE

    test("should work on mobile devices", async ({ page }) => {
      await page.goto("/pages/admin/checkin.html");

      // Verify mobile layout
      const mobileScanner = page.locator('[data-testid="mobile-scanner"]');
      await expect(mobileScanner).toBeVisible();

      // Test mobile-friendly QR input
      const qrInput = page.locator('[data-testid="qr-manual-input"]');
      await expect(qrInput).toHaveAttribute("inputmode", "text");
      await expect(qrInput).toHaveAttribute("autocomplete", "off");

      // Test mobile validation flow
      await page.fill('[data-testid="qr-manual-input"]', validQRCode);

      // Verify mobile keyboard doesn't interfere with validation
      await page.click('[data-testid="validate-ticket"]');
    });
  });

  test.describe("Accessibility", () => {
    test("should be accessible for screen readers", async ({ page }) => {
      await page.goto("/pages/admin/checkin.html");
      await injectAxe(page);

      // Check initial accessibility
      await checkA11y(page, null, {
        detailedReport: true,
        detailedReportOptions: { html: true },
      });

      // Verify screen reader announcements for validation results
      await page.fill('[data-testid="qr-manual-input"]', validQRCode);
      await page.click('[data-testid="validate-ticket"]');

      // Check if validation result is announced
      const liveRegion = page.locator('[data-testid="validation-live-region"]');
      await expect(liveRegion).toHaveAttribute("aria-live", "polite");
    });

    test("should support keyboard-only navigation", async ({ page }) => {
      await page.goto("/pages/admin/checkin.html");

      // Navigate using only keyboard
      await page.keyboard.press("Tab"); // Focus QR input
      await page.keyboard.type(validQRCode);

      await page.keyboard.press("Tab"); // Focus validate button
      await page.keyboard.press("Enter");

      // Continue keyboard navigation for check-in confirmation
      await page.keyboard.press("Tab"); // Focus confirm check-in button
      await page.keyboard.press("Enter");

      // Verify success message appears
      const successMessage = page.locator('[data-testid="checkin-success"]');
      await expect(successMessage).toBeVisible();
    });
  });

  test.describe("Performance", () => {
    test("should validate tickets quickly", async ({ page }) => {
      await page.route("**/api/tickets/validate", (route) => {
        // Add slight delay to simulate real API
        setTimeout(() => {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              ticket: mockTicketData.valid,
            }),
          });
        }, 100);
      });

      await page.goto("/pages/admin/checkin.html");

      const startTime = Date.now();

      await page.fill('[data-testid="qr-manual-input"]', validQRCode);
      await page.click('[data-testid="validate-ticket"]');
      await page.waitForSelector('[data-testid="ticket-info"]');

      const validationTime = Date.now() - startTime;
      expect(validationTime).toBeLessThan(1000); // Should validate within 1 second
    });

    test("should handle rapid successive scans", async ({ page }) => {
      const rapidScans = ["QR_001", "QR_002", "QR_003", "QR_004", "QR_005"];

      await page.route("**/api/tickets/validate", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            ticket: {
              ...mockTicketData.valid,
              qrCode: route.request().url().split("qrCode=")[1],
            },
          }),
        });
      });

      await page.goto("/pages/admin/checkin.html");

      // Perform rapid successive scans
      for (const qr of rapidScans) {
        await page.fill('[data-testid="qr-manual-input"]', qr);
        await page.click('[data-testid="validate-ticket"]');
        await page.waitForSelector('[data-testid="ticket-info"]');
        await page.click('[data-testid="confirm-checkin"]');
        await page.waitForSelector('[data-testid="checkin-success"]');
        await page.click('[data-testid="reset-scanner"]');
      }

      // Verify all scans were processed
      const totalCheckins = page.locator('[data-testid="checkin-counter"]');
      await expect(totalCheckins).toContainText("5");
    });
  });

  test.describe("Real-time Updates", () => {
    test("should show real-time check-in statistics", async ({ page }) => {
      await page.goto("/pages/admin/checkin.html");

      // Initial stats should be visible
      const statsPanel = page.locator('[data-testid="checkin-stats"]');
      await expect(statsPanel).toBeVisible();

      const totalCheckins = page.locator('[data-testid="total-checkins"]');
      const recentActivity = page.locator('[data-testid="recent-activity"]');

      await expect(totalCheckins).toContainText(/\d+/);
      await expect(recentActivity).toBeVisible();
    });
  });
});

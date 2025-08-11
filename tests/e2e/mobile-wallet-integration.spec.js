/**
 * E2E Tests for Mobile Wallet Integration
 * Tests Apple Wallet and Google Wallet pass generation and integration
 */

import { test, expect } from "@playwright/test";
import { injectAxe, checkA11y } from "@axe-core/playwright";

test.describe("Mobile Wallet Integration", () => {
  let baseURL;
  let mockTicketData;
  let validTicketId;

  test.beforeAll(() => {
    baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

    mockTicketData = {
      id: "ticket_test_123",
      customerName: "Test User",
      customerEmail: "test@example.com",
      ticketType: "Weekend Pass",
      eventName: "Boulder Fest 2026",
      eventDate: "2026-05-15",
      venue: "Avalon Ballroom, Boulder, CO",
      qrCode: "WALLET_QR_123",
      serialNumber: "BF2026-WKD-001",
      status: "active",
      purchaseDate: "2026-03-15T10:30:00Z",
      price: 85.0,
    };

    validTicketId = mockTicketData.id;
  });

  test.beforeEach(async ({ page }) => {
    // Mock successful ticket lookup
    await page.route("**/api/tickets/*", (route) => {
      const ticketId = route
        .request()
        .url()
        .split("/tickets/")[1]
        .split("/")[0];

      if (ticketId === validTicketId) {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            ticket: mockTicketData,
          }),
        });
      } else {
        route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: "Ticket not found",
          }),
        });
      }
    });
  });

  test.describe("Apple Wallet Integration", () => {
    test("should generate and download Apple Wallet pass", async ({ page }) => {
      // Mock successful Apple Wallet pass generation
      await page.route("**/api/tickets/apple-wallet/*", (route) => {
        route.fulfill({
          status: 200,
          headers: {
            "Content-Type": "application/vnd.apple.pkpass",
            "Content-Disposition":
              'attachment; filename="festival-ticket.pkpass"',
          },
          body: Buffer.from("MOCK_APPLE_WALLET_PASS_DATA"),
        });
      });

      // Navigate to ticket page
      await page.goto(`/pages/my-ticket.html?ticket=${validTicketId}`);
      await page.waitForLoadState("networkidle");

      // Verify ticket details are displayed
      await expect(
        page.locator('[data-testid="ticket-details"]'),
      ).toBeVisible();
      await expect(page.locator('[data-testid="customer-name"]')).toContainText(
        "Test User",
      );

      // Click Apple Wallet button
      const appleWalletButton = page.locator(
        '[data-testid="add-to-apple-wallet"]',
      );
      await expect(appleWalletButton).toBeVisible();

      // Set up download handler
      const downloadPromise = page.waitForDownload();
      await appleWalletButton.click();

      // Verify download initiated
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain(".pkpass");
    });

    test("should show Apple Wallet availability on supported devices", async ({
      page,
    }) => {
      // Mock user agent for iOS Safari
      await page.setUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
      );

      await page.goto(`/pages/my-ticket.html?ticket=${validTicketId}`);

      // Apple Wallet option should be prominently displayed
      const appleWalletSection = page.locator(
        '[data-testid="apple-wallet-section"]',
      );
      await expect(appleWalletSection).toBeVisible();

      const appleWalletButton = page.locator(
        '[data-testid="add-to-apple-wallet"]',
      );
      await expect(appleWalletButton).toBeVisible();
      await expect(appleWalletButton).not.toBeDisabled();

      // Verify Apple Wallet icon and text
      await expect(appleWalletButton).toContainText("Add to Apple Wallet");
      const appleWalletIcon = appleWalletButton.locator("svg, img");
      await expect(appleWalletIcon).toBeVisible();
    });

    test("should handle Apple Wallet generation errors", async ({ page }) => {
      // Mock Apple Wallet generation failure
      await page.route("**/api/tickets/apple-wallet/*", (route) => {
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: "Failed to generate Apple Wallet pass",
            message: "Certificate validation failed",
          }),
        });
      });

      await page.goto(`/pages/my-ticket.html?ticket=${validTicketId}`);

      const appleWalletButton = page.locator(
        '[data-testid="add-to-apple-wallet"]',
      );
      await appleWalletButton.click();

      // Verify error message
      const errorMessage = page.locator('[data-testid="wallet-error"]');
      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toContainText("Failed to generate");

      // Verify retry option
      const retryButton = page.locator('[data-testid="retry-wallet"]');
      await expect(retryButton).toBeVisible();
    });
  });

  test.describe("Google Wallet Integration", () => {
    test("should generate and initiate Google Wallet save", async ({
      page,
    }) => {
      // Mock successful Google Wallet pass generation
      await page.route("**/api/tickets/google-wallet/*", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            saveUrl: "https://pay.google.com/gp/v/save/mock-google-wallet-url",
            passId: "google-pass-123",
          }),
        });
      });

      await page.goto(`/pages/my-ticket.html?ticket=${validTicketId}`);

      // Click Google Wallet button
      const googleWalletButton = page.locator(
        '[data-testid="add-to-google-wallet"]',
      );
      await expect(googleWalletButton).toBeVisible();

      // Set up popup handler (Google Wallet opens in new window)
      const popupPromise = page.waitForEvent("popup");
      await googleWalletButton.click();

      // Verify popup initiated (Google Wallet save flow)
      const popup = await popupPromise;
      expect(popup.url()).toContain("pay.google.com");
    });

    test("should show Google Wallet availability on Android devices", async ({
      page,
    }) => {
      // Mock user agent for Android Chrome
      await page.setUserAgent(
        "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.77 Mobile Safari/537.36",
      );

      await page.goto(`/pages/my-ticket.html?ticket=${validTicketId}`);

      // Google Wallet option should be prominently displayed
      const googleWalletSection = page.locator(
        '[data-testid="google-wallet-section"]',
      );
      await expect(googleWalletSection).toBeVisible();

      const googleWalletButton = page.locator(
        '[data-testid="add-to-google-wallet"]',
      );
      await expect(googleWalletButton).toBeVisible();
      await expect(googleWalletButton).not.toBeDisabled();

      // Verify Google Wallet branding
      await expect(googleWalletButton).toContainText("Add to Google Wallet");
      const googleWalletIcon = googleWalletButton.locator("svg, img");
      await expect(googleWalletIcon).toBeVisible();
    });

    test("should handle Google Wallet generation errors", async ({ page }) => {
      // Mock Google Wallet generation failure
      await page.route("**/api/tickets/google-wallet/*", (route) => {
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: "Failed to generate Google Wallet pass",
            message: "API quota exceeded",
          }),
        });
      });

      await page.goto(`/pages/my-ticket.html?ticket=${validTicketId}`);

      const googleWalletButton = page.locator(
        '[data-testid="add-to-google-wallet"]',
      );
      await googleWalletButton.click();

      // Verify error message
      const errorMessage = page.locator('[data-testid="wallet-error"]');
      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toContainText("Failed to generate");
    });
  });

  test.describe("Cross-Platform Wallet Detection", () => {
    test("should show both options on desktop browsers", async ({ page }) => {
      // Use default desktop user agent
      await page.goto(`/pages/my-ticket.html?ticket=${validTicketId}`);

      // Both wallet options should be available on desktop
      const walletOptions = page.locator('[data-testid="wallet-options"]');
      await expect(walletOptions).toBeVisible();

      const appleWalletButton = page.locator(
        '[data-testid="add-to-apple-wallet"]',
      );
      const googleWalletButton = page.locator(
        '[data-testid="add-to-google-wallet"]',
      );

      await expect(appleWalletButton).toBeVisible();
      await expect(googleWalletButton).toBeVisible();

      // Desktop instructions should be shown
      const desktopInstructions = page.locator(
        '[data-testid="desktop-wallet-instructions"]',
      );
      await expect(desktopInstructions).toBeVisible();
      await expect(desktopInstructions).toContainText("download");
    });

    test("should prioritize platform-specific wallet on mobile", async ({
      page,
    }) => {
      // Test iOS prioritization
      await page.setUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)",
      );
      await page.goto(`/pages/my-ticket.html?ticket=${validTicketId}`);

      const appleWalletButton = page.locator(
        '[data-testid="add-to-apple-wallet"]',
      );
      const googleWalletButton = page.locator(
        '[data-testid="add-to-google-wallet"]',
      );

      // Apple Wallet should be primary on iOS
      await expect(appleWalletButton).toHaveClass(/primary|featured/);

      // Google Wallet should be secondary or hidden
      if (await googleWalletButton.isVisible()) {
        await expect(googleWalletButton).toHaveClass(/secondary/);
      }
    });

    test("should show fallback options when wallets unavailable", async ({
      page,
    }) => {
      // Mock unsupported browser/device
      await page.setUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
      );

      await page.goto(`/pages/my-ticket.html?ticket=${validTicketId}`);

      // Fallback options should be shown
      const fallbackOptions = page.locator('[data-testid="wallet-fallback"]');
      await expect(fallbackOptions).toBeVisible();

      // Should offer QR code, email, or download alternatives
      const qrCodeOption = page.locator('[data-testid="show-qr-code"]');
      const emailOption = page.locator('[data-testid="email-ticket"]');

      await expect(qrCodeOption).toBeVisible();
      await expect(emailOption).toBeVisible();
    });
  });

  test.describe("Wallet Pass Content Validation", () => {
    test("should include all required ticket information in wallet passes", async ({
      page,
    }) => {
      // Mock pass generation with detailed response
      await page.route("**/api/tickets/apple-wallet/*", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            passData: {
              serialNumber: mockTicketData.serialNumber,
              description: `${mockTicketData.ticketType} - ${mockTicketData.eventName}`,
              organizationName: "A Lo Cubano Boulder Fest",
              passTypeIdentifier: "pass.com.alocubano.boulderfest.ticket",
              teamIdentifier: "TEAM123",
              logoText: "A Lo Cubano",
              foregroundColor: "rgb(255, 255, 255)",
              backgroundColor: "rgb(206, 17, 38)",
              locations: [
                {
                  latitude: 40.0274,
                  longitude: -105.2519,
                  altitude: 1655,
                },
              ],
              barcode: {
                message: mockTicketData.qrCode,
                format: "PKBarcodeFormatQR",
                messageEncoding: "iso-8859-1",
              },
              eventTicket: {
                primaryFields: [
                  {
                    key: "event",
                    label: "EVENT",
                    value: mockTicketData.eventName,
                  },
                ],
                secondaryFields: [
                  {
                    key: "date",
                    label: "DATE",
                    value: "May 15-17, 2026",
                  },
                  {
                    key: "time",
                    label: "TIME",
                    value: "All Weekend",
                  },
                ],
                auxiliaryFields: [
                  {
                    key: "venue",
                    label: "VENUE",
                    value: mockTicketData.venue,
                  },
                ],
                backFields: [
                  {
                    key: "terms",
                    label: "Terms and Conditions",
                    value:
                      "This ticket is valid for the specified event only...",
                  },
                ],
              },
            },
          }),
        });
      });

      await page.goto(`/pages/my-ticket.html?ticket=${validTicketId}`);

      const appleWalletButton = page.locator(
        '[data-testid="add-to-apple-wallet"]',
      );
      const downloadPromise = page.waitForDownload();
      await appleWalletButton.click();

      await downloadPromise;

      // Verify pass preview shows correct information
      const passPreview = page.locator('[data-testid="wallet-pass-preview"]');
      if (await passPreview.isVisible()) {
        await expect(passPreview).toContainText(mockTicketData.eventName);
        await expect(passPreview).toContainText(mockTicketData.ticketType);
        await expect(passPreview).toContainText(mockTicketData.venue);
      }
    });
  });

  test.describe("Authentication and Security", () => {
    test("should require valid ticket authentication for wallet generation", async ({
      page,
    }) => {
      // Mock invalid ticket
      await page.route("**/api/tickets/*", (route) => {
        route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: "Invalid ticket authentication",
          }),
        });
      });

      await page.goto(`/pages/my-ticket.html?ticket=invalid_ticket_123`);

      // Should show authentication error
      const authError = page.locator('[data-testid="auth-error"]');
      await expect(authError).toBeVisible();

      // Wallet buttons should not be available
      const walletOptions = page.locator('[data-testid="wallet-options"]');
      await expect(walletOptions).not.toBeVisible();
    });

    test("should validate ticket ownership before wallet generation", async ({
      page,
    }) => {
      // Mock ownership validation failure
      await page.route("**/api/tickets/apple-wallet/*", (route) => {
        route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: "Access denied: Invalid ticket token",
          }),
        });
      });

      await page.goto(`/pages/my-ticket.html?ticket=${validTicketId}`);

      const appleWalletButton = page.locator(
        '[data-testid="add-to-apple-wallet"]',
      );
      await appleWalletButton.click();

      const accessError = page.locator('[data-testid="access-error"]');
      await expect(accessError).toBeVisible();
      await expect(accessError).toContainText("Access denied");
    });
  });

  test.describe("Mobile-Specific Features", () => {
    test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE

    test("should optimize wallet interface for mobile", async ({ page }) => {
      await page.goto(`/pages/my-ticket.html?ticket=${validTicketId}`);

      // Mobile-optimized wallet section
      const mobileWalletSection = page.locator(
        '[data-testid="mobile-wallet-section"]',
      );
      await expect(mobileWalletSection).toBeVisible();

      // Large, touch-friendly buttons
      const walletButtons = page.locator('[data-testid*="wallet"] button');
      const buttonCount = await walletButtons.count();

      for (let i = 0; i < buttonCount; i++) {
        const button = walletButtons.nth(i);
        const boundingBox = await button.boundingBox();
        expect(boundingBox.height).toBeGreaterThan(44); // iOS touch target minimum
      }
    });

    test("should handle mobile wallet app redirects", async ({ page }) => {
      // Mock successful Apple Wallet generation
      await page.route("**/api/tickets/apple-wallet/*", (route) => {
        route.fulfill({
          status: 200,
          headers: {
            "Content-Type": "application/vnd.apple.pkpass",
          },
          body: Buffer.from("MOCK_PASS_DATA"),
        });
      });

      // Set mobile user agent
      await page.setUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)",
      );

      await page.goto(`/pages/my-ticket.html?ticket=${validTicketId}`);

      const appleWalletButton = page.locator(
        '[data-testid="add-to-apple-wallet"]',
      );
      await appleWalletButton.click();

      // Mobile should attempt to open wallet app directly
      const walletRedirect = page.locator(
        '[data-testid="wallet-redirect-message"]',
      );
      if (await walletRedirect.isVisible()) {
        await expect(walletRedirect).toContainText("Opening Wallet");
      }
    });
  });

  test.describe("Accessibility", () => {
    test("should be accessible for wallet interactions", async ({ page }) => {
      await page.goto(`/pages/my-ticket.html?ticket=${validTicketId}`);
      await injectAxe(page);

      // Check accessibility of wallet options
      await checkA11y(page, '[data-testid="wallet-options"]', {
        detailedReport: true,
      });

      // Verify proper ARIA labels
      const appleWalletButton = page.locator(
        '[data-testid="add-to-apple-wallet"]',
      );
      await expect(appleWalletButton).toHaveAttribute("aria-label");

      const googleWalletButton = page.locator(
        '[data-testid="add-to-google-wallet"]',
      );
      await expect(googleWalletButton).toHaveAttribute("aria-label");
    });

    test("should announce wallet generation status to screen readers", async ({
      page,
    }) => {
      await page.goto(`/pages/my-ticket.html?ticket=${validTicketId}`);

      // Mock slow wallet generation
      await page.route("**/api/tickets/apple-wallet/*", (route) => {
        setTimeout(() => {
          route.fulfill({
            status: 200,
            headers: { "Content-Type": "application/vnd.apple.pkpass" },
            body: Buffer.from("MOCK_PASS_DATA"),
          });
        }, 1000);
      });

      const appleWalletButton = page.locator(
        '[data-testid="add-to-apple-wallet"]',
      );
      await appleWalletButton.click();

      // Check for loading announcement
      const loadingAnnouncement = page.locator(
        '[data-testid="wallet-loading"]',
      );
      await expect(loadingAnnouncement).toHaveAttribute("aria-live", "polite");
      await expect(loadingAnnouncement).toContainText("Generating");
    });
  });

  test.describe("Performance", () => {
    test("should generate wallet passes efficiently", async ({ page }) => {
      await page.route("**/api/tickets/apple-wallet/*", (route) => {
        // Simulate realistic API response time
        setTimeout(() => {
          route.fulfill({
            status: 200,
            headers: { "Content-Type": "application/vnd.apple.pkpass" },
            body: Buffer.from("MOCK_PASS_DATA"),
          });
        }, 200);
      });

      await page.goto(`/pages/my-ticket.html?ticket=${validTicketId}`);

      const startTime = Date.now();

      const appleWalletButton = page.locator(
        '[data-testid="add-to-apple-wallet"]',
      );
      const downloadPromise = page.waitForDownload();

      await appleWalletButton.click();
      await downloadPromise;

      const generationTime = Date.now() - startTime;
      expect(generationTime).toBeLessThan(2000); // Should complete within 2 seconds
    });

    test("should handle concurrent wallet requests", async ({
      page,
      context,
    }) => {
      // Create multiple pages for concurrent testing
      const page2 = await context.newPage();
      const page3 = await context.newPage();

      let requestCount = 0;
      await page.route("**/api/tickets/apple-wallet/*", (route) => {
        requestCount++;
        route.fulfill({
          status: 200,
          headers: { "Content-Type": "application/vnd.apple.pkpass" },
          body: Buffer.from(`MOCK_PASS_DATA_${requestCount}`),
        });
      });

      // Navigate all pages
      await page.goto(`/pages/my-ticket.html?ticket=${validTicketId}`);
      await page2.goto(`/pages/my-ticket.html?ticket=${validTicketId}`);
      await page3.goto(`/pages/my-ticket.html?ticket=${validTicketId}`);

      // Click wallet buttons concurrently
      const downloadPromises = [
        page.waitForDownload(),
        page2.waitForDownload(),
        page3.waitForDownload(),
      ];

      await Promise.all([
        page.click('[data-testid="add-to-apple-wallet"]'),
        page2.click('[data-testid="add-to-apple-wallet"]'),
        page3.click('[data-testid="add-to-apple-wallet"]'),
      ]);

      // All should complete successfully
      const downloads = await Promise.all(downloadPromises);
      expect(downloads).toHaveLength(3);

      await page2.close();
      await page3.close();
    });
  });

  test.describe("Error Recovery", () => {
    test("should provide clear recovery options on failure", async ({
      page,
    }) => {
      // Mock intermittent failure
      let attemptCount = 0;
      await page.route("**/api/tickets/apple-wallet/*", (route) => {
        attemptCount++;
        if (attemptCount < 2) {
          route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "Temporary service unavailable" }),
          });
        } else {
          route.fulfill({
            status: 200,
            headers: { "Content-Type": "application/vnd.apple.pkpass" },
            body: Buffer.from("MOCK_PASS_DATA"),
          });
        }
      });

      await page.goto(`/pages/my-ticket.html?ticket=${validTicketId}`);

      const appleWalletButton = page.locator(
        '[data-testid="add-to-apple-wallet"]',
      );

      // First attempt should fail
      await appleWalletButton.click();

      const errorMessage = page.locator('[data-testid="wallet-error"]');
      await expect(errorMessage).toBeVisible();

      // Retry should succeed
      const retryButton = page.locator('[data-testid="retry-wallet"]');
      const downloadPromise = page.waitForDownload();

      await retryButton.click();
      await downloadPromise;

      // Error should be cleared
      await expect(errorMessage).not.toBeVisible();
    });
  });
});

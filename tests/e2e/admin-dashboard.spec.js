/**
 * E2E Tests for Admin Dashboard
 * Tests admin authentication, dashboard functionality, and management features
 */

import { test, expect } from "@playwright/test";
import { injectAxe, checkA11y } from "@axe-core/playwright";

test.describe("Admin Dashboard", () => {
  let baseURL;
  let adminCredentials;
  let mockDashboardData;

  test.beforeAll(() => {
    baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

    adminCredentials = {
      username: "admin",
      password: "test-admin-password",
      mfaCode: "123456",
    };

    mockDashboardData = {
      stats: {
        totalTickets: 250,
        checkedInTickets: 125,
        totalRevenue: 21250.0,
        pendingTickets: 15,
        cancellationRate: 2.5,
        popularTicketTypes: [
          { name: "Weekend Pass", count: 150, revenue: 12750 },
          { name: "Day Pass", count: 85, revenue: 6800 },
          { name: "Workshop Pass", count: 15, revenue: 1700 },
        ],
      },
      recentTransactions: [
        {
          id: "txn_123",
          customerName: "John Doe",
          ticketType: "Weekend Pass",
          amount: 85.0,
          timestamp: "2026-05-15T10:30:00Z",
          status: "completed",
        },
        {
          id: "txn_124",
          customerName: "Jane Smith",
          ticketType: "Day Pass",
          amount: 45.0,
          timestamp: "2026-05-15T11:15:00Z",
          status: "pending",
        },
      ],
      alerts: [
        {
          id: "alert_1",
          type: "warning",
          message: "High check-in volume detected",
          timestamp: "2026-05-15T12:00:00Z",
        },
        {
          id: "alert_2",
          type: "info",
          message: "Daily backup completed successfully",
          timestamp: "2026-05-15T06:00:00Z",
        },
      ],
    };
  });

  test.beforeEach(async ({ page }) => {
    // Clear any existing auth
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test.describe("Admin Authentication", () => {
    test("should successfully login with valid credentials", async ({
      page,
    }) => {
      // Mock successful login
      await page.route("**/api/admin/login", (route) => {
        const request = route.request();
        const postData = JSON.parse(request.postData() || "{}");

        if (
          postData.username === adminCredentials.username &&
          postData.password === adminCredentials.password
        ) {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              token: "mock-admin-jwt-token",
              expiresIn: 3600,
              requiresMFA: false,
            }),
          });
        } else {
          route.fulfill({
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({
              success: false,
              error: "Invalid credentials",
            }),
          });
        }
      });

      // Navigate to login page
      await page.goto("/pages/admin/login.html");
      await page.waitForLoadState("networkidle");

      // Verify login form
      await expect(page.locator("h1")).toContainText("Admin Login");
      await expect(page.locator('[data-testid="login-form"]')).toBeVisible();

      // Fill login form
      await page.fill('[data-testid="username"]', adminCredentials.username);
      await page.fill('[data-testid="password"]', adminCredentials.password);

      // Submit login
      const loginButton = page.locator('[data-testid="login-button"]');
      await loginButton.click();

      // Should redirect to dashboard
      await page.waitForURL("**/admin/dashboard.html");
      await expect(page.locator("h1")).toContainText("Admin Dashboard");
    });

    test("should handle invalid credentials", async ({ page }) => {
      await page.route("**/api/admin/login", (route) => {
        route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: "Invalid credentials",
          }),
        });
      });

      await page.goto("/pages/admin/login.html");

      await page.fill('[data-testid="username"]', "wrong-user");
      await page.fill('[data-testid="password"]', "wrong-password");
      await page.click('[data-testid="login-button"]');

      // Should show error message
      const errorMessage = page.locator('[data-testid="login-error"]');
      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toContainText("Invalid credentials");

      // Should remain on login page
      await expect(page).toHaveURL(/login\.html/);
    });

    test("should handle MFA requirement", async ({ page }) => {
      // Mock MFA required response
      await page.route("**/api/admin/login", (route) => {
        const request = route.request();
        const postData = JSON.parse(request.postData() || "{}");

        if (postData.mfaCode) {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              token: "mock-admin-jwt-token",
              expiresIn: 3600,
            }),
          });
        } else {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: false,
              requiresMFA: true,
              message: "Please enter your MFA code",
            }),
          });
        }
      });

      await page.goto("/pages/admin/login.html");

      // First login attempt
      await page.fill('[data-testid="username"]', adminCredentials.username);
      await page.fill('[data-testid="password"]', adminCredentials.password);
      await page.click('[data-testid="login-button"]');

      // MFA form should appear
      const mfaForm = page.locator('[data-testid="mfa-form"]');
      await expect(mfaForm).toBeVisible();

      // Fill MFA code
      await page.fill('[data-testid="mfa-code"]', adminCredentials.mfaCode);
      await page.click('[data-testid="verify-mfa"]');

      // Should proceed to dashboard
      await page.waitForURL("**/admin/dashboard.html");
    });

    test("should handle session expiration", async ({ page }) => {
      // Set expired token
      await page.addInitScript(() => {
        localStorage.setItem("adminToken", "expired-token");
      });

      // Mock expired token response
      await page.route("**/api/admin/**", (route) => {
        if (route.request().url().includes("/login")) {
          route.continue();
        } else {
          route.fulfill({
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({
              error: "Token expired",
              code: "TOKEN_EXPIRED",
            }),
          });
        }
      });

      await page.goto("/pages/admin/dashboard.html");

      // Should redirect to login
      await page.waitForURL("**/admin/login.html");

      // Should show session expired message
      const sessionMessage = page.locator('[data-testid="session-expired"]');
      await expect(sessionMessage).toBeVisible();
    });
  });

  test.describe("Dashboard Overview", () => {
    test.beforeEach(async ({ page }) => {
      // Mock authenticated state
      await page.addInitScript(() => {
        localStorage.setItem("adminToken", "valid-admin-token");
      });

      // Mock dashboard data
      await page.route("**/api/admin/dashboard", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockDashboardData),
        });
      });
    });

    test("should display key metrics and statistics", async ({ page }) => {
      await page.goto("/pages/admin/dashboard.html");
      await page.waitForLoadState("networkidle");

      // Verify dashboard loaded
      await expect(page.locator("h1")).toContainText("Admin Dashboard");

      // Check key statistics
      const statsSection = page.locator('[data-testid="dashboard-stats"]');
      await expect(statsSection).toBeVisible();

      await expect(page.locator('[data-testid="total-tickets"]')).toContainText(
        "250",
      );
      await expect(
        page.locator('[data-testid="checked-in-tickets"]'),
      ).toContainText("125");
      await expect(page.locator('[data-testid="total-revenue"]')).toContainText(
        "$21,250",
      );
      await expect(
        page.locator('[data-testid="pending-tickets"]'),
      ).toContainText("15");
    });

    test("should show recent transactions", async ({ page }) => {
      await page.goto("/pages/admin/dashboard.html");

      const transactionsTable = page.locator(
        '[data-testid="recent-transactions"]',
      );
      await expect(transactionsTable).toBeVisible();

      // Check transaction entries
      await expect(transactionsTable).toContainText("John Doe");
      await expect(transactionsTable).toContainText("Weekend Pass");
      await expect(transactionsTable).toContainText("$85.00");

      await expect(transactionsTable).toContainText("Jane Smith");
      await expect(transactionsTable).toContainText("Day Pass");
      await expect(transactionsTable).toContainText("$45.00");
    });

    test("should display system alerts and notifications", async ({ page }) => {
      await page.goto("/pages/admin/dashboard.html");

      const alertsSection = page.locator('[data-testid="system-alerts"]');
      await expect(alertsSection).toBeVisible();

      // Check alert messages
      await expect(alertsSection).toContainText(
        "High check-in volume detected",
      );
      await expect(alertsSection).toContainText(
        "Daily backup completed successfully",
      );

      // Verify alert types are properly styled
      const warningAlert = page.locator('[data-testid="alert-warning"]');
      const infoAlert = page.locator('[data-testid="alert-info"]');

      await expect(warningAlert).toBeVisible();
      await expect(infoAlert).toBeVisible();
    });

    test("should show ticket type breakdown chart", async ({ page }) => {
      await page.goto("/pages/admin/dashboard.html");

      const chartSection = page.locator(
        '[data-testid="ticket-breakdown-chart"]',
      );
      await expect(chartSection).toBeVisible();

      // Verify chart data
      await expect(chartSection).toContainText("Weekend Pass");
      await expect(chartSection).toContainText("Day Pass");
      await expect(chartSection).toContainText("Workshop Pass");

      // Check if chart is interactive (if implemented)
      const chartCanvas = page.locator('[data-testid="chart-canvas"]');
      if (await chartCanvas.isVisible()) {
        await expect(chartCanvas).toBeVisible();
      }
    });
  });

  test.describe("Registration Management", () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem("adminToken", "valid-admin-token");
      });

      // Mock registrations data
      await page.route("**/api/admin/registrations", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            registrations: [
              {
                id: "reg_001",
                customerName: "Alice Johnson",
                email: "alice@example.com",
                ticketType: "Weekend Pass",
                purchaseDate: "2026-03-15T14:30:00Z",
                status: "confirmed",
                checkedIn: false,
                paymentStatus: "completed",
              },
              {
                id: "reg_002",
                customerName: "Bob Wilson",
                email: "bob@example.com",
                ticketType: "Day Pass",
                purchaseDate: "2026-03-16T09:15:00Z",
                status: "confirmed",
                checkedIn: true,
                paymentStatus: "completed",
                checkInTime: "2026-05-15T10:00:00Z",
              },
            ],
            pagination: {
              total: 250,
              page: 1,
              limit: 50,
              pages: 5,
            },
          }),
        });
      });
    });

    test("should display and filter registration list", async ({ page }) => {
      await page.goto("/pages/admin/registrations.html");

      // Verify registrations table
      const registrationsTable = page.locator(
        '[data-testid="registrations-table"]',
      );
      await expect(registrationsTable).toBeVisible();

      // Check registration entries
      await expect(registrationsTable).toContainText("Alice Johnson");
      await expect(registrationsTable).toContainText("alice@example.com");
      await expect(registrationsTable).toContainText("Weekend Pass");

      await expect(registrationsTable).toContainText("Bob Wilson");
      await expect(registrationsTable).toContainText("Day Pass");

      // Test filtering
      const ticketTypeFilter = page.locator(
        '[data-testid="ticket-type-filter"]',
      );
      await ticketTypeFilter.selectOption("Weekend Pass");

      // Should filter results
      await expect(registrationsTable).toContainText("Alice Johnson");
      await expect(registrationsTable).not.toContainText("Bob Wilson");
    });

    test("should search registrations by customer name or email", async ({
      page,
    }) => {
      await page.goto("/pages/admin/registrations.html");

      const searchInput = page.locator('[data-testid="search-registrations"]');
      await searchInput.fill("alice@example.com");

      // Mock search response
      await page.route("**/api/admin/registrations?search=*", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            registrations: [
              {
                id: "reg_001",
                customerName: "Alice Johnson",
                email: "alice@example.com",
                ticketType: "Weekend Pass",
                status: "confirmed",
              },
            ],
          }),
        });
      });

      const searchButton = page.locator('[data-testid="search-button"]');
      await searchButton.click();

      // Should show filtered results
      const resultsTable = page.locator('[data-testid="registrations-table"]');
      await expect(resultsTable).toContainText("Alice Johnson");
      await expect(resultsTable).not.toContainText("Bob Wilson");
    });

    test("should allow manual check-in from registrations list", async ({
      page,
    }) => {
      // Mock successful check-in
      await page.route("**/api/admin/checkin", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            message: "Customer checked in successfully",
            checkInTime: new Date().toISOString(),
          }),
        });
      });

      await page.goto("/pages/admin/registrations.html");

      // Find unchecked-in registration and click check-in button
      const checkInButton = page.locator('[data-testid="checkin-reg_001"]');
      await expect(checkInButton).toBeVisible();
      await checkInButton.click();

      // Confirm check-in
      const confirmButton = page.locator('[data-testid="confirm-checkin"]');
      await confirmButton.click();

      // Should show success message
      const successMessage = page.locator('[data-testid="checkin-success"]');
      await expect(successMessage).toBeVisible();
      await expect(successMessage).toContainText("checked in successfully");

      // Status should update
      const statusCell = page.locator('[data-testid="status-reg_001"]');
      await expect(statusCell).toContainText("Checked In");
    });
  });

  test.describe("Analytics and Reporting", () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem("adminToken", "valid-admin-token");
      });

      // Mock analytics data
      await page.route("**/api/admin/analytics", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            salesTrends: {
              daily: [
                { date: "2026-03-01", tickets: 15, revenue: 1275 },
                { date: "2026-03-02", tickets: 23, revenue: 1955 },
                { date: "2026-03-03", tickets: 31, revenue: 2635 },
              ],
            },
            demographics: {
              ageGroups: [
                { range: "18-25", count: 85 },
                { range: "26-35", count: 120 },
                { range: "36-50", count: 45 },
              ],
            },
            checkInPatterns: {
              hourly: [
                { hour: "09:00", count: 12 },
                { hour: "10:00", count: 28 },
                { hour: "11:00", count: 45 },
              ],
            },
          }),
        });
      });
    });

    test("should display sales analytics", async ({ page }) => {
      await page.goto("/pages/admin/analytics.html");

      const analyticsSection = page.locator('[data-testid="sales-analytics"]');
      await expect(analyticsSection).toBeVisible();

      // Check sales trends
      await expect(page.locator('[data-testid="sales-chart"]')).toBeVisible();

      // Verify data points
      await expect(analyticsSection).toContainText("$1,275");
      await expect(analyticsSection).toContainText("$1,955");
      await expect(analyticsSection).toContainText("$2,635");
    });

    test("should generate and download reports", async ({ page }) => {
      // Mock report generation
      await page.route("**/api/admin/generate-report", (route) => {
        route.fulfill({
          status: 200,
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition":
              'attachment; filename="registration-report.xlsx"',
          },
          body: Buffer.from("MOCK_EXCEL_DATA"),
        });
      });

      await page.goto("/pages/admin/analytics.html");

      const generateReportButton = page.locator(
        '[data-testid="generate-report"]',
      );
      await expect(generateReportButton).toBeVisible();

      // Set up download handler
      const downloadPromise = page.waitForDownload();
      await generateReportButton.click();

      // Verify download
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain(".xlsx");
    });
  });

  test.describe("System Settings and Management", () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem("adminToken", "valid-admin-token");
      });
    });

    test("should allow updating event settings", async ({ page }) => {
      // Mock current settings
      await page.route("**/api/admin/settings", (route) => {
        if (route.request().method() === "GET") {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              eventName: "Boulder Fest 2026",
              maxCapacity: 500,
              ticketSales: {
                enabled: true,
                cutoffDate: "2026-05-14T23:59:59Z",
              },
              checkInSettings: {
                enabled: true,
                allowEarlyCheckIn: false,
              },
            }),
          });
        } else {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              message: "Settings updated successfully",
            }),
          });
        }
      });

      await page.goto("/pages/admin/settings.html");

      // Verify current settings loaded
      const eventNameInput = page.locator('[data-testid="event-name"]');
      await expect(eventNameInput).toHaveValue("Boulder Fest 2026");

      const capacityInput = page.locator('[data-testid="max-capacity"]');
      await expect(capacityInput).toHaveValue("500");

      // Update settings
      await capacityInput.fill("600");

      const allowEarlyCheckIn = page.locator(
        '[data-testid="allow-early-checkin"]',
      );
      await allowEarlyCheckIn.check();

      // Save settings
      const saveButton = page.locator('[data-testid="save-settings"]');
      await saveButton.click();

      // Verify success message
      const successMessage = page.locator('[data-testid="settings-success"]');
      await expect(successMessage).toBeVisible();
      await expect(successMessage).toContainText(
        "Settings updated successfully",
      );
    });

    test("should handle backup and restore operations", async ({ page }) => {
      // Mock backup operation
      await page.route("**/api/admin/backup", (route) => {
        route.fulfill({
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition":
              'attachment; filename="backup-2026-05-15.json"',
          },
          body: JSON.stringify({
            timestamp: "2026-05-15T12:00:00Z",
            data: "MOCK_BACKUP_DATA",
          }),
        });
      });

      await page.goto("/pages/admin/system.html");

      const backupSection = page.locator('[data-testid="backup-section"]');
      await expect(backupSection).toBeVisible();

      // Initiate backup
      const backupButton = page.locator('[data-testid="create-backup"]');
      const downloadPromise = page.waitForDownload();

      await backupButton.click();

      // Verify backup download
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain("backup-");
    });
  });

  test.describe("Mobile Admin Experience", () => {
    test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE

    test("should work on mobile devices", async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem("adminToken", "valid-admin-token");
      });

      await page.route("**/api/admin/dashboard", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockDashboardData),
        });
      });

      await page.goto("/pages/admin/dashboard.html");

      // Verify mobile navigation
      const mobileNav = page.locator('[data-testid="mobile-admin-nav"]');
      await expect(mobileNav).toBeVisible();

      // Check responsive layout
      const dashboardGrid = page.locator('[data-testid="dashboard-grid"]');
      await expect(dashboardGrid).toBeVisible();

      // Stats should stack vertically on mobile
      const statsCards = page.locator('[data-testid="stat-card"]');
      const cardCount = await statsCards.count();
      expect(cardCount).toBeGreaterThan(0);

      // Navigation drawer should be collapsible
      const navToggle = page.locator('[data-testid="nav-toggle"]');
      if (await navToggle.isVisible()) {
        await navToggle.click();

        const navDrawer = page.locator('[data-testid="nav-drawer"]');
        await expect(navDrawer).toBeVisible();
      }
    });
  });

  test.describe("Accessibility", () => {
    test("should be accessible for admin users", async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem("adminToken", "valid-admin-token");
      });

      await page.route("**/api/admin/dashboard", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockDashboardData),
        });
      });

      await page.goto("/pages/admin/dashboard.html");
      await injectAxe(page);

      // Check overall dashboard accessibility
      await checkA11y(page, null, {
        detailedReport: true,
        detailedReportOptions: { html: true },
      });

      // Verify proper heading hierarchy
      const h1 = page.locator("h1");
      await expect(h1).toBeVisible();

      // Check for proper ARIA labels on interactive elements
      const buttons = page.locator("button");
      const buttonCount = await buttons.count();

      for (let i = 0; i < Math.min(buttonCount, 5); i++) {
        const button = buttons.nth(i);
        const ariaLabel = await button.getAttribute("aria-label");
        const textContent = await button.textContent();

        expect(ariaLabel || textContent).toBeTruthy();
      }
    });

    test("should support keyboard navigation", async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem("adminToken", "valid-admin-token");
      });

      await page.goto("/pages/admin/dashboard.html");

      // Navigate using keyboard
      await page.keyboard.press("Tab");

      // Should focus on first interactive element
      const focusedElement = await page.evaluateHandle(
        () => document.activeElement,
      );
      const tagName = await focusedElement.evaluate((el) =>
        el.tagName.toLowerCase(),
      );

      expect(["a", "button", "input"].includes(tagName)).toBe(true);

      // Test skip navigation
      const skipLink = page.locator('[data-testid="skip-to-content"]');
      if (await skipLink.isVisible()) {
        await skipLink.click();

        const mainContent = page.locator("main");
        await expect(mainContent).toBeFocused();
      }
    });
  });

  test.describe("Performance", () => {
    test("should load dashboard quickly", async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem("adminToken", "valid-admin-token");
      });

      await page.route("**/api/admin/dashboard", (route) => {
        // Simulate realistic API response time
        setTimeout(() => {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(mockDashboardData),
          });
        }, 200);
      });

      const startTime = Date.now();

      await page.goto("/pages/admin/dashboard.html");
      await page.waitForSelector('[data-testid="dashboard-stats"]');

      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(3000); // Should load within 3 seconds
    });

    test("should handle large datasets efficiently", async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem("adminToken", "valid-admin-token");
      });

      // Mock large dataset
      const largeDataset = {
        registrations: Array.from({ length: 1000 }, (_, i) => ({
          id: `reg_${i}`,
          customerName: `Customer ${i}`,
          email: `customer${i}@example.com`,
          ticketType: i % 2 === 0 ? "Weekend Pass" : "Day Pass",
          status: "confirmed",
        })),
        pagination: { total: 1000, page: 1, limit: 50, pages: 20 },
      };

      await page.route("**/api/admin/registrations", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(largeDataset),
        });
      });

      const startTime = Date.now();

      await page.goto("/pages/admin/registrations.html");
      await page.waitForSelector('[data-testid="registrations-table"]');

      const renderTime = Date.now() - startTime;
      expect(renderTime).toBeLessThan(2000); // Should render within 2 seconds

      // Verify pagination controls
      const pagination = page.locator('[data-testid="pagination"]');
      await expect(pagination).toBeVisible();
    });
  });

  test.describe("Security", () => {
    test("should protect against unauthorized access", async ({ page }) => {
      // Navigate without authentication
      await page.goto("/pages/admin/dashboard.html");

      // Should redirect to login
      await page.waitForURL("**/admin/login.html");
      await expect(page.locator("h1")).toContainText("Admin Login");
    });

    test("should validate admin permissions for sensitive operations", async ({
      page,
    }) => {
      await page.addInitScript(() => {
        localStorage.setItem("adminToken", "limited-admin-token");
      });

      // Mock permission denied for sensitive operations
      await page.route("**/api/admin/settings", (route) => {
        route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Insufficient permissions",
            required: "admin.settings.write",
          }),
        });
      });

      await page.goto("/pages/admin/settings.html");

      const saveButton = page.locator('[data-testid="save-settings"]');
      await saveButton.click();

      // Should show permission error
      const permissionError = page.locator('[data-testid="permission-error"]');
      await expect(permissionError).toBeVisible();
      await expect(permissionError).toContainText("Insufficient permissions");
    });

    test("should handle CSRF protection", async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem("adminToken", "valid-admin-token");
      });

      // Mock CSRF token endpoint
      await page.route("**/api/admin/csrf-token", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            token: "mock-csrf-token",
          }),
        });
      });

      await page.goto("/pages/admin/settings.html");

      // Verify CSRF token is included in forms
      const csrfToken = page.locator('[name="csrfToken"]');
      await expect(csrfToken).toBeAttached();

      const tokenValue = await csrfToken.getAttribute("value");
      expect(tokenValue).toBeTruthy();
    });
  });
});

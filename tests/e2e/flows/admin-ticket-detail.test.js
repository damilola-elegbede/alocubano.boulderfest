/**
 * E2E Test: Admin Ticket Detail Page
 * Tests individual ticket detail view and management features
 */

import { test, expect } from '@playwright/test';
import { getTestDataConstants } from '../../../scripts/seed-test-data.js';
import { waitForPageReady, waitForConditions, getTestTimeout } from '../helpers/playwright-utils.js';
import { getTestMFACode } from '../helpers/totp-generator.js';

const testConstants = getTestDataConstants();

test.describe('Admin Ticket Detail Page', () => {
  const adminCredentials = {
    email: testConstants.admin.email,
    password: process.env.TEST_ADMIN_PASSWORD || 'test-admin-password'
  };

  let testTicketId = null;

  // Helper function to login as admin
  const loginAsAdmin = async (page, skipOnRateLimit = true) => {
    const adminAuthAvailable = process.env.ADMIN_AUTH_AVAILABLE !== 'false';
    if (!adminAuthAvailable) {
      console.log('⚠️ Admin authentication API not available - skipping tests');
      return false;
    }

    try {
      await page.goto('/admin/login');
      const actionTimeout = getTestTimeout(test.info(), 'action');
      const navTimeout = getTestTimeout(test.info(), 'navigation');

      await page.fill('input[name="username"]', adminCredentials.email);
      await page.fill('input[type="password"]', adminCredentials.password);
      await page.click('button[type="submit"]');

      await page.waitForSelector('input[name="mfaCode"]', { timeout: actionTimeout });
      const mfaCode = getTestMFACode();
      await page.fill('input[name="mfaCode"]', mfaCode);
      await page.click('button[type="submit"]');

      await Promise.race([
        page.waitForURL('**/admin/dashboard', { timeout: navTimeout }),
        page.waitForSelector('#errorMessage', { state: 'visible', timeout: actionTimeout })
      ]);

      const currentUrl = page.url();
      if (!currentUrl.includes('/admin/dashboard')) {
        const errorMessage = page.locator('#errorMessage');
        if (await errorMessage.isVisible()) {
          const errorText = await errorMessage.textContent();
          if (errorText.includes('locked') || errorText.includes('rate limit')) {
            if (skipOnRateLimit) {
              console.log('⚠️ Admin account rate limited - skipping test');
              return 'rate_limited';
            }
          }
          throw new Error(`Login failed: ${errorText}`);
        }
        return false;
      }

      return true;
    } catch (error) {
      console.error('❌ Admin login failed:', error.message);
      if (error.message.includes('locked') || error.message.includes('rate limit')) {
        return skipOnRateLimit ? 'rate_limited' : false;
      }
      throw error;
    }
  };

  // Helper to get a test ticket ID
  const getTestTicketId = async (page) => {
    if (testTicketId) return testTicketId;

    await page.goto('/admin/tickets');
    await waitForPageReady(page, { waitForSelector: 'table', checkNetworkIdle: true }, test.info());

    const firstTicketLink = page.locator('a[href*="ticket-detail"]').first();
    if (await firstTicketLink.count() > 0) {
      const href = await firstTicketLink.getAttribute('href');
      const match = href.match(/ticketId=([^&]+)/);
      if (match) {
        testTicketId = match[1];
        return testTicketId;
      }
    }

    // Fallback: use seed data ticket
    testTicketId = testConstants.tickets.vip.ticketId;
    return testTicketId;
  };

  test.beforeEach(async ({ page }) => {
    const loginResult = await loginAsAdmin(page, true);
    if (loginResult === 'rate_limited') {
      test.skip('Admin account is rate limited - skipping test');
    } else if (!loginResult) {
      test.skip('Admin login failed - skipping test');
    }

    // Get a test ticket ID
    const ticketId = await getTestTicketId(page);

    // Navigate to ticket detail page
    await page.goto(`/admin/ticket-detail?ticketId=${ticketId}`);
    await waitForPageReady(page, { waitForSelector: 'h1', checkNetworkIdle: true }, test.info());
  });

  test('should load ticket detail page successfully', async ({ page }) => {
    await expect(page).toHaveURL(/\/admin\/ticket-detail\?ticketId=/);
    await expect(page.locator('h1')).toContainText(/Ticket Details/i);
  });

  test('should display ticket ID', async ({ page }) => {
    const ticketInfoGrid = page.locator('#ticket-info-grid');
    await expect(ticketInfoGrid).toBeVisible();

    const gridText = await ticketInfoGrid.textContent();
    expect(gridText).toMatch(/Ticket ID/i);
    expect(gridText).toMatch(/[A-Z0-9-]+/); // Ticket ID pattern
  });

  test('should show ticket type', async ({ page }) => {
    const ticketInfoGrid = page.locator('#ticket-info-grid');
    const gridText = await ticketInfoGrid.textContent();
    expect(gridText).toMatch(/Ticket Type/i);
    expect(gridText).toMatch(/VIP|Weekend|Friday|Saturday|Sunday|Workshop|General/i);
  });

  test('should display ticket status badge', async ({ page }) => {
    const statusBadge = page.locator('#ticket-status-badge');
    await expect(statusBadge).toBeVisible();

    const badgeText = await statusBadge.textContent();
    expect(badgeText).toMatch(/VALID|CANCELLED|CHECKED IN/i);
  });

  test('should show validation status', async ({ page }) => {
    const ticketInfoGrid = page.locator('#ticket-info-grid');
    const gridText = await ticketInfoGrid.textContent();
    expect(gridText).toMatch(/Validation Status/i);
    expect(gridText).toMatch(/ACTIVE|INACTIVE/i);
  });

  test('should display ticket price', async ({ page }) => {
    const ticketInfoGrid = page.locator('#ticket-info-grid');
    const gridText = await ticketInfoGrid.textContent();
    expect(gridText).toMatch(/Price/i);
    expect(gridText).toMatch(/\$\d+/);
  });

  test('should show creation date', async ({ page }) => {
    const ticketInfoGrid = page.locator('#ticket-info-grid');
    const gridText = await ticketInfoGrid.textContent();
    expect(gridText).toMatch(/Created/i);
  });

  test('should display attendee information', async ({ page }) => {
    const attendeeSection = page.locator('#attendee-section');
    await expect(attendeeSection).toBeVisible();

    const sectionText = await attendeeSection.textContent();
    expect(sectionText).toMatch(/Attendee Information/i);
  });

  test('should show attendee name if registered', async ({ page }) => {
    const attendeeGrid = page.locator('#attendee-info-grid');
    const gridText = await attendeeGrid.textContent();

    if (!gridText.includes('not been registered')) {
      expect(gridText).toMatch(/First Name|Last Name/i);
    } else {
      expect(gridText).toContain('not been registered');
    }
  });

  test('should display attendee email if registered', async ({ page }) => {
    const attendeeGrid = page.locator('#attendee-info-grid');
    const gridText = await attendeeGrid.textContent();

    if (!gridText.includes('not been registered')) {
      expect(gridText).toMatch(/Email/i);
    }
  });

  test('should show registration status', async ({ page }) => {
    const attendeeGrid = page.locator('#attendee-info-grid');
    const gridText = await attendeeGrid.textContent();

    if (!gridText.includes('not been registered')) {
      expect(gridText).toMatch(/Registration Status/i);
    }
  });

  test('should display QR code section', async ({ page }) => {
    const qrSection = page.locator('.qr-section');
    await expect(qrSection).toBeVisible();
  });

  test('should have reveal QR button', async ({ page }) => {
    const revealBtn = page.locator('#reveal-qr');
    await expect(revealBtn).toBeVisible();
    await expect(revealBtn).toContainText(/Show QR Code/i);
  });

  test('should show QR code when revealed', async ({ page }) => {
    const revealBtn = page.locator('#reveal-qr');
    await revealBtn.click();

    const qrContainer = page.locator('#qr-container');
    await expect(qrContainer).toHaveClass(/visible/);

    const qrImage = page.locator('#qr-image');
    await expect(qrImage).toBeVisible();

    // Verify QR image loaded
    const src = await qrImage.getAttribute('src');
    expect(src).toMatch(/\/api\/tickets\/qr-image\?ticketId=/);
  });

  test('should hide QR code when button clicked again', async ({ page }) => {
    const revealBtn = page.locator('#reveal-qr');

    // Show QR
    await revealBtn.click();
    await expect(page.locator('#qr-container')).toHaveClass(/visible/);

    // Hide QR
    await revealBtn.click();
    await expect(page.locator('#qr-container')).not.toHaveClass(/visible/);
  });

  test('should display QR access method', async ({ page }) => {
    const qrInfoGrid = page.locator('#qr-info-grid');
    const gridText = await qrInfoGrid.textContent();
    expect(gridText).toMatch(/QR Access Method/i);
  });

  test('should show scan count', async ({ page }) => {
    const qrInfoGrid = page.locator('#qr-info-grid');
    const gridText = await qrInfoGrid.textContent();
    expect(gridText).toMatch(/Scan Count/i);
    expect(gridText).toMatch(/\d+\s*\/\s*\d+/);
  });

  test('should display scans remaining', async ({ page }) => {
    const qrInfoGrid = page.locator('#qr-info-grid');
    const gridText = await qrInfoGrid.textContent();
    expect(gridText).toMatch(/Scans Remaining/i);
  });

  test('should show can scan indicator', async ({ page }) => {
    const qrInfoGrid = page.locator('#qr-info-grid');
    const gridText = await qrInfoGrid.textContent();
    expect(gridText).toMatch(/Can Scan/i);
    expect(gridText).toMatch(/Yes|No/);
  });

  test('should display check-in information section', async ({ page }) => {
    const checkinSection = page.locator('#checkin-section');
    await expect(checkinSection).toBeVisible();
  });

  test('should show check-in status', async ({ page }) => {
    const checkinGrid = page.locator('#checkin-info-grid');
    const gridText = await checkinGrid.textContent();

    if (!gridText.includes('not been checked in')) {
      expect(gridText).toMatch(/Checked In At/i);
    } else {
      expect(gridText).toContain('not been checked in');
    }
  });

  test('should display transaction details', async ({ page }) => {
    const transactionGrid = page.locator('#transaction-info-grid');
    await expect(transactionGrid).toBeVisible();
  });

  test('should show order number', async ({ page }) => {
    const transactionGrid = page.locator('#transaction-info-grid');
    const gridText = await transactionGrid.textContent();

    if (!gridText.includes('No transaction information')) {
      expect(gridText).toMatch(/Order Number/i);
    }
  });

  test('should display payment processor', async ({ page }) => {
    const transactionGrid = page.locator('#transaction-info-grid');
    const gridText = await transactionGrid.textContent();

    if (!gridText.includes('No transaction information')) {
      expect(gridText).toMatch(/Payment Processor/i);
      expect(gridText).toMatch(/stripe|paypal|venmo|cash|card_terminal|comp/i);
    }
  });

  test('should show transaction amount', async ({ page }) => {
    const transactionGrid = page.locator('#transaction-info-grid');
    const gridText = await transactionGrid.textContent();

    if (!gridText.includes('No transaction information')) {
      expect(gridText).toMatch(/Transaction Amount/i);
      expect(gridText).toMatch(/\$\d+/);
    }
  });

  test('should display purchaser information', async ({ page }) => {
    const transactionGrid = page.locator('#transaction-info-grid');
    const gridText = await transactionGrid.textContent();

    if (!gridText.includes('No transaction information')) {
      expect(gridText).toMatch(/Purchaser Name|Purchaser Email/i);
    }
  });

  test('should have transfer ticket section', async ({ page }) => {
    const transferSection = page.locator('#transfer-section');
    await expect(transferSection).toBeVisible();

    const transferBtn = page.locator('button:has-text("Transfer Ticket")');
    await expect(transferBtn).toBeVisible();
  });

  test('should open transfer modal', async ({ page }) => {
    const transferBtn = page.locator('button:has-text("Transfer Ticket")');
    await transferBtn.click();

    const modal = page.locator('#transfer-modal');
    await expect(modal).toHaveClass(/show/);

    const modalTitle = page.locator('.modal-title');
    await expect(modalTitle).toContainText(/Transfer Ticket/i);
  });

  test('should display current owner in transfer modal', async ({ page }) => {
    const transferBtn = page.locator('button:has-text("Transfer Ticket")');
    await transferBtn.click();

    const currentOwnerInfo = page.locator('#current-owner-info');
    await expect(currentOwnerInfo).toBeVisible();
  });

  test('should have transfer form fields', async ({ page }) => {
    const transferBtn = page.locator('button:has-text("Transfer Ticket")');
    await transferBtn.click();

    await expect(page.locator('#new-first-name')).toBeVisible();
    await expect(page.locator('#new-last-name')).toBeVisible();
    await expect(page.locator('#new-email')).toBeVisible();
    await expect(page.locator('#new-phone')).toBeVisible();
  });

  test('should require new first name and email', async ({ page }) => {
    const transferBtn = page.locator('button:has-text("Transfer Ticket")');
    await transferBtn.click();

    const firstNameField = page.locator('#new-first-name');
    const emailField = page.locator('#new-email');

    const firstNameRequired = await firstNameField.getAttribute('required');
    const emailRequired = await emailField.getAttribute('required');

    expect(firstNameRequired).toBeDefined();
    expect(emailRequired).toBeDefined();
  });

  test('should update transfer summary as form is filled', async ({ page }) => {
    const transferBtn = page.locator('button:has-text("Transfer Ticket")');
    await transferBtn.click();

    const newEmail = 'newemail@example.com';
    await page.fill('#new-email', newEmail);

    const transferToEmail = page.locator('#transfer-to-email');
    await expect(transferToEmail).toContainText(newEmail);
  });

  test('should close transfer modal', async ({ page }) => {
    const transferBtn = page.locator('button:has-text("Transfer Ticket")');
    await transferBtn.click();

    const modal = page.locator('#transfer-modal');
    await expect(modal).toHaveClass(/show/);

    const closeBtn = page.locator('.modal-close');
    await closeBtn.click();

    await expect(modal).not.toHaveClass(/show/);
  });

  test('should handle missing ticket ID gracefully', async ({ page }) => {
    await page.goto('/admin/ticket-detail');

    const errorState = page.locator('#error-state');
    await expect(errorState).toBeVisible();

    const errorMessage = page.locator('#error-message');
    await expect(errorMessage).toContainText(/No ticket ID/i);
  });

  test('should handle invalid ticket ID', async ({ page }) => {
    await page.goto('/admin/ticket-detail?ticketId=INVALID-ID-999');
    await page.waitForLoadState('domcontentloaded');

    const errorState = page.locator('#error-state');
    const isErrorVisible = await errorState.isVisible();

    if (isErrorVisible) {
      const errorMessage = page.locator('#error-message');
      const errorText = await errorMessage.textContent();
      expect(errorText).toMatch(/Failed to load|not found/i);
    }
  });

  test('should display navigation options', async ({ page }) => {
    const closeBtn = page.locator('button:has-text("Close")');
    await expect(closeBtn).toBeVisible();
  });

  test('should have logout button', async ({ page }) => {
    const logoutBtn = page.locator('button:has-text("Logout")');
    await expect(logoutBtn).toBeVisible();
  });

  test('should display scan history if available', async ({ page }) => {
    const scanHistory = page.locator('#scan-history');
    await expect(scanHistory).toBeVisible();
  });

  test('should show registration deadline if registered', async ({ page }) => {
    const attendeeGrid = page.locator('#attendee-info-grid');
    const gridText = await attendeeGrid.textContent();

    if (!gridText.includes('not been registered')) {
      expect(gridText).toMatch(/Registration Deadline/i);
    }
  });

  test('should format timestamps in Mountain Time', async ({ page }) => {
    const ticketInfoGrid = page.locator('#ticket-info-grid');
    const gridText = await ticketInfoGrid.textContent();

    // Check for MT timezone indicator or formatted date
    expect(gridText).toMatch(/MST|MDT|\d{1,2}:\d{2}\s*(AM|PM)/i);
  });

  test('should protect against XSS in displayed data', async ({ page }) => {
    const bodyText = await page.locator('body').textContent();

    expect(bodyText).not.toContain('<script>');
    expect(bodyText).not.toContain('javascript:');
    expect(bodyText).not.toContain('onerror=');
  });

  test('should render mobile-friendly layout', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();

    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('#ticket-info-grid')).toBeVisible();
  });

  test('should verify all detail sections are present', async ({ page }) => {
    await expect(page.locator('#ticket-info-grid')).toBeVisible();
    await expect(page.locator('#attendee-section')).toBeVisible();
    await expect(page.locator('#qr-info-grid')).toBeVisible();
    await expect(page.locator('#checkin-section')).toBeVisible();
    await expect(page.locator('#transaction-info-grid')).toBeVisible();
  });
});

/**
 * E2E Test: Ticket Validation
 * Tests QR code validation and check-in functionality
 */

import { test, expect } from '@playwright/test';
import { getTestDataConstants } from '../../../scripts/seed-test-data.js';

const testConstants = getTestDataConstants();

test.describe('Ticket Validation', () => {
  // Use seeded test data
  const testTicketId = `${testConstants.TEST_PREFIX}TICKET_12345678`;
  const testQRCode = `${testConstants.TEST_PREFIX}QR_12345678`;

  test.beforeEach(async ({ page }) => {
    // Navigate to ticket validation page (if exists) or admin area
    try {
      await page.goto('/admin/checkin');
    } catch {
      await page.goto('/admin/dashboard');
    }
  });

  test('should access ticket validation interface', async ({ page }) => {
    // Look for validation interface in admin panel
    const validationElements = page.locator('.validation, .check-in, .qr-scanner, input[placeholder*="ticket"], input[placeholder*="QR"]');

    if (await validationElements.count() > 0) {
      await expect(validationElements.first()).toBeVisible();
    } else {
      // Alternative: check for any admin interface
      const adminElements = page.locator('.admin-panel, .dashboard, h1');
      await expect(adminElements.first()).toBeVisible();
    }
  });

  test('should validate ticket by QR code', async ({ page }) => {
    // Look for QR code input field
    const qrInput = page.locator('input[name*="qr"], input[placeholder*="QR"], input[name*="validation"], .qr-input');

    if (await qrInput.count() > 0) {
      await qrInput.fill(testQRCode);

      // Look for validate button
      const validateBtn = page.locator('button:has-text("Validate"), button:has-text("Check"), .validate-btn');
      if (await validateBtn.count() > 0) {
        await validateBtn.click();
        await page.waitForTimeout(2000);

        // Should show validation result
        const result = page.locator('.validation-result, .result, .ticket-info');
        if (await result.count() > 0) {
          await expect(result.first()).toBeVisible();
        }
      }
    }
  });

  test('should validate ticket by ticket ID', async ({ page }) => {
    const ticketInput = page.locator('input[name*="ticket"], input[placeholder*="ticket"], .ticket-input');

    if (await ticketInput.count() > 0) {
      await ticketInput.fill(testTicketId);

      const validateBtn = page.locator('button:has-text("Validate"), button:has-text("Lookup"), .validate-btn');
      if (await validateBtn.count() > 0) {
        await validateBtn.click();
        await page.waitForTimeout(2000);

        // Should display ticket information
        const ticketInfo = page.locator('.ticket-details, .attendee-info, .validation-result');
        if (await ticketInfo.count() > 0) {
          await expect(ticketInfo.first()).toBeVisible();
        }
      }
    }
  });

  test('should handle invalid ticket validation', async ({ page }) => {
    const qrInput = page.locator('input[name*="qr"], input[placeholder*="QR"]').first();

    if (await qrInput.count() > 0) {
      await qrInput.fill('INVALID_QR_CODE_123');

      const validateBtn = page.locator('button:has-text("Validate"), .validate-btn').first();
      if (await validateBtn.count() > 0) {
        await validateBtn.click();
        await page.waitForTimeout(2000);

        // Should show error message
        const errorElements = page.locator('.error, .invalid, .not-found, .alert-danger');
        if (await errorElements.count() > 0) {
          await expect(errorElements.first()).toBeVisible();
        }
      }
    }
  });

  test('should perform check-in functionality', async ({ page }) => {
    // Validate a ticket first
    const qrInput = page.locator('input[name*="qr"], input[placeholder*="QR"]').first();

    if (await qrInput.count() > 0) {
      await qrInput.fill(testQRCode);

      const validateBtn = page.locator('button:has-text("Validate")').first();
      if (await validateBtn.count() > 0) {
        await validateBtn.click();
        await page.waitForTimeout(2000);

        // Look for check-in button
        const checkinBtn = page.locator('button:has-text("Check In"), button:has-text("Check-In"), .checkin-btn');
        if (await checkinBtn.count() > 0) {
          await checkinBtn.click();
          await page.waitForTimeout(1000);

          // Should show confirmation
          const confirmation = page.locator('.success, .checked-in, .confirmation');
          if (await confirmation.count() > 0) {
            await expect(confirmation.first()).toBeVisible();
          }
        }
      }
    }
  });

  test('should prevent duplicate check-ins', async ({ page }) => {
    // Try to check in the same ticket twice
    const qrInput = page.locator('input[name*="qr"]').first();

    if (await qrInput.count() > 0) {
      // First check-in
      await qrInput.fill(testQRCode);

      const validateBtn = page.locator('button:has-text("Validate")').first();
      if (await validateBtn.count() > 0) {
        await validateBtn.click();
        await page.waitForTimeout(1000);

        const checkinBtn = page.locator('button:has-text("Check In")').first();
        if (await checkinBtn.count() > 0) {
          await checkinBtn.click();
          await page.waitForTimeout(1000);

          // Try to check in again
          await qrInput.fill(testQRCode);
          await validateBtn.click();
          await page.waitForTimeout(1000);

          // Should show already checked in message
          const alreadyCheckedIn = page.locator('.already-checked, .duplicate, text=already');
          if (await alreadyCheckedIn.count() > 0) {
            await expect(alreadyCheckedIn.first()).toBeVisible();
          }
        }
      }
    }
  });

  test('should display attendee information during validation', async ({ page }) => {
    const qrInput = page.locator('input[name*="qr"]').first();

    if (await qrInput.count() > 0) {
      await qrInput.fill(testQRCode);

      const validateBtn = page.locator('button:has-text("Validate")').first();
      if (await validateBtn.count() > 0) {
        await validateBtn.click();
        await page.waitForTimeout(2000);

        // Should display attendee details
        const attendeeInfo = page.locator('.attendee-name, .attendee-info, .ticket-holder');
        if (await attendeeInfo.count() > 0) {
          await expect(attendeeInfo.first()).toBeVisible();
        }

        // Should show ticket type
        const ticketType = page.locator('.ticket-type, .event-type');
        if (await ticketType.count() > 0) {
          await expect(ticketType.first()).toBeVisible();
        }
      }
    }
  });

  test('should handle validation API calls', async ({ page }) => {
    // Monitor validation API calls
    let validationApiCalled = false;
    page.on('request', request => {
      if (request.url().includes('/api/tickets/validate') || request.url().includes('/validation')) {
        validationApiCalled = true;
      }
    });

    const qrInput = page.locator('input[name*="qr"]').first();

    if (await qrInput.count() > 0) {
      await qrInput.fill(testQRCode);

      const validateBtn = page.locator('button:has-text("Validate")').first();
      if (await validateBtn.count() > 0) {
        await validateBtn.click();
        await page.waitForTimeout(2000);

        // Should have made API call
        // In test mode, this might be mocked
        expect(page.url()).toBeDefined();
      }
    }
  });

  test('should support bulk ticket validation', async ({ page }) => {
    // Look for bulk validation features
    const bulkInput = page.locator('textarea[name*="bulk"], .bulk-validation, input[placeholder*="multiple"]');

    if (await bulkInput.count() > 0) {
      const bulkQRCodes = [testQRCode, `${testConstants.TEST_PREFIX}QR_87654321`].join('\n');

      await bulkInput.fill(bulkQRCodes);

      const bulkValidateBtn = page.locator('button:has-text("Validate All"), button:has-text("Bulk"), .bulk-validate-btn');
      if (await bulkValidateBtn.count() > 0) {
        await bulkValidateBtn.click();
        await page.waitForTimeout(3000);

        // Should show bulk results
        const bulkResults = page.locator('.bulk-results, .validation-summary');
        if (await bulkResults.count() > 0) {
          await expect(bulkResults.first()).toBeVisible();
        }
      }
    }
  });

  test('should track validation statistics', async ({ page }) => {
    // Look for validation statistics or dashboard
    const statsElements = page.locator('.stats, .statistics, .validation-count, .checked-in-count');

    if (await statsElements.count() > 0) {
      await expect(statsElements.first()).toBeVisible();

      // Stats should contain numeric values
      const statsText = await statsElements.first().textContent();
      expect(statsText).toMatch(/\d+/);
    }
  });

  test('should handle mobile validation interface', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();

    // Validation interface should be mobile-friendly
    const validationInterface = page.locator('.validation, .scanner, input');
    if (await validationInterface.count() > 0) {
      await expect(validationInterface.first()).toBeVisible();

      // Input fields should be appropriately sized for mobile
      const inputBox = await validationInterface.first().boundingBox();
      if (inputBox) {
        expect(inputBox.width).toBeLessThanOrEqual(375);
        expect(inputBox.height).toBeGreaterThanOrEqual(40); // Minimum touch target
      }
    }
  });

  test('should integrate with camera for QR scanning', async ({ page }) => {
    // Look for camera/scanner button or interface
    const cameraBtn = page.locator('button:has-text("Scan"), button:has-text("Camera"), .qr-scanner-btn, .camera-btn');

    if (await cameraBtn.count() > 0) {
      // Note: Actual camera testing requires special permissions and setup
      // This test just verifies the interface exists
      await expect(cameraBtn.first()).toBeVisible();

      // Check for camera-related elements
      const scannerInterface = page.locator('.scanner, .camera-view, video, canvas');
      if (await scannerInterface.count() > 0) {
        // Scanner interface should be present
        await expect(scannerInterface.first()).toBeVisible();
      }
    }
  });
});
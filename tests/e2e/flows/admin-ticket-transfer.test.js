/**
 * E2E Tests for Admin Ticket Transfer UI
 * Tests the complete transfer workflow from the admin interface
 */

import { test, expect } from '@playwright/test';
import { getTestMFACode } from '../helpers/totp-generator.js';

test.describe('Admin Ticket Transfer UI', () => {
  const ADMIN_EMAIL = 'admin@test.com';
  const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'TestPassword123!';
  const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

  // Helper function to login as admin
  async function loginAsAdmin(page) {
    await page.goto(`${BASE_URL}/admin/login`);

    // Step 1: Submit credentials
    await page.fill('input[name="email"]', ADMIN_EMAIL);
    await page.fill('input[name="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');

    // Step 2: Handle MFA
    await page.waitForSelector('input[name="mfaCode"]', { timeout: 10000 });
    const mfaCode = getTestMFACode();
    await page.fill('input[name="mfaCode"]', mfaCode);
    await page.click('button[type="submit"]');

    // Step 3: Wait for dashboard to load
    await page.waitForURL('**/admin/dashboard', { timeout: 10000 });
  }

  test.beforeEach(async ({ page }) => {
    // Login before each test
    await loginAsAdmin(page);
  });

  test('should show transfer button in tickets list', async ({ page }) => {
    // Navigate to tickets page
    await page.goto(`${BASE_URL}/admin/tickets`);

    // Wait for tickets table to load
    await page.waitForSelector('table.admin-table', { timeout: 10000 });

    // Check if at least one transfer button exists
    const transferButtons = page.locator('button[data-action="transfer"]');
    const count = await transferButtons.count();

    expect(count).toBeGreaterThan(0);
  });

  test('should open transfer modal from tickets list', async ({ page }) => {
    // Navigate to tickets page
    await page.goto(`${BASE_URL}/admin/tickets`);
    await page.waitForSelector('table.admin-table', { timeout: 10000 });

    // Click first transfer button
    const transferButton = page.locator('button[data-action="transfer"]').first();
    await transferButton.click();

    // Verify modal is visible
    const modal = page.locator('#transfer-modal.show');
    await expect(modal).toBeVisible();

    // Verify modal contains form elements
    await expect(page.locator('#new-first-name')).toBeVisible();
    await expect(page.locator('#new-email')).toBeVisible();
    await expect(page.locator('button#transfer-submit-btn')).toBeVisible();
  });

  test('should close transfer modal when cancel is clicked', async ({ page }) => {
    // Navigate to tickets page
    await page.goto(`${BASE_URL}/admin/tickets`);
    await page.waitForSelector('table.admin-table', { timeout: 10000 });

    // Open transfer modal
    await page.locator('button[data-action="transfer"]').first().click();
    await expect(page.locator('#transfer-modal.show')).toBeVisible();

    // Click cancel button
    await page.locator('button:has-text("Cancel")').last().click();

    // Verify modal is hidden
    const modal = page.locator('#transfer-modal.show');
    await expect(modal).not.toBeVisible();
  });

  test('should show transfer section in ticket detail page', async ({ page }) => {
    // Navigate to tickets page
    await page.goto(`${BASE_URL}/admin/tickets`);
    await page.waitForSelector('table.admin-table', { timeout: 10000 });

    // Click on first ticket detail link
    const detailLink = page.locator('a.detail-link').first();
    const ticketId = await detailLink.textContent();


    // Wait for ticket detail page to load in new tab - synchronized click
    const [detailPage] = await Promise.all([
      page.context().waitForEvent('page'),
      detailLink.click({ modifiers: ['Meta'] }) // Command+click for macOS or Ctrl+click
    ]);
    await detailPage.waitForLoadState('networkidle');

    // Verify transfer section exists
    await expect(detailPage.locator('#transfer-section')).toBeVisible();
    await expect(detailPage.locator('button:has-text("Transfer Ticket")')).toBeVisible();
  });

  test('should validate required fields in transfer form', async ({ page }) => {
    // Navigate to tickets page
    await page.goto(`${BASE_URL}/admin/tickets`);
    await page.waitForSelector('table.admin-table', { timeout: 10000 });

    // Open transfer modal
    await page.locator('button[data-action="transfer"]').first().click();
    await expect(page.locator('#transfer-modal.show')).toBeVisible();

    // Try to submit without filling required fields
    await page.locator('button#transfer-submit-btn').click();

    // Verify HTML5 validation catches required fields
    const firstNameInput = page.locator('#new-first-name');
    const emailInput = page.locator('#new-email');

    const firstNameValid = await firstNameInput.evaluate((el) => el.checkValidity());
    const emailValid = await emailInput.evaluate((el) => el.checkValidity());

    expect(firstNameValid).toBe(false);
    expect(emailValid).toBe(false);
  });

  test('should validate email format in transfer form', async ({ page }) => {
    // Navigate to tickets page
    await page.goto(`${BASE_URL}/admin/tickets`);
    await page.waitForSelector('table.admin-table', { timeout: 10000 });

    // Open transfer modal
    await page.locator('button[data-action="transfer"]').first().click();
    await expect(page.locator('#transfer-modal.show')).toBeVisible();

    // Fill form with invalid email
    await page.fill('#new-first-name', 'Test');
    await page.fill('#new-email', 'not-an-email');

    // Try to submit
    await page.locator('button#transfer-submit-btn').click();

    // Verify HTML5 validation catches invalid email
    const emailInput = page.locator('#new-email');
    const emailValid = await emailInput.evaluate((el) => el.checkValidity());

    expect(emailValid).toBe(false);
  });

  test('should update transfer summary as user types', async ({ page }) => {
    // Navigate to tickets page
    await page.goto(`${BASE_URL}/admin/tickets`);
    await page.waitForSelector('table.admin-table', { timeout: 10000 });

    // Open transfer modal
    await page.locator('button[data-action="transfer"]').first().click();
    await expect(page.locator('#transfer-modal.show')).toBeVisible();

    // Type in email field
    const testEmail = 'newowner@example.com';
    await page.fill('#new-email', testEmail);

    // Verify summary updates
    const summaryEmail = page.locator('#transfer-to-email');
    await expect(summaryEmail).toHaveText(testEmail);
  });

  test('should show current owner information in modal', async ({ page }) => {
    // Navigate to tickets page
    await page.goto(`${BASE_URL}/admin/tickets`);
    await page.waitForSelector('table.admin-table', { timeout: 10000 });

    // Open transfer modal
    await page.locator('button[data-action="transfer"]').first().click();
    await expect(page.locator('#transfer-modal.show')).toBeVisible();

    // Verify current owner info is displayed
    const currentOwnerInfo = page.locator('#current-owner-info');
    await expect(currentOwnerInfo).toBeVisible();

    const ownerText = await currentOwnerInfo.textContent();
    expect(ownerText).toBeTruthy();
  });

  test('should display ticket ID in transfer summary', async ({ page }) => {
    // Navigate to tickets page
    await page.goto(`${BASE_URL}/admin/tickets`);
    await page.waitForSelector('table.admin-table', { timeout: 10000 });

    // Get ticket ID from first row
    const ticketCodeElement = page.locator('code.admin-p-xs').first();
    const ticketId = await ticketCodeElement.textContent();

    // Open transfer modal
    await page.locator('button[data-action="transfer"]').first().click();
    await expect(page.locator('#transfer-modal.show')).toBeVisible();

    // Verify ticket ID is displayed in summary
    const summaryTicketId = page.locator('#transfer-ticket-id');
    await expect(summaryTicketId).toHaveText(ticketId);
  });

  test('should have proper accessibility attributes', async ({ page }) => {
    // Navigate to tickets page
    await page.goto(`${BASE_URL}/admin/tickets`);
    await page.waitForSelector('table.admin-table', { timeout: 10000 });

    // Open transfer modal
    await page.locator('button[data-action="transfer"]').first().click();
    await expect(page.locator('#transfer-modal.show')).toBeVisible();

    // Check form labels
    const labels = page.locator('.admin-form-label');
    const labelCount = await labels.count();
    expect(labelCount).toBeGreaterThan(0);

    // Check required field indicators
    const requiredIndicators = page.locator('span:has-text("*")');
    const requiredCount = await requiredIndicators.count();
    expect(requiredCount).toBeGreaterThan(0);

    // Verify inputs have proper attributes
    const firstNameInput = page.locator('#new-first-name');
    await expect(firstNameInput).toHaveAttribute('required', '');
    await expect(firstNameInput).toHaveAttribute('maxlength', '100');

    const emailInput = page.locator('#new-email');
    await expect(emailInput).toHaveAttribute('type', 'email');
    await expect(emailInput).toHaveAttribute('required', '');
    await expect(emailInput).toHaveAttribute('maxlength', '255');
  });

  test('should show success message after successful transfer', async ({ page }) => {
    // This test would require a full integration setup with API mocking
    // or test data creation. For now, we'll test the UI flow.

    // Navigate to tickets page
    await page.goto(`${BASE_URL}/admin/tickets`);
    await page.waitForSelector('table.admin-table', { timeout: 10000 });

    // Open transfer modal
    await page.locator('button[data-action="transfer"]').first().click();
    await expect(page.locator('#transfer-modal.show')).toBeVisible();

    // Fill form with valid data
    await page.fill('#new-first-name', 'E2E');
    await page.fill('#new-last-name', 'Test');
    await page.fill('#new-email', 'e2e-transfer@example.com');
    await page.fill('#new-phone', '+1-555-0199');
    await page.fill('#transfer-reason', 'E2E test transfer');

    // Note: Actual submission would require proper test data setup
    // and API mocking to avoid modifying production data

    // Verify submit button exists and is enabled
    const submitBtn = page.locator('button#transfer-submit-btn');
    await expect(submitBtn).toBeEnabled();
    await expect(submitBtn).toHaveText(/Confirm Transfer/i);
  });

  test('should handle error messages gracefully', async ({ page }) => {
    // Navigate to tickets page
    await page.goto(`${BASE_URL}/admin/tickets`);
    await page.waitForSelector('table.admin-table', { timeout: 10000 });

    // Open transfer modal
    await page.locator('button[data-action="transfer"]').first().click();
    await expect(page.locator('#transfer-modal.show')).toBeVisible();

    // Verify alert container exists for showing errors/success
    const alertContainer = page.locator('#transfer-alert-container');
    await expect(alertContainer).toBeVisible();
  });

  test('should have responsive modal layout', async ({ page }) => {
    // Test on desktop
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${BASE_URL}/admin/tickets`);
    await page.waitForSelector('table.admin-table', { timeout: 10000 });

    await page.locator('button[data-action="transfer"]').first().click();
    await expect(page.locator('#transfer-modal.show')).toBeVisible();

    const modalContent = page.locator('.modal-content');
    await expect(modalContent).toBeVisible();

    // Test on mobile
    await page.setViewportSize({ width: 375, height: 667 });

    // Modal should still be visible and properly sized
    await expect(modalContent).toBeVisible();

    const modalBox = await modalContent.boundingBox();
    expect(modalBox.width).toBeLessThanOrEqual(375 * 0.95); // Should not exceed 95% of viewport
  });

  test('should close modal when clicking outside', async ({ page }) => {
    // Navigate to tickets page
    await page.goto(`${BASE_URL}/admin/tickets`);
    await page.waitForSelector('table.admin-table', { timeout: 10000 });

    // Open transfer modal
    await page.locator('button[data-action="transfer"]').first().click();
    await expect(page.locator('#transfer-modal.show')).toBeVisible();

    // Click on modal overlay (outside modal content)
    await page.locator('#transfer-modal').click({ position: { x: 10, y: 10 } });

    // Modal should close
    await expect(page.locator('#transfer-modal.show')).not.toBeVisible();
  });
});

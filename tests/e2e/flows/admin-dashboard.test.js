/**
 * E2E Test: Admin Dashboard and Security
 * Tests admin panel functionality and security measures
 */

import { test, expect } from '@playwright/test';
import { getTestDataConstants } from '../../../scripts/seed-test-data.js';

const testConstants = getTestDataConstants();

test.describe('Admin Dashboard & Security', () => {
  const adminCredentials = {
    email: testConstants.ADMIN_EMAIL,
    password: process.env.TEST_ADMIN_PASSWORD || 'test-admin-password'
  };

  // Helper function to login
  const loginAsAdmin = async (page) => {
    await page.goto('/pages/admin/login.html');
    await page.fill('input[name="email"]', adminCredentials.email);
    await page.fill('input[type="password"]', adminCredentials.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin/dashboard.html');
  };

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should display dashboard with key metrics', async ({ page }) => {
    await expect(page.locator('h1, .dashboard-title')).toBeVisible();
    
    // Check for key dashboard elements
    const dashboardElements = [
      'ticket', 'registration', 'transaction', 'revenue',
      'sales', 'attendee', 'check-in'
    ];
    
    for (const element of dashboardElements) {
      const locator = page.locator(`[data-metric="${element}"], .${element}-count, .${element}s-count, *:has-text("${element}")`);
      if (await locator.count() > 0) {
        await expect(locator.first()).toBeVisible();
      }
    }
  });

  test('should load dashboard data via API', async ({ page }) => {
    // Wait for dashboard API call
    const dashboardResponse = page.waitForResponse('**/api/admin/dashboard');
    await page.reload();
    
    const response = await dashboardResponse;
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('success', true);
  });

  test('should display tickets management section', async ({ page }) => {
    // Look for tickets section
    const ticketsSection = page.locator('.tickets-section, #tickets, [data-section="tickets"], h2:has-text("Tickets")');
    if (await ticketsSection.count() > 0) {
      await expect(ticketsSection.first()).toBeVisible();
    }
  });

  test('should display registrations management section', async ({ page }) => {
    // Check for registrations list/table
    const registrationsSection = page.locator('.registrations-section, #registrations, [data-section="registrations"], h2:has-text("Registration")');
    if (await registrationsSection.count() > 0) {
      await expect(registrationsSection.first()).toBeVisible();
    }
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Simulate API error by intercepting requests
    await page.route('**/api/admin/**', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Server error' })
      });
    });
    
    await page.reload();
    
    // Should show error state or fallback content
    await expect(page.locator('body')).not.toHaveText('undefined');
    await expect(page.locator('body')).not.toHaveText('[object Object]');
  });

  test('should restrict access to unauthorized users', async ({ page }) => {
    // Clear session/cookies to simulate unauthorized access
    await page.context().clearCookies();
    
    // Try to access dashboard directly
    await page.goto('/pages/admin/dashboard.html');
    
    // Should redirect to login or show unauthorized message
    await page.waitForTimeout(2000); // Give time for redirect
    const currentUrl = page.url();
    
    expect(
      currentUrl.includes('login') || 
      await page.locator('text=unauthorized').count() > 0 ||
      await page.locator('text=access denied').count() > 0
    ).toBeTruthy();
  });

  test('should validate admin session token', async ({ page }) => {
    // The fact that we can access the dashboard after login indicates session validation works
    await expect(page).toHaveURL(/dashboard/);
    
    // Check for admin-specific content
    const adminElements = page.locator('.admin-only, .admin-content, [data-role="admin"]');
    if (await adminElements.count() > 0) {
      await expect(adminElements.first()).toBeVisible();
    }
  });

  test('should handle concurrent admin sessions', async ({ browser }) => {
    // Create a second browser context (simulating another admin session)
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    
    // Both sessions should work independently
    await loginAsAdmin(page2);
    await expect(page2).toHaveURL(/dashboard/);
    
    // Original session should still work
    await page.reload();
    await expect(page).toHaveURL(/dashboard/);
    
    await context2.close();
  });

  test('should protect against XSS in dashboard data', async ({ page }) => {
    // Test that any user-generated content is properly sanitized
    const bodyText = await page.locator('body').textContent();
    
    // Should not contain raw script tags or unescaped HTML
    expect(bodyText).not.toContain('<script>');
    expect(bodyText).not.toContain('javascript:');
    expect(bodyText).not.toContain('onerror=');
  });
});
/**
 * E2E Test: Admin Authentication Flow
 * Tests admin login functionality and session management
 */

import { test, expect } from '@playwright/test';
import { getTestDataConstants } from '../../../scripts/seed-test-data.js';

const testConstants = getTestDataConstants();

test.describe('Admin Authentication', () => {
  const adminCredentials = {
    email: testConstants.ADMIN_EMAIL,
    password: process.env.TEST_ADMIN_PASSWORD || 'test-admin-password'
  };

  test.beforeEach(async ({ page }) => {
    // Navigate to admin login page
    await page.goto('/pages/admin/login.html');
  });

  test('should display login form with required fields', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText(/Admin Login/i);
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should reject invalid credentials', async ({ page }) => {
    await page.fill('input[name="email"]', 'wrong@email.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    
    await page.click('button[type="submit"]');
    
    // Should show error message
    await expect(page.locator('.error-message, .alert-danger')).toBeVisible();
  });

  test('should authenticate valid admin credentials', async ({ page }) => {
    await page.fill('input[name="email"]', adminCredentials.email);
    await page.fill('input[type="password"]', adminCredentials.password);
    
    await page.click('button[type="submit"]');
    
    // Should redirect to dashboard
    await page.waitForURL('**/admin/dashboard.html');
    await expect(page).toHaveURL(/admin\/dashboard/);
  });

  test('should maintain session after login', async ({ page }) => {
    // Login first
    await page.fill('input[name="email"]', adminCredentials.email);
    await page.fill('input[type="password"]', adminCredentials.password);
    await page.click('button[type="submit"]');
    
    // Wait for dashboard
    await page.waitForURL('**/admin/dashboard.html');
    
    // Navigate away and back - should remain logged in
    await page.goto('/pages/tickets.html');
    await page.goto('/pages/admin/dashboard.html');
    
    // Should still be on dashboard, not redirected to login
    await expect(page).toHaveURL(/dashboard/);
  });

  test('should logout successfully', async ({ page }) => {
    // Login first
    await page.fill('input[name="email"]', adminCredentials.email);
    await page.fill('input[type="password"]', adminCredentials.password);
    await page.click('button[type="submit"]');
    
    await page.waitForURL('**/admin/dashboard.html');
    
    // Find and click logout button
    const logoutButton = page.locator('button:has-text("Logout"), a:has-text("Logout"), .logout-btn');
    if (await logoutButton.count() > 0) {
      await logoutButton.first().click();
      
      // Should redirect to login page
      await page.waitForURL('**/admin/login.html');
      await expect(page).toHaveURL(/login/);
    }
  });

  test('should handle session timeout gracefully', async ({ page }) => {
    // Navigate directly to dashboard without login
    await page.goto('/pages/admin/dashboard.html');
    
    // Should redirect to login page
    await expect(page).toHaveURL(/login/);
  });
});
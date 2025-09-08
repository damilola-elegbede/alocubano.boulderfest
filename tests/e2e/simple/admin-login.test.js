/**
 * Simple Admin Login E2E Test
 * Tests authentication flows without complex abstractions
 */

import { test, expect } from '@playwright/test';

test.describe('Admin Login', () => {
  test('loads admin login page successfully', async ({ page }) => {
    // Navigate to admin login page
    await page.goto('/admin/login');
    
    // Check page title
    await expect(page).toHaveTitle(/Admin Login/);
    
    // Check login form exists
    const form = page.locator('[data-testid="login-form"]');
    await expect(form).toBeVisible();
    
    // Check required fields
    await expect(page.locator('[data-testid="username"]')).toBeVisible();
    await expect(page.locator('[data-testid="password"]')).toBeVisible();
    await expect(page.locator('[data-testid="login-button"]')).toBeVisible();
    
    console.log('✅ Admin login page loaded successfully');
  });

  test('handles failed login with invalid credentials', async ({ page }) => {
    await page.goto('/admin/login');
    
    // Fill in invalid credentials
    await page.fill('[data-testid="username"]', 'invalid-user');
    await page.fill('[data-testid="password"]', 'wrong-password');
    
    // Submit form
    await page.click('[data-testid="login-button"]');
    
    // Wait for error message to appear
    const errorMessage = page.locator('[data-testid="login-error"]');
    await expect(errorMessage).toBeVisible({ timeout: 10000 });
    
    // Check that we're still on login page
    await expect(page).toHaveURL(/\/admin\/login/);
    
    console.log('✅ Failed login handled correctly');
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    // Skip if no test password configured
    const testPassword = process.env.TEST_ADMIN_PASSWORD;
    if (!testPassword) {
      console.log('⚠️ TEST_ADMIN_PASSWORD not set, skipping successful login test');
      return;
    }

    await page.goto('/admin/login');
    
    // Fill in valid credentials (using test password)
    await page.fill('[data-testid="username"]', 'admin');
    await page.fill('[data-testid="password"]', testPassword);
    
    // Submit form
    await page.click('[data-testid="login-button"]');
    
    // Wait for redirect to dashboard
    await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 15000 });
    
    // Check dashboard loaded
    await expect(page.locator('h1, h2')).toContainText(/Dashboard|Admin/, { timeout: 5000 });
    
    console.log('✅ Successful login redirected to dashboard');
  });

  test('dashboard requires authentication', async ({ page }) => {
    // Try to access dashboard directly without login
    await page.goto('/admin/dashboard');
    
    // Should be redirected back to login or show unauthorized
    await page.waitForLoadState('domcontentloaded');
    
    const currentUrl = page.url();
    const hasLoginForm = await page.locator('[data-testid="login-form"]').isVisible().catch(() => false);
    const hasUnauthorized = await page.locator('text=/unauthorized|access denied|login required/i').isVisible().catch(() => false);
    
    // Either redirected to login or shows unauthorized message
    const isProtected = currentUrl.includes('/admin/login') || hasLoginForm || hasUnauthorized;
    
    expect(isProtected).toBe(true);
    console.log('✅ Dashboard properly protected');
  });

  test('logout functionality works', async ({ page }) => {
    const testPassword = process.env.TEST_ADMIN_PASSWORD;
    if (!testPassword) {
      console.log('⚠️ TEST_ADMIN_PASSWORD not set, skipping logout test');
      return;
    }

    // First login
    await page.goto('/admin/login');
    await page.fill('[data-testid="username"]', 'admin');
    await page.fill('[data-testid="password"]', testPassword);
    await page.click('[data-testid="login-button"]');
    
    // Wait for dashboard
    await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 15000 });
    
    // Find and click logout button
    const logoutButton = page.locator('text=Logout').or(page.locator('.logout-btn'));
    await expect(logoutButton).toBeVisible({ timeout: 5000 });
    
    // Handle potential confirmation dialog
    page.once('dialog', dialog => dialog.accept());
    await logoutButton.click();
    
    // Should redirect to login page or home
    await page.waitForLoadState('domcontentloaded');
    
    const currentUrl = page.url();
    const loggedOut = currentUrl.includes('/admin/login') || currentUrl.includes('/index.html') || 
                     currentUrl === page.url().split('/admin')[0] + '/';
    
    expect(loggedOut).toBe(true);
    console.log('✅ Logout functionality works');
  });

  test('form validation prevents empty submission', async ({ page }) => {
    await page.goto('/admin/login');
    
    // Try to submit empty form
    await page.click('[data-testid="login-button"]');
    
    // HTML5 validation should prevent submission
    const usernameField = page.locator('[data-testid="username"]');
    const passwordField = page.locator('[data-testid="password"]');
    
    // Check if validation messages appear or fields are focused
    const usernameValid = await usernameField.evaluate(el => el.validity.valid);
    const passwordValid = await passwordField.evaluate(el => el.validity.valid);
    
    expect(usernameValid || passwordValid).toBe(false);
    console.log('✅ Form validation prevents empty submission');
  });
});
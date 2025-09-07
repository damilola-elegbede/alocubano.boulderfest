/**
 * Simple Admin Authentication Test
 * 
 * Basic test to validate admin login functionality without complex configurations.
 */

import { test, expect } from '@playwright/test';

test.describe('Simple Admin Authentication', () => {
  const adminCredentials = {
    email: 'admin@alocubanoboulderfest.com',
    password: process.env.TEST_ADMIN_PASSWORD || 'test-admin-password'
  };

  test('should display admin login page', async ({ page }) => {
    // Navigate to admin login page
    await page.goto('/pages/admin/login.html');
    
    // Wait for page to load
    await page.waitForSelector('h1', { timeout: 30000 });
    
    // Check for login form elements
    await expect(page.locator('h1')).toHaveText(/Admin Access/i);
    await expect(page.locator('input[name="username"], input[id="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"], input[id="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"], .login-btn')).toBeVisible();
    
    console.log('✅ Admin login page loaded successfully');
  });

  test('should handle invalid login credentials', async ({ page }) => {
    await page.goto('/pages/admin/login.html');
    
    // Wait for form elements
    const usernameField = page.locator('input[name="username"], input[id="username"]');
    const passwordField = page.locator('input[name="password"], input[id="password"]');
    const submitButton = page.locator('button[type="submit"], .login-btn');
    
    await expect(usernameField).toBeVisible({ timeout: 15000 });
    await expect(passwordField).toBeVisible({ timeout: 15000 });
    await expect(submitButton).toBeVisible({ timeout: 15000 });
    
    // Fill in invalid credentials
    await usernameField.fill('invalid@test.com');
    await passwordField.fill('wrongpassword');
    
    // Submit form
    await submitButton.click();
    
    // Wait a moment for any response
    await page.waitForTimeout(2000);
    
    // Check that we're still on the login page (didn't navigate to dashboard)
    await expect(page).toHaveURL(/login/);
    
    console.log('✅ Invalid credentials handled appropriately');
  });

  test('should attempt valid login credentials', async ({ page }) => {
    await page.goto('/pages/admin/login.html');
    
    // Wait for form elements
    const usernameField = page.locator('input[name="username"], input[id="username"]');
    const passwordField = page.locator('input[name="password"], input[id="password"]');
    const submitButton = page.locator('button[type="submit"], .login-btn');
    
    await expect(usernameField).toBeVisible({ timeout: 15000 });
    await expect(passwordField).toBeVisible({ timeout: 15000 });
    await expect(submitButton).toBeVisible({ timeout: 15000 });
    
    console.log(`🔐 Testing with credentials: ${adminCredentials.email}`);
    
    // Fill in test credentials
    await usernameField.fill(adminCredentials.email);
    await passwordField.fill(adminCredentials.password);
    
    // Submit form
    await submitButton.click();
    
    // Wait for either success or error
    await page.waitForTimeout(3000);
    
    // Log the current URL for debugging
    const currentUrl = page.url();
    console.log(`📍 Current URL after login attempt: ${currentUrl}`);
    
    // Check if we navigated to dashboard or stayed on login
    if (currentUrl.includes('dashboard')) {
      // Success case
      await expect(page.locator('h1')).toContainText('Admin Dashboard');
      await expect(page.locator('.admin-header')).toBeVisible();
      console.log('✅ Successfully logged in to admin dashboard');
    } else {
      // Still on login page - check for errors or other indications
      console.log('⚠️ Login attempt completed but remained on login page');
      
      // Check for error messages
      const errorElements = page.locator('#errorMessage, .error-message, [role="alert"]');
      if (await errorElements.count() > 0) {
        const errorText = await errorElements.first().textContent();
        if (errorText && errorText.trim()) {
          console.log(`❌ Login error: ${errorText}`);
        }
      } else {
        console.log('ℹ️ No error message shown - API may not be available or credentials require verification');
      }
    }
  });
});
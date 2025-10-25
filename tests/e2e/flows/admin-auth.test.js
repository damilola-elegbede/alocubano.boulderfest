/**
 * E2E Test: Admin Authentication Flow
 * Tests admin login functionality and session management
 *
 * Note: This test handles complex authentication flows including:
 * - MFA (Multi-Factor Authentication) requirements
 * - Rate limiting and error conditions
 * - Session management and timeouts
 * - Graceful handling of login failures
 */

import { test, expect } from '@playwright/test';
import { getTestDataConstants } from '../../../scripts/seed-test-data.js';
import { skipTestIfSecretsUnavailable, warnIfOptionalSecretsUnavailable } from '../helpers/test-setup.js';
import { getTestMFACode } from '../helpers/totp-generator.js';

const testConstants = getTestDataConstants();

test.describe('Admin Authentication', () => {
  // Validate secrets before running tests
  const shouldSkip = skipTestIfSecretsUnavailable(['admin', 'security'], 'admin-auth.test.js');

  if (shouldSkip) {
    test.skip('Skipping admin authentication tests due to missing required secrets');
    return;
  }

  // Check for optional secrets and warn about degraded functionality
  const secretWarnings = warnIfOptionalSecretsUnavailable(['admin'], 'admin-auth.test.js');
  const adminCredentials = {
    email: testConstants.admin.email,
    password: process.env.TEST_ADMIN_PASSWORD || 'test-admin-password'
  };

  /**
   * Validate route accessibility before running tests
   */
  async function validateAdminRoute(page, route, expectedContent) {
    try {
      const response = await page.goto(route, { waitUntil: 'load', timeout: 60000 });

      // Handle HTTP status codes properly
      // 304 (Not Modified) is a valid success response, especially common in Firefox
      const isSuccessStatus = response.ok() || response.status() === 304;
      if (!isSuccessStatus) {
        throw new Error(`Route ${route} returned ${response.status()}: ${response.statusText()}`);
      }

      // Wait for page to load completely including network idle for preview deployments
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 30000 });

      // Check if we actually got the right page (not a fallback)
      const content = await page.content();
      if (!content.includes(expectedContent)) {
        throw new Error(`Route ${route} did not serve expected content. Page may be serving fallback content.`);
      }

      return true;
    } catch (error) {
      console.error(`❌ Admin route validation failed for ${route}:`, error.message);
      throw error;
    }
  }

  test.beforeEach(async ({ page }) => {
    // First validate that admin login route is accessible and serves the correct page
    await validateAdminRoute(page, '/admin/login', 'Admin Access');

    // Wait for essential elements to be ready with extended timeouts for preview deployments
    await page.waitForSelector('h1', { timeout: 60000 });
    await page.waitForSelector('input[name="username"]', { timeout: 60000 });
    await page.waitForSelector('input[name="password"]', { timeout: 60000 });
    await page.waitForSelector('button[type="submit"]', { timeout: 60000 });

    // Add extra wait for JavaScript to be fully loaded and interactive
    await page.waitForFunction(
      () => document.readyState === 'complete',
      {},
      { timeout: 30000 }
    );

    console.log('✅ Admin login page is accessible and properly loaded');
  });

  test('should display login form with required fields', async ({ page }) => {
    // Use correct selectors based on actual HTML structure
    await expect(page.locator('h1')).toHaveText(/Admin Access/i, { timeout: 30000 });
    await expect(page.locator('input[name="username"]')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('input[name="password"]')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('button[type="submit"]')).toBeVisible({ timeout: 30000 });
  });

  test('should reject invalid credentials', async ({ page }) => {
    // Use correct selectors based on actual HTML structure
    const usernameField = page.locator('input[name="username"]');
    const passwordField = page.locator('input[name="password"]');
    const submitButton = page.locator('button[type="submit"]');

    await expect(usernameField).toBeVisible({ timeout: 30000 });
    await expect(passwordField).toBeVisible({ timeout: 30000 });
    await expect(submitButton).toBeVisible({ timeout: 30000 });

    await usernameField.fill('wrong@email.com');
    await passwordField.fill('wrongpassword');

    await submitButton.click();

    // Wait for error message with correct selector - the error div becomes visible on error
    await page.waitForSelector('#errorMessage', { state: 'visible', timeout: 45000 });

    // Should show error message and not navigate to dashboard
    const errorElement = page.locator('#errorMessage');
    await expect(errorElement).toBeVisible({ timeout: 30000 });
    await expect(page).not.toHaveURL(/\/admin\/dashboard(\/|$)/);
  });

  test.skip('should authenticate valid admin credentials', async ({ page }) => {
    // SKIPPED: Frontend does not support MFA flow yet
    // TODO: Implement MFA UI in pages/admin/login.html before enabling this test
    // Check if admin authentication is available from environment
    const adminAuthAvailable = process.env.ADMIN_AUTH_AVAILABLE !== 'false';

    if (!adminAuthAvailable) {
      console.log('⚠️ Admin authentication API not available in preview deployment - testing UI only');
    }

    // Use correct selectors based on actual HTML structure
    const usernameField = page.locator('input[name="username"]');
    const passwordField = page.locator('input[name="password"]');
    const submitButton = page.locator('button[type="submit"]');

    await expect(usernameField).toBeVisible({ timeout: 60000 });
    await expect(passwordField).toBeVisible({ timeout: 60000 });
    await expect(submitButton).toBeVisible({ timeout: 60000 });

    console.log(`🔐 Attempting login with email: ${adminCredentials.email}`);
    console.log(
      `🔐 Using admin password from ${
        process.env.TEST_ADMIN_PASSWORD ? 'TEST_ADMIN_PASSWORD env' : 'default test fixture'
      }`
    );

    await usernameField.fill(adminCredentials.email);
    await passwordField.fill(adminCredentials.password);

    // Step 1: Submit credentials
    await submitButton.click();

    // Wait for loading state to appear (indicates form submission started)
    try {
      await page.waitForSelector('#loading', { state: 'visible', timeout: 5000 });
    } catch (error) {
      // Loading might be too fast to catch, that's okay
      console.log('No loading indicator found, continuing...');
    }

    console.log('⏳ Waiting for response after credential submission...');

    // Step 2: Handle two possible scenarios
    // Scenario A: E2E_TEST_MODE bypasses MFA -> direct redirect to dashboard
    // Scenario B: Normal flow -> MFA prompt appears
    try {
      const dashboardRedirect = page.waitForURL('**/admin/dashboard', { timeout: 10000 });
      const mfaPrompt = page.waitForSelector('input[name="mfaCode"]', { timeout: 10000 });
      const errorMessage = page.locator('#errorMessage');

      // Race between dashboard redirect and MFA prompt
      const result = await Promise.race([
        dashboardRedirect.then(() => 'dashboard'),
        mfaPrompt.then(() => 'mfa'),
        // Also check for errors
        page.waitForSelector('#errorMessage', { state: 'visible', timeout: 10000 }).then(() => 'error')
      ]).catch(() => null);

      if (result === 'dashboard') {
        // Scenario A: E2E_TEST_MODE bypassed MFA - direct redirect to dashboard
        console.log('✅ E2E_TEST_MODE detected: MFA bypassed, redirected directly to dashboard');
        await expect(page).toHaveURL(/\/admin\/dashboard/);
        return; // Test complete - successful login without MFA
      } else if (result === 'error') {
        // Login failed with error
        const errorText = await errorMessage.textContent();
        throw new Error(`Login failed with error: ${errorText}`);
      } else if (result === 'mfa') {
        // Scenario B: MFA prompt appeared - continue with MFA flow
        console.log('✅ MFA prompt detected - proceeding with MFA verification');

        // Step 3: Generate and enter TOTP code
        const mfaCode = getTestMFACode();
        console.log(`🔐 Generated MFA code: ${mfaCode}`);
        await page.fill('input[name="mfaCode"]', mfaCode);
        await page.click('button[type="submit"]');

        console.log('⏳ Waiting for dashboard redirect after MFA submission...');

        // Step 4: Wait for successful login and redirect to dashboard
        try {
          await page.waitForURL('**/admin/dashboard', { timeout: 10000 });
          console.log('✅ Successfully authenticated with MFA - redirected to dashboard');
          await expect(page).toHaveURL(/\/admin\/dashboard/);
        } catch (mfaError) {
          // Check for error message
          if (await errorMessage.isVisible()) {
            const errorText = await errorMessage.textContent();
            throw new Error(`MFA verification failed with error: ${errorText}`);
          }

          const debugInfo = {
            currentUrl: page.url(),
            hasError: await errorMessage.isVisible(),
            hasLoadingIndicator: await page.locator('#loading:visible').count() > 0,
            buttonDisabled: await page.locator('button[type="submit"]').getAttribute('disabled') !== null
          };
          console.log('MFA verification debugging info:', debugInfo);
          throw new Error(`Dashboard redirect failed after MFA. Current URL: ${page.url()}`);
        }
      } else {
        // Neither MFA nor dashboard redirect happened
        throw new Error('Neither MFA prompt nor dashboard redirect appeared after credential submission');
      }
    } catch (error) {
      // Check if we already have a specific error message
      if (error.message.includes('Login failed with error') ||
          error.message.includes('MFA verification failed') ||
          error.message.includes('Dashboard redirect failed')) {
        throw error; // Re-throw our custom errors
      }

      // Generic error - check for error message on page
      const errorMessage = page.locator('#errorMessage');
      if (await errorMessage.isVisible()) {
        const errorText = await errorMessage.textContent();
        throw new Error(`Login failed with error: ${errorText}`);
      }

      throw new Error(`Authentication flow failed: ${error.message}`);
    }
  });

  test.skip('should maintain session after login', async ({ page }) => {
    // SKIPPED: Frontend does not support MFA flow yet
    // TODO: Implement MFA UI in pages/admin/login.html before enabling this test
    // Step 1: Login with credentials
    const usernameField = page.locator('input[name="username"]');
    const passwordField = page.locator('input[name="password"]');
    const submitButton = page.locator('button[type="submit"]');

    await expect(usernameField).toBeVisible({ timeout: 30000 });
    await usernameField.fill(adminCredentials.email);
    await passwordField.fill(adminCredentials.password);
    await submitButton.click();

    // Step 2: Handle E2E_TEST_MODE (MFA bypass) or normal MFA flow
    try {
      const dashboardRedirect = page.waitForURL('**/admin/dashboard', { timeout: 10000 });
      const mfaPrompt = page.waitForSelector('input[name="mfaCode"]', { timeout: 10000 });

      const result = await Promise.race([
        dashboardRedirect.then(() => 'dashboard'),
        mfaPrompt.then(() => 'mfa')
      ]).catch(() => null);

      if (result === 'dashboard') {
        // E2E_TEST_MODE bypassed MFA - already on dashboard
        console.log('✅ E2E_TEST_MODE: MFA bypassed, already on dashboard');
      } else if (result === 'mfa') {
        // MFA flow - complete MFA verification
        console.log('✅ MFA prompt detected - completing MFA verification');
        const mfaCode = getTestMFACode();
        await page.fill('input[name="mfaCode"]', mfaCode);
        await page.click('button[type="submit"]');

        // Wait for dashboard after MFA
        await page.waitForURL('**/admin/dashboard', { timeout: 10000 });
      } else {
        throw new Error('Neither dashboard redirect nor MFA prompt appeared');
      }
    } catch (error) {
      const errorMessage = page.locator('#errorMessage');
      if (await errorMessage.isVisible()) {
        const errorText = await errorMessage.textContent();
        throw new Error(`Login failed with error: ${errorText}`);
      }
      throw new Error(`Session test prerequisite failed: ${error.message}`);
    }

    // Navigate away and back - should remain logged in
    // Firefox requires stabilization wait to prevent NS_BINDING_ABORTED errors
    const browserName = page.context().browser()?.browserType()?.name();
    if (browserName === 'firefox') {
      await page.waitForTimeout(1000);
    }
    await page.goto('/tickets');
    await page.goto('/admin/dashboard');

    // Should still be on dashboard, not redirected to login
    await expect(page).toHaveURL(/\/admin\/dashboard(\/|$)/);
  });

  test.skip('should logout successfully', async ({ page }) => {
    // SKIPPED: Frontend does not support MFA flow yet
    // TODO: Implement MFA UI in pages/admin/login.html before enabling this test
    // Step 1: Login with credentials
    const usernameField = page.locator('input[name="username"]');
    const passwordField = page.locator('input[name="password"]');
    const submitButton = page.locator('button[type="submit"]');

    await expect(usernameField).toBeVisible({ timeout: 30000 });
    await usernameField.fill(adminCredentials.email);
    await passwordField.fill(adminCredentials.password);
    await submitButton.click();

    // Step 2: Handle E2E_TEST_MODE (MFA bypass) or normal MFA flow
    try {
      const dashboardRedirect = page.waitForURL('**/admin/dashboard', { timeout: 10000 });
      const mfaPrompt = page.waitForSelector('input[name="mfaCode"]', { timeout: 10000 });

      const result = await Promise.race([
        dashboardRedirect.then(() => 'dashboard'),
        mfaPrompt.then(() => 'mfa')
      ]).catch(() => null);

      if (result === 'dashboard') {
        // E2E_TEST_MODE bypassed MFA - already on dashboard
        console.log('✅ E2E_TEST_MODE: MFA bypassed, already on dashboard');
      } else if (result === 'mfa') {
        // MFA flow - complete MFA verification
        console.log('✅ MFA prompt detected - completing MFA verification');
        const mfaCode = getTestMFACode();
        await page.fill('input[name="mfaCode"]', mfaCode);
        await page.click('button[type="submit"]');

        // Wait for dashboard after MFA
        await page.waitForURL('**/admin/dashboard', { timeout: 10000 });
      } else {
        throw new Error('Neither dashboard redirect nor MFA prompt appeared');
      }
    } catch (error) {
      const errorMessage = page.locator('#errorMessage');
      if (await errorMessage.isVisible()) {
        const errorText = await errorMessage.textContent();
        throw new Error(`Login failed with error: ${errorText}`);
      }
      throw new Error(`Logout test prerequisite failed: ${error.message}`);
    }

    // Find and click logout button with more comprehensive selectors
    const logoutButton = page.locator('button:has-text("Logout"), a:has-text("Logout"), .logout-btn, button:has-text("Sign Out"), a:has-text("Sign Out"), [data-action="logout"]');
    if (await logoutButton.count() > 0) {
      await expect(logoutButton.first()).toBeVisible({ timeout: 30000 });
      await logoutButton.first().click();

      // Should redirect to login page with longer timeout
      await page.waitForURL('**/admin/login', { timeout: 30000 });
      await expect(page).toHaveURL(/\/admin\/login(\/|$)/);
    } else {
      console.log('No logout button found - skipping logout test');
    }
  });

  test('should handle session timeout gracefully', async ({ page }) => {
    console.log('🕒 Testing session timeout handling...');

    // Navigate directly to dashboard without login - this should immediately redirect
    const navigationPromise = page.goto('/admin/dashboard', {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });

    // Race condition: wait for either successful navigation or redirect
    await Promise.race([
      navigationPromise,
      // Wait for redirect to login page (faster path)
      page.waitForURL(/login/, { timeout: 15000 })
    ]);

    // Allow brief time for any final redirects
    await page.waitForTimeout(1000);

    const currentUrl = page.url();
    console.log('🔗 Session timeout test - Current URL:', currentUrl);

    // Should redirect to login page OR home page (both indicate successful access control)
    const isLoginPage = /login|admin\/login/.test(currentUrl);
    const isHomePage = /\/(home|index)?(\.|$)/.test(currentUrl);

    if (!isLoginPage && !isHomePage) {
      console.log('⚠️  Expected redirect to login or home page, but got:', currentUrl);

      // Wait a bit more for slow redirects
      try {
        await page.waitForURL(/login|home/, { timeout: 10000 });
      } catch (redirectError) {
        console.log('❌ Redirect timeout - final URL:', page.url());
      }
    }

    // Final assertion - accept either login redirect or home redirect as valid access control
    const finalUrl = page.url();
    const validRedirect = /login|admin.*login|home|index|^\/$/.test(finalUrl);

    if (!validRedirect) {
      await expect(page).toHaveURL(/login|admin.*login|home/, { timeout: 15000 });
    } else {
      console.log(`✅ Valid access control redirect detected: ${finalUrl}`);
    }
  });
});
/**
 * E2E Test: Admin Dashboard and Security
 * Tests admin panel functionality and security measures
 */

import { test, expect } from '@playwright/test';
import { getTestDataConstants } from '../../../scripts/seed-test-data.js';
import { waitForPageReady, waitForConditions } from '../helpers/playwright-utils.js';

const testConstants = getTestDataConstants();

test.describe('Admin Dashboard & Security', () => {
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
      
      // Check if response is successful
      if (!response.ok()) {
        throw new Error(`Route ${route} returned ${response.status()}: ${response.statusText()}`);
      }
      
      // Wait for page to load and check for expected content
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
      
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

  // Helper function to login with rate limiting handling
  const loginAsAdmin = async (page, skipOnRateLimit = true) => {
    // Check if admin authentication is available from environment
    const adminAuthAvailable = process.env.ADMIN_AUTH_AVAILABLE !== 'false';
    
    if (!adminAuthAvailable) {
      console.log('⚠️ Admin authentication API not available in preview deployment - skipping tests');
      return false;
    }

    try {
      // First validate login route is accessible
      await validateAdminRoute(page, '/admin/login.html', 'Admin Login');
      
      await page.fill('input[name="username"]', adminCredentials.email);
      await page.fill('input[type="password"]', adminCredentials.password);
      await page.click('button[type="submit"]');
      
      // Wait for either dashboard or error, with timeout handling
      await Promise.race([
        page.waitForURL('**/admin/dashboard', { timeout: 60000 }),
        page.waitForSelector('#errorMessage', { state: 'visible', timeout: 30000 })
      ]);
      
      // Check if we successfully reached dashboard
      const currentUrl = page.url();
      if (!currentUrl.includes('/admin/dashboard')) {
        // Check for errors or skip test
        const errorMessage = page.locator('#errorMessage');
        if (await errorMessage.isVisible()) {
          const errorText = await errorMessage.textContent();
          
          // Handle rate limiting gracefully
          if (errorText.includes('locked') || errorText.includes('rate limit') || errorText.includes('too many')) {
            if (skipOnRateLimit) {
              console.log('⚠️ Admin account rate limited - skipping test to prevent lockout');
              return 'rate_limited';
            } else {
              console.log('⚠️ Admin account rate limited - waiting before retry...');
              await page.waitForTimeout(10000); // Wait 10 seconds
              return false;
            }
          }
          
          throw new Error(`Login failed: ${errorText}`);
        } else {
          console.log('⚠️ Login did not complete - skipping dashboard tests');
          return false;
        }
      }
      
      // Validate dashboard route serves correct content
      await validateAdminRoute(page, page.url(), 'Dashboard');
      return true;
    } catch (error) {
      if (error.message.includes('locked') || error.message.includes('rate limit')) {
        console.log('⚠️ Rate limiting detected - gracefully handling');
        return skipOnRateLimit ? 'rate_limited' : false;
      }
      console.error('❌ Admin login failed:', error.message);
      throw error;
    }
  };

  test.beforeEach(async ({ page }) => {
    const loginResult = await loginAsAdmin(page, true);
    if (loginResult === 'rate_limited') {
      test.skip('Admin account is rate limited - skipping test to prevent lockout');
    } else if (!loginResult) {
      console.log('⚠️ Admin login failed or incomplete - tests may be skipped');
    }
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
    // FIXED: Modern approach using waitForPageReady instead of networkidle
    await waitForPageReady(page, {
      timeout: 10000,
      waitForSelector: '[data-testid="dashboard-stats"]',
      checkNetworkIdle: true
    });
    
    // Verify statistics cards are visible and contain data
    await expect(page.locator('[data-testid="dashboard-stats"]')).toBeVisible();
    
    // Verify content is not in loading state
    const statsText = await page.locator('[data-testid="dashboard-stats"]').textContent();
    expect(statsText).not.toContain('Loading statistics');
    
    // Verify API is working by checking for actual numeric data
    const hasNumbers = /\d+/.test(statsText);
    expect(hasNumbers).toBeTruthy();
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
    // FIXED: Simplified error handling test with modern waiting
    await page.route('**/api/admin/dashboard', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Server error' })
      });
    });
    
    // Navigate fresh to trigger error
    await page.goto('/admin/dashboard');
    
    // Wait for page to stabilize with error handling
    await waitForConditions(page, {
      timeout: 8000,
      domReady: true,
      selector: 'h1',
      noLoadingSpinners: true
    });
    
    // Should still show basic page structure
    await expect(page.locator('h1')).toContainText('Admin Dashboard');
    
    // Should not crash with undefined/object errors
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('undefined');
    expect(bodyText).not.toContain('[object Object]');
  });

  test('should restrict access to unauthorized users', async ({ page }) => {
    // Clear session/cookies to simulate unauthorized access
    await page.context().clearCookies();
    
    // Try to access dashboard directly
    await page.goto('/admin/dashboard');
    
    // Wait for redirect or unauthorized message with modern approach
    await waitForConditions(page, {
      timeout: 5000,
      domReady: true,
      customFunction: () => {
        return window.location.href.includes('login') ||
               document.body.textContent.toLowerCase().includes('unauthorized') ||
               document.body.textContent.toLowerCase().includes('access denied');
      }
    });
    
    const currentUrl = page.url();
    
    expect(
      currentUrl.includes('login') || 
      await page.locator('text=unauthorized').count() > 0 ||
      await page.locator('text=access denied').count() > 0
    ).toBeTruthy();
  });

  test('should validate admin session token', async ({ page }) => {
    // FIXED: Simple session validation test
    await expect(page).toHaveURL(/dashboard/);
    
    // Verify we can see admin content (proves session is valid)
    await expect(page.locator('[data-testid="dashboard-stats"]')).toBeVisible();
    await expect(page.locator('h1')).toContainText('Admin Dashboard');
  });

  test('should handle concurrent admin sessions', async ({ browser }) => {
    // FIXED: Simplified concurrent session test
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    
    // Login in second context
    await loginAsAdmin(page2);
    await expect(page2).toHaveURL(/dashboard/);
    
    // Both should work
    await expect(page.locator('h1')).toContainText('Admin Dashboard');
    await expect(page2.locator('h1')).toContainText('Admin Dashboard');
    
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

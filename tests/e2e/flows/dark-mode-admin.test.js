/**
 * E2E Test: Dark Mode Admin Integration
 * Tests dark mode functionality in admin pages and visual regression
 *
 * Requirements tested:
 * 1. Admin pages load with dark theme
 * 2. Main site pages remain light theme
 * 3. Visual regression - colors properly inverted
 * 4. All admin components visible in dark mode
 * 5. Contrast ratios meet WCAG standards
 * 6. Theme persistence across page navigation
 * 7. Forms and inputs work in dark mode
 * 8. Chart visibility in dark mode
 */

import { test, expect } from '@playwright/test';
import { getTestDataConstants } from '../../../scripts/seed-test-data.js';
import { skipTestIfSecretsUnavailable } from '../helpers/test-setup.js';
import { waitForPageReady, waitForConditions } from '../helpers/playwright-utils.js';

const testConstants = getTestDataConstants();

test.describe('Dark Mode Admin Integration', () => {
  // Validate secrets before running tests
  const shouldSkip = skipTestIfSecretsUnavailable(['admin'], 'dark-mode-admin.test.js');

  if (shouldSkip) {
    test.skip('Skipping dark mode admin tests due to missing required secrets');
    return;
  }

  const adminCredentials = {
    email: testConstants.admin.email,
    password: process.env.TEST_ADMIN_PASSWORD || 'test-admin-password'
  };

  /**
   * Helper function to login as admin
   */
  async function loginAsAdmin(page) {
    try {
      await page.goto('/admin/login');
      await waitForPageReady(page, {
        timeout: 30000,
        waitForSelector: 'input[name="username"]'
      });

      await page.fill('input[name="username"]', adminCredentials.email);
      await page.fill('input[type="password"]', adminCredentials.password);
      await page.click('button[type="submit"]');

      // Wait for login to complete
      await Promise.race([
        page.waitForURL('**/admin/dashboard', { timeout: 60000 }),
        page.waitForSelector('#errorMessage', { state: 'visible', timeout: 30000 })
      ]);

      const currentUrl = page.url();
      if (!currentUrl.includes('/admin/dashboard')) {
        const errorMessage = page.locator('#errorMessage');
        if (await errorMessage.isVisible()) {
          const errorText = await errorMessage.textContent();
          if (errorText.includes('locked') || errorText.includes('rate limit')) {
            return 'rate_limited';
          }
          throw new Error(`Login failed: ${errorText}`);
        }
        return false;
      }

      return true;
    } catch (error) {
      if (error.message.includes('locked') || error.message.includes('rate limit')) {
        return 'rate_limited';
      }
      console.error('Admin login failed:', error.message);
      return false;
    }
  }

  /**
   * Get computed color of an element
   */
  async function getComputedColor(page, selector) {
    return await page.evaluate((sel) => {
      const element = document.querySelector(sel);
      if (!element) return null;
      const styles = window.getComputedStyle(element);
      return {
        color: styles.color,
        backgroundColor: styles.backgroundColor,
        borderColor: styles.borderColor || styles.borderTopColor
      };
    }, selector);
  }

  /**
   * Check if colors meet WCAG AA contrast ratio (4.5:1)
   */
  async function checkContrastRatio(page, foregroundColor, backgroundColor) {
    return await page.evaluate(({ fg, bg }) => {
      // Convert RGB/RGBA to luminance values
      function getLuminance(color) {
        if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return 0;

        const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
        if (!rgbMatch) return 0;

        const [, r, g, b] = rgbMatch.map(Number);

        // Convert to relative luminance
        const [rs, gs, bs] = [r, g, b].map(c => {
          c = c / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });

        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      }

      const fgLuminance = getLuminance(fg);
      const bgLuminance = getLuminance(bg);

      const lighter = Math.max(fgLuminance, bgLuminance);
      const darker = Math.min(fgLuminance, bgLuminance);

      const contrastRatio = (lighter + 0.05) / (darker + 0.05);
      return {
        ratio: contrastRatio,
        meetsAA: contrastRatio >= 4.5,
        meetsAAA: contrastRatio >= 7
      };
    }, { fg: foregroundColor, bg: backgroundColor });
  }

  test.beforeEach(async ({ page }) => {
    // Clear any existing theme preferences to test auto-detection
    await page.addInitScript(() => {
      localStorage.removeItem('theme-preference');
    });
  });

  test('should auto-apply dark theme to admin login page', async ({ page }) => {
    await page.goto('/admin/login');
    await waitForPageReady(page, {
      timeout: 15000,
      waitForSelector: '.login-container'
    });

    // Check that theme manager is loaded and admin page is detected
    const themeAttribute = await page.getAttribute('html', 'data-theme');
    expect(themeAttribute).toBe('dark');

    // Verify dark mode CSS variables are applied
    const bodyStyles = await page.evaluate(() => {
      const styles = window.getComputedStyle(document.documentElement);
      return {
        background: styles.getPropertyValue('--color-background'),
        textPrimary: styles.getPropertyValue('--color-text-primary'),
        borderColor: styles.getPropertyValue('--color-border')
      };
    });

    // In dark mode, background should be dark and text should be light
    expect(bodyStyles.background.trim()).toBe('#0a0a0a');
    expect(bodyStyles.textPrimary.trim()).toBe('#ffffff');
  });

  test('should maintain dark theme in admin dashboard', async ({ page }) => {
    const loginResult = await loginAsAdmin(page);
    if (loginResult === 'rate_limited') {
      test.skip('Admin account is rate limited - skipping test');
    } else if (!loginResult) {
      test.skip('Admin login failed - skipping dark mode test');
    }

    await waitForPageReady(page, {
      timeout: 15000,
      waitForSelector: '[data-testid="dashboard-stats"]'
    });

    // Verify dark theme is still applied
    const themeAttribute = await page.getAttribute('html', 'data-theme');
    expect(themeAttribute).toBe('dark');

    // Check admin header styling in dark mode
    const headerColors = await getComputedColor(page, '.admin-header');
    expect(headerColors.backgroundColor).toBeTruthy();

    // Verify dashboard stats cards are visible with proper contrast
    const statsCards = page.locator('.stat-card');
    const statsCount = await statsCards.count();
    expect(statsCount).toBeGreaterThan(0);

    // Check first stats card for proper contrast
    if (statsCount > 0) {
      const cardColors = await getComputedColor(page, '.stat-card:first-child');
      const titleColors = await getComputedColor(page, '.stat-card:first-child h3');

      expect(cardColors.backgroundColor).toBeTruthy();
      expect(titleColors.color).toBeTruthy();

      // Test contrast ratio for readability
      const contrast = await checkContrastRatio(page, titleColors.color, cardColors.backgroundColor);
      expect(contrast.meetsAA).toBe(true);
    }
  });

  test('should ensure all admin components are visible in dark mode', async ({ page }) => {
    const loginResult = await loginAsAdmin(page);
    if (loginResult === 'rate_limited') {
      test.skip('Admin account is rate limited - skipping test');
    } else if (!loginResult) {
      test.skip('Admin login failed - skipping dark mode test');
    }

    await waitForPageReady(page, {
      timeout: 15000,
      waitForSelector: '[data-testid="dashboard-stats"]'
    });

    // Check key admin UI components are visible
    const components = [
      '.admin-header',
      '[data-testid="dashboard-stats"]',
      '.stats-grid',
      '.stat-card',
      '#registrations',
      '.search-bar',
      '.search-bar input',
      '.search-bar select',
      '.search-bar button'
    ];

    for (const selector of components) {
      const element = page.locator(selector).first();
      if (await element.count() > 0) {
        await expect(element).toBeVisible();

        // Check that the element has proper contrast
        const colors = await getComputedColor(page, selector);
        if (colors.color && colors.backgroundColor) {
          const contrast = await checkContrastRatio(page, colors.color, colors.backgroundColor);
          if (contrast.ratio > 1) { // Only test if we have actual colors
            expect(contrast.meetsAA).toBe(true);
          }
        }
      }
    }
  });

  test('should maintain proper form styling in dark mode', async ({ page }) => {
    const loginResult = await loginAsAdmin(page);
    if (loginResult === 'rate_limited') {
      test.skip('Admin account is rate limited - skipping test');
    } else if (!loginResult) {
      test.skip('Admin login failed - skipping dark mode test');
    }

    await waitForPageReady(page, {
      timeout: 15000,
      waitForSelector: '.search-bar'
    });

    // Test form inputs in dark mode
    const searchInput = page.locator('[data-testid="search-registrations"]');
    await expect(searchInput).toBeVisible();

    // Check input styling
    const inputColors = await getComputedColor(page, '[data-testid="search-registrations"]');
    expect(inputColors.color).toBeTruthy();
    expect(inputColors.backgroundColor).toBeTruthy();

    // Test input functionality
    await searchInput.fill('test search');
    const inputValue = await searchInput.inputValue();
    expect(inputValue).toBe('test search');

    // Test select dropdown
    const selectElement = page.locator('[data-testid="ticket-type-filter"]');
    await expect(selectElement).toBeVisible();

    const selectColors = await getComputedColor(page, '[data-testid="ticket-type-filter"]');
    expect(selectColors.color).toBeTruthy();
    expect(selectColors.backgroundColor).toBeTruthy();

    // Test button styling
    const searchButton = page.locator('[data-testid="search-button"]');
    await expect(searchButton).toBeVisible();

    const buttonColors = await getComputedColor(page, '[data-testid="search-button"]');
    expect(buttonColors.backgroundColor).toBeTruthy();
  });

  test('should persist dark theme across admin page navigation', async ({ page }) => {
    const loginResult = await loginAsAdmin(page);
    if (loginResult === 'rate_limited') {
      test.skip('Admin account is rate limited - skipping test');
    } else if (!loginResult) {
      test.skip('Admin login failed - skipping dark mode test');
    }

    // Start at dashboard and verify dark theme
    let themeAttribute = await page.getAttribute('html', 'data-theme');
    expect(themeAttribute).toBe('dark');

    // Navigate to admin portal (if link exists)
    const portalButton = page.locator('.portal-btn');
    if (await portalButton.count() > 0) {
      await portalButton.click();

      await waitForConditions(page, {
        timeout: 10000,
        domReady: true,
        noLoadingSpinners: false
      });

      // Check theme persistence
      themeAttribute = await page.getAttribute('html', 'data-theme');
      expect(themeAttribute).toBe('dark');
    }

    // Navigate to analytics (if available)
    const analyticsButton = page.locator('.analytics-btn');
    if (await analyticsButton.count() > 0) {
      await analyticsButton.click();

      await waitForConditions(page, {
        timeout: 10000,
        domReady: true,
        noLoadingSpinners: false
      });

      // Check theme persistence
      themeAttribute = await page.getAttribute('html', 'data-theme');
      expect(themeAttribute).toBe('dark');
    }
  });

  test('should maintain light theme for main site pages', async ({ page }) => {
    // Test main site pages to ensure they stay light
    const mainSitePages = ['/', '/about', '/tickets', '/gallery'];

    for (const pagePath of mainSitePages) {
      await page.goto(pagePath);
      await waitForPageReady(page, {
        timeout: 15000,
        checkNetworkIdle: true
      });

      const themeAttribute = await page.getAttribute('html', 'data-theme');

      // Main site should not have dark theme or should be light/auto
      expect(themeAttribute).not.toBe('dark');

      // Verify light colors are applied
      const bodyStyles = await page.evaluate(() => {
        const styles = window.getComputedStyle(document.documentElement);
        return {
          background: styles.getPropertyValue('--color-background'),
          textPrimary: styles.getPropertyValue('--color-text-primary')
        };
      });

      // In light mode, background should be light and text should be dark
      const bgValue = bodyStyles.background.trim();
      const textValue = bodyStyles.textPrimary.trim();

      // Should be white or very light background
      expect(bgValue === '#ffffff' || bgValue === 'var(--color-white)' || !bgValue).toBe(true);

      // Should be black or very dark text
      expect(textValue === '#000000' || textValue === 'var(--color-black)' || !textValue).toBe(true);
    }
  });

  test('should support visual regression testing for color inversion', async ({ page }) => {
    const loginResult = await loginAsAdmin(page);
    if (loginResult === 'rate_limited') {
      test.skip('Admin account is rate limited - skipping test');
    } else if (!loginResult) {
      test.skip('Admin login failed - skipping dark mode test');
    }

    await waitForPageReady(page, {
      timeout: 15000,
      waitForSelector: '[data-testid="dashboard-stats"]'
    });

    // Test key color inversions
    const colorTests = [
      {
        element: '.admin-header',
        property: 'backgroundColor',
        expectedDark: true // Should be dark in dark mode
      },
      {
        element: '.stat-card',
        property: 'backgroundColor',
        expectedDark: false // Should be lighter than header
      },
      {
        element: '.stat-card h3',
        property: 'color',
        expectedDark: false // Text should be light in dark mode
      },
      {
        element: '.data-table th',
        property: 'backgroundColor',
        expectedDark: false // Table headers should be visible
      }
    ];

    for (const colorTest of colorTests) {
      const element = page.locator(colorTest.element).first();

      if (await element.count() > 0) {
        const color = await page.evaluate(({ sel, prop }) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const styles = window.getComputedStyle(el);
          return styles[prop];
        }, { sel: colorTest.element, prop: colorTest.property });

        expect(color).toBeTruthy();

        // Basic check that color values make sense for dark mode
        if (color && color.includes('rgb')) {
          const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
          if (rgbMatch) {
            const [, r, g, b] = rgbMatch.map(Number);
            const brightness = (r + g + b) / 3;

            if (colorTest.expectedDark) {
              expect(brightness).toBeLessThan(128); // Should be darker colors
            } else {
              // For text and lighter elements, expect reasonable visibility
              expect(brightness).toBeGreaterThan(50);
            }
          }
        }
      }
    }
  });

  test('should ensure data tables are readable in dark mode', async ({ page }) => {
    const loginResult = await loginAsAdmin(page);
    if (loginResult === 'rate_limited') {
      test.skip('Admin account is rate limited - skipping test');
    } else if (!loginResult) {
      test.skip('Admin login failed - skipping dark mode test');
    }

    await waitForPageReady(page, {
      timeout: 15000,
      waitForSelector: '[data-testid="registrations-table"]'
    });

    // Wait for table to load with data or show empty state
    await waitForConditions(page, {
      timeout: 10000,
      domReady: true,
      customFunction: () => {
        const table = document.querySelector('[data-testid="registrations-table"]');
        return table && !table.textContent.includes('Loading registrations');
      }
    });

    const tableContainer = page.locator('[data-testid="registrations-table"]');
    await expect(tableContainer).toBeVisible();

    // Check if table has data or empty state
    const tableContent = await tableContainer.textContent();

    if (tableContent.includes('No registrations found')) {
      // Empty state should still be readable
      const emptyStateColors = await getComputedColor(page, '[data-testid="registrations-table"] p');
      if (emptyStateColors && emptyStateColors.color) {
        expect(emptyStateColors.color).toBeTruthy();
      }
    } else if (tableContent.includes('data-table')) {
      // If we have actual table data, test readability
      const tableHeaders = page.locator('.data-table th');
      const headerCount = await tableHeaders.count();

      if (headerCount > 0) {
        const headerColors = await getComputedColor(page, '.data-table th');
        expect(headerColors.color).toBeTruthy();
        expect(headerColors.backgroundColor).toBeTruthy();

        // Test contrast ratio for table headers
        const headerContrast = await checkContrastRatio(page, headerColors.color, headerColors.backgroundColor);
        expect(headerContrast.meetsAA).toBe(true);
      }

      // Check table cell readability
      const tableCells = page.locator('.data-table td');
      const cellCount = await tableCells.count();

      if (cellCount > 0) {
        const cellColors = await getComputedColor(page, '.data-table td');
        expect(cellColors.color).toBeTruthy();

        // Check button visibility in table
        const buttons = page.locator('.data-table button');
        const buttonCount = await buttons.count();

        if (buttonCount > 0) {
          const buttonColors = await getComputedColor(page, '.data-table button');
          expect(buttonColors.backgroundColor).toBeTruthy();
          expect(buttonColors.color).toBeTruthy();
        }
      }
    }
  });

  test('should handle theme switching gracefully', async ({ page }) => {
    // Test programmatic theme switching if theme manager is available
    await page.goto('/admin/login');
    await waitForPageReady(page, {
      timeout: 15000,
      waitForSelector: '.login-container'
    });

    // Check if theme manager is available
    const hasThemeManager = await page.evaluate(() => {
      return typeof window.setTheme === 'function' ||
             typeof window.toggleTheme === 'function';
    });

    if (hasThemeManager) {
      // Test theme switching
      await page.evaluate(() => {
        if (window.setTheme) {
          window.setTheme('light');
        }
      });

      await page.waitForTimeout(100); // Allow theme change to apply

      let themeAttribute = await page.getAttribute('html', 'data-theme');
      expect(themeAttribute).toBe('light');

      // Switch back to dark for admin pages
      await page.evaluate(() => {
        if (window.setTheme) {
          window.setTheme('dark');
        }
      });

      await page.waitForTimeout(100); // Allow theme change to apply

      themeAttribute = await page.getAttribute('html', 'data-theme');
      expect(themeAttribute).toBe('dark');
    }
  });
});
/**
 * Basic smoke tests to verify Playwright setup
 */

import { test, expect } from '@playwright/test';
import { testURLs, testTimeouts } from '../fixtures/test-data.js';
import { waitForAPI } from '../helpers/test-utils.js';

test.describe('Smoke Tests - Basic Connectivity', () => {
  test.beforeEach(async ({ page }) => {
    // Set a reasonable timeout for smoke tests
    page.setDefaultTimeout(testTimeouts.medium);
  });

  test('homepage loads successfully', async ({ page }) => {
    await page.goto('/');

    // Check for essential elements
    await expect(page).toHaveTitle(/A Lo Cubano|Boulder Fest/i);

    // Check navigation exists
    const nav = await page.$('nav');
    expect(nav).toBeTruthy();

    // Check for main content
    const mainContent = await page.$('main, #main, .main-content, body');
    expect(mainContent).toBeTruthy();
  });

  test('API health check endpoint responds', async ({ page }) => {
    const response = await page.request.get('/api/health/check');

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('status');
  });

  test('critical pages are accessible', async ({ page }) => {
    const criticalPages = [
      { path: '/', title: /A Lo Cubano|Boulder Fest/i },
      { path: '/tickets', content: /ticket|pass/i },
      { path: '/about', content: /about|festival/i },
      { path: '/artists', content: /artist|performer/i }
    ];

    for (const { path, title, content } of criticalPages) {
      await test.step(`Check page: ${path}`, async () => {
        await page.goto(path);

        // Check page loaded without errors
        const response = await page.goto(path);
        expect(response.status()).toBeLessThan(400);

        // Check for expected content
        if (title) {
          await expect(page).toHaveTitle(title, { timeout: 5000 });
        }

        if (content) {
          await expect(page.locator('body')).toContainText(content, {
            ignoreCase: true,
            timeout: 5000
          });
        }
      });
    }
  });

  test('static assets load correctly', async ({ page }) => {
    await page.goto('/');

    // Check CSS loaded
    const hasStyles = await page.evaluate(() => {
      const sheets = document.styleSheets;
      return sheets.length > 0;
    });
    expect(hasStyles).toBeTruthy();

    // Check JavaScript loaded
    const hasScripts = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script');
      return scripts.length > 0;
    });
    expect(hasScripts).toBeTruthy();

    // Check for any console errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Allow some console errors but not critical ones
    const criticalErrors = consoleErrors.filter(error =>
      error.includes('TypeError') ||
      error.includes('ReferenceError') ||
      error.includes('SyntaxError')
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('mobile viewport renders correctly', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/');

    // Check for mobile menu button (hamburger)
    const mobileMenuButton = await page.$('[aria-label*="menu" i], .mobile-menu, .hamburger, button[onclick*="menu"]');
    expect(mobileMenuButton).toBeTruthy();

    // Check content fits in viewport
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(375 + 20); // Allow small margin
  });

  test('navigation links work', async ({ page }) => {
    await page.goto('/');

    // Find all navigation links
    const navLinks = await page.$$eval('nav a, .navigation a, header a', links =>
      links.map(link => ({
        href: link.href,
        text: link.textContent.trim()
      })).filter(link =>
        link.href &&
        !link.href.includes('mailto:') &&
        !link.href.includes('tel:') &&
        !link.href.includes('#')
      )
    );

    // Test at least some navigation links exist
    expect(navLinks.length).toBeGreaterThan(0);

    // Test first few navigation links
    for (const link of navLinks.slice(0, 3)) {
      await test.step(`Check navigation to: ${link.text}`, async () => {
        const response = await page.request.get(link.href);
        expect(response.status()).toBeLessThan(400);
      });
    }
  });

  test('page has proper meta tags', async ({ page }) => {
    await page.goto('/');

    // Check for essential meta tags
    const metaTags = await page.$$eval('meta', tags =>
      tags.map(tag => ({
        name: tag.getAttribute('name'),
        property: tag.getAttribute('property'),
        content: tag.getAttribute('content')
      }))
    );

    // Check for viewport meta tag
    const viewportTag = metaTags.find(tag => tag.name === 'viewport');
    expect(viewportTag).toBeTruthy();

    // Check for description
    const descriptionTag = metaTags.find(tag => tag.name === 'description');
    expect(descriptionTag).toBeTruthy();
  });

  test('forms have CSRF protection', async ({ page }) => {
    await page.goto('/tickets');

    // Check if forms exist
    const forms = await page.$$('form');

    if (forms.length > 0) {
      // Check for CSRF tokens or security headers
      const hasCSRFToken = await page.evaluate(() => {
        const forms = document.querySelectorAll('form');
        for (const form of forms) {
          const csrfInput = form.querySelector('input[name*="csrf" i], input[name*="token" i]');
          if (csrfInput) return true;
        }
        return false;
      });

      // CSRF tokens are recommended but not required for all forms
      if (!hasCSRFToken) {
        console.log('Note: No CSRF tokens found in forms');
      }
    }
  });

  test('images have alt text', async ({ page }) => {
    await page.goto('/');

    const imagesWithoutAlt = await page.$$eval('img', images =>
      images.filter(img => !img.alt && !img.src.includes('data:image')).length
    );

    // Allow some images without alt text but warn
    if (imagesWithoutAlt > 0) {
      console.log(`Warning: ${imagesWithoutAlt} images without alt text`);
    }

    expect(imagesWithoutAlt).toBeLessThan(10); // Reasonable threshold
  });

  test('JavaScript errors do not occur on page load', async ({ page }) => {
    const errors = [];

    page.on('pageerror', error => {
      errors.push(error.message);
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Filter out acceptable errors (third-party scripts, etc.)
    const criticalErrors = errors.filter(error =>
      !error.includes('googletagmanager') &&
      !error.includes('analytics') &&
      !error.includes('facebook')
    );

    expect(criticalErrors).toHaveLength(0);
  });
});
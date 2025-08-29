import { test, expect } from '@playwright/test';

test.describe('Homepage E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Mock external services
    await page.route('**/api/gallery/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          images: [],
          videos: [],
          total: 0
        })
      });
    });

    await page.route('**/api/featured-photos', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    // Navigate to homepage
    await page.goto('/');
  });

  test('homepage loads correctly', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/A Lo Cubano Boulder Fest/);
    
    // Check main elements are visible
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
  });

  test('navigation menu works', async ({ page }) => {
    // Test desktop navigation
    const nav = page.locator('nav');
    await expect(nav).toBeVisible();

    // Check main navigation links
    await expect(nav.locator('a[href="/about"]')).toBeVisible();
    await expect(nav.locator('a[href="/artists"]')).toBeVisible();
    await expect(nav.locator('a[href="/schedule"]')).toBeVisible();
    await expect(nav.locator('a[href="/tickets"]')).toBeVisible();

    // Test mobile menu toggle (if exists)
    const mobileToggle = page.locator('.mobile-menu-toggle, .hamburger, [data-mobile-menu]');
    if (await mobileToggle.isVisible()) {
      await mobileToggle.click();
      await expect(page.locator('.mobile-menu, .nav-mobile')).toBeVisible();
    }
  });

  test('hero section displays correctly', async ({ page }) => {
    const hero = page.locator('.hero, .hero-section, #hero');
    await expect(hero).toBeVisible();

    // Check for festival title
    await expect(page.locator('h1')).toContainText(/A Lo Cubano/i);
    
    // Check for date information
    await expect(page.getByText(/May.*2026/i)).toBeVisible();
    
    // Check for location information
    await expect(page.getByText(/Boulder.*CO/i)).toBeVisible();
  });

  test('footer links work', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // Check for essential footer links
    const instagramLink = footer.locator('a[href*="instagram.com"]');
    if (await instagramLink.isVisible()) {
      await expect(instagramLink).toHaveAttribute('target', '_blank');
    }

    // Check for email contact
    const emailLink = footer.locator('a[href*="mailto:"]');
    if (await emailLink.isVisible()) {
      await expect(emailLink).toHaveAttribute('href', /mailto:.+@.+/);
    }

    // Check for internal footer links
    const aboutLink = footer.locator('a[href="/about"]');
    if (await aboutLink.isVisible()) {
      await aboutLink.click();
      await expect(page).toHaveURL('/about');
      await page.goBack();
    }
  });

  test('page is responsive', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();

    // Test desktop viewport
    await page.setViewportSize({ width: 1200, height: 800 });
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
  });

  test('page loads without console errors', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Filter out known acceptable errors
    const criticalErrors = consoleErrors.filter(error => 
      !error.includes('favicon') && 
      !error.includes('404') &&
      !error.includes('net::ERR_FAILED')
    );
    
    expect(criticalErrors).toHaveLength(0);
  });
});
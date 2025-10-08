/**
 * Navigation Links E2E Tests
 *
 * Tests that all navigation links work correctly in the browser, including:
 * - Main navigation links
 * - Event dropdown navigation
 * - Event sub-navigation for all events
 * - Mobile navigation menu
 *
 * This test will FAIL if any navigation links are broken.
 */
import { test, expect } from '@playwright/test';

test.describe('Navigation Links - Main Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/home');
    await page.waitForLoadState('networkidle');
  });

  test('should navigate to all main navigation pages', async ({ page }) => {
    const mainNavLinks = [
      { text: 'About', expectedUrl: /\/about/ },
      { text: 'Tickets', expectedUrl: /\/tickets/ },
      { text: 'Donate', expectedUrl: /\/donations/ },
      { text: 'Contact', expectedUrl: /\/contact/ },
    ];

    for (const link of mainNavLinks) {
      // Navigate to the link
      const navLink = page.getByRole('link', { name: link.text }).first();
      await expect(navLink).toBeVisible();
      await navLink.click();

      // Verify URL changed correctly
      await expect(page).toHaveURL(link.expectedUrl);

      // Return to home
      await page.getByRole('link', { name: 'Home' }).first().click();
      await expect(page).toHaveURL(/\/home/);
    }
  });
});

test.describe('Navigation Links - Events Dropdown', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/home');
    await page.waitForLoadState('networkidle');
  });

  test('should navigate to Boulder Fest 2026 from dropdown', async ({ page }) => {
    // Open Events dropdown
    const eventsButton = page.locator('[data-dropdown="events"]').first();
    await eventsButton.click();

    // Wait for dropdown to be visible
    const dropdown = page.locator('.dropdown-menu[aria-hidden="false"]');
    await expect(dropdown).toBeVisible();

    // Click on 2026 Festival link
    const fest2026Link = page.getByRole('menuitem', { name: '2026 Festival' });
    await expect(fest2026Link).toBeVisible();
    await fest2026Link.click();

    // Verify navigation
    await expect(page).toHaveURL(/\/boulder-fest-2026/);

    // Verify page content
    await expect(page.getByRole('heading', { name: /Boulder Fest 2026/i })).toBeVisible();
  });

  test('should navigate to Boulder Fest 2025 from dropdown', async ({ page }) => {
    // Open Events dropdown
    const eventsButton = page.locator('[data-dropdown="events"]').first();
    await eventsButton.click();

    // Wait for dropdown
    const dropdown = page.locator('.dropdown-menu[aria-hidden="false"]');
    await expect(dropdown).toBeVisible();

    // Click on 2025 Festival link
    const fest2025Link = page.getByRole('menuitem', { name: '2025 Festival' });
    await expect(fest2025Link).toBeVisible();
    await fest2025Link.click();

    // Verify navigation
    await expect(page).toHaveURL(/\/boulder-fest-2025/);

    // Verify page content
    await expect(page.getByRole('heading', { name: /Boulder Fest 2025/i })).toBeVisible();
  });

  test('should navigate to Weekender November 2025 from dropdown', async ({ page }) => {
    // Open Events dropdown
    const eventsButton = page.locator('[data-dropdown="events"]').first();
    await eventsButton.click();

    // Wait for dropdown
    const dropdown = page.locator('.dropdown-menu[aria-hidden="false"]');
    await expect(dropdown).toBeVisible();

    // Click on November 2025 Weekender link
    const weekenderLink = page.getByRole('menuitem', { name: 'November 2025' });
    await expect(weekenderLink).toBeVisible();
    await weekenderLink.click();

    // Verify navigation - should go to /weekender-2025-11 NOT /tickets
    await expect(page).toHaveURL(/\/weekender-2025-11/);

    // Verify page content - should show weekender content
    await expect(page.getByRole('heading', { name: /Weekender.*November 2025/i })).toBeVisible();
  });
});

test.describe('Navigation Links - Boulder Fest 2026 Sub-Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/boulder-fest-2026');
    await page.waitForLoadState('networkidle');
  });

  test('should navigate between Boulder Fest 2026 sub-pages', async ({ page }) => {
    const subNavLinks = [
      { text: 'Artists', expectedUrl: /\/boulder-fest-2026\/artists/ },
      { text: 'Schedule', expectedUrl: /\/boulder-fest-2026\/schedule/ },
      { text: 'Gallery', expectedUrl: /\/boulder-fest-2026\/gallery/ },
      { text: 'Overview', expectedUrl: /\/boulder-fest-2026\/?$/ },
    ];

    for (const link of subNavLinks) {
      // Click on sub-nav link
      const subNavLink = page.locator('.event-nav-link').filter({ hasText: link.text });
      await expect(subNavLink).toBeVisible();
      await subNavLink.click();

      // Verify URL changed correctly
      await expect(page).toHaveURL(link.expectedUrl);
    }
  });
});

test.describe('Navigation Links - Boulder Fest 2025 Sub-Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/boulder-fest-2025');
    await page.waitForLoadState('networkidle');
  });

  test('should navigate between Boulder Fest 2025 sub-pages', async ({ page }) => {
    const subNavLinks = [
      { text: 'Artists', expectedUrl: /\/boulder-fest-2025\/artists/ },
      { text: 'Schedule', expectedUrl: /\/boulder-fest-2025\/schedule/ },
      { text: 'Gallery', expectedUrl: /\/boulder-fest-2025\/gallery/ },
      { text: 'Overview', expectedUrl: /\/boulder-fest-2025\/?$/ },
    ];

    for (const link of subNavLinks) {
      // Click on sub-nav link
      const subNavLink = page.locator('.event-nav-link').filter({ hasText: link.text });
      await expect(subNavLink).toBeVisible();
      await subNavLink.click();

      // Verify URL changed correctly
      await expect(page).toHaveURL(link.expectedUrl);
    }
  });
});

test.describe('Navigation Links - Weekender 2025-11 Sub-Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/weekender-2025-11');
    await page.waitForLoadState('networkidle');
  });

  test('should navigate to Weekender artists page', async ({ page }) => {
    // Click on Artists sub-nav link
    const artistsLink = page.locator('.event-nav-link').filter({ hasText: 'Artists' });
    await expect(artistsLink).toBeVisible();
    await artistsLink.click();

    // Verify navigation - should go to /weekender-2025-11/artists NOT redirect to home
    await expect(page).toHaveURL(/\/weekender-2025-11\/artists/);

    // Verify page content shows artists information
    await expect(page.getByRole('heading', { name: /instructor/i })).toBeVisible();
  });

  test('should navigate to Weekender schedule page', async ({ page }) => {
    // Click on Schedule sub-nav link
    const scheduleLink = page.locator('.event-nav-link').filter({ hasText: 'Schedule' });
    await expect(scheduleLink).toBeVisible();
    await scheduleLink.click();

    // Verify navigation - should go to /weekender-2025-11/schedule NOT redirect to home
    await expect(page).toHaveURL(/\/weekender-2025-11\/schedule/);

    // Verify page content shows schedule information
    await expect(page.getByRole('heading', { name: /schedule/i })).toBeVisible();
  });

  test('should navigate to Weekender gallery page', async ({ page }) => {
    // Click on Gallery sub-nav link
    const galleryLink = page.locator('.event-nav-link').filter({ hasText: 'Gallery' });
    await expect(galleryLink).toBeVisible();
    await galleryLink.click();

    // Verify navigation - should go to /weekender-2025-11/gallery NOT redirect to home
    await expect(page).toHaveURL(/\/weekender-2025-11\/gallery/);

    // Verify page content shows gallery
    await expect(page.getByRole('heading', { name: /gallery/i })).toBeVisible();
  });

  test('should navigate to Weekender overview from sub-pages', async ({ page }) => {
    // Navigate to artists first
    await page.goto('/weekender-2025-11/artists');
    await page.waitForLoadState('networkidle');

    // Click on Overview sub-nav link
    const overviewLink = page.locator('.event-nav-link').filter({ hasText: 'Overview' });
    await expect(overviewLink).toBeVisible();
    await overviewLink.click();

    // Verify navigation back to overview
    await expect(page).toHaveURL(/\/weekender-2025-11\/?$/);

    // Verify page content shows weekender overview
    await expect(page.getByRole('heading', { name: /Weekender.*November 2025/i })).toBeVisible();
  });
});

test.describe('Navigation Links - Mobile Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/home');
    await page.waitForLoadState('networkidle');
  });

  test('should navigate using mobile menu', async ({ page }) => {
    // Open mobile menu
    const menuToggle = page.getByRole('button', { name: 'Toggle menu' });
    await expect(menuToggle).toBeVisible();
    await menuToggle.click();

    // Wait for menu to be visible
    const navList = page.locator('#main-navigation');
    await expect(navList).toBeVisible();

    // Click on About link in mobile menu
    const aboutLink = navList.getByRole('link', { name: 'About' });
    await expect(aboutLink).toBeVisible();
    await aboutLink.click();

    // Verify navigation
    await expect(page).toHaveURL(/\/about/);
  });

  test('should navigate to Weekender from mobile dropdown', async ({ page }) => {
    // Open mobile menu
    const menuToggle = page.getByRole('button', { name: 'Toggle menu' });
    await menuToggle.click();

    // Open Events dropdown in mobile menu
    const eventsButton = page.locator('[data-dropdown="events"]');
    await expect(eventsButton).toBeVisible();
    await eventsButton.click();

    // Wait for dropdown
    const dropdown = page.locator('.dropdown-menu[aria-hidden="false"]');
    await expect(dropdown).toBeVisible();

    // Click on November 2025 Weekender
    const weekenderLink = page.getByRole('menuitem', { name: 'November 2025' });
    await expect(weekenderLink).toBeVisible();
    await weekenderLink.click();

    // Verify navigation to weekender, NOT tickets
    await expect(page).toHaveURL(/\/weekender-2025-11/);
  });
});

test.describe('Navigation Links - Broken Link Prevention', () => {
  test('Weekender dropdown should NOT go to tickets page on ANY page', async ({ page }) => {
    const pagesToCheck = [
      '/home',
      '/about',
      '/tickets',
      '/contact',
      '/donations',
      '/boulder-fest-2026',
      '/boulder-fest-2026/artists',
      '/boulder-fest-2026/schedule',
      '/boulder-fest-2026/gallery',
      '/boulder-fest-2025',
      '/boulder-fest-2025/artists',
      '/boulder-fest-2025/schedule',
      '/boulder-fest-2025/gallery',
      '/weekender-2025-11',
      '/weekender-2025-11/artists',
      '/weekender-2025-11/schedule',
      '/weekender-2025-11/gallery',
    ];

    for (const pagePath of pagesToCheck) {
      await page.goto(pagePath);
      await page.waitForLoadState('networkidle');

      // Open Events dropdown
      const eventsButton = page.locator('[data-dropdown="events"]').first();
      await eventsButton.click();

      // Click on Weekender link
      const weekenderLink = page.getByRole('menuitem', { name: 'November 2025' });
      await weekenderLink.click();

      // CRITICAL: Should NOT end up on tickets page
      await expect(page, `Should not go to tickets from ${pagePath}`).not.toHaveURL(/\/tickets/);

      // Should be on weekender page
      await expect(page, `Should go to weekender from ${pagePath}`).toHaveURL(/\/weekender-2025-11/);
    }
  });

  test('Weekender sub-navigation should NOT redirect to home', async ({ page }) => {
    await page.goto('/weekender-2025-11');
    await page.waitForLoadState('networkidle');

    // Click on each sub-nav link and ensure it doesn't redirect to home
    const subNavLinks = ['Artists', 'Schedule', 'Gallery'];

    for (const linkText of subNavLinks) {
      await page.goto('/weekender-2025-11');
      await page.waitForLoadState('networkidle');

      const link = page.locator('.event-nav-link').filter({ hasText: linkText });
      await link.click();

      // CRITICAL: Should NOT end up on home page
      await expect(page).not.toHaveURL(/\/home/);

      // Should be on correct weekender sub-page
      await expect(page).toHaveURL(new RegExp(`/weekender-2025-11/${linkText.toLowerCase()}`));
    }
  });
});

test.describe('Navigation Links - Weekender Link Consistency', () => {
  test('Weekender dropdown should exist and link correctly on all pages', async ({ page }) => {
    const pagesToCheck = [
      '/home',
      '/about',
      '/tickets',
      '/contact',
      '/donations',
      '/boulder-fest-2026',
      '/boulder-fest-2026/artists',
      '/boulder-fest-2026/schedule',
      '/boulder-fest-2026/gallery',
      '/boulder-fest-2025',
      '/boulder-fest-2025/artists',
      '/boulder-fest-2025/schedule',
      '/boulder-fest-2025/gallery',
      '/weekender-2025-11',
      '/weekender-2025-11/artists',
      '/weekender-2025-11/schedule',
      '/weekender-2025-11/gallery',
    ];

    for (const pagePath of pagesToCheck) {
      await page.goto(pagePath);
      await page.waitForLoadState('networkidle');

      // Open Events dropdown
      const eventsButton = page.locator('[data-dropdown="events"]').first();
      await expect(eventsButton, `Events dropdown should exist on ${pagePath}`).toBeVisible();
      await eventsButton.click();

      // Wait for dropdown to be visible
      const dropdown = page.locator('.dropdown-menu[aria-hidden="false"]');
      await expect(dropdown, `Events dropdown should open on ${pagePath}`).toBeVisible();

      // Find the November 2025 link
      const weekenderLink = page.getByRole('menuitem', { name: 'November 2025' });
      await expect(weekenderLink, `Weekender link should exist in dropdown on ${pagePath}`).toBeVisible();

      // Get the href attribute
      const href = await weekenderLink.getAttribute('href');

      // CRITICAL: Verify it points to /weekender-2025-11, NOT /tickets
      expect(href, `Weekender link on ${pagePath} should point to /weekender-2025-11, not ${href}`).toBe('/weekender-2025-11');

      // Close dropdown before moving to next page
      await eventsButton.click();
    }
  });
});

test.describe('Navigation Links - Comprehensive Smoke Test', () => {
  test('all event pages should be accessible from any starting point', async ({ page }) => {
    const eventPages = [
      '/boulder-fest-2026',
      '/boulder-fest-2026/artists',
      '/boulder-fest-2026/schedule',
      '/boulder-fest-2026/gallery',
      '/boulder-fest-2025',
      '/boulder-fest-2025/artists',
      '/boulder-fest-2025/schedule',
      '/boulder-fest-2025/gallery',
      '/weekender-2025-11',
      '/weekender-2025-11/artists',
      '/weekender-2025-11/schedule',
      '/weekender-2025-11/gallery',
    ];

    for (const eventPage of eventPages) {
      await page.goto(eventPage);

      // Each page should load successfully (not redirect to 404 or home fallback)
      await expect(page).toHaveURL(new RegExp(eventPage));

      // Page should have meaningful content (not empty or error)
      const headings = page.getByRole('heading');
      await expect(headings.first()).toBeVisible();
    }
  });
});

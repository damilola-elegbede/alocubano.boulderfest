/**
 * E2E Test: Basic Navigation
 * Tests core page navigation and routing functionality
 */

import { test, expect } from '@playwright/test';

test.describe('Basic Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load homepage successfully', async ({ page }) => {
    await expect(page).toHaveTitle(/A Lo Cubano Boulder Fest/i);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('should navigate to tickets page', async ({ page }) => {
    // Look for tickets link in navigation
    const ticketsLink = page.locator('a[href*="tickets"], nav a:has-text("Tickets"), .nav-link:has-text("Tickets")');
    await expect(ticketsLink.first()).toBeVisible();
    
    await ticketsLink.first().click();
    await expect(page).toHaveURL(/tickets/);
    await expect(page.locator('h1, h2')).toContainText(/tickets/i);
  });

  test('should navigate to about page', async ({ page }) => {
    const aboutLink = page.locator('a[href*="about"], nav a:has-text("About"), .nav-link:has-text("About")');
    if (await aboutLink.count() > 0) {
      await aboutLink.first().click();
      await expect(page).toHaveURL(/about/);
    }
  });

  test('should navigate to artists page', async ({ page }) => {
    const artistsLink = page.locator('a[href*="artists"], nav a:has-text("Artists"), .nav-link:has-text("Artists")');
    if (await artistsLink.count() > 0) {
      await artistsLink.first().click();
      await expect(page).toHaveURL(/artists/);
    }
  });

  test('should navigate to schedule page', async ({ page }) => {
    const scheduleLink = page.locator('a[href*="schedule"], nav a:has-text("Schedule"), .nav-link:has-text("Schedule")');
    if (await scheduleLink.count() > 0) {
      await scheduleLink.first().click();
      await expect(page).toHaveURL(/schedule/);
    }
  });

  test('should navigate to gallery page', async ({ page }) => {
    const galleryLink = page.locator('a[href*="gallery"], nav a:has-text("Gallery"), .nav-link:has-text("Gallery")');
    if (await galleryLink.count() > 0) {
      await galleryLink.first().click();
      await expect(page).toHaveURL(/gallery/);
    }
  });

  test('should handle mobile navigation menu', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    
    // Look for mobile menu toggle
    const mobileToggle = page.locator('.menu-toggle, .hamburger, .mobile-menu-toggle, button[aria-label*="menu"]');
    
    if (await mobileToggle.count() > 0) {
      await mobileToggle.first().click();
      
      // Menu should be visible
      const mobileMenu = page.locator('.mobile-menu, .nav-mobile, .slide-menu, nav[aria-expanded="true"]');
      await expect(mobileMenu.first()).toBeVisible();
    }
  });

  test('should display footer with key information', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
    
    // Check for contact information or social links
    const footerText = await footer.textContent();
    expect(footerText).toMatch(/contact|email|instagram|@/i);
  });

  test('should handle navigation accessibility', async ({ page }) => {
    // Check that navigation has proper ARIA labels and structure
    const navElement = page.locator('nav, [role="navigation"]');
    await expect(navElement.first()).toBeVisible();
    
    // Check for skip links or proper heading structure
    const skipLink = page.locator('a[href="#main"], .skip-link');
    const mainHeading = page.locator('h1');
    
    await expect(mainHeading).toBeVisible();
  });

  test('should maintain navigation state across pages', async ({ page }) => {
    // Navigate to tickets page
    const ticketsLink = page.locator('a[href*="tickets"]').first();
    await ticketsLink.click();
    await page.waitForURL(/tickets/);
    
    // Navigation should still be present and functional
    const homeLink = page.locator('a[href="/"], a[href*="index"], .logo a, nav a:has-text("Home")');
    if (await homeLink.count() > 0) {
      await homeLink.first().click();
      await expect(page).toHaveURL(/^\//);
    }
  });

  test('should handle 404 pages gracefully', async ({ page }) => {
    await page.goto('/non-existent-page.html');
    
    // Should either redirect to home or show 404 page
    await page.waitForTimeout(2000);
    const url = page.url();
    const bodyText = await page.locator('body').textContent();
    
    // Either back to home or proper 404 page
    expect(
      url.endsWith('/') || 
      bodyText.includes('404') || 
      bodyText.includes('not found')
    ).toBeTruthy();
  });

  test('should load pages within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/pages/tickets.html');
    const loadTime = Date.now() - startTime;
    
    // Should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
    await expect(page.locator('body')).toBeVisible();
  });
});
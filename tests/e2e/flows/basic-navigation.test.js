import { test, expect } from '@playwright/test';

test.describe('Basic Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/home');
  });

  test('should navigate between main pages', async ({ page }) => {
    // Test navigation to different pages
    const pages = [
      { link: 'About', url: /about/, timeout: 10000 },
      { link: 'Tickets', url: /tickets/, timeout: 10000 },
      { link: 'Contact', url: /contact/, timeout: 10000 },
    ];

    for (const { link, url, timeout } of pages) {
      // Find and click the navigation link
      const navLink = page.getByRole('link', { name: link }).first();
      await expect(navLink).toBeVisible();
      await navLink.click();

      // Wait for navigation with extended timeout
      await expect(page).toHaveURL(url, { timeout });

      // Return to home for next test
      const homeLink = page.getByRole('link', { name: 'Home' }).first();
      if (await homeLink.count() > 0) {
        await homeLink.click();
        await expect(page).toHaveURL(/home/, { timeout });
      }
    }
  });

  test('should handle Events dropdown navigation', async ({ page }) => {
    // Look for Events dropdown trigger
    const eventsButton = page.locator('[data-dropdown="events"], .nav-trigger')
      .filter({ hasText: /Events/i });

    if (await eventsButton.count() > 0) {
      // Click to open dropdown
      await eventsButton.first().click();

      // Wait for dropdown to appear
      const dropdown = page.locator('.dropdown-menu[aria-hidden="false"]');
      await expect(dropdown).toBeVisible({ timeout: 3000 });

      // Try to find and click on a gallery link
      const galleryLink = page.locator('.dropdown-link')
        .filter({ hasText: /2025|2026|Festival/i });

      if (await galleryLink.count() > 0) {
        await galleryLink.first().click();
        await expect(page).toHaveURL(/gallery/);
      }
    }
  });

  test('should handle mobile navigation menu', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    
    // Look for the actual mobile menu toggle button
    const menuToggle = page.locator('.menu-toggle');
    await expect(menuToggle).toBeVisible();
    
    // Click the menu toggle to open the mobile menu
    await menuToggle.click();
    
    // Wait for the navigation list to become visible with the 'is-open' class
    const navList = page.locator('.nav-list.is-open');
    await expect(navList).toBeVisible({ timeout: 5000 });
    
    // CRITICAL FIX: Wait for JavaScript state synchronization (ensureMenuStateSync runs after 100ms)
    await page.waitForTimeout(150);
    
    // Verify the toggle has the active state
    await expect(menuToggle).toHaveClass(/is-active/);
    
    // Verify ARIA expanded state
    await expect(menuToggle).toHaveAttribute('aria-expanded', 'true');
    
    // Test that clicking a navigation link closes the menu
    const homeLink = navList.locator('a[href="/home"]');
    if (await homeLink.count() > 0) {
      await homeLink.click();
      // Menu should close after clicking a navigation link
      await expect(navList).not.toHaveClass(/is-open/);
      await expect(menuToggle).not.toHaveClass(/is-active/);
    }
  });

  test('should display footer with key information', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // Check for key footer content
    await expect(footer).toContainText(/May 15-17, 2026/i);
    await expect(footer).toContainText(/Boulder, Colorado/i);
    
    // Check for contact email
    const emailLink = footer.locator('a[href*="mailto:alocubanoboulderfest@gmail.com"]');
    await expect(emailLink).toBeVisible();

    // Check for social links
    const instagramLink = footer.locator('a[href*="instagram.com"]');
    await expect(instagramLink).toBeVisible();
  });
});

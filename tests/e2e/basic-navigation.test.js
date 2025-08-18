/**
 * Basic E2E Navigation Tests
 * Part of streamlined test infrastructure - essential flows only
 */

import { test, expect } from '@playwright/test';

test.describe('Basic Navigation', () => {
  test('homepage loads correctly', async ({ page }) => {
    await page.goto('/');
    
    // Check page loads
    await expect(page).toHaveTitle(/A Lo Cubano Boulder Fest/);
    
    // Check essential elements
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('nav')).toBeVisible();
  });

  test('navigation menu works', async ({ page }) => {
    await page.goto('/');
    
    // Check navigation links
    const nav = page.locator('nav');
    await expect(nav.locator('a[href="/pages/tickets.html"]')).toBeVisible();
    await expect(nav.locator('a[href="/pages/about.html"]')).toBeVisible();
    await expect(nav.locator('a[href="/pages/artists.html"]')).toBeVisible();
  });

  test('tickets page accessible', async ({ page }) => {
    await page.goto('/pages/tickets.html');
    
    // Check page loads
    await expect(page.locator('h1')).toContainText(/tickets/i);
    
    // Check floating cart visibility
    const cart = page.locator('.floating-cart');
    await expect(cart).toBeVisible();
  });
});
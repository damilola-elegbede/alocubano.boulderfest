/**
 * Essential E2E Navigation Tests
 */
import { test, expect } from '@playwright/test';

test('homepage loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/A Lo Cubano Boulder Fest/);
});

test('tickets page accessible', async ({ page }) => {
  await page.goto('/pages/tickets.html');
  await expect(page.locator('h1')).toBeVisible();
});
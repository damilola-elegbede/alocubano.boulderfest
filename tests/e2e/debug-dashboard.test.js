/**
 * Debug test to see what's actually on the dashboard page
 */

import { test, expect } from '@playwright/test';
import { getTestDataConstants } from '../../scripts/seed-test-data.js';

const testConstants = getTestDataConstants();

test('DEBUG: Check dashboard page content', async ({ page }) => {
  const adminCredentials = {
    email: testConstants.ADMIN_EMAIL,
    password: process.env.TEST_ADMIN_PASSWORD || 'test-admin-password'
  };

  // Login
  await page.goto('/pages/admin/login.html');
  await page.fill('input[name="username"]', adminCredentials.email);
  await page.fill('input[type="password"]', adminCredentials.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin/dashboard.html');

  // Wait for page to load
  await page.waitForLoadState('networkidle');

  // Debug: Print page content
  const url = page.url();
  const title = await page.title();
  const bodyText = await page.textContent('body');
  const statsGridExists = await page.locator('#statsGrid').count();
  const dataTestIdExists = await page.locator('[data-testid="dashboard-stats"]').count();
  const h1Text = await page.locator('h1').textContent();
  
  console.log('=== DASHBOARD DEBUG ===');
  console.log('URL:', url);
  console.log('Title:', title);
  console.log('H1 text:', h1Text);
  console.log('StatsGrid count:', statsGridExists);
  console.log('data-testid count:', dataTestIdExists);
  console.log('Body text (first 500 chars):', bodyText.substring(0, 500));
  console.log('======================');
  
  // Force success for debugging
  expect(true).toBe(true);
});

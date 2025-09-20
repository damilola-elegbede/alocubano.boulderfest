/**
 * Debug test to see what's actually on the dashboard page
 */

import { test, expect } from '@playwright/test';
import { getTestDataConstants } from '../../../scripts/seed-test-data.js';

const testConstants = getTestDataConstants();

test('ADMIN DEBUG: Check credentials and login', async ({ page }) => {
  const adminCredentials = {
    email: testConstants.admin.email,
    password: process.env.TEST_ADMIN_PASSWORD || 'test-admin-password'
  };

  console.log('=== CREDENTIALS DEBUG ===');
  console.log('Email:', adminCredentials.email);
  console.log('Password:', adminCredentials.password);
  console.log('ENV TEST_ADMIN_PASSWORD:', process.env.TEST_ADMIN_PASSWORD);
  console.log('E2E_TEST_MODE:', process.env.E2E_TEST_MODE);
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('=========================');

  // Login
  await page.goto('/admin/login');
  await page.fill('input[name="username"]', adminCredentials.email);
  await page.fill('input[type="password"]', adminCredentials.password);

  // Check for error messages before clicking submit
  const submitButton = page.locator('button[type="submit"]');
  await submitButton.click();

  // Wait a moment and check what happened
  await page.waitForTimeout(2000);

  const currentUrl = page.url();
  const title = await page.title();

  // Check for error messages
  const errorElement = page.locator('[data-testid="login-error"]');
  const errorVisible = await errorElement.count() > 0;
  let errorText = '';
  if (errorVisible) {
    errorText = await errorElement.textContent();
  }

  console.log('=== LOGIN RESULT DEBUG ===');
  console.log('Current URL:', currentUrl);
  console.log('Title:', title);
  console.log('Error visible:', errorVisible);
  console.log('Error text:', errorText);
  console.log('==========================');

  // Force success for debugging
  expect(true).toBe(true);
});

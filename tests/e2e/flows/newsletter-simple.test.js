/**
 * Simplified Newsletter E2E Test for Task_2_2_02
 * Quick validation of newsletter subscription functionality
 */

import { test, expect } from '@playwright/test';

test.describe('Newsletter Subscription - Quick Test', () => {
  test('should load contact page with newsletter form', async ({ page }) => {
    // Navigate to contact page
    await page.goto('/contact');
    
    // Verify newsletter form exists
    await expect(page.locator('#newsletter-form')).toBeVisible();
    await expect(page.locator('#newsletter-email')).toBeVisible();
    await expect(page.locator('input[name="consent"]')).toBeVisible();
    await expect(page.locator('.newsletter-submit')).toBeVisible();
    
    console.log('✅ Newsletter form elements found and visible');
  });
  
  test('should validate email and consent requirements', async ({ page }) => {
    await page.goto('/contact');
    
    const submitButton = page.locator('.newsletter-submit');
    const emailInput = page.locator('#newsletter-email');
    const consentCheckbox = page.locator('input[name="consent"]');
    
    // Initially button should be disabled
    await expect(submitButton).toBeDisabled();
    
    // Fill email but no consent - button should remain disabled
    await emailInput.fill('test@example.com');
    await expect(submitButton).toBeDisabled();
    
    // Add consent - button should be enabled
    await consentCheckbox.check();
    await expect(submitButton).toBeEnabled();
    
    console.log('✅ Email validation and consent requirement working');
  });

  test('should handle successful subscription', async ({ page }) => {
    await page.goto('/contact');
    
    // Mock successful API response
    await page.route('/api/email/subscribe', route => {
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Successfully subscribed to newsletter',
          subscriber: {
            email: 'test@example.com',
            status: 'active'
          }
        })
      });
    });
    
    // Fill and submit form
    await page.fill('#newsletter-email', 'test@example.com');
    await page.check('input[name="consent"]');
    await page.click('.newsletter-submit');
    
    // Verify success message
    await expect(page.locator('#newsletter-success')).toBeVisible();
    
    // Verify form is reset
    await expect(page.locator('#newsletter-email')).toHaveValue('');
    await expect(page.locator('input[name="consent"]')).not.toBeChecked();
    
    console.log('✅ Newsletter subscription flow working');
  });
});
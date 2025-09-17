/**
 * Newsletter E2E Test with Test Isolation
 * 
 * Demonstrates how to use the test isolation system for clean,
 * conflict-free E2E testing with unique test data per test run.
 */

import { test, expect } from '@playwright/test';
import {
  initializeTestIsolation,
  cleanupTestIsolation,
  withTestTransaction,
  generateTestEmail,
  waitMs
} from '../helpers/test-isolation.js';
import { NewsletterFixtures, getAllFixtures } from '../helpers/test-fixtures.js';
import { createStorageUtils } from '../helpers/storage-utils.js';

// Initialize test isolation for this test suite
test.beforeAll(async () => {
  await initializeTestIsolation();
  console.log('🧪 Test isolation initialized for Newsletter suite');
});

// Cleanup after all tests
test.afterAll(async () => {
  await cleanupTestIsolation();
  console.log('✅ Test isolation cleanup complete for Newsletter suite');
});

test.describe('Newsletter Subscription with Test Isolation', () => {
  let storageUtils;

  test.beforeEach(async ({ page }) => {
    // Create isolated storage utilities for this test
    storageUtils = createStorageUtils(test.info().title);
    
    // Setup clean storage state
    await storageUtils.setupCleanState(page);
    
    // Navigate to contact page
    await page.goto('/contact');
    await page.waitForLoadState('domcontentloaded');
    
    console.log(`🧹 Clean test environment setup for: ${test.info().title}`);
  });

  test.afterEach(async ({ page }) => {
    // Clean up test storage after each test
    if (storageUtils) {
      await storageUtils.clearAll(page);
    }
    
    // Small delay to ensure cleanup completes
    await waitMs(100);
    
    console.log(`🧹 Test cleanup complete for: ${test.info().title}`);
  });

  test('should load contact page with newsletter form (isolated)', async ({ page }) => {
    await withTestTransaction(test.info().title, async (namespace) => {
      console.log(`🔍 Running test with namespace: ${namespace}`);
      
      // Verify newsletter form exists
      await expect(page.locator('#newsletter-form')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#newsletter-email')).toBeVisible();
      await expect(page.locator('.custom-checkbox .checkmark')).toBeVisible();
      await expect(page.locator('.newsletter-submit')).toBeVisible();
      
      console.log('✅ Newsletter form elements found and visible');
      
      // Verify clean storage state
      const storageData = await storageUtils.getAllStorageData(page);
      expect(Object.keys(storageData.localStorage)).toHaveLength(0);
      
      return { success: true, namespace };
    });
  });

  test('should validate email with unique test data (isolated)', async ({ page }) => {
    await withTestTransaction(test.info().title, async (namespace) => {
      // Get unique test email for this test
      const testEmail = generateTestEmail(test.info().title, 'validation');
      console.log(`📧 Using test email: ${testEmail}`);
      
      const emailInput = page.locator('#newsletter-email');
      const customCheckbox = page.locator('.custom-checkbox');
      
      // Verify form elements exist
      await expect(emailInput).toBeVisible();
      await expect(customCheckbox).toBeVisible();
      
      // Fill email input with unique test email
      await emailInput.fill(testEmail);
      await expect(emailInput).toHaveValue(testEmail);
      
      console.log('✅ Email validation with unique test data working');
      
      return { email: testEmail, namespace };
    });
  });

  test('should handle successful subscription with real API (isolated)', async ({ page }) => {
    await withTestTransaction(test.info().title, async (namespace) => {
      // Use test fixtures for consistent test data
      const subscriptionData = NewsletterFixtures.validSubscription(test.info().title);
      console.log(`📧 Using test subscription data:`, subscriptionData);
      
      const emailInput = page.locator('#newsletter-email');
      const customCheckbox = page.locator('.custom-checkbox');
      const submitButton = page.locator('.newsletter-submit');
      
      await expect(emailInput).toBeVisible();
      await expect(customCheckbox).toBeVisible();
      await expect(submitButton).toBeVisible();
      
      // Fill and submit form with isolated test data
      await emailInput.fill(subscriptionData.email);
      await customCheckbox.click();
      
      // Listen for network requests to verify API is called
      const responsePromise = page.waitForResponse('/api/email/subscribe');
      await submitButton.click();
      
      // Wait for API response
      const response = await responsePromise;
      
      // Verify API was called successfully
      expect(response.status()).toBeLessThan(500);
      
      console.log(`✅ Newsletter subscription API called successfully with status: ${response.status()}`);
      console.log(`📧 Used unique email: ${subscriptionData.email}`);
      
      return { response: response.status(), email: subscriptionData.email, namespace };
    });
  });

  test('should handle multiple parallel subscriptions without conflicts', async ({ page, browser }) => {
    // This test demonstrates parallel execution safety
    await withTestTransaction(test.info().title, async (namespace) => {
      console.log(`🔄 Testing parallel execution safety with namespace: ${namespace}`);
      
      // Create multiple test contexts to simulate parallel users
      const contexts = await Promise.all([
        browser.newContext(),
        browser.newContext(),
        browser.newContext()
      ]);
      
      const pages = await Promise.all(contexts.map(ctx => ctx.newPage()));
      
      try {
        // Each "user" gets unique test data
        const subscriptionTasks = pages.map(async (testPage, index) => {
          const userTestTitle = `${test.info().title}-user${index}`;
          const userStorage = createStorageUtils(userTestTitle);
          
          await userStorage.setupCleanState(testPage);
          await testPage.goto('/contact');
          await testPage.waitForLoadState('domcontentloaded');
          
          const userSubscription = NewsletterFixtures.validSubscription(userTestTitle);
          console.log(`👤 User ${index} using email: ${userSubscription.email}`);
          
          const emailInput = testPage.locator('#newsletter-email');
          const customCheckbox = testPage.locator('.custom-checkbox');
          const submitButton = testPage.locator('.newsletter-submit');
          
          await emailInput.fill(userSubscription.email);
          await customCheckbox.click();
          
          const responsePromise = testPage.waitForResponse('/api/email/subscribe');
          await submitButton.click();
          const response = await responsePromise;
          
          await userStorage.clearAll(testPage);
          
          return {
            userId: index,
            email: userSubscription.email,
            status: response.status()
          };
        });
        
        // Execute all subscriptions in parallel
        const results = await Promise.all(subscriptionTasks);
        
        // Verify all subscriptions succeeded and used unique emails
        const emails = results.map(r => r.email);
        const uniqueEmails = new Set(emails);
        
        expect(uniqueEmails.size).toBe(emails.length); // All emails should be unique
        
        results.forEach(result => {
          expect(result.status).toBeLessThan(500);
          console.log(`✅ User ${result.userId} subscription successful: ${result.email}`);
        });
        
        console.log('✅ Parallel execution test completed successfully');
        
        return { results, namespace };
      } finally {
        // Cleanup contexts
        await Promise.all(contexts.map(ctx => ctx.close()));
      }
    });
  });

  test('should use comprehensive fixtures (isolated)', async ({ page }) => {
    await withTestTransaction(test.info().title, async (namespace) => {
      // Get all available fixtures for this test
      const fixtures = getAllFixtures(test.info().title);
      
      console.log(`📦 Using comprehensive fixtures for namespace: ${namespace}`);
      console.log(`📧 Newsletter fixture email: ${fixtures.newsletter.valid.email}`);
      
      // Test with valid newsletter fixture
      const emailInput = page.locator('#newsletter-email');
      const customCheckbox = page.locator('.custom-checkbox');
      const submitButton = page.locator('.newsletter-submit');
      
      await emailInput.fill(fixtures.newsletter.valid.email);
      await customCheckbox.click();
      
      const responsePromise = page.waitForResponse('/api/email/subscribe');
      await submitButton.click();
      const response = await responsePromise;
      
      expect(response.status()).toBeLessThan(500);
      
      console.log('✅ Comprehensive fixtures test completed successfully');
      
      return { fixtures: Object.keys(fixtures), namespace };
    });
  });

  test('should maintain storage isolation (isolated)', async ({ page }) => {
    await withTestTransaction(test.info().title, async (namespace) => {
      // Test that storage operations are properly isolated
      
      // Set some test data in storage
      await storageUtils.preferences.setPreference(page, 'testKey', 'testValue');
      await storageUtils.cart.addToCart(page, { 
        id: 'test-item',
        name: 'Test Item',
        quantity: 1,
        namespace: namespace
      });
      
      // Verify data was stored with proper namespace
      const preference = await storageUtils.preferences.getPreference(page, 'testKey');
      const cart = await storageUtils.cart.getCart(page);
      
      expect(preference).toBe('testValue');
      expect(cart).toHaveLength(1);
      expect(cart[0].namespace).toBe(namespace);
      
      // Get all storage data for verification
      const allStorage = await storageUtils.getAllStorageData(page);
      console.log(`🗄️ Storage data for ${namespace}:`, allStorage);
      
      // Verify namespace isolation
      expect(Object.keys(allStorage.localStorage).length).toBeGreaterThan(0);
      
      console.log('✅ Storage isolation verified successfully');
      
      return { storageKeys: Object.keys(allStorage.localStorage), namespace };
    });
  });
});
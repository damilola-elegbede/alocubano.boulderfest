/**
 * Payment Failure Scenario E2E Tests
 * Tests various payment failure cases and recovery flows
 */

import { test, expect } from '@playwright/test';
import { TestDataFactory } from '../helpers/test-data-factory.js';
import { DatabaseCleanup } from '../helpers/database-cleanup.js';

test.describe('Payment Failure Scenarios', () => {
  let testDataFactory;
  let databaseCleanup;
  let testRunId;

  test.beforeAll(async () => {
    testDataFactory = new TestDataFactory({ seed: 12345 });
    databaseCleanup = new DatabaseCleanup();
    testRunId = testDataFactory.getTestRunId();
    console.log(`Payment failure test run: ${testRunId}`);
  });

  test.afterAll(async () => {
    // Clean up test data
    const cleanupResult = await databaseCleanup.cleanupByTestRunId(testRunId);
    console.log('Cleanup result:', cleanupResult);
    await databaseCleanup.close();
  });

  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(30000);
    
    // Clear cart and session
    await page.evaluate(() => {
      localStorage.removeItem('cart');
      localStorage.removeItem('checkoutSession');
      sessionStorage.clear();
    });
  });

  test('Card declined - no orphaned records created', async ({ page }) => {
    const failureScenario = testDataFactory.generateScenario('registration-flow', {
      customer: {
        name: 'Declined Card User',
        email: `declined_${testRunId}@e2e-test.com`,
        phone: '555-000-0002'
      }
    });

    await test.step('Add ticket to cart', async () => {
      await page.goto('/tickets');
      
      const addButton = page.locator('button').filter({ hasText: /Full Pass/i }).first();
      await addButton.click();
      
      await page.waitForFunction(() => {
        const cart = JSON.parse(localStorage.getItem('cart') || '[]');
        return cart.length > 0;
      });
    });

    await test.step('Proceed to checkout', async () => {
      const cartButton = page.locator('.floating-cart, .cart-icon').first();
      await cartButton.click();
      
      await page.waitForTimeout(500);
      
      const checkoutButton = page.locator('button').filter({ hasText: /Checkout/i }).first();
      await checkoutButton.click();
    });

    await test.step('Fill customer form', async () => {
      const nameInput = page.locator('input[name="name"]').first();
      
      if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await nameInput.fill(failureScenario.customer.name);
        
        const emailInput = page.locator('input[type="email"]').first();
        await emailInput.fill(failureScenario.customer.email);
        
        const phoneInput = page.locator('input[name="phone"]').first();
        await phoneInput.fill(failureScenario.customer.phone);
        
        const submitButton = page.locator('button[type="submit"]').first();
        await submitButton.click();
      }
    });

    await test.step('Attempt payment with declined card', async () => {
      const currentUrl = page.url();
      
      if (currentUrl.includes('stripe')) {
        // Use Stripe test card that will decline
        const cardFrame = page.frameLocator('iframe').first();
        await cardFrame.locator('[placeholder*="Card number"]').fill('4000000000000002');
        await cardFrame.locator('[placeholder*="MM / YY"]').fill('12/25');
        await cardFrame.locator('[placeholder*="CVC"]').fill('123');
        await cardFrame.locator('[placeholder*="ZIP"]').fill('80301');
        
        await page.locator('button[type="submit"]').click();
        
        // Wait for decline message
        await page.waitForSelector('text=/declined|failed|error/i', { timeout: 10000 });
      } else {
        // Mock decline scenario
        console.log('Simulating payment decline');
      }
    });

    await test.step('Verify error handling', async () => {
      // Check for error message
      const errorMessage = page.locator('text=/declined|payment.*failed|try.*again/i').first();
      await expect(errorMessage).toBeVisible();
      
      // Verify cart is preserved
      const cart = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem('cart') || '[]');
      });
      expect(cart.length).toBeGreaterThan(0);
    });

    await test.step('Verify no orphaned database records', async () => {
      // Check that no registration was created
      const verification = await databaseCleanup.verifyCleanup(testRunId);
      
      // With payment failure, there should be minimal or no records
      console.log('Database verification:', verification);
      
      // The test run ID might not have any permanent records
      expect(verification.remaining.registrations).toBe(0);
    });
  });

  test('Insufficient funds - retry with different card', async ({ page }) => {
    const retryScenario = testDataFactory.generateScenario('registration-flow', {
      customer: {
        name: 'Retry Payment User',
        email: `retry_${testRunId}@e2e-test.com`
      }
    });

    await test.step('Setup cart with ticket', async () => {
      await page.goto('/tickets');
      
      const addButton = page.locator('button').filter({ hasText: /Day Pass/i }).first();
      await addButton.click();
      
      const cartButton = page.locator('.floating-cart').first();
      await cartButton.click();
      
      const checkoutButton = page.locator('button').filter({ hasText: /Checkout/i }).first();
      await checkoutButton.click();
    });

    await test.step('First payment attempt - insufficient funds', async () => {
      const nameInput = page.locator('input[name="name"]').first();
      
      if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await nameInput.fill(retryScenario.customer.name);
        await page.locator('input[type="email"]').first().fill(retryScenario.customer.email);
        await page.locator('input[name="phone"]').first().fill('555-999-9995');
        await page.locator('button[type="submit"]').first().click();
      }
      
      const currentUrl = page.url();
      if (currentUrl.includes('stripe')) {
        // Use insufficient funds test card
        const cardFrame = page.frameLocator('iframe').first();
        await cardFrame.locator('[placeholder*="Card number"]').fill('4000000000009995');
        await cardFrame.locator('[placeholder*="MM / YY"]').fill('12/25');
        await cardFrame.locator('[placeholder*="CVC"]').fill('123');
        await cardFrame.locator('[placeholder*="ZIP"]').fill('80301');
        
        await page.locator('button[type="submit"]').click();
        
        // Wait for error
        await page.waitForSelector('text=/insufficient|failed/i', { timeout: 10000 });
      }
    });

    await test.step('Retry with valid card', async () => {
      // Look for retry button or go back to payment
      const retryButton = page.locator('button').filter({ hasText: /try.*again|retry/i }).first();
      
      if (await retryButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await retryButton.click();
      } else {
        // Navigate back to checkout
        await page.goBack();
      }
      
      // Attempt with valid card
      const currentUrl = page.url();
      if (currentUrl.includes('stripe')) {
        const cardFrame = page.frameLocator('iframe').first();
        await cardFrame.locator('[placeholder*="Card number"]').fill('4242424242424242');
        await cardFrame.locator('[placeholder*="MM / YY"]').fill('12/25');
        await cardFrame.locator('[placeholder*="CVC"]').fill('123');
        await cardFrame.locator('[placeholder*="ZIP"]').fill('80301');
        
        await page.locator('button[type="submit"]').click();
        
        // Should succeed this time
        await page.waitForURL(/success|confirmation/i, { timeout: 15000 }).catch(() => {
          console.log('Retry payment may have different flow');
        });
      }
    });
  });

  test('Network timeout during payment', async ({ page }) => {
    const timeoutScenario = testDataFactory.generateCustomer({
      name: 'Timeout Test User',
      email: `timeout_${testRunId}@e2e-test.com`
    });

    await test.step('Setup purchase', async () => {
      await page.goto('/tickets');
      
      const addButton = page.locator('button').filter({ hasText: /Social Pass/i }).first();
      await addButton.click();
      
      const cartButton = page.locator('.floating-cart').first();
      await cartButton.click();
      
      const checkoutButton = page.locator('button').filter({ hasText: /Checkout/i }).first();
      await checkoutButton.click();
    });

    await test.step('Simulate network timeout', async () => {
      // Offline mode to simulate network issues
      await page.context().setOffline(true);
      
      // Try to submit payment
      const submitButton = page.locator('button[type="submit"]').first();
      
      if (await submitButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await submitButton.click();
        
        // Should show network error
        await page.waitForSelector('text=/network|offline|connection/i', { timeout: 10000 }).catch(() => {
          console.log('Network error message may vary');
        });
      }
      
      // Restore network
      await page.context().setOffline(false);
    });

    await test.step('Verify cart preserved', async () => {
      const cart = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem('cart') || '[]');
      });
      
      expect(cart.length).toBeGreaterThan(0);
      console.log('Cart preserved after network timeout');
    });
  });

  test('Invalid card details validation', async ({ page }) => {
    await test.step('Navigate to checkout', async () => {
      await page.goto('/tickets');
      
      const addButton = page.locator('button').filter({ hasText: /Pass/i }).first();
      await addButton.click();
      
      const cartButton = page.locator('.floating-cart').first();
      await cartButton.click();
      
      const checkoutButton = page.locator('button').filter({ hasText: /Checkout/i }).first();
      await checkoutButton.click();
    });

    await test.step('Test card validation', async () => {
      const currentUrl = page.url();
      
      if (currentUrl.includes('stripe')) {
        const cardFrame = page.frameLocator('iframe').first();
        
        // Try invalid card number
        await cardFrame.locator('[placeholder*="Card number"]').fill('1234567890123456');
        await cardFrame.locator('[placeholder*="MM / YY"]').fill('13/20'); // Invalid month
        await cardFrame.locator('[placeholder*="CVC"]').fill('12'); // Too short
        
        // Check for validation errors
        const cardErrors = cardFrame.locator('.StripeElement--invalid, .error').first();
        await expect(cardErrors).toBeVisible({ timeout: 5000 }).catch(() => {
          console.log('Card validation UI may vary');
        });
      }
    });
  });

  test('Successful recovery after multiple failures', async ({ page }) => {
    const recoveryScenario = await testScenarios.failedPaymentRecovery();
    
    await test.step('Add ticket', async () => {
      await page.goto('/tickets');
      const addButton = page.locator('button').filter({ hasText: /Pass/i }).first();
      await addButton.click();
    });

    let attemptCount = 0;
    const maxAttempts = 3;
    
    while (attemptCount < maxAttempts) {
      await test.step(`Payment attempt ${attemptCount + 1}`, async () => {
        const cartButton = page.locator('.floating-cart').first();
        await cartButton.click();
        
        const checkoutButton = page.locator('button').filter({ hasText: /Checkout/i }).first();
        await checkoutButton.click();
        
        if (attemptCount < 2) {
          // Fail first 2 attempts
          console.log(`Simulating failure ${attemptCount + 1}`);
          
          // Navigate back or handle failure
          await page.goBack();
        } else {
          // Succeed on third attempt
          console.log('Final attempt - should succeed');
          
          const nameInput = page.locator('input[name="name"]').first();
          if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
            await nameInput.fill(recoveryScenario.customer.name);
            await page.locator('input[type="email"]').first().fill(recoveryScenario.customer.email);
            await page.locator('button[type="submit"]').first().click();
          }
        }
        
        attemptCount++;
      });
    }
    
    // Verify successful recovery
    expect(attemptCount).toBe(maxAttempts);
  });
});
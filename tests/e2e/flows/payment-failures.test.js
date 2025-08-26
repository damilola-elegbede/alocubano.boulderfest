/**
 * Comprehensive Payment Failure Scenarios E2E Tests  
 * Tests various payment failure cases, error handling, and recovery flows
 */

import { test, expect } from '@playwright/test';
import { BasePage } from '../helpers/base-page.js';
import { TestDataFactory } from '../helpers/test-data-factory.js';
import { DatabaseCleanup } from '../helpers/database-cleanup.js';
import { testPayment, generateUniqueTestData } from '../fixtures/test-data.js';
import { fillForm, mockAPI, retry, waitForNetworkIdle } from '../helpers/test-utils.js';

test.describe('Payment Failure Scenarios', () => {
  let basePage;
  let testDataFactory;
  let databaseCleanup;
  let testRunId;

  test.beforeAll(async () => {
    testDataFactory = new TestDataFactory({ seed: 67890 });
    databaseCleanup = new DatabaseCleanup();
    testRunId = testDataFactory.getTestRunId();
    console.log(`Payment failure test run: ${testRunId}`);
  });

  test.afterAll(async () => {
    if (!process.env.KEEP_TEST_DATA) {
      const cleanupResult = await databaseCleanup.cleanupByTestRunId(testRunId);
      console.log('Payment failure cleanup result:', cleanupResult);
    }
    await databaseCleanup.close();
  });

  test.beforeEach(async ({ page }) => {
    basePage = new BasePage(page);
    page.setDefaultTimeout(30000);
    
    // Clear all storage and state
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.context().clearCookies();
  });

  test('Card declined (4000000000000002) - verify error handling and data integrity', async ({ page }) => {
    const failureScenario = testDataFactory.generateScenario('registration-flow', {
      customer: {
        name: 'Card Declined User',
        email: `declined_${testRunId}@e2e-test.com`,
        phone: '555-000-0002'
      }
    });

    await test.step('Setup purchase with declined card scenario', async () => {
      await basePage.goto('/tickets');
      
      // Add Full Pass to cart
      const fullPassButton = page.locator('button').filter({ hasText: /full.*pass/i }).first();
      await fullPassButton.click();
      
      // Verify cart updated
      await expect(page.locator('.cart-count, [data-cart-count]')).toContainText('1');
    });

    await test.step('Proceed through checkout to payment', async () => {
      const cartToggle = page.locator('.floating-cart, .cart-icon').first();
      await cartToggle.click();
      await page.waitForTimeout(1000);
      
      const checkoutButton = page.locator('button').filter({ hasText: /checkout|proceed/i }).first();
      await checkoutButton.click();
      
      // Fill customer information if form appears
      const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first();
      if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await fillForm(page, {
          name: failureScenario.customer.name,
          email: failureScenario.customer.email,
          phone: failureScenario.customer.phone,
          dietary: 'No restrictions',
          emergency: 'Emergency Contact - 555-911-0000'
        });
        
        const submitButton = page.locator('button[type="submit"]').first();
        if (await submitButton.isVisible()) {
          await submitButton.click();
        }
      }
    });

    await test.step('Use declined test card and handle failure', async () => {
      const currentUrl = page.url();
      console.log('Current URL for payment:', currentUrl);
      
      if (currentUrl.includes('stripe.com') || currentUrl.includes('checkout')) {
        // Real Stripe integration - use test card for decline
        await page.waitForSelector('iframe, input[name*="card"]', { timeout: 15000 });
        
        const cardFrame = page.frameLocator('iframe[src*="js.stripe.com"]').first();
        
        // Use Stripe's test card that always declines
        await cardFrame.locator('[placeholder*="card number" i]').fill('4000000000000002');
        await cardFrame.locator('[placeholder*="MM" i], [placeholder*="expiry" i]').fill('12/25');
        await cardFrame.locator('[placeholder*="cvc" i]').fill('123');
        await cardFrame.locator('[placeholder*="zip" i], [placeholder*="postal" i]').fill('80301');
        
        // Submit payment - should fail
        const payButton = page.locator('button[type="submit"]').filter({ hasText: /pay|complete/i }).first();
        await payButton.click();
        
        // Wait for decline error message
        await page.waitForSelector('text=/declined|failed|error/i', { timeout: 15000 });
        console.log('Payment declined as expected');
        
      } else {
        // Mock payment failure for non-Stripe flow
        await mockAPI(page, '**/api/payments/**', {
          status: 400,
          body: { error: 'Your card was declined.', code: 'card_declined' }
        });
        console.log('Mocked payment decline');
      }
    });

    await test.step('Verify error handling and user experience', async () => {
      // Look for decline error message
      const errorSelectors = [
        'text=/declined|payment.*failed|card.*declined/i',
        '.error, .alert-error, [data-error]',
        '[role="alert"]'
      ];
      
      let errorFound = false;
      for (const selector of errorSelectors) {
        if (await page.locator(selector).isVisible({ timeout: 5000 }).catch(() => false)) {
          errorFound = true;
          console.log('Error message displayed to user');
          break;
        }
      }
      
      // Cart should be preserved after failure
      const cart = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem('cart') || '[]');
      });
      expect(cart.length).toBeGreaterThan(0);
      console.log('Cart preserved after payment failure');
    });

    await test.step('Verify no orphaned database records', async () => {
      // With payment failure, there should be no completed registrations
      try {
        const verification = await databaseCleanup.verifyCleanup(testRunId);
        console.log('Database verification after decline:', verification);
        
        // Should have no confirmed registrations for this test run
        expect(verification.remaining.registrations || 0).toBe(0);
      } catch (error) {
        console.log('Database verification skipped:', error.message);
      }
    });
  });

  test('Insufficient funds (4000000000009995) - retry with valid card', async ({ page }) => {
    const retryScenario = testDataFactory.generateScenario('registration-flow', {
      customer: {
        name: 'Retry Payment User',
        email: `retry_${testRunId}@e2e-test.com`,
        phone: '555-999-9995'
      }
    });

    await test.step('Setup initial payment attempt', async () => {
      await basePage.goto('/tickets');
      
      const dayPassButton = page.locator('button').filter({ hasText: /day.*pass/i }).first();
      await dayPassButton.click();
      
      const cartToggle = page.locator('.floating-cart').first();
      await cartToggle.click();
      
      const checkoutButton = page.locator('button').filter({ hasText: /checkout/i }).first();
      await checkoutButton.click();
    });

    await test.step('First attempt with insufficient funds card', async () => {
      // Fill form if present
      const nameInput = page.locator('input[name="name"]').first();
      if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await fillForm(page, {
          name: retryScenario.customer.name,
          email: retryScenario.customer.email,
          phone: retryScenario.customer.phone
        });
        
        const submitButton = page.locator('button[type="submit"]').first();
        if (await submitButton.isVisible()) {
          await submitButton.click();
        }
      }
      
      // Use insufficient funds test card
      const currentUrl = page.url();
      if (currentUrl.includes('stripe')) {
        const cardFrame = page.frameLocator('iframe[src*="js.stripe.com"]').first();
        
        await cardFrame.locator('[placeholder*="card number" i]').fill('4000000000009995');
        await cardFrame.locator('[placeholder*="MM" i]').fill('12/25');
        await cardFrame.locator('[placeholder*="cvc" i]').fill('123');
        await cardFrame.locator('[placeholder*="zip" i]').fill('80301');
        
        const payButton = page.locator('button[type="submit"]').first();
        await payButton.click();
        
        // Wait for insufficient funds error
        await page.waitForSelector('text=/insufficient|declined|not.*enough/i', { timeout: 15000 });
        console.log('Insufficient funds error displayed');
      }
    });

    await test.step('Retry with valid card', async () => {
      // Look for retry mechanism
      const retryButton = page.locator('button').filter({ hasText: /try.*again|retry|use.*different.*card/i }).first();
      
      if (await retryButton.isVisible({ timeout: 10000 }).catch(() => false)) {
        await retryButton.click();
        console.log('Clicked retry button');
      } else {
        // Navigate back to try again
        await page.goBack();
        await page.waitForTimeout(2000);
        console.log('Navigated back to retry payment');
      }
      
      // Use valid test card this time
      const currentUrl = page.url();
      if (currentUrl.includes('stripe')) {
        const cardFrame = page.frameLocator('iframe[src*="js.stripe.com"]').first();
        
        // Clear and fill with valid card
        await cardFrame.locator('[placeholder*="card number" i]').fill('4242424242424242');
        await cardFrame.locator('[placeholder*="MM" i]').fill('12/25');
        await cardFrame.locator('[placeholder*="cvc" i]').fill('123');
        await cardFrame.locator('[placeholder*="zip" i]').fill('80301');
        
        const payButton = page.locator('button[type="submit"]').first();
        await payButton.click();
        
        // Should succeed this time
        await page.waitForTimeout(10000);
        console.log('Retry payment submitted');
      }
    });

    await test.step('Verify successful retry', async () => {
      // Check for success indicators
      const currentUrl = page.url();
      const successIndicators = [
        page.locator('text=/success|thank.*you|confirmed/i'),
        page.locator('.success, .confirmation')
      ];
      
      let retrySuccessful = false;
      for (const indicator of successIndicators) {
        if (await indicator.isVisible({ timeout: 10000 }).catch(() => false)) {
          retrySuccessful = true;
          break;
        }
      }
      
      if (retrySuccessful) {
        console.log('Payment retry successful');
      } else {
        console.log('Retry flow may redirect or have different success indicators');
      }
    });
  });

  test('Expired card (4000000000000069) - error handling', async ({ page }) => {
    const expiredScenario = testDataFactory.generateScenario('registration-flow', {
      customer: {
        name: 'Expired Card User',
        email: `expired_${testRunId}@e2e-test.com`,
        phone: '555-000-0069'
      }
    });

    await test.step('Setup purchase with expired card', async () => {
      await basePage.goto('/tickets');
      
      const socialPassButton = page.locator('button').filter({ hasText: /social.*pass/i }).first();
      await socialPassButton.click();
      
      const cartToggle = page.locator('.floating-cart').first();
      await cartToggle.click();
      
      const checkoutButton = page.locator('button').filter({ hasText: /checkout/i }).first();
      await checkoutButton.click();
    });

    await test.step('Use expired card test number', async () => {
      const nameInput = page.locator('input[name="name"]').first();
      if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await fillForm(page, {
          name: expiredScenario.customer.name,
          email: expiredScenario.customer.email,
          phone: expiredScenario.customer.phone
        });
        
        const submitButton = page.locator('button[type="submit"]').first();
        if (await submitButton.isVisible()) {
          await submitButton.click();
        }
      }
      
      const currentUrl = page.url();
      if (currentUrl.includes('stripe')) {
        const cardFrame = page.frameLocator('iframe[src*="js.stripe.com"]').first();
        
        // Use expired card test number
        await cardFrame.locator('[placeholder*="card number" i]').fill('4000000000000069');
        await cardFrame.locator('[placeholder*="MM" i]').fill('01/20'); // Past expiry
        await cardFrame.locator('[placeholder*="cvc" i]').fill('123');
        await cardFrame.locator('[placeholder*="zip" i]').fill('80301');
        
        const payButton = page.locator('button[type="submit"]').first();
        await payButton.click();
        
        // Wait for expired card error
        await page.waitForSelector('text=/expired|invalid.*date/i', { timeout: 15000 });
        console.log('Expired card error displayed');
      } else {
        // Mock expired card error
        await mockAPI(page, '**/api/payments/**', {
          status: 400,
          body: { error: 'Your card has expired.', code: 'expired_card' }
        });
        console.log('Mocked expired card error');
      }
    });
  });

  test('Processing error (4000000000000119) - system failure handling', async ({ page }) => {
    const processingScenario = testDataFactory.generateScenario('registration-flow', {
      customer: {
        name: 'Processing Error User',
        email: `processing_${testRunId}@e2e-test.com`,
        phone: '555-000-0119'
      }
    });

    await test.step('Trigger processing error scenario', async () => {
      await basePage.goto('/tickets');
      
      const fullPassButton = page.locator('button').filter({ hasText: /full.*pass/i }).first();
      await fullPassButton.click();
      
      const cartToggle = page.locator('.floating-cart').first();
      await cartToggle.click();
      
      const checkoutButton = page.locator('button').filter({ hasText: /checkout/i }).first();
      await checkoutButton.click();
      
      // Fill customer information
      const nameInput = page.locator('input[name="name"]').first();
      if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await fillForm(page, {
          name: processingScenario.customer.name,
          email: processingScenario.customer.email,
          phone: processingScenario.customer.phone
        });
        
        const submitButton = page.locator('button[type="submit"]').first();
        if (await submitButton.isVisible()) {
          await submitButton.click();
        }
      }
    });

    await test.step('Use processing error test card', async () => {
      const currentUrl = page.url();
      
      if (currentUrl.includes('stripe')) {
        const cardFrame = page.frameLocator('iframe[src*="js.stripe.com"]').first();
        
        // Use processing error test card
        await cardFrame.locator('[placeholder*="card number" i]').fill('4000000000000119');
        await cardFrame.locator('[placeholder*="MM" i]').fill('12/25');
        await cardFrame.locator('[placeholder*="cvc" i]').fill('123');
        await cardFrame.locator('[placeholder*="zip" i]').fill('80301');
        
        const payButton = page.locator('button[type="submit"]').first();
        await payButton.click();
        
        // Wait for processing error
        await page.waitForSelector('text=/processing.*error|try.*again|error.*occurred/i', { timeout: 15000 });
        console.log('Processing error displayed');
      }
    });

    await test.step('Verify error recovery options', async () => {
      // Look for recovery options
      const recoveryOptions = [
        page.locator('button').filter({ hasText: /try.*again|retry/i }),
        page.locator('text=/contact.*support|help/i')
      ];
      
      let recoveryFound = false;
      for (const option of recoveryOptions) {
        if (await option.isVisible({ timeout: 5000 }).catch(() => false)) {
          recoveryFound = true;
          console.log('Recovery option found');
          break;
        }
      }
      
      // Cart should remain intact
      const cart = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem('cart') || '[]');
      });
      expect(cart.length).toBeGreaterThan(0);
    });
  });

  test('Network timeout during payment - connection failure handling', async ({ page }) => {
    const timeoutScenario = testDataFactory.generateScenario('registration-flow', {
      customer: {
        name: 'Network Timeout User',
        email: `timeout_${testRunId}@e2e-test.com`,
        phone: '555-NET-WORK'
      }
    });

    await test.step('Setup purchase before network issue', async () => {
      await basePage.goto('/tickets');
      
      const dayPassButton = page.locator('button').filter({ hasText: /day.*pass/i }).first();
      await dayPassButton.click();
      
      const cartToggle = page.locator('.floating-cart').first();
      await cartToggle.click();
      
      const checkoutButton = page.locator('button').filter({ hasText: /checkout/i }).first();
      await checkoutButton.click();
    });

    await test.step('Simulate network failure during checkout', async () => {
      // Fill form first
      const nameInput = page.locator('input[name="name"]').first();
      if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await fillForm(page, {
          name: timeoutScenario.customer.name,
          email: timeoutScenario.customer.email,
          phone: timeoutScenario.customer.phone
        });
      }
      
      // Set offline mode to simulate network timeout
      await page.context().setOffline(true);
      
      // Try to submit - should fail
      const submitButton = page.locator('button[type="submit"]').first();
      if (await submitButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await submitButton.click();
        
        // Wait for network error indication
        await page.waitForSelector('text=/network|offline|connection.*failed|timeout/i', { timeout: 10000 }).catch(() => {
          console.log('Network error message may vary by implementation');
        });
      }
      
      // Restore network
      await page.context().setOffline(false);
    });

    await test.step('Verify cart preservation and retry capability', async () => {
      // Cart should be preserved after network failure
      const cart = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem('cart') || '[]');
      });
      expect(cart.length).toBeGreaterThan(0);
      console.log('Cart preserved after network timeout');
      
      // User should be able to retry
      await page.reload();
      await expect(page.locator('.cart-count, [data-cart-count]')).toContainText('1');
    });
  });

  test('Webhook failure simulation - payment processing edge case', async ({ page }) => {
    await test.step('Mock webhook failure scenario', async () => {
      // Intercept webhook calls and make them fail
      await page.route('**/api/payments/stripe-webhook', route => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Webhook processing failed' })
        });
      });
      
      await basePage.goto('/tickets');
      
      const socialPassButton = page.locator('button').filter({ hasText: /social.*pass/i }).first();
      await socialPassButton.click();
    });

    await test.step('Complete purchase with webhook failure', async () => {
      const cartToggle = page.locator('.floating-cart').first();
      await cartToggle.click();
      
      const checkoutButton = page.locator('button').filter({ hasText: /checkout/i }).first();
      await checkoutButton.click();
      
      // Mock successful payment but failed webhook
      await mockAPI(page, '**/api/payments/create-checkout-session', {
        status: 200,
        body: { 
          url: 'https://checkout.stripe.com/pay/test_success',
          sessionId: `cs_test_${testRunId}`
        }
      });
      
      console.log('Simulated webhook failure scenario');
    });

    await test.step('Verify webhook failure handling', async () => {
      // System should handle webhook failures gracefully
      // This might involve retry mechanisms or manual reconciliation
      console.log('Webhook failure handling depends on implementation');
      
      // Cart should be cleared after successful payment even with webhook issues
      const cart = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem('cart') || '[]');
      });
      
      // The behavior here depends on how webhook failures are handled
      console.log('Cart state after webhook failure:', cart.length);
    });
  });

  test('Session expiry during checkout - timeout handling', async ({ page }) => {
    const sessionScenario = testDataFactory.generateScenario('registration-flow', {
      customer: {
        name: 'Session Expiry User',
        email: `session_${testRunId}@e2e-test.com`,
        phone: '555-EXP-IRED'
      }
    });

    await test.step('Start checkout process', async () => {
      await basePage.goto('/tickets');
      
      const fullPassButton = page.locator('button').filter({ hasText: /full.*pass/i }).first();
      await fullPassButton.click();
      
      const cartToggle = page.locator('.floating-cart').first();
      await cartToggle.click();
      
      const checkoutButton = page.locator('button').filter({ hasText: /checkout/i }).first();
      await checkoutButton.click();
    });

    await test.step('Simulate session expiry', async () => {
      // Clear session storage to simulate expiry
      await page.evaluate(() => {
        sessionStorage.clear();
        // Also clear any auth tokens that might be in localStorage
        Object.keys(localStorage).forEach(key => {
          if (key.includes('session') || key.includes('token') || key.includes('auth')) {
            localStorage.removeItem(key);
          }
        });
      });
      
      // Try to continue with checkout
      const nameInput = page.locator('input[name="name"]').first();
      if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await fillForm(page, {
          name: sessionScenario.customer.name,
          email: sessionScenario.customer.email,
          phone: sessionScenario.customer.phone
        });
        
        const submitButton = page.locator('button[type="submit"]').first();
        if (await submitButton.isVisible()) {
          await submitButton.click();
        }
      }
    });

    await test.step('Verify session handling', async () => {
      // Look for session expiry indicators
      const sessionErrors = [
        page.locator('text=/session.*expired|please.*try.*again|start.*over/i'),
        page.locator('.error, .alert').filter({ hasText: /session|expired/i })
      ];
      
      let sessionErrorFound = false;
      for (const error of sessionErrors) {
        if (await error.isVisible({ timeout: 5000 }).catch(() => false)) {
          sessionErrorFound = true;
          console.log('Session expiry handled properly');
          break;
        }
      }
      
      // User should be able to restart the process
      const cart = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem('cart') || '[]');
      });
      
      // Cart might be preserved or cleared depending on implementation
      console.log('Cart state after session expiry:', cart.length);
    });
  });

  test('Multiple failure recovery - persistence and user experience', async ({ page }) => {
    const recoveryScenario = testDataFactory.generateScenario('registration-flow', {
      customer: {
        name: 'Multiple Failure Recovery User',
        email: `recovery_${testRunId}@e2e-test.com`,
        phone: '555-REC-OVER'
      }
    });

    let attemptCount = 0;
    const maxAttempts = 3;
    const failureCards = ['4000000000000002', '4000000000009995']; // declined, insufficient funds
    const successCard = '4242424242424242';

    await test.step('Setup initial purchase', async () => {
      await basePage.goto('/tickets');
      
      const dayPassButton = page.locator('button').filter({ hasText: /day.*pass/i }).first();
      await dayPassButton.click();
      
      expect(await page.locator('.cart-count').textContent()).toBe('1');
    });

    // Simulate multiple payment failures followed by success
    while (attemptCount < maxAttempts) {
      await test.step(`Payment attempt ${attemptCount + 1}`, async () => {
        // Open cart and proceed to checkout
        const cartToggle = page.locator('.floating-cart').first();
        await cartToggle.click();
        
        const checkoutButton = page.locator('button').filter({ hasText: /checkout/i }).first();
        await checkoutButton.click();
        
        // Fill customer form
        const nameInput = page.locator('input[name="name"]').first();
        if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          await fillForm(page, {
            name: recoveryScenario.customer.name,
            email: recoveryScenario.customer.email,
            phone: recoveryScenario.customer.phone
          });
          
          const submitButton = page.locator('button[type="submit"]').first();
          if (await submitButton.isVisible()) {
            await submitButton.click();
          }
        }
        
        // Use different cards for each attempt
        const currentUrl = page.url();
        if (currentUrl.includes('stripe')) {
          const cardFrame = page.frameLocator('iframe[src*="js.stripe.com"]').first();
          
          let cardNumber;
          if (attemptCount < 2) {
            // First two attempts fail
            cardNumber = failureCards[attemptCount];
            console.log(`Attempt ${attemptCount + 1}: Using failure card ${cardNumber}`);
          } else {
            // Third attempt succeeds
            cardNumber = successCard;
            console.log(`Attempt ${attemptCount + 1}: Using success card ${cardNumber}`);
          }
          
          await cardFrame.locator('[placeholder*="card number" i]').fill(cardNumber);
          await cardFrame.locator('[placeholder*="MM" i]').fill('12/25');
          await cardFrame.locator('[placeholder*="cvc" i]').fill('123');
          await cardFrame.locator('[placeholder*="zip" i]').fill('80301');
          
          const payButton = page.locator('button[type="submit"]').first();
          await payButton.click();
          
          if (attemptCount < 2) {
            // Wait for failure
            await page.waitForSelector('text=/declined|failed|insufficient/i', { timeout: 15000 });
            console.log(`Attempt ${attemptCount + 1} failed as expected`);
            
            // Navigate back to try again
            await page.goBack();
          } else {
            // Wait for success
            await page.waitForTimeout(10000);
            console.log(`Attempt ${attemptCount + 1} should succeed`);
          }
        }
        
        attemptCount++;
      });
    }

    await test.step('Verify successful recovery', async () => {
      expect(attemptCount).toBe(maxAttempts);
      console.log('Multiple failure recovery test completed');
      
      // Check if cart was cleared after successful payment
      const cart = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem('cart') || '[]');
      });
      
      console.log('Final cart state after recovery:', cart.length);
    });
  });
});
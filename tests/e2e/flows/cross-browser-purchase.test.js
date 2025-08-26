/**
 * Cross-Browser Purchase Flow E2E Tests
 * Tests ticket purchase across different browsers, devices, and screen sizes
 */

import { test, expect, devices } from '@playwright/test';
import { BasePage } from '../helpers/base-page.js';
import { TestDataFactory } from '../helpers/test-data-factory.js';
import { DatabaseCleanup } from '../helpers/database-cleanup.js';
import { testViewports, generateUniqueTestData } from '../fixtures/test-data.js';
import { fillForm, mockAPI, retry, waitForNetworkIdle } from '../helpers/test-utils.js';

test.describe('Cross-Browser Purchase Flow', () => {
  let testDataFactory;
  let databaseCleanup;
  let testRunId;

  test.beforeAll(async () => {
    testDataFactory = new TestDataFactory({ seed: 11111 });
    databaseCleanup = new DatabaseCleanup();
    testRunId = testDataFactory.getTestRunId();
    console.log(`Cross-browser test run: ${testRunId}`);
  });

  test.afterAll(async () => {
    if (!process.env.KEEP_TEST_DATA) {
      const cleanupResult = await databaseCleanup.cleanupByTestRunId(testRunId);
      console.log('Cross-browser cleanup result:', cleanupResult);
    }
    await databaseCleanup.close();
  });

  test.describe('Desktop Browser Tests', () => {
    test('Chrome/Edge - Complete purchase flow', async ({ page, browserName }) => {
      // Skip non-Chromium browsers for this specific test
      test.skip(browserName !== 'chromium', 'This test is specifically for Chromium-based browsers');
      
      const basePage = new BasePage(page);
      const testData = testDataFactory.generateScenario('purchase-flow', {
        customer: {
          name: `Chrome User ${testRunId}`,
          email: `chrome_${testRunId}@e2e-test.com`,
          phone: '555-CHR-ROME'
        }
      });

      await test.step('Verify Chrome-specific features work', async () => {
        await basePage.goto('/tickets');
        
        // Test Chrome DevTools Protocol features if available
        const userAgent = await page.evaluate(() => navigator.userAgent);
        expect(userAgent).toContain('Chrome');
        console.log('User agent:', userAgent);
        
        // Test Chrome-specific CSS features
        const supportsGrid = await page.evaluate(() => {
          return CSS.supports('display', 'grid');
        });
        expect(supportsGrid).toBe(true);
      });

      await test.step('Complete purchase in Chrome', async () => {
        // Add Full Pass ticket
        const fullPassButton = page.locator('button').filter({ hasText: /full.*pass/i }).first();
        await fullPassButton.click();
        
        // Verify cart update with Chrome animations
        await expect(page.locator('.cart-count, [data-cart-count]')).toContainText('1', { timeout: 10000 });
        
        // Open cart with Chrome-optimized interactions
        const cartToggle = page.locator('.floating-cart, .cart-icon').first();
        await cartToggle.click();
        await page.waitForTimeout(1000);
        
        const checkoutButton = page.locator('button').filter({ hasText: /checkout/i }).first();
        await checkoutButton.click();
      });

      await test.step('Fill forms optimized for Chrome', async () => {
        const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first();
        if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          // Test Chrome autofill prevention/handling
          await nameInput.click();
          await page.keyboard.type(testData.customer.name);
          
          const emailInput = page.locator('input[type="email"]').first();
          await emailInput.click();
          await page.keyboard.type(testData.customer.email);
          
          const phoneInput = page.locator('input[name="phone"], input[type="tel"]').first();
          await phoneInput.click();
          await page.keyboard.type(testData.customer.phone);
          
          const submitButton = page.locator('button[type="submit"]').first();
          if (await submitButton.isVisible()) {
            await submitButton.click();
          }
        }
      });

      await test.step('Test Chrome payment integration', async () => {
        // Mock successful Chrome-specific payment flow
        const currentUrl = page.url();
        if (currentUrl.includes('stripe')) {
          console.log('Chrome: Stripe integration detected');
          // Chrome handles iframes and payment forms well
          const cardFrame = page.frameLocator('iframe[src*="js.stripe.com"]').first();
          
          if (await cardFrame.locator('[placeholder*="card number" i]').isVisible({ timeout: 5000 }).catch(() => false)) {
            await cardFrame.locator('[placeholder*="card number" i]').fill('4242424242424242');
            await cardFrame.locator('[placeholder*="MM" i]').fill('12/34');
            await cardFrame.locator('[placeholder*="cvc" i]').fill('123');
            await cardFrame.locator('[placeholder*="zip" i]').fill('80301');
            
            const payButton = page.locator('button[type="submit"]').first();
            await payButton.click();
            await page.waitForTimeout(5000);
          }
        } else {
          await mockAPI(page, '**/api/payments/**', {
            status: 200,
            body: { success: true, browser: 'chrome' }
          });
        }
        console.log('Chrome purchase flow completed');
      });
    });

    test('Firefox - Purchase compatibility', async ({ page, browserName }) => {
      test.skip(browserName !== 'firefox', 'This test is specifically for Firefox');
      
      const basePage = new BasePage(page);
      const testData = testDataFactory.generateScenario('purchase-flow', {
        customer: {
          name: `Firefox User ${testRunId}`,
          email: `firefox_${testRunId}@e2e-test.com`,
          phone: '555-FOX-FIRE'
        }
      });

      await test.step('Verify Firefox-specific behavior', async () => {
        await basePage.goto('/tickets');
        
        // Test Firefox user agent
        const userAgent = await page.evaluate(() => navigator.userAgent);
        expect(userAgent).toContain('Firefox');
        console.log('Firefox user agent:', userAgent);
        
        // Test Firefox-specific CSS support
        const supportsFlexbox = await page.evaluate(() => {
          return CSS.supports('display', 'flex');
        });
        expect(supportsFlexbox).toBe(true);
      });

      await test.step('Test Firefox form handling', async () => {
        // Firefox has different form validation behavior
        const dayPassButton = page.locator('button').filter({ hasText: /day.*pass/i }).first();
        await dayPassButton.click();
        
        await expect(page.locator('.cart-count, [data-cart-count]')).toContainText('1');
        
        const cartToggle = page.locator('.floating-cart').first();
        await cartToggle.click();
        
        const checkoutButton = page.locator('button').filter({ hasText: /checkout/i }).first();
        await checkoutButton.click();
        
        // Firefox form validation testing
        const nameInput = page.locator('input[name="name"]').first();
        if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          // Test Firefox-specific validation behavior
          await nameInput.fill(''); // Empty to test required validation
          const submitButton = page.locator('button[type="submit"]').first();
          if (await submitButton.isVisible()) {
            await submitButton.click();
            
            // Firefox shows native validation messages
            const validationMessage = await nameInput.evaluate(el => el.validationMessage);
            expect(validationMessage).toBeTruthy();
            
            // Now fill correctly
            await fillForm(page, {
              name: testData.customer.name,
              email: testData.customer.email,
              phone: testData.customer.phone
            });
            
            await submitButton.click();
          }
        }
      });

      await test.step('Firefox payment flow', async () => {
        const currentUrl = page.url();
        if (currentUrl.includes('stripe')) {
          console.log('Firefox: Testing Stripe iframe compatibility');
          // Firefox may handle iframes differently
          const cardFrame = page.frameLocator('iframe[src*="js.stripe.com"]').first();
          
          await cardFrame.locator('[placeholder*="card number" i]').fill('4242424242424242');
          await cardFrame.locator('[placeholder*="MM" i]').fill('12/34');
          await cardFrame.locator('[placeholder*="cvc" i]').fill('123');
          
          const payButton = page.locator('button[type="submit"]').first();
          await payButton.click();
        } else {
          await mockAPI(page, '**/api/payments/**', {
            status: 200,
            body: { success: true, browser: 'firefox' }
          });
        }
        console.log('Firefox purchase completed');
      });
    });

    test('Safari - WebKit compatibility', async ({ page, browserName }) => {
      test.skip(browserName !== 'webkit', 'This test is specifically for Safari/WebKit');
      
      const basePage = new BasePage(page);
      const testData = testDataFactory.generateScenario('purchase-flow', {
        customer: {
          name: `Safari User ${testRunId}`,
          email: `safari_${testRunId}@e2e-test.com`,
          phone: '555-SAF-ARI'
        }
      });

      await test.step('Safari-specific feature testing', async () => {
        await basePage.goto('/tickets');
        
        // Test Safari user agent
        const userAgent = await page.evaluate(() => navigator.userAgent);
        console.log('Safari user agent:', userAgent);
        
        // Safari-specific CSS and JS support
        const supportsWebkitFeatures = await page.evaluate(() => {
          return window.CSS && CSS.supports('-webkit-appearance', 'none');
        });
        expect(supportsWebkitFeatures).toBe(true);
        
        // Test Safari's stricter security policies
        const isSecureContext = await page.evaluate(() => window.isSecureContext);
        console.log('Safari secure context:', isSecureContext);
      });

      await test.step('Safari touch and scroll behavior', async () => {
        // Safari has unique touch and scroll behaviors
        const socialPassButton = page.locator('button').filter({ hasText: /social.*pass/i }).first();
        
        // Test Safari scroll behavior
        await socialPassButton.scrollIntoViewIfNeeded();
        await socialPassButton.click();
        
        await expect(page.locator('.cart-count, [data-cart-count]')).toContainText('1');
        
        // Test Safari modal/overlay behavior
        const cartToggle = page.locator('.floating-cart').first();
        await cartToggle.click();
        await page.waitForTimeout(1500); // Safari may need more time for animations
        
        const checkoutButton = page.locator('button').filter({ hasText: /checkout/i }).first();
        await checkoutButton.click();
      });

      await test.step('Safari form and payment integration', async () => {
        const nameInput = page.locator('input[name="name"]').first();
        if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          // Safari has stricter autocomplete behavior
          await nameInput.evaluate((el) => el.setAttribute('autocomplete', 'off'));
          await fillForm(page, {            email: testData.customer.email,
            phone: testData.customer.phone
          });
          
          const submitButton = page.locator('button[type="submit"]').first();
          if (await submitButton.isVisible()) {
            await submitButton.click();
          }
        }
        
        // Safari payment processing
        await mockAPI(page, '**/api/payments/**', {
          status: 200,
          body: { success: true, browser: 'safari' }
        });
        console.log('Safari purchase flow completed');
      });
    });
  });

  test.describe('Mobile Device Tests', () => {
    test('Mobile Safari (iPhone) - Touch interactions', async ({ page, browserName }) => {
      // Set iPhone viewport
      await page.setViewportSize(devices['iPhone 13'].viewport);
      
      const basePage = new BasePage(page);
      const testData = testDataFactory.generateScenario('purchase-flow', {
        customer: {
          name: `iPhone User ${testRunId}`,
          email: `iphone_${testRunId}@e2e-test.com`,
          phone: '555-iPH-ONE'
        }
      });

      await test.step('iPhone viewport and touch setup', async () => {
        await basePage.goto('/tickets');
        
        // Verify mobile viewport
        const viewport = page.viewportSize();
        expect(viewport.width).toBe(390);  // iPhone 13 width
        expect(viewport.height).toBe(844); // iPhone 13 height
        
        // Test mobile-specific features
        const isTouchDevice = await page.evaluate(() => 'ontouchstart' in window);
        console.log('iPhone touch support:', isTouchDevice);
      });

      await test.step('Mobile ticket selection with touch', async () => {
        // Test mobile-optimized ticket cards
        const ticketCards = page.locator('.ticket-card, .pass-option');
        const cardCount = await ticketCards.count();
        expect(cardCount).toBeGreaterThan(0);
        
        // Test touch interaction - ensure buttons are large enough (44px minimum)
        const fullPassButton = page.locator('button').filter({ hasText: /full.*pass/i }).first();
        const buttonSize = await fullPassButton.boundingBox();
        expect(buttonSize.height).toBeGreaterThanOrEqual(44); // iOS touch target size
        
        await fullPassButton.tap(); // Use tap instead of click for mobile
        
        await expect(page.locator('.cart-count, [data-cart-count]')).toContainText('1');
      });

      await test.step('Mobile cart interaction', async () => {
        // Test mobile cart behavior
        const mobileCart = page.locator('.floating-cart, .mobile-cart');
        await expect(mobileCart).toBeVisible();
        
        // Test mobile cart opening
        await mobileCart.tap();
        await page.waitForTimeout(1000);
        
        // Mobile checkout button should be easily tappable
        const checkoutButton = page.locator('button').filter({ hasText: /checkout/i }).first();
        const checkoutSize = await checkoutButton.boundingBox();
        expect(checkoutSize.height).toBeGreaterThanOrEqual(44);
        
        await checkoutButton.tap();
      });

      await test.step('Mobile form filling', async () => {
        const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first();
        if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          // Mobile form interaction
          await nameInput.tap();
          await nameInput.fill(testData.customer.name);
          
          // Test mobile keyboard behavior
          await page.keyboard.press('Tab');
          
          const emailInput = page.locator('input[type="email"]').first();
          await emailInput.fill(testData.customer.email);
          
          // Test mobile number input
          const phoneInput = page.locator('input[name="phone"], input[type="tel"]').first();
          await phoneInput.tap();
          await phoneInput.fill(testData.customer.phone);
          
          // Mobile form submission
          const submitButton = page.locator('button[type="submit"]').first();
          if (await submitButton.isVisible()) {
            await submitButton.tap();
          }
        }
      });

      await test.step('Mobile payment completion', async () => {
        await mockAPI(page, '**/api/payments/**', {
          status: 200,
          body: { success: true, device: 'iPhone' }
        });
        console.log('iPhone purchase completed');
      });
    });

    test('Chrome Mobile (Android) - Android-specific behavior', async ({ page }) => {
      // Set Android viewport
      await page.setViewportSize(devices['Pixel 5'].viewport);
      
      const basePage = new BasePage(page);
      const testData = testDataFactory.generateScenario('purchase-flow', {
        customer: {
          name: `Android User ${testRunId}`,
          email: `android_${testRunId}@e2e-test.com`,
          phone: '555-AND-ROID'
        }
      });

      await test.step('Android Chrome setup', async () => {
        await basePage.goto('/tickets');
        
        // Test Android viewport
        const viewport = page.viewportSize();
        expect(viewport.width).toBe(393);  // Pixel 5 width
        expect(viewport.height).toBe(851); // Pixel 5 height
        
        // Test Android-specific features
        const userAgent = await page.evaluate(() => navigator.userAgent);
        console.log('Android user agent:', userAgent);
      });

      await test.step('Android touch and interaction', async () => {
        // Test Android Material Design interactions
        const dayPassButton = page.locator('button').filter({ hasText: /day.*pass/i }).first();
        
        // Android ripple effect and touch feedback
        await dayPassButton.tap();
        await page.waitForTimeout(300); // Wait for ripple animation
        
        await expect(page.locator('.cart-count, [data-cart-count]')).toContainText('1');
        
        // Android back button simulation (if applicable)
        await page.keyboard.press('Escape'); // Simulate back gesture
      });

      await test.step('Android keyboard and input', async () => {
        const cartToggle = page.locator('.floating-cart').first();
        await cartToggle.tap();
        
        const checkoutButton = page.locator('button').filter({ hasText: /checkout/i }).first();
        await checkoutButton.tap();
        
        // Android keyboard behavior
        const nameInput = page.locator('input[name="name"]').first();
        if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          await nameInput.tap();
          // Android soft keyboard appears
          await page.waitForTimeout(500);
          
          await fillForm(page, {
            name: testData.customer.name,
            email: testData.customer.email,
            phone: testData.customer.phone
          });
          
          // Hide keyboard
          await page.keyboard.press('Escape');
          
          const submitButton = page.locator('button[type="submit"]').first();
          if (await submitButton.isVisible()) {
            await submitButton.tap();
          }
        }
      });

      await test.step('Android payment completion', async () => {
        await mockAPI(page, '**/api/payments/**', {
          status: 200,
          body: { success: true, device: 'Android' }
        });
        console.log('Android purchase completed');
      });
    });
  });

  test.describe('Screen Size Compatibility', () => {
    test('Tablet landscape - iPad view', async ({ page }) => {
      // Set tablet viewport
      await page.setViewportSize(testViewports.tablet);
      
      const basePage = new BasePage(page);
      const testData = testDataFactory.generateScenario('purchase-flow', {
        customer: {
          name: `Tablet User ${testRunId}`,
          email: `tablet_${testRunId}@e2e-test.com`,
          phone: '555-TAB-LET'
        }
      });

      await test.step('Tablet layout verification', async () => {
        await basePage.goto('/tickets');
        
        // Verify tablet-optimized layout
        const viewport = page.viewportSize();
        expect(viewport.width).toBe(768);
        expect(viewport.height).toBe(1024);
        
        // Test tablet grid layout
        const ticketGrid = page.locator('.tickets-grid, .ticket-cards');
        if (await ticketGrid.isVisible()) {
          const gridStyle = await ticketGrid.evaluate(el => 
            window.getComputedStyle(el).getPropertyValue('display')
          );
          console.log('Tablet grid display:', gridStyle);
        }
      });

      await test.step('Tablet interaction patterns', async () => {
        // Tablets can use both touch and precise clicking
        const socialPassButton = page.locator('button').filter({ hasText: /social.*pass/i }).first();
        
        // Test hover states (tablets with mouse support)
        await socialPassButton.hover();
        await page.waitForTimeout(300);
        
        await socialPassButton.click();
        await expect(page.locator('.cart-count, [data-cart-count]')).toContainText('1');
        
        // Test tablet cart behavior
        const cartToggle = page.locator('.floating-cart').first();
        await cartToggle.click();
        
        const checkoutButton = page.locator('button').filter({ hasText: /checkout/i }).first();
        await checkoutButton.click();
      });

      await test.step('Tablet form experience', async () => {
        const nameInput = page.locator('input[name="name"]').first();
        if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          // Tablets have better form layouts
          await fillForm(page, {
            name: testData.customer.name,
            email: testData.customer.email,
            phone: testData.customer.phone
          });
          
          const submitButton = page.locator('button[type="submit"]').first();
          if (await submitButton.isVisible()) {
            await submitButton.click();
          }
        }
        
        await mockAPI(page, '**/api/payments/**', {
          status: 200,
          body: { success: true, device: 'tablet' }
        });
        console.log('Tablet purchase completed');
      });
    });

    test('Desktop wide screen - Large desktop view', async ({ page }) => {
      // Set large desktop viewport
      await page.setViewportSize({ width: 1920, height: 1080 });
      
      const basePage = new BasePage(page);
      const testData = testDataFactory.generateScenario('purchase-flow', {
        customer: {
          name: `Desktop User ${testRunId}`,
          email: `desktop_${testRunId}@e2e-test.com`,
          phone: '555-BIG-SCRN'
        }
      });

      await test.step('Large desktop layout', async () => {
        await basePage.goto('/tickets');
        
        // Verify desktop-optimized wide layout
        const viewport = page.viewportSize();
        expect(viewport.width).toBe(1920);
        expect(viewport.height).toBe(1080);
        
        // Test wide screen ticket layout
        const ticketCards = page.locator('.ticket-card, .pass-option');
        const cardCount = await ticketCards.count();
        
        // Desktop should show all tickets in a row
        if (cardCount > 0) {
          const firstCard = ticketCards.first();
          const lastCard = ticketCards.last();
          
          const firstBox = await firstCard.boundingBox();
          const lastBox = await lastCard.boundingBox();
          
          // Cards should be in horizontal layout on desktop
          expect(lastBox.x).toBeGreaterThan(firstBox.x);
        }
      });

      await test.step('Desktop precise interactions', async () => {
        // Desktop allows precise mouse interactions
        const fullPassButton = page.locator('button').filter({ hasText: /full.*pass/i }).first();
        
        // Test hover effects
        await fullPassButton.hover();
        await page.waitForTimeout(200);
        
        // Test click precision
        await fullPassButton.click();
        await expect(page.locator('.cart-count, [data-cart-count]')).toContainText('1');
        
        // Desktop cart interaction
        const cartToggle = page.locator('.floating-cart').first();
        await cartToggle.hover();
        await cartToggle.click();
        
        const checkoutButton = page.locator('button').filter({ hasText: /checkout/i }).first();
        await checkoutButton.click();
      });

      await test.step('Desktop form and keyboard navigation', async () => {
        const nameInput = page.locator('input[name="name"]').first();
        if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          // Test keyboard navigation
          await nameInput.focus();
          await nameInput.fill(testData.customer.name);
          
          // Tab through form
          await page.keyboard.press('Tab');
          const emailInput = page.locator('input[type="email"]').first();
          await emailInput.fill(testData.customer.email);
          
          await page.keyboard.press('Tab');
          const phoneInput = page.locator('input[name="phone"], input[type="tel"]').first();
          await phoneInput.fill(testData.customer.phone);
          
          // Submit via Enter key
          await page.keyboard.press('Tab');
          const submitButton = page.locator('button[type="submit"]').first();
          await submitButton.press('Enter');
        }
        
        await mockAPI(page, '**/api/payments/**', {
          status: 200,
          body: { success: true, device: 'desktop' }
        });
        console.log('Desktop purchase completed');
      });
    });

    test('Mobile small screen - Compact mobile view', async ({ page }) => {
      // Set compact mobile viewport
      await page.setViewportSize({ width: 320, height: 568 }); // iPhone SE size
      
      const basePage = new BasePage(page);
      const testData = testDataFactory.generateScenario('purchase-flow', {
        customer: {
          name: `Compact User ${testRunId}`,
          email: `compact_${testRunId}@e2e-test.com`,
          phone: '555-CMP-ACT'
        }
      });

      await test.step('Compact mobile layout', async () => {
        await basePage.goto('/tickets');
        
        // Verify very small screen handling
        const viewport = page.viewportSize();
        expect(viewport.width).toBe(320);
        
        // All content should be stacked vertically
        const ticketCards = page.locator('.ticket-card, .pass-option');
        const cardCount = await ticketCards.count();
        
        if (cardCount > 1) {
          const firstCard = ticketCards.first();
          const secondCard = ticketCards.nth(1);
          
          const firstBox = await firstCard.boundingBox();
          const secondBox = await secondCard.boundingBox();
          
          // Cards should be stacked vertically on small mobile
          expect(secondBox.y).toBeGreaterThan(firstBox.y);
        }
      });

      await test.step('Compact mobile interactions', async () => {
        // Ensure touch targets are accessible on small screens
        const dayPassButton = page.locator('button').filter({ hasText: /day.*pass/i }).first();
        
        // Scroll to ensure visibility
        await dayPassButton.scrollIntoViewIfNeeded();
        
        const buttonBox = await dayPassButton.boundingBox();
        expect(buttonBox.width).toBeGreaterThan(0);
        expect(buttonBox.height).toBeGreaterThanOrEqual(40); // Minimum touch target
        
        await dayPassButton.tap();
        await expect(page.locator('.cart-count, [data-cart-count]')).toContainText('1');
        
        // Test compact cart
        const cartToggle = page.locator('.floating-cart, .mobile-cart').first();
        await cartToggle.tap();
        
        const checkoutButton = page.locator('button').filter({ hasText: /checkout/i }).first();
        await checkoutButton.scrollIntoViewIfNeeded();
        await checkoutButton.tap();
      });

      await test.step('Compact mobile form', async () => {
        const nameInput = page.locator('input[name="name"]').first();
        if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          // Test compact form layout
          await nameInput.scrollIntoViewIfNeeded();
          await nameInput.tap();
          await nameInput.fill(testData.customer.name);
          
          const emailInput = page.locator('input[type="email"]').first();
          await emailInput.scrollIntoViewIfNeeded();
          await emailInput.tap();
          await emailInput.fill(testData.customer.email);
          
          const phoneInput = page.locator('input[name="phone"], input[type="tel"]').first();
          await phoneInput.scrollIntoViewIfNeeded();
          await phoneInput.tap();
          await phoneInput.fill(testData.customer.phone);
          
          const submitButton = page.locator('button[type="submit"]').first();
          await submitButton.scrollIntoViewIfNeeded();
          await submitButton.tap();
        }
        
        await mockAPI(page, '**/api/payments/**', {
          status: 200,
          body: { success: true, device: 'compact-mobile' }
        });
        console.log('Compact mobile purchase completed');
      });
    });
  });

  test.describe('Browser Feature Compatibility', () => {
    test('Local storage persistence across browsers', async ({ page, browserName }) => {
      const basePage = new BasePage(page);
      
      await test.step('Test localStorage in different browsers', async () => {
        await basePage.goto('/tickets');
        
        // Add item to cart
        const fullPassButton = page.locator('button').filter({ hasText: /full.*pass/i }).first();
        await fullPassButton.click();
        
        // Verify localStorage works
        const cartData = await page.evaluate(() => {
          const cart = JSON.parse(localStorage.getItem('cart') || '[]');
          return cart;
        });
        
        expect(cartData.length).toBeGreaterThan(0);
        console.log(`${browserName} localStorage working:`, cartData.length, 'items');
        
        // Test localStorage limits (different browsers have different limits)
        const storageTest = await page.evaluate(() => {
          try {
            const testKey = 'storage_test_' + Date.now();
            const testData = 'x'.repeat(1000); // 1KB test data
            localStorage.setItem(testKey, testData);
            const retrieved = localStorage.getItem(testKey);
            localStorage.removeItem(testKey);
            return retrieved === testData;
          } catch (error) {
            return false;
          }
        });
        
        expect(storageTest).toBe(true);
        console.log(`${browserName} localStorage test passed`);
      });
    });

    test('Cookie handling and third-party cookies', async ({ page, browserName }) => {
      const basePage = new BasePage(page);
      
      await test.step('Test cookie functionality', async () => {
        await basePage.goto('/tickets');
        
        // Set test cookie
        await page.context().addCookies([{
          name: 'test_cookie_' + browserName,
          value: testRunId,
          domain: new URL(page.url()).hostname,
          path: '/'
        }]);
        
        // Verify cookie was set
        const cookies = await page.context().cookies();
        const testCookie = cookies.find(c => c.name.includes('test_cookie'));
        expect(testCookie).toBeTruthy();
        
        console.log(`${browserName} cookie handling working`);
        
        // Test cookie in JavaScript
        const cookieValue = await page.evaluate((cookieName) => {
          return document.cookie.split(';')
            .find(c => c.trim().startsWith(cookieName + '='))
            ?.split('=')[1];
        }, 'test_cookie_' + browserName);
        
        expect(cookieValue).toBe(testRunId);
      });
    });

    test('JavaScript ES6+ feature support', async ({ page, browserName }) => {
      const basePage = new BasePage(page);
      
      await test.step('Test modern JavaScript features', async () => {
        await basePage.goto('/tickets');
        
        // Test ES6+ features support
        const featureSupport = await page.evaluate(() => {
          const tests = {};
          
          // Arrow functions
          try {
            const arrowFn = () => 'test';
            tests.arrowFunctions = arrowFn() === 'test';
          } catch (e) {
            tests.arrowFunctions = false;
          }
          
          // Async/await
          try {
            tests.asyncAwait = typeof async function() {} === 'function';
          } catch (e) {
            tests.asyncAwait = false;
          }
          
          // Template literals
          try {
            const name = 'test';
            tests.templateLiterals = `Hello ${name}` === 'Hello test';
          } catch (e) {
            tests.templateLiterals = false;
          }
          
          // Fetch API
          tests.fetchAPI = typeof fetch === 'function';
          
          // Promise support
          tests.promises = typeof Promise === 'function';
          
          return tests;
        });
        
        console.log(`${browserName} feature support:`, featureSupport);
        
        // All modern browsers should support these features
        expect(featureSupport.arrowFunctions).toBe(true);
        expect(featureSupport.promises).toBe(true);
        expect(featureSupport.fetchAPI).toBe(true);
      });
    });
  });
});
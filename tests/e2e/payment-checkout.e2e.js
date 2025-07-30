/**
 * E2E tests for Payment Checkout Flow
 * Tests complete user journey from ticket selection to payment confirmation
 */

import { test, expect } from '@playwright/test';

// Test configuration
test.use({
    baseURL: 'http://localhost:3000',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
});

test.describe('Payment Checkout E2E Tests', () => {
    test.beforeEach(async ({ page }) => {
        // Set up test environment
        await page.goto('/');
        
        // Accept cookies if banner present
        const cookieBanner = page.locator('[data-testid="cookie-banner"]');
        if (await cookieBanner.isVisible()) {
            await page.click('[data-testid="accept-cookies"]');
        }
    });

    test('Complete purchase flow - single ticket', async ({ page }) => {
        // Navigate to tickets page
        await page.click('nav a[href="/tickets"]');
        await expect(page).toHaveURL('/tickets');
        
        // Select full festival pass
        await page.click('[data-testid="ticket-full-festival"]');
        
        // Verify price is displayed
        await expect(page.locator('[data-testid="ticket-price"]')).toContainText('$300');
        
        // Add to cart
        await page.click('[data-testid="add-to-cart"]');
        
        // Verify cart updated
        await expect(page.locator('[data-testid="cart-count"]')).toContainText('1');
        
        // Proceed to checkout
        await page.click('[data-testid="checkout-button"]');
        
        // Fill in customer information
        await page.fill('[data-testid="customer-email"]', 'test@example.com');
        await page.fill('[data-testid="customer-name"]', 'Test Customer');
        await page.fill('[data-testid="customer-phone"]', '303-555-1234');
        
        // Continue to payment
        await page.click('[data-testid="continue-to-payment"]');
        
        // Wait for Stripe iframe to load
        const stripeFrame = page.frameLocator('iframe[name*="stripe"]').first();
        
        // Fill in card details
        await stripeFrame.locator('[placeholder="Card number"]').fill('4242424242424242');
        await stripeFrame.locator('[placeholder="MM / YY"]').fill('12/25');
        await stripeFrame.locator('[placeholder="CVC"]').fill('123');
        await stripeFrame.locator('[placeholder="ZIP"]').fill('80303');
        
        // Complete purchase
        await page.click('[data-testid="complete-purchase"]');
        
        // Wait for confirmation page
        await page.waitForURL('**/success', { timeout: 10000 });
        
        // Verify confirmation details
        await expect(page.locator('h1')).toContainText('Thank You for Your Purchase!');
        await expect(page.locator('[data-testid="confirmation-email"]')).toContainText('test@example.com');
        await expect(page.locator('[data-testid="order-total"]')).toContainText('$300.00');
    });

    test('Complete purchase flow - multiple tickets with group discount', async ({ page }) => {
        await page.goto('/tickets');
        
        // Select 6 full festival passes (should trigger group discount)
        await page.click('[data-testid="ticket-full-festival"]');
        await page.selectOption('[data-testid="ticket-quantity"]', '6');
        
        // Verify group discount is applied
        await expect(page.locator('[data-testid="discount-message"]')).toContainText('10% group discount applied');
        await expect(page.locator('[data-testid="subtotal"]')).toContainText('$1,800.00');
        await expect(page.locator('[data-testid="discount-amount"]')).toContainText('-$180.00');
        await expect(page.locator('[data-testid="total"]')).toContainText('$1,620.00');
        
        // Add to cart and checkout
        await page.click('[data-testid="add-to-cart"]');
        await page.click('[data-testid="checkout-button"]');
        
        // Fill group leader information
        await page.fill('[data-testid="customer-email"]', 'group@example.com');
        await page.fill('[data-testid="customer-name"]', 'Group Leader');
        await page.fill('[data-testid="customer-phone"]', '303-555-5678');
        
        // Add group member names
        for (let i = 1; i <= 5; i++) {
            await page.fill(`[data-testid="attendee-name-${i}"]`, `Dancer ${i}`);
            await page.fill(`[data-testid="attendee-email-${i}"]`, `dancer${i}@example.com`);
        }
        
        // Continue through payment
        await page.click('[data-testid="continue-to-payment"]');
        
        // Complete Stripe payment
        const stripeFrame = page.frameLocator('iframe[name*="stripe"]').first();
        await stripeFrame.locator('[placeholder="Card number"]').fill('5555555555554444');
        await stripeFrame.locator('[placeholder="MM / YY"]').fill('12/25');
        await stripeFrame.locator('[placeholder="CVC"]').fill('123');
        
        await page.click('[data-testid="complete-purchase"]');
        
        // Verify group confirmation
        await page.waitForURL('**/success');
        await expect(page.locator('[data-testid="ticket-count"]')).toContainText('6 tickets');
        await expect(page.locator('[data-testid="order-total"]')).toContainText('$1,620.00');
    });

    test('Workshop and social pass bundle purchase', async ({ page }) => {
        await page.goto('/tickets');
        
        // Select workshop bundle
        await page.click('[data-testid="workshop-bundle-tab"]');
        await page.click('[data-testid="select-workshop-1"]'); // Salsa Fundamentals
        await page.click('[data-testid="select-workshop-2"]'); // Partner Work
        await page.click('[data-testid="add-social-pass"]');
        
        // Verify bundle pricing
        await expect(page.locator('[data-testid="bundle-savings"]')).toContainText('Save $30');
        
        // Add to cart
        await page.click('[data-testid="add-bundle-to-cart"]');
        
        // Complete checkout process
        await page.click('[data-testid="checkout-button"]');
        await page.fill('[data-testid="customer-email"]', 'workshop@example.com');
        await page.fill('[data-testid="customer-name"]', 'Workshop Attendee');
        
        // Dietary restrictions for workshops
        await page.fill('[data-testid="dietary-restrictions"]', 'Vegetarian');
        
        await page.click('[data-testid="continue-to-payment"]');
        
        // Payment
        const stripeFrame = page.frameLocator('iframe[name*="stripe"]').first();
        await stripeFrame.locator('[placeholder="Card number"]').fill('4242424242424242');
        await stripeFrame.locator('[placeholder="MM / YY"]').fill('12/25');
        await stripeFrame.locator('[placeholder="CVC"]').fill('123');
        
        await page.click('[data-testid="complete-purchase"]');
        
        // Verify workshop confirmation
        await page.waitForURL('**/success');
        await expect(page.locator('[data-testid="workshop-list"]')).toContainText('Salsa Fundamentals');
        await expect(page.locator('[data-testid="workshop-list"]')).toContainText('Partner Work');
        await expect(page.locator('[data-testid="social-pass"]')).toContainText('Social Dancing Pass Included');
    });

    test('Apply promo code during checkout', async ({ page }) => {
        await page.goto('/tickets');
        
        // Add ticket to cart
        await page.click('[data-testid="ticket-full-festival"]');
        await page.click('[data-testid="add-to-cart"]');
        await page.click('[data-testid="checkout-button"]');
        
        // Apply promo code
        await page.click('[data-testid="have-promo-code"]');
        await page.fill('[data-testid="promo-code-input"]', 'DANCE2026');
        await page.click('[data-testid="apply-promo"]');
        
        // Verify discount applied
        await expect(page.locator('[data-testid="promo-success"]')).toContainText('Promo code applied');
        await expect(page.locator('[data-testid="promo-discount"]')).toContainText('-$45.00'); // 15% off
        await expect(page.locator('[data-testid="total"]')).toContainText('$255.00');
        
        // Complete purchase
        await page.fill('[data-testid="customer-email"]', 'promo@example.com');
        await page.fill('[data-testid="customer-name"]', 'Promo User');
        await page.click('[data-testid="continue-to-payment"]');
        
        const stripeFrame = page.frameLocator('iframe[name*="stripe"]').first();
        await stripeFrame.locator('[placeholder="Card number"]').fill('4242424242424242');
        await stripeFrame.locator('[placeholder="MM / YY"]').fill('12/25');
        await stripeFrame.locator('[placeholder="CVC"]').fill('123');
        
        await page.click('[data-testid="complete-purchase"]');
        
        await page.waitForURL('**/success');
        await expect(page.locator('[data-testid="order-total"]')).toContainText('$255.00');
    });

    test('Handle payment method declined', async ({ page }) => {
        await page.goto('/tickets');
        
        // Add ticket and go to checkout
        await page.click('[data-testid="ticket-full-festival"]');
        await page.click('[data-testid="add-to-cart"]');
        await page.click('[data-testid="checkout-button"]');
        
        // Fill customer info
        await page.fill('[data-testid="customer-email"]', 'declined@example.com');
        await page.fill('[data-testid="customer-name"]', 'Declined Card');
        await page.click('[data-testid="continue-to-payment"]');
        
        // Use Stripe test card that will be declined
        const stripeFrame = page.frameLocator('iframe[name*="stripe"]').first();
        await stripeFrame.locator('[placeholder="Card number"]').fill('4000000000000002');
        await stripeFrame.locator('[placeholder="MM / YY"]').fill('12/25');
        await stripeFrame.locator('[placeholder="CVC"]').fill('123');
        
        await page.click('[data-testid="complete-purchase"]');
        
        // Verify error message
        await expect(page.locator('[data-testid="payment-error"]')).toContainText('Your card was declined');
        
        // Try different payment method
        await page.click('[data-testid="try-different-card"]');
        await stripeFrame.locator('[placeholder="Card number"]').fill('5555555555554444');
        await stripeFrame.locator('[placeholder="MM / YY"]').fill('12/25');
        await stripeFrame.locator('[placeholder="CVC"]').fill('123');
        
        await page.click('[data-testid="complete-purchase"]');
        
        // Should succeed this time
        await page.waitForURL('**/success');
    });

    test('Resume interrupted checkout session', async ({ page, context }) => {
        await page.goto('/tickets');
        
        // Start checkout
        await page.click('[data-testid="ticket-full-festival"]');
        await page.click('[data-testid="add-to-cart"]');
        await page.click('[data-testid="checkout-button"]');
        
        // Fill partial information
        await page.fill('[data-testid="customer-email"]', 'interrupted@example.com');
        await page.fill('[data-testid="customer-name"]', 'Interrupted User');
        
        // Simulate browser refresh/close
        await page.reload();
        
        // Verify session restored
        await expect(page.locator('[data-testid="cart-count"]')).toContainText('1');
        
        // Go back to checkout
        await page.click('[data-testid="checkout-button"]');
        
        // Verify form data preserved
        await expect(page.locator('[data-testid="customer-email"]')).toHaveValue('interrupted@example.com');
        await expect(page.locator('[data-testid="customer-name"]')).toHaveValue('Interrupted User');
        
        // Complete checkout
        await page.click('[data-testid="continue-to-payment"]');
        
        const stripeFrame = page.frameLocator('iframe[name*="stripe"]').first();
        await stripeFrame.locator('[placeholder="Card number"]').fill('4242424242424242');
        await stripeFrame.locator('[placeholder="MM / YY"]').fill('12/25');
        await stripeFrame.locator('[placeholder="CVC"]').fill('123');
        
        await page.click('[data-testid="complete-purchase"]');
        await page.waitForURL('**/success');
    });

    test('International customer checkout with currency conversion', async ({ page }) => {
        // Set location to Canada
        await page.goto('/tickets?country=CA');
        
        // Verify prices shown in CAD
        await expect(page.locator('[data-testid="currency-indicator"]')).toContainText('CAD');
        await expect(page.locator('[data-testid="ticket-price"]')).toContainText('C$'); 
        
        // Add ticket and checkout
        await page.click('[data-testid="ticket-full-festival"]');
        await page.click('[data-testid="add-to-cart"]');
        await page.click('[data-testid="checkout-button"]');
        
        // Fill Canadian address
        await page.fill('[data-testid="customer-email"]', 'canada@example.com');
        await page.fill('[data-testid="customer-name"]', 'Canadian Customer');
        await page.fill('[data-testid="billing-address"]', '123 Maple Street');
        await page.fill('[data-testid="billing-city"]', 'Toronto');
        await page.selectOption('[data-testid="billing-province"]', 'ON');
        await page.fill('[data-testid="billing-postal"]', 'M5V 3A9');
        
        // Verify tax calculation for Ontario (13% HST)
        await expect(page.locator('[data-testid="tax-amount"]')).toBeVisible();
        await expect(page.locator('[data-testid="tax-label"]')).toContainText('HST (13%)');
        
        // Complete payment
        await page.click('[data-testid="continue-to-payment"]');
        
        const stripeFrame = page.frameLocator('iframe[name*="stripe"]').first();
        await stripeFrame.locator('[placeholder="Card number"]').fill('4242424242424242');
        await stripeFrame.locator('[placeholder="MM / YY"]').fill('12/25');
        await stripeFrame.locator('[placeholder="CVC"]').fill('123');
        
        await page.click('[data-testid="complete-purchase"]');
        await page.waitForURL('**/success');
        
        // Verify confirmation shows CAD
        await expect(page.locator('[data-testid="order-currency"]')).toContainText('CAD');
    });

    test('Mobile checkout with Apple Pay', async ({ page, browserName }) => {
        // Skip if not Safari
        test.skip(browserName !== 'webkit', 'Apple Pay only available in Safari');
        
        // Use iPhone viewport
        await page.setViewportSize({ width: 390, height: 844 });
        
        await page.goto('/tickets');
        
        // Add ticket
        await page.click('[data-testid="ticket-full-festival"]');
        await page.click('[data-testid="add-to-cart"]');
        await page.click('[data-testid="checkout-button"]');
        
        // Fill basic info
        await page.fill('[data-testid="customer-email"]', 'mobile@example.com');
        await page.fill('[data-testid="customer-name"]', 'Mobile User');
        
        // Click Apple Pay button
        await page.click('[data-testid="apple-pay-button"]');
        
        // Note: Actual Apple Pay testing requires device authentication
        // This test verifies the button is present and clickable
        await expect(page.locator('[data-testid="apple-pay-sheet"]')).toBeVisible();
    });

    test('Accessibility - keyboard navigation through checkout', async ({ page }) => {
        await page.goto('/tickets');
        
        // Navigate using keyboard only
        await page.keyboard.press('Tab'); // Skip to main content
        await page.keyboard.press('Tab'); // Navigate to first ticket
        await page.keyboard.press('Enter'); // Select ticket
        
        // Tab to quantity and change
        await page.keyboard.press('Tab');
        await page.keyboard.press('ArrowUp'); // Increase quantity
        
        // Tab to add to cart
        await page.keyboard.press('Tab');
        await page.keyboard.press('Enter');
        
        // Tab to checkout
        await page.keyboard.press('Tab');
        await page.keyboard.press('Enter');
        
        // Fill form with keyboard
        await page.keyboard.type('keyboard@example.com');
        await page.keyboard.press('Tab');
        await page.keyboard.type('Keyboard User');
        await page.keyboard.press('Tab');
        await page.keyboard.type('303-555-9999');
        
        // Tab to continue button
        await page.keyboard.press('Tab');
        await page.keyboard.press('Enter');
        
        // Verify we reached payment step
        await expect(page.locator('[data-testid="payment-step"]')).toBeVisible();
    });

    test('Error recovery - network interruption during payment', async ({ page, context }) => {
        await page.goto('/tickets');
        
        // Add ticket and start checkout
        await page.click('[data-testid="ticket-full-festival"]');
        await page.click('[data-testid="add-to-cart"]');
        await page.click('[data-testid="checkout-button"]');
        
        // Fill info
        await page.fill('[data-testid="customer-email"]', 'network@example.com');
        await page.fill('[data-testid="customer-name"]', 'Network Test');
        await page.click('[data-testid="continue-to-payment"]');
        
        // Simulate network interruption
        await context.setOffline(true);
        
        // Try to complete payment
        const stripeFrame = page.frameLocator('iframe[name*="stripe"]').first();
        await stripeFrame.locator('[placeholder="Card number"]').fill('4242424242424242');
        await stripeFrame.locator('[placeholder="MM / YY"]').fill('12/25');
        await stripeFrame.locator('[placeholder="CVC"]').fill('123');
        
        await page.click('[data-testid="complete-purchase"]');
        
        // Should show network error
        await expect(page.locator('[data-testid="network-error"]')).toContainText('Connection lost');
        
        // Restore network
        await context.setOffline(false);
        
        // Retry button should be available
        await page.click('[data-testid="retry-payment"]');
        
        // Payment should succeed
        await page.waitForURL('**/success');
    });

    test('Sold out handling during checkout', async ({ page }) => {
        await page.goto('/tickets');
        
        // Start with available ticket
        await page.click('[data-testid="ticket-workshop-only"]');
        await page.click('[data-testid="add-to-cart"]');
        await page.click('[data-testid="checkout-button"]');
        
        // Fill customer info
        await page.fill('[data-testid="customer-email"]', 'soldout@example.com');
        await page.fill('[data-testid="customer-name"]', 'Last Minute');
        
        // Simulate ticket becoming sold out (would be done via API in real scenario)
        await page.evaluate(() => {
            window.__mockSoldOut = true;
        });
        
        // Try to continue
        await page.click('[data-testid="continue-to-payment"]');
        
        // Should show sold out message
        await expect(page.locator('[data-testid="sold-out-alert"]')).toContainText('sold out');
        
        // Should offer alternatives
        await expect(page.locator('[data-testid="alternative-tickets"]')).toBeVisible();
        
        // Select alternative
        await page.click('[data-testid="select-alternative"]');
        
        // Continue with new selection
        await page.click('[data-testid="continue-to-payment"]');
        
        // Complete purchase
        const stripeFrame = page.frameLocator('iframe[name*="stripe"]').first();
        await stripeFrame.locator('[placeholder="Card number"]').fill('4242424242424242');
        await stripeFrame.locator('[placeholder="MM / YY"]').fill('12/25');
        await stripeFrame.locator('[placeholder="CVC"]').fill('123');
        
        await page.click('[data-testid="complete-purchase"]');
        await page.waitForURL('**/success');
    });
});
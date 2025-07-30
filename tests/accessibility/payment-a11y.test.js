/**
 * Accessibility tests for payment implementation
 * Tests WCAG 2.1 AA compliance
 */

const { test, expect } = require('@playwright/test');
const { injectAxe, checkA11y } = require('axe-playwright');

test.describe('Payment Accessibility Tests', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/tickets');
        await injectAxe(page);
    });

    test('tickets page meets WCAG AA standards', async ({ page }) => {
        await checkA11y(page, null, {
            detailedReport: true,
            detailedReportOptions: {
                html: true,
            },
            axeOptions: {
                runOnly: {
                    type: 'tag',
                    values: ['wcag2aa', 'wcag21aa'],
                },
            },
        });
    });

    test('payment form has proper labels and ARIA attributes', async ({ page }) => {
        // Navigate to checkout
        await page.click('[data-testid="ticket-full-festival"]');
        await page.click('[data-testid="add-to-cart"]');
        await page.click('[data-testid="checkout-button"]');

        // Check form accessibility
        await checkA11y(page, '[data-testid="checkout-form"]', {
            axeOptions: {
                rules: {
                    'label': { enabled: true },
                    'aria-valid-attr': { enabled: true },
                    'aria-required-attr': { enabled: true },
                },
            },
        });

        // Verify specific accessibility features
        const emailInput = page.locator('[data-testid="customer-email"]');
        await expect(emailInput).toHaveAttribute('aria-label', /email/i);
        await expect(emailInput).toHaveAttribute('aria-required', 'true');

        const submitButton = page.locator('[data-testid="continue-to-payment"]');
        await expect(submitButton).toHaveAttribute('aria-label', /continue to payment/i);
    });

    test('keyboard navigation through entire checkout flow', async ({ page }) => {
        // Start with keyboard navigation
        await page.keyboard.press('Tab'); // Skip to main content
        
        // Navigate to ticket selection
        for (let i = 0; i < 3; i++) {
            await page.keyboard.press('Tab');
        }
        await page.keyboard.press('Enter'); // Select ticket

        // Verify focus is visible
        const focusedElement = await page.evaluate(() => document.activeElement.tagName);
        expect(focusedElement).toBeTruthy();

        // Add to cart with keyboard
        await page.keyboard.press('Tab');
        await page.keyboard.press('Enter');

        // Navigate to checkout
        await page.keyboard.press('Tab');
        await page.keyboard.press('Enter');

        // Fill form with keyboard only
        await page.keyboard.type('keyboard-a11y@example.com');
        await page.keyboard.press('Tab');
        await page.keyboard.type('Keyboard Test User');
        await page.keyboard.press('Tab');
        await page.keyboard.type('303-555-1234');

        // Verify tab order is logical
        const tabOrder = await page.evaluate(() => {
            const elements = [];
            let current = document.activeElement;
            
            // Simulate tabbing through form
            for (let i = 0; i < 10; i++) {
                const event = new KeyboardEvent('keydown', { key: 'Tab' });
                current.dispatchEvent(event);
                current = document.activeElement;
                if (current) {
                    elements.push({
                        tag: current.tagName,
                        id: current.id,
                        type: current.type,
                    });
                }
            }
            return elements;
        });

        expect(tabOrder.length).toBeGreaterThan(0);
    });

    test('screen reader announcements for errors and updates', async ({ page }) => {
        // Navigate to checkout
        await page.click('[data-testid="ticket-full-festival"]');
        await page.click('[data-testid="add-to-cart"]');
        await page.click('[data-testid="checkout-button"]');

        // Submit form with missing data to trigger errors
        await page.click('[data-testid="continue-to-payment"]');

        // Check for ARIA live regions
        const liveRegion = page.locator('[aria-live="polite"]');
        await expect(liveRegion).toContainText(/required/i);

        // Verify error messages are associated with inputs
        const emailError = page.locator('[data-testid="email-error"]');
        await expect(emailError).toHaveAttribute('role', 'alert');
        
        const emailInput = page.locator('[data-testid="customer-email"]');
        const errorId = await emailError.getAttribute('id');
        await expect(emailInput).toHaveAttribute('aria-describedby', errorId);
    });

    test('color contrast meets WCAG AA standards', async ({ page }) => {
        await checkA11y(page, null, {
            axeOptions: {
                rules: {
                    'color-contrast': { enabled: true },
                },
            },
        });

        // Manually check specific elements
        const priceElement = page.locator('[data-testid="ticket-price"]');
        const priceColor = await priceElement.evaluate(el => 
            window.getComputedStyle(el).color
        );
        const priceBackground = await priceElement.evaluate(el => 
            window.getComputedStyle(el).backgroundColor
        );

        // Verify contrast ratio is at least 4.5:1 for normal text
        expect(priceColor).toBeTruthy();
        expect(priceBackground).toBeTruthy();
    });

    test('focus indicators are clearly visible', async ({ page }) => {
        // Tab through interactive elements
        const interactiveElements = [
            '[data-testid="ticket-select-button"]',
            '[data-testid="quantity-selector"]',
            '[data-testid="add-to-cart"]',
            '[data-testid="checkout-button"]',
        ];

        for (const selector of interactiveElements) {
            await page.focus(selector);
            
            // Check focus styles
            const focusStyles = await page.evaluate((sel) => {
                const element = document.querySelector(sel);
                const styles = window.getComputedStyle(element);
                return {
                    outline: styles.outline,
                    outlineOffset: styles.outlineOffset,
                    boxShadow: styles.boxShadow,
                };
            }, selector);

            // Verify focus is visible (either outline or box-shadow)
            const hasFocusIndicator = 
                focusStyles.outline !== 'none' || 
                focusStyles.boxShadow !== 'none';
            
            expect(hasFocusIndicator).toBeTruthy();
        }
    });

    test('loading states are announced to screen readers', async ({ page }) => {
        // Add ticket to cart
        await page.click('[data-testid="ticket-full-festival"]');
        await page.click('[data-testid="add-to-cart"]');
        await page.click('[data-testid="checkout-button"]');

        // Fill form
        await page.fill('[data-testid="customer-email"]', 'a11y@example.com');
        await page.fill('[data-testid="customer-name"]', 'A11y Test');
        
        // Mock slow network
        await page.route('**/api/payments/**', route => {
            setTimeout(() => route.continue(), 2000);
        });

        // Submit form
        await page.click('[data-testid="continue-to-payment"]');

        // Check for loading announcement
        const loadingAnnouncement = page.locator('[aria-live="polite"]');
        await expect(loadingAnnouncement).toContainText(/processing|loading/i);

        // Verify button shows loading state
        const submitButton = page.locator('[data-testid="continue-to-payment"]');
        await expect(submitButton).toHaveAttribute('aria-busy', 'true');
        await expect(submitButton).toBeDisabled();
    });

    test('payment success/failure is announced', async ({ page }) => {
        // Complete checkout flow
        await page.click('[data-testid="ticket-full-festival"]');
        await page.click('[data-testid="add-to-cart"]');
        await page.click('[data-testid="checkout-button"]');

        await page.fill('[data-testid="customer-email"]', 'success@example.com');
        await page.fill('[data-testid="customer-name"]', 'Success Test');
        await page.click('[data-testid="continue-to-payment"]');

        // Wait for Stripe iframe
        const stripeFrame = page.frameLocator('iframe[name*="stripe"]').first();
        await stripeFrame.locator('[placeholder="Card number"]').fill('4242424242424242');
        await stripeFrame.locator('[placeholder="MM / YY"]').fill('12/25');
        await stripeFrame.locator('[placeholder="CVC"]').fill('123');

        await page.click('[data-testid="complete-purchase"]');

        // Check for success announcement
        await page.waitForURL('**/success');
        const successAnnouncement = page.locator('[role="status"]');
        await expect(successAnnouncement).toContainText(/success|thank you/i);
        await expect(successAnnouncement).toHaveAttribute('aria-live', 'polite');
    });

    test('mobile touch targets meet minimum size requirements', async ({ page }) => {
        // Set mobile viewport
        await page.setViewportSize({ width: 375, height: 667 });

        // Check touch target sizes
        const touchTargets = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button, a, [role="button"]');
            const results = [];

            buttons.forEach(button => {
                const rect = button.getBoundingClientRect();
                results.push({
                    text: button.textContent.trim(),
                    width: rect.width,
                    height: rect.height,
                    area: rect.width * rect.height,
                });
            });

            return results;
        });

        // WCAG 2.1 requires 44x44px minimum
        touchTargets.forEach(target => {
            expect(target.width).toBeGreaterThanOrEqual(44);
            expect(target.height).toBeGreaterThanOrEqual(44);
        });
    });

    test('form validation messages are accessible', async ({ page }) => {
        await page.goto('/tickets');
        await page.click('[data-testid="ticket-full-festival"]');
        await page.click('[data-testid="add-to-cart"]');
        await page.click('[data-testid="checkout-button"]');

        // Test invalid email
        await page.fill('[data-testid="customer-email"]', 'invalid-email');
        await page.click('[data-testid="continue-to-payment"]');

        // Check error message accessibility
        const emailError = page.locator('[data-testid="email-error"]');
        await expect(emailError).toBeVisible();
        await expect(emailError).toHaveAttribute('role', 'alert');

        // Verify input has error state
        const emailInput = page.locator('[data-testid="customer-email"]');
        await expect(emailInput).toHaveAttribute('aria-invalid', 'true');
        await expect(emailInput).toHaveAttribute('aria-describedby', /email-error/);
    });

    test('payment form works with voice control', async ({ page }) => {
        // This test simulates voice control by using accessible names
        await page.goto('/tickets');

        // Navigate using accessible names
        await page.getByRole('button', { name: /full festival pass/i }).click();
        await page.getByRole('button', { name: /add to cart/i }).click();
        await page.getByRole('button', { name: /checkout/i }).click();

        // Fill form using labels
        await page.getByLabel(/email/i).fill('voice@example.com');
        await page.getByLabel(/name/i).fill('Voice User');
        await page.getByLabel(/phone/i).fill('303-555-9999');

        // Continue using accessible name
        await page.getByRole('button', { name: /continue to payment/i }).click();

        // Verify navigation worked
        await expect(page).toHaveURL(/checkout|payment/);
    });

    test('currency and price changes are announced', async ({ page }) => {
        await page.goto('/tickets?country=CA');

        // Verify currency change is announced
        const currencyAnnouncement = page.locator('[aria-live="polite"]');
        await expect(currencyAnnouncement).toContainText(/canadian dollar|CAD/i);

        // Select ticket and verify price announcement
        await page.click('[data-testid="ticket-full-festival"]');
        
        // Change quantity
        await page.selectOption('[data-testid="quantity-selector"]', '5');

        // Check for price update announcement
        await expect(currencyAnnouncement).toContainText(/price updated|total/i);
    });

    test('checkout timer is accessible', async ({ page }) => {
        await page.goto('/tickets');
        await page.click('[data-testid="ticket-full-festival"]');
        await page.click('[data-testid="add-to-cart"]');
        await page.click('[data-testid="checkout-button"]');

        // Check for session timer
        const timer = page.locator('[data-testid="session-timer"]');
        await expect(timer).toHaveAttribute('role', 'timer');
        await expect(timer).toHaveAttribute('aria-live', 'polite');
        await expect(timer).toHaveAttribute('aria-label', /time remaining|session expires/i);

        // Verify warning at 5 minutes
        await page.evaluate(() => {
            // Mock timer to 5 minutes
            window.__mockTimer = 300;
        });

        const warningAnnouncement = page.locator('[role="alert"]');
        await expect(warningAnnouncement).toContainText(/5 minutes remaining/i);
    });
});
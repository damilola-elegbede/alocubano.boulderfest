/**
 * Accessibility Compliance Tests for A Lo Cubano Boulder Fest
 * Tests WCAG 2.1 AA compliance across all pages and interactions
 * 
 * Tests cover:
 * - WCAG 2.1 Level AA compliance
 * - Keyboard navigation
 * - Screen reader compatibility
 * - Color contrast ratios
 * - Mobile accessibility
 * - Focus management
 * - Semantic HTML structure
 */

import { test, expect } from '@playwright/test';
import { createAccessibilityTestSuite, assertAccessible, generateAccessibilityReport } from '../helpers/accessibility-utilities.js';

// Mock matchMedia for viewport-dependent accessibility features
function setupMatchMediaMock(page) {
  return page.addInitScript(() => {
    // Fixed: Replace jest.fn() with vanilla JavaScript functions in matchMedia mock
    const mockMatchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: function() {}, // Deprecated but still used
      removeListener: function() {}, // Deprecated but still used
      addEventListener: function() {},
      removeEventListener: function() {},
      dispatchEvent: function() { return true; }
    });
    
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: mockMatchMedia
    });
  });
}

test.describe('WCAG 2.1 AA Compliance', () => {
  test.beforeEach(async ({ page }) => {
    // Set up accessibility testing environment
    await setupMatchMediaMock(page);
    
    // Configure page for accessibility testing
    await page.setViewportSize({ width: 1200, height: 800 });
    
    // Add basic authentication if needed
    if (process.env.TEST_ADMIN_PASSWORD) {
      await page.route('**/api/admin/**', route => {
        route.continue({
          headers: {
            ...route.request().headers(),
            'authorization': `Bearer test-token`
          }
        });
      });
    }
  });

  // Homepage Accessibility Tests
  test('Homepage meets WCAG 2.1 AA standards', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const accessibility = createAccessibilityTestSuite(page);
    
    // Run comprehensive accessibility audit
    const results = await accessibility.runFullAccessibilityAudit({
      excludeRules: [
        'color-contrast', // Will test separately with more precision
        'duplicate-id' // May have legitimate duplicates in complex layouts
      ]
    });

    // Assert no critical or serious violations
    const criticalViolations = results.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    );

    if (criticalViolations.length > 0) {
      console.log('Critical accessibility violations found:', JSON.stringify(criticalViolations, null, 2));
    }

    expect(criticalViolations).toHaveLength(0);
    expect(results.wcagLevel).toBeOneOf(['A', 'AA']);

    // Test keyboard navigation
    const keyboardIssues = await accessibility.checkKeyboardNavigation();
    expect(keyboardIssues.filter(issue => issue.type === 'keyboard-trap')).toHaveLength(0);

    // Test semantic structure
    const semanticIssues = await accessibility.checkSemanticStructure();
    expect(semanticIssues.filter(issue => issue.type === 'missing-alt-text')).toHaveLength(0);
  });

  // Tickets Page Accessibility
  test('Tickets page meets accessibility standards', async ({ page }) => {
    await page.goto('/tickets');
    await page.waitForLoadState('domcontentloaded');

    const accessibility = createAccessibilityTestSuite(page);

    // Focus management during ticket selection
    await page.click('.ticket-card:first-child');
    await page.waitForTimeout(500);

    // Check that focus is managed properly
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();

    // Test ARIA attributes on ticket cards
    const ticketCards = page.locator('.ticket-card');
    await expect(ticketCards.first()).toHaveAttribute('role', /(button|link)/);
    await expect(ticketCards.first()).toHaveAttribute('tabindex', /(0|-1)/);

    // Run full accessibility audit
    await assertAccessible(page, {
      excludeRules: ['duplicate-id']
    });

    // Test mobile accessibility
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    
    const mobileIssues = await accessibility.checkMobileAccessibility();
    expect(mobileIssues.filter(issue => issue.type === 'small-touch-target')).toHaveLength(0);
  });

  // Gallery Accessibility Tests
  test('Gallery meets accessibility standards with dynamic content', async ({ page }) => {
    await page.goto('/gallery');
    await page.waitForLoadState('domcontentloaded');

    const accessibility = createAccessibilityTestSuite(page);

    // Wait for gallery to load dynamically
    await page.waitForSelector('.gallery-grid img', { timeout: 10000 });
    await page.waitForTimeout(2000); // Allow for lazy loading

    // Test image accessibility
    const images = page.locator('.gallery-grid img');
    const imageCount = await images.count();

    for (let i = 0; i < Math.min(imageCount, 10); i++) {
      const image = images.nth(i);
      await expect(image).toHaveAttribute('alt');
      
      // Check if alt text is meaningful (not just filename)
      const altText = await image.getAttribute('alt');
      expect(altText).not.toMatch(/\.(jpg|jpeg|png|gif|webp)$/i);
      expect(altText.length).toBeGreaterThan(5);
    }

    // Test gallery navigation with keyboard
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    
    // Check if modal or lightbox is accessible
    const modal = page.locator('[role="dialog"], .modal, .lightbox');
    if (await modal.count() > 0) {
      await expect(modal.first()).toHaveAttribute('aria-modal', 'true');
      await expect(modal.first()).toHaveAttribute('role', 'dialog');
    }

    await assertAccessible(page);
  });

  // Registration Flow Accessibility
  test('Registration flow maintains accessibility', async ({ page }) => {
    // Start registration flow
    await page.goto('/tickets');
    await page.waitForLoadState('domcontentloaded');

    // Select a ticket and proceed to registration
    await page.click('.ticket-card:first-child .btn-primary');
    await page.waitForSelector('[data-cart-item]', { timeout: 5000 });

    // Navigate to registration
    await page.click('.floating-cart .btn-primary');
    await page.waitForLoadState('domcontentloaded');

    const accessibility = createAccessibilityTestSuite(page);

    // Test form accessibility
    const formInputs = page.locator('input:not([type="hidden"]), select, textarea');
    const inputCount = await formInputs.count();

    for (let i = 0; i < inputCount; i++) {
      const input = formInputs.nth(i);
      const inputType = await input.getAttribute('type');
      
      // Skip hidden inputs
      if (inputType === 'hidden') continue;

      // Check for proper labeling
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledBy = await input.getAttribute('aria-labelledby');

      if (id) {
        const associatedLabel = page.locator(`label[for="${id}"]`);
        const hasLabel = await associatedLabel.count() > 0;
        
        expect(hasLabel || ariaLabel || ariaLabelledBy).toBeTruthy();
      }

      // Check required field indicators
      const isRequired = await input.getAttribute('required') !== null;
      if (isRequired) {
        const ariaRequired = await input.getAttribute('aria-required');
        expect(ariaRequired).toBe('true');
      }
    }

    // Test error message accessibility
    await page.fill('input[type="email"]', 'invalid-email');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(500);

    const errorMessages = page.locator('[role="alert"], .error-message, .invalid-feedback');
    if (await errorMessages.count() > 0) {
      await expect(errorMessages.first()).toHaveAttribute('role', 'alert');
    }

    await assertAccessible(page);
  });

  // Admin Dashboard Accessibility (if auth available)
  test('Admin dashboard meets accessibility standards', async ({ page }) => {
    // Skip if no admin credentials
    if (!process.env.TEST_ADMIN_PASSWORD) {
      test.skip('Admin credentials not available');
    }

    // Login to admin dashboard
    await page.goto('/admin');
    await page.waitForLoadState('domcontentloaded');

    await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('domcontentloaded');

    const accessibility = createAccessibilityTestSuite(page);

    // Test data table accessibility
    const tables = page.locator('table');
    if (await tables.count() > 0) {
      const table = tables.first();
      
      // Check for proper table headers
      await expect(table.locator('th')).toHaveCount.greaterThan(0);
      
      // Check table caption or summary
      const hasCaption = await table.locator('caption').count() > 0;
      const hasAriaLabel = await table.getAttribute('aria-label');
      const hasAriaLabelledBy = await table.getAttribute('aria-labelledby');
      
      expect(hasCaption || hasAriaLabel || hasAriaLabelledBy).toBeTruthy();
    }

    // Test admin action buttons
    const actionButtons = page.locator('button:has-text("Delete"), button:has-text("Remove")');
    const buttonCount = await actionButtons.count();
    
    for (let i = 0; i < buttonCount; i++) {
      const button = actionButtons.nth(i);
      const ariaLabel = await button.getAttribute('aria-label');
      const title = await button.getAttribute('title');
      
      // Destructive actions should have clear labels
      expect(ariaLabel || title).toBeTruthy();
    }

    await assertAccessible(page);
  });

  // Color Contrast Testing
  test('All pages meet WCAG color contrast requirements', async ({ page }) => {
    const pagesToTest = ['/', '/tickets', '/gallery', '/about', '/artists', '/schedule'];
    
    for (const pagePath of pagesToTest) {
      await page.goto(pagePath);
      await page.waitForLoadState('domcontentloaded');
      
      const accessibility = createAccessibilityTestSuite(page);
      const contrastIssues = await accessibility.checkColorContrast();
      
      // Filter out non-critical contrast issues (background images, etc.)
      const criticalContrastIssues = contrastIssues.filter(issue => 
        parseFloat(issue.contrast) < (issue.minimum === 3.0 ? 3.0 : 4.5)
      );

      if (criticalContrastIssues.length > 0) {
        console.log(`Color contrast issues on ${pagePath}:`, JSON.stringify(criticalContrastIssues, null, 2));
      }

      expect(criticalContrastIssues).toHaveLength(0);
    }
  });

  // Mobile Accessibility Testing
  test('Mobile accessibility compliance across viewports', async ({ page }) => {
    const viewports = [
      { width: 375, height: 667, name: 'iPhone SE' },
      { width: 414, height: 896, name: 'iPhone 11' },
      { width: 768, height: 1024, name: 'iPad' }
    ];

    const pagesToTest = ['/', '/tickets', '/gallery'];

    for (const viewport of viewports) {
      for (const pagePath of pagesToTest) {
        await page.setViewportSize(viewport);
        await page.goto(pagePath);
        await page.waitForLoadState('domcontentloaded');

        const accessibility = createAccessibilityTestSuite(page);
        const mobileIssues = await accessibility.checkMobileAccessibility();

        // Check for critical mobile accessibility issues
        const criticalIssues = mobileIssues.filter(issue => 
          issue.type === 'small-touch-target' || issue.type === 'horizontal-scroll'
        );

        if (criticalIssues.length > 0) {
          console.log(`Mobile accessibility issues on ${pagePath} (${viewport.name}):`, 
            JSON.stringify(criticalIssues, null, 2));
        }

        expect(criticalIssues).toHaveLength(0);
      }
    }
  });

  // Comprehensive Accessibility Report Generation
  test('Generate comprehensive accessibility report', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const accessibility = createAccessibilityTestSuite(page);
    const report = await accessibility.generateAccessibilityReport({
      includeRules: ['wcag2aa']
    });

    // Log report for debugging
    console.log('Accessibility Report Summary:', JSON.stringify(report.summary, null, 2));

    // Assertions based on report
    expect(report.summary.overallCompliance).toBeOneOf(['A', 'AA']);
    expect(report.summary.totalIssues).toBeLessThan(5); // Allow minor issues
    expect(report.summary.failedTests).toBe(0);

    // Verify all test suites ran
    expect(report.tests.axeAudit).toBeDefined();
    expect(report.tests.keyboardNavigation).toBeDefined();
    expect(report.tests.colorContrast).toBeDefined();
    expect(report.tests.semanticStructure).toBeDefined();
    expect(report.tests.mobileAccessibility).toBeDefined();
  });

  // Focus Management Testing
  test('Focus management works correctly throughout application', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Test skip links (if present)
    await page.keyboard.press('Tab');
    const firstFocused = page.locator(':focus');
    const firstFocusedText = await firstFocused.textContent();
    
    if (firstFocusedText?.toLowerCase().includes('skip')) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
      
      // Verify focus moved to main content
      const mainContent = page.locator('main, #main-content, [role="main"]');
      if (await mainContent.count() > 0) {
        const isFocused = await mainContent.first().evaluate(el => 
          document.activeElement === el || el.contains(document.activeElement)
        );
        expect(isFocused).toBeTruthy();
      }
    }

    // Test modal focus management (if modals exist)
    const modalTriggers = page.locator('[data-toggle="modal"], [data-bs-toggle="modal"]');
    if (await modalTriggers.count() > 0) {
      await modalTriggers.first().click();
      await page.waitForTimeout(500);
      
      // Check if focus is trapped in modal
      const modal = page.locator('[role="dialog"], .modal');
      if (await modal.count() > 0) {
        const focusableElements = modal.locator(
          'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        
        if (await focusableElements.count() > 0) {
          // Test focus trap by tabbing through all elements
          const elementCount = await focusableElements.count();
          
          for (let i = 0; i < elementCount + 1; i++) {
            await page.keyboard.press('Tab');
            await page.waitForTimeout(100);
            
            const currentFocus = page.locator(':focus');
            const isInModal = await modal.first().evaluate((modal, focused) => 
              modal.contains(focused), currentFocus.first()
            );
            
            expect(isInModal).toBeTruthy();
          }
        }
      }
    }

    // Test navigation menu focus
    const navToggle = page.locator('[aria-label*="menu"], .navbar-toggler, .menu-toggle');
    if (await navToggle.count() > 0) {
      await navToggle.first().click();
      await page.waitForTimeout(500);
      
      const nav = page.locator('nav, [role="navigation"]');
      const navLinks = nav.locator('a');
      
      if (await navLinks.count() > 0) {
        await navLinks.first().focus();
        const isFocused = await navLinks.first().evaluate(el => 
          document.activeElement === el
        );
        expect(isFocused).toBeTruthy();
      }
    }
  });

  // Screen Reader Compatibility
  test('Screen reader landmarks and ARIA attributes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Test landmark regions
    const landmarks = {
      'main': 'main, [role="main"]',
      'navigation': 'nav, [role="navigation"]',
      'banner': 'header, [role="banner"]',
      'contentinfo': 'footer, [role="contentinfo"]'
    };

    for (const [landmark, selector] of Object.entries(landmarks)) {
      const element = page.locator(selector);
      const count = await element.count();
      
      if (count > 0) {
        // Check for proper ARIA labels on landmarks
        const firstElement = element.first();
        const role = await firstElement.getAttribute('role');
        const ariaLabel = await firstElement.getAttribute('aria-label');
        const ariaLabelledBy = await firstElement.getAttribute('aria-labelledby');
        
        // Landmarks should have proper identification
        if (count > 1) {
          expect(ariaLabel || ariaLabelledBy).toBeTruthy();
        }
      }
    }

    // Test ARIA live regions (if present)
    const liveRegions = page.locator('[aria-live], [role="alert"], [role="status"]');
    const liveCount = await liveRegions.count();
    
    for (let i = 0; i < liveCount; i++) {
      const region = liveRegions.nth(i);
      const ariaLive = await region.getAttribute('aria-live');
      const role = await region.getAttribute('role');
      
      expect(ariaLive || role).toBeOneOf(['polite', 'assertive', 'alert', 'status']);
    }
  });
});

// Utility function to check WCAG compliance levels
function expectWCAGCompliance(results, level = 'AA') {
  const levelMap = {
    'A': ['critical'],
    'AA': ['critical', 'serious'],
    'AAA': ['critical', 'serious', 'moderate']
  };

  const significantViolations = results.violations.filter(violation =>
    levelMap[level].includes(violation.impact)
  );

  if (significantViolations.length > 0) {
    console.log(`WCAG ${level} violations:`, JSON.stringify(significantViolations, null, 2));
  }

  expect(significantViolations).toHaveLength(0);
}

// Fixed: Replace malformed emoji with valid emoji character
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === 'failed') {
    // Generate accessibility report for failed tests
    try {
      const accessibility = createAccessibilityTestSuite(page);
      const report = await accessibility.generateAccessibilityReport();
      
      console.log('🚨 Accessibility test failed. Report:', JSON.stringify(report.summary, null, 2));
      
      // Attach report to test results
      await testInfo.attach('accessibility-report', {
        body: JSON.stringify(report, null, 2),
        contentType: 'application/json'
      });
    } catch (error) {
      console.error('Failed to generate accessibility report:', error.message);
    }
  }
});
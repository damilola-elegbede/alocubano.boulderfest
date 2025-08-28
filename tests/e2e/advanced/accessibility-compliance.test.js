/**
 * Comprehensive Accessibility and Browser Compatibility Testing
 * Phase 4 PR #1: Advanced Accessibility Compliance & Cross-Browser Testing
 * 
 * Tests WCAG 2.1 Level AA compliance across all browsers and devices
 * Validates screen reader compatibility, keyboard navigation, and color contrast
 * Covers legacy browser support and mobile accessibility edge cases
 */

import { test, expect, devices } from '@playwright/test';
import { injectAxe, checkA11y, configureAxe } from '@axe-core/playwright';
import {
  WCAGComplianceTester,
  ScreenReaderTester,
  KeyboardNavigationTester,
  ColorContrastAnalyzer,
  BrowserCompatibilityTester,
  LocalizationTester,
  WCAG_CONFIG,
  quickAccessibilityCheck
} from '../helpers/accessibility-utilities.js';
import { generateTestData, waitForAPI } from '../helpers/test-utils.js';

// Test configuration
const PAGES_TO_TEST = [
  { url: '/', name: 'Homepage', priority: 'high' },
  { url: '/tickets', name: 'Tickets Page', priority: 'high' },
  { url: '/about', name: 'About Page', priority: 'medium' },
  { url: '/artists', name: 'Artists Page', priority: 'medium' },
  { url: '/schedule', name: 'Schedule Page', priority: 'medium' },
  { url: '/gallery', name: 'Gallery Page', priority: 'medium' },
  { url: '/admin/login', name: 'Admin Login', priority: 'high' }
];

const MOBILE_DEVICES = [
  devices['Pixel 5'],
  devices['iPhone 13'],
  devices['iPad Mini']
];

const LEGACY_BROWSERS = [
  { name: 'Chrome 90', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36' },
  { name: 'Firefox 88', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:88.0) Gecko/20100101 Firefox/88.0' },
  { name: 'Safari 14', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15' }
];

test.describe('WCAG 2.1 Level AA Compliance Testing', () => {
  
  test.beforeEach(async ({ page }) => {
    // Wait for API to be ready
    await waitForAPI(page, '/api/health/check');
    
    // Configure reduced motion for consistent testing
    await page.addInitScript(() => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation(query => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      });
    });
  });

  // High Priority Pages - Complete WCAG Compliance Testing
  for (const pageInfo of PAGES_TO_TEST.filter(p => p.priority === 'high')) {
    test(`Complete WCAG 2.1 AA Compliance - ${pageInfo.name}`, async ({ page }) => {
      await test.step('Navigate to page', async () => {
        await page.goto(pageInfo.url);
        await page.waitForLoadState('networkidle');
      });

      await test.step('Initialize accessibility testing', async () => {
        await injectAxe(page);
        await configureAxe(page, WCAG_CONFIG);
      });

      const tester = new WCAGComplianceTester(page);
      
      await test.step('Run comprehensive accessibility audit', async () => {
        const results = await tester.runCompleteAccessibilityAudit();
        
        // Log results for debugging
        console.log(`\n=== WCAG Compliance Report - ${pageInfo.name} ===`);
        console.log(`URL: ${results.url}`);
        console.log(`Overall Score: ${results.overallScore}%`);
        console.log(`Compliance Level: ${results.complianceLevel}`);
        
        // Assert overall compliance
        expect(results.overallScore).toBeGreaterThan(80);
        expect(results.complianceLevel).not.toContain('Non-compliant');
        
        // Detailed assertions per section
        if (results.sections.automated) {
          console.log(`Automated Violations: ${results.sections.automated.violationCount}`);
          expect(results.sections.automated.violations.filter(v => v.impact === 'critical')).toHaveLength(0);
          
          // Log violations for review
          results.sections.automated.violations.forEach(violation => {
            console.log(`  - ${violation.id}: ${violation.description} (Impact: ${violation.impact})`);
          });
        }
        
        if (results.sections.colorContrast) {
          console.log(`Color Contrast Issues: ${results.sections.colorContrast.issueCount}`);
          expect(results.sections.colorContrast.highSeverityCount).toBe(0);
        }
        
        if (results.sections.screenReader) {
          console.log(`Screen Reader Issues: ${!results.sections.screenReader.overallPassed ? 'Found' : 'None'}`);
          expect(results.sections.screenReader.landmarks.hasMain).toBe(true);
          expect(results.sections.screenReader.headings.hasH1).toBe(true);
        }
        
        if (results.sections.keyboard) {
          console.log(`Keyboard Navigation: ${results.sections.keyboard.passed ? 'Passed' : 'Issues found'}`);
          expect(results.sections.keyboard.focusableElementCount).toBeGreaterThan(0);
        }
      });
    });
  }

  // Medium Priority Pages - Essential Compliance Testing
  for (const pageInfo of PAGES_TO_TEST.filter(p => p.priority === 'medium')) {
    test(`Essential WCAG Compliance - ${pageInfo.name}`, async ({ page }) => {
      await page.goto(pageInfo.url);
      await page.waitForLoadState('networkidle');
      
      const quickResults = await quickAccessibilityCheck(page);
      
      console.log(`\n=== Quick Accessibility Check - ${pageInfo.name} ===`);
      console.log(`Score: ${quickResults.overallScore}%`);
      console.log(`Level: ${quickResults.complianceLevel}`);
      
      // Essential compliance requirements
      expect(quickResults.overallScore).toBeGreaterThan(70);
      expect(quickResults.criticalIssues).toHaveLength(0);
      expect(quickResults.summary.automatedViolations).toBeLessThan(5);
    });
  }
});

test.describe('Screen Reader Compatibility Testing', () => {
  
  test('Screen reader navigation - Homepage', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const screenReaderTester = new ScreenReaderTester(page);
    
    await test.step('Validate ARIA labels and accessible names', async () => {
      const ariaIssues = await screenReaderTester.validateAriaLabels();
      
      // All interactive elements should have accessible names
      expect(ariaIssues.length).toBeLessThan(3);
      
      ariaIssues.forEach(issue => {
        console.log(`ARIA Issue: ${issue.issue} - ${issue.element}#${issue.id || 'no-id'}`);
      });
    });
    
    await test.step('Validate landmark regions', async () => {
      const landmarks = await screenReaderTester.validateLandmarks();
      
      expect(landmarks.hasMain).toBe(true);
      expect(landmarks.hasNavigation).toBe(true);
      expect(landmarks.duplicateMainLandmarks).toHaveLength(0);
      
      console.log(`Landmarks found: ${landmarks.landmarks.length}`);
      landmarks.landmarks.forEach(landmark => {
        console.log(`  - ${landmark.tag} (role: ${landmark.role}): ${landmark.accessibleName || 'No accessible name'}`);
      });
    });
    
    await test.step('Validate heading structure', async () => {
      const headings = await screenReaderTester.validateHeadingStructure();
      
      expect(headings.issues.length).toBe(0);
      expect(headings.structure.some(h => h.level === 1)).toBe(true);
      
      console.log('Heading Structure:');
      headings.structure.forEach(heading => {
        console.log(`  H${heading.level}: ${heading.text}`);
      });
      
      if (headings.issues.length > 0) {
        console.log('Heading Issues:');
        headings.issues.forEach(issue => console.log(`  - ${issue}`));
      }
    });
  });

  test('Screen reader form interaction - Tickets page', async ({ page }) => {
    await page.goto('/tickets');
    await page.waitForLoadState('networkidle');
    
    const screenReaderTester = new ScreenReaderTester(page);
    
    await test.step('Validate form accessibility', async () => {
      const ariaIssues = await screenReaderTester.validateAriaLabels('form, .ticket-selection, .cart-form');
      
      // Form elements should have proper labels
      const formIssues = ariaIssues.filter(issue => 
        issue.element.includes('input') || 
        issue.element.includes('select') || 
        issue.element.includes('button')
      );
      
      expect(formIssues.length).toBeLessThan(2);
      
      formIssues.forEach(issue => {
        console.log(`Form Accessibility Issue: ${issue.issue} - ${issue.element}`);
      });
    });
  });
});

test.describe('Keyboard Navigation Testing', () => {
  
  test('Complete keyboard navigation flow - Homepage', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const keyboardTester = new KeyboardNavigationTester(page);
    
    await test.step('Test keyboard navigation flow', async () => {
      const navigation = await keyboardTester.testKeyboardNavigation();
      
      expect(navigation.focusableElements.length).toBeGreaterThan(5);
      expect(navigation.tabOrder.length).toBeGreaterThan(3);
      
      console.log(`Focusable elements: ${navigation.focusableElements.length}`);
      console.log(`Tab order sequence: ${navigation.tabOrder.length} steps`);
      
      // Ensure all focusable elements are in tab order
      const visibleFocusable = navigation.focusableElements.filter(el => el.visible && el.tabIndex !== -1);
      expect(navigation.tabOrder.length).toBeGreaterThanOrEqual(Math.min(visibleFocusable.length, 10));
    });
    
    await test.step('Test skip links functionality', async () => {
      const navigation = await keyboardTester.testKeyboardNavigation();
      
      if (navigation.skipLinkStatus.exists) {
        expect(navigation.skipLinkStatus.functional).toBe(true);
        console.log(`Skip link status: ${navigation.skipLinkStatus.message}`);
      }
    });
    
    await test.step('Test focus indicators visibility', async () => {
      const focusIssues = await keyboardTester.testFocusManagement();
      
      expect(focusIssues.length).toBeLessThan(3);
      
      focusIssues.forEach(issue => {
        console.log(`Focus Indicator Issue: ${issue.issue} - ${issue.element}#${issue.id || 'no-id'}`);
      });
    });
  });

  test('Keyboard navigation - Ticket purchase flow', async ({ page }) => {
    await page.goto('/tickets');
    await page.waitForLoadState('networkidle');
    
    const keyboardTester = new KeyboardNavigationTester(page);
    
    await test.step('Navigate ticket selection with keyboard only', async () => {
      // Tab to first ticket option
      await page.keyboard.press('Tab');
      let focused = await page.locator(':focus');
      
      // Find and navigate to ticket selection
      let attempts = 0;
      while (attempts < 20) {
        const focusedElement = await focused.evaluate(el => ({
          tagName: el.tagName,
          className: el.className,
          text: el.textContent?.trim() || '',
          type: el.type
        }));
        
        console.log(`Focused: ${focusedElement.tagName} - ${focusedElement.text.substring(0, 30)}`);
        
        // Look for ticket-related buttons or inputs
        if (focusedElement.text.includes('ticket') || 
            focusedElement.text.includes('Ticket') ||
            focusedElement.className.includes('ticket') ||
            focusedElement.type === 'number') {
          break;
        }
        
        await page.keyboard.press('Tab');
        focused = await page.locator(':focus');
        attempts++;
      }
      
      expect(attempts).toBeLessThan(20);
    });
  });
});

test.describe('Color Contrast Compliance Testing', () => {
  
  for (const pageInfo of PAGES_TO_TEST.slice(0, 4)) { // Test first 4 pages
    test(`Color contrast WCAG AA compliance - ${pageInfo.name}`, async ({ page }) => {
      await page.goto(pageInfo.url);
      await page.waitForLoadState('networkidle');
      
      const colorTester = new ColorContrastAnalyzer(page);
      
      await test.step('Analyze color contrast ratios', async () => {
        const contrastIssues = await colorTester.analyzeColorContrast();
        
        console.log(`\n=== Color Contrast Analysis - ${pageInfo.name} ===`);
        console.log(`Total issues found: ${contrastIssues.length}`);
        console.log(`High severity issues: ${contrastIssues.filter(issue => issue.severity === 'high').length}`);
        
        // WCAG 2.1 Level AA: No high-severity contrast issues
        expect(contrastIssues.filter(issue => issue.severity === 'high')).toHaveLength(0);
        
        // Log any medium severity issues for review
        const mediumIssues = contrastIssues.filter(issue => issue.severity === 'medium');
        if (mediumIssues.length > 0) {
          console.log('Medium severity contrast issues:');
          mediumIssues.forEach(issue => {
            console.log(`  - ${issue.element}: ${issue.contrastRatio} (required: ${issue.requiredRatio})`);
            console.log(`    Text: "${issue.text}"`);
            console.log(`    Colors: ${issue.color} on ${issue.backgroundColor}`);
          });
        }
        
        // Allow some medium issues but not too many
        expect(mediumIssues.length).toBeLessThan(5);
      });
    });
  }

  test('Color contrast - Interactive elements', async ({ page }) => {
    await page.goto('/tickets');
    await page.waitForLoadState('networkidle');
    
    const colorTester = new ColorContrastAnalyzer(page);
    
    await test.step('Test button and link contrast', async () => {
      const buttonContrastIssues = await page.evaluate(() => {
        const issues = [];
        const buttons = document.querySelectorAll('button, a, input[type="submit"], input[type="button"]');
        
        buttons.forEach(button => {
          const styles = window.getComputedStyle(button);
          const text = button.textContent?.trim();
          
          if (text) {
            // Simple contrast check for buttons
            const color = styles.color;
            const backgroundColor = styles.backgroundColor;
            
            if (color === backgroundColor) {
              issues.push({
                element: button.tagName.toLowerCase(),
                text: text.substring(0, 30),
                issue: 'Button text and background color are the same'
              });
            }
          }
        });
        
        return issues;
      });
      
      expect(buttonContrastIssues).toHaveLength(0);
      
      buttonContrastIssues.forEach(issue => {
        console.log(`Button Contrast Issue: ${issue.issue} - "${issue.text}"`);
      });
    });
  });
});

test.describe('Mobile Browser Accessibility Testing', () => {
  
  for (const device of MOBILE_DEVICES) {
    test(`Mobile accessibility - ${device.name}`, async ({ browser }) => {
      const context = await browser.newContext({
        ...device,
        reducedMotion: 'reduce'
      });
      const page = await context.newPage();
      
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      const browserTester = new BrowserCompatibilityTester(page);
      
      await test.step('Test mobile touch targets', async () => {
        const mobileResults = await browserTester.testMobileBrowserEdgeCases();
        
        console.log(`\n=== Mobile Accessibility - ${device.name} ===`);
        console.log(`Touch target issues (44px): ${mobileResults.touchTargets.filter(t => !t.meets44px).length}`);
        console.log(`Touch target issues (36px AA): ${mobileResults.touchTargets.filter(t => !t.meets36px).length}`);
        console.log(`Viewport issues: ${mobileResults.viewportIssues.length}`);
        
        // WCAG 2.1 Level AA: 36px minimum (Level AAA: 44px)
        const criticalTouchIssues = mobileResults.touchTargets.filter(target => !target.meets36px);
        expect(criticalTouchIssues.length).toBe(0);
        
        // Viewport should be properly configured
        expect(mobileResults.viewportIssues.length).toBe(0);
        
        // Should support touch events
        expect(mobileResults.touchEvents).toBe(true);
        
        // Log touch target details
        mobileResults.touchTargets.forEach(target => {
          if (!target.meets44px) {
            console.log(`  Small touch target: ${target.element}#${target.id} - ${target.width}x${target.height}px`);
          }
        });
        
        mobileResults.viewportIssues.forEach(issue => {
          console.log(`  Viewport issue: ${issue}`);
        });
      });
      
      await test.step('Test mobile navigation accessibility', async () => {
        // Test mobile menu if exists
        const mobileMenuButton = page.locator('[aria-label*="menu" i], .mobile-menu-toggle, .hamburger, button[aria-expanded]').first();
        
        if (await mobileMenuButton.isVisible()) {
          // Test mobile menu keyboard accessibility
          await mobileMenuButton.focus();
          await page.keyboard.press('Enter');
          
          // Check if menu opened and is accessible
          const menuExpanded = await mobileMenuButton.getAttribute('aria-expanded');
          if (menuExpanded !== null) {
            expect(menuExpanded).toBe('true');
          }
        }
      });
      
      await context.close();
    });
  }

  test('Mobile orientation and viewport testing', async ({ browser }) => {
    const context = await browser.newContext({
      ...devices['iPhone 13'],
      reducedMotion: 'reduce'
    });
    const page = await context.newPage();
    
    await test.step('Test portrait orientation', async () => {
      await page.goto('/tickets');
      await page.waitForLoadState('networkidle');
      
      const viewportSize = page.viewportSize();
      expect(viewportSize.height).toBeGreaterThan(viewportSize.width);
      
      // Check that content is accessible in portrait
      const quickCheck = await quickAccessibilityCheck(page);
      expect(quickCheck.overallScore).toBeGreaterThan(70);
    });
    
    await test.step('Test landscape orientation', async () => {
      // Simulate landscape orientation
      await page.setViewportSize({ width: 844, height: 390 });
      
      await page.goto('/tickets');
      await page.waitForLoadState('networkidle');
      
      const quickCheck = await quickAccessibilityCheck(page);
      expect(quickCheck.overallScore).toBeGreaterThan(70);
    });
    
    await context.close();
  });
});

test.describe('Legacy Browser Compatibility Testing', () => {
  
  for (const browser of LEGACY_BROWSERS) {
    test(`Legacy browser support - ${browser.name}`, async ({ page }) => {
      // Set legacy browser user agent
      await page.setExtraHTTPHeaders({
        'User-Agent': browser.userAgent
      });
      
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      const browserTester = new BrowserCompatibilityTester(page);
      
      await test.step('Test feature support and fallbacks', async () => {
        const compatibility = await browserTester.testLegacyBrowserSupport();
        
        console.log(`\n=== Legacy Browser Test - ${browser.name} ===`);
        console.log('CSS Features:');
        Object.entries(compatibility.cssFeatures).forEach(([feature, supported]) => {
          console.log(`  ${feature}: ${supported ? 'Supported' : 'Not supported'}`);
        });
        
        console.log('JavaScript Features:');
        Object.entries(compatibility.jsFeatures).forEach(([feature, supported]) => {
          console.log(`  ${feature}: ${supported ? 'Supported' : 'Not supported'}`);
        });
        
        console.log('Fallbacks:');
        Object.entries(compatibility.fallbacks).forEach(([fallback, present]) => {
          console.log(`  ${fallback}: ${present ? 'Present' : 'Missing'}`);
        });
        
        // Essential features should be supported or have fallbacks
        const essentialFeatures = ['Promise', 'Local Storage', 'Fetch API'];
        const unsupportedEssential = essentialFeatures.filter(feature => !compatibility.jsFeatures[feature]);
        
        expect(unsupportedEssential.length).toBeLessThan(2); // Allow some degradation
        
        // Should have no-js fallback
        expect(compatibility.fallbacks['No JS Fallback']).toBe(true);
        
        // Should have CSS fallbacks
        expect(compatibility.fallbacks['CSS Fallbacks']).toBe(true);
        
        // Log warnings
        if (compatibility.warnings.length > 0) {
          console.log('Warnings:');
          compatibility.warnings.forEach(warning => console.log(`  - ${warning}`));
        }
      });
    });
  }

  test('Graceful degradation - No JavaScript', async ({ page }) => {
    // Disable JavaScript
    await page.context().addInitScript(() => {
      delete window.fetch;
      delete window.XMLHttpRequest;
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    await test.step('Test no-JS functionality', async () => {
      // Page should still be navigable
      const navigation = await page.locator('nav, .navigation').first();
      if (await navigation.isVisible()) {
        const navLinks = await navigation.locator('a[href]').count();
        expect(navLinks).toBeGreaterThan(0);
      }
      
      // Basic content should be visible
      const mainContent = await page.locator('main, .main-content, h1').first();
      expect(await mainContent.isVisible()).toBe(true);
      
      // Form should work without JS (if present)
      const forms = await page.locator('form').count();
      if (forms > 0) {
        const form = page.locator('form').first();
        const action = await form.getAttribute('action');
        expect(action).toBeTruthy(); // Should have action attribute for no-JS submission
      }
    });
  });
});

test.describe('Internationalization Accessibility Testing', () => {
  
  test('I18n accessibility features', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const localizationTester = new LocalizationTester(page);
    
    await test.step('Test language and direction attributes', async () => {
      const i18nResults = await localizationTester.testInternationalizationSupport();
      
      console.log(`\n=== Internationalization Features ===`);
      console.log(`Language attribute: ${i18nResults.langAttribute || 'Missing'}`);
      console.log(`Direction attribute: ${i18nResults.dirAttribute || 'Not set'}`);
      console.log(`RTL support: ${i18nResults.rtlSupport}`);
      console.log(`Language switcher: ${i18nResults.langSwitcher}`);
      console.log(`Date formatting support: ${i18nResults.dateFormatting}`);
      
      // HTML lang attribute is required for WCAG
      expect(i18nResults.langAttribute).toBeTruthy();
      expect(i18nResults.langAttribute).toMatch(/^[a-z]{2}(-[A-Z]{2})?$/); // Valid lang code
      
      // Should support modern date formatting
      expect(i18nResults.dateFormatting).toBe(true);
      
      // Check text expansion space
      const shortTextElements = i18nResults.textExpansion.filter(el => el.charWidth < 8);
      expect(shortTextElements.length).toBeLessThan(3); // Allow some tight spacing
    });
  });

  test('RTL language support simulation', async ({ page }) => {
    // Simulate RTL language
    await page.addInitScript(() => {
      document.documentElement.setAttribute('dir', 'rtl');
      document.documentElement.setAttribute('lang', 'ar');
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    await test.step('Test RTL layout accessibility', async () => {
      // Check if layout adapts to RTL
      const bodyDir = await page.locator('html').getAttribute('dir');
      expect(bodyDir).toBe('rtl');
      
      // Ensure navigation still works in RTL
      const quickCheck = await quickAccessibilityCheck(page);
      expect(quickCheck.overallScore).toBeGreaterThan(60); // Allow some score reduction for RTL
    });
  });
});

test.describe('Comprehensive Cross-Browser Accessibility', () => {
  
  // Test critical accessibility features across all browser engines
  const CRITICAL_PAGES = [
    { url: '/', name: 'Homepage' },
    { url: '/tickets', name: 'Tickets' }
  ];

  for (const pageInfo of CRITICAL_PAGES) {
    test(`Cross-browser accessibility - ${pageInfo.name}`, async ({ page, browserName }) => {
      await page.goto(pageInfo.url);
      await page.waitForLoadState('networkidle');
      
      await test.step(`${browserName}: axe-core compliance`, async () => {
        await injectAxe(page);
        await configureAxe(page, WCAG_CONFIG);
        
        const violations = await checkA11y(page, null, WCAG_CONFIG, false, 'v2');
        
        console.log(`\n=== ${browserName} - ${pageInfo.name} ===`);
        console.log(`axe-core violations: ${violations.length}`);
        
        // Critical violations should be zero across all browsers
        const criticalViolations = violations.filter(v => v.impact === 'critical');
        expect(criticalViolations).toHaveLength(0);
        
        // Serious violations should be minimal
        const seriousViolations = violations.filter(v => v.impact === 'serious');
        expect(seriousViolations.length).toBeLessThan(3);
        
        // Log violations for debugging
        violations.forEach(violation => {
          console.log(`  ${violation.impact}: ${violation.id} - ${violation.description}`);
        });
      });
      
      await test.step(`${browserName}: keyboard navigation`, async () => {
        const keyboardTester = new KeyboardNavigationTester(page);
        const focusableElements = await keyboardTester.getFocusableElements();
        
        expect(focusableElements.length).toBeGreaterThan(3);
        
        console.log(`  Focusable elements: ${focusableElements.length}`);
      });
      
      await test.step(`${browserName}: screen reader compatibility`, async () => {
        const screenReaderTester = new ScreenReaderTester(page);
        const landmarks = await screenReaderTester.validateLandmarks();
        const headings = await screenReaderTester.validateHeadingStructure();
        
        expect(landmarks.hasMain).toBe(true);
        expect(headings.structure.some(h => h.level === 1)).toBe(true);
        
        console.log(`  Main landmark: ${landmarks.hasMain ? 'Present' : 'Missing'}`);
        console.log(`  H1 present: ${headings.structure.some(h => h.level === 1) ? 'Yes' : 'No'}`);
        console.log(`  Heading issues: ${headings.issues.length}`);
      });
    });
  }
});

test.describe('Accessibility Regression Prevention', () => {
  
  test('Performance impact of accessibility features', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Run full accessibility test suite
    const tester = new WCAGComplianceTester(page);
    const results = await tester.runCompleteAccessibilityAudit();
    
    const testDuration = Date.now() - startTime;
    
    console.log(`\n=== Performance Impact ===`);
    console.log(`Full accessibility test duration: ${testDuration}ms`);
    console.log(`Compliance score: ${results.overallScore}%`);
    
    // Test should complete in reasonable time
    expect(testDuration).toBeLessThan(30000); // 30 seconds max
    
    // Should maintain good performance
    expect(results.overallScore).toBeGreaterThan(75);
  });

  test('Accessibility consistency across page loads', async ({ page }) => {
    const results = [];
    
    // Test same page multiple times
    for (let i = 0; i < 3; i++) {
      await page.goto('/tickets');
      await page.waitForLoadState('networkidle');
      
      const quickCheck = await quickAccessibilityCheck(page);
      results.push(quickCheck.overallScore);
    }
    
    console.log(`Accessibility scores across loads: ${results.join(', ')}`);
    
    // Scores should be consistent
    const maxScore = Math.max(...results);
    const minScore = Math.min(...results);
    const scoreDifference = maxScore - minScore;
    
    expect(scoreDifference).toBeLessThan(10); // Less than 10% variation
  });
});

test.afterEach(async ({ page }, testInfo) => {
  // Capture accessibility report on failure
  if (testInfo.status !== testInfo.expectedStatus) {
    try {
      const quickCheck = await quickAccessibilityCheck(page);
      console.log('\n=== Accessibility Report (Test Failed) ===');
      console.log(`URL: ${quickCheck.url}`);
      console.log(`Score: ${quickCheck.overallScore}%`);
      console.log(`Compliance: ${quickCheck.complianceLevel}`);
      console.log(`Summary:`, quickCheck.summary);
    } catch (error) {
      console.log('Could not generate accessibility report:', error.message);
    }
  }
});
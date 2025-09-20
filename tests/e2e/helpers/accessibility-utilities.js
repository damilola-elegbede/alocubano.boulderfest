/**
 * Accessibility Testing Utilities for A Lo Cubano Boulder Fest
 * Provides comprehensive accessibility testing tools with WCAG compliance validation
 */

import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';

/**
 * Accessibility Testing Utilities Class
 */
export class AccessibilityUtilities {
  constructor(page) {
    this.page = page;
    this.axeBuilder = null;
  }

  /**
   * Initialize axe-core for accessibility testing
   */
  async initialize() {
    this.axeBuilder = new AxeBuilder({ page: this.page });

    // Configure axe-core with comprehensive rule sets
    this.axeBuilder.withTags([
      'wcag2a',
      'wcag2aa',
      'wcag21a',
      'wcag21aa',
      'best-practice'
    ]);

    // Include testing for dynamically added content
    this.axeBuilder.include('body');

    return this.axeBuilder;
  }

  /**
   * Run comprehensive accessibility audit on current page
   * @param {Object} options - Axe configuration options
   * @returns {Object} Accessibility audit results
   */
  async runFullAccessibilityAudit(options = {}) {
    await this.initialize();

    // Allow time for dynamic content to load
    await this.page.waitForLoadState('networkidle');

    // Configure specific rules if needed
    if (options.excludeRules) {
      this.axeBuilder.disableRules(options.excludeRules);
    }

    if (options.includeRules) {
      this.axeBuilder.withRules(options.includeRules);
    }

    // Run the audit
    const results = await this.axeBuilder.analyze();

    // Process and return results
    return {
      violations: results.violations,
      passes: results.passes,
      incomplete: results.incomplete,
      inapplicable: results.inapplicable,
      summary: this._generateSummary(results),
      wcagLevel: this._assessWCAGCompliance(results)
    };
  }

  /**
   * Check for keyboard navigation accessibility
   */
  async checkKeyboardNavigation() {
    const issues = [];

    // Check for focusable elements
    const focusableElements = await this.page.locator(
      'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ).all();

    // Test tab navigation
    for (const element of focusableElements) {
      try {
        await element.focus();

        // Check if element has visible focus indicator
        const hasFocusStyle = await this._checkFocusIndicator(element);
        if (!hasFocusStyle) {
          const tagName = await element.evaluate(el => el.tagName);
          const id = await element.getAttribute('id');
          issues.push({
            type: 'missing-focus-indicator',
            element: `${tagName}${id ? `#${id}` : ''}`,
            message: 'Element lacks visible focus indicator'
          });
        }

        // Check for keyboard traps
        await this.page.keyboard.press('Tab');
        const newFocused = await this.page.locator(':focus').first();

        if (await newFocused.isVisible()) {
          // Verify focus moved appropriately
          const isSameElement = await element.evaluate(
            (el, newEl) => el === newEl,
            newFocused
          );

          if (isSameElement && focusableElements.indexOf(element) < focusableElements.length - 1) {
            issues.push({
              type: 'keyboard-trap',
              element: tagName,
              message: 'Potential keyboard trap detected'
            });
          }
        }

      } catch (error) {
        console.warn('Keyboard navigation check failed for element:', error.message);
      }
    }

    return issues;
  }

  /**
   * Check color contrast compliance
   */
  async checkColorContrast() {
    const contrastIssues = [];

    // Get all text elements
    const textElements = await this.page.locator('*:has-text(/\\S/)').all();

    for (const element of textElements.slice(0, 50)) { // Limit to prevent timeout
      try {
        const styles = await element.evaluate((el) => {
          const computed = window.getComputedStyle(el);
          return {
            color: computed.color,
            backgroundColor: computed.backgroundColor,
            fontSize: computed.fontSize,
            fontWeight: computed.fontWeight
          };
        });

        const contrast = await this._calculateContrast(styles.color, styles.backgroundColor);
        const isLargeText = this._isLargeText(styles.fontSize, styles.fontWeight);
        const minRatio = isLargeText ? 3.0 : 4.5;

        if (contrast < minRatio) {
          const tagName = await element.evaluate(el => el.tagName);
          contrastIssues.push({
            type: 'insufficient-contrast',
            element: tagName,
            contrast: contrast.toFixed(2),
            minimum: minRatio,
            colors: {
              foreground: styles.color,
              background: styles.backgroundColor
            }
          });
        }

      } catch (error) {
        // Skip elements that can't be analyzed
        continue;
      }
    }

    return contrastIssues;
  }

  /**
   * Check for ARIA attributes and semantic HTML usage
   */
  async checkSemanticStructure() {
    const issues = [];

    // Check for proper heading hierarchy
    const headings = await this.page.locator('h1, h2, h3, h4, h5, h6').all();
    let previousLevel = 0;

    for (const heading of headings) {
      const tagName = await heading.evaluate(el => el.tagName);
      const currentLevel = parseInt(tagName.charAt(1));

      if (currentLevel > previousLevel + 1) {
        issues.push({
          type: 'heading-hierarchy-skip',
          element: tagName,
          message: `Heading level skipped from h${previousLevel} to ${tagName}`
        });
      }
      previousLevel = currentLevel;
    }

    // Check for missing alt text on images
    const images = await this.page.locator('img').all();
    for (const img of images) {
      const alt = await img.getAttribute('alt');
      const role = await img.getAttribute('role');

      if (alt === null && role !== 'presentation') {
        const src = await img.getAttribute('src');
        issues.push({
          type: 'missing-alt-text',
          element: 'img',
          src: src?.substring(0, 50) + '...',
          message: 'Image missing alt attribute'
        });
      }
    }

    // Check for form labels
    const inputs = await this.page.locator('input:not([type="hidden"]), select, textarea').all();
    for (const input of inputs) {
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledBy = await input.getAttribute('aria-labelledby');

      if (id) {
        const label = await this.page.locator(`label[for="${id}"]`).count();
        if (label === 0 && !ariaLabel && !ariaLabelledBy) {
          const type = await input.getAttribute('type');
          issues.push({
            type: 'missing-form-label',
            element: `input[type="${type}"]`,
            message: 'Form input missing proper label'
          });
        }
      }
    }

    return issues;
  }

  /**
   * Check mobile accessibility features
   */
  async checkMobileAccessibility() {
    const issues = [];

    // Check touch target sizes
    const touchTargets = await this.page.locator('a, button, input, select').all();

    for (const target of touchTargets) {
      const boundingBox = await target.boundingBox();
      if (boundingBox) {
        const minSize = 44; // WCAG minimum touch target size
        if (boundingBox.width < minSize || boundingBox.height < minSize) {
          const tagName = await target.evaluate(el => el.tagName);
          issues.push({
            type: 'small-touch-target',
            element: tagName,
            size: `${Math.round(boundingBox.width)}x${Math.round(boundingBox.height)}px`,
            minimum: `${minSize}x${minSize}px`,
            message: 'Touch target smaller than recommended minimum'
          });
        }
      }
    }

    // Check for horizontal scrolling on mobile viewport
    await this.page.setViewportSize({ width: 375, height: 667 }); // iPhone SE size
    await this.page.waitForTimeout(500);

    const hasHorizontalScroll = await this.page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    if (hasHorizontalScroll) {
      issues.push({
        type: 'horizontal-scroll',
        message: 'Page requires horizontal scrolling on mobile viewport'
      });
    }

    return issues;
  }

  /**
   * Assert that page meets WCAG AA compliance
   * @param {Object} options - Testing options
   */
  async assertWCAGCompliance(options = {}) {
    const results = await this.runFullAccessibilityAudit(options);

    // Filter critical violations
    const criticalViolations = results.violations.filter(violation =>
      violation.impact === 'critical' || violation.impact === 'serious'
    );

    if (criticalViolations.length > 0) {
      const errorMessage = this._formatViolationsMessage(criticalViolations);
      expect.soft(criticalViolations).toHaveLength(0);
      throw new Error(`WCAG AA compliance failed:\n${errorMessage}`);
    }

    return results;
  }

  /**
   * Generate comprehensive accessibility report
   * @param {Object} options - Report options
   */
  async generateAccessibilityReport(options = {}) {
    const report = {
      timestamp: new Date().toISOString(),
      url: this.page.url(),
      viewport: await this.page.viewportSize(),
      tests: {}
    };

    // Run all accessibility tests
    try {
      report.tests.axeAudit = await this.runFullAccessibilityAudit(options);
    } catch (error) {
      report.tests.axeAudit = { error: error.message };
    }

    try {
      report.tests.keyboardNavigation = await this.checkKeyboardNavigation();
    } catch (error) {
      report.tests.keyboardNavigation = { error: error.message };
    }

    try {
      report.tests.colorContrast = await this.checkColorContrast();
    } catch (error) {
      report.tests.colorContrast = { error: error.message };
    }

    try {
      report.tests.semanticStructure = await this.checkSemanticStructure();
    } catch (error) {
      report.tests.semanticStructure = { error: error.message };
    }

    try {
      report.tests.mobileAccessibility = await this.checkMobileAccessibility();
    } catch (error) {
      report.tests.mobileAccessibility = { error: error.message };
    }

    // Generate summary
    report.summary = this._generateReportSummary(report);

    return report;
  }

  // Private helper methods

  async _checkFocusIndicator(element) {
    return await element.evaluate((el) => {
      // Store original styles before focusing
      const originalStyles = window.getComputedStyle(el);
      const originalOutline = originalStyles.outline;
      const originalOutlineWidth = originalStyles.outlineWidth;
      const originalBoxShadow = originalStyles.boxShadow;
      const originalBorder = originalStyles.border;

      // Focus the element
      el.focus();

      // Get styles after focus (getComputedStyle doesn't support pseudo-class selectors)
      const focusedStyles = window.getComputedStyle(el);

      // Check for visible focus indicators
      return (
        focusedStyles.outline !== 'none' ||
        focusedStyles.outlineWidth !== '0px' ||
        focusedStyles.boxShadow !== 'none' ||
        focusedStyles.border !== originalBorder || // border changed on focus
        focusedStyles.outline !== originalOutline || // outline changed on focus
        focusedStyles.outlineWidth !== originalOutlineWidth || // outline width changed
        focusedStyles.boxShadow !== originalBoxShadow // box shadow changed
      );
    });
  }

  _calculateContrast(foreground, background) {
    const parseColor = (color) => {
      // Fixed RGB parser to support rgba() with proper regex
      const match = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (match) {
        return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
      }

      // Handle named colors (basic set)
      const namedColors = {
        'black': [0, 0, 0],
        'white': [255, 255, 255],
        'red': [255, 0, 0],
        'green': [0, 128, 0],
        'blue': [0, 0, 255]
      };

      return namedColors[color.toLowerCase()] || [128, 128, 128]; // Default gray
    };

    const getLuminance = (rgb) => {
      const [r, g, b] = rgb.map(c => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const fgRgb = parseColor(foreground);
    const bgRgb = parseColor(background);

    const fgLuminance = getLuminance(fgRgb);
    const bgLuminance = getLuminance(bgRgb);

    const lighter = Math.max(fgLuminance, bgLuminance);
    const darker = Math.min(fgLuminance, bgLuminance);

    return (lighter + 0.05) / (darker + 0.05);
  }

  _isLargeText(fontSize, fontWeight) {
    const size = parseFloat(fontSize);
    const weight = parseInt(fontWeight) || 400;

    // Fixed WCAG large text thresholds to 24px regular or 19px bold
    if (weight >= 700) { // Bold text
      return size >= 19; // 19px for bold
    } else {
      return size >= 24; // 24px for regular
    }
  }

  _generateSummary(results) {
    return {
      totalViolations: results.violations.length,
      criticalIssues: results.violations.filter(v => v.impact === 'critical').length,
      seriousIssues: results.violations.filter(v => v.impact === 'serious').length,
      moderateIssues: results.violations.filter(v => v.impact === 'moderate').length,
      minorIssues: results.violations.filter(v => v.impact === 'minor').length,
      totalPasses: results.passes.length,
      incompleteTests: results.incomplete.length
    };
  }

  _assessWCAGCompliance(results) {
    const criticalCount = results.violations.filter(v => v.impact === 'critical').length;
    const seriousCount = results.violations.filter(v => v.impact === 'serious').length;

    if (criticalCount === 0 && seriousCount === 0) {
      return 'AA'; // Meets WCAG AA
    } else if (criticalCount === 0) {
      return 'A'; // Meets WCAG A
    } else {
      return 'Non-compliant';
    }
  }

  _formatViolationsMessage(violations) {
    return violations.map(violation => {
      const nodeInfo = violation.nodes.map(node =>
        `  - ${node.html.substring(0, 100)}...`
      ).join('\n');

      return `${violation.id} (${violation.impact}):\n${violation.description}\n${nodeInfo}`;
    }).join('\n\n');
  }

  _generateReportSummary(report) {
    const summary = {
      overallCompliance: 'Unknown',
      totalIssues: 0,
      passedTests: 0,
      failedTests: 0
    };

    // Count issues across all test types
    Object.values(report.tests).forEach(test => {
      if (test.error) {
        summary.failedTests++;
      } else if (Array.isArray(test)) {
        summary.totalIssues += test.length;
        summary.passedTests++;
      } else if (test.violations) {
        summary.totalIssues += test.violations.length;
        summary.passedTests++;
      } else {
        summary.passedTests++;
      }
    });

    // Determine overall compliance
    if (report.tests.axeAudit && report.tests.axeAudit.wcagLevel) {
      summary.overallCompliance = report.tests.axeAudit.wcagLevel;
    }

    return summary;
  }

  /**
   * ES6 feature detection helper using Function constructor instead of eval()
   * @param {string} code - Code to test
   */
  _testES6Feature(code) {
    try {
      // Fixed: Replace eval() with Function constructor for ES6 feature detection
      new Function(code);
      return true;
    } catch (e) {
      return false;
    }
  }
}

/**
 * Utility function to create accessibility test suite
 * @param {Object} page - Playwright page object
 * @returns {AccessibilityUtilities} Configured accessibility utilities instance
 */
export function createAccessibilityTestSuite(page) {
  return new AccessibilityUtilities(page);
}

/**
 * Quick accessibility assertion for common use cases
 * @param {Object} page - Playwright page object
 * @param {Object} options - Test options
 */
export async function assertAccessible(page, options = {}) {
  const utils = new AccessibilityUtilities(page);
  return await utils.assertWCAGCompliance(options);
}

/**
 * Generate a comprehensive accessibility report for debugging
 * @param {Object} page - Playwright page object
 * @param {Object} options - Report options
 */
export async function generateAccessibilityReport(page, options = {}) {
  const utils = new AccessibilityUtilities(page);
  return await utils.generateAccessibilityReport(options);
}
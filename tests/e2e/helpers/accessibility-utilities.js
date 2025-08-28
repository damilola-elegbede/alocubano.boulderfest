/**
 * Accessibility Testing Utilities
 * WCAG 2.1 Level AA Compliance Testing Helpers
 */

import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * WCAG 2.1 Level AA Configuration for axe-core
 */
export const WCAG_CONFIG = {
  // Focus on WCAG 2.1 Level AA guidelines
  tags: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'],
  
  // Custom rules configuration
  rules: {
    // Color contrast - AA standard requires 4.5:1 for normal text, 3:1 for large text
    'color-contrast': { enabled: true },
    'color-contrast-enhanced': { enabled: false }, // AAA requirement
    
    // Keyboard accessibility
    'keyboard': { enabled: true },
    'focus-order-semantics': { enabled: true },
    'tabindex': { enabled: true },
    
    // Screen reader compatibility
    'aria-allowed-attr': { enabled: true },
    'aria-required-attr': { enabled: true },
    'aria-valid-attr-value': { enabled: true },
    'aria-valid-attr': { enabled: true },
    
    // Form accessibility
    'label': { enabled: true },
    'form-field-multiple-labels': { enabled: true },
    
    // Image accessibility
    'image-alt': { enabled: true },
    'object-alt': { enabled: true },
    
    // Page structure
    'page-has-heading-one': { enabled: true },
    'heading-order': { enabled: true },
    'landmark-one-main': { enabled: true },
    'region': { enabled: true },
    
    // Navigation
    'skip-link': { enabled: true },
    'bypass': { enabled: true },
    
    // Mobile accessibility
    'target-size': { enabled: true }, // 44px minimum touch target
    'meta-viewport': { enabled: true },
    
    // Language and internationalization
    'html-has-lang': { enabled: true },
    'valid-lang': { enabled: true }
  }
};

/**
 * Screen Reader Testing Utilities
 */
export class ScreenReaderTester {
  constructor(page) {
    this.page = page;
  }

  /**
   * Test aria-label and aria-describedby attributes
   */
  async validateAriaLabels(selector = 'body') {
    const issues = await this.page.evaluate((sel) => {
      const problems = [];
      const container = sel ? document.querySelector(sel) : document;
      
      // Check for elements that should have aria-labels
      const interactiveElements = container.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])');
      
      interactiveElements.forEach(el => {
        const hasVisibleText = el.textContent?.trim();
        const hasAriaLabel = el.getAttribute('aria-label');
        const hasAriaLabelledby = el.getAttribute('aria-labelledby');
        const hasTitle = el.getAttribute('title');
        const associatedLabel = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
        
        if (!hasVisibleText && !hasAriaLabel && !hasAriaLabelledby && !hasTitle && !associatedLabel) {
          problems.push({
            element: el.tagName.toLowerCase(),
            id: el.id,
            class: el.className,
            issue: 'Missing accessible name - no visible text, aria-label, or associated label'
          });
        }
      });
      
      return problems;
    }, selector);
    
    return issues;
  }

  /**
   * Test landmark regions for screen reader navigation
   */
  async validateLandmarks() {
    const landmarks = await this.page.evaluate(() => {
      const landmarkElements = document.querySelectorAll('main, nav, aside, header, footer, section, [role="main"], [role="navigation"], [role="complementary"], [role="banner"], [role="contentinfo"]');
      const results = {
        hasMain: false,
        hasNavigation: false,
        landmarks: [],
        duplicateMainLandmarks: []
      };
      
      const mainElements = [];
      
      landmarkElements.forEach(el => {
        const role = el.getAttribute('role') || el.tagName.toLowerCase();
        const accessibleName = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || '';
        
        results.landmarks.push({
          tag: el.tagName.toLowerCase(),
          role: role,
          accessibleName: accessibleName,
          hasAccessibleName: !!accessibleName
        });
        
        if (role === 'main' || el.tagName.toLowerCase() === 'main') {
          results.hasMain = true;
          mainElements.push(el);
        }
        
        if (role === 'navigation' || el.tagName.toLowerCase() === 'nav') {
          results.hasNavigation = true;
        }
      });
      
      if (mainElements.length > 1) {
        results.duplicateMainLandmarks = mainElements.map(el => ({
          tag: el.tagName.toLowerCase(),
          id: el.id,
          className: el.className
        }));
      }
      
      return results;
    });
    
    return landmarks;
  }

  /**
   * Test heading structure for screen readers
   */
  async validateHeadingStructure() {
    const headingStructure = await this.page.evaluate(() => {
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]');
      const structure = [];
      const issues = [];
      
      headings.forEach((heading, index) => {
        const level = heading.tagName ? parseInt(heading.tagName[1]) : parseInt(heading.getAttribute('aria-level') || '1');
        const text = heading.textContent?.trim();
        
        structure.push({
          level: level,
          text: text,
          id: heading.id,
          isEmpty: !text
        });
        
        if (!text) {
          issues.push(`Empty heading at position ${index + 1}`);
        }
        
        if (index > 0) {
          const prevLevel = structure[index - 1].level;
          if (level > prevLevel + 1) {
            issues.push(`Heading level skip: h${prevLevel} to h${level} at position ${index + 1}`);
          }
        }
      });
      
      const hasH1 = structure.some(h => h.level === 1);
      if (!hasH1) {
        issues.push('No H1 heading found on page');
      }
      
      const multipleH1s = structure.filter(h => h.level === 1).length;
      if (multipleH1s > 1) {
        issues.push(`Multiple H1 headings found: ${multipleH1s}`);
      }
      
      return { structure, issues };
    });
    
    return headingStructure;
  }
}

/**
 * Keyboard Navigation Testing Utilities
 */
export class KeyboardNavigationTester {
  constructor(page) {
    this.page = page;
  }

  /**
   * Test complete keyboard navigation flow
   */
  async testKeyboardNavigation() {
    const results = {
      focusableElements: [],
      tabOrder: [],
      trapIssues: [],
      skipLinkStatus: null
    };
    
    // Get all focusable elements
    results.focusableElements = await this.getFocusableElements();
    
    // Test tab order
    results.tabOrder = await this.testTabOrder();
    
    // Test skip links
    results.skipLinkStatus = await this.testSkipLinks();
    
    // Test focus management
    await this.testFocusManagement();
    
    return results;
  }

  /**
   * Get all focusable elements on the page
   */
  async getFocusableElements() {
    return await this.page.evaluate(() => {
      const focusableSelectors = [
        'a[href]',
        'button',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
        'iframe',
        'object',
        'embed',
        'area[href]',
        'audio[controls]',
        'video[controls]',
        '[contenteditable]'
      ];
      
      const elements = document.querySelectorAll(focusableSelectors.join(', '));
      
      return Array.from(elements).map((el, index) => ({
        index,
        tagName: el.tagName.toLowerCase(),
        type: el.type,
        id: el.id,
        className: el.className,
        tabIndex: el.tabIndex,
        disabled: el.disabled,
        ariaHidden: el.getAttribute('aria-hidden'),
        visible: el.offsetParent !== null,
        accessibleName: el.getAttribute('aria-label') || el.textContent?.trim() || el.value || el.alt || ''
      })).filter(el => el.visible && el.ariaHidden !== 'true');
    });
  }

  /**
   * Test tab order and focus sequence
   */
  async testTabOrder() {
    const tabOrder = [];
    
    // Start from the beginning
    await this.page.keyboard.press('Tab');
    
    for (let i = 0; i < 50; i++) { // Limit to prevent infinite loops
      const focusedElement = await this.page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        
        return {
          tagName: el.tagName.toLowerCase(),
          id: el.id,
          className: el.className,
          type: el.type,
          tabIndex: el.tabIndex,
          accessibleName: el.getAttribute('aria-label') || el.textContent?.trim() || el.value || el.alt || '',
          boundingRect: el.getBoundingClientRect()
        };
      });
      
      if (!focusedElement) break;
      
      tabOrder.push({
        step: i + 1,
        element: focusedElement
      });
      
      await this.page.keyboard.press('Tab');
      
      // Break if we've cycled back to the first element
      if (i > 0 && tabOrder[0].element.id && focusedElement.id === tabOrder[0].element.id) {
        break;
      }
    }
    
    return tabOrder;
  }

  /**
   * Test skip links functionality
   */
  async testSkipLinks() {
    const skipLinks = await this.page.evaluate(() => {
      const links = document.querySelectorAll('a[href^="#"]');
      return Array.from(links).map(link => ({
        href: link.href,
        text: link.textContent?.trim(),
        isVisible: link.offsetParent !== null,
        target: link.href.split('#')[1]
      })).filter(link => link.text && (link.text.toLowerCase().includes('skip') || link.text.toLowerCase().includes('main')));
    });
    
    if (skipLinks.length === 0) {
      return { exists: false, functional: false, message: 'No skip links found' };
    }
    
    // Test the first skip link
    const firstSkipLink = skipLinks[0];
    
    try {
      // Tab to make skip link visible if it's hidden
      await this.page.keyboard.press('Tab');
      
      const skipLinkElement = await this.page.locator(`a[href="#${firstSkipLink.target}"]`);
      if (await skipLinkElement.isVisible()) {
        await skipLinkElement.click();
        
        // Check if focus moved to the target
        const focusedElement = await this.page.evaluate((targetId) => {
          const target = document.getElementById(targetId);
          const focused = document.activeElement;
          return {
            targetExists: !!target,
            focusedOnTarget: focused === target || focused?.closest(`#${targetId}`)
          };
        }, firstSkipLink.target);
        
        return {
          exists: true,
          functional: focusedElement.targetExists && focusedElement.focusedOnTarget,
          target: firstSkipLink.target,
          message: focusedElement.functional ? 'Skip link working correctly' : 'Skip link target not focused'
        };
      }
    } catch (error) {
      return { exists: true, functional: false, message: `Skip link error: ${error.message}` };
    }
    
    return { exists: true, functional: false, message: 'Skip link not visible or clickable' };
  }

  /**
   * Test focus management (visible focus indicators)
   */
  async testFocusManagement() {
    const focusResults = await this.page.evaluate(() => {
      const issues = [];
      const focusableElements = document.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])');
      
      focusableElements.forEach(el => {
        // Simulate focus
        el.focus();
        const styles = window.getComputedStyle(el, ':focus');
        const pseudoStyles = window.getComputedStyle(el, ':focus');
        
        // Check for focus indicators
        const hasOutline = styles.outline !== 'none' && styles.outline !== '';
        const hasBoxShadow = styles.boxShadow !== 'none';
        const hasBackground = styles.backgroundColor !== window.getComputedStyle(el).backgroundColor;
        const hasBorder = styles.borderColor !== window.getComputedStyle(el).borderColor;
        
        if (!hasOutline && !hasBoxShadow && !hasBackground && !hasBorder) {
          issues.push({
            element: el.tagName.toLowerCase(),
            id: el.id,
            className: el.className,
            issue: 'No visible focus indicator'
          });
        }
      });
      
      return issues;
    });
    
    return focusResults;
  }
}

/**
 * Color Contrast Analysis Utilities
 */
export class ColorContrastAnalyzer {
  constructor(page) {
    this.page = page;
  }

  /**
   * Analyze color contrast ratios for WCAG compliance
   */
  async analyzeColorContrast() {
    const contrastIssues = await this.page.evaluate(() => {
      // Helper function to convert RGB to luminance
      const getLuminance = (r, g, b) => {
        const [rs, gs, bs] = [r, g, b].map(c => {
          c = c / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      };
      
      // Helper function to calculate contrast ratio
      const getContrastRatio = (color1, color2) => {
        const lum1 = getLuminance(...color1);
        const lum2 = getLuminance(...color2);
        const lighter = Math.max(lum1, lum2);
        const darker = Math.min(lum1, lum2);
        return (lighter + 0.05) / (darker + 0.05);
      };
      
      // Helper function to parse RGB color
      const parseRGB = (colorStr) => {
        const match = colorStr.match(/rgb\((\d+), (\d+), (\d+)\)/);
        return match ? [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])] : null;
      };
      
      const issues = [];
      const textElements = document.querySelectorAll('p, span, div, h1, h2, h3, h4, h5, h6, a, button, label, li, td, th');
      
      textElements.forEach(el => {
        const text = el.textContent?.trim();
        if (!text) return;
        
        const styles = window.getComputedStyle(el);
        const color = parseRGB(styles.color);
        const backgroundColor = parseRGB(styles.backgroundColor);
        
        if (!color || !backgroundColor) return;
        
        const contrastRatio = getContrastRatio(color, backgroundColor);
        const fontSize = parseFloat(styles.fontSize);
        const fontWeight = styles.fontWeight;
        
        // WCAG 2.1 Level AA requirements
        const isLargeText = fontSize >= 18 || (fontSize >= 14 && (fontWeight === 'bold' || parseInt(fontWeight) >= 700));
        const requiredRatio = isLargeText ? 3.0 : 4.5;
        
        if (contrastRatio < requiredRatio) {
          issues.push({
            element: el.tagName.toLowerCase(),
            id: el.id,
            className: el.className,
            text: text.substring(0, 50),
            contrastRatio: Math.round(contrastRatio * 100) / 100,
            requiredRatio: requiredRatio,
            isLargeText: isLargeText,
            color: `rgb(${color.join(', ')})`,
            backgroundColor: `rgb(${backgroundColor.join(', ')})`,
            severity: contrastRatio < requiredRatio * 0.8 ? 'high' : 'medium'
          });
        }
      });
      
      return issues;
    });
    
    return contrastIssues;
  }
}

/**
 * Browser Compatibility Testing Utilities
 */
export class BrowserCompatibilityTester {
  constructor(page) {
    this.page = page;
  }

  /**
   * Test legacy browser compatibility and graceful degradation
   */
  async testLegacyBrowserSupport() {
    const compatibilityResults = await this.page.evaluate(() => {
      const results = {
        cssFeatures: {},
        jsFeatures: {},
        fallbacks: {},
        warnings: []
      };
      
      // Test CSS feature support
      const cssTests = {
        'CSS Grid': () => CSS.supports('display', 'grid'),
        'Flexbox': () => CSS.supports('display', 'flex'),
        'CSS Custom Properties': () => CSS.supports('--test-var', 'value'),
        'CSS Transforms': () => CSS.supports('transform', 'rotate(45deg)'),
        'CSS Transitions': () => CSS.supports('transition', 'opacity 1s'),
        'CSS Animations': () => CSS.supports('animation', 'fadeIn 1s')
      };
      
      Object.entries(cssTests).forEach(([feature, test]) => {
        try {
          results.cssFeatures[feature] = test();
        } catch (e) {
          results.cssFeatures[feature] = false;
          results.warnings.push(`CSS feature test failed: ${feature}`);
        }
      });
      
      // Test JavaScript feature support
      const jsTests = {
        'ES6 Classes': () => !!window.class,
        'Arrow Functions': () => {
          try { eval('(() => {})'); return true; } catch(e) { return false; }
        },
        'Promise': () => typeof Promise !== 'undefined',
        'Fetch API': () => typeof fetch !== 'undefined',
        'Local Storage': () => typeof localStorage !== 'undefined',
        'Service Workers': () => 'serviceWorker' in navigator,
        'WebP Support': () => {
          const canvas = document.createElement('canvas');
          canvas.width = 1;
          canvas.height = 1;
          return canvas.toDataURL('image/webp').indexOf('webp') !== -1;
        }
      };
      
      Object.entries(jsTests).forEach(([feature, test]) => {
        try {
          results.jsFeatures[feature] = test();
        } catch (e) {
          results.jsFeatures[feature] = false;
          results.warnings.push(`JavaScript feature test failed: ${feature}`);
        }
      });
      
      // Check for fallback implementations
      const fallbackTests = {
        'No JS Fallback': () => {
          const noscriptElements = document.querySelectorAll('noscript');
          return noscriptElements.length > 0;
        },
        'CSS Fallbacks': () => {
          // Check for fallback font families
          const elements = document.querySelectorAll('*');
          let hasFallbacks = false;
          elements.forEach(el => {
            const fontFamily = window.getComputedStyle(el).fontFamily;
            if (fontFamily.includes(',')) hasFallbacks = true;
          });
          return hasFallbacks;
        }
      };
      
      Object.entries(fallbackTests).forEach(([feature, test]) => {
        try {
          results.fallbacks[feature] = test();
        } catch (e) {
          results.fallbacks[feature] = false;
          results.warnings.push(`Fallback test failed: ${feature}`);
        }
      });
      
      return results;
    });
    
    return compatibilityResults;
  }

  /**
   * Test mobile browser edge cases
   */
  async testMobileBrowserEdgeCases() {
    const mobileResults = await this.page.evaluate(() => {
      const results = {
        touchTargets: [],
        viewportIssues: [],
        orientationSupport: false,
        touchEvents: false
      };
      
      // Test touch target sizes (minimum 44px for accessibility)
      const interactiveElements = document.querySelectorAll('button, input, select, textarea, a[href], [role="button"]');
      
      interactiveElements.forEach(el => {
        const rect = el.getBoundingClientRect();
        const minSize = 44; // WCAG 2.1 Level AAA guideline
        
        if (rect.width > 0 && rect.height > 0) {
          if (rect.width < minSize || rect.height < minSize) {
            results.touchTargets.push({
              element: el.tagName.toLowerCase(),
              id: el.id,
              className: el.className,
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              meets44px: rect.width >= minSize && rect.height >= minSize,
              meets36px: rect.width >= 36 && rect.height >= 36 // WCAG 2.1 Level AA
            });
          }
        }
      });
      
      // Test viewport configuration
      const viewport = document.querySelector('meta[name="viewport"]');
      if (!viewport) {
        results.viewportIssues.push('No viewport meta tag found');
      } else {
        const content = viewport.getAttribute('content');
        if (!content.includes('width=device-width')) {
          results.viewportIssues.push('Viewport should include width=device-width');
        }
        if (content.includes('user-scalable=no')) {
          results.viewportIssues.push('user-scalable=no prevents zoom accessibility');
        }
      }
      
      // Test orientation support
      results.orientationSupport = typeof screen.orientation !== 'undefined' || typeof window.orientation !== 'undefined';
      
      // Test touch event support
      results.touchEvents = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      
      return results;
    });
    
    return mobileResults;
  }
}

/**
 * Localization Testing Utilities
 */
export class LocalizationTester {
  constructor(page) {
    this.page = page;
  }

  /**
   * Test internationalization support
   */
  async testInternationalizationSupport() {
    const i18nResults = await this.page.evaluate(() => {
      const results = {
        langAttribute: null,
        dirAttribute: null,
        rtlSupport: false,
        langSwitcher: false,
        textExpansion: [],
        dateFormatting: false
      };
      
      // Check HTML lang attribute
      const html = document.documentElement;
      results.langAttribute = html.getAttribute('lang');
      results.dirAttribute = html.getAttribute('dir');
      
      // Test RTL support
      results.rtlSupport = document.dir === 'rtl' || html.getAttribute('dir') === 'rtl';
      
      // Look for language switcher
      const langSwitchers = document.querySelectorAll('[data-lang], .lang-switcher, #language-selector');
      results.langSwitcher = langSwitchers.length > 0;
      
      // Test text expansion areas (forms, buttons that might expand in other languages)
      const textElements = document.querySelectorAll('button, input[type="submit"], label');
      textElements.forEach(el => {
        const rect = el.getBoundingClientRect();
        const textLength = el.textContent?.length || el.value?.length || 0;
        
        if (textLength > 0 && rect.width > 0) {
          const charWidth = rect.width / textLength;
          results.textExpansion.push({
            element: el.tagName.toLowerCase(),
            text: (el.textContent || el.value || '').substring(0, 30),
            charWidth: Math.round(charWidth),
            hasSpace: charWidth > 8 // Rough estimate for expansion space
          });
        }
      });
      
      // Test date/number formatting support
      results.dateFormatting = typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat !== 'undefined';
      
      return results;
    });
    
    return i18nResults;
  }
}

/**
 * Comprehensive WCAG 2.1 Level AA Compliance Tester
 */
export class WCAGComplianceTester {
  constructor(page) {
    this.page = page;
    this.screenReaderTester = new ScreenReaderTester(page);
    this.keyboardTester = new KeyboardNavigationTester(page);
    this.colorTester = new ColorContrastAnalyzer(page);
    this.browserTester = new BrowserCompatibilityTester(page);
    this.localizationTester = new LocalizationTester(page);
  }

  /**
   * Run complete WCAG 2.1 Level AA compliance test
   */
  async runCompleteAccessibilityAudit(options = {}) {
    const results = {
      timestamp: new Date().toISOString(),
      url: this.page.url(),
      wcagLevel: 'AA',
      overallScore: 0,
      sections: {}
    };

    // Configure and run axe-core
    await injectAxe(this.page);
    await configureAxe(this.page, WCAG_CONFIG);
    
    try {
      // 1. Automated axe-core testing
      results.sections.automated = await this.runAutomatedTests();
      
      // 2. Screen reader compatibility
      results.sections.screenReader = await this.runScreenReaderTests();
      
      // 3. Keyboard navigation
      results.sections.keyboard = await this.runKeyboardTests();
      
      // 4. Color contrast analysis
      results.sections.colorContrast = await this.runColorContrastTests();
      
      // 5. Browser compatibility
      results.sections.browserCompatibility = await this.runBrowserCompatibilityTests();
      
      // 6. Mobile accessibility
      results.sections.mobile = await this.runMobileAccessibilityTests();
      
      // 7. Internationalization
      results.sections.internationalization = await this.runInternationalizationTests();
      
      // Calculate overall compliance score
      results.overallScore = this.calculateComplianceScore(results.sections);
      results.complianceLevel = this.determineComplianceLevel(results.overallScore, results.sections);
      
    } catch (error) {
      results.error = error.message;
      results.sections.error = { message: error.message, stack: error.stack };
    }

    return results;
  }

  /**
   * Run automated axe-core accessibility tests
   */
  async runAutomatedTests() {
    try {
      const accessibilityResults = await new AxeBuilder({ page: this.page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      
      const violations = accessibilityResults.violations;
      
      return {
        testType: 'automated',
        tool: 'axe-core',
        violationCount: violations.length,
        violations: violations.map(violation => ({
          id: violation.id,
          impact: violation.impact,
          description: violation.description,
          help: violation.help,
          helpUrl: violation.helpUrl,
          tags: violation.tags,
          nodes: violation.nodes.length,
          wcagLevel: violation.tags.includes('wcag2aa') ? 'AA' : violation.tags.includes('wcag2a') ? 'A' : 'AAA'
        })),
        passed: violations.length === 0
      };
    } catch (error) {
      return {
        testType: 'automated',
        error: error.message,
        passed: false
      };
    }
  }

  /**
   * Run screen reader compatibility tests
   */
  async runScreenReaderTests() {
    const ariaLabels = await this.screenReaderTester.validateAriaLabels();
    const landmarks = await this.screenReaderTester.validateLandmarks();
    const headings = await this.screenReaderTester.validateHeadingStructure();
    
    return {
      testType: 'screenReader',
      ariaLabels: {
        issueCount: ariaLabels.length,
        issues: ariaLabels,
        passed: ariaLabels.length === 0
      },
      landmarks: {
        hasMain: landmarks.hasMain,
        hasNavigation: landmarks.hasNavigation,
        landmarkCount: landmarks.landmarks.length,
        duplicateMain: landmarks.duplicateMainLandmarks.length > 0,
        passed: landmarks.hasMain && landmarks.duplicateMainLandmarks.length === 0
      },
      headings: {
        hasH1: headings.structure.some(h => h.level === 1),
        issueCount: headings.issues.length,
        issues: headings.issues,
        structure: headings.structure,
        passed: headings.issues.length === 0
      },
      overallPassed: ariaLabels.length === 0 && landmarks.hasMain && landmarks.duplicateMainLandmarks.length === 0 && headings.issues.length === 0
    };
  }

  /**
   * Run keyboard navigation tests
   */
  async runKeyboardTests() {
    const navigation = await this.keyboardTester.testKeyboardNavigation();
    
    return {
      testType: 'keyboard',
      focusableElementCount: navigation.focusableElements.length,
      tabOrderCount: navigation.tabOrder.length,
      skipLinks: navigation.skipLinkStatus,
      focusManagement: await this.keyboardTester.testFocusManagement(),
      passed: navigation.skipLinkStatus?.exists && navigation.tabOrder.length > 0
    };
  }

  /**
   * Run color contrast tests
   */
  async runColorContrastTests() {
    const contrastIssues = await this.colorTester.analyzeColorContrast();
    
    return {
      testType: 'colorContrast',
      standard: 'WCAG 2.1 Level AA',
      issueCount: contrastIssues.length,
      highSeverityCount: contrastIssues.filter(issue => issue.severity === 'high').length,
      issues: contrastIssues,
      passed: contrastIssues.length === 0
    };
  }

  /**
   * Run browser compatibility tests
   */
  async runBrowserCompatibilityTests() {
    const compatibility = await this.browserTester.testLegacyBrowserSupport();
    
    return {
      testType: 'browserCompatibility',
      cssFeatures: compatibility.cssFeatures,
      jsFeatures: compatibility.jsFeatures,
      fallbacks: compatibility.fallbacks,
      warnings: compatibility.warnings,
      passed: compatibility.warnings.length === 0
    };
  }

  /**
   * Run mobile accessibility tests
   */
  async runMobileAccessibilityTests() {
    const mobile = await this.browserTester.testMobileBrowserEdgeCases();
    
    return {
      testType: 'mobile',
      touchTargetIssues: mobile.touchTargets.filter(target => !target.meets44px).length,
      viewportIssues: mobile.viewportIssues.length,
      touchTargets: mobile.touchTargets,
      viewport: mobile.viewportIssues,
      orientationSupport: mobile.orientationSupport,
      touchEvents: mobile.touchEvents,
      passed: mobile.touchTargets.filter(target => !target.meets36px).length === 0 && mobile.viewportIssues.length === 0
    };
  }

  /**
   * Run internationalization tests
   */
  async runInternationalizationTests() {
    const i18n = await this.localizationTester.testInternationalizationSupport();
    
    return {
      testType: 'internationalization',
      hasLangAttribute: !!i18n.langAttribute,
      langAttribute: i18n.langAttribute,
      rtlSupport: i18n.rtlSupport,
      langSwitcher: i18n.langSwitcher,
      dateFormatting: i18n.dateFormatting,
      textExpansion: i18n.textExpansion,
      passed: !!i18n.langAttribute && i18n.dateFormatting
    };
  }

  /**
   * Calculate overall compliance score
   */
  calculateComplianceScore(sections) {
    const weights = {
      automated: 0.3,
      screenReader: 0.25,
      keyboard: 0.2,
      colorContrast: 0.15,
      mobile: 0.1
    };
    
    let totalScore = 0;
    let totalWeight = 0;
    
    Object.entries(weights).forEach(([section, weight]) => {
      if (sections[section] && sections[section].passed !== undefined) {
        totalScore += sections[section].passed ? weight : 0;
        totalWeight += weight;
      }
    });
    
    return totalWeight > 0 ? Math.round((totalScore / totalWeight) * 100) : 0;
  }

  /**
   * Determine WCAG compliance level
   */
  determineComplianceLevel(score, sections) {
    const criticalIssues = [
      sections.automated?.violations?.filter(v => v.impact === 'critical').length || 0,
      sections.colorContrast?.highSeverityCount || 0,
      !sections.screenReader?.landmarks?.hasMain ? 1 : 0,
      !sections.screenReader?.headings?.hasH1 ? 1 : 0
    ].reduce((sum, count) => sum + count, 0);
    
    if (criticalIssues > 0) {
      return 'Non-compliant (Critical issues found)';
    } else if (score >= 95) {
      return 'WCAG 2.1 Level AA Compliant';
    } else if (score >= 80) {
      return 'WCAG 2.1 Level A Compliant';
    } else {
      return 'Non-compliant (Multiple issues found)';
    }
  }
}

// Classes are already exported at their declarations

/**
 * Quick accessibility check for any page
 */
export async function quickAccessibilityCheck(page) {
  const tester = new WCAGComplianceTester(page);
  const results = await tester.runCompleteAccessibilityAudit();
  
  return {
    url: results.url,
    complianceLevel: results.complianceLevel,
    overallScore: results.overallScore,
    criticalIssues: results.sections.automated?.violations?.filter(v => v.impact === 'critical') || [],
    summary: {
      automatedViolations: results.sections.automated?.violationCount || 0,
      contrastIssues: results.sections.colorContrast?.issueCount || 0,
      keyboardIssues: !results.sections.keyboard?.passed,
      screenReaderIssues: !results.sections.screenReader?.overallPassed,
      mobileIssues: !results.sections.mobile?.passed
    }
  };
}
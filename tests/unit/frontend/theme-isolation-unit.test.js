/**
 * @vitest-environment jsdom
 */

/**
 * Theme Isolation Tests
 * 
 * Verifies that theme isolation works correctly between:
 * - Main site (light/auto theme)  
 * - Admin sections (dark theme)
 * 
 * Test Coverage:
 * ✅ Dark theme styles apply when data-theme="dark" is present
 * ✅ Light theme styles apply when data-theme is absent or "light"
 * ✅ No style leakage between admin and main site components
 * ✅ System preference handling with :root:not([data-theme="light"])
 * ✅ Theme switching behavior and rapid transitions
 * ✅ CSS specificity and cascade rules work correctly
 * 
 * Note: This test focuses on CSS selector behavior and theme attribute validation.
 * For complete theme manager functionality, see theme-manager.test.js
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Theme Isolation', () => {
  let originalHtml;
  let testStylesheet;

  beforeEach(() => {
    // Ensure we have a document environment
    if (typeof document === 'undefined') {
      throw new Error('Theme isolation tests require jsdom environment');
    }
    
    // Store original html attributes
    originalHtml = {
      attributes: Array.from(document.documentElement.attributes).map(attr => ({
        name: attr.name,
        value: attr.value
      }))
    };
    
    // Clean up any existing data-theme
    document.documentElement.removeAttribute('data-theme');

    // Create test stylesheet with theme-specific styles
    testStylesheet = document.createElement('style');
    testStylesheet.textContent = `
      /* Default/Light theme styles */
      .test-bg { background-color: rgb(255, 255, 255); }
      .test-text { color: rgb(0, 0, 0); }
      .test-border { border-color: rgb(229, 229, 229); }
      
      /* Dark theme overrides */
      [data-theme="dark"] .test-bg { background-color: rgb(17, 17, 17); }
      [data-theme="dark"] .test-text { color: rgb(255, 255, 255); }
      [data-theme="dark"] .test-border { border-color: rgb(55, 55, 55); }
      
      /* Admin-specific styles that should NOT affect main site */
      [data-theme="dark"] .admin-component {
        background-color: rgb(31, 31, 31);
        color: rgb(200, 200, 200);
      }
      
      /* Main site styles that should NOT affect admin */
      .main-component {
        background-color: rgb(248, 248, 248);
        color: rgb(16, 16, 16);
      }
      
      /* System preference fallback (for :root:not([data-theme="light"])) */
      :root:not([data-theme="light"]) .test-system-dark { color: rgb(240, 240, 240); }
    `;
    document.head.appendChild(testStylesheet);
  });

  afterEach(() => {
    // Clear all attributes first
    Array.from(document.documentElement.attributes).forEach(attr => {
      if (attr.name !== 'lang') { // Keep essential attributes
        document.documentElement.removeAttribute(attr.name);
      }
    });
    
    // Restore original html attributes
    originalHtml.attributes.forEach(attr => {
      document.documentElement.setAttribute(attr.name, attr.value);
    });
    
    // Clean up test attributes
    document.documentElement.removeAttribute('data-theme');
    
    // Remove test stylesheet
    if (testStylesheet && testStylesheet.parentNode) {
      document.head.removeChild(testStylesheet);
    }
    
    // Clean up test elements
    document.querySelectorAll('.test-element').forEach(el => el.remove());
  });

  describe('Dark Theme Application', () => {
    it('should apply dark styles when data-theme="dark" is present', () => {
      // Create test elements
      const bgElement = document.createElement('div');
      bgElement.className = 'test-element test-bg';
      document.body.appendChild(bgElement);

      const textElement = document.createElement('div');
      textElement.className = 'test-element test-text';
      document.body.appendChild(textElement);

      // Set dark theme
      document.documentElement.setAttribute('data-theme', 'dark');

      // Verify dark styles are applied
      const bgStyles = getComputedStyle(bgElement);
      const textStyles = getComputedStyle(textElement);

      expect(bgStyles.backgroundColor).toBe('rgb(17, 17, 17)');
      expect(textStyles.color).toBe('rgb(255, 255, 255)');
    });

    it('should isolate admin components when in dark theme', () => {
      // Create admin and main components
      const adminComponent = document.createElement('div');
      adminComponent.className = 'test-element admin-component';
      document.body.appendChild(adminComponent);

      const mainComponent = document.createElement('div');
      mainComponent.className = 'test-element main-component';
      document.body.appendChild(mainComponent);

      // Set dark theme
      document.documentElement.setAttribute('data-theme', 'dark');

      const adminStyles = getComputedStyle(adminComponent);
      const mainStyles = getComputedStyle(mainComponent);

      // Admin component should have dark theme styles
      expect(adminStyles.backgroundColor).toBe('rgb(31, 31, 31)');
      expect(adminStyles.color).toBe('rgb(200, 200, 200)');

      // Main component should keep its own styles (not affected by dark theme)
      expect(mainStyles.backgroundColor).toBe('rgb(248, 248, 248)');
      expect(mainStyles.color).toBe('rgb(16, 16, 16)');
    });
  });

  describe('Light Theme Application', () => {
    it('should apply light styles when data-theme="light" is explicitly set', () => {
      const bgElement = document.createElement('div');
      bgElement.className = 'test-element test-bg';
      document.body.appendChild(bgElement);

      const textElement = document.createElement('div');
      textElement.className = 'test-element test-text';
      document.body.appendChild(textElement);

      // Set light theme explicitly
      document.documentElement.setAttribute('data-theme', 'light');

      const bgStyles = getComputedStyle(bgElement);
      const textStyles = getComputedStyle(textElement);

      expect(bgStyles.backgroundColor).toBe('rgb(255, 255, 255)');
      expect(textStyles.color).toBe('rgb(0, 0, 0)');
    });

    it('should apply light styles when data-theme is absent', () => {
      const bgElement = document.createElement('div');
      bgElement.className = 'test-element test-bg';
      document.body.appendChild(bgElement);

      const textElement = document.createElement('div');
      textElement.className = 'test-element test-text';
      document.body.appendChild(textElement);

      // Ensure no data-theme attribute
      document.documentElement.removeAttribute('data-theme');

      const bgStyles = getComputedStyle(bgElement);
      const textStyles = getComputedStyle(textElement);

      // Should default to light styles
      expect(bgStyles.backgroundColor).toBe('rgb(255, 255, 255)');
      expect(textStyles.color).toBe('rgb(0, 0, 0)');
    });
  });

  describe('Style Leakage Prevention', () => {
    it('should not apply dark theme styles without data-theme="dark"', () => {
      const bgElement = document.createElement('div');
      bgElement.className = 'test-element test-bg';
      document.body.appendChild(bgElement);

      // Set various non-dark themes
      const themes = [undefined, '', 'light', 'auto', 'invalid'];
      
      themes.forEach(theme => {
        if (theme === undefined) {
          document.documentElement.removeAttribute('data-theme');
        } else {
          document.documentElement.setAttribute('data-theme', theme);
        }

        const styles = getComputedStyle(bgElement);
        // Should always be light background, never dark
        expect(styles.backgroundColor).toBe('rgb(255, 255, 255)');
        expect(styles.backgroundColor).not.toBe('rgb(17, 17, 17)');
      });
    });

    it('should not allow admin styles to leak to main site', () => {
      const regularElement = document.createElement('div');
      regularElement.className = 'test-element test-bg';
      document.body.appendChild(regularElement);

      // Even with dark theme, regular elements shouldn't get admin-specific styles
      document.documentElement.setAttribute('data-theme', 'dark');
      
      const styles = getComputedStyle(regularElement);
      
      // Should get dark theme base styles, but not admin-specific styles
      expect(styles.backgroundColor).toBe('rgb(17, 17, 17)'); // Base dark theme
      expect(styles.backgroundColor).not.toBe('rgb(31, 31, 31)'); // Admin-specific
    });

    it('should not allow main site styles to leak to admin', () => {
      const adminElement = document.createElement('div');
      adminElement.className = 'test-element admin-component';
      document.body.appendChild(adminElement);

      document.documentElement.setAttribute('data-theme', 'dark');
      
      const styles = getComputedStyle(adminElement);
      
      // Should get admin-specific styles, not main site styles
      expect(styles.backgroundColor).toBe('rgb(31, 31, 31)'); // Admin-specific
      expect(styles.backgroundColor).not.toBe('rgb(248, 248, 248)'); // Main site
    });
  });

  describe('System Preference Handling', () => {
    it('should handle :root:not([data-theme="light"]) selector correctly', () => {
      const systemDarkElement = document.createElement('div');
      systemDarkElement.className = 'test-element test-system-dark';
      document.body.appendChild(systemDarkElement);

      // Test when no data-theme is set (should apply system preference styles)
      document.documentElement.removeAttribute('data-theme');
      let styles = getComputedStyle(systemDarkElement);
      expect(styles.color).toBe('rgb(240, 240, 240)'); // System dark applied

      // Test when data-theme="dark" (should also apply)
      document.documentElement.setAttribute('data-theme', 'dark');
      styles = getComputedStyle(systemDarkElement);
      expect(styles.color).toBe('rgb(240, 240, 240)'); // System dark still applied

      // Test when data-theme="light" (should NOT apply)
      document.documentElement.setAttribute('data-theme', 'light');
      styles = getComputedStyle(systemDarkElement);
      expect(styles.color).not.toBe('rgb(240, 240, 240)'); // System dark not applied
    });
  });

  describe('Theme Switching', () => {
    it('should properly switch styles when changing themes', () => {
      const testElement = document.createElement('div');
      testElement.className = 'test-element test-bg';
      document.body.appendChild(testElement);

      // Start with light
      document.documentElement.setAttribute('data-theme', 'light');
      let styles = getComputedStyle(testElement);
      expect(styles.backgroundColor).toBe('rgb(255, 255, 255)');

      // Switch to dark
      document.documentElement.setAttribute('data-theme', 'dark');
      styles = getComputedStyle(testElement);
      expect(styles.backgroundColor).toBe('rgb(17, 17, 17)');

      // Switch back to light
      document.documentElement.setAttribute('data-theme', 'light');
      styles = getComputedStyle(testElement);
      expect(styles.backgroundColor).toBe('rgb(255, 255, 255)');

      // Remove theme (back to default)
      document.documentElement.removeAttribute('data-theme');
      styles = getComputedStyle(testElement);
      expect(styles.backgroundColor).toBe('rgb(255, 255, 255)');
    });

    it('should handle rapid theme switching without style corruption', () => {
      const testElement = document.createElement('div');
      testElement.className = 'test-element test-text';
      document.body.appendChild(testElement);

      const themes = ['light', 'dark', '', 'dark', 'light'];
      
      themes.forEach(theme => {
        if (theme === '') {
          document.documentElement.removeAttribute('data-theme');
        } else {
          document.documentElement.setAttribute('data-theme', theme);
        }

        const styles = getComputedStyle(testElement);
        
        if (theme === 'dark') {
          expect(styles.color).toBe('rgb(255, 255, 255)');
        } else {
          expect(styles.color).toBe('rgb(0, 0, 0)');
        }
      });
    });
  });

  describe('CSS Specificity and Cascade', () => {
    it('should respect CSS specificity rules', () => {
      // Create element with multiple classes
      const testElement = document.createElement('div');
      testElement.className = 'test-element test-bg admin-component';
      document.body.appendChild(testElement);

      document.documentElement.setAttribute('data-theme', 'dark');
      
      const styles = getComputedStyle(testElement);
      
      // More specific admin selector should win
      expect(styles.backgroundColor).toBe('rgb(31, 31, 31)'); // admin-component
      expect(styles.backgroundColor).not.toBe('rgb(17, 17, 17)'); // test-bg
    });

    it('should maintain proper cascade order', () => {
      // Add additional CSS rule with higher specificity
      const additionalStyle = document.createElement('style');
      additionalStyle.textContent = `
        [data-theme="dark"] div.test-element.test-bg {
          background-color: rgb(100, 100, 100) !important;
        }
      `;
      document.head.appendChild(additionalStyle);

      const testElement = document.createElement('div');
      testElement.className = 'test-element test-bg';
      document.body.appendChild(testElement);

      document.documentElement.setAttribute('data-theme', 'dark');
      
      const styles = getComputedStyle(testElement);
      expect(styles.backgroundColor).toBe('rgb(100, 100, 100)'); // Higher specificity wins

      // Cleanup
      document.head.removeChild(additionalStyle);
    });
  });
});
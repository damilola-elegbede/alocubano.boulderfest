/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Import the theme manager functions (simplified fixed theme implementation)
import {
  THEMES,
  getTheme,
  getCurrentTheme,
  initializeTheme,
  isAdminPage
} from '../../js/theme-manager.js';

describe('ThemeManager', () => {
  let mockMatchMedia;
  let mockLocalStorage;
  let originalLocation;
  let originalLocalStorage;
  let originalMatchMedia;

  beforeEach(() => {
    // Store original values for restoration
    originalLocalStorage = window.localStorage;
    originalMatchMedia = window.matchMedia;
    originalLocation = window.location;

    // Reset DOM
    if (document.documentElement) {
      document.documentElement.removeAttribute('data-theme');
    }
    document.body.innerHTML = '';
    
    // Mock localStorage
    mockLocalStorage = {
      data: {},
      getItem: vi.fn((key) => mockLocalStorage.data[key] || null),
      setItem: vi.fn((key, value) => {
        mockLocalStorage.data[key] = value;
      }),
      removeItem: vi.fn((key) => {
        delete mockLocalStorage.data[key];
      }),
      clear: vi.fn(() => {
        mockLocalStorage.data = {};
      })
    };
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true
    });

    // Mock matchMedia
    mockMatchMedia = vi.fn((query) => ({
      matches: query.includes('dark') ? false : true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(), // Legacy support
      removeListener: vi.fn(), // Legacy support
      dispatchEvent: vi.fn(),
    }));
    Object.defineProperty(window, 'matchMedia', {
      value: mockMatchMedia,
      writable: true,
      configurable: true
    });

    // Mock window.location
    delete window.location;
    window.location = {
      pathname: '/home',
      href: 'http://localhost/home'
    };

    // Clear any existing event listeners
    document.removeEventListener('themechange', vi.fn());
  });

  afterEach(() => {
    // Restore original properties properly
    if (originalLocalStorage !== undefined) {
      Object.defineProperty(window, 'localStorage', {
        value: originalLocalStorage,
        writable: true,
        configurable: true
      });
    }
    
    if (originalMatchMedia !== undefined) {
      Object.defineProperty(window, 'matchMedia', {
        value: originalMatchMedia,
        writable: true,
        configurable: true
      });
    }
    
    // Restore original location
    window.location = originalLocation;
    
    // Ensure documentElement is restored if it was changed in tests
    if (!document.documentElement) {
      // Create a new documentElement if it was removed
      document.documentElement = document.createElement('html');
    }
    
    // Clean up data-theme attribute
    if (document.documentElement) {
      document.documentElement.removeAttribute('data-theme');
    }
    
    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('THEMES constants', () => {
    it('should define all theme constants', () => {
      expect(THEMES.LIGHT).toBe('light');
      expect(THEMES.DARK).toBe('dark');
      // AUTO theme not supported in fixed theme implementation
    });

    it('should have all expected theme values', () => {
      const expectedThemes = ['light', 'dark']; // Only fixed themes
      const actualThemes = Object.values(THEMES);
      expect(actualThemes).toEqual(expect.arrayContaining(expectedThemes));
      expect(actualThemes).toHaveLength(expectedThemes.length);
    });
  });

  describe('isAdminPage', () => {
    it('should detect admin pages correctly', () => {
      // Test admin paths
      window.location.pathname = '/admin';
      expect(isAdminPage()).toBe(true);

      window.location.pathname = '/admin/dashboard';
      expect(isAdminPage()).toBe(true);

      window.location.pathname = '/pages/admin';
      expect(isAdminPage()).toBe(true);

      window.location.pathname = '/pages/admin/users';
      expect(isAdminPage()).toBe(true);
    });

    it('should not detect non-admin pages as admin', () => {
      // Test non-admin paths
      window.location.pathname = '/home';
      expect(isAdminPage()).toBe(false);

      window.location.pathname = '/tickets';
      expect(isAdminPage()).toBe(false);

      window.location.pathname = '/gallery';
      expect(isAdminPage()).toBe(false);

      window.location.pathname = '/about';
      expect(isAdminPage()).toBe(false);
    });

    it('should be case-insensitive', () => {
      window.location.pathname = '/ADMIN';
      expect(isAdminPage()).toBe(true);

      window.location.pathname = '/Admin/Dashboard';
      expect(isAdminPage()).toBe(true);

      window.location.pathname = '/pages/ADMIN';
      expect(isAdminPage()).toBe(true);
    });

    it('should handle edge cases', () => {
      window.location.pathname = '/administrator'; // Contains '/admin' substring
      expect(isAdminPage()).toBe(true); // Returns true because it contains '/admin'

      window.location.pathname = '/user-admin'; // Contains 'admin' but not '/admin' substring 
      expect(isAdminPage()).toBe(false); // Returns false

      window.location.pathname = '';
      expect(isAdminPage()).toBe(false);

      window.location.pathname = '/';
      expect(isAdminPage()).toBe(false);
      
      window.location.pathname = '/something-else';
      expect(isAdminPage()).toBe(false);
      
      // Additional edge cases
      window.location.pathname = '/admin-tools'; // Contains '/admin' substring
      expect(isAdminPage()).toBe(true);
      
      window.location.pathname = '/my/admin/page'; // Contains '/admin'
      expect(isAdminPage()).toBe(true);
      
      window.location.pathname = '/something-admin-related'; // Contains 'admin' but not '/admin'
      expect(isAdminPage()).toBe(false);
    });
  });

  describe('fixed theme behavior', () => {
    it('should return dark theme for admin pages', () => {
      window.location.pathname = '/admin';
      const theme = getTheme();
      expect(theme).toBe(THEMES.DARK);
    });

    it('should return light theme for main site pages', () => {
      window.location.pathname = '/tickets';
      const theme = getTheme();
      expect(theme).toBe(THEMES.LIGHT);
    });

    it('should not use localStorage (fixed themes only)', () => {
      // Fixed theme implementation doesn't use localStorage
      window.location.pathname = '/admin';
      const theme = getTheme();
      expect(theme).toBe(THEMES.DARK);
      expect(mockLocalStorage.getItem).not.toHaveBeenCalled();
      expect(mockLocalStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('theme determination', () => {
    it('should determine theme based on page type only', () => {
      // Admin page always gets dark theme
      window.location.pathname = '/admin';
      expect(getTheme()).toBe(THEMES.DARK);
      expect(getCurrentTheme()).toBe(THEMES.DARK);
      
      // Main site page always gets light theme
      window.location.pathname = '/tickets';
      expect(getTheme()).toBe(THEMES.LIGHT);
      expect(getCurrentTheme()).toBe(THEMES.LIGHT);
    });

    it('should not be affected by system preferences', () => {
      // Mock system preferences (should not affect fixed theme implementation)
      mockMatchMedia.mockReturnValue({
        matches: true, // Dark system preference
        addEventListener: vi.fn(),
        addListener: vi.fn()
      });

      // Main site should still get light theme regardless of system preference
      window.location.pathname = '/tickets';
      expect(getTheme()).toBe(THEMES.LIGHT);
      expect(getCurrentTheme()).toBe(THEMES.LIGHT);
    });

    it('should handle missing matchMedia gracefully', () => {
      Object.defineProperty(window, 'matchMedia', {
        value: undefined,
        writable: true,
        configurable: true
      });

      expect(() => initializeTheme()).not.toThrow();
      expect(() => getCurrentTheme()).not.toThrow();
      
      // Should still work based on page type
      window.location.pathname = '/admin';
      expect(getCurrentTheme()).toBe(THEMES.DARK);
    });
  });

  describe('theme application to DOM', () => {
    it('should apply dark theme for admin pages', () => {
      window.location.pathname = '/admin';
      initializeTheme();
      expect(document.documentElement.getAttribute('data-theme')).toBe(THEMES.DARK);
    });

    it('should remove theme attribute for main site pages', () => {
      window.location.pathname = '/tickets';
      initializeTheme();
      // Fixed theme implementation removes attribute for light theme
      expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    });

    it('should handle missing document gracefully', () => {
      const originalDocument = document;
      // @ts-ignore
      global.document = undefined;

      expect(() => initializeTheme()).not.toThrow();
      expect(() => getCurrentTheme()).not.toThrow();

      // Restore document
      global.document = originalDocument;
    });

    it('should dispatch themechange event on initialization', () => {
      let eventFired = false;
      let eventDetail = null;

      document.addEventListener('themechange', (event) => {
        eventFired = true;
        eventDetail = event.detail;
      });

      window.location.pathname = '/admin';
      initializeTheme();

      expect(eventFired).toBe(true);
      expect(eventDetail.theme).toBe(THEMES.DARK);
    });
  });

  describe('getCurrentTheme', () => {
    it('should return theme based on page type for admin pages', () => {
      window.location.pathname = '/admin';
      expect(getCurrentTheme()).toBe(THEMES.DARK);
    });

    it('should return light theme for main site pages', () => {
      window.location.pathname = '/tickets';
      expect(getCurrentTheme()).toBe(THEMES.LIGHT);
    });

    it('should handle missing document gracefully', () => {
      const originalDocument = document;
      // @ts-ignore
      global.document = undefined;

      expect(getCurrentTheme()).toBe(THEMES.LIGHT);

      // Restore document
      global.document = originalDocument;
    });
  });

  // toggleTheme and setTheme not supported in fixed theme implementation

  describe('initializeTheme', () => {
    it('should apply theme based on page type for admin pages', () => {
      window.location.pathname = '/admin';
      initializeTheme();
      expect(document.documentElement.getAttribute('data-theme')).toBe(THEMES.DARK);
    });

    it('should apply theme based on page type for main site pages', () => {
      window.location.pathname = '/tickets';
      initializeTheme();
      // Fixed theme implementation removes attribute for light theme
      expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    });

    it('should not set up system theme listeners (fixed themes only)', () => {
      const mockMediaQuery = {
        matches: false,
        addEventListener: vi.fn(),
        addListener: vi.fn()
      };
      mockMatchMedia.mockReturnValue(mockMediaQuery);

      initializeTheme();

      // Fixed theme implementation doesn't listen to system preferences
      expect(mockMediaQuery.addEventListener).not.toHaveBeenCalled();
      expect(mockMediaQuery.addListener).not.toHaveBeenCalled();
    });
  });

  describe('admin page theme handling', () => {
    it('should always use dark theme on admin pages', () => {
      window.location.pathname = '/admin';
      const theme = getTheme();
      expect(theme).toBe(THEMES.DARK);
    });

    it('should always use dark theme on admin dashboard', () => {
      window.location.pathname = '/admin/dashboard';
      expect(getTheme()).toBe(THEMES.DARK);
      expect(getCurrentTheme()).toBe(THEMES.DARK);
    });

    it('should always use light theme on non-admin pages', () => {
      window.location.pathname = '/tickets';
      expect(getTheme()).toBe(THEMES.LIGHT);
      expect(getCurrentTheme()).toBe(THEMES.LIGHT);
    });
  });

  describe('CSS custom property integration', () => {
    it('should apply theme attribute for admin pages', () => {
      window.location.pathname = '/admin';
      initializeTheme();
      expect(document.documentElement.hasAttribute('data-theme')).toBe(true);
      expect(document.documentElement.getAttribute('data-theme')).toBe(THEMES.DARK);
    });

    it('should remove theme attribute for main site pages', () => {
      window.location.pathname = '/tickets';
      initializeTheme();
      // Fixed theme removes attribute for light theme
      expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    });

    it('should allow CSS selectors to target admin dark theme', () => {
      // Create test styles
      const style = document.createElement('style');
      style.textContent = `
        .test-element { color: rgb(0, 0, 0); } /* Default light theme */
        [data-theme="dark"] .test-element { color: rgb(255, 255, 255); } /* Dark theme override */
      `;
      document.head.appendChild(style);

      const testElement = document.createElement('div');
      testElement.className = 'test-element';
      document.body.appendChild(testElement);

      // Test admin page (dark theme)
      window.location.pathname = '/admin';
      initializeTheme();
      const darkStyles = getComputedStyle(testElement);
      expect(darkStyles.color).toBe('rgb(255, 255, 255)'); // white in RGB for dark theme

      // Test main site page (light theme, no attribute)
      window.location.pathname = '/tickets';
      initializeTheme();
      const lightStyles = getComputedStyle(testElement);
      expect(lightStyles.color).toBe('rgb(0, 0, 0)'); // black in RGB for default light theme

      // Cleanup
      document.head.removeChild(style);
      document.body.removeChild(testElement);
    });
  });

  describe('edge cases and error handling', () => {
    it('should work correctly with different admin paths', () => {
      const adminPaths = ['/admin', '/admin/', '/admin/dashboard', '/pages/admin', '/ADMIN/users'];
      
      adminPaths.forEach(path => {
        window.location.pathname = path;
        expect(getTheme()).toBe(THEMES.DARK);
        expect(getCurrentTheme()).toBe(THEMES.DARK);
      });
    });

    it('should work correctly with main site paths', () => {
      const mainPaths = ['/', '/tickets', '/gallery', '/about', '/home'];
      
      mainPaths.forEach(path => {
        window.location.pathname = path;
        expect(getTheme()).toBe(THEMES.LIGHT);
        expect(getCurrentTheme()).toBe(THEMES.LIGHT);
      });
    });

    it('should handle missing localStorage gracefully', () => {
      // Remove localStorage entirely (shouldn't affect fixed theme implementation)
      Object.defineProperty(window, 'localStorage', {
        value: undefined,
        writable: true,
        configurable: true
      });
      
      expect(() => getTheme()).not.toThrow();
      expect(() => initializeTheme()).not.toThrow();
      
      // Should still work based on page type
      window.location.pathname = '/admin';
      expect(getTheme()).toBe(THEMES.DARK);
    });

    it('should handle document without documentElement correctly', () => {
      // Mock document.documentElement as null (edge case that doesn't occur in real browsers)
      const originalDocumentElement = document.documentElement;
      
      Object.defineProperty(document, 'documentElement', {
        value: null,
        writable: true,
        configurable: true
      });

      // The implementation doesn't handle null documentElement gracefully, which is expected
      // This is an edge case that doesn't occur in real browsers
      expect(() => initializeTheme()).toThrow();
      
      // getCurrentTheme doesn't try to access documentElement, so it should work
      expect(() => getCurrentTheme()).not.toThrow();

      // Restore immediately to prevent issues in afterEach
      Object.defineProperty(document, 'documentElement', {
        value: originalDocumentElement,
        writable: true,
        configurable: true
      });
    });
  });

  describe('integration scenarios', () => {
    it('should work correctly for page navigation scenarios', () => {
      // Start on main site
      window.location.pathname = '/home';
      initializeTheme();
      expect(getCurrentTheme()).toBe(THEMES.LIGHT);
      expect(document.documentElement.getAttribute('data-theme')).toBeNull();

      // Navigate to admin page
      window.location.pathname = '/admin';
      initializeTheme();
      expect(getCurrentTheme()).toBe(THEMES.DARK);
      expect(document.documentElement.getAttribute('data-theme')).toBe(THEMES.DARK);

      // Navigate back to main site
      window.location.pathname = '/tickets';
      initializeTheme();
      expect(getCurrentTheme()).toBe(THEMES.LIGHT);
      expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    });

    it('should handle theme events correctly', () => {
      const themeEvents = [];
      
      document.addEventListener('themechange', (event) => {
        themeEvents.push({
          theme: event.detail.theme
        });
      });

      // Simulate admin page initialization
      window.location.pathname = '/admin';
      initializeTheme();

      expect(themeEvents).toHaveLength(1);
      expect(themeEvents[0].theme).toBe(THEMES.DARK);
    });

    it('should be consistent across multiple initializations', () => {
      // Multiple initializations on same page type should be consistent
      window.location.pathname = '/admin';
      
      initializeTheme();
      expect(getCurrentTheme()).toBe(THEMES.DARK);
      
      initializeTheme();
      expect(getCurrentTheme()).toBe(THEMES.DARK);
      
      initializeTheme();
      expect(getCurrentTheme()).toBe(THEMES.DARK);
    });

    it('should not be affected by external DOM changes', () => {
      window.location.pathname = '/admin';
      initializeTheme();
      expect(document.documentElement.getAttribute('data-theme')).toBe(THEMES.DARK);
      
      // Simulate external script changing theme attribute
      document.documentElement.setAttribute('data-theme', THEMES.LIGHT);
      
      // getCurrentTheme should still return theme based on page type, not DOM attribute
      expect(getCurrentTheme()).toBe(THEMES.DARK); // Based on page type, not DOM
    });
  });
});
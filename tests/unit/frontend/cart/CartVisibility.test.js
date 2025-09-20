/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  determineCartVisibility,
  PAGE_VISIBILITY_CONFIG,
  getPageVisibilityRule,
  isShoppingPage,
  isNonCartPage,
  getCartVisibilityState,
  isValidPagePath,
  getPagesByRule
} from '../../../../js/lib/pure/cart-visibility.js';

describe('CartVisibility', () => {
  describe('PAGE_VISIBILITY_CONFIG', () => {
    it('should have required configuration properties', () => {
      expect(PAGE_VISIBILITY_CONFIG).toHaveProperty('alwaysShow');
      expect(PAGE_VISIBILITY_CONFIG).toHaveProperty('neverShow');
      expect(PAGE_VISIBILITY_CONFIG).toHaveProperty('showWithItems');

      expect(Array.isArray(PAGE_VISIBILITY_CONFIG.alwaysShow)).toBe(true);
      expect(Array.isArray(PAGE_VISIBILITY_CONFIG.neverShow)).toBe(true);
      expect(Array.isArray(PAGE_VISIBILITY_CONFIG.showWithItems)).toBe(true);
    });

    it('should include expected shopping pages in alwaysShow', () => {
      expect(PAGE_VISIBILITY_CONFIG.alwaysShow).toContain('/tickets');
      expect(PAGE_VISIBILITY_CONFIG.alwaysShow).toContain('/donations');
    });

    it('should include expected error pages in neverShow', () => {
      expect(PAGE_VISIBILITY_CONFIG.neverShow).toContain('/404');
      expect(PAGE_VISIBILITY_CONFIG.neverShow).toContain('/index.html');
    });
  });

  describe('determineCartVisibility', () => {
    describe('always show pages', () => {
      it('should always show cart on tickets page', () => {
        expect(determineCartVisibility('/tickets', false)).toBe(true);
        expect(determineCartVisibility('/tickets', true)).toBe(true);
      });

      it('should always show cart on donations page', () => {
        expect(determineCartVisibility('/donations', false)).toBe(true);
        expect(determineCartVisibility('/donations', true)).toBe(true);
      });

      it('should handle trailing slashes', () => {
        expect(determineCartVisibility('/tickets/', false)).toBe(true);
        expect(determineCartVisibility('/donations/', true)).toBe(true);
      });

      it('should handle paths containing shopping pages', () => {
        expect(determineCartVisibility('/path/tickets/something', false)).toBe(true);
        expect(determineCartVisibility('/donations/special', true)).toBe(true);
      });
    });

    describe('never show pages', () => {
      it('should never show cart on 404 page', () => {
        expect(determineCartVisibility('/404', false)).toBe(false);
        expect(determineCartVisibility('/404', true)).toBe(false);
      });

      it('should never show cart on index.html', () => {
        expect(determineCartVisibility('/index.html', false)).toBe(false);
        expect(determineCartVisibility('/index.html', true)).toBe(false);
      });

      it('should handle paths containing never-show pages', () => {
        expect(determineCartVisibility('/path/404/error', true)).toBe(false);
        expect(determineCartVisibility('/static/index.html', false)).toBe(false);
      });
    });

    describe('conditional show pages', () => {
      const conditionalPages = ['/about', '/artists', '/schedule', '/gallery', '/home', '/'];

      conditionalPages.forEach(page => {
        it(`should show cart on ${page} only when hasItems is true`, () => {
          expect(determineCartVisibility(page, false)).toBe(false);
          expect(determineCartVisibility(page, true)).toBe(true);
        });
      });

      it('should handle root path specially', () => {
        expect(determineCartVisibility('/', false)).toBe(false);
        expect(determineCartVisibility('/', true)).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should handle invalid paths', () => {
        expect(determineCartVisibility(null, true)).toBe(false);
        expect(determineCartVisibility(undefined, true)).toBe(false);
        expect(determineCartVisibility('', true)).toBe(false);
        expect(determineCartVisibility(123, true)).toBe(false);
      });

      it('should handle boolean coercion for hasItems', () => {
        expect(determineCartVisibility('/about', 0)).toBe(false);
        expect(determineCartVisibility('/about', 1)).toBe(true);
        expect(determineCartVisibility('/about', null)).toBe(false);
        expect(determineCartVisibility('/about', 'truthy')).toBe(true);
      });

      it('should handle unusual path formats', () => {
        expect(determineCartVisibility('//tickets//', true)).toBe(true);
        expect(determineCartVisibility('/TICKETS', false)).toBe(false); // Case sensitive
        expect(determineCartVisibility('/tickets?param=value', false)).toBe(true);
      });
    });
  });

  describe('getPageVisibilityRule', () => {
    it('should return "never" for invalid paths', () => {
      expect(getPageVisibilityRule(null)).toBe('never');
      expect(getPageVisibilityRule(undefined)).toBe('never');
      expect(getPageVisibilityRule('')).toBe('never');
    });

    it('should return "never" for never-show pages', () => {
      expect(getPageVisibilityRule('/404')).toBe('never');
      expect(getPageVisibilityRule('/index.html')).toBe('never');
    });

    it('should return "always" for always-show pages', () => {
      expect(getPageVisibilityRule('/tickets')).toBe('always');
      expect(getPageVisibilityRule('/donations')).toBe('always');
    });

    it('should return "withItems" for conditional pages', () => {
      expect(getPageVisibilityRule('/about')).toBe('withItems');
      expect(getPageVisibilityRule('/artists')).toBe('withItems');
      expect(getPageVisibilityRule('/schedule')).toBe('withItems');
      expect(getPageVisibilityRule('/gallery')).toBe('withItems');
      expect(getPageVisibilityRule('/home')).toBe('withItems');
      expect(getPageVisibilityRule('/')).toBe('withItems');
    });

    it('should handle trailing slashes', () => {
      expect(getPageVisibilityRule('/tickets/')).toBe('always');
      expect(getPageVisibilityRule('/about/')).toBe('withItems');
    });

    it('should return "withItems" for unknown pages', () => {
      expect(getPageVisibilityRule('/unknown')).toBe('withItems');
      expect(getPageVisibilityRule('/custom-page')).toBe('withItems');
    });
  });

  describe('isShoppingPage', () => {
    it('should identify shopping pages correctly', () => {
      expect(isShoppingPage('/tickets')).toBe(true);
      expect(isShoppingPage('/donations')).toBe(true);
      expect(isShoppingPage('/tickets/')).toBe(true);
    });

    it('should not identify non-shopping pages as shopping pages', () => {
      expect(isShoppingPage('/about')).toBe(false);
      expect(isShoppingPage('/404')).toBe(false);
      expect(isShoppingPage('/')).toBe(false);
    });

    it('should handle invalid inputs', () => {
      expect(isShoppingPage(null)).toBe(false);
      expect(isShoppingPage(undefined)).toBe(false);
      expect(isShoppingPage('')).toBe(false);
    });
  });

  describe('isNonCartPage', () => {
    it('should identify non-cart pages correctly', () => {
      expect(isNonCartPage('/404')).toBe(true);
      expect(isNonCartPage('/index.html')).toBe(true);
    });

    it('should not identify regular pages as non-cart pages', () => {
      expect(isNonCartPage('/tickets')).toBe(false);
      expect(isNonCartPage('/about')).toBe(false);
      expect(isNonCartPage('/')).toBe(false);
    });

    it('should handle invalid inputs as non-cart pages', () => {
      expect(isNonCartPage(null)).toBe(true);
      expect(isNonCartPage(undefined)).toBe(true);
      expect(isNonCartPage('')).toBe(true);
    });
  });

  describe('getCartVisibilityState', () => {
    it('should return complete visibility state', () => {
      const state = getCartVisibilityState('/tickets', true);

      expect(state).toMatchObject({
        currentPath: '/tickets',
        hasItems: true,
        rule: 'always',
        shouldShow: true,
        isShoppingPage: true,
        isNonCartPage: false
      });
    });

    it('should handle root path normalization', () => {
      const state = getCartVisibilityState('/', false);

      expect(state.currentPath).toBe('/');
      expect(state.rule).toBe('withItems');
      expect(state.shouldShow).toBe(false);
    });

    it('should handle trailing slash normalization', () => {
      const state = getCartVisibilityState('/about/', true);

      expect(state.currentPath).toBe('/about');
      expect(state.rule).toBe('withItems');
      expect(state.shouldShow).toBe(true);
    });

    it('should handle boolean coercion for hasItems', () => {
      const state1 = getCartVisibilityState('/about', 0);
      const state2 = getCartVisibilityState('/about', 1);

      expect(state1.hasItems).toBe(false);
      expect(state2.hasItems).toBe(true);
    });
  });

  describe('isValidPagePath', () => {
    it('should validate absolute paths', () => {
      expect(isValidPagePath('/tickets')).toBe(true);
      expect(isValidPagePath('/about/festival')).toBe(true);
      expect(isValidPagePath('/')).toBe(true);
    });

    it('should validate relative paths', () => {
      expect(isValidPagePath('./tickets')).toBe(true);
      expect(isValidPagePath('../about')).toBe(true);
    });

    it('should reject URL schemes', () => {
      expect(isValidPagePath('https://example.com')).toBe(false);
      expect(isValidPagePath('http://localhost')).toBe(false);
      expect(isValidPagePath('ftp://server')).toBe(false);
    });

    it('should reject invalid inputs', () => {
      expect(isValidPagePath(null)).toBe(false);
      expect(isValidPagePath(undefined)).toBe(false);
      expect(isValidPagePath('')).toBe(false);
      expect(isValidPagePath(123)).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isValidPagePath('tickets')).toBe(true); // No leading slash
      expect(isValidPagePath('#section')).toBe(true); // Fragment
      expect(isValidPagePath('?query=value')).toBe(true); // Query only
    });
  });

  describe('getPagesByRule', () => {
    it('should return pages for "always" rule', () => {
      const pages = getPagesByRule('always');
      expect(pages).toEqual(PAGE_VISIBILITY_CONFIG.alwaysShow);
      expect(pages).toContain('/tickets');
      expect(pages).toContain('/donations');
    });

    it('should return pages for "never" rule', () => {
      const pages = getPagesByRule('never');
      expect(pages).toEqual(PAGE_VISIBILITY_CONFIG.neverShow);
      expect(pages).toContain('/404');
      expect(pages).toContain('/index.html');
    });

    it('should return pages for "withItems" rule', () => {
      const pages = getPagesByRule('withItems');
      expect(pages).toEqual(PAGE_VISIBILITY_CONFIG.showWithItems);
      expect(pages).toContain('/about');
      expect(pages).toContain('/');
    });

    it('should return empty array for invalid rules', () => {
      expect(getPagesByRule('invalid')).toEqual([]);
      expect(getPagesByRule(null)).toEqual([]);
      expect(getPagesByRule(undefined)).toEqual([]);
    });

    it('should return copies, not references', () => {
      const pages = getPagesByRule('always');
      pages.push('/test');

      // Original config should be unchanged
      expect(PAGE_VISIBILITY_CONFIG.alwaysShow).not.toContain('/test');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete shopping flow visibility', () => {
      // Start on home page (no items)
      expect(determineCartVisibility('/', false)).toBe(false);

      // Go to tickets page (always show)
      expect(determineCartVisibility('/tickets', false)).toBe(true);

      // Add items and go to about page (show with items)
      expect(determineCartVisibility('/about', true)).toBe(true);

      // Error page (never show, even with items)
      expect(determineCartVisibility('/404', true)).toBe(false);
    });

    it('should maintain consistency across similar paths', () => {
      const paths = ['/tickets', '/tickets/', '/tickets/special'];
      const hasItems = [true, false];

      paths.forEach(path => {
        hasItems.forEach(items => {
          expect(determineCartVisibility(path, items)).toBe(true);
        });
      });
    });

    it('should handle complex routing scenarios', () => {
      const scenarios = [
        { path: '/about', items: false, expected: false },
        { path: '/about', items: true, expected: true },
        { path: '/tickets', items: false, expected: true },
        { path: '/tickets', items: true, expected: true },
        { path: '/404', items: false, expected: false },
        { path: '/404', items: true, expected: false },
      ];

      scenarios.forEach(({ path, items, expected }) => {
        expect(determineCartVisibility(path, items)).toBe(expected);
      });
    });
  });
});
/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Tests for detectTestMode() method in CartManager
// Verifies client-side test mode detection from URL parameters, localStorage, and environment
describe('Test Mode Detection', () => {
  let mockWindow;
  let mockLocalStorage;

  beforeEach(() => {
    // Mock analytics tracker
    vi.doMock('../../../js/lib/analytics-tracker.js', () => ({
      getAnalyticsTracker: () => ({
        track: vi.fn(),
        trackCartEvent: vi.fn()
      })
    }));

    // Mock window and localStorage for browser environment tests
    mockLocalStorage = {
      items: {},
      getItem: vi.fn((key) => mockLocalStorage.items[key] || null),
      setItem: vi.fn((key, value) => {
        mockLocalStorage.items[key] = value;
      }),
      removeItem: vi.fn((key) => {
        delete mockLocalStorage.items[key];
      }),
      clear: vi.fn(() => {
        mockLocalStorage.items = {};
      })
    };

    mockWindow = {
      location: {
        search: '',
        hostname: 'localhost',
        port: '3000'
      },
      localStorage: mockLocalStorage,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    };

    // Mock global window
    global.window = mockWindow;
    global.localStorage = mockLocalStorage;
    global.URLSearchParams = vi.fn().mockImplementation((search) => {
      const params = new Map();
      if (search) {
        const pairs = search.substring(1).split('&');
        pairs.forEach(pair => {
          const [key, value] = pair.split('=');
          if (key && value) {
            params.set(key, decodeURIComponent(value));
          }
        });
      }
      return {
        get: (key) => params.get(key),
        has: (key) => params.has(key),
        set: (key, value) => params.set(key, value)
      };
    });
    global.document = {
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete global.window;
    delete global.localStorage;
    delete global.URLSearchParams;
    delete global.document;
  });

  describe('URL Parameter Detection', () => {
    it('should detect test mode from URL parameter', () => {
      mockWindow.location.search = '?test_mode=true';

      // Import cart manager after setting up mocks
      const { CartManager } = require('../../../js/lib/cart-manager.js');
      const cartManager = new CartManager();

      expect(cartManager.detectTestMode()).toBe(true);
    });

    it('should not detect test mode with false URL parameter', () => {
      mockWindow.location.search = '?test_mode=false';

      const { CartManager } = require('../../../js/lib/cart-manager.js');
      const cartManager = new CartManager();

      expect(cartManager.detectTestMode()).toBe(false);
    });

    it('should handle missing URL parameter', () => {
      mockWindow.location.search = '';

      const { CartManager } = require('../../../js/lib/cart-manager.js');
      const cartManager = new CartManager();

      expect(cartManager.detectTestMode()).toBe(false);
    });

    it('should handle multiple URL parameters', () => {
      mockWindow.location.search = '?debug=true&test_mode=true&other=value';

      const { CartManager } = require('../../../js/lib/cart-manager.js');
      const cartManager = new CartManager();

      expect(cartManager.detectTestMode()).toBe(true);
    });
  });

  describe('LocalStorage Detection', () => {
    it('should detect test mode from localStorage cart_test_mode', () => {
      mockLocalStorage.items['cart_test_mode'] = 'true';
      mockWindow.location.search = '';

      const { CartManager } = require('../../../js/lib/cart-manager.js');
      const cartManager = new CartManager();

      expect(cartManager.detectTestMode()).toBe(true);
    });

    it('should detect test mode from localStorage admin_test_session', () => {
      mockLocalStorage.items['admin_test_session'] = 'true';
      mockWindow.location.search = '';

      const { CartManager } = require('../../../js/lib/cart-manager.js');
      const cartManager = new CartManager();

      expect(cartManager.detectTestMode()).toBe(true);
    });

    it('should not detect test mode with false localStorage values', () => {
      mockLocalStorage.items['cart_test_mode'] = 'false';
      mockLocalStorage.items['admin_test_session'] = 'false';
      mockWindow.location.search = '';

      const { CartManager } = require('../../../js/lib/cart-manager.js');
      const cartManager = new CartManager();

      expect(cartManager.detectTestMode()).toBe(false);
    });
  });

  describe('Priority and Precedence', () => {
    it('should prioritize URL parameter over localStorage', () => {
      mockLocalStorage.items['cart_test_mode'] = 'false';
      mockWindow.location.search = '?test_mode=true';

      const { CartManager } = require('../../../js/lib/cart-manager.js');
      const cartManager = new CartManager();

      expect(cartManager.detectTestMode()).toBe(true);
    });

    it('should use localStorage when URL parameter is not present', () => {
      mockLocalStorage.items['cart_test_mode'] = 'true';
      mockWindow.location.search = '';

      const { CartManager } = require('../../../js/lib/cart-manager.js');
      const cartManager = new CartManager();

      expect(cartManager.detectTestMode()).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined window', () => {
      delete global.window;

      const { CartManager } = require('../../../js/lib/cart-manager.js');
      const cartManager = new CartManager();

      expect(cartManager.detectTestMode()).toBe(false);
    });

    it('should handle missing URLSearchParams', () => {
      global.URLSearchParams = undefined;
      mockWindow.location.search = '?test_mode=true';

      const { CartManager } = require('../../../js/lib/cart-manager.js');
      const cartManager = new CartManager();

      // Should not throw error
      expect(() => cartManager.detectTestMode()).not.toThrow();
    });

    it('should handle localStorage errors', () => {
      mockLocalStorage.getItem = vi.fn(() => {
        throw new Error('localStorage error');
      });

      const { CartManager } = require('../../../js/lib/cart-manager.js');
      const cartManager = new CartManager();

      // Should not throw error and default to false
      expect(cartManager.detectTestMode()).toBe(false);
    });
  });

  describe('Environment-Based Detection', () => {
    it('should detect test mode in development environment', () => {
      mockWindow.location.hostname = 'localhost';
      mockWindow.location.port = '3000';
      mockLocalStorage.items['cart_test_mode'] = 'true';

      const { CartManager } = require('../../../js/lib/cart-manager.js');
      const cartManager = new CartManager();

      expect(cartManager.detectTestMode()).toBe(true);
    });

    it('should detect test mode in staging environment', () => {
      mockWindow.location.hostname = 'staging.example.com';
      mockLocalStorage.items['admin_test_session'] = 'true';

      const { CartManager } = require('../../../js/lib/cart-manager.js');
      const cartManager = new CartManager();

      expect(cartManager.detectTestMode()).toBe(true);
    });
  });
});
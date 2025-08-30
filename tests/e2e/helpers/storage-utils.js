/**
 * Storage Utilities for E2E Tests
 * 
 * Provides utilities for managing browser storage (localStorage, sessionStorage)
 * with test isolation to prevent conflicts between parallel test execution.
 */

import { getTestNamespace } from './test-isolation.js';

/**
 * Test-isolated localStorage operations
 */
class TestLocalStorage {
  constructor(testTitle) {
    this.testTitle = testTitle;
    this.namespace = getTestNamespace(testTitle);
    this.prefix = `test_${this.namespace}_`;
  }

  /**
   * Set item in localStorage with test namespace
   */
  async setItem(page, key, value) {
    const namespacedKey = `${this.prefix}${key}`;
    await page.evaluate(
      ({ key, value }) => localStorage.setItem(key, value),
      { key: namespacedKey, value: JSON.stringify(value) }
    );
  }

  /**
   * Get item from localStorage with test namespace
   */
  async getItem(page, key) {
    const namespacedKey = `${this.prefix}${key}`;
    const value = await page.evaluate(
      ({ key }) => localStorage.getItem(key),
      { key: namespacedKey }
    );
    return value ? JSON.parse(value) : null;
  }

  /**
   * Remove item from localStorage with test namespace
   */
  async removeItem(page, key) {
    const namespacedKey = `${this.prefix}${key}`;
    await page.evaluate(
      ({ key }) => localStorage.removeItem(key),
      { key: namespacedKey }
    );
  }

  /**
   * Clear all test items from localStorage
   */
  async clear(page) {
    await page.evaluate(
      ({ prefix }) => {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(prefix)) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
      },
      { prefix: this.prefix }
    );
  }

  /**
   * Get all test items from localStorage
   */
  async getAllItems(page) {
    return await page.evaluate(
      ({ prefix }) => {
        const items = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(prefix)) {
            const originalKey = key.replace(prefix, '');
            items[originalKey] = JSON.parse(localStorage.getItem(key));
          }
        }
        return items;
      },
      { prefix: this.prefix }
    );
  }
}

/**
 * Test-isolated sessionStorage operations
 */
class TestSessionStorage {
  constructor(testTitle) {
    this.testTitle = testTitle;
    this.namespace = getTestNamespace(testTitle);
    this.prefix = `test_${this.namespace}_`;
  }

  /**
   * Set item in sessionStorage with test namespace
   */
  async setItem(page, key, value) {
    const namespacedKey = `${this.prefix}${key}`;
    await page.evaluate(
      ({ key, value }) => sessionStorage.setItem(key, value),
      { key: namespacedKey, value: JSON.stringify(value) }
    );
  }

  /**
   * Get item from sessionStorage with test namespace
   */
  async getItem(page, key) {
    const namespacedKey = `${this.prefix}${key}`;
    const value = await page.evaluate(
      ({ key }) => sessionStorage.getItem(key),
      { key: namespacedKey }
    );
    return value ? JSON.parse(value) : null;
  }

  /**
   * Clear all test items from sessionStorage
   */
  async clear(page) {
    await page.evaluate(
      ({ prefix }) => {
        const keysToRemove = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && key.startsWith(prefix)) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => sessionStorage.removeItem(key));
      },
      { prefix: this.prefix }
    );
  }
}

/**
 * Shopping cart storage utilities
 */
class TestCartStorage extends TestLocalStorage {
  constructor(testTitle) {
    super(testTitle);
    this.cartKey = 'cart';
  }

  /**
   * Set cart data
   */
  async setCart(page, cartData) {
    await this.setItem(page, this.cartKey, cartData);
  }

  /**
   * Get cart data
   */
  async getCart(page) {
    return await this.getItem(page, this.cartKey) || [];
  }

  /**
   * Add item to cart
   */
  async addToCart(page, item) {
    const cart = await this.getCart(page);
    cart.push(item);
    await this.setCart(page, cart);
  }

  /**
   * Clear cart
   */
  async clearCart(page) {
    await this.setItem(page, this.cartKey, []);
  }

  /**
   * Get cart item count
   */
  async getCartItemCount(page) {
    const cart = await this.getCart(page);
    return cart.reduce((total, item) => total + (item.quantity || 1), 0);
  }
}

/**
 * User preferences storage utilities
 */
class TestUserPreferences extends TestLocalStorage {
  constructor(testTitle) {
    super(testTitle);
  }

  /**
   * Set user preference
   */
  async setPreference(page, key, value) {
    const prefs = await this.getItem(page, 'userPreferences') || {};
    prefs[key] = value;
    await this.setItem(page, 'userPreferences', prefs);
  }

  /**
   * Get user preference
   */
  async getPreference(page, key, defaultValue = null) {
    const prefs = await this.getItem(page, 'userPreferences') || {};
    return prefs[key] !== undefined ? prefs[key] : defaultValue;
  }

  /**
   * Set theme preference
   */
  async setTheme(page, theme) {
    await this.setPreference(page, 'theme', theme);
  }

  /**
   * Get theme preference
   */
  async getTheme(page) {
    return await this.getPreference(page, 'theme', 'light');
  }
}

/**
 * Admin session storage utilities
 */
class TestAdminStorage extends TestSessionStorage {
  constructor(testTitle) {
    super(testTitle);
  }

  /**
   * Set admin session
   */
  async setAdminSession(page, sessionData) {
    await this.setItem(page, 'adminSession', {
      ...sessionData,
      timestamp: Date.now(),
      namespace: this.namespace
    });
  }

  /**
   * Get admin session
   */
  async getAdminSession(page) {
    return await this.getItem(page, 'adminSession');
  }

  /**
   * Clear admin session
   */
  async clearAdminSession(page) {
    await this.removeItem(page, 'adminSession');
  }

  /**
   * Check if admin is authenticated
   */
  async isAdminAuthenticated(page) {
    const session = await this.getAdminSession(page);
    return session && session.isAuthenticated;
  }
}

/**
 * Generic storage utilities
 */
class TestStorageUtils {
  constructor(testTitle) {
    this.testTitle = testTitle;
    this.localStorage = new TestLocalStorage(testTitle);
    this.sessionStorage = new TestSessionStorage(testTitle);
    this.cart = new TestCartStorage(testTitle);
    this.preferences = new TestUserPreferences(testTitle);
    this.admin = new TestAdminStorage(testTitle);
  }

  /**
   * Clear all test storage
   */
  async clearAll(page) {
    await this.localStorage.clear(page);
    await this.sessionStorage.clear(page);
    console.log(`🧹 Cleared all storage for test: ${this.testTitle}`);
  }

  /**
   * Setup clean storage state for test
   */
  async setupCleanState(page) {
    await this.clearAll(page);
    console.log(`✨ Clean storage state setup for test: ${this.testTitle}`);
  }

  /**
   * Get all storage data for debugging
   */
  async getAllStorageData(page) {
    const localStorage = await this.localStorage.getAllItems(page);
    const sessionStorage = await this.sessionStorage.getAllItems ? 
      await this.sessionStorage.getAllItems(page) : {};
    
    return {
      localStorage,
      sessionStorage,
      cart: await this.cart.getCart(page),
      adminSession: await this.admin.getAdminSession(page)
    };
  }

  /**
   * Wait for storage to persist
   */
  async waitForStoragePersistence(page, timeout = 1000) {
    await page.waitForTimeout(timeout);
  }
}

/**
 * Factory function to create storage utilities for a test
 * @param {string} testTitle - Title of the test
 * @returns {TestStorageUtils} Storage utilities instance
 */
export function createStorageUtils(testTitle) {
  return new TestStorageUtils(testTitle);
}

/**
 * Storage operation helpers
 */
export const StorageHelpers = {
  /**
   * Wait for localStorage to be available
   */
  async waitForLocalStorage(page, timeout = 5000) {
    await page.waitForFunction(
      () => typeof window.localStorage !== 'undefined',
      { timeout }
    );
  },

  /**
   * Wait for sessionStorage to be available
   */
  async waitForSessionStorage(page, timeout = 5000) {
    await page.waitForFunction(
      () => typeof window.sessionStorage !== 'undefined',
      { timeout }
    );
  },

  /**
   * Monitor storage changes
   */
  async monitorStorageChanges(page, callback) {
    await page.evaluate(() => {
      window.addEventListener('storage', (e) => {
        console.log('Storage change detected:', {
          key: e.key,
          oldValue: e.oldValue,
          newValue: e.newValue,
          storageArea: e.storageArea === localStorage ? 'localStorage' : 'sessionStorage'
        });
      });
    });
  },

  /**
   * Simulate storage quota exceeded
   */
  async simulateStorageQuotaExceeded(page) {
    await page.evaluate(() => {
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = function(key, value) {
        throw new Error('QuotaExceededError: Failed to execute setItem on Storage');
      };
      
      // Restore after 1 second
      setTimeout(() => {
        localStorage.setItem = originalSetItem;
      }, 1000);
    });
  }
};

// Export everything
export {
  TestLocalStorage,
  TestSessionStorage,
  TestCartStorage,
  TestUserPreferences,
  TestAdminStorage,
  TestStorageUtils
};
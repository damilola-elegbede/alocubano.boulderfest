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
    try {
      await page.evaluate(
        ({ key, value }) => {
          try {
            if (typeof window !== 'undefined' && window.localStorage) {
              localStorage.setItem(key, value);
              return true;
            }
            return false;
          } catch (e) {
            console.warn('localStorage.setItem failed:', e.message);
            return false;
          }
        },
        { key: namespacedKey, value: JSON.stringify(value) }
      );
    } catch (error) {
      console.warn(`Failed to set localStorage item "${key}":`, error.message);
    }
  }

  /**
   * Get item from localStorage with test namespace
   */
  async getItem(page, key) {
    const namespacedKey = `${this.prefix}${key}`;
    try {
      const value = await page.evaluate(
        ({ key }) => {
          try {
            if (typeof window !== 'undefined' && window.localStorage) {
              return localStorage.getItem(key);
            }
            return null;
          } catch (e) {
            console.warn('localStorage.getItem failed:', e.message);
            return null;
          }
        },
        { key: namespacedKey }
      );
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.warn(`Failed to get localStorage item "${key}":`, error.message);
      return null;
    }
  }

  /**
   * Remove item from localStorage with test namespace
   */
  async removeItem(page, key) {
    const namespacedKey = `${this.prefix}${key}`;
    try {
      await page.evaluate(
        ({ key }) => {
          try {
            if (typeof window !== 'undefined' && window.localStorage) {
              localStorage.removeItem(key);
              return true;
            }
            return false;
          } catch (e) {
            console.warn('localStorage.removeItem failed:', e.message);
            return false;
          }
        },
        { key: namespacedKey }
      );
    } catch (error) {
      console.warn(`Failed to remove localStorage item "${key}":`, error.message);
    }
  }

  /**
   * Clear all test items from localStorage
   */
  async clear(page) {
    try {
      await page.evaluate(
        ({ prefix }) => {
          try {
            if (typeof window !== 'undefined' && window.localStorage) {
              const keysToRemove = [];
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(prefix)) {
                  keysToRemove.push(key);
                }
              }
              keysToRemove.forEach(key => {
                try {
                  localStorage.removeItem(key);
                } catch (e) {
                  console.warn('Failed to remove localStorage key:', key, e.message);
                }
              });
              return keysToRemove.length;
            }
            return 0;
          } catch (e) {
            console.warn('localStorage.clear operation failed:', e.message);
            return 0;
          }
        },
        { prefix: this.prefix }
      );
    } catch (error) {
      console.warn('Failed to clear localStorage:', error.message);
    }
  }

  /**
   * Get all test items from localStorage
   */
  async getAllItems(page) {
    try {
      return await page.evaluate(
        ({ prefix }) => {
          try {
            if (typeof window === 'undefined' || !window.localStorage) {
              return {};
            }
            const items = {};
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key && key.startsWith(prefix)) {
                try {
                  const originalKey = key.replace(prefix, '');
                  const value = localStorage.getItem(key);
                  items[originalKey] = value ? JSON.parse(value) : null;
                } catch (e) {
                  console.warn('Failed to parse localStorage item:', key, e.message);
                }
              }
            }
            return items;
          } catch (e) {
            console.warn('localStorage.getAllItems failed:', e.message);
            return {};
          }
        },
        { prefix: this.prefix }
      );
    } catch (error) {
      console.warn('Failed to get all localStorage items:', error.message);
      return {};
    }
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
    try {
      await page.evaluate(
        ({ key, value }) => {
          try {
            if (typeof window !== 'undefined' && window.sessionStorage) {
              sessionStorage.setItem(key, value);
              return true;
            }
            return false;
          } catch (e) {
            console.warn('sessionStorage.setItem failed:', e.message);
            return false;
          }
        },
        { key: namespacedKey, value: JSON.stringify(value) }
      );
    } catch (error) {
      console.warn(`Failed to set sessionStorage item "${key}":`, error.message);
    }
  }

  /**
   * Get item from sessionStorage with test namespace
   */
  async getItem(page, key) {
    const namespacedKey = `${this.prefix}${key}`;
    try {
      const value = await page.evaluate(
        ({ key }) => {
          try {
            if (typeof window !== 'undefined' && window.sessionStorage) {
              return sessionStorage.getItem(key);
            }
            return null;
          } catch (e) {
            console.warn('sessionStorage.getItem failed:', e.message);
            return null;
          }
        },
        { key: namespacedKey }
      );
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.warn(`Failed to get sessionStorage item "${key}":`, error.message);
      return null;
    }
  }

  /**
   * Clear all test items from sessionStorage
   */
  async clear(page) {
    try {
      await page.evaluate(
        ({ prefix }) => {
          try {
            if (typeof window !== 'undefined' && window.sessionStorage) {
              const keysToRemove = [];
              for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                if (key && key.startsWith(prefix)) {
                  keysToRemove.push(key);
                }
              }
              keysToRemove.forEach(key => {
                try {
                  sessionStorage.removeItem(key);
                } catch (e) {
                  console.warn('Failed to remove sessionStorage key:', key, e.message);
                }
              });
              return keysToRemove.length;
            }
            return 0;
          } catch (e) {
            console.warn('sessionStorage.clear operation failed:', e.message);
            return 0;
          }
        },
        { prefix: this.prefix }
      );
    } catch (error) {
      console.warn('Failed to clear sessionStorage:', error.message);
    }
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
    try {
      await page.waitForFunction(
        () => {
          try {
            return typeof window !== 'undefined' &&
                   typeof window.localStorage !== 'undefined' &&
                   window.localStorage !== null;
          } catch (e) {
            return false;
          }
        },
        { timeout }
      );
      return true;
    } catch (error) {
      console.warn('localStorage is not available within timeout:', error.message);
      return false;
    }
  },

  /**
   * Wait for sessionStorage to be available
   */
  async waitForSessionStorage(page, timeout = 5000) {
    try {
      await page.waitForFunction(
        () => {
          try {
            return typeof window !== 'undefined' &&
                   typeof window.sessionStorage !== 'undefined' &&
                   window.sessionStorage !== null;
          } catch (e) {
            return false;
          }
        },
        { timeout }
      );
      return true;
    } catch (error) {
      console.warn('sessionStorage is not available within timeout:', error.message);
      return false;
    }
  },

  /**
   * Monitor storage changes
   */
  async monitorStorageChanges(page, callback) {
    try {
      await page.evaluate(() => {
        try {
          if (typeof window !== 'undefined') {
            window.addEventListener('storage', (e) => {
              console.log('Storage change detected:', {
                key: e.key,
                oldValue: e.oldValue,
                newValue: e.newValue,
                storageArea: e.storageArea === (window.localStorage || null) ? 'localStorage' : 'sessionStorage'
              });
            });
          }
        } catch (e) {
          console.warn('Failed to setup storage monitoring:', e.message);
        }
      });
    } catch (error) {
      console.warn('Failed to monitor storage changes:', error.message);
    }
  },

  /**
   * Simulate storage quota exceeded
   */
  async simulateStorageQuotaExceeded(page) {
    try {
      await page.evaluate(() => {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            const originalSetItem = localStorage.setItem;
            localStorage.setItem = function(key, value) {
              throw new Error('QuotaExceededError: Failed to execute setItem on Storage');
            };

            // Restore after 1 second
            setTimeout(() => {
              localStorage.setItem = originalSetItem;
            }, 1000);
          }
        } catch (e) {
          console.warn('Failed to simulate storage quota exceeded:', e.message);
        }
      });
    } catch (error) {
      console.warn('Failed to setup storage quota simulation:', error.message);
    }
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
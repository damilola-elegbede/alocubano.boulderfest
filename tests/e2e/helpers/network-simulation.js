/**
 * Network Simulation Helper
 * Provides comprehensive network simulation capabilities for E2E testing
 * Addresses critical issues: proper CDP API integration, cleanup management, and real network conditions
 */

export class NetworkSimulator {
  constructor(page) {
    this.page = page;
    this.context = page.context();
    this.cdpSession = null;
    this.activeRoutes = new Set();
    this.eventListeners = new Set();
    this.isCleanedUp = false;
    this.originalNetworkState = null;
  }

  /**
   * Initialize CDP session for network emulation
   * @private
   */
  async _initializeCDPSession() {
    if (!this.cdpSession) {
      try {
        this.cdpSession = await this.context.newCDPSession(this.page);
        await this.cdpSession.send('Network.enable');

        // Store original network state for cleanup
        this.originalNetworkState = {
          offline: false,
          downloadThroughput: -1,
          uploadThroughput: -1,
          latency: 0
        };
      } catch (error) {
        console.warn('Failed to initialize CDP session for network emulation:', error);
        throw new Error(`CDP session initialization failed: ${error.message}`);
      }
    }
    return this.cdpSession;
  }

  /**
   * Simulate various network conditions using Chrome DevTools Protocol
   * @param {string|Object} condition - Predefined condition name or custom condition object
   */
  async simulateNetworkCondition(condition) {
    if (this.isCleanedUp) {
      throw new Error('NetworkSimulator has been cleaned up and cannot be used');
    }

    const cdpSession = await this._initializeCDPSession();

    let networkParams;

    if (typeof condition === 'string') {
      networkParams = this._getPresetNetworkCondition(condition);
    } else {
      networkParams = condition;
    }

    if (!networkParams) {
      throw new Error(`Unknown network condition: ${condition}`);
    }

    try {
      // Apply network conditions via CDP
      await cdpSession.send('Network.emulateNetworkConditions', networkParams);

      // Also set offline state at context level for broader compatibility
      if (networkParams.offline !== undefined) {
        await this.context.setOffline(networkParams.offline);
      }

      return networkParams;
    } catch (error) {
      console.error('Failed to apply network condition:', error);
      throw new Error(`Network condition simulation failed: ${error.message}`);
    }
  }

  /**
   * Get preset network conditions
   * @param {string} condition - Condition name
   * @returns {Object} Network parameters
   * @private
   */
  _getPresetNetworkCondition(condition) {
    const presets = {
      'offline': {
        offline: true,
        downloadThroughput: 0,
        uploadThroughput: 0,
        latency: 0
      },
      'slow-3g': {
        offline: false,
        downloadThroughput: 50 * 1024, // 50 KB/s
        uploadThroughput: 50 * 1024,   // 50 KB/s
        latency: 2000 // 2s
      },
      'fast-3g': {
        offline: false,
        downloadThroughput: 150 * 1024, // 150 KB/s
        uploadThroughput: 150 * 1024,   // 150 KB/s
        latency: 562.5
      },
      '4g': {
        offline: false,
        downloadThroughput: 1600 * 1024, // 1.6 MB/s
        uploadThroughput: 750 * 1024,    // 750 KB/s
        latency: 150
      },
      'wifi': {
        offline: false,
        downloadThroughput: 10 * 1024 * 1024, // 10 MB/s
        uploadThroughput: 5 * 1024 * 1024,    // 5 MB/s
        latency: 10
      }
    };

    return presets[condition];
  }

  /**
   * Simulate intermittent connectivity
   * @param {Object} options - Configuration for intermittent connectivity
   * @param {number} options.intervalMs - Interval between toggles
   * @param {number} options.duration - Total duration in ms
   * @param {boolean} options.startOnline - Whether to start online
   */
  async simulateIntermittentConnectivity(options = {}) {
    if (this.isCleanedUp) {
      throw new Error('NetworkSimulator has been cleaned up and cannot be used');
    }

    const {
      intervalMs = 2000,
      duration = 10000,
      startOnline = true
    } = options;

    const cdpSession = await this._initializeCDPSession();
    let isOnline = startOnline;
    let toggleCount = 0;
    const maxToggles = Math.floor(duration / intervalMs);

    return new Promise((resolve) => {
      const toggleInterval = setInterval(async () => {
        try {
          isOnline = !isOnline;
          toggleCount++;

          await cdpSession.send('Network.emulateNetworkConditions', {
            offline: !isOnline,
            downloadThroughput: isOnline ? -1 : 0,
            uploadThroughput: isOnline ? -1 : 0,
            latency: 0
          });

          await this.context.setOffline(!isOnline);

          if (toggleCount >= maxToggles) {
            clearInterval(toggleInterval);
            // End in online state
            await this.restoreNetworkConditions();
            resolve({ toggleCount, finalState: 'online' });
          }
        } catch (error) {
          clearInterval(toggleInterval);
          console.error('Error during intermittent connectivity simulation:', error);
          resolve({ error: error.message, toggleCount });
        }
      }, intervalMs);

      // Store interval for cleanup
      this.eventListeners.add(() => clearInterval(toggleInterval));
    });
  }

  /**
   * Add request interception with network delays
   * @param {string|RegExp} urlPattern - URL pattern to intercept
   * @param {Object} options - Interception options
   * @param {number} options.delayMs - Delay in milliseconds
   * @param {number} options.failureRate - Failure rate (0-1)
   * @param {string} options.failureStatus - HTTP status for failures
   */
  async addRequestInterception(urlPattern, options = {}) {
    if (this.isCleanedUp) {
      throw new Error('NetworkSimulator has been cleaned up and cannot be used');
    }

    const {
      delayMs = 0,
      failureRate = 0,
      failureStatus = 'failed'
    } = options;

    let requestCount = 0;

    const routeHandler = async (route) => {
      requestCount++;

      // Apply delay if specified
      if (delayMs > 0) {
        await this.page.waitForTimeout(delayMs);
      }

      // Apply failure rate
      if (failureRate > 0 && Math.random() < failureRate) {
        if (typeof failureStatus === 'string') {
          await route.abort(failureStatus);
        } else {
          await route.fulfill({
            status: failureStatus,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Network simulation failure' })
          });
        }
        return;
      }

      // Continue normally
      await route.continue();
    };

    await this.page.route(urlPattern, routeHandler);
    this.activeRoutes.add({ pattern: urlPattern, handler: routeHandler });

    return {
      getRequestCount: () => requestCount,
      remove: async () => {
        await this.page.unroute(urlPattern, routeHandler);
        this.activeRoutes.delete({ pattern: urlPattern, handler: routeHandler });
      }
    };
  }

  /**
   * Simulate API timeout scenarios
   * @param {string|RegExp} urlPattern - API endpoint pattern
   * @param {Object} options - Timeout options
   * @param {number} options.timeoutMs - Timeout duration
   * @param {number} options.maxRetries - Maximum retry attempts before success
   */
  async simulateAPITimeout(urlPattern, options = {}) {
    if (this.isCleanedUp) {
      throw new Error('NetworkSimulator has been cleaned up and cannot be used');
    }

    const { timeoutMs = 5000, maxRetries = 2 } = options;
    let requestCount = 0;

    const routeHandler = async (route) => {
      requestCount++;

      if (requestCount <= maxRetries) {
        // Simulate timeout by not responding
        setTimeout(() => {
          route.abort('timedout').catch(() => {
            // Ignore errors if route already handled
          });
        }, timeoutMs);
      } else {
        // Allow subsequent requests to succeed
        await route.continue();
      }
    };

    await this.page.route(urlPattern, routeHandler);
    this.activeRoutes.add({ pattern: urlPattern, handler: routeHandler });

    return {
      getRequestCount: () => requestCount,
      remove: async () => {
        await this.page.unroute(urlPattern, routeHandler);
        this.activeRoutes.delete({ pattern: urlPattern, handler: routeHandler });
      }
    };
  }

  /**
   * Simulate slow loading resources (images, assets)
   * @param {string|RegExp} urlPattern - Resource pattern
   * @param {number} delayMs - Delay in milliseconds
   */
  async simulateSlowResources(urlPattern, delayMs = 1000) {
    if (this.isCleanedUp) {
      throw new Error('NetworkSimulator has been cleaned up and cannot be used');
    }

    const routeHandler = async (route) => {
      await this.page.waitForTimeout(delayMs);

      // For images, provide a minimal valid response
      if (route.request().resourceType() === 'image') {
        await route.fulfill({
          status: 200,
          contentType: 'image/jpeg',
          body: Buffer.from([
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
            0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
            0xFF, 0xD9
          ])
        });
      } else {
        await route.continue();
      }
    };

    await this.page.route(urlPattern, routeHandler);
    this.activeRoutes.add({ pattern: urlPattern, handler: routeHandler });

    return {
      remove: async () => {
        await this.page.unroute(urlPattern, routeHandler);
        this.activeRoutes.delete({ pattern: urlPattern, handler: routeHandler });
      }
    };
  }

  /**
   * Restore original network conditions
   */
  async restoreNetworkConditions() {
    if (this.isCleanedUp) {
      return;
    }

    try {
      if (this.cdpSession && this.originalNetworkState) {
        await this.cdpSession.send('Network.emulateNetworkConditions', this.originalNetworkState);
      }

      // Restore context offline state
      await this.context.setOffline(false);
    } catch (error) {
      console.warn('Failed to restore network conditions:', error);
    }
  }

  /**
   * Get current network status
   * @returns {Object} Current network status
   */
  async getNetworkStatus() {
    if (this.isCleanedUp) {
      throw new Error('NetworkSimulator has been cleaned up and cannot be used');
    }

    const isOffline = await this.page.evaluate(() => !navigator.onLine);

    return {
      offline: isOffline,
      activeRoutes: this.activeRoutes.size,
      hasListeners: this.eventListeners.size > 0,
      hasCDPSession: !!this.cdpSession
    };
  }

  /**
   * Comprehensive cleanup of all network simulation resources
   * Critical for preventing memory leaks and test interference
   */
  async cleanup() {
    if (this.isCleanedUp) {
      return;
    }

    try {
      // Clean up event listeners
      for (const cleanup of this.eventListeners) {
        if (typeof cleanup === 'function') {
          cleanup();
        }
      }
      this.eventListeners.clear();

      // Remove all active routes
      for (const routeInfo of this.activeRoutes) {
        try {
          await this.page.unroute(routeInfo.pattern, routeInfo.handler);
        } catch (error) {
          console.warn('Failed to remove route:', error);
        }
      }
      this.activeRoutes.clear();

      // Restore network conditions
      await this.restoreNetworkConditions();

      // Close CDP session
      if (this.cdpSession) {
        try {
          await this.cdpSession.send('Network.disable');
          await this.cdpSession.detach();
        } catch (error) {
          console.warn('Failed to cleanup CDP session:', error);
        }
        this.cdpSession = null;
      }

      this.isCleanedUp = true;
    } catch (error) {
      console.error('Error during NetworkSimulator cleanup:', error);
    }
  }
}

/**
 * Convenience function to create a network simulator instance
 * @param {Page} page - Playwright page instance
 * @returns {NetworkSimulator} Network simulator instance
 */
export function createNetworkSimulator(page) {
  return new NetworkSimulator(page);
}

/**
 * Predefined network condition presets
 */
export const NETWORK_CONDITIONS = {
  OFFLINE: 'offline',
  SLOW_3G: 'slow-3g',
  FAST_3G: 'fast-3g',
  FOUR_G: '4g',
  WIFI: 'wifi'
};

/**
 * Test helper for network resilience testing
 * @param {Page} page - Playwright page instance
 * @param {Object} options - Test options
 * @param {string} options.condition - Network condition to test
 * @param {Function} options.testFunction - Function to execute under network condition
 * @param {Object} options.expectations - Expected behaviors
 */
export async function testNetworkResilience(page, options = {}) {
  const {
    condition = NETWORK_CONDITIONS.SLOW_3G,
    testFunction,
    expectations = {}
  } = options;

  const simulator = createNetworkSimulator(page);

  try {
    // Apply network condition
    await simulator.simulateNetworkCondition(condition);

    // Execute test function
    const result = await testFunction();

    // Verify expectations
    if (expectations.maxLoadTime) {
      const startTime = Date.now();
      await page.waitForLoadState('networkidle', { timeout: expectations.maxLoadTime });
      const loadTime = Date.now() - startTime;

      if (loadTime > expectations.maxLoadTime) {
        throw new Error(`Load time ${loadTime}ms exceeded maximum ${expectations.maxLoadTime}ms`);
      }
    }

    return result;
  } finally {
    await simulator.cleanup();
  }
}

export default NetworkSimulator;
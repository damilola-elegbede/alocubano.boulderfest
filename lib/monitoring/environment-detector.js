/**
 * Environment detection utility for monitoring system
 * Helps determine which APIs are available and how to configure monitoring
 */

export class EnvironmentDetector {
  constructor() {
    this.environment = this.detectEnvironment();
    this.capabilities = this.detectCapabilities();
  }

  /**
   * Detect the current runtime environment
   */
  detectEnvironment() {
    // Check if we're in Node.js
    if (typeof process !== 'undefined' && process.versions?.node) {
      // Check if we're in a test environment
      if (process.env.NODE_ENV === 'test') {
        return 'test-node';
      }
      // Check if we're in CI
      if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
        return 'ci-node';
      }
      return 'node';
    }

    // Check if we're in a browser
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      return 'browser';
    }

    // Check if we're in a web worker
    if (typeof self !== 'undefined' && typeof importScripts !== 'undefined') {
      return 'webworker';
    }

    // Check if we're in a service worker
    if (typeof self !== 'undefined' && 'ServiceWorkerGlobalScope' in self) {
      return 'serviceworker';
    }

    return 'unknown';
  }

  /**
   * Detect available capabilities
   */
  detectCapabilities() {
    const capabilities = {
      performance: false,
      performanceObserver: false,
      intersectionObserver: false,
      sendBeacon: false,
      localStorage: false,
      sessionStorage: false,
      fetch: false,
      crypto: false,
      webCrypto: false
    };

    try {
      // Performance API
      if (typeof performance !== 'undefined' && performance.now) {
        capabilities.performance = true;
      }

      // Performance Observer API
      if (typeof PerformanceObserver !== 'undefined') {
        capabilities.performanceObserver = true;
      }

      // Intersection Observer API
      if (typeof IntersectionObserver !== 'undefined') {
        capabilities.intersectionObserver = true;
      }

      // Send Beacon API
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        capabilities.sendBeacon = true;
      }

      // Storage APIs
      if (typeof localStorage !== 'undefined') {
        capabilities.localStorage = true;
      }
      if (typeof sessionStorage !== 'undefined') {
        capabilities.sessionStorage = true;
      }

      // Fetch API
      if (typeof fetch !== 'undefined') {
        capabilities.fetch = true;
      }

      // Crypto APIs
      if (typeof crypto !== 'undefined') {
        capabilities.crypto = true;
        if (crypto.subtle) {
          capabilities.webCrypto = true;
        }
      }
    } catch (error) {
      // Silently handle capability detection errors
    }

    return capabilities;
  }

  /**
   * Get environment-appropriate configuration
   */
  getConfiguration() {
    const config = {
      useNodejsAPIs: false,
      useBrowserAPIs: false,
      enablePerformanceTracking: false,
      enableNetworkTracking: false,
      enableMemoryTracking: false,
      enableErrorTracking: true,
      fallbackToMocks: false
    };

    switch (this.environment) {
      case 'node':
        config.useNodejsAPIs = true;
        config.enablePerformanceTracking = true;
        config.enableMemoryTracking = true;
        break;

      case 'ci-node':
        config.useNodejsAPIs = true;
        config.enablePerformanceTracking = false; // Often unreliable in CI
        config.enableMemoryTracking = false; // Can cause memory issues in CI
        config.enableNetworkTracking = false; // Network may be restricted
        break;

      case 'test-node':
        config.useNodejsAPIs = false; // Use mocks instead
        config.enablePerformanceTracking = false;
        config.enableMemoryTracking = false;
        config.enableNetworkTracking = false;
        config.fallbackToMocks = true;
        break;

      case 'browser':
        config.useBrowserAPIs = true;
        config.enablePerformanceTracking = this.capabilities.performance;
        config.enableNetworkTracking = this.capabilities.fetch;
        config.enableMemoryTracking = this.capabilities.performance;
        break;

      case 'webworker':
      case 'serviceworker':
        config.useBrowserAPIs = true;
        config.enablePerformanceTracking = this.capabilities.performance;
        config.enableNetworkTracking = this.capabilities.fetch;
        config.enableMemoryTracking = false; // Limited in workers
        break;

      default:
        config.fallbackToMocks = true;
        break;
    }

    return config;
  }

  /**
   * Create appropriate performance API based on environment
   */
  async createPerformanceAPI() {
    const config = this.getConfiguration();

    if (config.fallbackToMocks) {
      return this.createMockPerformanceAPI();
    }

    if (config.useNodejsAPIs) {
      try {
        const { performance } = await import('perf_hooks');
        return performance;
      } catch (error) {
        console.warn('Failed to import Node.js perf_hooks:', error.message);
        return this.createMockPerformanceAPI();
      }
    }

    if (config.useBrowserAPIs && this.capabilities.performance) {
      return globalThis.performance || window.performance;
    }

    return this.createMockPerformanceAPI();
  }

  /**
   * Create mock performance API for testing/fallback
   */
  createMockPerformanceAPI() {
    return {
      now: () => Date.now(),
      mark: () => {},
      measure: () => {},
      getEntriesByType: () => [],
      getEntriesByName: () => [],
      clearMarks: () => {},
      clearMeasures: () => {},
      timeOrigin: Date.now(),
      // Add memory if available in the global performance object
      get memory() {
        if (typeof performance !== 'undefined' && performance.memory) {
          return performance.memory;
        }
        return {
          usedJSHeapSize: 1024 * 1024,
          totalJSHeapSize: 2 * 1024 * 1024,
          jsHeapSizeLimit: 4 * 1024 * 1024
        };
      }
    };
  }

  /**
   * Check if current environment is suitable for monitoring
   */
  isMonitoringEnabled() {
    const config = this.getConfiguration();
    return config.enablePerformanceTracking || 
           config.enableMemoryTracking || 
           config.enableNetworkTracking || 
           config.enableErrorTracking;
  }

  /**
   * Get environment info for debugging
   */
  getEnvironmentInfo() {
    return {
      environment: this.environment,
      capabilities: this.capabilities,
      configuration: this.getConfiguration(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      nodeVersion: typeof process !== 'undefined' ? process.version : undefined,
      platform: typeof process !== 'undefined' ? process.platform : undefined
    };
  }
}

// Singleton instance
let environmentDetector = null;

/**
 * Get or create environment detector instance
 */
export function getEnvironmentDetector() {
  if (!environmentDetector) {
    environmentDetector = new EnvironmentDetector();
  }
  return environmentDetector;
}

export default {
  EnvironmentDetector,
  getEnvironmentDetector
};
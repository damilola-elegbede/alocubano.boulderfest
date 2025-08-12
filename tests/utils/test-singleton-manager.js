/**
 * TestSingletonManager - Bulletproof Test Isolation Architecture
 * 
 * Forces complete singleton recreation between tests to eliminate state persistence issues.
 * This component is critical for solving cached mock client issues and ensuring fresh
 * environment validation in each test.
 * 
 * Problem Context:
 * - DatabaseService singleton retains cached state across test boundaries
 * - Current resetDatabaseInstance() only nullifies singleton but doesn't clear internal state
 * - Tests expect fresh environment validation but get cached instances
 * 
 * Solution:
 * - Combine vi.resetModules() with forceful instance state clearing
 * - Provide lifecycle hooks for test boundaries
 * - Ensure complete memory cleanup to prevent leaks
 * 
 * @author Backend Engineer Agent
 * @version 1.0.0
 */

import { vi } from "vitest";

/**
 * Registry for tracking singleton instances and their reset methods
 */
const singletonRegistry = new Map();

/**
 * Performance tracking for reset operations
 */
const performanceTracker = {
  operations: [],
  
  startTimer() {
    return performance.now();
  },
  
  endTimer(startTime, operation) {
    const duration = performance.now() - startTime;
    this.operations.push({ operation, duration, timestamp: Date.now() });
    
    if (duration > 5) {
      console.warn(`TestSingletonManager: Slow operation detected - ${operation} took ${duration.toFixed(2)}ms`);
    }
    
    return duration;
  },
  
  getStats() {
    if (this.operations.length === 0) return null;
    
    const durations = this.operations.map(op => op.duration);
    return {
      totalOperations: this.operations.length,
      averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      maxDuration: Math.max(...durations),
      minDuration: Math.min(...durations),
      recentOperations: this.operations.slice(-5)
    };
  },
  
  reset() {
    this.operations = [];
  }
};

/**
 * TestSingletonManager - Core singleton management for test isolation
 */
export class TestSingletonManager {
  static _boundaryContext = null;
  /**
   * Register a singleton instance for managed reset operations
   * 
   * @param {string} key - Unique identifier for the singleton
   * @param {Object} instance - The singleton instance
   * @param {string|Function} resetMethod - Method name or function to reset instance state
   */
  static registerSingleton(key, instance, resetMethod = 'resetForTesting') {
    if (!key || !instance) {
      throw new Error('TestSingletonManager: Both key and instance are required for registration');
    }

    singletonRegistry.set(key, {
      instance,
      resetMethod,
      registeredAt: Date.now()
    });
  }

  /**
   * Forcefully reset a specific singleton instance
   * Clears all cached state and prepares for fresh initialization
   * 
   * @param {Object} singletonInstance - The singleton instance to reset
   * @param {string|Function} resetMethod - Method name or function to call for reset
   * @returns {boolean} Success status
   */
  static resetSingleton(singletonInstance, resetMethod = 'resetForTesting') {
    const startTime = performanceTracker.startTimer();
    
    try {
      if (!singletonInstance) {
        performanceTracker.endTimer(startTime, 'resetSingleton-null');
        return true; // Nothing to reset
      }

      // Call the reset method if it exists
      if (typeof resetMethod === 'function') {
        resetMethod.call(singletonInstance);
      } else if (typeof resetMethod === 'string' && typeof singletonInstance[resetMethod] === 'function') {
        singletonInstance[resetMethod]();
      } else {
        // Fallback: manually clear common singleton properties
        this._clearCommonSingletonProperties(singletonInstance);
      }

      performanceTracker.endTimer(startTime, 'resetSingleton-success');
      return true;
    } catch (error) {
      performanceTracker.endTimer(startTime, 'resetSingleton-error');
      console.error('TestSingletonManager: Error resetting singleton:', error);
      return false;
    }
  }

  /**
   * Force complete recreation of a module and its singletons
   * Combines vi.resetModules() with instance nullification
   * 
   * @param {string} moduleKey - Identifier for module tracking
   * @returns {Promise<boolean>} Success status
   */
  static async forceRecreation(moduleKey) {
    const startTime = performanceTracker.startTimer();
    
    try {
      // Clear all mocks to prevent interference
      vi.clearAllMocks();
      
      // Force module reset to clear cached imports
      vi.resetModules();
      
      // Clear any registered singleton for this module
      if (singletonRegistry.has(moduleKey)) {
        const { instance, resetMethod } = singletonRegistry.get(moduleKey);
        this.resetSingleton(instance, resetMethod);
        singletonRegistry.delete(moduleKey);
      }

      performanceTracker.endTimer(startTime, 'forceRecreation');
      return true;
    } catch (error) {
      performanceTracker.endTimer(startTime, 'forceRecreation-error');
      console.error('TestSingletonManager: Error in forceRecreation:', error);
      return false;
    }
  }

  /**
   * Clear all registered singleton state
   * Should be called before each test to ensure isolation
   */
  static clearAllState() {
    const startTime = performanceTracker.startTimer();
    
    let successCount = 0;
    let errorCount = 0;

    try {
      // Reset all registered singletons
      for (const [key, { instance, resetMethod }] of singletonRegistry.entries()) {
        if (this.resetSingleton(instance, resetMethod)) {
          successCount++;
        } else {
          errorCount++;
        }
      }

      // Clear the registry
      singletonRegistry.clear();

      // Reset modules to ensure fresh imports
      vi.resetModules();
      vi.clearAllMocks();

      performanceTracker.endTimer(startTime, 'clearAllState');
      
      if (errorCount > 0) {
        console.warn(`TestSingletonManager: ${errorCount} singleton(s) failed to reset, ${successCount} succeeded`);
      }

      return { success: successCount, errors: errorCount };
    } catch (error) {
      performanceTracker.endTimer(startTime, 'clearAllState-error');
      console.error('TestSingletonManager: Error clearing all state:', error);
      return { success: successCount, errors: errorCount + 1 };
    }
  }

  /**
   * Validate that singleton state has been properly cleared
   * Used for debugging and ensuring test isolation
   * 
   * @returns {Object} Validation results
   */
  static validateCleanState() {
    const startTime = performanceTracker.startTimer();
    
    try {
      const validation = {
        timestamp: Date.now(),
        registryEmpty: singletonRegistry.size === 0,
        registeredSingletons: singletonRegistry.size,
        singletonKeys: Array.from(singletonRegistry.keys()),
        memoryStatus: this._getMemoryStatus(),
        performanceStats: performanceTracker.getStats()
      };

      performanceTracker.endTimer(startTime, 'validateCleanState');
      
      return validation;
    } catch (error) {
      performanceTracker.endTimer(startTime, 'validateCleanState-error');
      console.error('TestSingletonManager: Error validating clean state:', error);
      return { error: error.message, timestamp: Date.now() };
    }
  }

  /**
   * Enhanced reset for DatabaseService integration
   * Specifically handles database singleton state clearing
   * 
   * @param {Object} databaseInstance - DatabaseService instance
   * @returns {boolean} Reset success status
   */
  static resetDatabaseSingleton(databaseInstance) {
    const startTime = performanceTracker.startTimer();
    
    try {
      if (!databaseInstance) {
        performanceTracker.endTimer(startTime, 'resetDatabase-null');
        return true;
      }

      // Clear all database-specific properties
      const dbProperties = [
        'client',
        'initialized', 
        'initializationPromise',
        'maxRetries',
        'retryDelay'
      ];

      dbProperties.forEach(prop => {
        if (databaseInstance.hasOwnProperty(prop)) {
          if (prop === 'client' && databaseInstance[prop] && typeof databaseInstance[prop].close === 'function') {
            try {
              databaseInstance[prop].close();
            } catch (closeError) {
              // Ignore close errors in testing
            }
          }
          databaseInstance[prop] = prop === 'maxRetries' ? 3 : 
                                  prop === 'retryDelay' ? 1000 : null;
        }
      });

      // Reset flags
      databaseInstance.initialized = false;
      databaseInstance.initializationPromise = null;

      performanceTracker.endTimer(startTime, 'resetDatabase-success');
      return true;
    } catch (error) {
      performanceTracker.endTimer(startTime, 'resetDatabase-error');
      console.error('TestSingletonManager: Error resetting database singleton:', error);
      return false;
    }
  }

  /**
   * Lifecycle hook: Before each test
   * Ensures complete state isolation
   */
  static beforeEach() {
    const startTime = performanceTracker.startTimer();
    
    try {
      this.clearAllState();
      performanceTracker.endTimer(startTime, 'beforeEach');
    } catch (error) {
      performanceTracker.endTimer(startTime, 'beforeEach-error');
      console.error('TestSingletonManager: Error in beforeEach hook:', error);
      throw error;
    }
  }

  /**
   * Lifecycle hook: After each test
   * Validates clean state and performs final cleanup
   */
  static afterEach() {
    const startTime = performanceTracker.startTimer();
    
    try {
      const validation = this.validateCleanState();
      
      if (!validation.registryEmpty) {
        console.warn('TestSingletonManager: Singleton registry not empty after test:', validation);
        this.clearAllState(); // Force cleanup
      }

      performanceTracker.endTimer(startTime, 'afterEach');
    } catch (error) {
      performanceTracker.endTimer(startTime, 'afterEach-error');
      console.error('TestSingletonManager: Error in afterEach hook:', error);
    }
  }

  /**
   * Lifecycle hook: On test failure
   * Force complete reset to recover from failed state
   */
  static onTestFailure() {
    const startTime = performanceTracker.startTimer();
    
    try {
      console.warn('TestSingletonManager: Test failure detected, forcing complete reset');
      
      this.clearAllState();
      vi.resetModules();
      vi.clearAllMocks();
      
      performanceTracker.endTimer(startTime, 'onTestFailure');
    } catch (error) {
      performanceTracker.endTimer(startTime, 'onTestFailure-error');
      console.error('TestSingletonManager: Error in failure recovery:', error);
    }
  }

  /**
   * Get debugging information for troubleshooting state persistence
   * 
   * @returns {Object} Comprehensive debugging info
   */
  static getDebugInfo() {
    return {
      registrySize: singletonRegistry.size,
      registeredKeys: Array.from(singletonRegistry.keys()),
      registryDetails: Array.from(singletonRegistry.entries()).map(([key, data]) => ({
        key,
        hasInstance: !!data.instance,
        resetMethod: data.resetMethod,
        registeredAt: new Date(data.registeredAt).toISOString()
      })),
      performanceStats: performanceTracker.getStats(),
      memoryStatus: this._getMemoryStatus()
    };
  }

  /**
   * Reset performance tracking (for test isolation)
   */
  static resetPerformanceTracking() {
    performanceTracker.reset();
  }

  /**
   * Enable boundary mode for test isolation coordination
   * Called during test boundary entry
   * 
   * @param {string} boundaryId - The boundary context ID
   */
  static enableBoundaryMode(boundaryId) {
    const startTime = performanceTracker.startTimer();
    
    try {
      // Clear existing state when entering boundary
      this.clearAllState();
      
      // Store boundary context
      this._boundaryContext = {
        id: boundaryId,
        enteredAt: Date.now()
      };
      
      performanceTracker.endTimer(startTime, 'enableBoundaryMode');
    } catch (error) {
      performanceTracker.endTimer(startTime, 'enableBoundaryMode-error');
      console.error('TestSingletonManager: Error enabling boundary mode:', error);
    }
  }

  /**
   * Disable boundary mode and cleanup
   * Called during test boundary exit
   * 
   * @param {string} boundaryId - The boundary context ID
   */
  static disableBoundaryMode(boundaryId) {
    const startTime = performanceTracker.startTimer();
    
    try {
      // Validate boundary ID if provided
      if (this._boundaryContext && this._boundaryContext.id !== boundaryId) {
        console.warn(`TestSingletonManager: Boundary ID mismatch in disableBoundaryMode - expected ${this._boundaryContext.id}, got ${boundaryId}`);
      }
      
      // Perform final cleanup
      this.clearAllState();
      
      // Clear boundary context
      this._boundaryContext = null;
      
      performanceTracker.endTimer(startTime, 'disableBoundaryMode');
    } catch (error) {
      performanceTracker.endTimer(startTime, 'disableBoundaryMode-error');
      console.error('TestSingletonManager: Error disabling boundary mode:', error);
    }
  }

  /**
   * Check if boundary mode is currently active
   * 
   * @returns {boolean} True if boundary mode is active
   */
  static isBoundaryModeActive() {
    return this._boundaryContext !== null;
  }

  /**
   * Get current boundary context information
   * 
   * @returns {Object|null} Boundary context or null
   */
  static getBoundaryContext() {
    return this._boundaryContext;
  }

  // Private helper methods

  /**
   * Clear common singleton properties when no reset method is available
   * @private
   */
  static _clearCommonSingletonProperties(instance) {
    const commonProps = [
      'client', 'initialized', 'initializationPromise', 
      'connection', 'isConnected', 'cache', 'state'
    ];

    commonProps.forEach(prop => {
      if (instance.hasOwnProperty(prop)) {
        if (instance[prop] && typeof instance[prop].close === 'function') {
          try {
            instance[prop].close();
          } catch (error) {
            // Ignore close errors in testing
          }
        }
        instance[prop] = null;
      }
    });

    // Reset boolean flags
    if ('initialized' in instance) instance.initialized = false;
    if ('isConnected' in instance) instance.isConnected = false;
  }

  /**
   * Get basic memory status for debugging
   * @private
   */
  static _getMemoryStatus() {
    try {
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const usage = process.memoryUsage();
        return {
          heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100,
          heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100,
          external: Math.round(usage.external / 1024 / 1024 * 100) / 100,
          rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100
        };
      }
      return null;
    } catch (error) {
      return null;
    }
  }
}

/**
 * Convenience function for enhanced database singleton reset
 * Used by existing resetDatabaseInstance() function
 * 
 * @param {Object} databaseInstance - DatabaseService singleton instance
 * @returns {boolean} Reset success status
 */
export function enhancedResetDatabaseInstance(databaseInstance) {
  return TestSingletonManager.resetDatabaseSingleton(databaseInstance);
}

/**
 * Helper for test lifecycle integration
 * Can be used in beforeEach/afterEach hooks
 */
export const testSingletonLifecycle = {
  beforeEach: () => TestSingletonManager.beforeEach(),
  afterEach: () => TestSingletonManager.afterEach(),
  onFailure: () => TestSingletonManager.onTestFailure(),
  validateClean: () => TestSingletonManager.validateCleanState(),
  getDebugInfo: () => TestSingletonManager.getDebugInfo()
};

// Export for backward compatibility and ease of use
export default TestSingletonManager;
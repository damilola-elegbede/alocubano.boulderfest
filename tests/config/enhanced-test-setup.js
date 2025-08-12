/**
 * Enhanced Test Setup - Automatic Test Isolation Enforcement
 * 
 * Provides automatic test isolation without requiring manual setup in every test file.
 * This is Phase 2 of the bulletproof test isolation architecture that makes isolation
 * completely transparent to developers.
 * 
 * Key Features:
 * - Automatic isolation hooks for all tests
 * - Smart pattern detection for isolation levels
 * - Integration with all Phase 1 components
 * - Zero configuration required for existing tests
 * - Performance optimized with selective isolation
 * 
 * Integration Components:
 * - TestSingletonManager: Complete singleton state clearing
 * - TestMockManager: Predictable mock lifecycle management  
 * - TestEnvironmentManager: Module-level state clearing
 * 
 * @author Test Engineer Agent
 * @version 2.0.0 - Enhanced Vitest Configuration Phase
 */

import { vi, beforeEach, afterEach } from 'vitest';
import { TestSingletonManager, testSingletonLifecycle } from '../utils/test-singleton-manager.js';
import { setupTestMockManager } from '../utils/test-mock-manager.js';
import { testEnvManager } from '../utils/test-environment-manager.js';
import { environmentAwareTestSetup } from './environment-aware-test-setup.js';
import { testEnvironmentDetector } from '../utils/test-environment-detector.js';

// Import performance-optimized configuration
import { 
  performanceIsolationConfig,
  getPerformanceIsolationLevel,
  performanceMonitor,
  batchOperations,
  initializePerformanceOptimizations
} from './performance-isolation-config.js';

// Fallback to base configuration if performance config not available
import { isolationConfig, getTestIsolationLevel } from './isolation-config.js';

/**
 * Performance-Optimized Smart Test Isolation Detection
 * Uses performance budgets and caching for efficient isolation decisions
 */
class PerformanceSmartIsolationDetector {
  constructor() {
    this.testPatterns = new Map();
    this.performanceMetrics = new Map();
    this.isolationOverrides = new Map();
    this.debugMode = process.env.TEST_DEBUG === 'true';
    this.performanceMode = process.env.TEST_PERFORMANCE_MODE === 'true';
  }

  /**
   * Determine isolation level for current test context with performance optimization
   */
  getIsolationLevel(testContext) {
    const testFilePath = this._getTestFilePath(testContext);
    const testName = this._getTestName(testContext);
    
    // Start performance monitoring
    if (this.performanceMode) {
      performanceMonitor.startTimer(testFilePath, 'isolation-detection');
    }
    
    let isolationInfo;
    
    // Check for explicit overrides first
    if (this.isolationOverrides.has(testFilePath)) {
      isolationInfo = { 
        level: this.isolationOverrides.get(testFilePath),
        reason: 'Manual override',
        performance: { budget: 5, critical: false }
      };
    } else {
      // Use performance-optimized detection
      try {
        isolationInfo = getPerformanceIsolationLevel(testFilePath, testName, { debug: this.debugMode });
      } catch (error) {
        // Fallback to base configuration
        const level = getTestIsolationLevel(testFilePath, testName);
        isolationInfo = { 
          level, 
          reason: 'Fallback to base config',
          performance: { budget: 5, critical: false }
        };
      }
    }
    
    // End performance monitoring
    if (this.performanceMode) {
      performanceMonitor.endTimer(testFilePath, 'isolation-detection');
    }
    
    if (this.debugMode) {
      console.log(`[PerformanceSmartIsolation] ${testFilePath}: ${isolationInfo.level} (budget: ${isolationInfo.performance?.budget}ms)`);
    }
    
    return isolationInfo;
  }

  /**
   * Extract test context information
   */
  _getTestFilePath(testContext) {
    try {
      return testContext?.file?.filepath || 
             testContext?.file?.name || 
             testContext?.filepath ||
             process.env.VITEST_TEST_FILE ||
             'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  _getTestName(testContext) {
    try {
      return testContext?.name || 
             testContext?.task?.name || 
             testContext?.suite?.name ||
             'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Add isolation override for specific test file
   */
  addOverride(filePath, isolationLevel) {
    this.isolationOverrides.set(filePath, isolationLevel);
  }

  /**
   * Track performance metrics for isolation operations
   */
  trackPerformance(operation, duration, testContext) {
    const testFile = this._getTestFilePath(testContext);
    
    if (!this.performanceMetrics.has(testFile)) {
      this.performanceMetrics.set(testFile, {
        operations: [],
        totalTime: 0,
        averageTime: 0
      });
    }

    const metrics = this.performanceMetrics.get(testFile);
    metrics.operations.push({ operation, duration, timestamp: Date.now() });
    metrics.totalTime += duration;
    metrics.averageTime = metrics.totalTime / metrics.operations.length;

    // Warn about slow isolation operations
    if (duration > 25 && this.debugMode) {
      console.warn(`[PerformanceSmartIsolation] Slow isolation operation: ${operation} took ${duration.toFixed(2)}ms in ${testFile}`);
    }
  }

  /**
   * Pattern-based isolation level detection
   */
  _detectPatternBasedLevel(filePath, testName) {
    // Database tests require complete isolation
    if (this._isDatabaseTest(filePath, testName)) {
      return 'complete';
    }

    // Integration tests need environment isolation
    if (this._isIntegrationTest(filePath, testName)) {
      return 'environment';
    }

    // Mock-heavy tests need singleton isolation
    if (this._isHeavyMockTest(filePath, testName)) {
      return 'singleton';
    }

    // Performance tests should have minimal isolation
    if (this._isPerformanceTest(filePath, testName)) {
      return 'minimal';
    }

    // Default to basic isolation
    return isolationConfig.default;
  }

  /**
   * Test pattern detection methods
   */
  _isDatabaseTest(filePath, testName) {
    return (
      filePath.includes('database') ||
      filePath.includes('migration') ||
      testName.includes('database') ||
      testName.includes('Database')
    );
  }

  _isIntegrationTest(filePath, testName) {
    return (
      filePath.includes('integration/') ||
      filePath.includes('e2e/') ||
      testName.includes('integration') ||
      testName.includes('Integration')
    );
  }

  _isHeavyMockTest(filePath, testName) {
    return (
      filePath.includes('brevo') ||
      filePath.includes('stripe') ||
      filePath.includes('email') ||
      testName.includes('mock') ||
      testName.includes('Mock')
    );
  }

  _isPerformanceTest(filePath, testName) {
    return (
      filePath.includes('performance/') ||
      testName.includes('performance') ||
      testName.includes('Performance')
    );
  }

  /**
   * Extract test context information
   */
  _getTestFilePath(testContext) {
    try {
      // Vitest provides test file info in various ways
      return testContext?.file?.filepath || 
             testContext?.file?.name || 
             testContext?.filepath ||
             process.env.VITEST_TEST_FILE ||
             'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  _getTestName(testContext) {
    try {
      return testContext?.name || 
             testContext?.task?.name || 
             testContext?.suite?.name ||
             'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Add isolation override for specific test file
   */
  addOverride(filePath, isolationLevel) {
    this.isolationOverrides.set(filePath, isolationLevel);
  }

  /**
   * Track performance metrics for isolation operations
   */
  trackPerformance(operation, duration, testContext) {
    const testFile = this._getTestFilePath(testContext);
    
    if (!this.performanceMetrics.has(testFile)) {
      this.performanceMetrics.set(testFile, {
        operations: [],
        totalTime: 0,
        averageTime: 0
      });
    }

    const metrics = this.performanceMetrics.get(testFile);
    metrics.operations.push({ operation, duration, timestamp: Date.now() });
    metrics.totalTime += duration;
    metrics.averageTime = metrics.totalTime / metrics.operations.length;

    // Warn about slow isolation operations
    if (duration > 50) {
      console.warn(`[SmartIsolation] Slow isolation operation: ${operation} took ${duration}ms in ${testFile}`);
    }
  }
}

/**
 * Performance-Optimized Automatic Isolation Engine
 * Orchestrates all isolation components with performance monitoring and optimization
 */
class PerformanceAutomaticIsolationEngine {
  constructor() {
    this.detector = new PerformanceSmartIsolationDetector();
    this.mockManager = null;
    this.isolationStats = {
      totalTests: 0,
      isolationLevels: {},
      errors: 0,
      totalTime: 0,
      budgetViolations: 0,
      performanceOptimizations: 0
    };
    this.debugMode = process.env.TEST_DEBUG === 'true';
    this.performanceMode = process.env.TEST_PERFORMANCE_MODE === 'true';
    this.initialized = false;
    this.config = performanceIsolationConfig || isolationConfig;
  }

  /**
   * Extract test context information (utility methods)
   */
  _getTestFilePath(testContext) {
    try {
      return testContext?.file?.filepath || 
             testContext?.file?.name || 
             testContext?.filepath ||
             process.env.VITEST_TEST_FILE ||
             'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  _getTestName(testContext) {
    try {
      return testContext?.name || 
             testContext?.task?.name || 
             testContext?.suite?.name ||
             'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Initialize the performance-optimized isolation engine
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Initialize performance optimizations if available
      if (typeof initializePerformanceOptimizations === 'function') {
        await initializePerformanceOptimizations();
        this.isolationStats.performanceOptimizations++;
      }

      // Set up mock manager with performance-aware configuration
      const mockSetup = setupTestMockManager({
        enableDebug: this.debugMode,
        validateIsolation: this.config.validation?.validateIsolation ?? true,
        autoCleanup: true,
        strictMode: this.config.strictMode || false,
        performance: this.config.performance || {}
      });

      this.mockManager = mockSetup;

      // Add special overrides for known problematic tests
      this._addKnownOverrides();

      // Apply any pending overrides
      if (global.pendingIsolationOverrides) {
        for (const [testFile, level] of global.pendingIsolationOverrides) {
          this.detector.addOverride(testFile, level);
        }
        global.pendingIsolationOverrides.clear();
      }

      this.initialized = true;
      
      if (this.debugMode) {
        console.log('[AutomaticIsolation] Engine initialized');
      }
    } catch (error) {
      console.error('[AutomaticIsolation] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Apply automatic isolation before each test with performance optimization
   */
  async applyBeforeEachIsolation(testContext) {
    const startTime = performance.now();
    const testFilePath = this._getTestFilePath(testContext);
    
    try {
      await this.initialize();
      
      // Start performance monitoring
      if (this.performanceMode) {
        performanceMonitor.startTimer(testFilePath, 'beforeEach-isolation');
      }
      
      const isolationInfo = this.detector.getIsolationLevel(testContext);
      const isolationLevel = typeof isolationInfo === 'string' ? isolationInfo : isolationInfo.level;
      const performanceBudget = isolationInfo.performance?.budget || 5;
      
      // Increment stats
      this.isolationStats.totalTests++;
      this.isolationStats.isolationLevels[isolationLevel] = 
        (this.isolationStats.isolationLevels[isolationLevel] || 0) + 1;

      // Apply isolation based on level with performance optimization
      switch (isolationLevel) {
        case 'complete':
          await this._applyCompleteIsolation(performanceBudget);
          break;
        case 'environment':
          await this._applyEnvironmentIsolation(performanceBudget);
          break;
        case 'singleton':
          await this._applySingletonIsolation(performanceBudget);
          break;
        case 'minimal':
          await this._applyMinimalIsolation(performanceBudget);
          break;
        default:
          await this._applyBasicIsolation(performanceBudget);
      }

      const duration = performance.now() - startTime;
      
      // End performance monitoring and check budget
      if (this.performanceMode) {
        const perfResult = performanceMonitor.endTimer(testFilePath, 'beforeEach-isolation');
        if (!perfResult?.withinBudget) {
          this.isolationStats.budgetViolations++;
        }
      }
      
      this.detector.trackPerformance && 
        this.detector.trackPerformance(`beforeEach-${isolationLevel}`, duration, testContext);
      this.isolationStats.totalTime += duration;

    } catch (error) {
      this.isolationStats.errors++;
      console.error('[PerformanceAutomaticIsolation] BeforeEach isolation failed:', error);
      
      // Fallback to complete isolation on error
      await this._applyCompleteIsolation();
    }
  }

  /**
   * Apply automatic cleanup after each test
   */
  async applyAfterEachCleanup(testContext) {
    const startTime = performance.now();
    
    try {
      const isolationLevel = this.detector.getIsolationLevel(testContext);
      
      // Apply cleanup based on isolation level
      switch (isolationLevel) {
        case 'complete':
          await this._applyCompleteCleanup();
          break;
        case 'environment':
          await this._applyEnvironmentCleanup();
          break;
        case 'singleton':
          await this._applySingletonCleanup();
          break;
        case 'minimal':
          await this._applyMinimalCleanup();
          break;
        default:
          await this._applyBasicCleanup();
      }

      const duration = performance.now() - startTime;
      this.detector.trackPerformance(`afterEach-${isolationLevel}`, duration, testContext);

    } catch (error) {
      this.isolationStats.errors++;
      console.error('[AutomaticIsolation] AfterEach cleanup failed:', error);
      
      // Fallback to complete cleanup on error
      await this._applyCompleteCleanup();
    }
  }

  /**
   * Performance-Optimized Isolation Level Implementations
   */
  async _applyCompleteIsolation(budget = 20) {
    const startTime = performance.now();
    
    try {
      // Use batch operations for performance
      if (batchOperations && this.config.performance?.batching?.enabled) {
        await Promise.all([
          batchOperations.queueSingletonOperation(() => TestSingletonManager.clearAllState()),
          this.mockManager?.beforeEach?.(),
          testEnvManager.backup(),
          testEnvManager.clearDatabaseEnv(),
          testEnvManager.setMockEnv(testEnvManager.getPreset("valid-local"))
        ]);
        vi.resetModules();
      } else {
        // Standard complete isolation
        TestSingletonManager.clearAllState();
        this.mockManager?.beforeEach?.();
        testEnvManager.backup();
        testEnvManager.clearDatabaseEnv();
        testEnvManager.setMockEnv(testEnvManager.getPreset("valid-local"));
        vi.resetModules();
      }
      
      // Check performance budget
      const duration = performance.now() - startTime;
      if (duration > budget && this.debugMode) {
        console.warn(`[PerformanceIsolation] Complete isolation exceeded budget: ${duration.toFixed(2)}ms > ${budget}ms`);
      }
    } catch (error) {
      console.warn('[PerformanceIsolation] Complete isolation failed:', error);
      throw error;
    }
  }

  async _applyEnvironmentIsolation(budget = 8) {
    const startTime = performance.now();
    
    try {
      // Environment isolation: Environment + basic mock cleanup
      await Promise.all([
        testEnvManager.backup(),
        testEnvManager.clearDatabaseEnv(),
        testEnvManager.setMockEnv(testEnvManager.getPreset("valid-local"))
      ]);
      vi.clearAllMocks();
      
      // Check performance budget
      const duration = performance.now() - startTime;
      if (duration > budget && this.debugMode) {
        console.warn(`[PerformanceIsolation] Environment isolation exceeded budget: ${duration.toFixed(2)}ms > ${budget}ms`);
      }
    } catch (error) {
      console.warn('[PerformanceIsolation] Environment isolation failed:', error);
      throw error;
    }
  }

  async _applySingletonIsolation(budget = 5) {
    const startTime = performance.now();
    
    try {
      // Use batch operations if available
      if (batchOperations && this.config.performance?.batching?.enabled) {
        await batchOperations.queueSingletonOperation(() => TestSingletonManager.clearAllState());
        this.mockManager?.beforeEach?.();
        vi.clearAllMocks();
      } else {
        // Standard singleton isolation
        TestSingletonManager.clearAllState();
        this.mockManager?.beforeEach?.();
        vi.clearAllMocks();
      }
      
      // Check performance budget
      const duration = performance.now() - startTime;
      if (duration > budget && this.debugMode) {
        console.warn(`[PerformanceIsolation] Singleton isolation exceeded budget: ${duration.toFixed(2)}ms > ${budget}ms`);
      }
    } catch (error) {
      console.warn('[PerformanceIsolation] Singleton isolation failed:', error);
      throw error;
    }
  }

  async _applyMinimalIsolation(budget = 1) {
    const startTime = performance.now();
    
    try {
      // Minimal isolation: Only essential cleanup
      vi.clearAllMocks();
      
      // Check performance budget
      const duration = performance.now() - startTime;
      if (duration > budget && this.debugMode) {
        console.warn(`[PerformanceIsolation] Minimal isolation exceeded budget: ${duration.toFixed(2)}ms > ${budget}ms`);
      }
    } catch (error) {
      console.warn('[PerformanceIsolation] Minimal isolation failed:', error);
      throw error;
    }
  }

  async _applyBasicIsolation(budget = 3) {
    const startTime = performance.now();
    
    try {
      // Basic isolation: Standard Vitest cleanup
      vi.clearAllMocks();
      vi.resetModules();
      
      // Check performance budget
      const duration = performance.now() - startTime;
      if (duration > budget && this.debugMode) {
        console.warn(`[PerformanceIsolation] Basic isolation exceeded budget: ${duration.toFixed(2)}ms > ${budget}ms`);
      }
    } catch (error) {
      console.warn('[PerformanceIsolation] Basic isolation failed:', error);
      throw error;
    }
  }

  /**
   * Add known overrides for problematic test files
   */
  _addKnownOverrides() {
    // Known problematic tests that need complete isolation
    const completeIsolationTests = [
      'database-environment.test.js',
      'database-singleton.test.js',
      'brevo-email.test.js',
      'email-webhook.test.js'
    ];

    completeIsolationTests.forEach(testFile => {
      this.detector.addOverride(testFile, 'complete');
    });

    // Performance tests should have minimal isolation
    this.detector.addOverride('performance/', 'minimal');
  }

  /**
   * Get isolation statistics
   */
  getIsolationStats() {
    return {
      ...this.isolationStats,
      averageTime: this.isolationStats.totalTests > 0 
        ? this.isolationStats.totalTime / this.isolationStats.totalTests 
        : 0
    };
  }

  /**
   * Enable debug mode
   */
  enableDebug() {
    this.debugMode = true;
    this.detector.debugMode = true;
  }

  /**
   * Disable debug mode
   */
  disableDebug() {
    this.debugMode = false;
    this.detector.debugMode = false;
  }

  /**
   * Cleanup Level Implementations
   */
  async _applyCompleteCleanup() {
    // Complete cleanup: All components
    testSingletonLifecycle.afterEach();
    this.mockManager.afterEach();
    testEnvManager.restore();
    vi.clearAllMocks();
  }

  async _applyEnvironmentCleanup() {
    // Environment cleanup: Restore environment
    testEnvManager.restore();
    vi.clearAllMocks();
  }

  async _applySingletonCleanup() {
    // Singleton cleanup: Validate singleton state
    testSingletonLifecycle.afterEach();
    this.mockManager.afterEach();
  }

  async _applyMinimalCleanup() {
    // Minimal cleanup: Basic cleanup
    vi.clearAllMocks();
  }

  async _applyBasicCleanup() {
    // Basic cleanup: Standard cleanup
    vi.clearAllMocks();
  }

  /**
   * Add known overrides for problematic test files
   */
  _addKnownOverrides() {
    // Known problematic tests that need complete isolation
    const completeIsolationTests = [
      'database-environment.test.js',
      'database-singleton.test.js',
      'brevo-email.test.js',
      'email-webhook.test.js'
    ];

    completeIsolationTests.forEach(testFile => {
      this.detector.addOverride(testFile, 'complete');
    });

    // Performance tests should have minimal isolation
    this.detector.addOverride('performance/', 'minimal');
  }

  /**
   * Get isolation statistics
   */
  getIsolationStats() {
    return {
      ...this.isolationStats,
      averageTime: this.isolationStats.totalTests > 0 
        ? this.isolationStats.totalTime / this.isolationStats.totalTests 
        : 0
    };
  }

  /**
   * Enable debug mode
   */
  enableDebug() {
    this.debugMode = true;
    this.detector.debugMode = true;
  }

  /**
   * Disable debug mode
   */
  disableDebug() {
    this.debugMode = false;
    this.detector.debugMode = false;
  }
}

// Create performance-optimized singleton isolation engine
const isolationEngine = new PerformanceAutomaticIsolationEngine();

/**
 * Global beforeEach hook - Automatic isolation for all tests
 * This hook runs before every single test across all test files
 */
beforeEach(async (testContext) => {
  await isolationEngine.applyBeforeEachIsolation(testContext);
});

/**
 * Global afterEach hook - Automatic cleanup for all tests
 * This hook runs after every single test across all test files
 */
afterEach(async (testContext) => {
  await isolationEngine.applyAfterEachCleanup(testContext);
});

/**
 * Export performance-optimized isolation engine for advanced usage and debugging
 */
export { 
  isolationEngine, 
  PerformanceSmartIsolationDetector, 
  PerformanceAutomaticIsolationEngine,
  performanceMonitor,
  batchOperations 
};

/**
 * Convenience functions for manual isolation control
 */
export function enableTestDebug() {
  isolationEngine.enableDebug();
}

export function disableTestDebug() {
  isolationEngine.disableDebug();
}

export function getIsolationStats() {
  return isolationEngine.getIsolationStats();
}

export function addIsolationOverride(testFile, level) {
  if (!isolationEngine.initialized) {
    // Store override for later application
    if (!global.pendingIsolationOverrides) {
      global.pendingIsolationOverrides = new Map();
    }
    global.pendingIsolationOverrides.set(testFile, level);
  } else {
    isolationEngine.detector.addOverride(testFile, level);
  }
}

/**
 * Enhanced test isolation utilities
 */
export function withCompleteIsolation(testFn) {
  return async function(testContext) {
    await isolationEngine.initialize();
    
    // Force complete isolation for this specific test
    const tempKey = testContext?.file?.filepath || `temp-${Date.now()}`;
    isolationEngine.detector.addOverride(tempKey, 'complete');
    
    try {
      await isolationEngine._applyCompleteIsolation();
      const result = await testFn(testContext);
      await isolationEngine._applyCompleteCleanup();
      return result;
    } finally {
      // Clean up temporary override
      isolationEngine.detector.isolationOverrides.delete(tempKey);
    }
  };
}

export function withMinimalIsolation(testFn) {
  return async function(testContext) {
    await isolationEngine.initialize();
    
    // Force minimal isolation for this specific test
    const tempKey = testContext?.file?.filepath || `temp-${Date.now()}`;
    isolationEngine.detector.addOverride(tempKey, 'minimal');
    
    try {
      await isolationEngine._applyMinimalIsolation();
      const result = await testFn(testContext);
      await isolationEngine._applyMinimalCleanup();
      return result;
    } finally {
      // Clean up temporary override
      isolationEngine.detector.isolationOverrides.delete(tempKey);
    }
  };
}

/**
 * Performance and debug utilities
 */
export function logPerformanceIsolationReport() {
  const stats = isolationEngine.getIsolationStats();
  const perfStats = performanceMonitor?.getStats?.() || {};
  
  console.log('\n=== Performance-Optimized Test Isolation Report ===');
  console.log(`Total Tests: ${stats.totalTests}`);
  console.log(`Total Time: ${stats.totalTime.toFixed(2)}ms`);
  console.log(`Average Time: ${stats.averageTime?.toFixed(2) || 'N/A'}ms per test`);
  console.log(`Errors: ${stats.errors}`);
  console.log(`Budget Violations: ${stats.budgetViolations || 0}`);
  console.log(`Performance Optimizations: ${stats.performanceOptimizations || 0}`);
  
  console.log('\nIsolation Levels:');
  Object.entries(stats.isolationLevels).forEach(([level, count]) => {
    const percentage = stats.totalTests > 0 ? ((count / stats.totalTests) * 100).toFixed(1) : '0.0';
    console.log(`  ${level}: ${count} tests (${percentage}%)`);
  });
  
  if (perfStats.totalViolations > 0) {
    console.log(`\n⚠️  Performance Issues: ${perfStats.totalViolations} budget violations`);
    perfStats.recentViolations?.forEach(violation => {
      console.log(`   ${violation.testPath}: ${violation.operation} (${violation.duration.toFixed(2)}ms > ${violation.budget}ms)`);
    });
  }
  
  console.log('======================================================\n');
}

export function logIsolationReport() {
  // Backward compatibility
  logPerformanceIsolationReport();
}

export function getPerformanceStats() {
  return {
    isolation: isolationEngine.getIsolationStats(),
    performance: performanceMonitor?.getStats?.() || {},
    cacheSize: typeof decisionCache !== 'undefined' ? decisionCache.size() : 0
  };
}

export function resetPerformanceTracking() {
  if (performanceMonitor?.reset) {
    performanceMonitor.reset();
  }
  if (isolationEngine.isolationStats) {
    isolationEngine.isolationStats.budgetViolations = 0;
    isolationEngine.isolationStats.performanceOptimizations = 0;
  }
}

// Export for backward compatibility and new performance features
export default {
  isolationEngine,
  enableTestDebug,
  disableTestDebug,
  getIsolationStats,
  addIsolationOverride,
  withCompleteIsolation,
  withMinimalIsolation,
  logIsolationReport,
  logPerformanceIsolationReport,
  getPerformanceStats,
  resetPerformanceTracking,
  performanceMonitor,
  batchOperations
};
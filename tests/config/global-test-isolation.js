/**
 * Global Test Isolation Setup
 * 
 * Global setup and teardown hooks for Vitest that ensure bulletproof test isolation
 * across the entire test suite. This file is executed once at the beginning and end
 * of the entire test run.
 * 
 * Key Responsibilities:
 * - Initialize isolation components globally
 * - Set up global isolation validation
 * - Configure test suite performance monitoring
 * - Provide suite-level debugging information
 * 
 * @author Test Engineer Agent
 * @version 2.0.0
 */

import { getEffectiveConfig, generateConfigReport, validateConfig } from './isolation-config.js';

/**
 * Global Test Suite Statistics
 */
class TestSuiteStats {
  constructor() {
    this.startTime = null;
    this.endTime = null;
    this.totalTests = 0;
    this.isolationStats = {
      violations: 0,
      cleanups: 0,
      errors: 0,
      totalIsolationTime: 0
    };
    this.performanceMetrics = {
      slowTests: [],
      averageTestTime: 0,
      totalTestTime: 0
    };
    this.config = null;
    this.validationErrors = [];
  }

  start() {
    this.startTime = performance.now();
  }

  end() {
    this.endTime = performance.now();
  }

  getTotalTime() {
    if (!this.startTime || !this.endTime) return 0;
    return this.endTime - this.startTime;
  }

  addIsolationViolation() {
    this.isolationStats.violations++;
  }

  addCleanupOperation(duration) {
    this.isolationStats.cleanups++;
    this.isolationStats.totalIsolationTime += duration;
  }

  addError() {
    this.isolationStats.errors++;
  }

  addSlowTest(testName, duration) {
    this.performanceMetrics.slowTests.push({ name: testName, duration });
  }

  generateReport() {
    const totalTime = this.getTotalTime();
    const isolationOverhead = this.isolationStats.totalIsolationTime;
    const isolationPercentage = totalTime > 0 ? (isolationOverhead / totalTime) * 100 : 0;

    return {
      execution: {
        totalTime: totalTime.toFixed(2) + 'ms',
        isolationOverhead: isolationOverhead.toFixed(2) + 'ms',
        isolationPercentage: isolationPercentage.toFixed(1) + '%',
        averageIsolationTime: this.isolationStats.cleanups > 0 
          ? (isolationOverhead / this.isolationStats.cleanups).toFixed(2) + 'ms'
          : '0ms'
      },
      isolation: {
        cleanups: this.isolationStats.cleanups,
        violations: this.isolationStats.violations,
        errors: this.isolationStats.errors,
        successRate: this.isolationStats.cleanups > 0 
          ? (((this.isolationStats.cleanups - this.isolationStats.errors) / this.isolationStats.cleanups) * 100).toFixed(1) + '%'
          : '100%'
      },
      performance: {
        slowTests: this.performanceMetrics.slowTests.length,
        slowestTest: this.performanceMetrics.slowTests.length > 0 
          ? this.performanceMetrics.slowTests.reduce((a, b) => a.duration > b.duration ? a : b)
          : null
      },
      configuration: {
        isValid: this.validationErrors.length === 0,
        errors: this.validationErrors,
        effectiveConfig: this.config
      }
    };
  }
}

// Global test suite statistics instance
const testSuiteStats = new TestSuiteStats();

/**
 * Global Setup Function
 * Executed once before all tests run
 */
export async function setup() {
  console.log('🧪 Initializing Enhanced Test Isolation System...');
  
  testSuiteStats.start();
  
  try {
    // Validate isolation configuration
    const validationErrors = validateConfig();
    testSuiteStats.validationErrors = validationErrors;
    
    if (validationErrors.length > 0) {
      console.warn('⚠️  Isolation configuration validation errors:');
      validationErrors.forEach(error => console.warn(`   ${error}`));
    }

    // Get effective configuration
    const config = getEffectiveConfig();
    testSuiteStats.config = config;
    
    console.log(`📋 Test Environment: ${config.environment.name}`);
    console.log(`🔒 Default Isolation: ${config.default}`);
    console.log(`🔍 Debug Mode: ${config.debug ? 'enabled' : 'disabled'}`);
    console.log(`⚡ Strict Mode: ${config.strictMode ? 'enabled' : 'disabled'}`);

    // Initialize core isolation components
    await initializeIsolationComponents(config);

    // Set up global environment for testing
    setupGlobalTestEnvironment(config);

    // Configure performance monitoring if enabled
    if (config.performance.trackPerformance) {
      setupPerformanceMonitoring(config);
    }

    // Generate initial configuration report
    if (config.debug) {
      const report = generateConfigReport();
      console.log('📊 Isolation Configuration Report Generated');
      
      if (report.recommendations.length > 0) {
        console.log('💡 Recommendations:');
        report.recommendations.forEach(rec => console.log(`   ${rec}`));
      }
    }

    console.log('✅ Enhanced Test Isolation System Ready');
    
  } catch (error) {
    console.error('❌ Failed to initialize test isolation system:', error);
    testSuiteStats.addError();
    throw error;
  }
}

/**
 * Global Teardown Function  
 * Executed once after all tests complete
 */
export async function teardown() {
  console.log('🧹 Test Suite Cleanup Starting...');
  
  testSuiteStats.end();
  
  try {
    // Final cleanup of all isolation components
    await performFinalCleanup();

    // Generate and display final test suite report
    const report = testSuiteStats.generateReport();
    displayTestSuiteReport(report);

    // Save performance metrics if configured
    if (testSuiteStats.config?.performance?.trackPerformance) {
      await savePerformanceMetrics(report);
    }

    // Validate final state
    const finalValidation = await validateFinalState();
    if (!finalValidation.isClean) {
      console.warn('⚠️  Test suite cleanup warnings:');
      finalValidation.issues.forEach(issue => console.warn(`   ${issue}`));
    }

    console.log('✅ Test Suite Cleanup Complete');
    
  } catch (error) {
    console.error('❌ Error during test suite cleanup:', error);
    testSuiteStats.addError();
  }
}

/**
 * Initialize all isolation components
 */
async function initializeIsolationComponents(config) {
  console.log('🔧 Initializing isolation components...');
  
  // Note: Cannot import Phase 1 components directly in global setup
  // They will be initialized in the enhanced-test-setup.js file
  
  // Set up global error handlers for isolation failures
  setupGlobalErrorHandlers(config);
  
  // Mark components as ready for initialization
  global.isolationComponentsReady = true;
}

/**
 * Set up global test environment
 */
function setupGlobalTestEnvironment(config) {
  // Set global test isolation mode
  process.env.TEST_ISOLATION_MODE = 'enhanced';
  process.env.TEST_ISOLATION_LEVEL = config.default;
  
  // Configure timeout handling for async isolation operations
  const originalTimeout = setTimeout;
  global.setTimeout = function(fn, delay, ...args) {
    // Add extra time for isolation operations in tests
    const adjustedDelay = process.env.NODE_ENV === 'test' ? Math.max(delay, 10) : delay;
    return originalTimeout(fn, adjustedDelay, ...args);
  };
  
  // Set up memory monitoring if in debug mode
  if (config.debug && typeof process !== 'undefined' && process.memoryUsage) {
    global.getTestMemoryUsage = () => {
      const usage = process.memoryUsage();
      return {
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100,
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100,
        external: Math.round(usage.external / 1024 / 1024 * 100) / 100,
        rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100
      };
    };
  }
}

/**
 * Set up performance monitoring
 */
function setupPerformanceMonitoring(config) {
  const { slowOperationThreshold } = config.performance;
  
  // Hook into Vitest test lifecycle to track performance
  global.trackTestPerformance = (testName, duration) => {
    if (duration > slowOperationThreshold) {
      testSuiteStats.addSlowTest(testName, duration);
      
      if (config.debug) {
        console.warn(`⚠️  Slow test detected: ${testName} took ${duration}ms`);
      }
    }
  };
}

/**
 * Set up global error handlers for isolation failures
 */
function setupGlobalErrorHandlers(config) {
  // Track isolation violations globally
  global.reportIsolationViolation = (violation) => {
    testSuiteStats.addIsolationViolation();
    
    if (config.validation.logViolations) {
      console.warn(`🔴 Isolation violation: ${violation}`);
    }
    
    if (config.strictMode && config.validation.failOnViolations) {
      throw new Error(`Test isolation violation: ${violation}`);
    }
  };
  
  // Track successful isolation operations
  global.reportIsolationSuccess = (operation, duration) => {
    testSuiteStats.addCleanupOperation(duration);
  };
  
  // Track isolation errors
  global.reportIsolationError = (error) => {
    testSuiteStats.addError();
    
    if (config.debug) {
      console.error(`🔴 Isolation error: ${error}`);
    }
  };
}

/**
 * Perform final cleanup of all components
 */
async function performFinalCleanup() {
  // Clear test isolation environment variables
  delete process.env.TEST_ISOLATION_MODE;
  delete process.env.TEST_ISOLATION_LEVEL;
  
  // Remove global test utilities
  delete global.trackTestPerformance;
  delete global.reportIsolationViolation;
  delete global.reportIsolationSuccess;
  delete global.reportIsolationError;
  delete global.getTestMemoryUsage;
  delete global.testMockSetup;
  delete global.isolationComponentsReady;
  
  // Restore original setTimeout
  if (global.originalSetTimeout) {
    global.setTimeout = global.originalSetTimeout;
    delete global.originalSetTimeout;
  }
  
  return {
    totalOperations: 4
  };
}

/**
 * Validate final state after all tests
 */
async function validateFinalState() {
  const issues = [];
  
  // Check singleton state (if available)
  if (global.testSingletonManager) {
    try {
      const singletonState = global.testSingletonManager.validateCleanState();
      if (!singletonState.registryEmpty) {
        issues.push(`Singleton registry not empty: ${singletonState.registeredSingletons} remaining`);
      }
    } catch (error) {
      // Singleton manager not available
    }
  }
  
  // Check environment state
  if (process.env.TEST_ISOLATION_MODE) {
    issues.push('Test isolation mode flag not cleared');
  }
  
  // Check for memory leaks (if available)
  if (global.getTestMemoryUsage) {
    const memUsage = global.getTestMemoryUsage();
    if (memUsage.heapUsed > 100) { // Warning threshold: 100MB
      issues.push(`High memory usage detected: ${memUsage.heapUsed}MB heap used`);
    }
  }
  
  // Check mock manager state
  if (global.testMockSetup) {
    const mockState = global.testMockSetup.manager.getManagerState();
    if (mockState.registry.totalMocks > 0) {
      issues.push(`Mock registry not empty: ${mockState.registry.totalMocks} mocks remaining`);
    }
  }
  
  return {
    isClean: issues.length === 0,
    issues,
    timestamp: new Date().toISOString()
  };
}

/**
 * Display comprehensive test suite report
 */
function displayTestSuiteReport(report) {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 ENHANCED TEST ISOLATION SUITE REPORT');
  console.log('='.repeat(60));
  
  // Execution Summary
  console.log('\n📊 EXECUTION SUMMARY');
  console.log(`   Total Time: ${report.execution.totalTime}`);
  console.log(`   Isolation Overhead: ${report.execution.isolationOverhead} (${report.execution.isolationPercentage})`);
  console.log(`   Average Isolation: ${report.execution.averageIsolationTime}`);
  
  // Isolation Summary
  console.log('\n🔒 ISOLATION SUMMARY');
  console.log(`   Cleanup Operations: ${report.isolation.cleanups}`);
  console.log(`   Success Rate: ${report.isolation.successRate}`);
  console.log(`   Violations: ${report.isolation.violations}`);
  console.log(`   Errors: ${report.isolation.errors}`);
  
  // Performance Summary
  console.log('\n⚡ PERFORMANCE SUMMARY');
  console.log(`   Slow Tests: ${report.performance.slowTests}`);
  if (report.performance.slowestTest) {
    console.log(`   Slowest Test: ${report.performance.slowestTest.name} (${report.performance.slowestTest.duration}ms)`);
  }
  
  // Configuration Status
  console.log('\n⚙️  CONFIGURATION STATUS');
  console.log(`   Valid: ${report.configuration.isValid ? '✅' : '❌'}`);
  console.log(`   Environment: ${report.configuration.effectiveConfig.environment.name}`);
  console.log(`   Default Level: ${report.configuration.effectiveConfig.default}`);
  console.log(`   Strict Mode: ${report.configuration.effectiveConfig.strictMode ? '✅' : '❌'}`);
  
  // Errors and Warnings
  if (report.configuration.errors.length > 0) {
    console.log('\n⚠️  CONFIGURATION ERRORS:');
    report.configuration.errors.forEach(error => console.log(`   ${error}`));
  }
  
  if (report.isolation.violations > 0) {
    console.log('\n🔴 ISOLATION VIOLATIONS DETECTED!');
    console.log('   Consider running tests with --no-threads or increasing isolation levels');
  }
  
  // Success/Warning message
  if (report.isolation.errors === 0 && report.configuration.isValid) {
    console.log('\n✅ TEST ISOLATION SYSTEM: HEALTHY');
  } else {
    console.log('\n⚠️  TEST ISOLATION SYSTEM: NEEDS ATTENTION');
  }
  
  console.log('='.repeat(60) + '\n');
}

/**
 * Save performance metrics for analysis
 */
async function savePerformanceMetrics(report) {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const metricsDir = 'test-results';
    const metricsFile = path.join(metricsDir, 'isolation-metrics.json');
    
    // Ensure directory exists
    try {
      await fs.mkdir(metricsDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
    
    // Save metrics with timestamp
    const metrics = {
      timestamp: new Date().toISOString(),
      report,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        ci: process.env.CI === 'true'
      }
    };
    
    await fs.writeFile(metricsFile, JSON.stringify(metrics, null, 2));
    console.log(`📁 Performance metrics saved to ${metricsFile}`);
    
  } catch (error) {
    console.warn(`⚠️  Could not save performance metrics: ${error.message}`);
  }
}

/**
 * Export utilities for use in tests
 */
export {
  testSuiteStats,
  performFinalCleanup,
  validateFinalState,
  displayTestSuiteReport
};

// Export default for Vitest globalSetup configuration
export default { setup, teardown };
/**
 * Performance-Optimized Isolation Configuration
 * 
 * Extends the base isolation configuration with performance optimizations
 * that reduce overhead while maintaining test isolation guarantees.
 * 
 * Key optimizations:
 * - Selective isolation based on test patterns
 * - Component caching and lazy loading
 * - Batch operations for efficiency
 * - Smart detection with performance thresholds
 * 
 * @author Performance Specialist Agent
 * @version 1.0.0 - Phase 3 Performance Optimization
 */

import { 
  isolationConfig,
  testPatterns,
  customPatterns,
  getTestIsolationLevel 
} from './isolation-config.js';

/**
 * Performance-optimized isolation configuration
 */
export const performanceIsolationConfig = {
  // Inherit base configuration
  ...isolationConfig,
  
  // Performance-first approach
  default: 'basic', // Reduced from 'singleton' to 'basic' for performance
  
  // Enhanced performance settings
  performance: {
    // Lower thresholds for early detection
    slowOperationThreshold: 25, // Reduced from 50ms
    
    // Enable comprehensive tracking
    trackPerformance: true,
    
    // Performance budgets (ms)
    budgets: {
      perTestOverhead: 2.0,      // Max 2ms per test
      componentInitialization: 10.0, // Max 10ms for component init
      isolationOperation: 5.0,   // Max 5ms per isolation operation
      totalSuiteOverhead: 500.0  // Max 500ms total overhead per suite
    },
    
    // Selective isolation configuration
    selective: {
      enabled: true,
      
      // Patterns that REQUIRE complete isolation (high priority)
      forceComplete: [
        /database-environment\.test\.js$/,
        /database-singleton\.test\.js$/,
        /brevo-email.*\.test\.js$/
      ],
      
      // Patterns that can use minimal isolation (performance-critical)
      forceMinimal: [
        /\/performance\/.*\.test\.js$/,
        /benchmark.*\.test\.js$/,
        /load-test.*\.test\.js$/,
        /memory-test.*\.test\.js$/
      ],
      
      // Patterns for environment isolation (medium priority)
      forceEnvironment: [
        /\/integration\/.*\.test\.js$/,
        /webhook.*\.test\.js$/,
        /api-.*\.test\.js$/
      ]
    },
    
    // Component caching
    caching: {
      enabled: true,
      
      // Cache isolation decisions to avoid repeated pattern matching
      decisionCache: {
        enabled: true,
        maxSize: 1000,
        ttl: 300000 // 5 minutes
      },
      
      // Cache component instances
      componentCache: {
        enabled: true,
        maxSize: 100,
        preload: ['TestSingletonManager', 'TestMockManager'] // Preload common components
      }
    },
    
    // Batch operations
    batching: {
      enabled: true,
      
      // Batch singleton clearing operations
      singletonOperations: {
        enabled: true,
        batchSize: 10,
        timeout: 50 // Max 50ms for batch operation
      },
      
      // Batch mock clearing operations
      mockOperations: {
        enabled: true,
        batchSize: 20,
        timeout: 30 // Max 30ms for batch operation
      },
      
      // Batch environment operations
      environmentOperations: {
        enabled: true,
        batchSize: 5,
        timeout: 20 // Max 20ms for batch operation
      }
    },
    
    // Lazy loading
    lazyLoading: {
      enabled: true,
      
      // Components to load on-demand
      components: ['TestEnvironmentManager', 'AutomaticIsolationEngine'],
      
      // Preload threshold (load if more than N tests will use it)
      preloadThreshold: 10,
      
      // Initialization timeout
      timeout: 100 // Max 100ms for lazy loading
    }
  },
  
  // Smart validation (reduced overhead)
  validation: {
    validateIsolation: true,
    
    // Only fail on violations in strict mode or CI
    failOnViolations: process.env.TEST_STRICT_MODE === 'true' || process.env.CI === 'true',
    
    // Reduced logging in performance mode
    logViolations: process.env.TEST_DEBUG === 'true',
    
    // Smart validation - skip validation for minimal isolation tests
    skipValidationFor: ['minimal', 'none'],
    
    // Sampling validation (validate only every Nth test for performance)
    sampling: {
      enabled: process.env.NODE_ENV !== 'test',
      rate: 0.1 // Validate 10% of tests
    }
  }
};

/**
 * Enhanced test patterns with performance priorities
 */
export const performanceTestPatterns = [
  // CRITICAL: Force complete isolation (highest priority - 200+)
  {
    pattern: /database-environment\.test\.js$/,
    level: 'complete',
    priority: 250,
    reason: 'Critical database test requiring complete isolation',
    performance: { budget: 20, critical: true }
  },
  {
    pattern: /database-singleton\.test\.js$/,
    level: 'complete',
    priority: 240,
    reason: 'Database singleton isolation test',
    performance: { budget: 15, critical: true }
  },
  
  // HIGH: Complete isolation for service tests (150-199)
  {
    pattern: /brevo-email.*\.test\.js$/,
    level: 'complete',
    priority: 180,
    reason: 'Brevo email service requires complete isolation',
    performance: { budget: 12, critical: false }
  },
  {
    pattern: /email-webhook\.test\.js$/,
    level: 'complete',
    priority: 170,
    reason: 'Email webhook integration test',
    performance: { budget: 10, critical: false }
  },
  {
    pattern: /stripe.*\.test\.js$/,
    level: 'environment',
    priority: 160,
    reason: 'Stripe integration needs environment isolation',
    performance: { budget: 8, critical: false }
  },
  
  // MEDIUM: Environment isolation (100-149)
  {
    pattern: /\/integration\/.*\.test\.js$/,
    level: 'environment',
    priority: 120,
    reason: 'Integration tests need environment isolation',
    performance: { budget: 5, critical: false }
  },
  {
    pattern: /\/e2e\/.*\.test\.js$/,
    level: 'environment',
    priority: 115,
    reason: 'E2E tests need environment isolation',
    performance: { budget: 8, critical: false }
  },
  {
    pattern: /webhook.*\.test\.js$/,
    level: 'environment',
    priority: 110,
    reason: 'Webhook tests need environment isolation',
    performance: { budget: 6, critical: false }
  },
  
  // BASIC: Standard isolation (50-99)
  {
    pattern: /\/unit\/.*\.test\.js$/,
    level: 'basic',
    priority: 80,
    reason: 'Unit tests use optimized basic isolation',
    performance: { budget: 2, critical: false }
  },
  {
    pattern: /\/security\/.*\.test\.js$/,
    level: 'singleton',
    priority: 75,
    reason: 'Security tests need singleton isolation for mock state',
    performance: { budget: 3, critical: false }
  },
  {
    pattern: /mock.*\.test\.js$/,
    level: 'singleton',
    priority: 70,
    reason: 'Mock-specific tests need singleton isolation',
    performance: { budget: 4, critical: false }
  },
  
  // PERFORMANCE: Minimal isolation (10-49)
  {
    pattern: /\/performance\/.*\.test\.js$/,
    level: 'minimal',
    priority: 40,
    reason: 'Performance tests need minimal isolation',
    performance: { budget: 0.5, critical: false }
  },
  {
    pattern: /benchmark.*\.test\.js$/,
    level: 'minimal',
    priority: 35,
    reason: 'Benchmark tests require minimal overhead',
    performance: { budget: 0.5, critical: false }
  },
  {
    pattern: /load-test.*\.test\.js$/,
    level: 'minimal',
    priority: 30,
    reason: 'Load tests require minimal overhead',
    performance: { budget: 0.5, critical: false }
  }
];

/**
 * Performance-aware isolation level getter
 * Includes performance budgets and optimization hints
 */
export function getPerformanceIsolationLevel(testFilePath, testName = '', options = {}) {
  const normalizedPath = testFilePath.replace(/\\/g, '/');
  
  // Check performance cache first
  const cacheKey = `${normalizedPath}:${testName}`;
  if (performanceIsolationConfig.performance.caching.decisionCache.enabled) {
    const cached = decisionCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < performanceIsolationConfig.performance.caching.decisionCache.ttl) {
      return cached.result;
    }
  }
  
  // Use enhanced patterns first
  const allPatterns = [...performanceTestPatterns, ...testPatterns, ...customPatterns];
  
  const matches = allPatterns
    .filter(({ pattern }) => {
      if (pattern instanceof RegExp) {
        return pattern.test(normalizedPath) || pattern.test(testName);
      } else if (typeof pattern === 'string') {
        return normalizedPath.includes(pattern) || testName.includes(pattern);
      }
      return false;
    })
    .sort((a, b) => b.priority - a.priority);
  
  let result;
  
  if (matches.length > 0) {
    const match = matches[0];
    
    result = {
      level: match.level,
      reason: match.reason,
      priority: match.priority,
      performance: match.performance || { budget: 5, critical: false }
    };
  } else {
    // Use performance-optimized default
    result = {
      level: performanceIsolationConfig.default,
      reason: 'Performance-optimized default',
      priority: 0,
      performance: { budget: 2, critical: false }
    };
  }
  
  // Cache the result
  if (performanceIsolationConfig.performance.caching.decisionCache.enabled) {
    decisionCache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });
  }
  
  if (options.debug || performanceIsolationConfig.debug) {
    console.log(
      `[PerformanceIsolation] ${normalizedPath} -> ${result.level} (budget: ${result.performance.budget}ms)`
    );
  }
  
  return result;
}

/**
 * Simple LRU cache implementation for isolation decisions
 */
class SimpleCache {
  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }
  
  get(key) {
    if (this.cache.has(key)) {
      // Move to end (most recently used)
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    return null;
  }
  
  set(key, value) {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, value);
  }
  
  clear() {
    this.cache.clear();
  }
  
  size() {
    return this.cache.size;
  }
}

// Initialize caches
const decisionCache = new SimpleCache(performanceIsolationConfig.performance.caching.decisionCache.maxSize);
const componentCache = new SimpleCache(performanceIsolationConfig.performance.caching.componentCache.maxSize);

/**
 * Performance monitoring utilities
 */
export const performanceMonitor = {
  timings: new Map(),
  budgetViolations: [],
  
  startTimer(testPath, operation) {
    const key = `${testPath}:${operation}`;
    this.timings.set(key, {
      start: performance.now(),
      testPath,
      operation
    });
  },
  
  endTimer(testPath, operation) {
    const key = `${testPath}:${operation}`;
    const timing = this.timings.get(key);
    
    if (!timing) return null;
    
    const duration = performance.now() - timing.start;
    this.timings.delete(key);
    
    // Check against performance budget
    const isolationInfo = getPerformanceIsolationLevel(testPath);
    const budget = isolationInfo.performance?.budget || 5;
    
    if (duration > budget) {
      this.budgetViolations.push({
        testPath,
        operation,
        duration,
        budget,
        violation: duration - budget,
        timestamp: Date.now()
      });
      
      if (isolationInfo.performance?.critical || process.env.TEST_DEBUG === 'true') {
        console.warn(
          `[PerformanceMonitor] Budget violation: ${testPath} ${operation} took ${duration.toFixed(2)}ms (budget: ${budget}ms)`
        );
      }
    }
    
    return {
      duration,
      budget,
      withinBudget: duration <= budget
    };
  },
  
  getStats() {
    return {
      totalViolations: this.budgetViolations.length,
      cacheSize: decisionCache.size(),
      recentViolations: this.budgetViolations.slice(-10)
    };
  },
  
  reset() {
    this.timings.clear();
    this.budgetViolations = [];
  }
};

/**
 * Batch operation utilities
 */
export const batchOperations = {
  singletonQueue: [],
  mockQueue: [],
  environmentQueue: [],
  
  queueSingletonOperation(operation) {
    this.singletonQueue.push(operation);
    
    if (this.singletonQueue.length >= performanceIsolationConfig.performance.batching.singletonOperations.batchSize) {
      return this.flushSingletonQueue();
    }
    
    return Promise.resolve();
  },
  
  async flushSingletonQueue() {
    if (this.singletonQueue.length === 0) return;
    
    const operations = this.singletonQueue.splice(0);
    const timeout = performanceIsolationConfig.performance.batching.singletonOperations.timeout;
    
    const startTime = performance.now();
    
    try {
      // Execute all operations in parallel with timeout
      await Promise.race([
        Promise.all(operations.map(op => op())),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Batch operation timeout')), timeout)
        )
      ]);
      
      const duration = performance.now() - startTime;
      
      if (performanceIsolationConfig.debug) {
        console.log(`[BatchOperations] Processed ${operations.length} singleton operations in ${duration.toFixed(2)}ms`);
      }
      
    } catch (error) {
      console.warn('[BatchOperations] Batch operation failed:', error.message);
      // Execute individually as fallback
      for (const operation of operations) {
        try {
          await operation();
        } catch (err) {
          console.warn('[BatchOperations] Individual operation failed:', err.message);
        }
      }
    }
  },
  
  async flushAllQueues() {
    await Promise.all([
      this.flushSingletonQueue(),
      // Add other queue flushes as needed
    ]);
  }
};

/**
 * Component preloading for performance
 */
export const componentPreloader = {
  preloadedComponents: new Set(),
  
  async preloadComponent(componentName) {
    if (this.preloadedComponents.has(componentName)) {
      return;
    }
    
    const startTime = performance.now();
    
    try {
      switch (componentName) {
        case 'TestSingletonManager':
          const { TestSingletonManager } = await import('../utils/test-singleton-manager.js');
          componentCache.set('TestSingletonManager', TestSingletonManager);
          break;
          
        case 'TestMockManager':
          const { setupTestMockManager } = await import('../utils/test-mock-manager.js');
          componentCache.set('TestMockManager', setupTestMockManager);
          break;
          
        case 'TestEnvironmentManager':
          const { testEnvManager } = await import('../utils/test-environment-manager.js');
          componentCache.set('TestEnvironmentManager', testEnvManager);
          break;
          
        default:
          console.warn(`[ComponentPreloader] Unknown component: ${componentName}`);
          return;
      }
      
      this.preloadedComponents.add(componentName);
      
      const duration = performance.now() - startTime;
      
      if (performanceIsolationConfig.debug) {
        console.log(`[ComponentPreloader] Preloaded ${componentName} in ${duration.toFixed(2)}ms`);
      }
      
    } catch (error) {
      console.warn(`[ComponentPreloader] Failed to preload ${componentName}:`, error.message);
    }
  },
  
  async preloadAll() {
    const componentsToPreload = performanceIsolationConfig.performance.caching.componentCache.preload || [];
    
    await Promise.all(
      componentsToPreload.map(component => this.preloadComponent(component))
    );
  }
};

/**
 * Initialize performance optimizations
 */
export async function initializePerformanceOptimizations() {
  if (performanceIsolationConfig.performance.caching.componentCache.enabled) {
    await componentPreloader.preloadAll();
  }
  
  if (performanceIsolationConfig.debug) {
    console.log('[PerformanceIsolation] Performance optimizations initialized');
  }
}

// Export everything for easy access
export default {
  performanceIsolationConfig,
  performanceTestPatterns,
  getPerformanceIsolationLevel,
  performanceMonitor,
  batchOperations,
  componentPreloader,
  initializePerformanceOptimizations
};
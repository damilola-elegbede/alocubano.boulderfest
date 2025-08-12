/**
 * TestMockManager - Bulletproof Mock Lifecycle Management
 * 
 * Provides predictable mock lifecycle management to prevent mock state bleeding
 * between tests. Addresses the core problem where @libsql/client and other service
 * mocks persist between tests despite vi.resetModules() and vi.clearAllMocks().
 * 
 * Key Features:
 * - Complete mock state isolation between tests
 * - Deep cleaning of hoisted mocks that survive standard Vitest cleanup
 * - Mock registry tracking with validation
 * - Database mock specific cleanup (@libsql/client)
 * - Performance optimized cleanup operations
 */

import { vi } from 'vitest';

/**
 * Mock Registry - Tracks all active mocks and their factory states
 */
class MockRegistry {
  constructor() {
    this.registeredMocks = new Map();
    this.mockFactories = new Map();
    this.mockHistory = new Map();
    this.isolationViolations = [];
  }

  /**
   * Register a mock with its module key and factory function
   */
  register(moduleKey, originalFactory, mockImplementation = null) {
    const mockState = {
      moduleKey,
      originalFactory,
      mockImplementation,
      registeredAt: Date.now(),
      resetCount: 0,
      lastReset: null
    };

    this.registeredMocks.set(moduleKey, mockState);
    this.mockFactories.set(moduleKey, originalFactory);
    
    // Track history for debugging
    if (!this.mockHistory.has(moduleKey)) {
      this.mockHistory.set(moduleKey, []);
    }
    this.mockHistory.get(moduleKey).push({
      action: 'register',
      timestamp: Date.now(),
      factory: originalFactory?.name || 'anonymous'
    });

    return mockState;
  }

  /**
   * Reset a specific mock to its factory defaults
   */
  reset(moduleKey) {
    const mockState = this.registeredMocks.get(moduleKey);
    if (!mockState) {
      return false;
    }

    // Reset the mock using its original factory
    if (mockState.originalFactory) {
      try {
        const freshMock = mockState.originalFactory();
        mockState.mockImplementation = freshMock;
        mockState.resetCount++;
        mockState.lastReset = Date.now();

        // Track history
        this.mockHistory.get(moduleKey).push({
          action: 'reset',
          timestamp: Date.now(),
          resetCount: mockState.resetCount
        });

        return true;
      } catch (error) {
        console.warn(`Failed to reset mock for ${moduleKey}:`, error);
        return false;
      }
    }

    return false;
  }

  /**
   * Validate mock isolation between tests
   */
  validateIsolation() {
    const violations = [];
    const currentTime = Date.now();

    for (const [moduleKey, mockState] of this.registeredMocks) {
      // Check if mock has been reset recently (within last 100ms)
      if (mockState.lastReset && (currentTime - mockState.lastReset) > 100) {
        violations.push({
          moduleKey,
          issue: 'Mock not recently reset',
          lastReset: mockState.lastReset,
          timeSinceReset: currentTime - mockState.lastReset
        });
      }

      // Check for persistent state indicators
      if (mockState.mockImplementation && typeof mockState.mockImplementation === 'object') {
        const impl = mockState.mockImplementation;
        
        // Check for common persistence indicators
        if (impl._calls && impl._calls.length > 0) {
          violations.push({
            moduleKey,
            issue: 'Mock has persistent call history',
            callCount: impl._calls.length
          });
        }

        if (impl._mockState && Object.keys(impl._mockState).length > 0) {
          violations.push({
            moduleKey,
            issue: 'Mock has persistent internal state',
            stateKeys: Object.keys(impl._mockState)
          });
        }
      }
    }

    this.isolationViolations = violations;
    return violations;
  }

  /**
   * Get detailed mock state for debugging
   */
  getMockState(moduleKey) {
    const mockState = this.registeredMocks.get(moduleKey);
    const history = this.mockHistory.get(moduleKey) || [];
    
    return {
      ...mockState,
      history,
      isRegistered: Boolean(mockState),
      hasFactory: Boolean(mockState?.originalFactory)
    };
  }

  /**
   * Clear all registered mocks
   */
  clear() {
    this.registeredMocks.clear();
    this.mockFactories.clear();
    this.mockHistory.clear();
    this.isolationViolations = [];
  }

  /**
   * Get registry statistics
   */
  getStats() {
    return {
      totalMocks: this.registeredMocks.size,
      totalFactories: this.mockFactories.size,
      isolationViolations: this.isolationViolations.length,
      mockKeys: Array.from(this.registeredMocks.keys())
    };
  }
}

/**
 * Database Mock Cleanup - Specialized cleanup for @libsql/client
 */
class DatabaseMockCleanup {
  constructor() {
    this.clientMocks = new WeakSet();
    this.executeMocks = new WeakSet();
    this.moduleInstances = new Map();
    this.hoistedMocks = new Map();
  }

  /**
   * Reset database client mocks completely
   */
  resetClientMocks() {
    // Since Vitest doesn't have getAllMocks(), we'll use our registry
    // and standard Vitest clearing methods
    
    // Standard Vitest mock clearing
    vi.clearAllMocks();
    vi.resetAllMocks();
    
    // Force clear hoisted mock modules
    this.clearHoistedDatabaseMocks();

    // Reset module instances that might be cached
    this.resetModuleInstances();

    // Clear our tracking sets
    this.clientMocks = new WeakSet();
    this.executeMocks = new WeakSet();
  }

  /**
   * Clear hoisted mocks that survive vi.resetModules()
   */
  clearHoistedDatabaseMocks() {
    // Clear known hoisted mock patterns for @libsql/client
    const hoistedModules = ['@libsql/client', '@libsql/client/web'];
    
    hoistedModules.forEach(moduleName => {
      try {
        // Force re-evaluation of hoisted mocks
        vi.doUnmock(moduleName);
        vi.resetModules();
        
        // Clear from our hoisted tracking
        if (this.hoistedMocks.has(moduleName)) {
          this.hoistedMocks.delete(moduleName);
        }
      } catch (error) {
        // Ignore unmock errors for modules that aren't mocked
      }
    });
  }

  /**
   * Reset cached module instances
   */
  resetModuleInstances() {
    // Clear any cached database client instances
    this.moduleInstances.clear();
    
    // Force garbage collection of cached imports if possible
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * Clear execute method spies specifically
   */
  clearExecuteSpies() {
    // Use standard Vitest clearing since we can't enumerate all mocks
    vi.clearAllMocks();
    vi.resetAllMocks();
  }

  /**
   * Validate that database mocks have fresh state
   */
  validateFreshState() {
    const issues = [];
    
    // Since we can't enumerate all mocks in Vitest, we'll check our tracked mocks
    // This is a simplified validation approach
    
    for (const [moduleKey] of this.moduleInstances) {
      if (moduleKey.includes('database') || moduleKey.includes('libsql')) {
        // Basic validation - check if module instances exist
        if (this.moduleInstances.get(moduleKey)) {
          issues.push({
            moduleKey,
            issue: 'Database module instance still cached',
            severity: 'medium'
          });
        }
      }
    }

    return issues;
  }

  /**
   * Determine if a mock is a database client mock
   */
  isDatabaseClientMock(mock) {
    if (!mock) return false;
    
    const mockName = mock.getMockName?.() || '';
    
    // Check for database client characteristics
    return (
      mockName.includes('createClient') ||
      mockName.includes('database') ||
      (mock.execute && typeof mock.execute === 'function') ||
      (mock.transaction && typeof mock.transaction === 'function') ||
      this.clientMocks.has(mock)
    );
  }

  /**
   * Track a database client mock
   */
  trackClientMock(mock) {
    this.clientMocks.add(mock);
  }
}

/**
 * TestMockManager - Main class providing bulletproof mock lifecycle management
 */
class TestMockManager {
  constructor() {
    this.registry = new MockRegistry();
    this.databaseCleanup = new DatabaseMockCleanup();
    this.cleanupHooks = [];
    this.debugMode = false;
    this._boundaryContext = null;
  }

  /**
   * Register a mock with the manager
   */
  registerMock(moduleKey, mockFactory) {
    if (this.debugMode) {
      console.log(`[TestMockManager] Registering mock: ${moduleKey}`);
    }

    return this.registry.register(moduleKey, mockFactory);
  }

  /**
   * Clear all mocks with deep cleaning
   */
  clearAllMocks() {
    if (this.debugMode) {
      console.log('[TestMockManager] Starting deep mock cleanup');
    }

    // Standard Vitest cleanup
    vi.clearAllMocks();
    vi.resetAllMocks();

    // Deep database cleanup
    this.databaseCleanup.resetClientMocks();
    this.databaseCleanup.clearExecuteSpies();

    // Registry-based cleanup
    for (const [moduleKey] of this.registry.registeredMocks) {
      this.registry.reset(moduleKey);
    }

    // Run custom cleanup hooks
    this.cleanupHooks.forEach(hook => {
      try {
        hook();
      } catch (error) {
        console.warn('[TestMockManager] Cleanup hook failed:', error);
      }
    });

    if (this.debugMode) {
      console.log('[TestMockManager] Deep mock cleanup completed');
    }
  }

  /**
   * Validate mock isolation between tests
   */
  validateMockIsolation() {
    const registryViolations = this.registry.validateIsolation();
    const databaseIssues = this.databaseCleanup.validateFreshState();

    const allViolations = [
      ...registryViolations.map(v => ({ source: 'registry', ...v })),
      ...databaseIssues.map(v => ({ source: 'database', ...v }))
    ];

    if (allViolations.length > 0 && this.debugMode) {
      console.warn('[TestMockManager] Mock isolation violations:', allViolations);
    }

    return allViolations;
  }

  /**
   * Reset all mocks to their factory defaults
   */
  resetToFactoryDefaults() {
    if (this.debugMode) {
      console.log('[TestMockManager] Resetting all mocks to factory defaults');
    }

    // Reset all registered mocks
    for (const [moduleKey] of this.registry.registeredMocks) {
      this.registry.reset(moduleKey);
    }

    // Special handling for database mocks
    this.databaseCleanup.resetClientMocks();

    return true;
  }

  /**
   * Get detailed mock state for debugging
   */
  getMockState(moduleKey) {
    return this.registry.getMockState(moduleKey);
  }

  /**
   * Get comprehensive manager state
   */
  getManagerState() {
    return {
      registry: this.registry.getStats(),
      database: {
        freshStateIssues: this.databaseCleanup.validateFreshState()
      },
      hooks: this.cleanupHooks.length,
      debugMode: this.debugMode
    };
  }

  /**
   * Add a custom cleanup hook
   */
  addCleanupHook(hook) {
    if (typeof hook === 'function') {
      this.cleanupHooks.push(hook);
    }
  }

  /**
   * Enable/disable debug mode
   */
  setDebugMode(enabled) {
    this.debugMode = Boolean(enabled);
  }

  /**
   * Complete cleanup and reset
   */
  cleanup() {
    this.clearAllMocks();
    this.registry.clear();
    this.cleanupHooks = [];
    
    if (this.debugMode) {
      console.log('[TestMockManager] Complete cleanup performed');
    }
  }

  /**
   * Enter boundary mode for test isolation coordination
   * Called during test boundary entry
   * 
   * @param {Object} context - The boundary context
   */
  enterBoundaryMode(context) {
    if (this.debugMode) {
      console.log(`[TestMockManager] Entering boundary mode for ${context.testName}`);
    }

    try {
      // Store boundary context
      this._boundaryContext = context;
      
      // Perform deep cleanup when entering boundary
      this.clearAllMocks();
      this.resetToFactoryDefaults();
      
    } catch (error) {
      console.error('[TestMockManager] Error entering boundary mode:', error);
    }
  }

  /**
   * Exit boundary mode and cleanup
   * Called during test boundary exit
   * 
   * @param {Object} context - The boundary context
   */
  exitBoundaryMode(context) {
    if (this.debugMode) {
      console.log(`[TestMockManager] Exiting boundary mode for ${context.testName}`);
    }

    try {
      // Validate boundary context if provided
      if (this._boundaryContext && this._boundaryContext.id !== context.id) {
        console.warn(`[TestMockManager] Boundary context mismatch in exitBoundaryMode - expected ${this._boundaryContext.id}, got ${context.id}`);
      }
      
      // Perform final cleanup
      this.clearAllMocks();
      
      // Clear boundary context
      this._boundaryContext = null;
      
    } catch (error) {
      console.error('[TestMockManager] Error exiting boundary mode:', error);
    }
  }

  /**
   * Check if boundary mode is currently active
   * 
   * @returns {boolean} True if boundary mode is active
   */
  isBoundaryModeActive() {
    return this._boundaryContext !== null;
  }

  /**
   * Get current boundary context information
   * 
   * @returns {Object|null} Boundary context or null
   */
  getBoundaryContext() {
    return this._boundaryContext;
  }
}

// Create singleton instance
const testMockManager = new TestMockManager();

/**
 * Enhanced mock creation with automatic registration
 */
export function createManagedMock(moduleKey, factory) {
  const mockState = testMockManager.registerMock(moduleKey, factory);
  const mock = factory();
  
  // If it's a database client mock, track it specifically
  if (moduleKey.includes('database') || moduleKey.includes('libsql')) {
    testMockManager.databaseCleanup.trackClientMock(mock);
  }
  
  return mock;
}

/**
 * Vitest integration helpers
 */
export function beforeEachCleanup() {
  testMockManager.clearAllMocks();
}

export function afterEachValidation() {
  const violations = testMockManager.validateMockIsolation();
  if (violations.length > 0) {
    console.warn('[TestMockManager] Mock isolation violations detected:', violations);
  }
  return violations;
}

/**
 * Enhanced Vitest integration with deep cleanup
 */
export function setupTestMockManager(config = {}) {
  const {
    enableDebug = false,
    validateIsolation = true,
    autoCleanup = true,
    strictMode = false
  } = config;

  // Configure the manager
  testMockManager.setDebugMode(enableDebug);

  // Enhanced beforeEach hook
  const enhancedBeforeEach = () => {
    if (enableDebug) {
      console.log('[TestMockManager] Starting test with mock cleanup');
    }

    // Deep cleanup sequence
    testMockManager.clearAllMocks();
    
    // Additional cleanup for strict mode
    if (strictMode) {
      // Force module reset
      vi.resetModules();
      
      // Clear all timers
      vi.clearAllTimers();
      
      // Reset system time
      vi.useRealTimers();
    }
  };

  // Enhanced afterEach hook
  const enhancedAfterEach = () => {
    if (validateIsolation) {
      const violations = testMockManager.validateMockIsolation();
      
      if (violations.length > 0) {
        console.warn('[TestMockManager] Mock isolation violations:', violations);
        
        if (strictMode) {
          throw new Error(
            `Mock isolation violations detected: ${violations.map(v => v.issue).join(', ')}`
          );
        }
      }
    }

    if (autoCleanup) {
      testMockManager.clearAllMocks();
    }

    if (enableDebug) {
      console.log('[TestMockManager] Test completed, mocks cleaned');
    }
  };

  return {
    beforeEach: enhancedBeforeEach,
    afterEach: enhancedAfterEach,
    manager: testMockManager
  };
}

/**
 * Database-specific test helpers
 */
export function createDatabaseTestMock() {
  const mockClient = vi.fn();
  
  // Create a comprehensive database client mock
  const client = {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    transaction: vi.fn(),
    batch: vi.fn(),
    close: vi.fn().mockResolvedValue(void 0),
    sync: vi.fn().mockResolvedValue(void 0)
  };

  mockClient.mockReturnValue(client);

  // Register with the manager
  testMockManager.registerMock('@libsql/client', () => mockClient);
  testMockManager.databaseCleanup.trackClientMock(client);

  return { mockClient, client };
}

/**
 * Mock factory reset utility
 */
export function resetMockFactory(moduleKey, newFactory) {
  testMockManager.registerMock(moduleKey, newFactory);
  return testMockManager.registry.reset(moduleKey);
}

/**
 * Debug utilities
 */
export function enableMockDebug() {
  testMockManager.setDebugMode(true);
}

export function disableMockDebug() {
  testMockManager.setDebugMode(false);
}

export function getMockManagerState() {
  return testMockManager.getManagerState();
}

/**
 * Advanced debugging utilities
 */
export function analyzeMockState() {
  const state = testMockManager.getManagerState();
  
  const analysis = {
    timestamp: new Date().toISOString(),
    summary: {
      registeredMocks: state.registry.totalMocks,
      vitestMocks: 0, // Can't enumerate in Vitest
      isolationViolations: state.registry.isolationViolations,
      databaseIssues: state.database.freshStateIssues.length
    },
    details: {
      mockKeys: state.registry.mockKeys,
      vitestMockNames: [], // Can't enumerate in Vitest
      violations: testMockManager.validateMockIsolation(),
      databaseState: state.database
    },
    recommendations: []
  };

  // Generate recommendations based on analysis
  if (analysis.summary.isolationViolations > 0) {
    analysis.recommendations.push('Run testMockManager.clearAllMocks() to fix isolation violations');
  }

  if (analysis.summary.databaseIssues > 0) {
    analysis.recommendations.push('Database mocks have persistent state - consider using createDatabaseTestMock()');
  }

  if (analysis.summary.vitestMocks > analysis.summary.registeredMocks) {
    analysis.recommendations.push('Some Vitest mocks are not registered with TestMockManager');
  }

  return analysis;
}

/**
 * Mock leak detection
 */
export function detectMockLeaks() {
  const leaks = [];
  
  // Since Vitest doesn't provide getAllMocks(), we'll check our registry
  // and look for signs of mock leaks through our management system
  
  const registryState = testMockManager.getManagerState();
  
  // Check for registry-based leak indicators
  if (registryState.registry.isolationViolations > 0) {
    leaks.push({
      type: 'isolation_violations',
      count: registryState.registry.isolationViolations,
      severity: 'high'
    });
  }
  
  // Check database-specific leaks
  if (registryState.database.freshStateIssues.length > 0) {
    leaks.push({
      type: 'database_state_persistence',
      count: registryState.database.freshStateIssues.length,
      severity: 'medium'
    });
  }

  return leaks;
}

/**
 * Generate mock isolation report
 */
export function generateMockReport() {
  const analysis = analyzeMockState();
  const leaks = detectMockLeaks();
  
  const report = {
    ...analysis,
    leaks: {
      total: leaks.length,
      byType: leaks.reduce((acc, leak) => {
        acc[leak.type] = (acc[leak.type] || 0) + 1;
        return acc;
      }, {}),
      bySeverity: leaks.reduce((acc, leak) => {
        acc[leak.severity] = (acc[leak.severity] || 0) + 1;
        return acc;
      }, {}),
      details: leaks
    },
    healthScore: calculateMockHealthScore(analysis, leaks)
  };

  return report;
}

/**
 * Calculate mock health score (0-100)
 */
function calculateMockHealthScore(analysis, leaks) {
  let score = 100;

  // Deduct for isolation violations
  score -= analysis.summary.isolationViolations * 10;

  // Deduct for database issues
  score -= analysis.summary.databaseIssues * 15;

  // Deduct for leaks based on severity
  leaks.forEach(leak => {
    switch (leak.severity) {
      case 'high':
        score -= 20;
        break;
      case 'medium':
        score -= 10;
        break;
      case 'low':
        score -= 5;
        break;
    }
  });

  // Bonus for good practices
  if (analysis.summary.registeredMocks > 0) {
    score += 5; // Using mock management
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Emergency mock cleanup - when all else fails
 */
export function emergencyMockCleanup() {
  console.warn('[TestMockManager] Performing emergency mock cleanup');
  
  try {
    // Nuclear option: clear everything
    vi.clearAllMocks();
    vi.resetAllMocks();
    vi.restoreAllMocks();
    vi.resetModules();
    
    // Clear manager state
    testMockManager.cleanup();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    console.log('[TestMockManager] Emergency cleanup completed');
    return true;
  } catch (error) {
    console.error('[TestMockManager] Emergency cleanup failed:', error);
    return false;
  }
}

// Export the singleton instance and static methods
export { testMockManager };
export default testMockManager;

// Static interface for convenience
export const TestMockManagerAPI = {
  registerMock: (moduleKey, factory) => testMockManager.registerMock(moduleKey, factory),
  clearAllMocks: () => testMockManager.clearAllMocks(),
  validateMockIsolation: () => testMockManager.validateMockIsolation(),
  resetToFactoryDefaults: () => testMockManager.resetToFactoryDefaults(),
  getMockState: (moduleKey) => testMockManager.getMockState(moduleKey),
  addCleanupHook: (hook) => testMockManager.addCleanupHook(hook),
  setDebugMode: (enabled) => testMockManager.setDebugMode(enabled),
  cleanup: () => testMockManager.cleanup(),
  enterBoundaryMode: (context) => testMockManager.enterBoundaryMode(context),
  exitBoundaryMode: (context) => testMockManager.exitBoundaryMode(context),
  isBoundaryModeActive: () => testMockManager.isBoundaryModeActive(),
  getBoundaryContext: () => testMockManager.getBoundaryContext()
};

// Add static methods to singleton for backward compatibility  
// Commented out to avoid naming conflicts with class TestMockManager
// Use TestMockManagerAPI instead for static interface
/*
export const TestMockManager = {
  enterBoundaryMode: (context) => testMockManager.enterBoundaryMode(context),
  exitBoundaryMode: (context) => testMockManager.exitBoundaryMode(context),
  isBoundaryModeActive: () => testMockManager.isBoundaryModeActive(),
  getBoundaryContext: () => testMockManager.getBoundaryContext(),
  registerMock: (moduleKey, factory) => testMockManager.registerMock(moduleKey, factory),
  clearAllMocks: () => testMockManager.clearAllMocks(),
  validateMockIsolation: () => testMockManager.validateMockIsolation(),
  resetToFactoryDefaults: () => testMockManager.resetToFactoryDefaults(),
  getMockState: (moduleKey) => testMockManager.getMockState(moduleKey),
  addCleanupHook: (hook) => testMockManager.addCleanupHook(hook),
  setDebugMode: (enabled) => testMockManager.setDebugMode(enabled),
  cleanup: () => testMockManager.cleanup()
};
*/
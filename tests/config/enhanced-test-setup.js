/**
 * Enhanced Test Setup Configuration
 * 
 * Provides advanced test isolation, mocking, and environment management
 * for comprehensive testing across unit, integration, and performance test suites.
 * 
 * Features:
 * - Multi-level test isolation (process, database, environment)
 * - Performance-aware test configuration
 * - Memory-optimized test execution
 * - Automatic cleanup and restoration
 * 
 * Usage:
 * - Import specific utilities as needed
 * - Use withCompleteIsolation for critical tests
 * - Apply isolationEngine for database-sensitive tests
 */

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Performance-aware configuration loading
let performanceConfig = null;
try {
  const configPath = path.join(__dirname, 'performance-isolation-config.js');
  if (existsSync(configPath)) {
    const module = await import('./performance-isolation-config.js');
    performanceConfig = module.default || module;
  }
} catch (error) {
  console.warn('Performance configuration not available, using defaults:', error.message);
}

// Fallback to base configuration if performance config not available
import { isolationConfig, getTestIsolationLevel } from './isolation-config.js';

import { backupEnv, restoreEnv, resetDatabaseSingleton, cleanupTest } from "./helpers/simple-helpers.js";
/**
 * Enhanced Test Isolation Engine
 * 
 * Provides comprehensive test isolation with performance optimization.
 * Manages environment variables, database state, and process-level isolation.
 */
class EnhancedTestIsolationEngine {
  constructor() {
    this.initialized = false;
    this.isolationLevel = 'standard';
    this.activeBackups = new Map();
    this.cleanupTasks = [];
    this.performanceMetrics = {
      setupTime: 0,
      cleanupTime: 0,
      isolationOverhead: 0
    };
  }

  async initialize() {
    if (this.initialized) return;
    
    const startTime = performance.now();
    
    try {
      // Determine isolation level based on environment and configuration
      this.isolationLevel = await getTestIsolationLevel();
      
      // Initialize performance-specific configurations
      if (performanceConfig) {
        await this._initializePerformanceConfig();
      }
      
      this.initialized = true;
      this.performanceMetrics.setupTime = performance.now() - startTime;
    } catch (error) {
      console.error('Failed to initialize enhanced test isolation:', error);
      throw error;
    }
  }

  async _initializePerformanceConfig() {
    if (!performanceConfig) return;
    
    try {
      // Apply memory optimization settings
      if (performanceConfig.memoryOptimization) {
        process.env.NODE_OPTIONS = performanceConfig.memoryOptimization.nodeOptions || process.env.NODE_OPTIONS;
      }
      
      // Configure test execution parameters
      if (performanceConfig.executionLimits) {
        this.executionLimits = performanceConfig.executionLimits;
      }
      
      // Set up performance monitoring
      if (performanceConfig.monitoring?.enabled) {
        this._initializePerformanceMonitoring();
      }
    } catch (error) {
      console.warn('Performance config initialization failed:', error);
    }
  }

  _initializePerformanceMonitoring() {
    // Track memory usage and test execution times
    this.performanceMonitoring = {
      memoryUsage: process.memoryUsage(),
      startTime: process.hrtime(),
      testMetrics: new Map()
    };
  }

  async createIsolatedEnvironment(key, options = {}) {
    await this.initialize();
    
    const isolationKey = key || `isolation-${Date.now()}-${Math.random()}`;
    const backup = {
      env: backupEnv(),
      databaseState: null,
      timestamp: Date.now()
    };

    // Store backup for later restoration
    this.activeBackups.set(isolationKey, backup);
    
    // Apply isolation options
    if (options.resetDatabase !== false) {
      await resetDatabaseSingleton();
    }
    
    if (options.cleanEnv !== false) {
      this._applyCleanEnvironment(options.envWhitelist);
    }
    
    // Register cleanup task
    this.cleanupTasks.push(() => this.restoreEnvironment(isolationKey));
    
    return isolationKey;
  }

  _applyCleanEnvironment(whitelist = []) {
    // Preserve essential environment variables
    const essentialEnvs = [
      'NODE_ENV', 'PATH', 'HOME', 'USER',
      'VITEST', 'VITEST_POOL_ID', 'VITEST_WORKER_ID',
      ...whitelist
    ];
    
    const currentEnv = { ...process.env };
    
    // Clear all non-essential environment variables
    for (const key of Object.keys(process.env)) {
      if (!essentialEnvs.includes(key)) {
        delete process.env[key];
      }
    }
  }

  async restoreEnvironment(isolationKey) {
    const backup = this.activeBackups.get(isolationKey);
    if (!backup) {
      console.warn(`No backup found for isolation key: ${isolationKey}`);
      return;
    }
    
    const startTime = performance.now();
    
    try {
      // Restore environment variables
      restoreEnv(backup.env);
      
      // Reset database singleton
      await resetDatabaseSingleton();
      
      // Perform any additional cleanup
      await cleanupTest();
      
      // Remove backup
      this.activeBackups.delete(isolationKey);
      
      // Update metrics
      this.performanceMetrics.cleanupTime += performance.now() - startTime;
    } catch (error) {
      console.error(`Failed to restore environment for ${isolationKey}:`, error);
      throw error;
    }
  }

  async cleanup() {
    const startTime = performance.now();
    
    try {
      // Execute all pending cleanup tasks
      for (const cleanupTask of this.cleanupTasks) {
        try {
          await cleanupTask();
        } catch (error) {
          console.error('Cleanup task failed:', error);
        }
      }
      
      // Clear all active backups
      this.activeBackups.clear();
      this.cleanupTasks = [];
      
      // Performance cleanup
      this.performanceMetrics.cleanupTime += performance.now() - startTime;
      
    } catch (error) {
      console.error('Enhanced isolation cleanup failed:', error);
    }
  }

  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      activeBackups: this.activeBackups.size,
      pendingCleanupTasks: this.cleanupTasks.length,
      isolationLevel: this.isolationLevel
    };
  }
}

// Global isolation engine instance
export const isolationEngine = new EnhancedTestIsolationEngine();

/**
 * Process-level isolation utilities
 */
export class ProcessIsolation {
  static async forkIsolatedProcess(testFn, options = {}) {
    const { fork } = require('child_process');
    
    return new Promise((resolve, reject) => {
      const child = fork(__filename, [], {
        env: { ...process.env, ISOLATED_TEST: 'true' },
        silent: true,
        ...options
      });
      
      child.on('message', (result) => {
        if (result.error) {
          reject(new Error(result.error));
        } else {
          resolve(result.data);
        }
      });
      
      child.on('error', reject);
      
      // Send test function to child process
      child.send({ testFunction: testFn.toString() });
    });
  }
  
  static async withProcessIsolation(testFn, options = {}) {
    if (process.env.ISOLATED_TEST) {
      // We're already in an isolated process
      return await testFn();
    }
    
    return await ProcessIsolation.forkIsolatedProcess(testFn, options);
  }
}

/**
 * Memory management utilities
 */
export class MemoryManager {
  static getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      rss: Math.round(usage.rss / 1024 / 1024),
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
      external: Math.round(usage.external / 1024 / 1024)
    };
  }
  
  static forceGarbageCollection() {
    if (global.gc) {
      global.gc();
    }
  }
  
  static async withMemoryMonitoring(testFn, options = {}) {
    const initialMemory = MemoryManager.getMemoryUsage();
    
    try {
      const result = await testFn();
      
      if (options.forceCleanup) {
        MemoryManager.forceGarbageCollection();
      }
      
      const finalMemory = MemoryManager.getMemoryUsage();
      const memoryDelta = {
        rss: finalMemory.rss - initialMemory.rss,
        heapUsed: finalMemory.heapUsed - initialMemory.heapUsed
      };
      
      if (options.logMemoryUsage) {
        console.log(`Memory usage change: ${JSON.stringify(memoryDelta)} MB`);
      }
      
      return { result, memoryDelta };
    } catch (error) {
      // Cleanup even on error
      if (options.forceCleanup) {
        MemoryManager.forceGarbageCollection();
      }
      throw error;
    }
  }
}

/**
 * Database-specific isolation utilities
 */
export class DatabaseIsolation {
  static async withDatabaseTransaction(testFn, options = {}) {
    const { getDatabaseClient } = await import('../../api/lib/database.js');
    const client = await getDatabaseClient();
    
    if (!client.execute) {
      throw new Error('Database client does not support transactions');
    }
    
    let transaction;
    try {
      await client.execute('BEGIN');
      transaction = true;
      
      const result = await testFn(client);
      
      if (options.commit !== false) {
        await client.execute('COMMIT');
      } else {
        await client.execute('ROLLBACK');
      }
      
      return result;
    } catch (error) {
      if (transaction) {
        try {
          await client.execute('ROLLBACK');
        } catch (rollbackError) {
          console.error('Transaction rollback failed:', rollbackError);
        }
      }
      throw error;
    }
  }
  
  static async resetToCleanState() {
    try {
      await resetDatabaseSingleton();
      
      // Additional database cleanup if needed
      const { getDatabaseClient } = await import('../../api/lib/database.js');
      const client = await getDatabaseClient();
      
      // Clean up test data
      const tables = ['test_users', 'test_registrations', 'test_subscriptions'];
      for (const table of tables) {
        try {
          await client.execute(`DELETE FROM ${table} WHERE created_at < datetime('now', '-1 hour')`);
        } catch (error) {
          // Table might not exist, which is fine
          console.debug(`Could not clean table ${table}:`, error.message);
        }
      }
    } catch (error) {
      console.error('Database reset failed:', error);
      throw error;
    }
  }
}

/**
 * Environment variable isolation with enhanced backup/restore
 */
export class EnvironmentIsolation {
  constructor() {
    this.backups = new Map();
    this.listeners = new Set();
  }
  
  backup(key = 'default') {
    const backup = backupEnv();
    this.backups.set(key, backup);
    return key;
  }
  
  restore(key = 'default') {
    const backup = this.backups.get(key);
    if (!backup) {
      throw new Error(`No environment backup found for key: ${key}`);
    }
    
    restoreEnv(backup);
    this.backups.delete(key);
  }
  
  async withCleanEnv(testFn, whitelist = []) {
    const backupKey = this.backup();
    
    try {
      // Apply clean environment
      isolationEngine._applyCleanEnvironment(whitelist);
      
      return await testFn();
    } finally {
      this.restore(backupKey);
    }
  }
  
  async withEnvVars(envVars, testFn) {
    const backupKey = this.backup();
    
    try {
      // Apply temporary environment variables
      Object.assign(process.env, envVars);
      
      return await testFn();
    } finally {
      this.restore(backupKey);
    }
  }
  
  onEnvChange(callback) {
    this.listeners.add(callback);
  }
  
  offEnvChange(callback) {
    this.listeners.delete(callback);
  }
}

// Global environment isolation instance
export const environmentIsolation = new EnvironmentIsolation();

/**
 * Test lifecycle hooks
 */
export class TestLifecycle {
  static async beforeEach(testFn, options = {}) {
    await isolationEngine.initialize();
    
    const isolationKey = await isolationEngine.createIsolatedEnvironment(
      options.isolationKey,
      options
    );
    
    try {
      return await testFn();
    } finally {
      if (options.autoCleanup !== false) {
        await isolationEngine.restoreEnvironment(isolationKey);
      }
    }
  }
  
  static async afterEach(options = {}) {
    if (options.forceCleanup) {
      await isolationEngine.cleanup();
      MemoryManager.forceGarbageCollection();
    }
  }
  
  static async afterAll() {
    await isolationEngine.cleanup();
  }
}

/**
 * Enhanced test isolation utilities
 */
export function withCompleteIsolationEnhanced(testFn) {
  return async function(testContext) {
    await isolationEngine.initialize();
    
    // Force complete isolation for this specific test
    const tempKey = testContext?.file?.filepath || `temp-${Date.now()}`;
    const isolationKey = await isolationEngine.createIsolatedEnvironment(tempKey, {
      resetDatabase: true,
      cleanEnv: true,
      envWhitelist: ['NODE_ENV', 'VITEST']
    });
    
    try {
      // Execute test with complete isolation
      return await testFn();
    } finally {
      // Always cleanup, even on failure
      await isolationEngine.restoreEnvironment(isolationKey);
    }
  };
}

/**
 * Performance-optimized test utilities
 */
export class PerformanceTestUtils {
  static async measureTestPerformance(testFn, iterations = 1) {
    const metrics = [];
    
    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      const startMemory = MemoryManager.getMemoryUsage();
      
      try {
        await testFn();
      } catch (error) {
        metrics.push({
          iteration: i,
          error: error.message,
          duration: performance.now() - startTime
        });
        continue;
      }
      
      const endTime = performance.now();
      const endMemory = MemoryManager.getMemoryUsage();
      
      metrics.push({
        iteration: i,
        duration: endTime - startTime,
        memoryDelta: endMemory.heapUsed - startMemory.heapUsed,
        success: true
      });
    }
    
    return {
      metrics,
      average: metrics.reduce((acc, m) => acc + (m.duration || 0), 0) / metrics.length,
      failures: metrics.filter(m => m.error).length,
      successRate: metrics.filter(m => m.success).length / metrics.length
    };
  }
  
  static async benchmarkFunction(fn, options = {}) {
    const {
      iterations = 100,
      warmup = 10,
      timeout = 30000
    } = options;
    
    // Warmup runs
    for (let i = 0; i < warmup; i++) {
      try {
        await Promise.race([
          fn(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Warmup timeout')), timeout)
          )
        ]);
      } catch (error) {
        console.warn(`Warmup iteration ${i} failed:`, error.message);
      }
    }
    
    // Actual benchmark
    return await PerformanceTestUtils.measureTestPerformance(fn, iterations);
  }
}

/**
 * Integration with Vitest lifecycle
 */
export function setupVitestIntegration() {
  if (typeof globalThis.beforeEach === 'function') {
    globalThis.beforeEach(async () => {
      await isolationEngine.initialize();
    });
    
    globalThis.afterEach(async () => {
      await TestLifecycle.afterEach({ forceCleanup: false });
    });
    
    globalThis.afterAll(async () => {
      await TestLifecycle.afterAll();
    });
  }
}

/**
 * Export configuration and utilities
 */
export default {
  isolationEngine,
  ProcessIsolation,
  MemoryManager,
  DatabaseIsolation,
  EnvironmentIsolation,
  TestLifecycle,
  PerformanceTestUtils,
  environmentIsolation,
  withCompleteIsolationEnhanced,
  setupVitestIntegration
};

// Auto-setup integration if in test environment
if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
  setupVitestIntegration();
}

// Handle process-level test execution
if (process.env.ISOLATED_TEST && process.send) {
  process.on('message', async (message) => {
    try {
      const testFn = new Function('return ' + message.testFunction)();
      const result = await testFn();
      process.send({ data: result });
    } catch (error) {
      process.send({ error: error.message });
    }
    process.exit(0);
  });
}
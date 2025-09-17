/**
 * Enterprise Feature Flag System
 *
 * Provides controlled rollout capabilities for the enterprise database system:
 * - Feature flags for enabling new connection management
 * - A/B testing between legacy and enterprise systems
 * - Canary deployment support for safe production rollout
 * - Emergency rollback capabilities
 * - User/request-based targeting
 * - Performance impact monitoring
 */

import { logger } from './logger.js';
import { EnvironmentDetector } from './utils/environment-detector.js';

/**
 * Feature flag definitions with metadata
 */
const FEATURE_FLAGS = {
  // Core enterprise features
  ENABLE_CONNECTION_POOL: {
    key: 'ENABLE_CONNECTION_POOL',
    name: 'Connection Pool Manager',
    description: 'Enable enterprise connection pool management',
    category: 'database',
    defaultValue: false,
    environment_defaults: {
      test: false,
      development: true,
      preview: false,
      production: false
    },
    rollout_strategy: 'percentage',
    metadata: {
      impact: 'high',
      risk: 'medium',
      dependencies: [],
      introduced: '2024-01-01'
    }
  },

  ENABLE_STATE_MACHINE: {
    key: 'ENABLE_STATE_MACHINE',
    name: 'Connection State Machine',
    description: 'Enable connection state management and transitions',
    category: 'database',
    defaultValue: false,
    environment_defaults: {
      test: false,
      development: true,
      preview: false,
      production: false
    },
    rollout_strategy: 'user_percentage',
    metadata: {
      impact: 'medium',
      risk: 'low',
      dependencies: ['ENABLE_CONNECTION_POOL'],
      introduced: '2024-01-01'
    }
  },

  ENABLE_CIRCUIT_BREAKER: {
    key: 'ENABLE_CIRCUIT_BREAKER',
    name: 'Circuit Breaker Protection',
    description: 'Enable circuit breaker for database operations',
    category: 'database',
    defaultValue: false,
    environment_defaults: {
      test: false,
      development: true,
      preview: true,
      production: false
    },
    rollout_strategy: 'environment',
    metadata: {
      impact: 'high',
      risk: 'low',
      dependencies: [],
      introduced: '2024-01-01'
    }
  },

  ENABLE_ENTERPRISE_MONITORING: {
    key: 'ENABLE_ENTERPRISE_MONITORING',
    name: 'Enterprise Monitoring',
    description: 'Enable comprehensive database monitoring and metrics',
    category: 'monitoring',
    defaultValue: false,
    environment_defaults: {
      test: false,
      development: true,
      preview: true,
      production: true
    },
    rollout_strategy: 'environment',
    metadata: {
      impact: 'low',
      risk: 'low',
      dependencies: [],
      introduced: '2024-01-01'
    }
  },

  ENABLE_PERFORMANCE_OPTIMIZATION: {
    key: 'ENABLE_PERFORMANCE_OPTIMIZATION',
    name: 'Performance Optimizations',
    description: 'Enable advanced performance optimizations',
    category: 'performance',
    defaultValue: false,
    environment_defaults: {
      test: false,
      development: false,
      preview: true,
      production: false
    },
    rollout_strategy: 'percentage',
    metadata: {
      impact: 'medium',
      risk: 'medium',
      dependencies: ['ENABLE_CONNECTION_POOL'],
      introduced: '2024-01-01'
    }
  },

  // Migration and compatibility flags
  ENABLE_LEGACY_FALLBACK: {
    key: 'ENABLE_LEGACY_FALLBACK',
    name: 'Legacy System Fallback',
    description: 'Enable fallback to legacy database system on enterprise failure',
    category: 'migration',
    defaultValue: true,
    environment_defaults: {
      test: false,
      development: true,
      preview: true,
      production: true
    },
    rollout_strategy: 'killswitch',
    metadata: {
      impact: 'high',
      risk: 'low',
      dependencies: [],
      introduced: '2024-01-01'
    }
  },

  ENABLE_MIGRATION_MODE: {
    key: 'ENABLE_MIGRATION_MODE',
    name: 'Migration Mode',
    description: 'Enable migration mode for gradual rollout',
    category: 'migration',
    defaultValue: false,
    environment_defaults: {
      test: false,
      development: false,
      preview: false,
      production: false
    },
    rollout_strategy: 'manual',
    metadata: {
      impact: 'high',
      risk: 'medium',
      dependencies: [],
      introduced: '2024-01-01'
    }
  },

  // Performance and debugging flags
  ENABLE_DETAILED_LOGGING: {
    key: 'ENABLE_DETAILED_LOGGING',
    name: 'Detailed Logging',
    description: 'Enable detailed logging for enterprise database operations',
    category: 'debugging',
    defaultValue: false,
    environment_defaults: {
      test: false,
      development: true,
      preview: false,
      production: false
    },
    rollout_strategy: 'environment',
    metadata: {
      impact: 'low',
      risk: 'low',
      dependencies: [],
      introduced: '2024-01-01'
    }
  },

  ENABLE_CANARY_TESTING: {
    key: 'ENABLE_CANARY_TESTING',
    name: 'Canary Testing',
    description: 'Enable canary testing for new features',
    category: 'testing',
    defaultValue: false,
    environment_defaults: {
      test: false,
      development: false,
      preview: true,
      production: false
    },
    rollout_strategy: 'user_percentage',
    metadata: {
      impact: 'medium',
      risk: 'medium',
      dependencies: [],
      introduced: '2024-01-01'
    }
  }
};

/**
 * Rollout strategies
 */
const ROLLOUT_STRATEGIES = {
  percentage: 'Percentage-based rollout',
  user_percentage: 'User-based percentage rollout',
  environment: 'Environment-based rollout',
  manual: 'Manual activation',
  killswitch: 'Emergency killswitch'
};

/**
 * Feature flag evaluation context
 */
class FeatureFlagContext {
  constructor(options = {}) {
    this.userId = options.userId || null;
    this.sessionId = options.sessionId || null;
    this.requestId = options.requestId || null;
    this.environment = options.environment || EnvironmentDetector.detectEnvironment();
    this.timestamp = options.timestamp || Date.now();
    this.userAgent = options.userAgent || null;
    this.ipAddress = options.ipAddress || null;
    this.customAttributes = options.customAttributes || {};
  }

  /**
   * Generate a deterministic hash for consistent feature flag evaluation
   */
  generateHash(flagKey) {
    const input = `${flagKey}-${this.userId || this.sessionId || this.requestId || 'anonymous'}`;
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash) % 100; // Return 0-99
  }

  /**
   * Check if user is in percentage rollout
   */
  isInPercentage(percentage) {
    if (percentage >= 100) return true;
    if (percentage <= 0) return false;
    return this.generateHash('percentage') < percentage;
  }

  /**
   * Check if user is in canary group
   */
  isInCanaryGroup() {
    return this.generateHash('canary') < 10; // 10% canary group
  }
}

/**
 * Enterprise Feature Flag Manager
 */
export class FeatureFlagManager {
  constructor() {
    this.flags = new Map();
    this.overrides = new Map(); // Runtime overrides
    this.metrics = new Map(); // Flag usage metrics
    this.observers = new Set();
    this.initialized = false;
    this.environment = EnvironmentDetector.detectEnvironment();
    this.rolloutConfig = new Map(); // Rollout configuration

    this._initializeFlags();
  }

  /**
   * Initialize feature flags
   */
  _initializeFlags() {
    try {
      // Load flags from configuration
      for (const [key, config] of Object.entries(FEATURE_FLAGS)) {
        this.flags.set(key, {
          ...config,
          currentValue: this._getDefaultValue(config),
          evaluationCount: 0,
          lastEvaluation: null
        });
      }

      // Load environment variable overrides
      this._loadEnvironmentOverrides();

      // Load rollout configuration
      this._loadRolloutConfiguration();

      this.initialized = true;
      logger.debug('Feature flags initialized:', {
        environment: this.environment,
        flagCount: this.flags.size
      });

    } catch (error) {
      logger.error('Failed to initialize feature flags:', error.message);
      throw error;
    }
  }

  /**
   * Evaluate a feature flag for given context
   */
  isEnabled(flagKey, context = null) {
    const flagContext = context || new FeatureFlagContext();

    try {
      const flag = this.flags.get(flagKey);
      if (!flag) {
        logger.warn(`Unknown feature flag: ${flagKey}`);
        return false;
      }

      // DEBUG: Log comprehensive state for ENABLE_CONNECTION_POOL
      if (flagKey === 'ENABLE_CONNECTION_POOL') {
        console.log(`🔍 [DEBUG] Feature Flag Evaluation for ${flagKey}:`);
        console.log(`  Environment: ${this.environment}`);
        console.log(`  Flag exists: ${!!flag}`);
        console.log(`  Flag defaultValue: ${flag?.defaultValue}`);
        console.log(`  Flag currentValue: ${flag?.currentValue}`);
        console.log(`  Flag rollout_strategy: ${flag?.rollout_strategy}`);
        console.log(`  Context userId: ${flagContext.userId}`);
        console.log(`  Context environment: ${flagContext.environment}`);
        console.log(`  Has override: ${this.overrides.has(flagKey)}`);
        if (this.overrides.has(flagKey)) {
          const override = this.overrides.get(flagKey);
          console.log(`  Override value: ${override.value}`);
          console.log(`  Override reason: ${override.reason}`);
        }
        console.log(`  Has rolloutConfig: ${this.rolloutConfig.has(flagKey)}`);
        if (this.rolloutConfig.has(flagKey)) {
          const rolloutConfig = this.rolloutConfig.get(flagKey);
          console.log(`  Rollout percentage: ${rolloutConfig.percentage}`);
          console.log(`  Rollout timestamp: ${rolloutConfig.timestamp}`);
        }
      }

      // Update metrics
      flag.evaluationCount++;
      flag.lastEvaluation = Date.now();

      // Check for runtime overrides first
      if (this.overrides.has(flagKey)) {
        const override = this.overrides.get(flagKey);
        if (flagKey === 'ENABLE_CONNECTION_POOL') {
          console.log(`🚨 [DEBUG] Using override for ${flagKey}: ${override.value} (reason: ${override.reason})`);
        }
        this._recordFlagUsage(flagKey, override.value, 'override', flagContext);
        return override.value;
      }

      // Evaluate based on rollout strategy
      const result = this._evaluateFlag(flag, flagContext);

      if (flagKey === 'ENABLE_CONNECTION_POOL') {
        console.log(`🎯 [DEBUG] Final evaluation result for ${flagKey}: ${result}`);
      }

      this._recordFlagUsage(flagKey, result, 'evaluation', flagContext);

      return result;

    } catch (error) {
      logger.error(`Error evaluating feature flag ${flagKey}:`, error.message);

      // Return safe default
      const flag = this.flags.get(flagKey);
      return flag ? flag.defaultValue : false;
    }
  }

  /**
   * Get multiple feature flags at once
   */
  getFlags(flagKeys, context = null) {
    const results = {};
    const flagContext = context || new FeatureFlagContext();

    for (const flagKey of flagKeys) {
      results[flagKey] = this.isEnabled(flagKey, flagContext);
    }

    return results;
  }

  /**
   * Get all enabled feature flags for context
   */
  getAllEnabledFlags(context = null) {
    const enabled = {};
    const flagContext = context || new FeatureFlagContext();

    for (const flagKey of this.flags.keys()) {
      if (this.isEnabled(flagKey, flagContext)) {
        enabled[flagKey] = true;
      }
    }

    return enabled;
  }

  /**
   * Override a feature flag value at runtime
   */
  setOverride(flagKey, value, reason = 'manual', expiresAt = null) {
    if (!this.flags.has(flagKey)) {
      throw new Error(`Unknown feature flag: ${flagKey}`);
    }

    const override = {
      value,
      reason,
      timestamp: Date.now(),
      expiresAt
    };

    this.overrides.set(flagKey, override);

    this._notifyObservers('flag_overridden', {
      flagKey,
      value,
      reason,
      timestamp: override.timestamp
    });

    logger.log(`Feature flag ${flagKey} overridden:`, { value, reason });
  }

  /**
   * Remove feature flag override
   */
  removeOverride(flagKey) {
    const removed = this.overrides.delete(flagKey);

    if (removed) {
      this._notifyObservers('override_removed', {
        flagKey,
        timestamp: Date.now()
      });

      logger.log(`Feature flag override removed: ${flagKey}`);
    }

    return removed;
  }

  /**
   * Update rollout percentage for a flag
   */
  updateRolloutPercentage(flagKey, percentage) {
    if (!this.flags.has(flagKey)) {
      throw new Error(`Unknown feature flag: ${flagKey}`);
    }

    if (percentage < 0 || percentage > 100) {
      throw new Error('Rollout percentage must be between 0 and 100');
    }

    this.rolloutConfig.set(flagKey, { percentage, timestamp: Date.now() });

    this._notifyObservers('rollout_updated', {
      flagKey,
      percentage,
      timestamp: Date.now()
    });

    logger.log(`Rollout updated for ${flagKey}:`, { percentage });
  }

  /**
   * Emergency killswitch - disable all enterprise features
   */
  emergencyKillswitch(reason = 'emergency') {
    const enterpriseFlags = [
      'ENABLE_CONNECTION_POOL',
      'ENABLE_STATE_MACHINE',
      'ENABLE_CIRCUIT_BREAKER',
      'ENABLE_PERFORMANCE_OPTIMIZATION'
    ];

    for (const flagKey of enterpriseFlags) {
      this.setOverride(flagKey, false, reason);
    }

    // Enable legacy fallback
    this.setOverride('ENABLE_LEGACY_FALLBACK', true, reason);

    this._notifyObservers('emergency_killswitch', {
      reason,
      timestamp: Date.now(),
      disabledFlags: enterpriseFlags
    });

    logger.warn('Emergency killswitch activated:', { reason });
  }

  /**
   * Get feature flag statistics
   */
  getStatistics() {
    const stats = {
      totalFlags: this.flags.size,
      overrides: this.overrides.size,
      rolloutConfigs: this.rolloutConfig.size,
      environment: this.environment,
      flags: {}
    };

    for (const [key, flag] of this.flags.entries()) {
      stats.flags[key] = {
        evaluationCount: flag.evaluationCount,
        lastEvaluation: flag.lastEvaluation,
        currentValue: flag.currentValue,
        hasOverride: this.overrides.has(key),
        rolloutPercentage: this.rolloutConfig.get(key)?.percentage || null
      };
    }

    return stats;
  }

  /**
   * Export configuration for deployment
   */
  exportConfiguration() {
    return {
      flags: Object.fromEntries(
        Array.from(this.flags.entries()).map(([key, flag]) => [
          key,
          {
            ...flag,
            rolloutPercentage: this.rolloutConfig.get(key)?.percentage || null
          }
        ])
      ),
      overrides: Object.fromEntries(this.overrides),
      environment: this.environment,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Add observer for feature flag events
   */
  addObserver(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Observer must be a function');
    }
    this.observers.add(callback);
    return () => this.observers.delete(callback);
  }

  /**
   * Remove observer
   */
  removeObserver(callback) {
    return this.observers.delete(callback);
  }

  // Private methods

  _getDefaultValue(flagConfig) {
    // Check environment-specific default first
    if (flagConfig.environment_defaults && flagConfig.environment_defaults[this.environment] !== undefined) {
      return flagConfig.environment_defaults[this.environment];
    }
    return flagConfig.defaultValue;
  }

  _loadEnvironmentOverrides() {
    for (const flagKey of this.flags.keys()) {
      const envVar = `FEATURE_${flagKey}`;
      const envValue = process.env[envVar];

      if (envValue !== undefined) {
        const value = envValue.toLowerCase() === 'true';
        this.setOverride(flagKey, value, 'environment');
      }
    }
  }

  _loadRolloutConfiguration() {
    // Load rollout percentages from environment
    for (const flagKey of this.flags.keys()) {
      const envVar = `ROLLOUT_${flagKey}`;
      const envValue = process.env[envVar];

      if (envValue !== undefined) {
        const percentage = parseInt(envValue, 10);
        if (!isNaN(percentage) && percentage >= 0 && percentage <= 100) {
          this.rolloutConfig.set(flagKey, {
            percentage,
            timestamp: Date.now(),
            source: 'environment'
          });
        }
      }
    }
  }

  _evaluateFlag(flag, context) {
    const rolloutConfig = this.rolloutConfig.get(flag.key);

    // DEBUG: Additional logging for ENABLE_CONNECTION_POOL
    if (flag.key === 'ENABLE_CONNECTION_POOL') {
      console.log(`📊 [DEBUG] _evaluateFlag for ${flag.key}:`);
      console.log(`  Rollout strategy: ${flag.rollout_strategy}`);
      console.log(`  Has rolloutConfig: ${!!rolloutConfig}`);
      if (rolloutConfig) {
        console.log(`  Rollout percentage: ${rolloutConfig.percentage}`);
      }
      console.log(`  Flag currentValue: ${flag.currentValue}`);
    }

    switch (flag.rollout_strategy) {
      case 'percentage':
        if (rolloutConfig) {
          const percentageResult = context.isInPercentage(rolloutConfig.percentage);
          if (flag.key === 'ENABLE_CONNECTION_POOL') {
            console.log(`  📈 Percentage evaluation: context.isInPercentage(${rolloutConfig.percentage}) = ${percentageResult}`);
            console.log(`  📈 Context hash: ${context.generateHash('percentage')}`);
          }
          return percentageResult;
        }
        if (flag.key === 'ENABLE_CONNECTION_POOL') {
          console.log(`  📈 No rollout config, using currentValue: ${flag.currentValue}`);
        }
        return flag.currentValue;

      case 'user_percentage':
        if (rolloutConfig) {
          const percentageResult = context.isInPercentage(rolloutConfig.percentage);
          if (flag.key === 'ENABLE_CONNECTION_POOL') {
            console.log(`  👤 User percentage evaluation: context.isInPercentage(${rolloutConfig.percentage}) = ${percentageResult}`);
          }
          return percentageResult;
        }
        return flag.currentValue;

      case 'environment':
        if (flag.key === 'ENABLE_CONNECTION_POOL') {
          console.log(`  🌍 Environment evaluation, using currentValue: ${flag.currentValue}`);
        }
        return flag.currentValue;

      case 'manual':
        if (flag.key === 'ENABLE_CONNECTION_POOL') {
          console.log(`  👨‍💻 Manual evaluation, using currentValue: ${flag.currentValue}`);
        }
        return flag.currentValue;

      case 'killswitch':
        // Killswitch flags are inverted - they disable features when true
        const killswitchResult = !flag.currentValue;
        if (flag.key === 'ENABLE_CONNECTION_POOL') {
          console.log(`  🛑 Killswitch evaluation: !${flag.currentValue} = ${killswitchResult}`);
        }
        return killswitchResult;

      default:
        if (flag.key === 'ENABLE_CONNECTION_POOL') {
          console.log(`  ❓ Unknown strategy, using currentValue: ${flag.currentValue}`);
        }
        return flag.currentValue;
    }
  }

  _recordFlagUsage(flagKey, value, source, context) {
    const usage = {
      flagKey,
      value,
      source,
      context: {
        environment: context.environment,
        userId: context.userId,
        sessionId: context.sessionId,
        requestId: context.requestId
      },
      timestamp: Date.now()
    };

    // Update metrics
    if (!this.metrics.has(flagKey)) {
      this.metrics.set(flagKey, {
        enabled: 0,
        disabled: 0,
        lastUsed: null
      });
    }

    const metric = this.metrics.get(flagKey);
    if (value) {
      metric.enabled++;
    } else {
      metric.disabled++;
    }
    metric.lastUsed = usage.timestamp;

    // Notify observers
    this._notifyObservers('flag_evaluated', usage);
  }

  _notifyObservers(event, data) {
    for (const observer of this.observers) {
      try {
        observer(event, data);
      } catch (error) {
        logger.error('Feature flag observer error:', error.message);
      }
    }
  }

  /**
   * Clean up expired overrides
   */
  _cleanupExpiredOverrides() {
    const now = Date.now();

    for (const [flagKey, override] of this.overrides.entries()) {
      if (override.expiresAt && override.expiresAt < now) {
        this.removeOverride(flagKey);
        logger.debug(`Expired override removed for ${flagKey}`);
      }
    }
  }
}

/**
 * Singleton instance
 */
let featureFlagInstance = null;

/**
 * Get the global feature flag manager
 */
export function getFeatureFlagManager() {
  if (!featureFlagInstance) {
    featureFlagInstance = new FeatureFlagManager();
  }
  return featureFlagInstance;
}

/**
 * Convenience function to check if a feature is enabled
 */
export function isFeatureEnabled(flagKey, context = null) {
  return getFeatureFlagManager().isEnabled(flagKey, context);
}

/**
 * Convenience function to get multiple flags
 */
export function getFeatureFlags(flagKeys, context = null) {
  return getFeatureFlagManager().getFlags(flagKeys, context);
}

/**
 * Create a feature flag context
 */
export function createContext(options = {}) {
  return new FeatureFlagContext(options);
}

/**
 * Reset feature flag manager (for testing)
 */
export function resetFeatureFlags() {
  if (featureFlagInstance) {
    // Clear all state to prevent test pollution
    featureFlagInstance.flags.clear();
    featureFlagInstance.overrides.clear();
    featureFlagInstance.rolloutConfig.clear();
    featureFlagInstance.metrics.clear();
    featureFlagInstance.observers.clear();
    featureFlagInstance.initialized = false;
  }
  featureFlagInstance = null;
}

// Export feature flag definitions
export { FEATURE_FLAGS, ROLLOUT_STRATEGIES, FeatureFlagContext };
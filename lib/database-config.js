/**
 * Enterprise Database Configuration Management System
 *
 * Provides centralized configuration management for enterprise database features:
 * - Environment-specific configuration with runtime updates
 * - Configuration validation and error handling
 * - Migration between configuration versions
 * - Performance tuning parameters
 * - Feature flag integration
 */

import { logger } from './logger.js';
import { EnvironmentDetector } from './utils/environment-detector.js';

/**
 * Default configuration templates by environment
 */
const DEFAULT_CONFIGURATIONS = {
  development: {
    connectionPool: {
      maxConnections: 2,
      minConnections: 1,
      acquireTimeout: 10000,
      leaseTimeout: 30000,
      healthCheckInterval: 60000,
      connectionIdleTimeout: 300000,
      maxConnectionAge: 3600000,
      enableConnectionReuse: true,
      enableStaleConnectionCleanup: true
    },
    circuitBreaker: {
      enabled: true,
      failureThreshold: 3, // Lower for development
      recoveryTimeout: 20000, // Faster recovery
      halfOpenMaxAttempts: 2,
      monitoringPeriod: 30000,
      timeoutThreshold: 8000,
      degradedModeThreshold: 0.5
    },
    stateMachine: {
      enabled: true,
      maxHistorySize: 25,
      idleTimeout: 180000, // 3 minutes
      maxRetries: 2,
      enableStateLogging: true,
      enableTransitionValidation: true
    },
    monitoring: {
      enabled: true,
      metricsCollection: true,
      performanceTracking: true,
      healthChecks: true,
      alerting: false, // Minimal alerting in dev
      detailedLogging: true
    },
    performance: {
      enableQueryOptimization: true,
      enableConnectionOptimization: true,
      enableCaching: true,
      cacheTimeout: 300000,
      enableMetrics: true
    }
  },

  preview: {
    connectionPool: {
      maxConnections: 3,
      minConnections: 1,
      acquireTimeout: 8000,
      leaseTimeout: 25000,
      healthCheckInterval: 45000,
      connectionIdleTimeout: 240000,
      maxConnectionAge: 2700000,
      enableConnectionReuse: true,
      enableStaleConnectionCleanup: true
    },
    circuitBreaker: {
      enabled: true,
      failureThreshold: 4,
      recoveryTimeout: 25000,
      halfOpenMaxAttempts: 2,
      monitoringPeriod: 45000,
      timeoutThreshold: 6000,
      degradedModeThreshold: 0.6
    },
    stateMachine: {
      enabled: true,
      maxHistorySize: 30,
      idleTimeout: 240000, // 4 minutes
      maxRetries: 2,
      enableStateLogging: true,
      enableTransitionValidation: true
    },
    monitoring: {
      enabled: true,
      metricsCollection: true,
      performanceTracking: true,
      healthChecks: true,
      alerting: true,
      detailedLogging: false // Reduced logging for preview
    },
    performance: {
      enableQueryOptimization: true,
      enableConnectionOptimization: true,
      enableCaching: true,
      cacheTimeout: 240000,
      enableMetrics: true
    }
  },

  production: {
    connectionPool: {
      maxConnections: 5,
      minConnections: 2,
      acquireTimeout: 5000,
      leaseTimeout: 30000,
      healthCheckInterval: 30000,
      connectionIdleTimeout: 300000,
      maxConnectionAge: 3600000,
      enableConnectionReuse: true,
      enableStaleConnectionCleanup: true
    },
    circuitBreaker: {
      enabled: true,
      failureThreshold: 5,
      recoveryTimeout: 30000,
      halfOpenMaxAttempts: 3,
      monitoringPeriod: 60000,
      timeoutThreshold: 5000,
      degradedModeThreshold: 0.7
    },
    stateMachine: {
      enabled: true,
      maxHistorySize: 50,
      idleTimeout: 300000, // 5 minutes
      maxRetries: 3,
      enableStateLogging: false, // Reduced logging for performance
      enableTransitionValidation: true
    },
    monitoring: {
      enabled: true,
      metricsCollection: true,
      performanceTracking: true,
      healthChecks: true,
      alerting: true,
      detailedLogging: false // Performance optimized
    },
    performance: {
      enableQueryOptimization: true,
      enableConnectionOptimization: true,
      enableCaching: true,
      cacheTimeout: 600000, // 10 minutes
      enableMetrics: true
    }
  },

  test: {
    connectionPool: {
      maxConnections: 1,
      minConnections: 1,
      acquireTimeout: 15000,
      leaseTimeout: 20000,
      healthCheckInterval: 0, // Disabled for tests
      connectionIdleTimeout: 60000,
      maxConnectionAge: 180000,
      enableConnectionReuse: false, // Clean state for tests
      enableStaleConnectionCleanup: false
    },
    circuitBreaker: {
      enabled: false, // Disabled for deterministic tests
      failureThreshold: 10,
      recoveryTimeout: 5000,
      halfOpenMaxAttempts: 1,
      monitoringPeriod: 10000,
      timeoutThreshold: 15000,
      degradedModeThreshold: 0.9
    },
    stateMachine: {
      enabled: false, // Simplified for tests
      maxHistorySize: 10,
      idleTimeout: 30000,
      maxRetries: 1,
      enableStateLogging: false,
      enableTransitionValidation: false
    },
    monitoring: {
      enabled: false, // Minimal overhead for tests
      metricsCollection: false,
      performanceTracking: false,
      healthChecks: false,
      alerting: false,
      detailedLogging: false
    },
    performance: {
      enableQueryOptimization: false,
      enableConnectionOptimization: false,
      enableCaching: false,
      cacheTimeout: 60000,
      enableMetrics: false
    }
  }
};

/**
 * Configuration schema for validation
 */
const CONFIG_SCHEMA = {
  connectionPool: {
    required: ['maxConnections', 'minConnections', 'acquireTimeout', 'leaseTimeout'],
    types: {
      maxConnections: 'number',
      minConnections: 'number',
      acquireTimeout: 'number',
      leaseTimeout: 'number',
      healthCheckInterval: 'number',
      connectionIdleTimeout: 'number',
      maxConnectionAge: 'number',
      enableConnectionReuse: 'boolean',
      enableStaleConnectionCleanup: 'boolean'
    },
    constraints: {
      maxConnections: { min: 1, max: 20 },
      minConnections: { min: 0, max: 10 },
      acquireTimeout: { min: 1000, max: 60000 },
      leaseTimeout: { min: 5000, max: 300000 },
      healthCheckInterval: { min: 0, max: 300000 },
      connectionIdleTimeout: { min: 30000, max: 3600000 },
      maxConnectionAge: { min: 60000, max: 86400000 }
    }
  },
  circuitBreaker: {
    required: ['enabled', 'failureThreshold', 'recoveryTimeout'],
    types: {
      enabled: 'boolean',
      failureThreshold: 'number',
      recoveryTimeout: 'number',
      halfOpenMaxAttempts: 'number',
      monitoringPeriod: 'number',
      timeoutThreshold: 'number',
      degradedModeThreshold: 'number'
    },
    constraints: {
      failureThreshold: { min: 1, max: 50 },
      recoveryTimeout: { min: 5000, max: 300000 },
      halfOpenMaxAttempts: { min: 1, max: 10 },
      monitoringPeriod: { min: 10000, max: 600000 },
      timeoutThreshold: { min: 1000, max: 60000 },
      degradedModeThreshold: { min: 0.1, max: 1.0 }
    }
  },
  stateMachine: {
    required: ['enabled'],
    types: {
      enabled: 'boolean',
      maxHistorySize: 'number',
      idleTimeout: 'number',
      maxRetries: 'number',
      enableStateLogging: 'boolean',
      enableTransitionValidation: 'boolean'
    },
    constraints: {
      maxHistorySize: { min: 5, max: 200 },
      idleTimeout: { min: 30000, max: 1800000 },
      maxRetries: { min: 0, max: 10 }
    }
  },
  monitoring: {
    required: ['enabled'],
    types: {
      enabled: 'boolean',
      metricsCollection: 'boolean',
      performanceTracking: 'boolean',
      healthChecks: 'boolean',
      alerting: 'boolean',
      detailedLogging: 'boolean'
    },
    constraints: {}
  },
  performance: {
    required: ['enableQueryOptimization', 'enableConnectionOptimization', 'enableCaching', 'enableMetrics'],
    types: {
      enableQueryOptimization: 'boolean',
      enableConnectionOptimization: 'boolean',
      enableCaching: 'boolean',
      cacheTimeout: 'number',
      enableMetrics: 'boolean'
    },
    constraints: {
      cacheTimeout: { min: 60000, max: 3600000 }
    }
  }
};

/**
 * Configuration validation errors
 */
export class ConfigurationError extends Error {
  constructor(message, path = null, value = null) {
    super(message);
    this.name = 'ConfigurationError';
    this.path = path;
    this.value = value;
    this.code = 'CONFIG_VALIDATION_ERROR';
  }
}

/**
 * Enterprise Database Configuration Manager
 */
export class DatabaseConfiguration {
  constructor() {
    this.currentConfig = null;
    this.configVersion = '1.0.0';
    this.lastUpdate = null;
    this.validationErrors = [];
    this.environment = null;
    this.observers = new Set();
    this.runtimeOverrides = new Map();
    this.configHistory = [];
    this.maxHistorySize = 10;

    // Initialize with environment detection
    this._detectEnvironment();
    this._loadConfiguration();
  }

  /**
   * Get current configuration for a specific component
   */
  getConfig(component = null) {
    if (!this.currentConfig) {
      this._loadConfiguration();
    }

    if (component) {
      return this.currentConfig[component] || {};
    }

    return { ...this.currentConfig };
  }

  /**
   * Get connection pool configuration
   */
  getConnectionPoolConfig() {
    const baseConfig = this.getConfig('connectionPool');
    const overrides = this._getOverridesForComponent('connectionPool');
    return { ...baseConfig, ...overrides };
  }

  /**
   * Get circuit breaker configuration
   */
  getCircuitBreakerConfig() {
    const baseConfig = this.getConfig('circuitBreaker');
    const overrides = this._getOverridesForComponent('circuitBreaker');
    return { ...baseConfig, ...overrides };
  }

  /**
   * Get state machine configuration
   */
  getStateMachineConfig() {
    const baseConfig = this.getConfig('stateMachine');
    const overrides = this._getOverridesForComponent('stateMachine');
    return { ...baseConfig, ...overrides };
  }

  /**
   * Get monitoring configuration
   */
  getMonitoringConfig() {
    const baseConfig = this.getConfig('monitoring');
    const overrides = this._getOverridesForComponent('monitoring');
    return { ...baseConfig, ...overrides };
  }

  /**
   * Get performance configuration
   */
  getPerformanceConfig() {
    const baseConfig = this.getConfig('performance');
    const overrides = this._getOverridesForComponent('performance');
    return { ...baseConfig, ...overrides };
  }

  /**
   * Update configuration at runtime
   */
  async updateConfig(component, updates, source = 'runtime') {
    try {
      const currentComponentConfig = this.getConfig(component);
      const newConfig = { ...currentComponentConfig, ...updates };

      // Clear validation errors before validating
      this.validationErrors = [];

      // Validate the new configuration
      await this._validateComponentConfig(component, newConfig);

      // Check if validation found errors
      if (this.validationErrors.length > 0) {
        throw new ConfigurationError(
          `Configuration validation failed: ${this.validationErrors.length} errors found`,
          null,
          this.validationErrors
        );
      }

      // Store the override
      this.runtimeOverrides.set(component, updates);

      // Track the change
      this._recordConfigChange(component, updates, source);

      // Notify observers
      this._notifyObservers('config_updated', {
        component,
        updates,
        source,
        timestamp: new Date().toISOString()
      });

      logger.log(`Configuration updated for ${component}:`, updates);
      return true;

    } catch (error) {
      logger.error(`Failed to update configuration for ${component}:`, error.message);
      throw error;
    }
  }

  /**
   * Reload configuration from environment
   */
  async reloadConfiguration() {
    try {
      this._detectEnvironment();
      const oldConfig = this.currentConfig;
      this._loadConfiguration();

      // Clear runtime overrides on reload
      this.runtimeOverrides.clear();

      this._notifyObservers('config_reloaded', {
        oldConfig,
        newConfig: this.currentConfig,
        timestamp: new Date().toISOString()
      });

      logger.log('Configuration reloaded for environment:', this.environment);
      return true;

    } catch (error) {
      logger.error('Failed to reload configuration:', error.message);
      throw error;
    }
  }

  /**
   * Validate entire configuration
   */
  async validateConfiguration(config = null) {
    const configToValidate = config || this.currentConfig;
    this.validationErrors = [];

    try {
      for (const [component, componentConfig] of Object.entries(configToValidate)) {
        await this._validateComponentConfig(component, componentConfig);
      }

      if (this.validationErrors.length > 0) {
        throw new ConfigurationError(
          `Configuration validation failed: ${this.validationErrors.length} errors found`,
          null,
          this.validationErrors
        );
      }

      return true;

    } catch (error) {
      logger.error('Configuration validation failed:', error.message);
      throw error;
    }
  }

  /**
   * Get configuration for specific environment
   */
  getEnvironmentConfig(environment) {
    const config = DEFAULT_CONFIGURATIONS[environment];
    if (!config) {
      throw new ConfigurationError(`Unknown environment: ${environment}`);
    }
    return JSON.parse(JSON.stringify(config)); // Deep clone
  }

  /**
   * Export configuration for deployment
   */
  exportConfiguration(format = 'json') {
    const config = {
      version: this.configVersion,
      environment: this.environment,
      timestamp: new Date().toISOString(),
      configuration: this.getConfig(),
      overrides: Object.fromEntries(this.runtimeOverrides),
      metadata: {
        lastUpdate: this.lastUpdate,
        validationErrors: this.validationErrors.length
      }
    };

    switch (format) {
      case 'yaml':
        // Would need yaml library for full implementation
        return JSON.stringify(config, null, 2); // Fallback to JSON
      case 'env':
        return this._formatAsEnvironmentVariables(config);
      default:
        return config;
    }
  }

  /**
   * Import configuration from external source
   */
  async importConfiguration(configData, validate = true) {
    try {
      let config;

      if (typeof configData === 'string') {
        config = JSON.parse(configData);
      } else {
        config = configData;
      }

      if (validate) {
        await this.validateConfiguration(config.configuration || config);
      }

      // Backup current configuration
      this._recordConfigChange('system', this.currentConfig, 'backup');

      // Clear runtime overrides when importing new configuration
      this.runtimeOverrides.clear();

      // Apply new configuration
      this.currentConfig = config.configuration || config;
      this.configVersion = config.version || this.configVersion;
      this.lastUpdate = new Date().toISOString();

      this._notifyObservers('config_imported', {
        source: 'import',
        version: this.configVersion,
        timestamp: this.lastUpdate
      });

      logger.log('Configuration imported successfully:', {
        version: this.configVersion,
        environment: this.environment
      });

      return true;

    } catch (error) {
      logger.error('Failed to import configuration:', error.message);
      throw error;
    }
  }

  /**
   * Get configuration statistics
   */
  getConfigurationStats() {
    return {
      version: this.configVersion,
      environment: this.environment,
      lastUpdate: this.lastUpdate,
      validationErrors: this.validationErrors.length,
      runtimeOverrides: this.runtimeOverrides.size,
      configHistory: this.configHistory.length,
      observers: this.observers.size,
      components: Object.keys(this.currentConfig || {}),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Add configuration observer
   */
  addObserver(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Observer must be a function');
    }
    this.observers.add(callback);
    return () => this.observers.delete(callback);
  }

  /**
   * Remove configuration observer
   */
  removeObserver(callback) {
    return this.observers.delete(callback);
  }

  // Private methods

  _detectEnvironment() {
    this.environment = EnvironmentDetector.detectEnvironment();
    logger.debug('Environment detected:', this.environment);
  }

  _loadConfiguration() {
    try {
      const defaultConfig = DEFAULT_CONFIGURATIONS[this.environment];
      if (!defaultConfig) {
        throw new ConfigurationError(`No configuration found for environment: ${this.environment}`);
      }

      // Deep clone to prevent modification of defaults
      this.currentConfig = JSON.parse(JSON.stringify(defaultConfig));
      this.lastUpdate = new Date().toISOString();

      // Apply environment variable overrides
      this._applyEnvironmentOverrides();

      logger.debug('Configuration loaded for environment:', this.environment);

    } catch (error) {
      logger.error('Failed to load configuration:', error.message);
      throw error;
    }
  }

  _applyEnvironmentOverrides() {
    // Connection Pool overrides
    if (process.env.DB_MAX_CONNECTIONS) {
      this.currentConfig.connectionPool.maxConnections = parseInt(process.env.DB_MAX_CONNECTIONS, 10);
    }
    if (process.env.DB_ACQUIRE_TIMEOUT) {
      this.currentConfig.connectionPool.acquireTimeout = parseInt(process.env.DB_ACQUIRE_TIMEOUT, 10);
    }

    // Circuit Breaker overrides
    if (process.env.CB_FAILURE_THRESHOLD) {
      this.currentConfig.circuitBreaker.failureThreshold = parseInt(process.env.CB_FAILURE_THRESHOLD, 10);
    }
    if (process.env.CB_RECOVERY_TIMEOUT) {
      this.currentConfig.circuitBreaker.recoveryTimeout = parseInt(process.env.CB_RECOVERY_TIMEOUT, 10);
    }

    // Feature flags
    if (process.env.DISABLE_CIRCUIT_BREAKER === 'true') {
      this.currentConfig.circuitBreaker.enabled = false;
    }
    if (process.env.DISABLE_STATE_MACHINE === 'true') {
      this.currentConfig.stateMachine.enabled = false;
    }
    if (process.env.DISABLE_MONITORING === 'true') {
      this.currentConfig.monitoring.enabled = false;
    }
  }

  async _validateComponentConfig(component, config) {
    const schema = CONFIG_SCHEMA[component];
    if (!schema) {
      this.validationErrors.push({
        component,
        error: `Unknown component: ${component}`,
        path: component
      });
      return;
    }

    // Check required fields
    for (const required of schema.required) {
      if (!(required in config)) {
        this.validationErrors.push({
          component,
          error: `Missing required field: ${required}`,
          path: `${component}.${required}`
        });
      }
    }

    // Check types and constraints
    for (const [field, value] of Object.entries(config)) {
      const expectedType = schema.types[field];
      if (expectedType && typeof value !== expectedType) {
        this.validationErrors.push({
          component,
          error: `Invalid type for ${field}: expected ${expectedType}, got ${typeof value}`,
          path: `${component}.${field}`,
          value
        });
        continue;
      }

      const constraints = schema.constraints && schema.constraints[field];
      if (constraints && typeof value === 'number') {
        if ((constraints.min !== undefined && value < constraints.min) ||
            (constraints.max !== undefined && value > constraints.max)) {
          this.validationErrors.push({
            component,
            error: `Value for ${field} must be between ${constraints.min || 'any'} and ${constraints.max || 'any'}`,
            path: `${component}.${field}`,
            value
          });
        }
      }
    }

    // Component-specific validation
    if (component === 'connectionPool') {
      if (config.minConnections > config.maxConnections) {
        this.validationErrors.push({
          component,
          error: 'minConnections cannot be greater than maxConnections',
          path: `${component}.minConnections`,
          value: config.minConnections
        });
      }
    }
  }

  _getOverridesForComponent(component) {
    return this.runtimeOverrides.get(component) || {};
  }

  _recordConfigChange(component, changes, source) {
    const record = {
      component,
      changes,
      source,
      timestamp: new Date().toISOString()
    };

    this.configHistory.push(record);

    // Maintain history size limit
    if (this.configHistory.length > this.maxHistorySize) {
      this.configHistory.shift();
    }
  }

  _notifyObservers(event, data) {
    for (const observer of this.observers) {
      try {
        observer(event, data);
      } catch (error) {
        logger.error('Configuration observer error:', error.message);
      }
    }
  }

  _formatAsEnvironmentVariables(config) {
    const envVars = [];

    const flatten = (obj, prefix = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const envKey = prefix ? `${prefix}_${key.toUpperCase()}` : key.toUpperCase();

        if (typeof value === 'object' && value !== null) {
          flatten(value, envKey);
        } else {
          envVars.push(`${envKey}=${value}`);
        }
      }
    };

    flatten(config.configuration);
    return envVars.join('\n');
  }
}

/**
 * Singleton instance
 */
let configurationInstance = null;

/**
 * Get the global configuration instance
 */
export function getDatabaseConfiguration() {
  if (!configurationInstance) {
    configurationInstance = new DatabaseConfiguration();
  }
  return configurationInstance;
}

/**
 * Convenience function to get specific component configuration
 */
export function getComponentConfig(component) {
  return getDatabaseConfiguration().getConfig(component);
}

/**
 * Convenience function to get all configuration
 */
export function getAllConfig() {
  return getDatabaseConfiguration().getConfig();
}

/**
 * Reset configuration instance (for testing)
 */
export function resetConfiguration() {
  configurationInstance = null;
}

// Export configuration templates for external use
export { DEFAULT_CONFIGURATIONS, CONFIG_SCHEMA };
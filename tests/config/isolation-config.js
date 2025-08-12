/**
 * Isolation Configuration System - Smart Pattern Detection
 * 
 * Central configuration for automatic test isolation levels and pattern detection.
 * This system allows teams to customize isolation behavior without modifying individual tests.
 * 
 * Features:
 * - Configurable isolation levels by test pattern
 * - Performance optimization settings
 * - Debug configuration options
 * - Team-specific customization support
 * - Automatic pattern matching with priority system
 * 
 * @author Test Engineer Agent
 * @version 2.0.0
 */

/**
 * Isolation Levels
 * - none: No isolation (dangerous, for very specific cases)
 * - minimal: Basic Vitest mock clearing only
 * - basic: Standard mock clearing + module reset
 * - singleton: Mock + singleton state clearing
 * - environment: Environment + mock isolation
 * - complete: Full isolation (all components)
 */

/**
 * Main isolation configuration
 */
export const isolationConfig = {
  // Default isolation level for tests that don't match any pattern
  default: 'basic',
  
  // Strict mode throws errors on isolation violations
  strictMode: process.env.TEST_STRICT_MODE === 'true',
  
  // Enable debug logging
  debug: process.env.TEST_DEBUG === 'true',
  
  // Performance settings
  performance: {
    // Warn if isolation takes longer than this (ms)
    slowOperationThreshold: 50,
    
    // Enable performance tracking
    trackPerformance: true,
    
    // Skip isolation for performance tests
    skipPerformanceTests: true
  },
  
  // Validation settings
  validation: {
    // Validate isolation after each test
    validateIsolation: true,
    
    // Fail tests on isolation violations in strict mode
    failOnViolations: process.env.TEST_STRICT_MODE === 'true',
    
    // Log warnings for violations
    logViolations: true
  }
};

/**
 * Test Pattern Mappings
 * Maps test patterns to isolation levels with priority system
 * Higher priority numbers override lower priority patterns
 */
export const testPatterns = [
  // High priority patterns (specific problematic tests)
  {
    pattern: /database-environment\.test\.js$/,
    level: 'complete',
    priority: 100,
    reason: 'Known problematic test requiring complete isolation'
  },
  {
    pattern: /database-singleton\.test\.js$/,
    level: 'complete',
    priority: 100,
    reason: 'Database singleton isolation test'
  },
  {
    pattern: /brevo-email.*\.test\.js$/,
    level: 'complete',
    priority: 90,
    reason: 'Brevo email service tests need complete mock isolation'
  },
  {
    pattern: /email-webhook\.test\.js$/,
    level: 'complete',
    priority: 90,
    reason: 'Email webhook tests need complete isolation'
  },
  
  // Medium priority patterns (category-based)
  {
    pattern: /\/database.*\.test\.js$/,
    level: 'complete',
    priority: 80,
    reason: 'All database tests need complete isolation'
  },
  {
    pattern: /\/integration\/.*\.test\.js$/,
    level: 'environment',
    priority: 70,
    reason: 'Integration tests need environment isolation'
  },
  {
    pattern: /\/e2e\/.*\.test\.js$/,
    level: 'environment',
    priority: 70,
    reason: 'E2E tests need environment isolation'
  },
  {
    pattern: /brevo|stripe|email/,
    level: 'singleton',
    priority: 60,
    reason: 'Service integration tests need singleton isolation'
  },
  
  // Low priority patterns (general categories)
  {
    pattern: /\/unit\/.*\.test\.js$/,
    level: 'basic',
    priority: 30,
    reason: 'Unit tests use basic isolation by default'
  },
  {
    pattern: /\/security\/.*\.test\.js$/,
    level: 'basic',
    priority: 30,
    reason: 'Security tests use basic isolation'
  },
  {
    pattern: /\/performance\/.*\.test\.js$/,
    level: 'minimal',
    priority: 20,
    reason: 'Performance tests need minimal isolation to avoid overhead'
  },
  
  // Special cases
  {
    pattern: /mock.*\.test\.js$/,
    level: 'singleton',
    priority: 40,
    reason: 'Mock-specific tests need singleton isolation'
  },
  {
    pattern: /environment.*\.test\.js$/,
    level: 'environment',
    priority: 50,
    reason: 'Environment tests need environment isolation'
  }
];

/**
 * Custom team overrides
 * Teams can add their own patterns here without modifying the main configuration
 */
export const customPatterns = [
  // Add custom patterns here
  // Example:
  // {
  //   pattern: /my-special-test\.test\.js$/,
  //   level: 'complete',
  //   priority: 95,
  //   reason: 'Custom team requirement'
  // }
];

/**
 * Environment-specific configurations
 */
export const environmentConfig = {
  ci: {
    // More aggressive isolation in CI
    default: 'basic',
    strictMode: true,
    performance: {
      slowOperationThreshold: 100, // Higher threshold in CI
      trackPerformance: true
    }
  },
  
  development: {
    // More relaxed in development
    default: 'basic',
    strictMode: false,
    performance: {
      slowOperationThreshold: 30, // Lower threshold in dev
      trackPerformance: true
    }
  },
  
  debug: {
    // Enhanced debugging
    default: 'complete',
    strictMode: true,
    debug: true,
    performance: {
      trackPerformance: true,
      slowOperationThreshold: 10
    }
  }
};

/**
 * Get test isolation level for a given test context
 * Uses pattern matching with priority system
 * 
 * @param {string} testFilePath - Path to the test file
 * @param {string} testName - Name of the test
 * @param {Object} options - Additional options
 * @returns {string} Isolation level
 */
export function getTestIsolationLevel(testFilePath, testName = '', options = {}) {
  // Normalize file path for consistent matching
  const normalizedPath = testFilePath.replace(/\\/g, '/');
  
  // Combine main patterns and custom patterns
  const allPatterns = [...testPatterns, ...customPatterns];
  
  // Find matching patterns and sort by priority
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
  
  // Return highest priority match or default
  if (matches.length > 0) {
    const match = matches[0];
    
    if (options.debug || isolationConfig.debug) {
      console.log(
        `[IsolationConfig] ${normalizedPath} -> ${match.level} (${match.reason})`
      );
    }
    
    return match.level;
  }
  
  // Apply environment-specific default if available
  const env = process.env.NODE_ENV || 'development';
  const envConfig = environmentConfig[env];
  const defaultLevel = envConfig?.default || isolationConfig.default;
  
  if (options.debug || isolationConfig.debug) {
    console.log(
      `[IsolationConfig] ${normalizedPath} -> ${defaultLevel} (default for ${env})`
    );
  }
  
  return defaultLevel;
}

/**
 * Add a custom isolation pattern
 * Allows runtime addition of isolation patterns
 * 
 * @param {Object} patternConfig - Pattern configuration
 */
export function addCustomPattern(patternConfig) {
  const { pattern, level, priority = 50, reason = 'Custom pattern' } = patternConfig;
  
  if (!pattern || !level) {
    throw new Error('Pattern and level are required for custom isolation patterns');
  }
  
  customPatterns.push({
    pattern,
    level,
    priority,
    reason
  });
}

/**
 * Get effective configuration for current environment
 * Merges base config with environment-specific overrides
 * 
 * @returns {Object} Effective configuration
 */
export function getEffectiveConfig() {
  const env = process.env.NODE_ENV || 'development';
  const isCI = process.env.CI === 'true';
  const isDebug = process.env.TEST_DEBUG === 'true';
  
  let envConfig = {};
  
  if (isCI) {
    envConfig = environmentConfig.ci;
  } else if (isDebug) {
    envConfig = environmentConfig.debug;
  } else {
    envConfig = environmentConfig[env] || environmentConfig.development;
  }
  
  // Merge configurations with environment overrides taking precedence
  return {
    ...isolationConfig,
    ...envConfig,
    performance: {
      ...isolationConfig.performance,
      ...(envConfig.performance || {})
    },
    validation: {
      ...isolationConfig.validation,
      ...(envConfig.validation || {})
    },
    environment: {
      name: env,
      isCI,
      isDebug
    }
  };
}

/**
 * Validate isolation configuration
 * Checks for configuration errors and inconsistencies
 * 
 * @returns {Array} Array of validation errors
 */
export function validateConfig() {
  const errors = [];
  
  // Check for valid isolation levels
  const validLevels = ['none', 'minimal', 'basic', 'singleton', 'environment', 'complete'];
  
  const allPatterns = [...testPatterns, ...customPatterns];
  
  allPatterns.forEach(({ pattern, level, priority }, index) => {
    // Check level validity
    if (!validLevels.includes(level)) {
      errors.push(`Invalid isolation level '${level}' in pattern ${index}`);
    }
    
    // Check pattern validity
    if (!pattern) {
      errors.push(`Missing pattern in configuration ${index}`);
    }
    
    // Check priority is a number
    if (typeof priority !== 'number') {
      errors.push(`Invalid priority '${priority}' in pattern ${index} - must be a number`);
    }
  });
  
  // Check default level
  if (!validLevels.includes(isolationConfig.default)) {
    errors.push(`Invalid default isolation level '${isolationConfig.default}'`);
  }
  
  return errors;
}

/**
 * Get pattern matching statistics
 * Useful for debugging and optimization
 * 
 * @param {Array} testFiles - List of test files to analyze
 * @returns {Object} Pattern matching statistics
 */
export function getPatternStats(testFiles = []) {
  const stats = {
    totalFiles: testFiles.length,
    levelDistribution: {},
    patternMatches: {},
    unmatchedFiles: [],
    duplicateMatches: []
  };
  
  const validLevels = ['none', 'minimal', 'basic', 'singleton', 'environment', 'complete'];
  
  // Initialize level distribution
  validLevels.forEach(level => {
    stats.levelDistribution[level] = 0;
  });
  
  testFiles.forEach(filePath => {
    const level = getTestIsolationLevel(filePath);
    
    // Update distribution
    stats.levelDistribution[level] = (stats.levelDistribution[level] || 0) + 1;
    
    // Find all matching patterns (to detect duplicates)
    const allPatterns = [...testPatterns, ...customPatterns];
    const matches = allPatterns.filter(({ pattern }) => {
      if (pattern instanceof RegExp) {
        return pattern.test(filePath);
      } else if (typeof pattern === 'string') {
        return filePath.includes(pattern);
      }
      return false;
    });
    
    if (matches.length === 0) {
      stats.unmatchedFiles.push(filePath);
    } else if (matches.length > 1) {
      stats.duplicateMatches.push({
        file: filePath,
        matches: matches.map(m => ({ level: m.level, priority: m.priority, reason: m.reason }))
      });
    }
    
    // Track pattern usage
    matches.forEach(match => {
      const patternKey = match.pattern.toString();
      stats.patternMatches[patternKey] = (stats.patternMatches[patternKey] || 0) + 1;
    });
  });
  
  return stats;
}

/**
 * Generate isolation configuration report
 * Provides comprehensive overview of isolation configuration
 * 
 * @param {Array} testFiles - Optional list of test files for analysis
 * @returns {Object} Configuration report
 */
export function generateConfigReport(testFiles = []) {
  const effectiveConfig = getEffectiveConfig();
  const validationErrors = validateConfig();
  const patternStats = testFiles.length > 0 ? getPatternStats(testFiles) : null;
  
  return {
    timestamp: new Date().toISOString(),
    environment: effectiveConfig.environment,
    configuration: {
      default: effectiveConfig.default,
      strictMode: effectiveConfig.strictMode,
      debug: effectiveConfig.debug,
      performance: effectiveConfig.performance,
      validation: effectiveConfig.validation
    },
    patterns: {
      total: testPatterns.length + customPatterns.length,
      main: testPatterns.length,
      custom: customPatterns.length,
      levels: [...new Set([...testPatterns, ...customPatterns].map(p => p.level))].sort()
    },
    validation: {
      isValid: validationErrors.length === 0,
      errors: validationErrors
    },
    statistics: patternStats,
    recommendations: generateRecommendations(effectiveConfig, validationErrors, patternStats)
  };
}

/**
 * Generate configuration recommendations
 * @private
 */
function generateRecommendations(config, errors, stats) {
  const recommendations = [];
  
  if (errors.length > 0) {
    recommendations.push('Fix configuration validation errors');
  }
  
  if (stats && stats.unmatchedFiles.length > 0) {
    recommendations.push(`${stats.unmatchedFiles.length} test files use default isolation - consider adding specific patterns`);
  }
  
  if (stats && stats.duplicateMatches.length > 0) {
    recommendations.push(`${stats.duplicateMatches.length} test files match multiple patterns - review pattern priorities`);
  }
  
  if (config.performance.trackPerformance && !config.debug) {
    recommendations.push('Enable debug mode to see detailed isolation timing information');
  }
  
  if (!config.strictMode && config.environment.isCI) {
    recommendations.push('Consider enabling strict mode in CI environment for better quality gates');
  }
  
  return recommendations;
}

/**
 * Export configuration presets for easy customization
 */
export const isolationPresets = {
  // Conservative preset - maximum isolation
  conservative: {
    default: 'complete',
    strictMode: true,
    validation: { validateIsolation: true, failOnViolations: true }
  },
  
  // Balanced preset - good isolation with performance
  balanced: {
    default: 'basic',
    strictMode: false,
    validation: { validateIsolation: true, failOnViolations: false }
  },
  
  // Performance preset - minimal isolation for speed
  performance: {
    default: 'minimal',
    strictMode: false,
    validation: { validateIsolation: false, failOnViolations: false }
  },
  
  // Debug preset - maximum debugging information
  debug: {
    default: 'complete',
    strictMode: true,
    debug: true,
    validation: { validateIsolation: true, failOnViolations: true },
    performance: { trackPerformance: true, slowOperationThreshold: 10 }
  }
};

/**
 * Apply a configuration preset
 * 
 * @param {string} presetName - Name of the preset to apply
 */
export function applyPreset(presetName) {
  const preset = isolationPresets[presetName];
  
  if (!preset) {
    throw new Error(`Unknown isolation preset: ${presetName}`);
  }
  
  // Merge preset into current configuration
  Object.assign(isolationConfig, preset);
}

// Export for backward compatibility and ease of use
export default {
  isolationConfig,
  testPatterns,
  customPatterns,
  environmentConfig,
  getTestIsolationLevel,
  addCustomPattern,
  getEffectiveConfig,
  validateConfig,
  getPatternStats,
  generateConfigReport,
  isolationPresets,
  applyPreset
};
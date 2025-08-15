/**
 * Centralized CI Detection Utility
 * Provides consistent CI environment detection across all test files
 *
 * This utility standardizes CI detection logic and ensures consistent behavior
 * across unit tests, integration tests, and performance tests.
 */

/**
 * Detects if running in CI environment
 * @returns {boolean} True if running in CI
 */
export function isCI() {
  return process.env.CI === "true";
}

/**
 * Detects if running in GitHub Actions specifically
 * @returns {boolean} True if running in GitHub Actions
 */
export function isGitHubActions() {
  return process.env.GITHUB_ACTIONS === "true";
}

/**
 * Detects if running in any automated testing environment
 * @returns {boolean} True if in CI or automated testing
 */
export function isAutomatedEnvironment() {
  return isCI() || isGitHubActions() || process.env.NODE_ENV === "ci";
}

/**
 * Gets CI-appropriate timeout multiplier
 * CI environments typically need longer timeouts due to resource constraints
 * @param {number} baseMultiplier - Base multiplier (default: 2)
 * @returns {number} Timeout multiplier for CI
 */
export function getCITimeoutMultiplier(baseMultiplier = 2) {
  return isCI() ? baseMultiplier : 1;
}

/**
 * Gets CI-appropriate iteration count
 * Reduces iterations in CI to prevent timeouts and resource exhaustion
 * @param {number} localCount - Count for local development
 * @param {number} ciReduction - Reduction factor for CI (default: 0.5)
 * @returns {number} Iteration count appropriate for environment
 */
export function getCIIterationCount(localCount, ciReduction = 0.5) {
  return isCI()
    ? Math.max(1, Math.floor(localCount * ciReduction))
    : localCount;
}

/**
 * Gets CI-appropriate concurrency level
 * Reduces concurrency in CI to prevent resource exhaustion
 * @param {number} localConcurrency - Concurrency for local development
 * @param {number} ciReduction - Reduction factor for CI (default: 0.5)
 * @returns {number} Concurrency level appropriate for environment
 */
export function getCIConcurrency(localConcurrency, ciReduction = 0.5) {
  return isCI()
    ? Math.max(1, Math.floor(localConcurrency * ciReduction))
    : localConcurrency;
}

/**
 * Gets memory-appropriate configuration for tests
 * @returns {object} Memory configuration object
 */
export function getMemoryConfig() {
  return {
    isCI: isCI(),
    maxOldSpaceSize: isCI() ? "1024" : "2048",
    maxConcurrency: isCI() ? 2 : 4,
    poolOptions: {
      threads: isCI() ? 2 : 4,
      maxThreads: isCI() ? 2 : undefined,
    },
  };
}

/**
 * Gets environment-specific test configuration
 * @returns {object} Test configuration object
 */
export function getTestConfig() {
  const config = {
    ci: isCI(),
    githubActions: isGitHubActions(),
    automated: isAutomatedEnvironment(),
    environment: process.env.NODE_ENV || "development",
    timeouts: {
      test: isCI() ? 30000 : 15000,
      hook: isCI() ? 15000 : 10000,
      global: isCI() ? 60000 : 30000,
    },
    retries: isCI() ? 2 : 0,
    bail: isCI() ? 5 : false,
  };

  return config;
}

/**
 * Should skip performance-intensive tests in CI
 * @returns {boolean} True if performance tests should be skipped
 */
export function shouldSkipPerformanceTests() {
  return isCI() && process.env.SKIP_PERFORMANCE_INTENSIVE_TESTS === "true";
}

/**
 * Should skip external dependency tests in CI
 * @returns {boolean} True if external tests should be skipped
 */
export function shouldSkipExternalTests() {
  return isCI() && process.env.TEST_CI_EXCLUDE_PATTERNS === "true";
}

/**
 * Gets appropriate test patterns for CI exclusion
 * @returns {string[]} Array of patterns to exclude in CI
 */
export function getCIExcludePatterns() {
  if (!shouldSkipExternalTests()) return [];

  return [
    "**/external-integration/**",
    "**/performance-intensive/**",
    "**/*.external.test.js",
    "**/*.load.test.js",
  ];
}

/**
 * Logs CI detection information (for debugging)
 */
export function logCIInfo() {
  const config = getTestConfig();
  console.log("🔍 CI Detection Info:", {
    isCI: config.ci,
    isGitHubActions: config.githubActions,
    environment: config.environment,
    timeouts: config.timeouts,
    memoryConfig: getMemoryConfig(),
    shouldSkipPerformance: shouldSkipPerformanceTests(),
    shouldSkipExternal: shouldSkipExternalTests(),
  });
}

// Export all functions as default object for convenience
export default {
  isCI,
  isGitHubActions,
  isAutomatedEnvironment,
  getCITimeoutMultiplier,
  getCIIterationCount,
  getCIConcurrency,
  getMemoryConfig,
  getTestConfig,
  shouldSkipPerformanceTests,
  shouldSkipExternalTests,
  getCIExcludePatterns,
  logCIInfo,
};

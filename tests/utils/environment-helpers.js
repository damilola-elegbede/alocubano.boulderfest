/**
 * Environment Helpers for Cross-Platform Testing
 * Utilities to handle Edge/Node.js runtime differences in tests
 */

/**
 * Detect if we're running in Node.js environment
 * @returns {boolean} True if Node.js environment
 */
export function isNodeEnvironment() {
  return (
    typeof process !== "undefined" && process.versions && process.versions.node
  );
}

/**
 * Detect if we're running in Edge runtime environment
 * @returns {boolean} True if Edge runtime environment
 */
export function isEdgeEnvironment() {
  return (
    typeof EdgeRuntime !== "undefined" ||
    (typeof globalThis !== "undefined" && globalThis.EdgeRuntime)
  );
}

/**
 * Detect if we're running in browser environment
 * @returns {boolean} True if browser environment
 */
export function isBrowserEnvironment() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * Get appropriate database client import based on environment
 * @returns {Promise<Function>} createClient function
 */
export async function getDatabaseClientImport() {
  if (isNodeEnvironment()) {
    const { createClient } = await import("@libsql/client");
    return createClient;
  } else {
    const { createClient } = await import("@libsql/client/web");
    return createClient;
  }
}

/**
 * Skip test if specific environment requirements not met
 * @param {Object} options - Environment requirements
 * @param {boolean} options.requiresNode - Requires Node.js environment
 * @param {boolean} options.requiresEdge - Requires Edge runtime
 * @param {boolean} options.requiresBrowser - Requires browser environment
 * @param {string[]} options.requiredEnvVars - Required environment variables
 * @returns {boolean} True if test should be skipped
 */
export function shouldSkipTest(options = {}) {
  const {
    requiresNode,
    requiresEdge,
    requiresBrowser,
    requiredEnvVars = [],
  } = options;

  // Check environment requirements
  if (requiresNode && !isNodeEnvironment()) {
    return { skip: true, reason: "Node.js environment required" };
  }

  if (requiresEdge && !isEdgeEnvironment()) {
    return { skip: true, reason: "Edge runtime required" };
  }

  if (requiresBrowser && !isBrowserEnvironment()) {
    return { skip: true, reason: "Browser environment required" };
  }

  // Check environment variables
  const missingVars = requiredEnvVars.filter(
    (varName) => !process.env[varName],
  );
  if (missingVars.length > 0) {
    return {
      skip: true,
      reason: `Missing environment variables: ${missingVars.join(", ")}`,
    };
  }

  return { skip: false };
}

/**
 * Conditional test runner that respects environment requirements
 * @param {string} name - Test name
 * @param {Function} testFn - Test function
 * @param {Object} envOptions - Environment requirements
 * @returns {Function} Conditional test function
 */
export function envTest(name, testFn, envOptions = {}) {
  return (testRunner) => {
    const skipResult = shouldSkipTest(envOptions);

    if (skipResult.skip) {
      testRunner.skip(name + ` (${skipResult.reason})`, testFn);
    } else {
      testRunner(name, testFn);
    }
  };
}

/**
 * Get memory usage information (Node.js only)
 * @param {string} label - Label for the measurement
 * @returns {Object|null} Memory usage object or null if not available
 */
export function getMemoryUsage(label) {
  if (!isNodeEnvironment() || typeof process.memoryUsage !== "function") {
    return null;
  }

  const usage = process.memoryUsage();
  return {
    label,
    timestamp: Date.now(),
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
    external: Math.round(usage.external / 1024 / 1024), // MB
    rss: Math.round(usage.rss / 1024 / 1024), // MB
  };
}

/**
 * Create environment-appropriate timeout values
 * @param {Object} options - Timeout options
 * @param {number} options.base - Base timeout in ms
 * @param {number} options.node - Node.js multiplier (default: 1)
 * @param {number} options.edge - Edge runtime multiplier (default: 1.5)
 * @param {number} options.ci - CI environment multiplier (default: 2)
 * @returns {number} Calculated timeout in ms
 */
export function getEnvironmentTimeout(options = {}) {
  const { base = 5000, node = 1, edge = 1.5, ci = 2 } = options;

  let multiplier = 1;

  if (isNodeEnvironment()) {
    multiplier = node;
  } else if (isEdgeEnvironment()) {
    multiplier = edge;
  }

  // Additional CI multiplier
  if (process.env.CI === "true") {
    multiplier *= ci;
  }

  return base * multiplier;
}

/**
 * Environment-specific configuration getter
 * @param {Object} configs - Configuration object with environment keys
 * @param {Object} configs.node - Node.js specific config
 * @param {Object} configs.edge - Edge runtime specific config
 * @param {Object} configs.browser - Browser specific config
 * @param {Object} configs.default - Default config
 * @returns {Object} Environment-appropriate configuration
 */
export function getEnvironmentConfig(configs = {}) {
  const {
    node = {},
    edge = {},
    browser = {},
    default: defaultConfig = {},
  } = configs;

  let envConfig = defaultConfig;

  if (isNodeEnvironment()) {
    envConfig = { ...defaultConfig, ...node };
  } else if (isEdgeEnvironment()) {
    envConfig = { ...defaultConfig, ...edge };
  } else if (isBrowserEnvironment()) {
    envConfig = { ...defaultConfig, ...browser };
  }

  return envConfig;
}

export default {
  isNodeEnvironment,
  isEdgeEnvironment,
  isBrowserEnvironment,
  getDatabaseClientImport,
  shouldSkipTest,
  envTest,
  getMemoryUsage,
  getEnvironmentTimeout,
  getEnvironmentConfig,
};

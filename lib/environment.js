/**
 * Environment Detection Utilities
 * Provides consistent environment identification across the application
 */

/**
 * Get current deployment environment
 * @returns {'production'|'preview'|'development'|'test'|'local'} Current environment
 */
export const getEnvironment = () => {
  // Vercel deployment environments (highest priority)
  if (process.env.VERCEL_ENV === 'production') return 'production';
  if (process.env.VERCEL_ENV === 'preview') return 'preview';
  if (process.env.VERCEL_ENV === 'development') return 'development';

  // Node environment
  if (process.env.NODE_ENV === 'test') return 'test';
  if (process.env.NODE_ENV === 'production') return 'production';

  // Default to local development
  return 'local';
};

/**
 * Environment-specific boolean checks
 */
export const isProduction = () => getEnvironment() === 'production';
export const isPreview = () => getEnvironment() === 'preview';
export const isDevelopment = () => {
  const env = getEnvironment();
  return env === 'development' || env === 'local';
};
export const isTest = () => getEnvironment() === 'test';

/**
 * Platform-specific checks
 */
export const isVercelBuild = () => process.env.VERCEL === '1';
export const isLocalDevelopment = () => !process.env.VERCEL;

/**
 * Feature availability checks
 */
export const hasGoogleDriveAccess = () => Boolean(
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
  process.env.GOOGLE_PRIVATE_KEY
);

/**
 * Determine if we should use build-time cache or runtime API
 */
export const shouldUseBuildTimeCache = () => {
  // Force build-time cache for integration tests
  if (process.env.INTEGRATION_TEST_MODE === 'true') {
    return true;
  }

  return isLocalDevelopment() && !process.env.FORCE_RUNTIME_API;
};

/**
 * Determine if we should generate cache files during build
 */
export const shouldGenerateBuildCache = () => {
  return isLocalDevelopment() && hasGoogleDriveAccess();
};

/**
 * Get appropriate cache strategy for current environment
 */
export const getCacheStrategy = () => {
  if (isVercelBuild()) {
    return 'runtime'; // Use in-memory caching on Vercel
  }
  return 'file'; // Use file-based caching locally
};

/**
 * Environment-specific configuration
 * @returns {Object} Configuration object for current environment
 */
export const getConfig = () => {
  const env = getEnvironment();

  return {
    environment: env,
    isProduction: isProduction(),
    isPreview: isPreview(),
    isDevelopment: isDevelopment(),
    isTest: isTest(),
    isVercel: isVercelBuild(),
    isLocal: isLocalDevelopment(),
    logLevel: env === 'production' ? 'error' : 'debug',
    enableDetailedErrors: !isProduction(),
    enableDebugLogging: isDevelopment() || isTest(),
    // Add more config as needed
  };
};

export default {
  // Core environment detection
  getEnvironment,
  getConfig,

  // Boolean checks
  isProduction,
  isPreview,
  isDevelopment,
  isTest,

  // Platform checks
  isVercelBuild,
  isLocalDevelopment,

  // Feature checks
  hasGoogleDriveAccess,

  // Cache strategy
  shouldUseBuildTimeCache,
  shouldGenerateBuildCache,
  getCacheStrategy
};
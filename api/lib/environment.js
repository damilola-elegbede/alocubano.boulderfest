/**
 * Environment Detection Utilities
 * Handles differences between local development and Vercel deployment
 */

export const isVercelBuild = () => process.env.VERCEL === '1';
export const isLocalDevelopment = () => !process.env.VERCEL;
export const hasGoogleDriveAccess = () => Boolean(
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && 
  process.env.GOOGLE_PRIVATE_KEY
);

/**
 * Determine if we should use build-time cache or runtime API
 */
export const shouldUseBuildTimeCache = () => {
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

export default {
  isVercelBuild,
  isLocalDevelopment,
  hasGoogleDriveAccess,
  shouldUseBuildTimeCache,
  shouldGenerateBuildCache,
  getCacheStrategy
};
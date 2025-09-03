/**
 * Environment Detection Utility
 * Centralizes environment detection logic to reduce code duplication
 * and provide consistent environment detection across the application.
 */

/**
 * Environment detection configuration
 */
export const EnvironmentDetector = {
  /**
   * Detect the current environment context
   * @returns {Object} Environment context object
   */
  getEnvironmentContext() {
    const isVercel = process.env.VERCEL === "1";
    const isVercelProduction = isVercel && process.env.VERCEL_ENV === "production";
    const isVercelPreview = isVercel && process.env.VERCEL_ENV === "preview";
    const isDevelopment = process.env.NODE_ENV === "development" || process.env.VERCEL_DEV_STARTUP === "true";
    const isTest = process.env.NODE_ENV === "test" || process.env.TEST_TYPE === "integration";
    const isCI = process.env.CI === "true";
    
    // Determine if this is specifically an E2E test context
    const isE2ETest = process.env.E2E_TEST_MODE === "true" || 
                      process.env.PLAYWRIGHT_BROWSER ||
                      process.env.VERCEL_DEV_STARTUP === "true";

    return {
      isVercel,
      isVercelProduction,
      isVercelPreview,
      isDevelopment,
      isTest,
      isCI,
      isE2ETest,
      isProduction: isVercelProduction || (!isDevelopment && !isTest && !isCI)
    };
  },

  /**
   * Check if running in a test environment
   * @returns {boolean}
   */
  isTestEnvironment() {
    const { isTest, isE2ETest, isCI } = this.getEnvironmentContext();
    return isTest || isE2ETest || isCI;
  },

  /**
   * Check if running in production environment
   * @returns {boolean}
   */
  isProductionEnvironment() {
    const { isProduction } = this.getEnvironmentContext();
    return isProduction;
  },

  /**
   * Get environment-specific configuration
   * @returns {Object} Configuration object
   */
  getEnvironmentConfig() {
    const context = this.getEnvironmentContext();
    
    return {
      // Timeout configurations
      databaseInitTimeout: parseInt(process.env.DATABASE_INIT_TIMEOUT || "10000"),
      sessionDuration: parseInt(process.env.ADMIN_SESSION_DURATION || "3600000"),
      
      // Security configurations
      enableStrictSecurity: context.isProduction,
      enableDebugLogs: context.isDevelopment || context.isTest,
      
      // Database configurations
      requireTurso: context.isProduction || context.isVercel || context.isE2ETest,
      allowSqliteFallback: context.isDevelopment,
      
      // Rate limiting
      enableRateLimit: context.isProduction,
      rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || "900000"), // 15 minutes
      rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || "100"),
      
      context
    };
  }
};

export default EnvironmentDetector;

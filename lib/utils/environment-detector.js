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
   * Detect the current environment as a string
   * @returns {string} Environment name ('production', 'preview', 'test', or 'development')
   */
  detectEnvironment() {
    const context = this.getEnvironmentContext();
    if (context.isProduction) return 'production';
    if (context.isVercelPreview) return 'preview';
    if (context.isTest) return 'test';
    return 'development';
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
    
    // Validate rate limit environment variables
    const rateLimitWindow = this.validateRateLimitEnvVar(
      'RATE_LIMIT_WINDOW', 
      process.env.RATE_LIMIT_WINDOW, 
      900000, // 15 minutes default
      { min: 60000, max: 86400000 } // 1 minute to 24 hours
    );
    
    const rateLimitMax = this.validateRateLimitEnvVar(
      'RATE_LIMIT_MAX',
      process.env.RATE_LIMIT_MAX,
      100, // default
      { min: 1, max: 10000 }
    );
    
    return {
      // Timeout configurations
      databaseInitTimeout: (() => { const parsed = parseInt(process.env.DATABASE_INIT_TIMEOUT || "10000", 10); return Number.isFinite(parsed) && parsed > 0 ? parsed : 10000; })(),
      sessionDuration: (() => { const parsed = parseInt(process.env.ADMIN_SESSION_DURATION || "3600000", 10); return Number.isFinite(parsed) && parsed > 0 ? parsed : 3600000; })(),      
      // Security configurations
      enableStrictSecurity: context.isProduction,
      enableDebugLogs: context.isDevelopment || context.isTest,
      
      // Database configurations
      requireTurso: context.isProduction || context.isVercel || context.isE2ETest,
      allowSqliteFallback: context.isDevelopment,
      
      // Rate limiting with validation
      enableRateLimit: context.isProduction,
      rateLimitWindow,
      rateLimitMax,
      
      context
    };
  },

  /**
   * Validate rate limit environment variables
   * @param {string} varName - Environment variable name
   * @param {string} value - Environment variable value
   * @param {number} defaultValue - Default value to use
   * @param {Object} constraints - Min/max constraints
   * @returns {number} Validated value
   */
  validateRateLimitEnvVar(varName, value, defaultValue, constraints = {}) {
    if (!value) {
      return defaultValue;
    }
    
    const parsed = parseInt(value, 10);
    
    if (isNaN(parsed)) {
      console.warn(`Invalid ${varName} environment variable: "${value}". Using default: ${defaultValue}`);
      return defaultValue;
    }
    
    if (constraints.min !== undefined && parsed < constraints.min) {
      console.warn(`${varName} value ${parsed} is below minimum ${constraints.min}. Using default: ${defaultValue}`);
      return defaultValue;
    }
    
    if (constraints.max !== undefined && parsed > constraints.max) {
      console.warn(`${varName} value ${parsed} is above maximum ${constraints.max}. Using default: ${defaultValue}`);
      return defaultValue;
    }
    
    return parsed;
  }
};

export default EnvironmentDetector;

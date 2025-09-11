/**
 * Centralized environment detection utility
 * SECURITY: This module provides consistent environment detection
 * to prevent runtime injection attacks
 */

class EnvironmentDetector {
  constructor() {
    // Cache detection results to prevent runtime changes
    this._isTestEnvironment = null;
    this._environmentType = null;
    this._detectionTime = null;
  }

  /**
   * Detect if running in a test environment
   * Uses build-time configuration to prevent runtime injection
   */
  isTestEnvironment() {
    // Return cached result if available
    if (this._isTestEnvironment !== null) {
      return this._isTestEnvironment;
    }

    // SECURITY: Use build-time values that cannot be changed at runtime
    const buildEnv = process.env.BUILD_ENV || process.env.VERCEL_ENV;
    const nodeEnv = process.env.NODE_ENV;
    const isProduction = nodeEnv === 'production';
    
    // Test environment detection logic
    const isTest = (
      // Explicit test build
      buildEnv === 'test' ||
      // CI environment with test flag
      (process.env.CI === 'true' && nodeEnv === 'test') ||
      // Preview environment (non-production)
      (buildEnv === 'preview' && !isProduction)
    );

    // Cache the result
    this._isTestEnvironment = isTest;
    this._detectionTime = new Date().toISOString();
    
    // Log detection for audit trail
    if (isTest) {
      console.log('[EnvironmentDetector] Test environment detected', {
        buildEnv,
        nodeEnv,
        detectionTime: this._detectionTime
      });
    }

    return isTest;
  }

  /**
   * Get the environment type
   */
  getEnvironmentType() {
    if (this._environmentType !== null) {
      return this._environmentType;
    }

    const buildEnv = process.env.BUILD_ENV || process.env.VERCEL_ENV;
    const nodeEnv = process.env.NODE_ENV;

    if (nodeEnv === 'production' && buildEnv !== 'preview') {
      this._environmentType = 'production';
    } else if (buildEnv === 'preview') {
      this._environmentType = 'preview';
    } else if (process.env.CI === 'true') {
      this._environmentType = 'ci';
    } else if (nodeEnv === 'test') {
      this._environmentType = 'test';
    } else if (nodeEnv === 'development') {
      this._environmentType = 'development';
    } else {
      this._environmentType = 'unknown';
    }

    return this._environmentType;
  }

  /**
   * Check if a specific feature should be enabled
   */
  isFeatureEnabled(featureName) {
    const testFeatures = [
      'rate-limit-bypass',
      'clear-rate-limits',
      'test-admin-password',
      'debug-endpoints'
    ];

    // Only enable test features in test environments
    if (testFeatures.includes(featureName)) {
      return this.isTestEnvironment();
    }

    // Other features can have their own logic
    return false;
  }

  /**
   * Get IP whitelist for current environment
   */
  getIpWhitelist() {
    const envType = this.getEnvironmentType();

    switch (envType) {
      case 'production':
        // No whitelist in production - all IPs blocked from test endpoints
        return [];
      
      case 'preview':
        // GitHub Actions and localhost only
        return [
          '140.82.',   // GitHub Actions range 1
          '143.55.',   // GitHub Actions range 2
          '192.30.',   // GitHub Enterprise
          '::1',       // IPv6 localhost
          '127.0.0.1'  // IPv4 localhost
        ];
      
      case 'ci':
      case 'test':
      case 'development':
        // Allow all IPs in test/development
        return ['*'];
      
      default:
        return [];
    }
  }

  /**
   * Check if an IP is whitelisted
   */
  isIpWhitelisted(clientIp) {
    const whitelist = this.getIpWhitelist();
    
    // Allow all IPs
    if (whitelist.includes('*')) {
      return true;
    }

    // No IPs allowed
    if (whitelist.length === 0) {
      return false;
    }

    // Check if IP matches any whitelist pattern
    return whitelist.some(pattern => {
      if (!clientIp) return false;
      return clientIp.startsWith(pattern);
    });
  }

  /**
   * Get security headers for current environment
   */
  getSecurityHeaders() {
    const isTest = this.isTestEnvironment();
    
    const headers = {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    };

    // Add CSP header for non-test environments
    if (!isTest) {
      headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'";
    }

    // Add environment indicator header (for debugging)
    if (isTest) {
      headers['X-Environment-Type'] = this.getEnvironmentType();
    }

    return headers;
  }

  /**
   * Reset cached values (for testing only)
   */
  reset() {
    if (this.getEnvironmentType() === 'test') {
      this._isTestEnvironment = null;
      this._environmentType = null;
      this._detectionTime = null;
    }
  }
}

// Singleton instance
let detector = null;

/**
 * Get the environment detector instance
 */
export function getEnvironmentDetector() {
  if (!detector) {
    detector = new EnvironmentDetector();
  }
  return detector;
}

// Export convenience functions
export function isTestEnvironment() {
  return getEnvironmentDetector().isTestEnvironment();
}

export function getEnvironmentType() {
  return getEnvironmentDetector().getEnvironmentType();
}

export function isFeatureEnabled(featureName) {
  return getEnvironmentDetector().isFeatureEnabled(featureName);
}

export function isIpWhitelisted(clientIp) {
  return getEnvironmentDetector().isIpWhitelisted(clientIp);
}

export function getSecurityHeaders() {
  return getEnvironmentDetector().getSecurityHeaders();
}

// Default export
export default {
  getEnvironmentDetector,
  isTestEnvironment,
  getEnvironmentType,
  isFeatureEnabled,
  isIpWhitelisted,
  getSecurityHeaders
};
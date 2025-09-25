/**
 * Environment Detection Utility
 * Detects whether we're running in development, preview, or production
 */

export class EnvironmentDetector {
  constructor() {
    this.hostname = window.location.hostname;
    this.pathname = window.location.pathname;
    this.protocol = window.location.protocol;
  }

  /**
   * Check if running in development mode
   * @returns {boolean}
   */
  isDevelopment() {
    return (
      this.hostname === 'localhost' ||
      this.hostname === '127.0.0.1' ||
      this.hostname.includes('localhost') ||
      this.hostname.includes('ngrok') ||
      this.hostname.includes('.local')
    );
  }

  /**
   * Check if running on Vercel preview deployment
   * @returns {boolean}
   */
  isPreview() {
    return (
      this.hostname.includes('vercel.app') &&
      !this.hostname.includes('alocubano.com')
    );
  }

  /**
   * Check if running in production
   * @returns {boolean}
   */
  isProduction() {
    return (
      this.hostname === 'alocubano.com' ||
      this.hostname === 'www.alocubano.com' ||
      (this.hostname.includes('alocubano') && !this.hostname.includes('vercel.app'))
    );
  }

  /**
   * Check if test mode should be enabled
   * @returns {boolean}
   */
  shouldShowTestContent() {
    return this.isDevelopment() || this.isPreview();
  }

  /**
   * Get environment name
   * @returns {string}
   */
  getEnvironment() {
    if (this.isDevelopment()) return 'development';
    if (this.isPreview()) return 'preview';
    if (this.isProduction()) return 'production';
    return 'unknown';
  }

  /**
   * Get environment details for debugging
   * @returns {Object}
   */
  getDetails() {
    return {
      environment: this.getEnvironment(),
      hostname: this.hostname,
      isDevelopment: this.isDevelopment(),
      isPreview: this.isPreview(),
      isProduction: this.isProduction(),
      shouldShowTestContent: this.shouldShowTestContent()
    };
  }
}

// Create singleton instance
let instance = null;

export function getEnvironment() {
  if (!instance) {
    instance = new EnvironmentDetector();
  }
  return instance;
}

// Export default instance
export default getEnvironment();
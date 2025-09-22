/**
 * Environment-Aware Logging Utility
 * Provides conditional logging based on environment and development mode
 */

// Detect if we're in development mode
const isDevelopment = () => {
    // Check for common development indicators
    return (
        window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.includes('vercel.app') ||
    window.location.hostname.includes('ngrok') ||
    window.location.port !== '' ||
    window.location.search.includes('debug=true') ||
    localStorage.getItem('debug') === 'true'
    );
};

// Cache the development status
const DEV_MODE = isDevelopment();

/**
 * Logger class with environment-aware methods
 */
class Logger {
    constructor(namespace = 'App') {
        this.namespace = namespace;
        this.isDev = DEV_MODE;
    }

    /**
   * Log messages (only in development)
   */
    log(...args) {
        if (this.isDev) {
            console.log(`[${this.namespace}]`, ...args);
        }
    }

    /**
   * Log info messages (only in development)
   */
    info(...args) {
        if (this.isDev) {
            console.info(`[${this.namespace}]`, ...args);
        }
    }

    /**
   * Log debug messages (only in development)
   */
    debug(...args) {
        if (this.isDev) {
            console.debug(`[${this.namespace}]`, ...args);
        }
    }

    /**
   * Log warnings (always shown but with namespace)
   */
    warn(...args) {
        console.warn(`[${this.namespace}]`, ...args);
    }

    /**
   * Log errors (always shown but with namespace)
   */
    error(...args) {
        console.error(`[${this.namespace}]`, ...args);
    }

    /**
   * Group logging (only in development)
   */
    group(title) {
        if (this.isDev && console.group) {
            console.group(`[${this.namespace}] ${title}`);
        }
    }

    /**
   * End group logging (only in development)
   */
    groupEnd() {
        if (this.isDev && console.groupEnd) {
            console.groupEnd();
        }
    }

    /**
   * Performance timing (only in development)
   */
    time(label) {
        if (this.isDev && console.time) {
            console.time(`[${this.namespace}] ${label}`);
        }
    }

    /**
   * End performance timing (only in development)
   */
    timeEnd(label) {
        if (this.isDev && console.timeEnd) {
            console.timeEnd(`[${this.namespace}] ${label}`);
        }
    }

    /**
   * Enable debug mode temporarily
   */
    static enableDebug() {
        localStorage.setItem('debug', 'true');
        console.log('Debug mode enabled. Refresh page to activate.');
    }

    /**
   * Disable debug mode
   */
    static disableDebug() {
        localStorage.removeItem('debug');
        console.log('Debug mode disabled. Refresh page to deactivate.');
    }
}

/**
 * Create logger instance
 */
export function createLogger(namespace = 'App') {
    return new Logger(namespace);
}

/**
 * Default logger instance
 */
export const logger = new Logger('Default');

/**
 * Check if in development mode
 */
export { DEV_MODE as isDevelopment };

// Make logger available globally for debugging
if (typeof window !== 'undefined') {
    window.Logger = Logger;
    window.logger = logger;
}

export default Logger;
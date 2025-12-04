/**
 * Debug Logging Utility
 *
 * Provides conditional logging based on CONSOLE_LOG_DEBUG_ENABLED environment variable.
 * Debug logs are hidden by default in production.
 *
 * Environment Variable:
 * - CONSOLE_LOG_DEBUG_ENABLED=1 → Show debug statements
 * - CONSOLE_LOG_DEBUG_ENABLED=0 or unset → Hide debug statements (default)
 *
 * Usage:
 * import { debugLog, debugWarn } from './lib/debug.js';
 * debugLog('🔧 DEBUG:', 'message');
 * debugWarn('⚠️ Warning:', 'message');
 */

// Check for debug flag - multiple sources for flexibility
// 1. window global (set by build process or manually)
// 2. URL parameter ?debug=true (for development/debugging)
// 3. localStorage debug key (for persistent debugging)
const DEBUG_ENABLED = (function() {
    if (typeof window === 'undefined') {
        return false;
    }

    // Check window global first (set by Vercel environment or build)
    if (window.__CONSOLE_LOG_DEBUG_ENABLED__) {
        return true;
    }

    // Check URL parameter for on-the-fly debugging
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('debug') === 'true') {
        return true;
    }

    // Check localStorage for persistent debug mode
    if (localStorage.getItem('CONSOLE_LOG_DEBUG_ENABLED') === '1') {
        return true;
    }

    return false;
})();

/**
 * Log debug messages (only when debug is enabled)
 * @param {...any} args - Arguments to log
 */
export function debugLog(...args) {
    if (DEBUG_ENABLED) {
        console.log(...args);
    }
}

/**
 * Log debug warnings (only when debug is enabled)
 * @param {...any} args - Arguments to log
 */
export function debugWarn(...args) {
    if (DEBUG_ENABLED) {
        console.warn(...args);
    }
}

/**
 * Log debug info (only when debug is enabled)
 * @param {...any} args - Arguments to log
 */
export function debugInfo(...args) {
    if (DEBUG_ENABLED) {
        console.info(...args);
    }
}

export { DEBUG_ENABLED };

/**
 * Feature Flag Utilities
 *
 * Provides feature flag functionality for React checkout migration.
 * Supports both environment variables (Vite) and URL parameter overrides.
 *
 * Feature Flag Strategy:
 * - React checkout is the DEFAULT experience
 * - Legacy checkout is enabled via LEGACY_CHECKOUT_ENABLED=true
 * - URL param ?legacy_checkout=true overrides for testing
 *
 * @module src/utils/feature-flags
 */

/**
 * Check if legacy checkout should be used instead of React checkout
 *
 * Priority:
 * 1. URL parameter override (for testing)
 * 2. Environment variable (for deployment control)
 * 3. Default: false (React checkout is default)
 *
 * @returns {boolean} true if legacy checkout should be used
 */
export function isLegacyCheckoutEnabled() {
    // URL param override for testing (highest priority)
    if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('legacy_checkout')) {
            return urlParams.get('legacy_checkout') === 'true';
        }
    }

    // Environment variable (from Vite build)
    // Check both VITE_ prefix (client-side) and direct env var (SSR)
    if (typeof import.meta !== 'undefined' && import.meta.env) {
        return import.meta.env.VITE_LEGACY_CHECKOUT_ENABLED === 'true';
    }

    // Fallback for non-Vite environments (e.g., tests, SSR)
    if (typeof process !== 'undefined' && process.env) {
        return process.env.LEGACY_CHECKOUT_ENABLED === 'true';
    }

    // Default: React checkout is enabled (legacy disabled)
    return false;
}

/**
 * Check if React checkout should be used
 * Inverse of isLegacyCheckoutEnabled for clearer intent
 *
 * @returns {boolean} true if React checkout should be used
 */
export function isReactCheckoutEnabled() {
    return !isLegacyCheckoutEnabled();
}

/**
 * Get the checkout URL based on feature flag
 *
 * @returns {string} URL path for checkout
 */
export function getCheckoutUrl() {
    return isReactCheckoutEnabled() ? '/checkout' : null;
}

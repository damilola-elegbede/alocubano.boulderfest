/**
 * Pure Cart Visibility Functions
 *
 * Extracted from floating-cart.js for unit testing.
 * These functions determine when the cart should be visible based on page and state.
 */

/**
 * Page behavior configuration for cart visibility
 */
export const PAGE_VISIBILITY_CONFIG = {
    // Pages that always show cart (main shopping pages)
    alwaysShow: ['/tickets', '/donations'],
    // Pages that never show cart (error pages, redirect pages)
    neverShow: ['/404', '/index.html'],
    // Pages that show cart only when it has items
    showWithItems: ['/about', '/artists', '/schedule', '/gallery', '/home', '/']
};

/**
 * Determine if cart should be visible based on current page and cart state
 * @param {string} currentPath - Current page path
 * @param {boolean} hasItems - Whether cart has items
 * @returns {boolean} True if cart should be visible
 */
export function determineCartVisibility(currentPath, hasItems) {
    if (!currentPath || typeof currentPath !== 'string') {
        return false;
    }

    // Normalize path (remove trailing slash, handle empty path)
    const normalizedPath = currentPath === '/' ? '/' : currentPath.replace(/\/$/, '');

    // Check if current page should never show cart
    if (PAGE_VISIBILITY_CONFIG.neverShow.some(path => normalizedPath.includes(path))) {
        return false;
    }

    // Check if current page should always show cart
    if (PAGE_VISIBILITY_CONFIG.alwaysShow.some(path => normalizedPath.includes(path))) {
        return true;
    }

    // For other pages (about, artists, schedule, gallery), show cart only when it has items
    return Boolean(hasItems);
}

/**
 * Get visibility rule for a specific page
 * @param {string} currentPath - Current page path
 * @returns {string} Visibility rule: 'always', 'never', 'withItems'
 */
export function getPageVisibilityRule(currentPath) {
    if (!currentPath || typeof currentPath !== 'string') {
        return 'never';
    }

    const normalizedPath = currentPath === '/' ? '/' : currentPath.replace(/\/$/, '');

    if (PAGE_VISIBILITY_CONFIG.neverShow.some(path => normalizedPath.includes(path))) {
        return 'never';
    }

    if (PAGE_VISIBILITY_CONFIG.alwaysShow.some(path => normalizedPath.includes(path))) {
        return 'always';
    }

    return 'withItems';
}

/**
 * Check if page is a shopping page (always shows cart)
 * @param {string} currentPath - Current page path
 * @returns {boolean} True if shopping page
 */
export function isShoppingPage(currentPath) {
    if (!currentPath || typeof currentPath !== 'string') {
        return false;
    }

    const normalizedPath = currentPath === '/' ? '/' : currentPath.replace(/\/$/, '');
    return PAGE_VISIBILITY_CONFIG.alwaysShow.some(path => normalizedPath.includes(path));
}

/**
 * Check if page should never show cart
 * @param {string} currentPath - Current page path
 * @returns {boolean} True if page should never show cart
 */
export function isNonCartPage(currentPath) {
    if (!currentPath || typeof currentPath !== 'string') {
        return true;
    }

    const normalizedPath = currentPath === '/' ? '/' : currentPath.replace(/\/$/, '');
    return PAGE_VISIBILITY_CONFIG.neverShow.some(path => normalizedPath.includes(path));
}

/**
 * Get cart visibility state data for debugging/analytics
 * @param {string} currentPath - Current page path
 * @param {boolean} hasItems - Whether cart has items
 * @returns {Object} Visibility state data
 */
export function getCartVisibilityState(currentPath, hasItems) {
    const normalizedPath = currentPath === '/' ? '/' : currentPath.replace(/\/$/, '');
    const rule = getPageVisibilityRule(currentPath);
    const shouldShow = determineCartVisibility(currentPath, hasItems);

    return {
        currentPath: normalizedPath,
        hasItems: Boolean(hasItems),
        rule,
        shouldShow,
        isShoppingPage: isShoppingPage(currentPath),
        isNonCartPage: isNonCartPage(currentPath)
    };
}

/**
 * Validate page path for cart visibility logic
 * @param {string} path - Page path to validate
 * @returns {boolean} True if path is valid
 */
export function isValidPagePath(path) {
    if (!path || typeof path !== 'string') {
        return false;
    }

    // Must start with / or be a relative path
    return path.startsWith('/') || path.startsWith('./') || !path.includes('://');
}

/**
 * Get all pages that match a specific visibility rule
 * @param {string} rule - Visibility rule ('always', 'never', 'withItems')
 * @returns {Array} Array of page patterns
 */
export function getPagesByRule(rule) {
    switch (rule) {
    case 'always':
        return [...PAGE_VISIBILITY_CONFIG.alwaysShow];
    case 'never':
        return [...PAGE_VISIBILITY_CONFIG.neverShow];
    case 'withItems':
        return [...PAGE_VISIBILITY_CONFIG.showWithItems];
    default:
        return [];
    }
}
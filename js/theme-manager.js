/**
 * Theme Manager - Performance Optimized
 * Implements hybrid theme approach - admin always dark, main site user-controlled
 *
 * Features:
 * - Auto-detects admin pages and applies dark theme (always, no user override)
 * - Main site pages support user-controlled themes: system/light/dark
 * - localStorage persistence for main site preferences only
 * - System preference detection using prefers-color-scheme
 * - Prevents flash of unstyled content (FOUC) on page load
 * - Emits 'themechange' events for component integration
 * 
 * Performance Optimizations:
 * - Cached DOM element references
 * - Debounced localStorage access
 * - RequestAnimationFrame for smooth transitions
 * - Efficient event delegation
 * - Performance marks for monitoring
 */

// Theme constants
const THEMES = {
    LIGHT: 'light',
    DARK: 'dark',
    SYSTEM: 'system'
};

const THEME_ATTRIBUTE = 'data-theme';
const STORAGE_KEY = 'theme-preference';

// Performance optimization: Cache frequently accessed elements and values
let cachedDocumentElement = null;
let cachedIsAdminPage = null;
let cachedStoredPreference = null;
let lastStorageAccess = 0;
const STORAGE_CACHE_DURATION = 100; // ms

// Performance monitoring
const PERF_MARKS = {
    THEME_START: 'theme-start',
    THEME_END: 'theme-end',
    APPLY_START: 'theme-apply-start',
    APPLY_END: 'theme-apply-end'
};

/**
 * Detects if current page is an admin page (cached for performance)
 * 
 * Admin pages are identified by URL patterns and always use dark theme.
 * This check is cached to avoid repeated string operations.
 * 
 * @returns {boolean} True if on admin page
 */
function isAdminPage() {
    if (cachedIsAdminPage === null) {
        const path = window.location.pathname.toLowerCase();
        cachedIsAdminPage = path.includes('/admin') || path.includes('pages/admin');
    }
    return cachedIsAdminPage;
}

/**
 * Gets stored theme preference from localStorage with caching (main site only)
 * 
 * Implements performance caching to reduce localStorage access frequency.
 * Admin pages always return null since they don't store preferences.
 * 
 * @returns {string} 'system', 'light', or 'dark' for main site, null if not set
 */
function getStoredPreference() {
    if (typeof localStorage === 'undefined' || isAdminPage()) {
        return null;
    }
    
    // Use cached value if recent
    const now = performance.now();
    if (cachedStoredPreference !== null && (now - lastStorageAccess) < STORAGE_CACHE_DURATION) {
        return cachedStoredPreference;
    }
    
    const stored = localStorage.getItem(STORAGE_KEY);
    cachedStoredPreference = (stored && Object.values(THEMES).includes(stored)) ? stored : null;
    lastStorageAccess = now;
    
    return cachedStoredPreference;
}

/**
 * Detects system color scheme preference
 * 
 * Uses CSS media queries to determine if the user's operating system
 * is configured for dark or light mode. Provides fallback for older browsers.
 * 
 * @returns {string} 'light' or 'dark' based on prefers-color-scheme
 */
function detectSystemPreference() {
    if (typeof window === 'undefined' || !window.matchMedia) {
        return THEMES.LIGHT;
    }
    
    return window.matchMedia('(prefers-color-scheme: dark)').matches 
        ? THEMES.DARK 
        : THEMES.LIGHT;
}

/**
 * Determines appropriate theme based on page type and user preference
 * 
 * Core theme resolution logic:
 * 1. Admin pages always get dark theme (non-configurable)
 * 2. Main site checks user preference (localStorage)
 * 3. System preference used as fallback
 * 
 * @returns {string} 'dark' for admin pages, resolved theme for main site
 */
function determineTheme() {
    // Admin pages are always dark, no user override
    if (isAdminPage()) {
        return THEMES.DARK;
    }
    
    // Main site: check user preference
    const stored = getStoredPreference();
    const preference = stored || THEMES.SYSTEM; // Default to system if no preference
    
    if (preference === THEMES.SYSTEM) {
        return detectSystemPreference();
    }
    
    return preference;
}

/**
 * Sets theme preference with performance optimization (main site only)
 * 
 * Validates input, stores preference, and applies theme immediately.
 * Uses requestAnimationFrame for smooth visual transitions.
 * Admin pages reject theme changes with console warning.
 * 
 * @param {string} theme - 'system', 'light', or 'dark'
 */
function setTheme(theme) {
    performance.mark(PERF_MARKS.THEME_START);
    
    // Admin pages cannot change theme
    if (isAdminPage()) {
        console.warn('Theme changes are not allowed on admin pages');
        return;
    }
    
    // Validate theme value
    if (!Object.values(THEMES).includes(theme)) {
        console.error('Invalid theme:', theme);
        return;
    }
    
    // Store preference and invalidate cache
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, theme);
        cachedStoredPreference = theme;
        lastStorageAccess = performance.now();
    }
    
    // Apply immediately; applyTheme handles its own RAF for DOM work
    applyTheme();
    performance.mark(PERF_MARKS.THEME_END);
    if (performance.measure) {
        performance.measure('theme-change', PERF_MARKS.THEME_START, PERF_MARKS.THEME_END);
    }
}

/**
 * Applies theme to document element with performance optimization
 * 
 * Core theme application function that:
 * 1. Resolves the appropriate theme
 * 2. Updates the document element's data-theme attribute
 * 3. Dispatches custom events for component integration
 * 4. Uses RAF for smooth visual updates
 * 
 * Only updates DOM if theme actually changed to avoid unnecessary operations.
 */
function applyTheme() {
    if (typeof document === 'undefined') {
        return;
    }

    performance.mark(PERF_MARKS.APPLY_START);
    
    // Cache document element reference
    if (!cachedDocumentElement) {
        cachedDocumentElement = document.documentElement;
    }

    const theme = determineTheme();
    const currentTheme = cachedDocumentElement.getAttribute(THEME_ATTRIBUTE);

    // Only apply if theme actually changed (avoid unnecessary DOM modifications)
    if (currentTheme !== theme) {
        // Use RAF for smooth visual transition
        requestAnimationFrame(() => {
            // Check if document element still exists (important for tests)
            if (cachedDocumentElement && cachedDocumentElement.setAttribute) {
                cachedDocumentElement.setAttribute(THEME_ATTRIBUTE, theme);
                
                // Dispatch custom event for other components to listen to
                const event = new CustomEvent('themechange', {
                    detail: { 
                        theme: theme,
                        isAdminPage: isAdminPage(),
                        userPreference: isAdminPage() ? null : (getStoredPreference() || THEMES.SYSTEM),
                        previousTheme: currentTheme
                    }
                });
                
                // Use setTimeout to prevent blocking
                setTimeout(() => {
                    if (document && document.dispatchEvent) {
                        document.dispatchEvent(event);
                    }
                    performance.mark(PERF_MARKS.APPLY_END);
                    
                    if (performance.measure) {
                        try {
                            performance.measure('theme-apply', PERF_MARKS.APPLY_START, PERF_MARKS.APPLY_END);
                        } catch (e) {
                            // Start mark doesn't exist, skip measurement
                        }
                    }
                }, 0);
            }
        });
    }
}

/**
 * Gets current active theme (resolved, not preference)
 * 
 * Returns the currently active theme after all resolution logic.
 * This is what's actually applied to the document.
 * 
 * @returns {string} Current active theme ('light' or 'dark')
 */
function getCurrentTheme() {
    if (typeof document === 'undefined') {
        return THEMES.LIGHT;
    }

    return determineTheme();
}

/**
 * Gets user theme preference (main site only)
 * 
 * Returns the user's explicitly set preference, not the resolved theme.
 * Admin pages return null since they don't have user preferences.
 * 
 * @returns {string} User preference ('system', 'light', 'dark') or 'system' as default
 */
function getUserPreference() {
    if (isAdminPage()) {
        return null; // Admin has no user preference
    }
    
    return getStoredPreference() || THEMES.SYSTEM;
}

/**
 * Gets theme based on page type and user preference
 * 
 * Alias for determineTheme() to maintain API compatibility.
 * 
 * @returns {string} Resolved theme ('light' or 'dark')
 */
function getTheme() {
    return determineTheme();
}

/**
 * Sets up system preference change listener (main site only)
 * 
 * Monitors the user's system dark/light mode preference and applies
 * changes automatically when user has 'system' preference selected.
 * Uses modern addEventListener with fallback for older browsers.
 */
function setupSystemPreferenceListener() {
    if (typeof window === 'undefined' || !window.matchMedia || isAdminPage()) {
        return;
    }
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleSystemChange = () => {
        // Only react if user preference is set to 'system'
        const userPref = getUserPreference();
        if (userPref === THEMES.SYSTEM) {
            applyTheme();
        }
    };
    
    // Modern browsers
    if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleSystemChange);
    } else {
        // Fallback for older browsers
        mediaQuery.addListener(handleSystemChange);
    }
}

/**
 * Initializes theme system
 * 
 * Main entry point that should be called as early as possible to prevent FOUC.
 * Sets up theme application and system preference monitoring.
 * Called automatically when module loads for immediate execution.
 */
function initializeTheme() {
    applyTheme();
    setupSystemPreferenceListener();
}

// Auto-initialize on module load to prevent FOUC
// This runs synchronously when the script loads
if (typeof document !== 'undefined') {
    initializeTheme();
}

/**
 * Get theme performance metrics
 * 
 * Returns detailed performance data for theme operations including
 * timing measurements and cache statistics for debugging and optimization.
 * 
 * @returns {Object} Performance data for theme operations
 */
function getPerformanceMetrics() {
    const measures = [];
    try {
        if (performance.getEntriesByType) {
            const measureEntries = performance.getEntriesByType('measure');
            measureEntries.forEach(entry => {
                if (entry.name.startsWith('theme-')) {
                    measures.push({
                        name: entry.name,
                        duration: entry.duration,
                        startTime: entry.startTime
                    });
                }
            });
        }
    } catch (e) {
        // Performance API not available
    }
    
    return {
        measures,
        cacheStats: {
            lastStorageAccess,
            cachedPreference: cachedStoredPreference,
            cacheAge: performance.now() - lastStorageAccess
        }
    };
}

/**
 * Clear performance metrics and reset cache
 * 
 * Utility function for debugging and testing that clears all
 * performance measurements and resets internal caches.
 */
function clearPerformanceData() {
    try {
        if (performance.clearMeasures) {
            performance.clearMeasures();
        }
        if (performance.clearMarks) {
            performance.clearMarks();
        }
    } catch (e) {
        // Performance API not available
    }
    
    // Reset cache
    cachedStoredPreference = null;
    cachedIsAdminPage = null;
    cachedDocumentElement = null;
    lastStorageAccess = 0;
}

// Export API
export {
    THEMES,
    getTheme,
    getCurrentTheme,
    getUserPreference,
    setTheme,
    getStoredPreference,
    detectSystemPreference,
    initializeTheme,
    isAdminPage,
    getPerformanceMetrics,
    clearPerformanceData
};

// Default export for convenience
export default {
    THEMES,
    getTheme,
    getCurrentTheme,
    getUserPreference,
    setTheme,
    getStoredPreference,
    detectSystemPreference,
    initializeTheme,
    isAdminPage
};
/**
 * Theme Manager
 * Implements hybrid theme approach - fixed dark theme for admin pages, user-controlled themes for main site
 *
 * Features:
 * - Auto-detects admin pages and applies fixed dark theme
 * - Main site pages support user-controlled themes (system/light/dark)
 * - localStorage persistence for main site theme preferences
 * - System theme detection and automatic switching
 * - Prevents flash of wrong theme content (FOUT)
 */

// Theme constants
const THEMES = {
    SYSTEM: 'system',
    LIGHT: 'light',
    DARK: 'dark'
};

const THEME_ATTRIBUTE = 'data-theme';
const STORAGE_KEY = 'theme-preference';

/**
 * Detects if current page is an admin page
 * Checks URL path for '/admin' or 'pages/admin'
 * @returns {boolean} True if on admin page
 */
function isAdminPage() {
    const path = window.location.pathname.toLowerCase();
    return path.includes('/admin') || path.includes('pages/admin');
}

/**
 * Gets the system's preferred color scheme
 * @returns {string} 'light' or 'dark'
 */
function getSystemTheme() {
    if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? THEMES.DARK : THEMES.LIGHT;
    }
    return THEMES.LIGHT;
}

/**
 * Gets the saved theme preference from localStorage
 * @returns {string} Saved theme or default 'system'
 */
function getSavedTheme() {
    if (typeof localStorage === 'undefined') {
        return THEMES.SYSTEM;
    }

    const saved = localStorage.getItem(STORAGE_KEY);
    return Object.values(THEMES).includes(saved) ? saved : THEMES.SYSTEM;
}

/**
 * Saves theme preference to localStorage
 * @param {string} theme - Theme to save
 */
function saveTheme(theme) {
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, theme);
    }
}

/**
 * Determines the effective theme to apply
 * @param {string} theme - User preference ('system', 'light', or 'dark')
 * @returns {string} Actual theme to apply ('light' or 'dark')
 */
function resolveEffectiveTheme(theme) {
    if (theme === THEMES.SYSTEM) {
        return getSystemTheme();
    }
    return theme;
}

/**
 * Determines appropriate theme based on page type and user preference
 * @returns {string} Theme to apply
 */
function determineTheme() {
    if (isAdminPage()) {
        // Admin pages always use dark theme (fixed)
        return THEMES.DARK;
    }

    // Main site pages use user preference
    const userPreference = getSavedTheme();
    return resolveEffectiveTheme(userPreference);
}

/**
 * Applies theme to document element
 */
function applyTheme(theme = null) {
    if (typeof document === 'undefined') {
        return;
    }

    const effectiveTheme = theme || determineTheme();

    // Always set the data-theme attribute for both admin and main site
    document.documentElement.setAttribute(THEME_ATTRIBUTE, effectiveTheme);

    // Dispatch custom event for other components to listen to
    const event = new CustomEvent('themechange', {
        detail: {
            theme: effectiveTheme,
            userPreference: isAdminPage() ? THEMES.DARK : getSavedTheme()
        }
    });
    document.dispatchEvent(event);
}

/**
 * Sets theme preference (main site only)
 * @param {string} theme - Theme preference to set
 */
function setTheme(theme) {
    if (isAdminPage()) {
        // Admin pages don't support theme switching
        console.warn('Theme switching is not supported on admin pages');
        return;
    }

    if (!Object.values(THEMES).includes(theme)) {
        console.warn(`Invalid theme: ${theme}`);
        return;
    }

    saveTheme(theme);
    const effectiveTheme = resolveEffectiveTheme(theme);
    applyTheme(effectiveTheme);
}

/**
 * Gets current active theme
 * @returns {string} Current effective theme ('light' or 'dark')
 */
function getCurrentTheme() {
    if (typeof document === 'undefined') {
        return determineTheme();
    }

    return document.documentElement.getAttribute(THEME_ATTRIBUTE) || determineTheme();
}

/**
 * Gets user's theme preference (main site only)
 * @returns {string} User preference ('system', 'light', or 'dark')
 */
function getThemePreference() {
    if (isAdminPage()) {
        return THEMES.DARK;
    }
    return getSavedTheme();
}

/**
 * Gets theme - for backward compatibility
 * @returns {string} Current effective theme
 */
function getTheme() {
    return getCurrentTheme();
}

/**
 * Initializes theme system
 * Should be called as early as possible to prevent flash of wrong theme
 */
function initializeTheme() {
    applyTheme();

    // Listen for system theme changes on main site pages
    if (!isAdminPage() && typeof window !== 'undefined' && window.matchMedia) {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        mediaQuery.addEventListener('change', () => {
            // Only apply if user preference is 'system'
            if (getSavedTheme() === THEMES.SYSTEM) {
                applyTheme();
            }
        });
    }
}

/**
 * Gets performance metrics for theme system
 * @returns {Object} Performance data
 */
function getPerformanceMetrics() {
    return {
        currentTheme: getCurrentTheme(),
        userPreference: getThemePreference(),
        isAdmin: isAdminPage(),
        systemTheme: getSystemTheme(),
        hasLocalStorage: typeof localStorage !== 'undefined',
        hasMatchMedia: typeof window !== 'undefined' && !!window.matchMedia
    };
}

// Auto-initialize on module load to prevent FOUT
// This runs synchronously when the script loads
if (typeof document !== 'undefined') {
    initializeTheme();
}

// Export API
export {
    THEMES,
    getTheme,
    getCurrentTheme,
    getThemePreference,
    setTheme,
    initializeTheme,
    isAdminPage,
    getPerformanceMetrics
};

// Default export for convenience
export default {
    THEMES,
    getTheme,
    getCurrentTheme,
    getThemePreference,
    setTheme,
    initializeTheme,
    isAdminPage,
    getPerformanceMetrics
};
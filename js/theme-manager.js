/**
 * Theme Manager
 * Handles theme detection, switching, and persistence across the application
 * 
 * Features:
 * - Auto-detects admin pages and applies dark theme
 * - Stores theme preference in localStorage
 * - Respects user's system preference as fallback
 * - Prevents flash of wrong theme content (FOUT)
 * - Provides programmatic theme switching API
 */

// Theme constants
const THEMES = {
  LIGHT: 'light',
  DARK: 'dark',
  AUTO: 'auto'
};

const STORAGE_KEY = 'theme-preference';
const THEME_ATTRIBUTE = 'data-theme';

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
 * Gets user's system theme preference
 * @returns {string} 'dark' or 'light'
 */
function getSystemTheme() {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? THEMES.DARK : THEMES.LIGHT;
  }
  return THEMES.LIGHT; // Default fallback
}

/**
 * Gets stored theme preference from localStorage
 * @returns {string|null} Stored theme or null if not set
 */
function getStoredTheme() {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(STORAGE_KEY);
  }
  return null;
}

/**
 * Stores theme preference in localStorage
 * @param {string} theme - Theme to store
 */
function storeTheme(theme) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, theme);
  }
}

/**
 * Applies theme to document element
 * Sets data-theme attribute for CSS targeting
 * @param {string} theme - Theme to apply ('light', 'dark', or 'auto')
 */
function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  
  let resolvedTheme = theme;
  
  // Resolve 'auto' theme to actual theme
  if (theme === THEMES.AUTO) {
    resolvedTheme = getSystemTheme();
  }
  
  // Auto-detect admin pages and force dark theme
  if (isAdminPage() && theme !== THEMES.LIGHT) {
    resolvedTheme = THEMES.DARK;
  }
  
  document.documentElement.setAttribute(THEME_ATTRIBUTE, resolvedTheme);
  
  // Dispatch custom event for other components to listen to
  const event = new CustomEvent('themechange', {
    detail: { theme: resolvedTheme, original: theme }
  });
  document.dispatchEvent(event);
}

/**
 * Gets current active theme
 * @returns {string} Current theme ('light' or 'dark')
 */
function getCurrentTheme() {
  if (typeof document === 'undefined') return THEMES.LIGHT;
  
  return document.documentElement.getAttribute(THEME_ATTRIBUTE) || THEMES.LIGHT;
}

/**
 * Gets theme preference (may be 'auto')
 * @returns {string} Theme preference ('light', 'dark', or 'auto')
 */
function getTheme() {
  const stored = getStoredTheme();
  if (stored && Object.values(THEMES).includes(stored)) {
    return stored;
  }
  
  // Auto-detect admin pages for default theme
  if (isAdminPage()) {
    return THEMES.DARK;
  }
  
  return THEMES.AUTO; // Default to auto (respects system preference)
}

/**
 * Sets theme preference and applies it
 * @param {string} theme - Theme to set ('light', 'dark', or 'auto')
 */
function setTheme(theme) {
  if (!Object.values(THEMES).includes(theme)) {
    console.warn(`Invalid theme: ${theme}. Using 'auto' instead.`);
    theme = THEMES.AUTO;
  }
  
  storeTheme(theme);
  applyTheme(theme);
}

/**
 * Toggles between light and dark themes
 * If currently on 'auto', switches to opposite of system preference
 */
function toggleTheme() {
  const current = getCurrentTheme();
  const newTheme = current === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK;
  setTheme(newTheme);
}

/**
 * Initializes theme system
 * Should be called as early as possible to prevent flash of wrong theme
 * Applies stored preference or detects appropriate theme
 */
function initializeTheme() {
  const theme = getTheme();
  applyTheme(theme);
  
  // Listen for system theme changes when using 'auto'
  if (typeof window !== 'undefined' && window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleSystemThemeChange = (e) => {
      const currentPreference = getStoredTheme();
      if (currentPreference === THEMES.AUTO || !currentPreference) {
        applyTheme(getTheme());
      }
    };
    
    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemThemeChange);
    } else {
      // Legacy browsers
      mediaQuery.addListener(handleSystemThemeChange);
    }
  }
}

// Auto-initialize on module load to prevent FOUT
// This runs synchronously when the script loads
if (typeof document !== 'undefined') {
  initializeTheme();
}

// Export API
export {
  THEMES,
  setTheme,
  getTheme,
  getCurrentTheme,
  toggleTheme,
  initializeTheme,
  isAdminPage
};

// Default export for convenience
export default {
  THEMES,
  setTheme,
  getTheme,
  getCurrentTheme,
  toggleTheme,
  initializeTheme,
  isAdminPage
};
/**
 * Theme Manager
 * Implements fixed theme approach - dark theme only for admin pages
 * 
 * Features:
 * - Auto-detects admin pages and applies dark theme
 * - Main site pages use light theme (no theme attribute or explicit light)
 * - No localStorage persistence - fixed themes only
 * - Prevents flash of wrong theme content (FOUT)
 */

// Theme constants
const THEMES = {
  LIGHT: 'light',
  DARK: 'dark'
};

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
 * Determines appropriate theme based on page type
 * Admin pages get dark theme, main site gets light theme
 * @returns {string} 'dark' for admin pages, 'light' for main site
 */
function determineTheme() {
  return isAdminPage() ? THEMES.DARK : THEMES.LIGHT;
}

/**
 * Applies theme to document element
 * Sets data-theme attribute only for admin pages (dark theme)
 * Main site pages get no attribute (or explicit light) for default styling
 */
function applyTheme() {
  if (typeof document === 'undefined') return;
  
  const theme = determineTheme();
  
  if (theme === THEMES.DARK) {
    // Admin pages: set data-theme="dark"
    document.documentElement.setAttribute(THEME_ATTRIBUTE, THEMES.DARK);
  } else {
    // Main site pages: remove theme attribute or set to light
    // This ensures default light mode styling is used
    document.documentElement.removeAttribute(THEME_ATTRIBUTE);
    // Alternative: explicitly set to light
    // document.documentElement.setAttribute(THEME_ATTRIBUTE, THEMES.LIGHT);
  }
  
  // Dispatch custom event for other components to listen to
  const event = new CustomEvent('themechange', {
    detail: { theme: theme }
  });
  document.dispatchEvent(event);
}

/**
 * Gets current active theme based on page type
 * @returns {string} Current theme ('light' or 'dark')
 */
function getCurrentTheme() {
  if (typeof document === 'undefined') return THEMES.LIGHT;
  
  return determineTheme();
}

/**
 * Gets theme based on page type (fixed themes only)
 * @returns {string} Theme ('light' or 'dark')
 */
function getTheme() {
  return determineTheme();
}

/**
 * Initializes theme system
 * Should be called as early as possible to prevent flash of wrong theme
 * Applies appropriate fixed theme based on page type
 */
function initializeTheme() {
  applyTheme();
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
  initializeTheme,
  isAdminPage
};

// Default export for convenience
export default {
  THEMES,
  getTheme,
  getCurrentTheme,
  initializeTheme,
  isAdminPage
};
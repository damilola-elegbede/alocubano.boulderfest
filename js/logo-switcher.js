/**
 * Logo Switcher
 * Automatically switches logo images based on theme changes
 * Works with images that have data-logo-light and data-logo-dark attributes
 */

/**
 * Updates a single logo image based on the current theme
 * @param {HTMLImageElement} img - The logo image element
 * @param {string} theme - Current theme ('light' or 'dark')
 */
function updateLogoImage(img, theme) {
    if (!img || !img.tagName || img.tagName.toLowerCase() !== 'img') {
        return;
    }

    const lightSrc = img.getAttribute('data-logo-light');
    const darkSrc = img.getAttribute('data-logo-dark');

    if (!lightSrc || !darkSrc) {
        // No theme-specific sources defined, skip this image
        return;
    }

    const targetSrc = theme === 'dark' ? darkSrc : lightSrc;

    // Only update if the source is different to avoid unnecessary requests
    if (img.src !== targetSrc && !img.src.endsWith(targetSrc)) {
        img.src = targetSrc;

        // Update alt text if available
        const baseAlt = img.getAttribute('data-alt-base') || img.alt;
        if (baseAlt) {
            const themeText = theme === 'dark' ? ' (Dark)' : '';
            img.alt = baseAlt + themeText;
        }
    }
}

/**
 * Updates all logo images on the page
 * @param {string} theme - Current theme ('light' or 'dark')
 */
function updateAllLogos(theme) {
    // Find all images with theme-specific logo data attributes
    const logoImages = document.querySelectorAll('img[data-logo-light][data-logo-dark]');

    logoImages.forEach(img => {
        updateLogoImage(img, theme);
    });
}

/**
 * Handles theme change events
 * @param {CustomEvent} event - Theme change event from theme-manager
 */
function handleThemeChange(event) {
    if (event && event.detail && event.detail.theme) {
        updateAllLogos(event.detail.theme);
    }
}

/**
 * Initializes the logo switcher
 * Sets up event listeners and performs initial logo update
 */
function initializeLogoSwitcher() {
    // Listen for theme changes
    document.addEventListener('themechange', handleThemeChange);

    // Get initial theme from document attribute or default to light
    const initialTheme = document.documentElement.getAttribute('data-theme') || 'light';
    updateAllLogos(initialTheme);

    // Also check for theme manager's current theme if available
    if (typeof getCurrentTheme === 'function') {
        try {
            const currentTheme = getCurrentTheme();
            updateAllLogos(currentTheme);
        } catch (error) {
            console.warn('Could not get current theme from theme manager:', error.message);
        }
    }
}

/**
 * Manual logo update function for external use
 * @param {string} theme - Theme to switch to ('light' or 'dark')
 */
function switchLogos(theme) {
    updateAllLogos(theme);
}

/**
 * Auto-initialize when DOM is ready
 */
function autoInitialize() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeLogoSwitcher);
    } else {
        initializeLogoSwitcher();
    }
}

// Initialize immediately if DOM is ready, otherwise wait
if (typeof document !== 'undefined') {
    autoInitialize();
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initializeLogoSwitcher,
        switchLogos,
        updateAllLogos,
        updateLogoImage
    };
}

// Global API for non-module usage
if (typeof window !== 'undefined') {
    window.LogoSwitcher = {
        initializeLogoSwitcher,
        switchLogos,
        updateAllLogos,
        updateLogoImage
    };
}
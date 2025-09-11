/**
 * Logo Switcher Module
 * Dynamically switches between light and dark logos based on theme
 * 
 * Features:
 * - Listens to theme change events from theme-manager.js
 * - Automatically detects and updates all logo images
 * - Supports data attributes for custom logo sources
 * - Handles initial page load theme detection
 * - Provides smooth transitions between logos
 * - Fallback support if dark logo is missing
 */

(function() {
    'use strict';

    // Configuration
    const DEFAULT_LIGHT_LOGO = '/images/logo.png';
    const DEFAULT_DARK_LOGO = '/images/logo-dark.png';
    const LOGO_SELECTOR = '.site-logo';
    const TRANSITION_DURATION = 200; // ms

    // Cache for performance
    let cachedLogos = null;
    let currentTheme = null;
    let darkLogoAvailable = true;

    /**
     * Get all logo images on the page
     * @returns {NodeList} Collection of logo elements
     */
    function getLogos() {
        if (!cachedLogos) {
            cachedLogos = document.querySelectorAll(LOGO_SELECTOR);
        }
        return cachedLogos;
    }

    /**
     * Clear cached logo references (useful for dynamic content)
     */
    function clearLogoCache() {
        cachedLogos = null;
    }

    /**
     * Check if dark logo exists (one-time check)
     * @returns {Promise<boolean>} Whether dark logo is available
     */
    async function checkDarkLogoAvailability() {
        if (!darkLogoAvailable) return false;
        
        try {
            const response = await fetch(DEFAULT_DARK_LOGO, { method: 'HEAD' });
            darkLogoAvailable = response.ok;
            return darkLogoAvailable;
        } catch (error) {
            console.warn('Dark logo not available:', error);
            darkLogoAvailable = false;
            return false;
        }
    }

    /**
     * Get the appropriate logo source for the current theme
     * @param {HTMLImageElement} logo - Logo element
     * @param {string} theme - Current theme ('light' or 'dark')
     * @returns {string} Logo source URL
     */
    function getLogoSource(logo, theme) {
        if (theme === 'dark' && darkLogoAvailable) {
            // Check for custom dark logo
            const customDarkSrc = logo.dataset.darkSrc;
            if (customDarkSrc) return customDarkSrc;
            
            // Use default dark logo
            return DEFAULT_DARK_LOGO;
        } else {
            // Check for custom light logo
            const customLightSrc = logo.dataset.lightSrc;
            if (customLightSrc) return customLightSrc;
            
            // Use default light logo or current src
            return logo.dataset.originalSrc || DEFAULT_LIGHT_LOGO;
        }
    }

    /**
     * Switch logo with smooth transition
     * @param {HTMLImageElement} logo - Logo element to update
     * @param {string} newSrc - New source URL
     */
    function switchLogo(logo, newSrc) {
        // Normalize URLs for comparison
        const currentUrl = new URL(logo.src, window.location.origin).pathname;
        const newUrl = new URL(newSrc, window.location.origin).pathname;
        if (currentUrl === newUrl) {
            return;
        }

        // Store original source if not already stored
        if (!logo.dataset.originalSrc && !logo.src.includes('logo-dark')) {
            logo.dataset.originalSrc = logo.src;
        }

        // Preload new image
        const tempImg = new Image();
        tempImg.onload = function() {
            // Apply transition
            logo.style.transition = `opacity ${TRANSITION_DURATION}ms ease-in-out`;
            logo.style.opacity = '0';
            
            setTimeout(() => {
                logo.src = newSrc;
                logo.style.opacity = '1';
                
                // Clean up transition after completion
                setTimeout(() => {
                    logo.style.transition = '';
                }, TRANSITION_DURATION);
            }, TRANSITION_DURATION / 2);
        };
        
        // Start loading
        tempImg.src = newSrc;
    }

    /**
     * Update all logos based on current theme
     * @param {string} theme - Theme to apply ('light' or 'dark')
     */
    function updateLogos(theme) {
        const logos = getLogos();
        
        if (logos.length === 0) {
            return;
        }

        currentTheme = theme;
        
        logos.forEach(logo => {
            const newSrc = getLogoSource(logo, theme);
            switchLogo(logo, newSrc);
        });
    }

    /**
     * Get current theme from document
     * @returns {string} Current theme ('light' or 'dark')
     */
    function getCurrentTheme() {
        const theme = document.documentElement.getAttribute('data-theme');
        return theme || 'light';
    }

    /**
     * Initialize logo switcher
     */
    async function initialize() {
        // Check dark logo availability once
        await checkDarkLogoAvailability();
        
        // Set initial logos based on current theme
        const initialTheme = getCurrentTheme();
        updateLogos(initialTheme);
        
        // Listen for theme changes
        document.addEventListener('themechange', (event) => {
            const newTheme = event.detail.theme;
            if (newTheme !== currentTheme) {
                updateLogos(newTheme);
            }
        });
        
        // Listen for DOM changes (for dynamically added logos)
        const observer = new MutationObserver((mutations) => {
            let logosAdded = false;
            
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // Element node
                        if (node.matches && node.matches(LOGO_SELECTOR)) {
                            logosAdded = true;
                        } else if (node.querySelector && node.querySelector(LOGO_SELECTOR)) {
                            logosAdded = true;
                        }
                    }
                });
            });
            
            if (logosAdded) {
                clearLogoCache();
                updateLogos(currentTheme);
            }
        });
        
        // Start observing
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        // DOM already loaded
        initialize();
    }

    // Export for debugging
    if (typeof window !== 'undefined') {
        window.logoSwitcher = {
            updateLogos,
            getCurrentTheme,
            getLogos,
            clearLogoCache,
            checkDarkLogoAvailability
        };
    }
})();
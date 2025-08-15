/**
 * Critical Resource Prefetch Module
 *
 * Handles preloading of critical resources for improved Core Web Vitals.
 * This module was extracted from inline scripts to reduce code duplication
 * and improve parsing performance.
 */

/**
 * Critical Resource Prefetcher Class
 *
 * Encapsulates prefetch configuration and methods for preloading critical resources.
 * Supports both static hero images and gallery data prefetching with intelligent URL validation.
 */
class CriticalResourcePrefetcher {
    /**
   * Default configuration for prefetch operations
   */
    static get DEFAULT_CONFIG() {
        return {
            heroImageBase: '/images/hero',
            galleryDataApi: '/api/gallery',
            defaultGalleryParams: {
                category: 'workshops'
            }
        };
    }

    /**
   * Page-specific hero image mapping
   */
    static get HERO_IMAGES() {
        return {
            home: '/images/hero/home.jpg',
            about: '/images/hero/about.jpg',
            artists: '/images/hero/boulder-fest-2026-hero.jpg',
            schedule: '/images/hero/boulder-fest-2025-hero.jpg',
            gallery: '/images/hero/weekender-2026-09-hero.jpg',
            'gallery-2025': '/images/hero/gallery-2025.jpg',
            tickets: '/images/hero/tickets.jpg',
            donations: '/images/hero/donations.jpg',
            contact: '/images/hero/contact.jpg',
            default: '/images/hero/hero-default.jpg'
        };
    }

    /**
   * Initialize prefetcher with optional custom configuration
   * @param {Object} config - Custom configuration to override defaults
   */
    constructor(config = {}) {
        this.config = { ...CriticalResourcePrefetcher.DEFAULT_CONFIG, ...config };
    }

    /**
   * Validate URL before creating preload link
   * @param {string} url - URL to validate
   * @returns {boolean} - Whether URL is valid
   */
    isValidUrl(url) {
        try {
            new URL(url, window.location.origin);
            return true;
        } catch {
            return false;
        }
    }

    /**
   * Extract page identifier from current location
   * @returns {string} - Cleaned page identifier
   */
    getCurrentPageId() {
        const rawPageId = window.location.pathname.split('/').pop() || 'home';
        return rawPageId.replace(/\.html$/, '');
    }

    /**
   * Get static hero image path for page
   * @param {string} pageId - Page identifier
   * @returns {string} - Static hero image path
   */
    getHeroImagePath(pageId) {
        return (
            CriticalResourcePrefetcher.HERO_IMAGES[pageId] ||
      CriticalResourcePrefetcher.HERO_IMAGES['default']
        );
    }

    /**
   * Extract year from gallery page ID using regex
   * @param {string} pageId - Page identifier
   * @returns {string|null} - Extracted year or null if not found
   */
    extractYearFromPageId(pageId) {
        const yearMatch = pageId.match(/gallery[.-]?(\d{4})/);
        return yearMatch ? yearMatch[1] : null;
    }

    /**
   * Create and append preload link element to document head
   * @param {Object} options - Preload link options
   * @param {string} options.href - URL to preload
   * @param {string} options.as - Resource type (image, fetch, etc.)
   * @param {string} [options.fetchPriority] - Fetch priority hint
   * @param {boolean} [options.crossOrigin] - Enable CORS
   */
    createPreloadLink({ href, as, fetchPriority, crossOrigin = false }) {
        const preloadElement = document.createElement('link');
        preloadElement.rel = 'preload';
        preloadElement.as = as;
        preloadElement.href = href;

        if (crossOrigin) {
            preloadElement.crossOrigin = 'anonymous';
            preloadElement.setAttribute('crossorigin', 'anonymous');
        }

        if (fetchPriority) {
            preloadElement.fetchPriority = fetchPriority;
        }

        document.head.appendChild(preloadElement);
    }

    /**
   * Preload static hero image for current page
   */
    preloadHeroImage() {
        const pageId = this.getCurrentPageId();

        // Get static hero image path
        const heroUrl = this.getHeroImagePath(pageId);

        // Validate URL before creating preload
        if (!this.isValidUrl(heroUrl)) {
            return false;
        }

        this.createPreloadLink({
            href: heroUrl,
            as: 'image',
            fetchPriority: 'high',
            crossOrigin: false // Static images don't need CORS
        });

        return true;
    }

    /**
   * Preload gallery data for gallery pages
   */
    preloadGalleryData() {
        const pageId = this.getCurrentPageId();

        if (!pageId.includes('gallery')) {
            return false;
        }

        // Extract year using regex pattern
        const extractedYear = this.extractYearFromPageId(pageId);

        // Skip prefetching for gallery index page (no specific year)
        if (pageId === 'gallery') {
            return false;
        }

        // Use extracted year or fall back to current year for generic pages
        const year = extractedYear || new Date().getFullYear();

        // Build gallery data URL with configurable endpoint
        const params = new URLSearchParams({
            year: year,
            category: this.config.defaultGalleryParams.category
        });
        const galleryUrl = this.config.galleryDataApi + '?' + params.toString();

        // Validate URL before creating preload
        if (!this.isValidUrl(galleryUrl)) {
            return false;
        }

        this.createPreloadLink({
            href: galleryUrl,
            as: 'fetch',
            crossOrigin: true // API calls need CORS
        });

        return true;
    }

    /**
   * Initialize critical resource preloading
   * @returns {Object} - Results of prefetch operations
   */
    initialize() {
        const results = {
            heroImage: false,
            galleryData: false,
            errors: []
        };

        try {
            results.heroImage = this.preloadHeroImage();
        } catch (error) {
            results.errors.push({ type: 'heroImage', error });
        }

        try {
            results.galleryData = this.preloadGalleryData();
        } catch (error) {
            results.errors.push({ type: 'galleryData', error });
        }

        return results;
    }

    /**
   * Static factory method for immediate initialization
   * @param {Object} config - Optional custom configuration
   * @returns {CriticalResourcePrefetcher} - Initialized prefetcher instance
   */
    static createAndInitialize(config = {}) {
        const prefetcher = new CriticalResourcePrefetcher(config);
        const results = prefetcher.initialize();

        // Attach results to instance for debugging
        prefetcher.lastResults = results;

        return prefetcher;
    }
}

// Execute immediately for critical path optimization
// Use IIFE to maintain existing behavior while using the new class
(function() {
    'use strict';

    // Create and initialize prefetcher with default configuration
    const prefetcher = CriticalResourcePrefetcher.createAndInitialize();

    // Make prefetcher globally available for debugging and advanced usage
    if (typeof window !== 'undefined') {
        window.CriticalResourcePrefetcher = CriticalResourcePrefetcher;
        window.prefetcher = prefetcher;
    }
})();

// Export for module usage (ES6 modules, CommonJS, etc.)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CriticalResourcePrefetcher;
} else if (typeof exports !== 'undefined') {
    exports.CriticalResourcePrefetcher = CriticalResourcePrefetcher;
}

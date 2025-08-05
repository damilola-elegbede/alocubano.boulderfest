// Image Cache Manager - Session-scoped caching with format-aware optimization (v3)
console.log('📦 ImageCacheManager v3 loading...');

class ImageCacheManager {
    constructor() {
        this.cacheKey = 'alocubano_image_cache_v3';
        this.imageCacheKey = 'alocubano_image_data_cache_v3';
        this.defaultImageUrl = '/images/hero-default.jpg';
        this.pageMapping = {
            '/': 'home',
            '/home': 'home',
            'index.html': 'home',
            'home.html': 'home',
            '/about': 'about',
            'about.html': 'about',
            '/artists': 'artists',
            'artists.html': 'artists',
            '/schedule': 'schedule',
            'schedule.html': 'schedule',
            '/gallery': 'gallery',
            'gallery.html': 'gallery',
            '/tickets': 'tickets',
            'tickets.html': 'tickets',
            '/donations': 'donations',
            'donations.html': 'donations'
        };
        this.sessionAssignments = null;
        this.imageDataCache = this.loadImageDataCache();
        this.lastApiCall = 0;
        this.minApiInterval = 2000; // Minimum 2 seconds between API calls

        // Format-aware caching defaults
        this.defaultFormat = 'webp';
        this.fallbackFormat = 'jpeg';
        this.supportedFormats = ['webp', 'jpeg', 'png'];
        this.defaultWidth = 800;
        this.supportedWidths = [400, 600, 800, 1200, 1600];
    }

    loadImageDataCache() {
        try {
            const cached = localStorage.getItem(this.imageCacheKey);
            return cached ? JSON.parse(cached) : {};
        } catch (error) {
            console.warn('Failed to load image data cache:', error);
            return {};
        }
    }

    saveImageDataCache() {
        try {
            localStorage.setItem(
                this.imageCacheKey,
                JSON.stringify(this.imageDataCache)
            );
        } catch (error) {
            console.warn('Failed to save image data cache:', error);
        }
    }

    /**
   * Generate a cache key that includes format and width parameters
   * @param {string} fileId - The Google Drive file ID
   * @param {Object} options - Image options
   * @param {string} options.format - Image format (webp, jpeg, png)
   * @param {number} options.width - Image width
   * @param {string} options.quality - Image quality (optional)
   * @returns {string} Cache key for the specific image variant
   */
    getCacheKey(fileId, options = {}) {
        const format = options.format || this.defaultFormat;
        const width = options.width || this.defaultWidth;
        const quality = options.quality || '85';

        return `${fileId}_${format}_${width}_q${quality}`;
    }

    /**
   * Generate image URL with format and width parameters
   * @param {string} fileId - The Google Drive file ID
   * @param {Object} options - Image options
   * @param {string} options.format - Image format (webp, jpeg, png)
   * @param {number} options.width - Image width
   * @param {string} options.quality - Image quality (default: '85')
   * @param {string} options.cache - Cache duration (default: '24h')
   * @returns {string} Complete image URL with query parameters
   */
    getImageUrl(fileId, options = {}) {
        let format = options.format || this.defaultFormat;
        let width = options.width || this.defaultWidth;
        const quality = options.quality || '85';
        const cache = options.cache || '24h';

        // Validate format
        if (!this.supportedFormats.includes(format)) {
            console.warn(
                `Unsupported format '${format}', falling back to ${this.fallbackFormat}`
            );
            format = this.fallbackFormat;
        }

        // Validate width
        if (!this.supportedWidths.includes(width)) {
            const closestWidth = this.supportedWidths.reduce((prev, curr) =>
                Math.abs(curr - width) < Math.abs(prev - width) ? curr : prev
            );
            console.warn(
                `Unsupported width '${width}', using closest width ${closestWidth}`
            );
            width = closestWidth;
        }

        const params = new URLSearchParams({
            format,
            width: width.toString(),
            quality,
            cache
        });

        return `/api/image-proxy/${fileId}?${params.toString()}`;
    }

    /**
   * Check if a specific image variant is cached
   * @param {string} fileId - The Google Drive file ID
   * @param {Object} options - Image options for cache key generation
   * @returns {boolean} Whether the image variant is cached and valid
   */
    isImageVariantCached(fileId, options = {}) {
        const cacheKey = this.getCacheKey(fileId, options);
        const cached = this.imageDataCache[cacheKey];

        if (!cached) {
            return false;
        }

        // Check if cache is less than 24 hours old
        const now = Date.now();
        const cacheAge = now - (cached.timestamp || 0);
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        return cacheAge < maxAge;
    }

    /**
   * Cache an image variant with specific format and width
   * @param {string} fileId - The Google Drive file ID
   * @param {string} url - The image URL
   * @param {Object} options - Image options
   * @param {string} name - Image name for logging
   */
    cacheImageVariant(fileId, url, options = {}, name = 'Unknown') {
        const cacheKey = this.getCacheKey(fileId, options);

        this.imageDataCache[cacheKey] = {
            url: url,
            name: name,
            format: options.format || this.defaultFormat,
            width: options.width || this.defaultWidth,
            quality: options.quality || '85',
            timestamp: Date.now()
        };

        this.saveImageDataCache();
        console.log(
            `📦 Cached image variant: ${name} (${options.format || this.defaultFormat}, ${options.width || this.defaultWidth}px)`
        );
    }

    /**
   * Get cached image variant data
   * @param {string} fileId - The Google Drive file ID
   * @param {Object} options - Image options for cache key generation
   * @returns {Object|null} Cached image data or null if not found
   */
    getCachedImageVariant(fileId, options = {}) {
        const cacheKey = this.getCacheKey(fileId, options);
        return this.imageDataCache[cacheKey] || null;
    }

    isImageCached(fileId) {
        const cached = this.imageDataCache[fileId];
        if (!cached) {
            return false;
        }

        // Check if cache is less than 24 hours old
        const now = Date.now();
        const cacheAge = now - (cached.timestamp || 0);
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        return cacheAge < maxAge;
    }

    async rateLimitedApiCall(fileId, options = {}) {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastApiCall;

        if (timeSinceLastCall < this.minApiInterval) {
            const waitTime = this.minApiInterval - timeSinceLastCall;
            console.log(`⏳ Rate limiting: waiting ${waitTime}ms before API call`);
            await new Promise((resolve) => setTimeout(resolve, waitTime));
        }

        this.lastApiCall = Date.now();

        // Use new format-aware URL generation if options are provided
        if (options.format || options.width) {
            return this.getImageUrl(fileId, options);
        }

        // Fallback to legacy URL for backward compatibility
        return `/api/image-proxy/${fileId}?size=medium&quality=85&cache=24h`;
    }

    getCurrentPageId() {
        const pathname = window.location.pathname;
        console.log('🔍 Detecting page from pathname:', pathname);

        // Handle root path and clean URLs
        if (pathname === '/' || pathname === '') {
            console.log('📍 Detected: home (root path)');
            return 'home';
        }

        // Extract filename from path
        const filename = pathname.split('/').pop() || 'index.html';
        console.log('📄 Extracted filename:', filename);

        // Check if filename contains .html
        if (filename.includes('.html')) {
            const pageId = this.pageMapping[filename] || 'default';
            console.log(`📍 Detected: ${pageId} (from ${filename})`);
            return pageId;
        }

        // Check full pathname mapping
        const pageId =
      this.pageMapping[pathname] || this.pageMapping[filename] || 'default';
        console.log(`📍 Detected: ${pageId} (from pathname mapping)`);
        return pageId;
    }

    /**
   * Get optimized image for current page with format and width options
   * @param {Object} options - Image optimization options
   * @param {string} options.format - Image format (webp, jpeg, png)
   * @param {number} options.width - Image width
   * @param {string} options.quality - Image quality
   * @returns {Promise<Object>} Image data with optimized URL
   */
    async getOptimizedImageForPage(options = {}) {
        const pageId = this.getCurrentPageId();

        // 1. Ensure session assignments are loaded
        await this.ensureSessionAssignments();

        // 2. Get the assigned image for the current page
        const assignedImage = this.sessionAssignments[pageId];
        if (!assignedImage) {
            console.log(`📷 No assigned image for ${pageId}, using default`);
            return {
                id: null,
                url: this.defaultImageUrl,
                format: 'jpeg',
                width: null
            };
        }

        const fileId = assignedImage.id;

        // 3. Check if the specific variant is cached
        if (this.isImageVariantCached(fileId, options)) {
            const cachedData = this.getCachedImageVariant(fileId, options);
            console.log(
                `📦 Using cached optimized image for ${pageId}:`,
                assignedImage.name,
                `(${cachedData.format}, ${cachedData.width}px)`
            );
            return {
                id: fileId,
                url: cachedData.url,
                name: assignedImage.name,
                format: cachedData.format,
                width: cachedData.width,
                cached: true
            };
        }

        // 4. Generate new optimized URL and cache it
        console.log(
            `🔄 Generating optimized image for ${pageId}:`,
            assignedImage.name,
            `(${options.format || this.defaultFormat}, ${options.width || this.defaultWidth}px)`
        );

        const url = await this.rateLimitedApiCall(fileId, options);
        this.cacheImageVariant(fileId, url, options, assignedImage.name);

        console.log(
            `🖼️ New optimized image assigned for ${pageId}:`,
            assignedImage.name
        );
        return {
            id: fileId,
            url: url,
            name: assignedImage.name,
            format: options.format || this.defaultFormat,
            width: options.width || this.defaultWidth,
            cached: false
        };
    }

    /**
   * Ensure session assignments are loaded (extracted for reuse)
   */
    async ensureSessionAssignments() {
        if (this.sessionAssignments) {
            return;
        }

        try {
            // Check sessionStorage first
            const cachedAssignments = sessionStorage.getItem(this.cacheKey);
            if (cachedAssignments) {
                this.sessionAssignments = JSON.parse(cachedAssignments);
                console.log('📦 Using cached session assignments');
                return;
            }

            // If no session cache, fetch static JSON and create assignments
            console.log('No session cache. Fetching static featured photos list...');
            const response = await fetch('/featured-photos.json');
            if (!response.ok) {
                throw new Error('Failed to load featured-photos.json');
            }
            const data = await response.json();

            if (!data.items || data.items.length === 0) {
                throw new Error('No images found in featured photos');
            }

            this.sessionAssignments = this.createRandomAssignments(data.items);
            sessionStorage.setItem(
                this.cacheKey,
                JSON.stringify(this.sessionAssignments)
            );
            console.log('Created and cached new session assignments.');
        } catch (error) {
            console.error('Failed to get hero image assignments:', error);
            throw error;
        }
    }

    // Legacy method - maintained for backward compatibility
    async getImageForPage() {
        const pageId = this.getCurrentPageId();

        try {
            // 1. Ensure session assignments are loaded
            await this.ensureSessionAssignments();

            // 2. Return the assigned image ID for the current page
            const assignedImage = this.sessionAssignments[pageId];
            if (assignedImage) {
                const fileId = assignedImage.id;

                // Check if legacy image data is already cached locally
                if (this.isImageCached(fileId)) {
                    const cachedData = this.imageDataCache[fileId];
                    console.log(
                        `📦 Using cached legacy image for ${pageId}:`,
                        assignedImage.name
                    );
                    return {
                        id: fileId,
                        url: cachedData.url,
                        name: assignedImage.name,
                        cached: true
                    };
                }

                // If not cached, prepare API call with rate limiting (legacy format)
                console.log(
                    `🔄 Legacy image not cached for ${pageId}, will make API call:`,
                    assignedImage.name
                );
                const url = await this.rateLimitedApiCall(fileId);

                // Cache the URL for future use (legacy format)
                this.imageDataCache[fileId] = {
                    url: url,
                    name: assignedImage.name,
                    timestamp: Date.now()
                };
                this.saveImageDataCache();

                console.log(
                    `🖼️ New legacy image assigned for ${pageId}:`,
                    assignedImage.name
                );
                return {
                    id: fileId,
                    url: url,
                    name: assignedImage.name,
                    cached: false
                };
            }

            console.log(`📷 No assigned image for ${pageId}, using default`);
            return { id: null, url: this.defaultImageUrl }; // Fallback
        } catch (error) {
            console.error('Failed to get hero image assignments:', error);
            return { id: null, url: this.defaultImageUrl }; // Fallback to default
        }
    }

    createRandomAssignments(imagePool) {
        const assignments = {};
        const pages = Object.values(this.pageMapping);
        const shuffledImages = [...imagePool].sort(() => Math.random() - 0.5);

        pages.forEach((pageId, index) => {
            if (shuffledImages.length > 0) {
                assignments[pageId] = shuffledImages[index % shuffledImages.length];
            }
        });
        return assignments;
    }

    /**
   * Utility method to detect WebP support in the browser
   * @returns {Promise<boolean>} Whether WebP is supported
   */
    async supportsWebP() {
        return new Promise((resolve) => {
            const webP = new Image();
            webP.onload = webP.onerror = () => resolve(webP.height === 2);
            webP.src =
        'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoBAAEALmkwlpYAGiAAgAQAALmkwlpYAGiAAgAQAA==';
        });
    }

    /**
   * Get the best supported format for the current browser
   * @returns {Promise<string>} Best supported format
   */
    async getBestFormat() {
        const supportsWebP = await this.supportsWebP();
        return supportsWebP ? 'webp' : this.fallbackFormat;
    }

    /**
   * Clear all cached image variants (useful for debugging or clearing storage)
   */
    clearCache() {
        this.imageDataCache = {};
        this.sessionAssignments = null;

        try {
            localStorage.removeItem(this.imageCacheKey);
            sessionStorage.removeItem(this.cacheKey);
            console.log('🗑️ Image cache cleared successfully');
        } catch (error) {
            console.warn('Failed to clear cache:', error);
        }
    }

    /**
   * Get cache statistics for debugging
   * @returns {Object} Cache statistics
   */
    getCacheStats() {
        const totalEntries = Object.keys(this.imageDataCache).length;
        const variantEntries = Object.keys(this.imageDataCache).filter((key) =>
            key.includes('_')
        ).length;
        const legacyEntries = totalEntries - variantEntries;

        const cacheSize = JSON.stringify(this.imageDataCache).length;
        const sessionSize = JSON.stringify(this.sessionAssignments || {}).length;

        return {
            totalEntries,
            variantEntries,
            legacyEntries,
            cacheSize: `${(cacheSize / 1024).toFixed(2)} KB`,
            sessionSize: `${(sessionSize / 1024).toFixed(2)} KB`,
            supportedFormats: this.supportedFormats,
            supportedWidths: this.supportedWidths,
            defaultFormat: this.defaultFormat,
            defaultWidth: this.defaultWidth
        };
    }
}

// Create global instance
window.ImageCacheManager = new ImageCacheManager();
console.log(
    '🚀 ImageCacheManager v3 initialized with format-aware caching support'
);

// Image Cache Manager - Session-scoped caching for Captured Moments gallery
console.log('📦 ImageCacheManager module loading... DOM state:', document.readyState);

class ImageCacheManager {
    constructor() {
        this.cacheKey = 'alocubano_image_cache_v1';
        this.defaultImageUrl = '/images/hero-default.jpg';
        this.pageMapping = {
            'home.html': 'home',
            'about.html': 'about', 
            'artists.html': 'artists',
            'schedule.html': 'schedule',
            'gallery.html': 'gallery',
            'tickets.html': 'tickets',
            'donations.html': 'donations'
        };
        this.loadingStates = {
            UNINITIALIZED: 'uninitialized',
            FETCHING: 'fetching',
            ASSIGNING: 'assigning', 
            PRELOADING: 'preloading',
            READY: 'ready',
            ERROR: 'error'
        };
        this.preloadedImages = new Set();
        this.init();
    }

    init() {
        // Check if sessionStorage is supported
        this.storageSupported = this.checkStorageSupport();
        
        if (!this.storageSupported) {
            console.warn('SessionStorage not supported, falling back to non-cached behavior');
        }
    }

    checkStorageSupport() {
        try {
            const test = '__storage_test__';
            sessionStorage.setItem(test, test);
            sessionStorage.removeItem(test);
            return true;
        } catch (error) {
            return false;
        }
    }

    getCurrentPageId() {
        // Extract page from current URL
        const path = window.location.pathname;
        const filename = path.split('/').pop();
        
        console.log('getCurrentPageId - path:', path, 'filename:', filename);
        
        // Map filename to page ID
        const pageId = this.pageMapping[filename] || 'default';
        console.log('getCurrentPageId - mapped to:', pageId);
        
        return pageId;
    }

    getCacheData() {
        if (!this.storageSupported) return null;

        try {
            const cached = sessionStorage.getItem(this.cacheKey);
            if (!cached) return null;

            const data = JSON.parse(cached);
            
            // Validate cache structure
            if (!data.imagePool || !data.pageAssignments || !data.timestamp) {
                this.clearCache();
                return null;
            }

            return data;
        } catch (error) {
            console.error('Error reading cache:', error);
            this.clearCache();
            return null;
        }
    }

    setLoadingState(state, progress = 0, message = '') {
        if (!this.storageSupported) return;

        try {
            const cacheData = this.getCacheData() || {
                imagePool: [],
                pageAssignments: {},
                preloadedImages: {},
                timestamp: Date.now(),
                defaultImageUrl: this.defaultImageUrl
            };

            cacheData.state = state;
            cacheData.loadingProgress = Math.max(0, Math.min(100, progress));
            cacheData.loadingMessage = message;

            sessionStorage.setItem(this.cacheKey, JSON.stringify(cacheData));
            
            // Do NOT update loading UI - we never show loading animations
            console.log('Background state:', state, progress + '%', message);
        } catch (error) {
            console.error('Error setting loading state:', error);
        }
    }

    setCacheData(imagePool, pageAssignments) {
        if (!this.storageSupported) return false;

        try {
            const cacheData = {
                state: this.loadingStates.READY,
                imagePool: imagePool,
                pageAssignments: pageAssignments,
                preloadedImages: {},
                loadingProgress: 100,
                loadingMessage: 'Gallery ready',
                timestamp: Date.now(),
                defaultImageUrl: this.defaultImageUrl
            };

            sessionStorage.setItem(this.cacheKey, JSON.stringify(cacheData));
            console.log('Cache updated with', Object.keys(pageAssignments).length, 'page assignments');
            return true;
        } catch (error) {
            console.error('Error writing cache:', error);
            return false;
        }
    }

    clearCache() {
        if (!this.storageSupported) return;

        try {
            sessionStorage.removeItem(this.cacheKey);
            console.log('Cache cleared');
        } catch (error) {
            console.error('Error clearing cache:', error);
        }
    }

    async initializeSessionBackground() {
        console.log('Initializing session cache in background (silent)...');
        this.setLoadingState(this.loadingStates.FETCHING, 10, 'Fetching gallery images...');
        
        try {
            // Fetch all images from the Captured_Moments folder
            const response = await fetch('/api/featured-photos', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                signal: AbortSignal.timeout(10000)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            this.setLoadingState(this.loadingStates.ASSIGNING, 30, 'Creating page assignments...');
            const data = await response.json();
            
            if (!data.items || data.items.length === 0) {
                console.warn('No images found in Captured_Moments folder');
                this.setLoadingState(this.loadingStates.ERROR, 0, 'No images found');
                return false;
            }

            // Validate image data structure
            const validImages = data.items.filter(item => item && item.id && item.name);
            if (validImages.length === 0) {
                console.warn('No valid images found in response');
                this.setLoadingState(this.loadingStates.ERROR, 0, 'No valid images');
                return false;
            }

            // Create random assignments for each page
            const pageAssignments = this.createRandomAssignments(validImages);
            
            this.setLoadingState(this.loadingStates.PRELOADING, 50, 'Loading images...');
            
            // Cache the results
            const cacheSuccess = this.setCacheData(validImages, pageAssignments);
            if (!cacheSuccess) {
                console.warn('Failed to save cache, but proceeding with preloading');
            }
            
            // Start preloading images in background
            await this.preloadAllAssignedImages(pageAssignments);
            
            this.setLoadingState(this.loadingStates.READY, 100, 'Gallery ready');
            console.log('Background session initialized with', validImages.length, 'images');
            
            // Notify that cache is ready for image upgrades
            this.notifyReady();
            
            return true;

        } catch (error) {
            this.setLoadingState(this.loadingStates.ERROR, 0, 'Background process failed');
            if (error.name === 'TimeoutError') {
                console.error('Background API request timed out after 10 seconds');
            } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
                console.error('Background network error during API request:', error.message);
            } else {
                console.error('Background process failed to initialize session cache:', error);
            }
            return false;
        }
    }

    async preloadImage(imageData) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                this.markImageAsPreloaded(imageData.id);
                console.log('Preloaded image:', imageData.name);
                resolve(true);
            };
            img.onerror = () => {
                console.warn('Failed to preload image:', imageData.name);
                resolve(false);
            };
            img.src = `/api/image-proxy/${imageData.id}`;
        });
    }

    async preloadAllAssignedImages(pageAssignments) {
        const images = Object.values(pageAssignments);
        const totalImages = images.length;
        let loadedCount = 0;

        const preloadPromises = images.map(async (imageData) => {
            const success = await this.preloadImage(imageData);
            loadedCount++;
            const progress = 50 + (loadedCount / totalImages) * 40; // 50-90% range
            this.setLoadingState(this.loadingStates.PRELOADING, progress, `Background loading: (${loadedCount}/${totalImages})`);
            
            // Trigger page upgrade if this image just became available
            if (success) {
                this.triggerPageUpgrade(imageData);
            }
            
            return success;
        });

        await Promise.all(preloadPromises);
        console.log(`Background preloaded ${loadedCount}/${totalImages} images`);
    }

    triggerPageUpgrade(imageData) {
        // Find which page this image is assigned to
        const cacheData = this.getCacheData();
        if (!cacheData) return;

        for (const [pageId, assignedImage] of Object.entries(cacheData.pageAssignments)) {
            if (assignedImage.id === imageData.id) {
                console.log('Image ready for page upgrade:', pageId, imageData.name);
                
                // Dispatch custom event for page upgrade
                const event = new CustomEvent('imageReadyForPage', {
                    detail: { pageId, imageData: assignedImage }
                });
                document.dispatchEvent(event);
                break;
            }
        }
    }

    isImagePreloaded(imageId) {
        // Check sessionStorage first for persistence across page loads
        const cacheData = this.getCacheData();
        if (cacheData && cacheData.preloadedImages && cacheData.preloadedImages[imageId]) {
            return true;
        }
        
        // Fallback to memory set (for current page session)
        return this.preloadedImages.has(imageId);
    }

    markImageAsPreloaded(imageId) {
        // Mark in memory
        this.preloadedImages.add(imageId);
        
        // Mark in sessionStorage for persistence
        if (!this.storageSupported) return;
        
        try {
            const cacheData = this.getCacheData();
            if (cacheData) {
                if (!cacheData.preloadedImages) {
                    cacheData.preloadedImages = {};
                }
                cacheData.preloadedImages[imageId] = true;
                sessionStorage.setItem(this.cacheKey, JSON.stringify(cacheData));
            }
        } catch (error) {
            console.error('Error marking image as preloaded:', error);
        }
    }

    createRandomAssignments(imagePool) {
        const assignments = {};
        const pages = Object.values(this.pageMapping);
        
        // Create a shuffled copy of the image pool
        const shuffledImages = [...imagePool].sort(() => Math.random() - 0.5);
        
        // Assign one unique image per page (cycling through if more pages than images)
        pages.forEach((pageId, index) => {
            const imageIndex = index % shuffledImages.length;
            assignments[pageId] = shuffledImages[imageIndex];
        });

        console.log('Created assignments for pages:', Object.keys(assignments));
        return assignments;
    }

    getImageForPageImmediate(pageId = null) {
        // Use current page if no pageId provided
        if (!pageId) {
            pageId = this.getCurrentPageId();
        }

        console.log('Getting immediate image for page:', pageId);

        // First check: Is assigned image cached?
        const cacheData = this.getCacheData();
        console.log('Cache data:', cacheData ? 'exists' : 'null');
        if (cacheData && cacheData.pageAssignments) {
            console.log('Available page assignments:', Object.keys(cacheData.pageAssignments));
            console.log('Looking for pageId:', pageId);
            
            if (cacheData.pageAssignments[pageId]) {
                const assignedImage = cacheData.pageAssignments[pageId];
                console.log('Found assignment for', pageId, ':', assignedImage.name);
                
                // Return assigned image regardless of preload status
                // Browser will load it if not already cached
                console.log('Cache HIT: Using assigned image for', pageId, ':', assignedImage.name);
                return {
                    id: assignedImage.id,
                    name: assignedImage.name,
                    url: `/api/image-proxy/${assignedImage.id}`,
                    isDefault: false,
                    isAssigned: true
                };
            } else {
                console.log('No assignment found for pageId:', pageId);
            }
        } else {
            console.log('No cache data or page assignments available');
        }

        // Cache miss: Return default image
        console.log('Cache MISS: Using default image for', pageId);
        
        // Start background process only once per session
        if (!this.hasBackgroundProcessStarted()) {
            console.log('Starting background process (first cache miss)');
            this.markBackgroundProcessStarted();
            this.initializeSessionBackground();
        }

        return {
            id: 'default',
            name: 'Default Hero Image',
            url: this.defaultImageUrl,
            isDefault: true,
            isAssigned: false
        };
    }

    async getImageForPage(pageId = null) {
        // This method now just calls getImageForPageImmediate
        // All logic moved to immediate method for consistency
        return this.getImageForPageImmediate(pageId);
    }

    // Get assignment status for debugging
    getSessionStatus() {
        const cacheData = this.getCacheData();
        if (!cacheData) {
            return { initialized: false, message: 'No session cache' };
        }

        return {
            initialized: true,
            imageCount: cacheData.imagePool.length,
            pageAssignments: Object.keys(cacheData.pageAssignments),
            timestamp: new Date(cacheData.timestamp).toLocaleString()
        };
    }

    hasBackgroundProcessStarted() {
        if (!this.storageSupported) return false;
        
        try {
            const started = sessionStorage.getItem('alocubano_bg_process_started');
            return started === 'true';
        } catch (error) {
            console.error('Error checking background process flag:', error);
            return false;
        }
    }

    markBackgroundProcessStarted() {
        if (!this.storageSupported) return;
        
        try {
            sessionStorage.setItem('alocubano_bg_process_started', 'true');
        } catch (error) {
            console.error('Error setting background process flag:', error);
        }
    }

    // Force refresh - useful for debugging
    async forceRefresh() {
        console.log('Forcing cache refresh...');
        this.preloadedImages.clear();
        
        if (this.storageSupported) {
            try {
                sessionStorage.removeItem('alocubano_bg_process_started');
            } catch (error) {
                console.error('Error clearing background process flag:', error);
            }
        }
        
        this.clearCache();
        return await this.initializeSessionBackground();
    }
}

// Create global instance
window.ImageCacheManager = new ImageCacheManager();

// Add method to notify when cache is ready
window.ImageCacheManager.notifyReady = function() {
  const event = new CustomEvent('imageCacheReady');
  document.dispatchEvent(event);
};
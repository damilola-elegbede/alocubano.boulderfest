/**
 * Cache Warmer for A Lo Cubano Boulder Fest Gallery
 * Implements intelligent cache warming strategies for cold start elimination
 * 
 * Features:
 * - Homepage cache warming
 * - Critical resource prefetching
 * - Popular content identification
 * - Background warming with idle detection
 */

class CacheWarmer {
    constructor() {
        this.warmingQueue = new Set();
        this.warmingStats = {
            itemsWarmed: 0,
            totalTime: 0,
            failures: 0
        };
        
        this.criticalResources = this.getCriticalResources();
        this.isWarming = false;
        
        console.log('[CacheWarmer] Initialized with', this.criticalResources.length, 'critical resources');
    }
    
    getCriticalResources() {
        return {
            styles: [
                '/css/base.css',
                '/css/components.css',
                '/css/typography.css',
                '/css/navigation.css'
            ],
            scripts: [
                '/js/main.js',
                '/js/navigation.js',
                '/js/gallery-detail.js'
            ],
            images: [
                '/images/logo.png',
                '/images/favicon-circle.svg',
                '/images/hero-default.jpg'
            ],
            fonts: [
                'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap',
                'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap'
            ]
        };
    }
    
    async warmOnHomepage() {
        if (this.isWarming) {
            console.log('[CacheWarmer] Already warming, skipping duplicate request');
            return;
        }
        
        console.log('[CacheWarmer] Starting homepage cache warming');
        this.isWarming = true;
        
        try {
            // Warm critical resources first
            await this.warmCriticalResources();
            
            // Then warm gallery thumbnails during idle time
            if ('requestIdleCallback' in window) {
                requestIdleCallback(() => this.warmGalleryThumbnails(), { timeout: 10000 });
            } else {
                setTimeout(() => this.warmGalleryThumbnails(), 2000);
            }
            
        } catch (error) {
            console.error('[CacheWarmer] Homepage warming failed:', error);
        } finally {
            this.isWarming = false;
        }
    }
    
    async warmCriticalResources() {
        const startTime = performance.now();
        
        console.log('[CacheWarmer] Warming critical resources');
        
        const warmingPromises = [
            this.warmResourceGroup('styles', this.criticalResources.styles),
            this.warmResourceGroup('scripts', this.criticalResources.scripts),
            this.warmResourceGroup('images', this.criticalResources.images),
            this.warmResourceGroup('fonts', this.criticalResources.fonts)
        ];
        
        const results = await Promise.allSettled(warmingPromises);
        
        const endTime = performance.now();
        this.warmingStats.totalTime += endTime - startTime;
        
        // Log results
        results.forEach((result, index) => {
            const groupName = ['styles', 'scripts', 'images', 'fonts'][index];
            if (result.status === 'fulfilled') {
                console.log(`[CacheWarmer] Successfully warmed ${groupName}`);
            } else {
                console.warn(`[CacheWarmer] Failed to warm ${groupName}:`, result.reason);
                this.warmingStats.failures++;
            }
        });
    }
    
    async warmResourceGroup(groupName, resources) {
        const promises = resources.map(resource => this.warmResource(resource, groupName));
        return Promise.allSettled(promises);
    }
    
    async warmResource(url, resourceType) {
        if (this.warmingQueue.has(url)) {
            return;
        }
        
        this.warmingQueue.add(url);
        
        try {
            const response = await fetch(url, {
                method: 'GET',
                mode: 'cors',
                credentials: 'omit',
                cache: 'default'
            });
            
            if (response.ok) {
                // For images, we might want to create an image object to trigger browser caching
                if (resourceType === 'images' && url.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
                    await this.preloadImage(url);
                }
                
                this.warmingStats.itemsWarmed++;
                console.log(`[CacheWarmer] Warmed ${resourceType}:`, url);
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
            
        } catch (error) {
            console.warn(`[CacheWarmer] Failed to warm ${resourceType}:`, url, error);
            this.warmingStats.failures++;
        } finally {
            this.warmingQueue.delete(url);
        }
    }
    
    async preloadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = resolve;
            img.onerror = reject;
            img.src = url;
        });
    }
    
    async warmGalleryThumbnails() {
        console.log('[CacheWarmer] Starting gallery thumbnail warming');
        
        try {
            const criticalImages = await this.getCriticalGalleryImages();
            
            if (criticalImages.length === 0) {
                console.log('[CacheWarmer] No critical gallery images found');
                return;
            }
            
            // Warm in batches to avoid overwhelming the network
            const batchSize = 5;
            for (let i = 0; i < criticalImages.length; i += batchSize) {
                const batch = criticalImages.slice(i, i + batchSize);
                
                const batchPromises = batch.map(imageUrl => 
                    this.warmResource(imageUrl, 'gallery-thumbnails')
                );
                
                await Promise.allSettled(batchPromises);
                
                // Small delay between batches
                if (i + batchSize < criticalImages.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
        } catch (error) {
            console.error('[CacheWarmer] Gallery thumbnail warming failed:', error);
        }
    }
    
    async getCriticalGalleryImages() {
        const sources = [
            () => this.getFeaturedPhotos(),
            () => this.getRecentGalleryThumbnails(),
            () => this.getPopularImages()
        ];
        
        for (const source of sources) {
            try {
                const images = await source();
                if (images && images.length > 0) {
                    return images.slice(0, 20); // Limit to 20 most critical
                }
            } catch (error) {
                console.warn('[CacheWarmer] Failed to get images from source:', error);
            }
        }
        
        return [];
    }
    
    async getFeaturedPhotos() {
        try {
            const response = await fetch('/api/featured-photos.js');
            if (response.ok) {
                const data = await response.json();
                return data.photos ? data.photos.map(photo => photo.url) : [];
            }
        } catch (error) {
            console.warn('[CacheWarmer] Failed to get featured photos:', error);
        }
        return [];
    }
    
    async getRecentGalleryThumbnails() {
        try {
            const response = await fetch('/api/gallery/2025?limit=10');
            if (response.ok) {
                const data = await response.json();
                return data.photos ? data.photos.map(photo => photo.thumbnailUrl || photo.url) : [];
            }
        } catch (error) {
            console.warn('[CacheWarmer] Failed to get recent gallery thumbnails:', error);
        }
        return [];
    }
    
    async getPopularImages() {
        // Fallback to known popular images
        return [
            '/images/hero-default.jpg',
            '/api/image-proxy/hero-2025-1',
            '/api/image-proxy/hero-2025-2'
        ];
    }
    
    async warmSpecificGallery(galleryId) {
        console.log('[CacheWarmer] Warming specific gallery:', galleryId);
        
        try {
            const galleryData = await this.getGalleryData(galleryId);
            
            if (!galleryData || !galleryData.photos) {
                console.warn('[CacheWarmer] No gallery data found for:', galleryId);
                return;
            }
            
            // Warm gallery metadata
            await this.warmResource(`/api/gallery/${galleryId}`, 'gallery-metadata');
            
            // Warm first batch of thumbnails
            const thumbnailUrls = galleryData.photos
                .slice(0, 15)
                .map(photo => photo.thumbnailUrl || photo.url)
                .filter(url => url);
            
            await this.warmResourceGroup('gallery-images', thumbnailUrls);
            
        } catch (error) {
            console.error('[CacheWarmer] Failed to warm gallery:', galleryId, error);
        }
    }
    
    async getGalleryData(galleryId) {
        try {
            const response = await fetch(`/api/gallery/${galleryId}`);
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.warn('[CacheWarmer] Failed to get gallery data:', error);
        }
        return null;
    }
    
    async warmCacheInBackground(urls) {
        if (!Array.isArray(urls) || urls.length === 0) {
            return;
        }
        
        console.log('[CacheWarmer] Background warming', urls.length, 'URLs');
        
        // Use requestIdleCallback for non-blocking warming
        if ('requestIdleCallback' in window) {
            this.warmUrlsWithIdleCallback(urls);
        } else {
            // Fallback for browsers without requestIdleCallback
            this.warmUrlsWithTimeout(urls);
        }
    }
    
    warmUrlsWithIdleCallback(urls) {
        let index = 0;
        
        const warmNext = (deadline) => {
            while ((deadline.timeRemaining() > 0 || deadline.didTimeout) && index < urls.length) {
                this.warmResource(urls[index], 'background');
                index++;
            }
            
            if (index < urls.length) {
                requestIdleCallback(warmNext, { timeout: 5000 });
            }
        };
        
        requestIdleCallback(warmNext, { timeout: 5000 });
    }
    
    warmUrlsWithTimeout(urls) {
        let index = 0;
        
        const warmNext = () => {
            if (index < urls.length) {
                this.warmResource(urls[index], 'background');
                index++;
                setTimeout(warmNext, 100); // Small delay between requests
            }
        };
        
        setTimeout(warmNext, 1000); // Initial delay
    }
    
    // Service Worker integration
    async warmServiceWorkerCache(urls) {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'CACHE_WARM',
                data: { urls }
            });
        } else {
            console.warn('[CacheWarmer] Service Worker not available for cache warming');
        }
    }
    
    // Public API methods
    getWarmingStats() {
        return {
            ...this.warmingStats,
            queueSize: this.warmingQueue.size,
            isWarming: this.isWarming
        };
    }
    
    clearWarmingQueue() {
        this.warmingQueue.clear();
    }
    
    resetStats() {
        this.warmingStats = {
            itemsWarmed: 0,
            totalTime: 0,
            failures: 0
        };
    }
    
    // Auto-start warming based on page
    autoWarm() {
        const currentPath = window.location.pathname;
        
        if (currentPath === '/' || currentPath === '/index.html') {
            this.warmOnHomepage();
        } else if (currentPath.includes('/gallery')) {
            // Extract gallery ID and warm that specific gallery
            const galleryMatch = currentPath.match(/gallery[/-](\d{4})/);
            if (galleryMatch) {
                this.warmSpecificGallery(galleryMatch[1]);
            }
        }
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CacheWarmer;
}
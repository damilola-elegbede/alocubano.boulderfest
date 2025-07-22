/**
 * Prefetch Manager for A Lo Cubano Boulder Fest Gallery
 * Implements intelligent prefetching strategies for optimal performance
 * 
 * Features:
 * - Connection-aware prefetching
 * - User behavior prediction
 * - Idle-time cache warming
 * - Navigation pattern learning
 */

class PrefetchManager {
    constructor() {
        this.prefetchQueue = new Set();
        this.connectionSpeed = this.detectConnectionSpeed();
        this.userBehavior = this.initUserBehaviorTracking();
        this.isIdle = false;
        this.prefetchLimits = this.getPrefetchLimits();
        
        this.setupEventListeners();
        this.startIdleDetection();
        
        console.log('[Prefetch] Manager initialized with connection:', this.connectionSpeed);
    }
    
    detectConnectionSpeed() {
        if ('connection' in navigator) {
            const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            if (connection) {
                return {
                    effectiveType: connection.effectiveType || '4g',
                    downlink: connection.downlink || 10,
                    rtt: connection.rtt || 100,
                    saveData: connection.saveData || false
                };
            }
        }
        
        // Default to moderate connection
        return {
            effectiveType: '4g',
            downlink: 10,
            rtt: 100,
            saveData: false
        };
    }
    
    getPrefetchLimits() {
        const { effectiveType, saveData } = this.connectionSpeed;
        
        if (saveData) {
            return { images: 0, maxConcurrent: 0 };
        }
        
        switch (effectiveType) {
            case 'slow-2g':
            case '2g':
                return { images: 0, maxConcurrent: 0 };
            case '3g':
                return { images: 5, maxConcurrent: 2 };
            case '4g':
            default:
                return { images: 20, maxConcurrent: 6 };
        }
    }
    
    initUserBehaviorTracking() {
        const stored = localStorage.getItem('alocubano-user-behavior');
        const defaultBehavior = {
            galleryPreferences: {},
            navigationPatterns: [],
            timeSpentPerImage: {},
            lastVisit: Date.now(),
            visitCount: 0
        };
        
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                parsed.visitCount++;
                return { ...defaultBehavior, ...parsed };
            } catch (error) {
                console.warn('[Prefetch] Failed to parse user behavior data');
            }
        }
        
        return defaultBehavior;
    }
    
    saveUserBehavior() {
        try {
            localStorage.setItem('alocubano-user-behavior', JSON.stringify(this.userBehavior));
        } catch (error) {
            console.warn('[Prefetch] Failed to save user behavior data');
        }
    }
    
    setupEventListeners() {
        // Scroll-based prefetching
        window.addEventListener('scroll', this.throttle(this.handleScroll.bind(this), 250));
        
        // Navigation tracking
        window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));
        
        // Connection change handling
        if ('connection' in navigator) {
            navigator.connection.addEventListener('change', this.handleConnectionChange.bind(this));
        }
        
        // Visibility change for pause/resume
        document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    }
    
    startIdleDetection() {
        if ('requestIdleCallback' in window) {
            this.scheduleIdleWork();
        } else {
            // Fallback for browsers without requestIdleCallback
            setTimeout(() => this.performIdleWork(), 5000);
        }
    }
    
    scheduleIdleWork() {
        requestIdleCallback((deadline) => {
            this.performIdleWork(deadline);
            
            // Schedule next idle period
            setTimeout(() => this.scheduleIdleWork(), 10000);
        }, { timeout: 30000 });
    }
    
    async performIdleWork(deadline) {
        const timeRemaining = deadline ? deadline.timeRemaining() : 50;
        
        if (timeRemaining > 10) {
            console.log('[Prefetch] Starting idle work with', timeRemaining, 'ms');
            await this.warmCacheWithPopularImages();
        }
    }
    
    async handleScroll() {
        if (this.prefetchLimits.images === 0) return;
        
        const scrollPercentage = this.getScrollPercentage();
        
        if (scrollPercentage > 50) {
            await this.prefetchNextBatch(Math.min(10, this.prefetchLimits.images));
        }
        
        if (scrollPercentage > 80) {
            await this.prefetchNextPage();
        }
    }
    
    getScrollPercentage() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
        return scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
    }
    
    async prefetchNextBatch(count) {
        const visibleImages = this.getVisibleImages();
        const nextImages = this.getNextImages(visibleImages, count);
        
        if (nextImages.length === 0) return;
        
        console.log('[Prefetch] Prefetching next batch:', nextImages.length, 'images');
        
        const prefetchPromises = nextImages
            .slice(0, this.prefetchLimits.maxConcurrent)
            .map(img => this.prefetchImage(img));
        
        await Promise.allSettled(prefetchPromises);
    }
    
    getVisibleImages() {
        const images = document.querySelectorAll('.gallery-image[data-src], .gallery-image img[src]');
        const visibleImages = [];
        
        images.forEach(img => {
            const rect = img.getBoundingClientRect();
            if (rect.top < window.innerHeight && rect.bottom > 0) {
                visibleImages.push(img);
            }
        });
        
        return visibleImages;
    }
    
    getNextImages(visibleImages, count) {
        const allImages = document.querySelectorAll('.gallery-image[data-src]');
        const lastVisibleIndex = visibleImages.length > 0 ? 
            Array.from(allImages).indexOf(visibleImages[visibleImages.length - 1]) : -1;
        
        const nextImages = [];
        for (let i = lastVisibleIndex + 1; i < allImages.length && nextImages.length < count; i++) {
            const img = allImages[i];
            if (img && img.dataset.src && !this.prefetchQueue.has(img.dataset.src)) {
                nextImages.push(img);
            }
        }
        
        return nextImages;
    }
    
    async prefetchImage(imageElement) {
        const src = imageElement.dataset.src || imageElement.src;
        if (!src || this.prefetchQueue.has(src)) return;
        
        this.prefetchQueue.add(src);
        
        try {
            const response = await fetch(src, {
                method: 'GET',
                mode: 'cors',
                credentials: 'omit'
            });
            
            if (response.ok) {
                console.log('[Prefetch] Successfully prefetched:', src);
                
                // Track prefetch success
                this.trackPrefetchSuccess(src);
            }
        } catch (error) {
            console.warn('[Prefetch] Failed to prefetch:', src, error);
        } finally {
            this.prefetchQueue.delete(src);
        }
    }
    
    async prefetchNextPage() {
        const nextPageUrls = this.predictNextPageUrls();
        
        if (nextPageUrls.length === 0) return;
        
        console.log('[Prefetch] Prefetching next page data:', nextPageUrls);
        
        const prefetchPromises = nextPageUrls.map(url => this.prefetchUrl(url));
        await Promise.allSettled(prefetchPromises);
    }
    
    predictNextPageUrls() {
        const currentPath = window.location.pathname;
        const urls = [];
        
        // Only prefetch if on fast connection and not data saver mode
        if (this.connectionSpeed.saveData || this.prefetchLimits.images === 0) {
            return [];
        }
        
        // Gallery navigation patterns (limit to existing pages)
        if (currentPath.includes('/gallery')) {
            // Only predict URLs that we know exist
            if (currentPath.includes('2025')) {
                urls.push('/pages/artists.html', '/pages/schedule.html');
            }
        }
        
        // Add user behavior predictions (but validate first)
        const userPredicted = this.getUserPredictedUrls();
        urls.push(...userPredicted.slice(0, 2)); // Limit to 2 predictions
        
        return urls.filter(url => url && !this.prefetchQueue.has(url));
    }
    
    getUserPredictedUrls() {
        const { navigationPatterns } = this.userBehavior;
        const currentPath = window.location.pathname;
        
        // Find common next pages from historical data
        const predictions = navigationPatterns
            .filter(pattern => pattern.from === currentPath)
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 3)
            .map(pattern => pattern.to);
        
        return predictions;
    }
    
    async prefetchUrl(url) {
        if (this.prefetchQueue.has(url)) return;
        
        this.prefetchQueue.add(url);
        
        try {
            const response = await fetch(url, {
                method: 'GET',
                mode: 'cors',
                credentials: 'omit'
            });
            
            if (response.ok) {
                console.log('[Prefetch] Successfully prefetched URL:', url);
            } else {
                console.log('[Prefetch] URL not accessible:', url, '- status:', response.status);
            }
        } catch (error) {
            console.log('[Prefetch] URL not available for prefetch:', url, '- this is normal for non-existent pages');
        } finally {
            this.prefetchQueue.delete(url);
        }
    }
    
    async warmCacheWithPopularImages() {
        if (this.prefetchLimits.images === 0) return;
        
        const popularImages = await this.getPopularImages();
        
        if (popularImages.length === 0) return;
        
        console.log('[Prefetch] Warming cache with popular images:', popularImages.length);
        
        const warmPromises = popularImages
            .slice(0, Math.min(5, this.prefetchLimits.images))
            .map(imageUrl => this.prefetchUrl(imageUrl));
        
        await Promise.allSettled(warmPromises);
    }
    
    async getPopularImages() {
        try {
            // Try to get featured/popular images from API
            const response = await fetch('/api/featured-photos.js');
            if (response.ok) {
                const data = await response.json();
                return data.photos ? data.photos.slice(0, 10).map(photo => photo.url) : [];
            }
        } catch (error) {
            console.warn('[Prefetch] Failed to get popular images from API');
        }
        
        // Fallback to actual available images only
        return [
            '/images/hero-default.jpg',
            '/images/logo.png'
        ];
    }
    
    trackNavigationPattern(fromPath, toPath) {
        const { navigationPatterns } = this.userBehavior;
        
        const existing = navigationPatterns.find(p => p.from === fromPath && p.to === toPath);
        if (existing) {
            existing.frequency++;
            existing.lastUsed = Date.now();
        } else {
            navigationPatterns.push({
                from: fromPath,
                to: toPath,
                frequency: 1,
                lastUsed: Date.now()
            });
        }
        
        // Keep only recent patterns (last 30 days)
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        this.userBehavior.navigationPatterns = navigationPatterns.filter(
            p => p.lastUsed > thirtyDaysAgo
        );
        
        this.saveUserBehavior();
    }
    
    trackPrefetchSuccess(imageUrl) {
        // Track which prefetched images were actually viewed
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    console.log('[Prefetch] Prefetched image viewed:', imageUrl);
                    observer.disconnect();
                }
            });
        });
        
        // Find and observe the image element
        const imgElement = document.querySelector(`img[src="${imageUrl}"], [data-src="${imageUrl}"]`);
        if (imgElement) {
            observer.observe(imgElement);
        }
    }
    
    handleConnectionChange() {
        this.connectionSpeed = this.detectConnectionSpeed();
        this.prefetchLimits = this.getPrefetchLimits();
        
        console.log('[Prefetch] Connection changed:', this.connectionSpeed.effectiveType);
        
        // Clear queue if connection degraded
        if (this.prefetchLimits.images === 0) {
            this.prefetchQueue.clear();
        }
    }
    
    handleVisibilityChange() {
        if (document.hidden) {
            // Pause prefetching when tab is hidden
            this.prefetchQueue.clear();
        } else {
            // Resume prefetching when tab becomes visible
            setTimeout(() => this.handleScroll(), 1000);
        }
    }
    
    handleBeforeUnload() {
        const currentPath = window.location.pathname;
        const nextPath = document.activeElement?.href ? 
            new URL(document.activeElement.href).pathname : null;
        
        if (nextPath && nextPath !== currentPath) {
            this.trackNavigationPattern(currentPath, nextPath);
        }
        
        this.saveUserBehavior();
    }
    
    throttle(func, delay) {
        let timeoutId;
        let lastExecTime = 0;
        
        return function (...args) {
            const currentTime = Date.now();
            
            if (currentTime - lastExecTime > delay) {
                func.apply(this, args);
                lastExecTime = currentTime;
            } else {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    func.apply(this, args);
                    lastExecTime = Date.now();
                }, delay - (currentTime - lastExecTime));
            }
        };
    }
    
    // Public API methods
    setConnectionSpeed(speed) {
        this.connectionSpeed = speed;
        this.prefetchLimits = this.getPrefetchLimits();
    }
    
    clearPrefetchQueue() {
        this.prefetchQueue.clear();
    }
    
    getPrefetchStats() {
        return {
            queueSize: this.prefetchQueue.size,
            connectionSpeed: this.connectionSpeed,
            limits: this.prefetchLimits,
            userBehavior: {
                visitCount: this.userBehavior.visitCount,
                patternsCount: this.userBehavior.navigationPatterns.length
            }
        };
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PrefetchManager;
}
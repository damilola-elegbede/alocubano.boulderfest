/**
 * Performance Monitor for A Lo Cubano Boulder Fest Gallery
 * Tracks and reports performance metrics for optimization analysis
 * 
 * Features:
 * - Cache hit ratio tracking
 * - Image load time monitoring
 * - Core Web Vitals measurement
 * - User behavior analytics
 */

class PerformanceMonitor {
    constructor() {
        this.metrics = {
            cacheHitRatio: 0,
            averageImageLoadTime: 0,
            totalImagesLoaded: 0,
            cacheHits: 0,
            cacheMisses: 0,
            prefetchAccuracy: 0,
            sessionStartTime: Date.now(),
            pageLoadTime: 0,
            timeToFirstImage: 0,
            totalPageViews: 0
        };
        
        this.events = [];
        this.isObserving = false;
        
        this.initializeMonitoring();
        console.log('[PerfMonitor] Performance monitoring initialized');
    }
    
    initializeMonitoring() {
        // Track page load performance
        this.trackPageLoad();
        
        // Track Core Web Vitals
        this.trackCoreWebVitals();
        
        // Track Service Worker cache events
        this.trackServiceWorkerCache();
        
        // Track image loading performance
        this.trackImageLoading();
        
        // Track prefetch effectiveness
        this.trackPrefetchEffectiveness();
        
        // Start periodic reporting
        this.startPeriodicReporting();
    }
    
    trackPageLoad() {
        if (document.readyState === 'complete') {
            this.calculatePageLoadMetrics();
        } else {
            window.addEventListener('load', () => {
                this.calculatePageLoadMetrics();
            });
        }
    }
    
    calculatePageLoadMetrics() {
        const navigation = performance.getEntriesByType('navigation')[0];
        if (navigation) {
            this.metrics.pageLoadTime = navigation.loadEventEnd - navigation.navigationStart;
            
            this.logEvent('page_load', {
                loadTime: this.metrics.pageLoadTime,
                domContentLoaded: navigation.domContentLoadedEventEnd - navigation.navigationStart,
                firstContentfulPaint: this.getFirstContentfulPaint()
            });
        }
    }
    
    getFirstContentfulPaint() {
        const paintEntries = performance.getEntriesByType('paint');
        const fcp = paintEntries.find(entry => entry.name === 'first-contentful-paint');
        return fcp ? fcp.startTime : 0;
    }
    
    trackCoreWebVitals() {
        // Track Largest Contentful Paint (LCP)
        this.observeLCP();
        
        // Track First Input Delay (FID)
        this.observeFID();
        
        // Track Cumulative Layout Shift (CLS)
        this.observeCLS();
    }
    
    observeLCP() {
        if ('PerformanceObserver' in window) {
            const observer = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                const lastEntry = entries[entries.length - 1];
                
                this.logEvent('lcp', {
                    value: lastEntry.startTime,
                    element: lastEntry.element ? lastEntry.element.tagName : 'unknown'
                });
            });
            
            observer.observe({ entryTypes: ['largest-contentful-paint'] });
        }
    }
    
    observeFID() {
        if ('PerformanceObserver' in window) {
            const observer = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                entries.forEach(entry => {
                    this.logEvent('fid', {
                        value: entry.processingStart - entry.startTime
                    });
                });
            });
            
            observer.observe({ entryTypes: ['first-input'] });
        }
    }
    
    observeCLS() {
        if ('PerformanceObserver' in window) {
            let clsValue = 0;
            
            const observer = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                entries.forEach(entry => {
                    if (!entry.hadRecentInput) {
                        clsValue += entry.value;
                    }
                });
                
                this.logEvent('cls', { value: clsValue });
            });
            
            observer.observe({ entryTypes: ['layout-shift'] });
        }
    }
    
    trackServiceWorkerCache() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'CACHE_STATS') {
                    this.updateCacheMetrics(event.data);
                }
            });
        }
    }
    
    updateCacheMetrics(cacheData) {
        this.metrics.cacheHits = cacheData.hits || 0;
        this.metrics.cacheMisses = cacheData.misses || 0;
        this.metrics.cacheHitRatio = this.metrics.cacheHits / 
            (this.metrics.cacheHits + this.metrics.cacheMisses);
        
        this.logEvent('cache_stats', {
            hitRatio: this.metrics.cacheHitRatio,
            totalRequests: this.metrics.cacheHits + this.metrics.cacheMisses
        });
    }
    
    trackImageLoading() {
        // Track gallery image loading times
        document.addEventListener('progressiveload', (event) => {
            const loadTime = event.detail.loadTime || 0;
            this.trackImageLoadTime(event.detail.url, loadTime);
        });
        
        // Track regular image loads
        document.addEventListener('load', (event) => {
            if (event.target.tagName === 'IMG' && event.target.classList.contains('gallery-image')) {
                this.trackImageLoad(event.target);
            }
        }, true);
    }
    
    trackImageLoadTime(imageUrl, loadTime) {
        this.metrics.totalImagesLoaded++;
        
        const currentAverage = this.metrics.averageImageLoadTime;
        this.metrics.averageImageLoadTime = 
            (currentAverage * (this.metrics.totalImagesLoaded - 1) + loadTime) / 
            this.metrics.totalImagesLoaded;
        
        // Track time to first image
        if (this.metrics.timeToFirstImage === 0) {
            this.metrics.timeToFirstImage = Date.now() - this.metrics.sessionStartTime;
        }
        
        this.logEvent('image_load', {
            url: imageUrl,
            loadTime: loadTime,
            isFirstImage: this.metrics.totalImagesLoaded === 1
        });
    }
    
    trackImageLoad(imgElement) {
        const loadStartTime = imgElement.dataset.loadStartTime;
        if (loadStartTime) {
            const loadTime = Date.now() - parseInt(loadStartTime);
            this.trackImageLoadTime(imgElement.src, loadTime);
        }
    }
    
    trackPrefetchEffectiveness() {
        // Track which prefetched images are actually viewed
        if ('IntersectionObserver' in window) {
            const viewObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        this.trackImageViewed(entry.target);
                    }
                });
            }, { threshold: 0.5 });
            
            // Observe gallery images
            const observer = new MutationObserver((mutations) => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const images = node.querySelectorAll ? 
                                node.querySelectorAll('img.gallery-image') : 
                                (node.classList && node.classList.contains('gallery-image') ? [node] : []);
                            
                            images.forEach(img => viewObserver.observe(img));
                        }
                    });
                });
            });
            
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }
    
    trackImageViewed(imgElement) {
        const wasPrefetched = imgElement.dataset.prefetched === 'true';
        
        this.logEvent('image_viewed', {
            url: imgElement.src,
            wasPrefetched: wasPrefetched,
            viewTime: Date.now() - this.metrics.sessionStartTime
        });
        
        // Calculate prefetch accuracy
        if (wasPrefetched) {
            this.updatePrefetchAccuracy(true);
        }
    }
    
    updatePrefetchAccuracy(wasViewed) {
        // This would be implemented with more sophisticated tracking
        // of prefetched vs viewed images
        this.logEvent('prefetch_accuracy', { wasViewed });
    }
    
    trackCacheHit(url, cacheType) {
        this.metrics.cacheHits++;
        this.updateCacheRatio();
        
        this.logEvent('cache_hit', {
            url: url,
            cacheType: cacheType,
            timestamp: Date.now()
        });
    }
    
    trackCacheMiss(url, reason) {
        this.metrics.cacheMisses++;
        this.updateCacheRatio();
        
        this.logEvent('cache_miss', {
            url: url,
            reason: reason,
            timestamp: Date.now()
        });
    }
    
    updateCacheRatio() {
        const total = this.metrics.cacheHits + this.metrics.cacheMisses;
        this.metrics.cacheHitRatio = total > 0 ? this.metrics.cacheHits / total : 0;
    }
    
    trackUserInteraction(interactionType, details = {}) {
        this.logEvent('user_interaction', {
            type: interactionType,
            details: details,
            timestamp: Date.now()
        });
    }
    
    logEvent(eventType, data) {
        const event = {
            type: eventType,
            timestamp: Date.now(),
            sessionTime: Date.now() - this.metrics.sessionStartTime,
            data: data
        };
        
        this.events.push(event);
        
        // Keep only recent events (last 1000)
        if (this.events.length > 1000) {
            this.events = this.events.slice(-1000);
        }
        
        console.log(`[PerfMonitor] ${eventType}:`, data);
    }
    
    startPeriodicReporting() {
        // Report metrics every 30 seconds
        setInterval(() => {
            this.reportMetrics();
        }, 30000);
        
        // Report on page unload
        window.addEventListener('beforeunload', () => {
            this.reportMetrics();
        });
    }
    
    reportMetrics() {
        const report = {
            metrics: this.metrics,
            recentEvents: this.events.slice(-10), // Last 10 events
            timestamp: Date.now(),
            url: window.location.pathname
        };
        
        // Log to console for now (in production, send to analytics)
        console.log('[PerfMonitor] Performance Report:', report);
        
        // Send to analytics service (if configured)
        this.sendToAnalytics(report);
    }
    
    sendToAnalytics(report) {
        // Send metrics to analytics service
        if (typeof gtag !== 'undefined') {
            gtag('event', 'performance_metrics', {
                custom_parameter_1: report.metrics.cacheHitRatio,
                custom_parameter_2: report.metrics.averageImageLoadTime,
                custom_parameter_3: report.metrics.timeToFirstImage
            });
        }
        
        // Send to custom endpoint (if available)
        if (window.ANALYTICS_ENDPOINT) {
            fetch(window.ANALYTICS_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(report)
            }).catch(error => {
                console.warn('[PerfMonitor] Failed to send analytics:', error);
            });
        }
    }
    
    // Public API methods
    getMetrics() {
        return { ...this.metrics };
    }
    
    getEvents() {
        return [...this.events];
    }
    
    getPerformanceScore() {
        // Calculate overall performance score based on key metrics
        const scores = [];
        
        // Cache hit ratio (0-100)
        scores.push(this.metrics.cacheHitRatio * 100);
        
        // Image load time score (inversely related to load time)
        const imageScore = Math.max(0, 100 - (this.metrics.averageImageLoadTime / 10));
        scores.push(imageScore);
        
        // Time to first image score
        const firstImageScore = Math.max(0, 100 - (this.metrics.timeToFirstImage / 50));
        scores.push(firstImageScore);
        
        return scores.reduce((sum, score) => sum + score, 0) / scores.length;
    }
    
    resetMetrics() {
        this.metrics = {
            cacheHitRatio: 0,
            averageImageLoadTime: 0,
            totalImagesLoaded: 0,
            cacheHits: 0,
            cacheMisses: 0,
            prefetchAccuracy: 0,
            sessionStartTime: Date.now(),
            pageLoadTime: 0,
            timeToFirstImage: 0,
            totalPageViews: 0
        };
        this.events = [];
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PerformanceMonitor;
}
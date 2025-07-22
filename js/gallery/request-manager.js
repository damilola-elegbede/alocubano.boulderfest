// Gallery Request Manager - ES6 Module
// Handles HTTP request caching, rate limiting, and performance tracking

export class GalleryRequestManager {
    constructor(config, state) {
        this.config = config;
        this.state = state;
        this.MAX_CACHE_SIZE = 50; // Maximum number of cached requests
    }

    isRateLimited() {
        const now = Date.now();
        const windowStart = now - this.config.RATE_LIMIT.WINDOW_MS;

        // Clean old requests
        this.state.rateLimitTracker.requests = this.state.rateLimitTracker.requests.filter(
            timestamp => timestamp > windowStart
        );

        return this.state.rateLimitTracker.requests.length >= this.config.RATE_LIMIT.MAX_REQUESTS;
    }

    recordRequest() {
        this.state.rateLimitTracker.requests.push(Date.now());
    }

    async cachedFetch(url, options = {}) {
        const cacheKey = `${url}:${JSON.stringify(options)}`;
        const cached = this.state.requestCache.get(cacheKey);
        const now = Date.now();

        // Check cache first
        if (cached && (now - cached.timestamp) < this.config.REQUEST_CACHE_DURATION) {
            // console.log('🎯 Cache hit for:', url);
            this.state.performanceMetrics.cacheHits++;
            return cached.response;
        }

        // Clean expired entries periodically
        if (this.state.requestCache.size > 0 && Math.random() < 0.1) {
            const expiredKeys = [];
            this.state.requestCache.forEach((value, key) => {
                if ((now - value.timestamp) >= this.config.REQUEST_CACHE_DURATION) {
                    expiredKeys.push(key);
                }
            });
            expiredKeys.forEach(key => this.state.requestCache.delete(key));
            if (expiredKeys.length > 0) {
                // console.log(`🧹 Cleaned ${expiredKeys.length} expired cache entries`);
            }
        }

        // Enforce max cache size (LRU eviction)
        if (this.state.requestCache.size >= this.MAX_CACHE_SIZE) {
            // Find and remove the oldest entry
            let oldestKey = null;
            let oldestTime = Infinity;
            this.state.requestCache.forEach((value, key) => {
                if (value.timestamp < oldestTime) {
                    oldestTime = value.timestamp;
                    oldestKey = key;
                }
            });
            if (oldestKey) {
                this.state.requestCache.delete(oldestKey);
                console.log('🧹 Evicted oldest cache entry to maintain size limit');
            }
        }

        // Check rate limit
        if (this.isRateLimited()) {
            console.warn('⚠️ Rate limited, waiting...');
            await new Promise(resolve => setTimeout(resolve, this.config.RATE_LIMIT.RETRY_DELAY));

            if (this.isRateLimited()) {
                throw new Error('Rate limit exceeded. Please wait before making more requests.');
            }
        }

        console.log('🌐 Making fresh request to:', url);
        this.state.performanceMetrics.cacheMisses++;
        this.recordRequest();

        const response = await fetch(url, options);

        // Cache successful responses
        if (response.ok) {
            const clonedResponse = response.clone();
            this.state.requestCache.set(cacheKey, {
                response: clonedResponse,
                timestamp: now
            });
        }

        return response;
    }

    clearCache() {
        this.state.requestCache.clear();
        console.log('🧹 Request cache cleared');
    }

    getPerformanceStats() {
        return {
            cacheHitRatio: this.state.performanceMetrics.cacheHits / (this.state.performanceMetrics.cacheHits + this.state.performanceMetrics.cacheMisses),
            totalRequests: this.state.performanceMetrics.cacheHits + this.state.performanceMetrics.cacheMisses,
            averageLoadTime: this.state.performanceMetrics.loadTimes.reduce((a, b) => a + b, 0) / this.state.performanceMetrics.loadTimes.length || 0
        };
    }
}

// Factory function for creating RequestManager instances
export function createRequestManager(config, state) {
    return new GalleryRequestManager(config, state);
}
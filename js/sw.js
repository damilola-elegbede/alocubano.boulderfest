/**
 * Gallery Service Worker for A Lo Cubano Boulder Fest
 * Implements comprehensive caching strategy for optimal gallery performance
 * 
 * Cache Strategy:
 * - Images: Cache-first with long TTL
 * - API: Network-first with cache fallback
 * - Static assets: Stale-while-revalidate
 */

class GalleryServiceWorker {
    constructor() {
        this.CACHE_VERSION = 'v1';
        this.STATIC_CACHE = 'alocubano-static-v1';
        this.IMAGE_CACHE = 'alocubano-images-v1';
        this.API_CACHE = 'alocubano-api-v1';
        
        // Cache TTL settings (in milliseconds)
        this.CACHE_TTL = {
            thumbnails: 7 * 24 * 60 * 60 * 1000,    // 7 days
            fullImages: 30 * 24 * 60 * 60 * 1000,   // 30 days
            apiData: 60 * 60 * 1000,                 // 1 hour
            sessionData: 5 * 60 * 1000               // 5 minutes
        };
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        self.addEventListener('install', this.handleInstall.bind(this));
        self.addEventListener('activate', this.handleActivate.bind(this));
        self.addEventListener('fetch', this.handleFetch.bind(this));
        self.addEventListener('message', this.handleMessage.bind(this));
        self.addEventListener('sync', this.handleBackgroundSync.bind(this));
    }
    
    async handleInstall(event) {
        console.log('[SW] Installing service worker...');
        
        event.waitUntil(
            this.precacheStaticAssets()
        );
        
        // Skip waiting to activate immediately
        self.skipWaiting();
    }
    
    async handleActivate(event) {
        console.log('[SW] Activating service worker...');
        
        event.waitUntil(
            Promise.all([
                this.cleanupOldCaches(),
                self.clients.claim()
            ])
        );
    }
    
    async precacheStaticAssets() {
        const staticCache = await caches.open(this.STATIC_CACHE);
        
        const criticalAssets = [
            '/css/base.css',
            '/css/components.css',
            '/css/typography.css',
            '/js/main.js',
            '/js/navigation.js',
            '/js/gallery-detail.js',
            '/images/logo.png',
            '/images/favicon-circle.svg'
        ];
        
        try {
            await staticCache.addAll(criticalAssets);
            console.log('[SW] Critical assets precached');
        } catch (error) {
            console.error('[SW] Failed to precache static assets:', error);
        }
    }
    
    async cleanupOldCaches() {
        const cacheNames = await caches.keys();
        const oldCaches = cacheNames.filter(name => 
            name.startsWith('alocubano-') && 
            !name.includes(this.CACHE_VERSION)
        );
        
        await Promise.all(
            oldCaches.map(cacheName => caches.delete(cacheName))
        );
        
        console.log('[SW] Cleaned up old caches:', oldCaches);
    }
    
    handleFetch(event) {
        const request = event.request;
        const url = new URL(request.url);
        
        // Only handle GET requests
        if (request.method !== 'GET') {
            return;
        }
        
        // Route to appropriate cache strategy
        if (this.isImageRequest(url)) {
            event.respondWith(this.handleImageRequest(request));
        } else if (this.isAPIRequest(url)) {
            event.respondWith(this.handleAPIRequest(request));
        } else if (this.isStaticAsset(url)) {
            event.respondWith(this.handleStaticAssetRequest(request));
        }
    }
    
    isImageRequest(url) {
        return (
            url.pathname.includes('/api/image-proxy/') ||
            url.hostname.includes('drive.google.com') ||
            /\.(jpg|jpeg|png|webp|gif)$/i.test(url.pathname)
        );
    }
    
    isAPIRequest(url) {
        return (
            url.pathname.startsWith('/api/') &&
            !url.pathname.includes('/api/image-proxy/')
        );
    }
    
    isStaticAsset(url) {
        return (
            url.pathname.startsWith('/css/') ||
            url.pathname.startsWith('/js/') ||
            url.pathname.startsWith('/images/') ||
            /\.(css|js|woff|woff2|ttf|eot)$/i.test(url.pathname)
        );
    }
    
    async handleImageRequest(request) {
        const cache = await caches.open(this.IMAGE_CACHE);
        const cachedResponse = await cache.match(request);
        
        // Check if cached response is still valid
        if (cachedResponse && this.isCacheEntryValid(cachedResponse, this.CACHE_TTL.fullImages)) {
            console.log('[SW] Image cache hit:', request.url);
            return cachedResponse;
        }
        
        try {
            console.log('[SW] Fetching image from network:', request.url);
            const networkResponse = await fetch(request);
            
            if (networkResponse.ok) {
                // Clone response before caching
                const responseToCache = networkResponse.clone();
                await this.cacheWithTimestamp(cache, request, responseToCache);
            }
            
            return networkResponse;
        } catch (error) {
            console.error('[SW] Image fetch failed:', error);
            
            // Return cached version even if expired as fallback
            if (cachedResponse) {
                console.log('[SW] Returning expired cache as fallback');
                return cachedResponse;
            }
            
            // Return placeholder if no cache available
            return this.createPlaceholderResponse();
        }
    }
    
    async handleAPIRequest(request) {
        const cache = await caches.open(this.API_CACHE);
        
        try {
            console.log('[SW] Fetching API from network:', request.url);
            const networkResponse = await fetch(request);
            
            if (networkResponse.ok) {
                const responseToCache = networkResponse.clone();
                await this.cacheWithTimestamp(cache, request, responseToCache);
            }
            
            return networkResponse;
        } catch (error) {
            console.error('[SW] API fetch failed, trying cache:', error);
            
            const cachedResponse = await cache.match(request);
            if (cachedResponse) {
                console.log('[SW] API cache hit (fallback):', request.url);
                return cachedResponse;
            }
            
            throw error;
        }
    }
    
    async handleStaticAssetRequest(request) {
        // Skip caching for chrome extensions and other unsupported schemes
        const url = new URL(request.url);
        if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:' || url.protocol === 'safari-extension:') {
            console.log('[SW] Skipping unsupported scheme:', url.protocol);
            return fetch(request);
        }
        
        const cache = await caches.open(this.STATIC_CACHE);
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse) {
            console.log('[SW] Static asset cache hit:', request.url);
            
            // Serve from cache and update in background
            this.updateCacheInBackground(cache, request);
            return cachedResponse;
        }
        
        try {
            console.log('[SW] Fetching static asset from network:', request.url);
            const networkResponse = await fetch(request);
            
            if (networkResponse.ok) {
                const responseToCache = networkResponse.clone();
                await cache.put(request, responseToCache);
            }
            
            return networkResponse;
        } catch (error) {
            console.error('[SW] Static asset fetch failed:', error);
            throw error;
        }
    }
    
    async updateCacheInBackground(cache, request) {
        try {
            const networkResponse = await fetch(request);
            if (networkResponse.ok) {
                await cache.put(request, networkResponse);
                console.log('[SW] Background cache update successful:', request.url);
            }
        } catch (error) {
            console.log('[SW] Background cache update failed:', error);
        }
    }
    
    async cacheWithTimestamp(cache, request, response) {
        const responseWithTimestamp = new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: {
                ...response.headers,
                'sw-cached-at': Date.now().toString()
            }
        });
        
        await cache.put(request, responseWithTimestamp);
    }
    
    isCacheEntryValid(response, ttl) {
        const cachedAt = response.headers.get('sw-cached-at');
        if (!cachedAt) return false;
        
        const age = Date.now() - parseInt(cachedAt);
        return age < ttl;
    }
    
    createPlaceholderResponse() {
        const placeholderSvg = `
            <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
                <rect width="400" height="300" fill="#f0f0f0"/>
                <text x="200" y="150" text-anchor="middle" fill="#999" font-family="Arial, sans-serif" font-size="16">
                    Image temporarily unavailable
                </text>
            </svg>
        `;
        
        return new Response(placeholderSvg, {
            headers: {
                'Content-Type': 'image/svg+xml',
                'Cache-Control': 'no-cache'
            }
        });
    }
    
    handleMessage(event) {
        const { type, data } = event.data;
        
        switch (type) {
            case 'SKIP_WAITING':
                self.skipWaiting();
                break;
                
            case 'CACHE_WARM':
                this.warmCache(data.urls);
                break;
                
            case 'CACHE_CLEAR':
                this.clearSpecificCache(data.cacheType);
                break;
                
            case 'GET_CACHE_STATS':
                this.sendCacheStats(event.ports[0]);
                break;
        }
    }
    
    async warmCache(urls) {
        if (!Array.isArray(urls)) return;
        
        console.log('[SW] Warming cache with', urls.length, 'URLs');
        
        const promises = urls.map(async (url) => {
            try {
                const response = await fetch(url);
                if (response.ok) {
                    const cache = await this.getCacheForUrl(url);
                    await cache.put(url, response);
                }
            } catch (error) {
                console.warn('[SW] Failed to warm cache for:', url, error);
            }
        });
        
        await Promise.allSettled(promises);
    }
    
    async getCacheForUrl(url) {
        const urlObj = new URL(url);
        
        if (this.isImageRequest(urlObj)) {
            return caches.open(this.IMAGE_CACHE);
        } else if (this.isAPIRequest(urlObj)) {
            return caches.open(this.API_CACHE);
        } else {
            return caches.open(this.STATIC_CACHE);
        }
    }
    
    async clearSpecificCache(cacheType) {
        const cacheName = `alocubano-${cacheType}-${this.CACHE_VERSION}`;
        await caches.delete(cacheName);
        console.log('[SW] Cleared cache:', cacheName);
    }
    
    async sendCacheStats(port) {
        try {
            const cacheNames = await caches.keys();
            const stats = {};
            
            for (const cacheName of cacheNames) {
                if (cacheName.startsWith('alocubano-')) {
                    const cache = await caches.open(cacheName);
                    const keys = await cache.keys();
                    stats[cacheName] = keys.length;
                }
            }
            
            port.postMessage({ type: 'CACHE_STATS', data: stats });
        } catch (error) {
            port.postMessage({ type: 'CACHE_STATS_ERROR', error: error.message });
        }
    }
    
    async handleBackgroundSync(event) {
        if (event.tag === 'gallery-retry') {
            console.log('[SW] Background sync: gallery-retry');
            event.waitUntil(this.retryFailedRequests());
        }
    }
    
    async retryFailedRequests() {
        // Implement retry logic for failed requests
        // This would integrate with IndexedDB to store failed requests
        console.log('[SW] Retrying failed requests...');
    }
}

// Initialize service worker
const galleryServiceWorker = new GalleryServiceWorker();

console.log('[SW] Gallery Service Worker initialized');
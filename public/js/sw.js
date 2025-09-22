/**
 * Advanced Service Worker for A Lo Cubano Boulder Fest - Phase 2
 * Multi-level caching with intelligent strategies for optimal performance
 *
 * Features:
 * - Multi-level caching (STATIC, IMAGE, API caches)
 * - Cache-first for images with size limits
 * - Network-first for APIs with stale-while-revalidate
 * - Background cache updates and cleanup
 * - Message interface for cache management
 * - Offline fallbacks with SVG placeholders
 */

const CACHE_VERSION = 'v2.0.0';
const STATIC_CACHE = `alocubano-static-${CACHE_VERSION}`;
const IMAGE_CACHE = `alocubano-images-${CACHE_VERSION}`;
const API_CACHE = `alocubano-api-${CACHE_VERSION}`;
const OFFLINE_CACHE = `alocubano-offline-${CACHE_VERSION}`;

// Offline queue for check-ins
let offlineQueue = [];

// Cache configuration
const CACHE_CONFIG = {
    // Size limits (in bytes)
    maxImageCacheSize: 5 * 1024 * 1024, // 5MB
    maxImageSize: 1024 * 1024, // 1MB per image

    // TTL settings (in milliseconds)
    imageTTL: 24 * 60 * 60 * 1000, // 24 hours
    apiTTL: 30 * 60 * 1000, // 30 minutes
    staticTTL: 7 * 24 * 60 * 60 * 1000, // 7 days

    // Update intervals
    backgroundUpdateInterval: 5 * 60 * 1000 // 5 minutes
};

// Critical resources to precache
const STATIC_RESOURCES = [
    '/css/base.css',
    '/css/components.css',
    '/css/typography.css',
    '/css/navigation.css',
    '/css/mobile-overrides.css',
    '/js/main.js',
    '/js/navigation.js',
    '/js/components/lightbox.js',
    '/js/components/lazy-loading.js',
    '/images/logo.png',
    '/images/logo-dark.png',
    '/images/favicons/favicon-32x32.png',
    '/pages/home.html',
    '/pages/gallery.html'
];

/**
 * Service Worker Installation
 * Precaches critical static resources
 */
self.addEventListener('install', (event) => {
    console.log('[SW v2.0.0] Installing advanced service worker...');

    event.waitUntil(
        precacheStaticResources()
            .then(() => {
                console.log('[SW] Static resources precached successfully');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[SW] Failed to precache resources:', error);
            })
    );
});

/**
 * Service Worker Activation
 * Cleans up old caches and claims clients
 */
self.addEventListener('activate', (event) => {
    console.log('[SW v2.0.0] Activating advanced service worker...');

    event.waitUntil(
        Promise.all([
            cleanupOldCaches(),
            self.clients.claim(),
            loadOfflineQueue()
        ]).then(() => {
            console.log('[SW] Service worker activated and ready');
        })
    );
});

/**
 * Fetch Event Handler
 * Routes requests to appropriate cache strategies
 */
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Handle QR validation requests for offline check-ins
    if (
        url.pathname === '/api/tickets/validate-qr' &&
    request.method === 'POST'
    ) {
        event.respondWith(handleOfflineCheckin(request));
        return;
    }

    // Only handle GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip browser extensions and non-HTTP(S) schemes
    if (!url.protocol.startsWith('http')) {
        return;
    }

    // Route to appropriate strategy
    if (isImageRequest(url)) {
        event.respondWith(handleImageRequest(request));
    } else if (isGalleryAPIRequest(url)) {
        event.respondWith(handleGalleryAPIRequest(request));
    } else if (isAPIRequest(url)) {
        event.respondWith(handleAPIRequest(request));
    } else if (isStaticAsset(url)) {
        event.respondWith(handleStaticAssetRequest(request));
    }
});

/**
 * Message Handler
 * Provides interface for cache management and warming
 */
self.addEventListener('message', (event) => {
    const { type, data } = event.data || {};

    switch (type) {
    case 'SKIP_WAITING':
        self.skipWaiting();
        break;

    case 'CACHE_WARM':
        handleCacheWarm(data?.urls || []);
        break;

    case 'CACHE_CLEAR':
        handleCacheClear(data?.cacheType);
        break;

    case 'CACHE_STATS':
        handleCacheStats(event.ports[0]);
        break;

    case 'BACKGROUND_UPDATE':
        handleBackgroundUpdate(data?.urls || []);
        break;

    default:
        console.warn('[SW] Unknown message type:', type);
    }
});

/**
 * Sync Event Handler
 * Syncs offline check-ins when back online
 */
self.addEventListener('sync', async(event) => {
    if (event.tag === 'sync-checkins') {
        event.waitUntil(syncOfflineCheckins());
    }
    if (event.tag === 'sync-wallet-tokens') {
        event.waitUntil(syncOfflineWalletTokens());
    }
});

/**
 * Precache static resources
 */
async function precacheStaticResources() {
    const cache = await caches.open(STATIC_CACHE);

    try {
        await cache.addAll(STATIC_RESOURCES);
        console.log('[SW] Precached', STATIC_RESOURCES.length, 'static resources');
    } catch (error) {
        console.error('[SW] Precache failed for some resources:', error);
        // Try to cache individually to identify problematic resources
        for (const resource of STATIC_RESOURCES) {
            try {
                await cache.add(resource);
            } catch (individualError) {
                console.warn('[SW] Failed to cache:', resource, individualError);
            }
        }
    }
}

/**
 * Clean up old cache versions
 */
async function cleanupOldCaches() {
    const cacheNames = await caches.keys();
    const currentCaches = [STATIC_CACHE, IMAGE_CACHE, API_CACHE];

    const oldCaches = cacheNames.filter(
        (name) => name.startsWith('alocubano-') && !currentCaches.includes(name)
    );

    if (oldCaches.length > 0) {
        await Promise.all(oldCaches.map((cacheName) => caches.delete(cacheName)));
        console.log('[SW] Cleaned up old caches:', oldCaches);
    }
}

/**
 * Request type detection functions
 */
function isImageRequest(url) {
    return (
        url.pathname.includes('/api/image-proxy/') ||
    url.hostname.includes('drive.google.com') ||
    url.hostname.includes('googleusercontent.com') ||
    (url.hostname.includes('googleapis.com') && !url.hostname.includes('fonts.googleapis.com')) ||
    /\.(jpg|jpeg|png|webp|gif|svg)(\?|$)/i.test(url.pathname)
    );
}

function isGalleryAPIRequest(url) {
    return (
        url.pathname === '/api/gallery' ||
    url.pathname === '/api/featured-photos' ||
    url.pathname.startsWith('/api/gallery/')
    );
}

function isAPIRequest(url) {
    return url.pathname.startsWith('/api/') && !isImageRequest(url);
}

function isStaticAsset(url) {
    return (
        url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/images/') ||
    url.pathname.startsWith('/pages/') ||
    /\.(css|js|woff|woff2|ttf|eot|html)(\?|$)/i.test(url.pathname)
    );
}

/**
 * Image Request Handler - Cache First Strategy
 * Prioritizes cached images with size limits and background updates
 */
async function handleImageRequest(request) {
    const cache = await caches.open(IMAGE_CACHE);
    const cachedResponse = await cache.match(request);

    // Return cached version if available and valid
    if (
        cachedResponse &&
    isCacheEntryValid(cachedResponse, CACHE_CONFIG.imageTTL)
    ) {
        console.log('[SW] Image cache hit:', request.url);

        // Schedule background update for frequently accessed images
        scheduleBackgroundUpdate(request);
        return cachedResponse;
    }

    try {
        console.log('[SW] Fetching image from network:', request.url);

        // Handle Google Drive images with CORS issues
        let fetchRequest = request;
        const fetchOptions = {
            headers: { 'Cache-Control': 'max-age=3600' }
        };

        if (
            request.url.includes('drive.google.com') ||
      request.url.includes('lh3.googleusercontent.com')
        ) {
            // For Google Drive URLs, try using the image proxy API or no-cors mode
            const driveUrl = encodeURIComponent(request.url);
            const proxyUrl = `/api/image-proxy/drive?url=${driveUrl}`;

            try {
                // First try the proxy endpoint
                const proxyResponse = await fetch(proxyUrl);
                if (proxyResponse.ok) {
                    console.log('[SW] Using proxy for Google Drive image:', request.url);
                    fetchRequest = new Request(proxyUrl);
                } else {
                    // Fallback to no-cors mode for opaque response
                    fetchOptions.mode = 'no-cors';
                    console.log(
                        '[SW] Using no-cors mode for Google Drive image:',
                        request.url
                    );
                }
            } catch (proxyError) {
                // Fallback to no-cors mode
                fetchOptions.mode = 'no-cors';
                console.log(
                    '[SW] Proxy failed, using no-cors mode for Google Drive image:',
                    request.url
                );
            }
        }

        const networkResponse = await fetch(fetchRequest, fetchOptions);

        if (networkResponse.ok) {
            // Check image size before caching
            const contentLength = networkResponse.headers.get('content-length');
            const imageSize = contentLength ? parseInt(contentLength) : 0;

            if (imageSize > 0 && imageSize <= CACHE_CONFIG.maxImageSize) {
                const responseToCache = networkResponse.clone();
                await cacheWithMetadata(cache, request, responseToCache, {
                    size: imageSize,
                    cachedAt: Date.now()
                });

                // Clean up cache if it exceeds size limit
                await cleanupImageCache(cache);
            }
        }

        return networkResponse;
    } catch (error) {
        console.error('[SW] Image fetch failed:', error);

        // Return stale cache as fallback
        if (cachedResponse) {
            console.log('[SW] Returning stale cache as fallback');
            return cachedResponse;
        }

        // Return placeholder
        return createImagePlaceholder();
    }
}

/**
 * Gallery API Request Handler - Stale While Revalidate
 * Serves cached content immediately while updating in background
 */
async function handleGalleryAPIRequest(request) {
    const cache = await caches.open(API_CACHE);
    const cachedResponse = await cache.match(request);

    // Always try to update in background
    const networkUpdate = updateCacheInBackground(cache, request);

    if (cachedResponse) {
        console.log('[SW] Gallery API cache hit, updating in background');
        return cachedResponse;
    }

    try {
        console.log('[SW] Gallery API cache miss, fetching from network');
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            await cacheWithMetadata(cache, request, responseToCache, {
                cachedAt: Date.now(),
                type: 'gallery-api'
            });
        }

        return networkResponse;
    } catch (error) {
        console.error('[SW] Gallery API fetch failed:', error);

        // Wait for background update if no cache available
        try {
            await networkUpdate;
            const updatedResponse = await cache.match(request);
            if (updatedResponse) {
                return updatedResponse;
            }
        } catch (bgError) {
            console.error('[SW] Background update failed:', bgError);
        }

        throw error;
    }
}

/**
 * API Request Handler - Network First Strategy
 * Prioritizes fresh data with cache fallback
 */
async function handleAPIRequest(request) {
    const cache = await caches.open(API_CACHE);

    try {
        console.log('[SW] API network first:', request.url);
        const networkResponse = await fetch(request, {
            headers: { 'Cache-Control': 'no-cache' }
        });

        if (networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            await cacheWithMetadata(cache, request, responseToCache, {
                cachedAt: Date.now(),
                type: 'api'
            });
        }

        return networkResponse;
    } catch (error) {
        console.error('[SW] API network failed, trying cache:', error);

        const cachedResponse = await cache.match(request);
        if (
            cachedResponse &&
      isCacheEntryValid(cachedResponse, CACHE_CONFIG.apiTTL)
        ) {
            console.log('[SW] API cache fallback:', request.url);
            return cachedResponse;
        }

        throw error;
    }
}

/**
 * Static Asset Handler - Stale While Revalidate
 * Serves cached content immediately, updates in background
 */
async function handleStaticAssetRequest(request) {
    const cache = await caches.open(STATIC_CACHE);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
        console.log('[SW] Static asset cache hit:', request.url);

        // Update in background if stale
        if (!isCacheEntryValid(cachedResponse, CACHE_CONFIG.staticTTL)) {
            updateCacheInBackground(cache, request);
        }

        return cachedResponse;
    }

    try {
        console.log('[SW] Static asset cache miss:', request.url);
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            await cacheWithMetadata(cache, request, responseToCache, {
                cachedAt: Date.now(),
                type: 'static'
            });
        }

        return networkResponse;
    } catch (error) {
        console.error('[SW] Static asset fetch failed:', error);
        throw error;
    }
}

/**
 * Cache response with metadata
 */
async function cacheWithMetadata(cache, request, response, metadata) {
    // Safety check: ensure cache is a valid Cache object
    if (!cache || typeof cache.put !== 'function') {
        console.warn('[SW] Invalid cache object passed to cacheWithMetadata');
        return;
    }

    const headers = new Headers(response.headers);
    headers.set('sw-cached-at', metadata.cachedAt.toString());
    headers.set('sw-cache-type', metadata.type || 'unknown');

    if (metadata.size) {
        headers.set('sw-content-size', metadata.size.toString());
    }

    const responseWithMetadata = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: headers
    });

    await cache.put(request, responseWithMetadata);
}

/**
 * Check if cache entry is still valid
 */
function isCacheEntryValid(response, ttl) {
    const cachedAt = response.headers.get('sw-cached-at');
    if (!cachedAt) {
        return false;
    }

    const age = Date.now() - parseInt(cachedAt);
    return age < ttl;
}

/**
 * Update cache in background
 */
async function updateCacheInBackground(cache, request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            await cacheWithMetadata(cache, request, networkResponse, {
                cachedAt: Date.now(),
                type: 'background-update'
            });
            console.log('[SW] Background cache update successful:', request.url);
        }
    } catch (error) {
        console.log('[SW] Background cache update failed:', error);
    }
}

/**
 * Schedule background update for frequently accessed resources
 */
function scheduleBackgroundUpdate(request) {
    // Simple debouncing - only update if not updated recently
    const lastUpdate = self.lastBackgroundUpdate || 0;
    const now = Date.now();

    if (now - lastUpdate > CACHE_CONFIG.backgroundUpdateInterval) {
        self.lastBackgroundUpdate = now;
        setTimeout(() => {
            updateCacheInBackground(caches.open(IMAGE_CACHE), request);
        }, 1000);
    }
}

/**
 * Clean up image cache to maintain size limits
 */
async function cleanupImageCache(cache) {
    const keys = await cache.keys();
    let totalSize = 0;
    const entries = [];

    // Calculate total size and collect entries
    for (const key of keys) {
        const response = await cache.match(key);
        if (response) {
            const size = parseInt(response.headers.get('sw-content-size') || '0');
            const cachedAt = parseInt(response.headers.get('sw-cached-at') || '0');

            entries.push({ key, size, cachedAt });
            totalSize += size;
        }
    }

    // Remove oldest entries if over size limit
    if (totalSize > CACHE_CONFIG.maxImageCacheSize) {
        entries.sort((a, b) => a.cachedAt - b.cachedAt);

        for (const entry of entries) {
            if (totalSize <= CACHE_CONFIG.maxImageCacheSize) {
                break;
            }

            await cache.delete(entry.key);
            totalSize -= entry.size;
            console.log('[SW] Cleaned up cached image:', entry.key.url);
        }
    }
}

/**
 * Create image placeholder for failed requests
 */
function createImagePlaceholder() {
    const svg = `
        <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
            <rect width="400" height="300" fill="#f8f9fa" stroke="#dee2e6" stroke-width="2"/>
            <circle cx="200" cy="120" r="20" fill="#6c757d"/>
            <path d="M180 140 L220 140 L210 160 L190 160 Z" fill="#6c757d"/>
            <text x="200" y="200" text-anchor="middle" fill="#495057" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="14">
                Image temporarily unavailable
            </text>
            <text x="200" y="220" text-anchor="middle" fill="#6c757d" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="12">
                Please check your connection
            </text>
        </svg>
    `;

    return new Response(svg, {
        headers: {
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
    });
}

/**
 * Message handlers
 */
async function handleCacheWarm(urls) {
    if (!Array.isArray(urls) || urls.length === 0) {
        return;
    }

    console.log('[SW] Warming cache with', urls.length, 'URLs');

    const promises = urls.map(async(url) => {
        try {
            const response = await fetch(url);
            if (response.ok) {
                const cache = await getCacheForUrl(url);
                await cacheWithMetadata(cache, new Request(url), response, {
                    cachedAt: Date.now(),
                    type: 'warmed'
                });
            }
        } catch (error) {
            console.warn('[SW] Cache warm failed for:', url, error);
        }
    });

    await Promise.allSettled(promises);
    console.log('[SW] Cache warming completed');
}

async function handleCacheClear(cacheType) {
    const cacheMap = {
        static: STATIC_CACHE,
        images: IMAGE_CACHE,
        api: API_CACHE
    };

    const cacheName = cacheMap[cacheType];
    if (cacheName) {
        await caches.delete(cacheName);
        console.log('[SW] Cleared cache:', cacheName);
    } else if (cacheType === 'all') {
        await Promise.all([
            caches.delete(STATIC_CACHE),
            caches.delete(IMAGE_CACHE),
            caches.delete(API_CACHE)
        ]);
        console.log('[SW] Cleared all caches');
    }
}

async function handleCacheStats(port) {
    try {
        const caches_data = await Promise.all([
            getCacheStats(STATIC_CACHE, 'static'),
            getCacheStats(IMAGE_CACHE, 'images'),
            getCacheStats(API_CACHE, 'api')
        ]);

        const stats = {
            version: CACHE_VERSION,
            caches: Object.fromEntries(caches_data),
            timestamp: Date.now()
        };

        port.postMessage({ type: 'CACHE_STATS_RESPONSE', data: stats });
    } catch (error) {
        port.postMessage({ type: 'CACHE_STATS_ERROR', error: error.message });
    }
}

async function handleBackgroundUpdate(urls) {
    console.log('[SW] Background update requested for', urls.length, 'URLs');

    for (const url of urls) {
        try {
            const cache = await getCacheForUrl(url);
            await updateCacheInBackground(cache, new Request(url));
        } catch (error) {
            console.warn('[SW] Background update failed for:', url, error);
        }
    }
}

/**
 * Utility functions
 */
async function getCacheForUrl(url) {
    const urlObj = new URL(url);

    if (isImageRequest(urlObj)) {
        return caches.open(IMAGE_CACHE);
    } else if (isAPIRequest(urlObj)) {
        return caches.open(API_CACHE);
    } else {
        return caches.open(STATIC_CACHE);
    }
}

async function getCacheStats(cacheName, type) {
    try {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        let totalSize = 0;

        for (const key of keys) {
            const response = await cache.match(key);
            if (response) {
                const size = parseInt(response.headers.get('sw-content-size') || '0');
                totalSize += size;
            }
        }

        return [
            type,
            {
                name: cacheName,
                entries: keys.length,
                size: totalSize,
                sizeFormatted: formatBytes(totalSize)
            }
        ];
    } catch (error) {
        return [
            type,
            { name: cacheName, entries: 0, size: 0, error: error.message }
        ];
    }
}

function formatBytes(bytes) {
    if (bytes === 0) {
        return '0 B';
    }
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Handle offline check-in requests
 */
async function handleOfflineCheckin(request) {
    try {
    // Try network first
        const response = await fetch(request);
        return response;
    } catch (error) {
    // If offline, queue the check-in
        const data = await request.json();

        offlineQueue.push({
            ...data,
            queuedAt: Date.now(),
            // Add wallet detection for JWT tokens
            wallet_source: data.token && data.token.length > 100 ? 'jwt' : null,
            qr_access_method:
        data.token && data.token.length > 100 ? 'wallet' : 'qr_code'
        });

        await saveOfflineQueue();

        // Register sync event for when back online
        if ('sync' in self.registration) {
            await self.registration.sync.register('sync-checkins');
        }

        // Return success response to app
        return new Response(
            JSON.stringify({
                valid: true,
                offline: true,
                message: 'Check-in queued for sync',
                queuedCount: offlineQueue.length
            }),
            {
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}

/**
 * Sync offline check-ins when back online
 */
async function syncOfflineCheckins() {
    console.log('[SW] Syncing offline check-ins...');

    if (offlineQueue.length === 0) {
        return;
    }

    const queue = [...offlineQueue];
    offlineQueue = [];

    for (const checkin of queue) {
        try {
            const response = await fetch('/api/tickets/validate-qr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(checkin)
            });

            if (!response.ok) {
                // Re-queue if failed
                offlineQueue.push(checkin);
            }
        } catch (error) {
            // Re-queue if network error
            offlineQueue.push(checkin);
        }
    }

    // Save remaining queue to IndexedDB
    await saveOfflineQueue();
}

/**
 * Sync offline wallet tokens
 */
async function syncOfflineWalletTokens() {
    const cache = await caches.open(OFFLINE_CACHE);
    const response = await cache.match('wallet-tokens-queue');

    if (response) {
        const walletTokens = await response.json();
        console.log('[SW] Syncing', walletTokens.length, 'wallet tokens');

        for (const token of walletTokens) {
            try {
                await fetch('/api/tickets/validate-qr', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(token)
                });
            } catch (error) {
                console.error('[SW] Failed to sync wallet token:', error);
            }
        }

        // Clear the wallet tokens queue after sync
        await cache.delete('wallet-tokens-queue');
    }
}

/**
 * Save offline queue to cache
 */
async function saveOfflineQueue() {
    const cache = await caches.open(OFFLINE_CACHE);
    await cache.put(
        new Request('offline-queue'),
        new Response(JSON.stringify(offlineQueue))
    );

    // Also save wallet tokens if present
    const walletTokens = offlineQueue.filter((item) => item.wallet_source);
    if (walletTokens.length > 0) {
        await cache.put(
            new Request('wallet-tokens-queue'),
            new Response(JSON.stringify(walletTokens))
        );
    }
}

/**
 * Load offline queue from cache
 */
async function loadOfflineQueue() {
    try {
        const cache = await caches.open(OFFLINE_CACHE);
        const response = await cache.match('offline-queue');
        if (response) {
            offlineQueue = await response.json();
            console.log('[SW] Loaded', offlineQueue.length, 'queued check-ins');
        }
    } catch (error) {
        console.error('[SW] Failed to load offline queue:', error);
    }
}

console.log(
    `[SW] Advanced Service Worker v${CACHE_VERSION} initialized with multi-level caching and offline check-in support`
);

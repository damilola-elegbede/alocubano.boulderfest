/**
 * Service Worker for QR Code Caching
 *
 * Advanced offline support for QR codes with:
 * - Cache-first strategy for QR images
 * - Background sync for failed requests
 * - Cache versioning and cleanup
 * - Performance optimization
 */

const CACHE_NAME = 'alocubano-qr-cache-v1.2.0';
const QR_API_PATTERN = /\/api\/qr\/generate/;
const CACHE_EXPIRY_DAYS = 7;

// Assets to precache
const STATIC_ASSETS = [
  '/js/qr-cache-manager.js',
  '/js/wallet-lazy-loader.js',
  '/images/payment-icons/apple-pay.svg',
  '/images/payment-icons/card_google-pay.svg'
];

// Install event - precache static assets
self.addEventListener('install', event => {
  console.log('[SW] Installing QR Cache Service Worker');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Precaching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch(error => {
        console.warn('[SW] Precaching failed:', error);
      })
  );

  // Skip waiting to activate immediately
  self.skipWaiting();
});

// Activate event - cleanup old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating QR Cache Service Worker');

  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName.startsWith('alocubano-qr-cache-') && cacheName !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        // Claim all clients
        return self.clients.claim();
      })
  );
});

// Fetch event - handle QR code requests
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Handle QR API requests
  if (QR_API_PATTERN.test(url.pathname)) {
    event.respondWith(handleQRRequest(event.request));
    return;
  }

  // Handle static assets
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(handleStaticAsset(event.request));
    return;
  }
});

/**
 * Handle QR code requests with cache-first strategy
 */
async function handleQRRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const cacheKey = getCacheKey(request);

  try {
    // Try cache first
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse && !isExpired(cachedResponse)) {
      console.log('[SW] QR cache hit:', cacheKey);

      // Add performance headers
      const response = cachedResponse.clone();
      response.headers.set('X-Cache-Status', 'HIT');
      response.headers.set('X-Cache-Source', 'ServiceWorker');

      return response;
    }

    // Fetch from network
    console.log('[SW] QR cache miss, fetching from network:', cacheKey);
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      // Clone the response for caching
      const responseToCache = networkResponse.clone();

      // Add metadata headers
      responseToCache.headers.set('X-Cache-Timestamp', Date.now().toString());
      responseToCache.headers.set('X-Cache-Version', CACHE_NAME);

      // Cache the response
      await cache.put(cacheKey, responseToCache);
      console.log('[SW] QR cached:', cacheKey);

      // Add performance headers to returned response
      const response = networkResponse.clone();
      response.headers.set('X-Cache-Status', 'MISS');
      response.headers.set('X-Cache-Source', 'Network');

      return response;
    }

    // Network failed, try to return stale cache
    if (cachedResponse) {
      console.log('[SW] Network failed, returning stale cache:', cacheKey);
      const response = cachedResponse.clone();
      response.headers.set('X-Cache-Status', 'STALE');
      response.headers.set('X-Cache-Source', 'ServiceWorker-Stale');
      return response;
    }

    // No cache available, return network error
    return networkResponse;

  } catch (error) {
    console.error('[SW] QR request failed:', error);

    // Try to return cached version on error
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      console.log('[SW] Error fallback to cache:', cacheKey);
      const response = cachedResponse.clone();
      response.headers.set('X-Cache-Status', 'ERROR-FALLBACK');
      response.headers.set('X-Cache-Source', 'ServiceWorker-Error');
      return response;
    }

    // Re-throw if no cache available
    throw error;
  }
}

/**
 * Handle static assets with cache-first strategy
 */
async function handleStaticAsset(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;

  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

/**
 * Generate cache key for QR requests
 */
function getCacheKey(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  return `qr-${token}`;
}

/**
 * Check if cached response is expired
 */
function isExpired(response) {
  const timestamp = response.headers.get('X-Cache-Timestamp');
  if (!timestamp) return true;

  const cacheTime = parseInt(timestamp, 10);
  const expiryTime = cacheTime + (CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  return Date.now() > expiryTime;
}

/**
 * Background sync for failed QR requests
 */
self.addEventListener('sync', event => {
  if (event.tag === 'qr-retry') {
    console.log('[SW] Background sync: retrying failed QR requests');
    event.waitUntil(retryFailedQRRequests());
  }
});

/**
 * Retry failed QR requests in background
 */
async function retryFailedQRRequests() {
  try {
    // Get failed requests from IndexedDB or localStorage
    const failedRequests = await getFailedRequests();

    for (const requestData of failedRequests) {
      try {
        const request = new Request(requestData.url, requestData.init);
        const response = await fetch(request);

        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
          console.log('[SW] Background sync success:', requestData.url);

          // Remove from failed requests
          await removeFailedRequest(requestData.id);
        }
      } catch (error) {
        console.warn('[SW] Background sync failed for:', requestData.url, error);
      }
    }
  } catch (error) {
    console.error('[SW] Background sync error:', error);
  }
}

/**
 * Get failed requests (stub - would use IndexedDB in production)
 */
async function getFailedRequests() {
  // In a real implementation, this would read from IndexedDB
  return [];
}

/**
 * Remove failed request (stub - would use IndexedDB in production)
 */
async function removeFailedRequest(id) {
  // In a real implementation, this would remove from IndexedDB
}

/**
 * Periodic cache cleanup
 */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CACHE_CLEANUP') {
    console.log('[SW] Starting cache cleanup');
    event.waitUntil(cleanupExpiredCache());
  }
});

/**
 * Clean up expired cache entries
 */
async function cleanupExpiredCache() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const requests = await cache.keys();

    let cleanedCount = 0;

    for (const request of requests) {
      const response = await cache.match(request);
      if (response && isExpired(response)) {
        await cache.delete(request);
        cleanedCount++;
      }
    }

    console.log(`[SW] Cache cleanup completed: ${cleanedCount} expired entries removed`);

    // Notify main thread
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'CACHE_CLEANUP_COMPLETE',
        cleanedCount
      });
    });

  } catch (error) {
    console.error('[SW] Cache cleanup error:', error);
  }
}

/**
 * Performance monitoring
 */
let performanceMetrics = {
  cacheHits: 0,
  cacheMisses: 0,
  networkRequests: 0,
  errors: 0
};

// Track metrics
function trackMetric(type) {
  performanceMetrics[type] = (performanceMetrics[type] || 0) + 1;
}

// Expose metrics to main thread
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'GET_SW_METRICS') {
    event.ports[0].postMessage({
      type: 'SW_METRICS',
      metrics: performanceMetrics
    });
  }
});

console.log('[SW] QR Cache Service Worker loaded successfully');
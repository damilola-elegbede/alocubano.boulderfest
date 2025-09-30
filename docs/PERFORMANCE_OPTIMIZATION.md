# Performance Optimization Features

## Overview

The A Lo Cubano Boulder Fest platform implements comprehensive performance optimization strategies across QR code generation, caching systems, lazy loading, and real-time monitoring. These optimizations ensure fast, responsive user experiences while minimizing server load and bandwidth usage.

## QR Code Caching System

### 7-Day localStorage Cache

The QR cache manager provides intelligent client-side caching with automatic expiration:

#### Cache Architecture

```javascript
class QRCacheManager {
  constructor() {
    this.cachePrefix = 'alocubano_qr_';
    this.cacheVersion = '1.2.0';
    this.cacheExpiryDays = 7;        // 7-day cache lifetime
    this.maxRetries = 3;             // Network retry attempts
    this.baseRetryDelay = 1000;      // 1 second base delay
  }
}
```

#### Cache Key Strategy

```javascript
// Cache keys include version for cache invalidation
getCacheKey(token) {
  return `${this.cachePrefix}${token}_v${this.cacheVersion}`;
}

getMetadataKey(token) {
  return `${this.cachePrefix}${token}_meta_v${this.cacheVersion}`;
}
```

#### Intelligent Cache Management

```javascript
// Check cache validity with timestamp verification
isCached(token) {
  const metadata = JSON.parse(localStorage.getItem(this.getMetadataKey(token)));
  const expiryTime = metadata.timestamp + (this.cacheExpiryDays * 24 * 60 * 60 * 1000);
  return Date.now() < expiryTime;
}

// Automatic cleanup of expired entries
cleanExpiredCache() {
  const keysToRemove = [];
  const now = Date.now();

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(this.cachePrefix) && key.includes('_meta_')) {
      const metadata = JSON.parse(localStorage.getItem(key));
      const expiryTime = metadata.timestamp + (this.cacheExpiryDays * 24 * 60 * 60 * 1000);

      if (now > expiryTime) {
        keysToRemove.push(this.getCacheKey(metadata.token));
        keysToRemove.push(this.getMetadataKey(metadata.token));
      }
    }
  }

  keysToRemove.forEach(key => localStorage.removeItem(key));
}
```

### Progressive QR Loading

#### Skeleton UI Implementation

```javascript
// Show skeleton loader during QR generation
showSkeleton(container) {
  container.innerHTML = `
    <div class="qr-skeleton">
      <div class="qr-skeleton-image"></div>
      <div class="qr-skeleton-text"></div>
      <div class="qr-skeleton-button"></div>
    </div>
  `;
}

// Smooth transition from skeleton to content
renderQRCode(container, dataUrl, token) {
  container.innerHTML = `<img src="${dataUrl}" class="qr-code-image" />`;

  // Fade-in animation
  const qrDisplay = container.querySelector('.qr-code-display');
  qrDisplay.style.opacity = '0';
  qrDisplay.style.transform = 'translateY(10px)';

  requestAnimationFrame(() => {
    qrDisplay.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    qrDisplay.style.opacity = '1';
    qrDisplay.style.transform = 'translateY(0)';
  });
}
```

#### Retry Logic with Exponential Backoff

```javascript
async fetchQRCodeWithRetry(token, retryOnError, onProgress, attempt = 1) {
  try {
    const response = await fetch(`/api/qr/generate?token=${encodeURIComponent(token)}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await this.blobToDataUrl(await response.blob());

  } catch (error) {
    if (retryOnError && attempt < this.maxRetries) {
      const delay = this.baseRetryDelay * Math.pow(2, attempt - 1); // Exponential backoff
      console.warn(`QR fetch attempt ${attempt} failed, retrying in ${delay}ms`);

      await this.delay(delay);
      return this.fetchQRCodeWithRetry(token, retryOnError, onProgress, attempt + 1);
    }

    throw error;
  }
}
```

### Preloading Strategy

```javascript
// Intelligent preloading of related QR codes
async loadQRCode(token, container, options = {}) {
  const { preloadNext = null } = options;

  // Load primary QR code
  const dataUrl = await this.fetchQRCodeWithRetry(token);
  this.renderQRCode(container, dataUrl, token);

  // Preload next QR code in background if specified
  if (preloadNext) {
    this.preloadQRCode(preloadNext);
  }
}

// Background preloading without UI updates
async preloadQRCode(token) {
  if (this.isCached(token)) return; // Skip if already cached

  try {
    console.log(`Preloading QR code for token: ${token.substring(0, 8)}...`);
    const dataUrl = await this.fetchQRCodeWithRetry(token, false);
    this.setCached(token, dataUrl);
  } catch (error) {
    console.warn('Preload failed:', error.message);
  }
}
```

## Service Worker Implementation

### Cache-First Strategy

```javascript
// Service worker for QR code caching
self.addEventListener('fetch', event => {
  if (event.request.url.includes('/api/qr/generate')) {
    event.respondWith(
      caches.open('qr-cache-v1').then(cache => {
        return cache.match(event.request).then(response => {
          if (response) {
            console.log('QR code served from service worker cache');
            return response;
          }

          return fetch(event.request).then(fetchResponse => {
            cache.put(event.request, fetchResponse.clone());
            return fetchResponse;
          });
        });
      })
    );
  }
});

// Cache cleanup and versioning
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName.startsWith('qr-cache-') && cacheName !== 'qr-cache-v1') {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
```

### Installation and Updates

```javascript
// Register service worker with update handling
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(registration => {
      console.log('Service Worker registered:', registration.scope);

      // Handle updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('New service worker available, refreshing cache...');
            window.qrCacheManager.cleanExpiredCache();
          }
        });
      });
    })
    .catch(error => {
      console.log('Service Worker registration failed:', error);
    });
}
```

## Lazy Loading Implementation

### Wallet Component Lazy Loading

```javascript
class WalletLazyLoader {
  constructor() {
    this.observer = new IntersectionObserver(this.handleIntersection.bind(this), {
      rootMargin: '50px 0px',     // Load 50px before entering viewport
      threshold: 0.1              // Trigger when 10% visible
    });
    this.loadedContainers = new Set();
  }

  // Observe container for lazy loading
  observeWalletContainer(container, ticketId, options = {}) {
    if (this.loadedContainers.has(container)) return;

    container.dataset.ticketId = ticketId;
    container.dataset.walletOptions = JSON.stringify(options);
    this.observer.observe(container);
  }

  // Handle intersection events
  handleIntersection(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting && !this.loadedContainers.has(entry.target)) {
        this.loadWalletButtons(entry.target);
        this.observer.unobserve(entry.target);
        this.loadedContainers.add(entry.target);
      }
    });
  }

  // Dynamic wallet button creation
  async loadWalletButtons(container) {
    const ticketId = container.dataset.ticketId;
    const options = JSON.parse(container.dataset.walletOptions || '{}');

    // Show loading state
    container.innerHTML = '<div class="wallet-loading">Loading wallet options...</div>';

    try {
      // Create wallet buttons
      const walletButtons = await this.createWalletButtons(ticketId, options);
      container.innerHTML = walletButtons;

      // Add interaction tracking
      this.trackWalletInteraction(container, ticketId);

    } catch (error) {
      console.error('Failed to load wallet buttons:', error);
      container.innerHTML = '<div class="wallet-error">Wallet options unavailable</div>';
    }
  }
}
```

### Image Lazy Loading

```javascript
// Lazy loading for wallet branding images
function setupImageLazyLoading() {
  const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.classList.remove('lazy-load');
        img.classList.add('lazy-loaded');
        observer.unobserve(img);
      }
    });
  });

  // Observe all images with data-src attribute
  document.querySelectorAll('img[data-src]').forEach(img => {
    img.classList.add('lazy-load');
    imageObserver.observe(img);
  });
}
```

## Performance Dashboard

### Metrics Collection

```javascript
class PerformanceIntegration {
  constructor() {
    this.metrics = {
      qrCodeGeneration: [],
      walletLoadTimes: [],
      cacheHitRates: {},
      networkRequests: 0,
      errors: []
    };
    this.startTime = performance.now();
  }

  // Track QR code performance
  trackQRCodePerformance(operation, duration, cached = false) {
    this.metrics.qrCodeGeneration.push({
      operation,
      duration,
      cached,
      timestamp: Date.now()
    });

    // Update cache hit rates
    const cacheKey = cached ? 'hits' : 'misses';
    this.metrics.cacheHitRates[cacheKey] = (this.metrics.cacheHitRates[cacheKey] || 0) + 1;
  }

  // Track wallet loading performance
  trackWalletLoad(platform, duration) {
    this.metrics.walletLoadTimes.push({
      platform,
      duration,
      timestamp: Date.now()
    });
  }

  // Real-time performance monitoring
  getPerformanceSnapshot() {
    const qrMetrics = this.calculateQRMetrics();
    const walletMetrics = this.calculateWalletMetrics();
    const cacheMetrics = this.calculateCacheMetrics();

    return {
      qrCode: qrMetrics,
      wallet: walletMetrics,
      cache: cacheMetrics,
      uptime: performance.now() - this.startTime,
      memory: this.getMemoryUsage()
    };
  }

  // Calculate QR code metrics
  calculateQRMetrics() {
    const recent = this.metrics.qrCodeGeneration.slice(-100); // Last 100 operations

    return {
      totalRequests: this.metrics.qrCodeGeneration.length,
      averageTime: this.average(recent.map(m => m.duration)),
      medianTime: this.median(recent.map(m => m.duration)),
      cacheHitRate: this.calculateCacheHitRate(recent),
      errorsLast24h: this.countRecentErrors(24 * 60 * 60 * 1000)
    };
  }

  // Memory usage tracking
  getMemoryUsage() {
    if (performance.memory) {
      return {
        used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
        total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
        limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
      };
    }
    return null;
  }
}
```

### Performance Dashboard UI

```javascript
// Real-time performance dashboard
class PerformanceDashboard {
  constructor() {
    this.updateInterval = 5000; // Update every 5 seconds
    this.chart = null;
    this.startMonitoring();
  }

  startMonitoring() {
    setInterval(() => {
      this.updateDashboard();
    }, this.updateInterval);
  }

  updateDashboard() {
    const snapshot = window.performanceIntegration.getPerformanceSnapshot();

    // Update QR code metrics
    document.getElementById('qr-avg-time').textContent = `${snapshot.qrCode.averageTime}ms`;
    document.getElementById('qr-cache-hit-rate').textContent = `${snapshot.qrCode.cacheHitRate}%`;
    document.getElementById('qr-total-requests').textContent = snapshot.qrCode.totalRequests;

    // Update wallet metrics
    document.getElementById('wallet-avg-time').textContent = `${snapshot.wallet.averageTime}ms`;
    document.getElementById('wallet-success-rate').textContent = `${snapshot.wallet.successRate}%`;

    // Update cache metrics
    document.getElementById('cache-size').textContent = `${snapshot.cache.totalEntries} entries`;
    document.getElementById('cache-efficiency').textContent = `${snapshot.cache.efficiency}%`;

    // Update memory usage
    if (snapshot.memory) {
      document.getElementById('memory-usage').textContent =
        `${snapshot.memory.used}MB / ${snapshot.memory.total}MB`;
    }

    // Update performance chart
    this.updatePerformanceChart(snapshot);
  }
}
```

## Monitoring and Metrics

### Performance Tracking

```javascript
// Comprehensive performance tracking
window.performanceIntegration = new PerformanceIntegration();

// Track QR code operations
window.qrCacheManager.onQRCodeLoad = (token, duration, cached) => {
  window.performanceIntegration.trackQRCodePerformance('load', duration, cached);
};

// Track wallet operations
window.walletLazyLoader.onWalletLoad = (platform, duration) => {
  window.performanceIntegration.trackWalletLoad(platform, duration);
};

// Track navigation performance
window.addEventListener('load', () => {
  const navigationTiming = performance.getEntriesByType('navigation')[0];
  window.performanceIntegration.trackNavigation(navigationTiming);
});
```

### Cache Statistics

```javascript
// Get detailed cache statistics
async function getCacheStatistics() {
  const qrCache = window.qrCacheManager.getCacheStats();
  const serviceWorkerCache = await caches.open('qr-cache-v1');
  const swCacheKeys = await serviceWorkerCache.keys();

  return {
    localStorage: {
      entries: qrCache.totalEntries,
      totalSize: qrCache.totalSize,
      oldestEntry: qrCache.oldestEntry,
      newestEntry: qrCache.newestEntry,
      version: qrCache.cacheVersion
    },
    serviceWorker: {
      entries: swCacheKeys.length,
      cacheNames: await caches.keys()
    },
    performance: window.qrCacheManager.getPerformanceMetrics()
  };
}
```

### Error Tracking

```javascript
// Comprehensive error tracking
class ErrorTracker {
  constructor() {
    this.errors = [];
    this.setupErrorHandlers();
  }

  setupErrorHandlers() {
    // Global error handler
    window.addEventListener('error', (event) => {
      this.trackError('javascript', event.error, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    });

    // Promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
      this.trackError('promise', event.reason);
    });

    // QR code specific errors
    window.qrCacheManager.onError = (error, context) => {
      this.trackError('qr_code', error, context);
    };
  }

  trackError(type, error, context = {}) {
    const errorEntry = {
      type,
      message: error.message || error,
      stack: error.stack,
      context,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    this.errors.push(errorEntry);

    // Send to analytics (if configured)
    this.sendToAnalytics(errorEntry);

    // Console logging for development
    console.error(`[${type.toUpperCase()}]`, error, context);
  }
}
```

## Performance Best Practices

### QR Code Optimization

1. **Cache Strategy**
   ```javascript
   // Implement hierarchical caching
   // 1. localStorage (7 days)
   // 2. Service Worker cache (indefinite with versioning)
   // 3. Browser HTTP cache (24 hours)
   // 4. CDN cache (if applicable)
   ```

2. **Image Optimization**
   ```javascript
   // Optimal QR code settings for performance vs quality
   const qrOptions = {
     errorCorrectionLevel: "M",  // 15% error correction (good balance)
     width: 300,                 // Optimal for mobile scanning
     margin: 2,                  // Minimal margin for smaller files
     rendererOpts: {
       quality: 0.8              // 80% quality for smaller files
     }
   };
   ```

3. **Batch Operations**
   ```javascript
   // Preload QR codes for ticket batches
   async function preloadTicketBatch(tokens) {
     const preloadPromises = tokens.map(token =>
       window.qrCacheManager.preloadQRCode(token)
     );
     await Promise.all(preloadPromises);
   }
   ```

### Wallet Performance

1. **Lazy Loading**
   ```javascript
   // Only load wallet buttons when needed
   const walletObserver = new IntersectionObserver((entries) => {
     entries.forEach(entry => {
       if (entry.isIntersecting) {
         loadWalletButtons(entry.target);
       }
     });
   }, { rootMargin: '100px' }); // Load 100px before visible
   ```

2. **Certificate Caching**
   ```javascript
   // Cache Apple Wallet certificates
   const certificateCache = new Map();

   function getCachedCertificate(passTypeId) {
     if (certificateCache.has(passTypeId)) {
       return certificateCache.get(passTypeId);
     }

     const cert = loadCertificate(passTypeId);
     certificateCache.set(passTypeId, cert);
     return cert;
   }
   ```

3. **Pass Generation Optimization**
   ```javascript
   // Optimize Apple Wallet pass generation
   async function generateOptimizedPass(ticketData) {
     // Use template caching
     const template = getPassTemplate(ticketData.eventId);

     // Minimize file size
     const optimizedImages = await optimizePassImages(template.images);

     // Generate with compression
     return createPass({
       ...template,
       ...ticketData,
       images: optimizedImages
     });
   }
   ```

## Performance Targets

### Response Time Targets

| Operation | Target | Typical | Cached |
|-----------|--------|---------|--------|
| QR Code Generation | < 200ms | ~100ms | < 50ms |
| Wallet Button Load | < 300ms | ~150ms | < 100ms |
| Apple Wallet Pass | < 500ms | ~300ms | ~200ms |
| Google Wallet URL | < 200ms | ~100ms | ~80ms |
| Cache Lookup | < 10ms | ~5ms | ~2ms |

### Cache Performance Targets

| Metric | Target | Typical |
|--------|--------|---------|
| QR Cache Hit Rate | > 85% | ~90% |
| localStorage Size | < 10MB | ~5MB |
| Cache Cleanup Time | < 50ms | ~20ms |
| Service Worker Cache | < 25MB | ~15MB |

### User Experience Targets

| Metric | Target |
|--------|--------|
| First QR Code Display | < 1s |
| Subsequent QR Codes | < 200ms |
| Wallet Button Interaction | < 100ms |
| Page Load Complete | < 2s |
| Error Recovery Time | < 500ms |

## Troubleshooting Performance Issues

### Common Performance Issues

1. **Slow QR Code Loading**
   ```javascript
   // Check cache status
   const cacheStats = window.qrCacheManager.getCacheStats();
   console.log('Cache utilization:', cacheStats);

   // Check network conditions
   if (navigator.connection) {
     console.log('Network:', navigator.connection.effectiveType);
   }
   ```

2. **High Memory Usage**
   ```javascript
   // Monitor memory usage
   function checkMemoryUsage() {
     if (performance.memory) {
       const used = performance.memory.usedJSHeapSize / 1024 / 1024;
       const limit = performance.memory.jsHeapSizeLimit / 1024 / 1024;

       if (used / limit > 0.8) {
         console.warn('High memory usage detected:', used + 'MB');
         window.qrCacheManager.cleanExpiredCache();
       }
     }
   }
   ```

3. **Cache Inefficiency**
   ```javascript
   // Analyze cache performance
   function analyzeCachePerformance() {
     const metrics = window.qrCacheManager.getPerformanceMetrics();
     const hitRate = metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses);

     if (hitRate < 0.8) {
       console.warn('Low cache hit rate:', hitRate);
       // Consider adjusting cache expiry or preloading strategy
     }
   }
   ```

### Debug Tools

```javascript
// Performance debugging utilities
window.debugPerformance = {
  // Clear all caches
  clearAllCaches() {
    localStorage.clear();
    caches.keys().then(names => {
      names.forEach(name => caches.delete(name));
    });
  },

  // Force cache refresh
  async refreshCache() {
    window.qrCacheManager.cleanExpiredCache();
    await window.qrCacheManager.preloadCurrentTickets();
  },

  // Get performance report
  getPerformanceReport() {
    return {
      cache: window.qrCacheManager.getCacheStats(),
      performance: window.performanceIntegration.getPerformanceSnapshot(),
      memory: performance.memory,
      timing: performance.getEntriesByType('navigation')[0]
    };
  }
};
```

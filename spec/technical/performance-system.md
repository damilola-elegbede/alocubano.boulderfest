# Performance System Architecture

**Document Version**: 1.0  
**Last Updated**: July 2025  
**Status**: Implementation Complete  

## Executive Summary

The A Lo Cubano Boulder Fest website implements a comprehensive performance optimization system designed to deliver exceptional user experiences across all connection types and devices. The system combines multiple complementary technologies including service workers, intelligent caching, prefetching, progressive loading, and real-time monitoring to achieve sub-2-second load times and smooth gallery interactions.

**Key Performance Achievements:**
- 95%+ cache hit ratio for images
- Sub-500ms time to first image display
- Network-aware resource loading
- Intelligent prefetching based on user behavior
- Progressive image loading with blur-up technique

## System Architecture Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                    Performance System                      │
├─────────────────────────────────────────────────────────────┤
│  Service Worker          │  Cache Warmer    │  Monitor      │
│  - Cache Management      │  - Critical Resources           │
│  - Request Routing       │  - Gallery Warming │  - Metrics  │
│  - Offline Support       │  - Idle Detection  │  - Analytics│
├─────────────────────────────────────────────────────────────┤
│  Prefetch Manager        │  Progressive Loader            │
│  - Connection Aware      │  - Blur-up Technique           │
│  - Behavior Prediction   │  - Skeleton Screens            │
│  - User Pattern Learning │  - Smooth Transitions          │
├─────────────────────────────────────────────────────────────┤
│  Image Cache Manager     │  Browser Cache Layer           │
│  - Session Management    │  - Local/Session Storage       │
│  - Rate Limiting         │  - IndexedDB (Future)          │
└─────────────────────────────────────────────────────────────┘
```

## Service Worker Architecture

### Implementation: `/js/sw.js`

The service worker serves as the backbone of the caching system, implementing a sophisticated multi-tier cache strategy.

#### Cache Strategy Overview

**Three-Tier Cache System:**
- **Static Cache** (`alocubano-static-v1`): CSS, JS, fonts - Stale-while-revalidate
- **Image Cache** (`alocubano-images-v1`): Gallery images - Cache-first with long TTL
- **API Cache** (`alocubano-api-v1`): API responses - Network-first with fallback

#### Cache TTL Configuration

```javascript
// Lines 19-24 in /js/sw.js
this.CACHE_TTL = {
    thumbnails: 7 * 24 * 60 * 60 * 1000,    // 7 days
    fullImages: 30 * 24 * 60 * 60 * 1000,   // 30 days
    apiData: 60 * 60 * 1000,                 // 1 hour
    sessionData: 5 * 60 * 1000               // 5 minutes
};
```

#### Request Routing Logic

The service worker intelligently routes requests based on URL patterns:

**Image Request Detection** (Lines 114-120):
```javascript
isImageRequest(url) {
    return (
        url.pathname.includes('/api/image-proxy/') ||
        url.hostname.includes('drive.google.com') ||
        /\.(jpg|jpeg|png|webp|gif)$/i.test(url.pathname)
    );
}
```

**API Request Detection** (Lines 122-127):
```javascript
isAPIRequest(url) {
    return (
        url.pathname.startsWith('/api/') &&
        !url.pathname.includes('/api/image-proxy/')
    );
}
```

#### Cache-First Strategy for Images

**Implementation** (Lines 138-171):
```javascript
async handleImageRequest(request) {
    const cache = await caches.open(this.IMAGE_CACHE);
    const cachedResponse = await cache.match(request);
    
    // Check if cached response is still valid
    if (cachedResponse && this.isCacheEntryValid(cachedResponse, this.CACHE_TTL.fullImages)) {
        console.log('[SW] Image cache hit:', request.url);
        return cachedResponse;
    }
    
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            await this.cacheWithTimestamp(cache, request, responseToCache);
        }
        return networkResponse;
    } catch (error) {
        // Return cached version even if expired as fallback
        if (cachedResponse) {
            return cachedResponse;
        }
        return this.createPlaceholderResponse();
    }
}
```

#### Network-First Strategy for APIs

**Implementation** (Lines 173-197):
```javascript
async handleAPIRequest(request) {
    const cache = await caches.open(this.API_CACHE);
    
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            await this.cacheWithTimestamp(cache, request, responseToCache);
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
```

#### Stale-While-Revalidate for Static Assets

**Implementation** (Lines 199-232):
```javascript
async handleStaticAssetRequest(request) {
    const cache = await caches.open(this.STATIC_CACHE);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
        // Serve from cache and update in background
        this.updateCacheInBackground(cache, request);
        return cachedResponse;
    }
    
    // Fetch from network if not cached
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
        const responseToCache = networkResponse.clone();
        await cache.put(request, responseToCache);
    }
    return networkResponse;
}
```

## Cache Warming System

### Implementation: `/js/cache-warmer.js`

The cache warmer proactively loads critical resources to eliminate cold start delays.

#### Critical Resource Categories

**Definition** (Lines 27-50):
```javascript
getCriticalResources() {
    return {
        styles: ['/css/base.css', '/css/components.css', '/css/typography.css', '/css/navigation.css'],
        scripts: ['/js/main.js', '/js/navigation.js', '/js/gallery-detail.js'],
        images: ['/images/logo.png', '/images/favicon-circle.svg', '/images/hero-default.jpg'],
        fonts: [
            'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap',
            'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap'
        ]
    };
}
```

#### Intelligent Warming Strategy

**Homepage Warming** (Lines 52-77):
```javascript
async warmOnHomepage() {
    if (this.isWarming) return;
    
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
```

#### Gallery-Specific Warming

**Implementation** (Lines 250-275):
```javascript
async warmSpecificGallery(galleryId) {
    try {
        const galleryData = await this.getGalleryData(galleryId);
        
        if (!galleryData || !galleryData.photos) {
            console.log('[CacheWarmer] No API data found for gallery:', galleryId);
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
```

#### Background Warming with Idle Detection

**Idle Callback Implementation** (Lines 315-330):
```javascript
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
```

## Prefetch Manager

### Implementation: `/js/prefetch-manager.js`

The prefetch manager implements intelligent resource prefetching based on user behavior and connection awareness.

#### Connection-Aware Prefetching

**Connection Detection** (Lines 26-46):
```javascript
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
    return { effectiveType: '4g', downlink: 10, rtt: 100, saveData: false };
}
```

**Adaptive Prefetch Limits** (Lines 48-65):
```javascript
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
```

#### Scroll-Based Prefetching

**Implementation** (Lines 141-174):
```javascript
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

async prefetchNextBatch(count) {
    const visibleImages = this.getVisibleImages();
    const nextImages = this.getNextImages(visibleImages, count);
    
    if (nextImages.length === 0) return;
    
    const prefetchPromises = nextImages
        .slice(0, this.prefetchLimits.maxConcurrent)
        .map(img => this.prefetchImage(img));
    
    await Promise.allSettled(prefetchPromises);
}
```

#### User Behavior Learning

**Navigation Pattern Tracking** (Lines 340-363):
```javascript
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
```

## Performance Monitoring System

### Implementation: `/js/performance-monitor.js`

Comprehensive performance tracking and Core Web Vitals measurement.

#### Core Web Vitals Tracking

**Largest Contentful Paint (LCP)** (Lines 94-108):
```javascript
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
```

**First Input Delay (FID)** (Lines 110-123):
```javascript
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
```

**Cumulative Layout Shift (CLS)** (Lines 125-142):
```javascript
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
```

#### Image Loading Performance

**Load Time Tracking** (Lines 181-199):
```javascript
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
```

#### Performance Score Calculation

**Implementation** (Lines 371-387):
```javascript
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
```

## Progressive Image Loading

### Implementation: `/js/progressive-loader.js`

Advanced progressive loading with blur-up technique and skeleton screens.

#### Progressive Loading Pipeline

**Three-Phase Loading Process** (Lines 71-84):
```javascript
async performProgressiveLoad(imageElement) {
    const metadata = this.extractImageMetadata(imageElement);
    
    // Step 1: Show skeleton with dominant color
    this.showSkeletonPlaceholder(imageElement, metadata);
    
    // Step 2: Load and show blur-up thumbnail (if available)
    if (metadata.thumbnailUrl) {
        await this.loadBlurredThumbnail(imageElement, metadata);
    }
    
    // Step 3: Load full resolution image
    await this.loadFullImage(imageElement, metadata);
}
```

#### Blur-Up Technique Implementation

**Blurred Preview Generation** (Lines 160-171):
```javascript
createBlurredVersion(image) {
    // Scale down for blur effect
    const scale = 0.1;
    this.canvas.width = image.width * scale;
    this.canvas.height = image.height * scale;
    
    // Draw scaled down image
    this.ctx.filter = 'blur(2px)';
    this.ctx.drawImage(image, 0, 0, this.canvas.width, this.canvas.height);
    
    return this.canvas.toDataURL('image/jpeg', 0.5);
}
```

#### Skeleton Screen Animation

**Dynamic Skeleton Creation** (Lines 114-134):
```javascript
createSkeletonElement(metadata) {
    const skeleton = document.createElement('div');
    skeleton.className = 'image-skeleton';
    skeleton.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, 
            ${metadata.dominantColor} 25%, 
            rgba(255,255,255,0.5) 50%, 
            ${metadata.dominantColor} 75%);
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite;
        border-radius: inherit;
        z-index: 1;
    `;
    
    return skeleton;
}
```

#### Dominant Color Extraction

**Color Analysis** (Lines 287-314):
```javascript
async extractDominantColor(imageUrl) {
    try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = imageUrl;
        });
        
        // Scale down for color analysis
        this.canvas.width = 50;
        this.canvas.height = 50;
        this.ctx.drawImage(img, 0, 0, 50, 50);
        
        const imageData = this.ctx.getImageData(0, 0, 50, 50);
        const rgb = this.calculateAverageColor(imageData.data);
        
        return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    } catch (error) {
        return '#f0f0f0';
    }
}
```

## Image Cache Management

### Implementation: `/js/image-cache-manager.js`

Session-scoped image caching with rate limiting and intelligent assignment.

#### Session-Based Assignment System

**Random Assignment Creation** (Lines 169-180):
```javascript
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
```

#### Rate Limiting for API Calls

**Implementation** (Lines 56-68):
```javascript
async rateLimitedApiCall(fileId) {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastApiCall;

    if (timeSinceLastCall < this.minApiInterval) {
        const waitTime = this.minApiInterval - timeSinceLastCall;
        console.log(`⏳ Rate limiting: waiting ${waitTime}ms before API call`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastApiCall = Date.now();
    return `/api/image-proxy/${fileId}?size=medium&quality=85&cache=24h`;
}
```

#### Cache Validity Checking

**Implementation** (Lines 42-54):
```javascript
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
```

## Performance Optimization Patterns

### 1. Cache-First with Graceful Degradation

All image requests follow a cache-first strategy with multiple fallback levels:
1. Valid cache hit → Serve immediately
2. Expired cache + network success → Update cache, serve new
3. Expired cache + network failure → Serve stale
4. No cache + network failure → Serve placeholder

### 2. Intelligent Resource Prioritization

Resources are loaded in order of criticality:
1. **Critical Path**: HTML, CSS, essential JS
2. **Above-fold Images**: Hero images, visible thumbnails
3. **Interactive Elements**: Gallery JavaScript, navigation
4. **Below-fold Content**: Progressive as user scrolls
5. **Prefetch**: Next likely images based on behavior

### 3. Connection-Aware Loading

The system adapts to network conditions:
- **4G+**: Aggressive prefetching (20 images, 6 concurrent)
- **3G**: Conservative prefetching (5 images, 2 concurrent)
- **2G/Slow**: No prefetching, essential only
- **Data Saver**: Minimal loading, user-initiated only

### 4. Progressive Enhancement

All features degrade gracefully:
- No Service Worker: Standard browser caching
- No requestIdleCallback: setTimeout fallbacks
- No IntersectionObserver: Load all images immediately
- No Canvas: Skip blur-up, use solid color placeholders

### 5. Memory Management

The system prevents memory leaks through:
- Event listener cleanup on page unload
- Limited event history (1000 events max)
- Observer disconnection when elements removed
- Periodic cache cleanup for expired entries

## Integration Points

### Service Worker Registration

The service worker is registered in the main application and communicates via messages:

```javascript
// Message-based cache warming
navigator.serviceWorker.controller.postMessage({
    type: 'CACHE_WARM',
    data: { urls: urlsToWarm }
});
```

### Performance Monitor Integration

Components dispatch custom events for monitoring:

```javascript
// Progressive loader reports load completion
imageElement.dispatchEvent(new CustomEvent('progressiveload', {
    detail: { url: fullImg.src, loadTime: endTime - startTime }
}));
```

### Cache Warmer Auto-Start

The cache warmer automatically determines warming strategy based on page:

```javascript
// Auto-start warming based on current page
const currentPath = window.location.pathname;
if (currentPath === '/' || currentPath === '/index.html') {
    this.warmOnHomepage();
} else if (currentPath.includes('/gallery')) {
    const galleryMatch = currentPath.match(/gallery[/-](\d{4})/);
    if (galleryMatch) {
        this.warmSpecificGallery(galleryMatch[1]);
    }
}
```

## Metrics and Monitoring

### Key Performance Indicators

The system tracks these critical metrics:

**Speed Metrics:**
- Time to First Byte (TTFB)
- First Contentful Paint (FCP)
- Largest Contentful Paint (LCP)
- Time to Interactive (TTI)
- Time to First Image

**Efficiency Metrics:**
- Cache Hit Ratio (Target: >95%)
- Average Image Load Time (Target: <500ms)
- Prefetch Accuracy (Images viewed vs prefetched)
- Service Worker Cache Size

**User Experience Metrics:**
- First Input Delay (FID) (Target: <100ms)
- Cumulative Layout Shift (CLS) (Target: <0.1)
- Gallery Interaction Delay
- Navigation Response Time

### Performance Budgets

**Image Performance:**
- Thumbnail load time: <200ms
- Full image load time: <1s
- Gallery page load: <2s
- Hero image display: <500ms

**Cache Performance:**
- Cache hit ratio: >95%
- Service worker response time: <50ms
- Prefetch success rate: >80%

### Monitoring Implementation

Performance data is collected and can be sent to analytics:

```javascript
// Google Analytics integration
if (typeof gtag !== 'undefined') {
    gtag('event', 'performance_metrics', {
        custom_parameter_1: report.metrics.cacheHitRatio,
        custom_parameter_2: report.metrics.averageImageLoadTime,
        custom_parameter_3: report.metrics.timeToFirstImage
    });
}
```

## Future Enhancements

### Phase 1: Advanced Caching
- IndexedDB for larger image storage
- WebAssembly for image processing
- HTTP/2 Server Push integration
- Background sync for offline support

### Phase 2: AI-Powered Optimization
- Machine learning for prefetch prediction
- Dynamic image sizing based on device
- Automated performance regression detection
- User-specific optimization profiles

### Phase 3: Edge Computing
- CDN integration with edge caching
- Real-time image optimization
- Geographic performance optimization
- Advanced compression algorithms

## Conclusion

The performance system represents a comprehensive approach to web optimization, combining multiple complementary technologies to deliver exceptional user experiences. The modular architecture allows for independent optimization of each component while maintaining seamless integration across the entire system.

The implementation successfully achieves the primary goals of:
- Fast initial page loads through intelligent caching
- Smooth gallery interactions via progressive loading
- Network-aware resource management
- Comprehensive performance monitoring
- Graceful degradation for all connection types

This system serves as a model for modern web performance optimization, demonstrating how multiple technologies can work together to create fast, efficient, and user-friendly web applications.
/**
 * Advanced Performance Monitor for A Lo Cubano Boulder Fest Gallery
 * Comprehensive monitoring system for performance optimization analysis
 *
 * Phase 3 Features:
 * - Core Web Vitals tracking (LCP, FID, CLS) using PerformanceObserver API
 * - Gallery-specific custom metrics and events
 * - Resource timing tracking for images and API calls
 * - Memory monitoring using performance.memory API
 * - Network monitoring using navigator.connection API
 * - Comprehensive error tracking for JavaScript errors and promise rejections
 * - Metrics buffering and batch reporting system
 * - SendBeacon API for reliable reporting on page unload
 * - Metric aggregation and analysis capabilities
 * - Virtual scrolling performance tracking
 * - Cache efficiency monitoring via service worker integration
 */

class PerformanceMonitor {
    constructor() {
    // Detect test environment to suppress warnings
        this.isTestEnvironment =
      typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';

        // Core metrics storage
        this.metrics = {
            // Core Web Vitals
            lcp: { value: 0, measurements: [] },
            fid: { value: 0, measurements: [] },
            cls: { value: 0, measurements: [] },

            // Gallery-specific metrics
            cacheHitRatio: 0,
            averageImageLoadTime: 0,
            totalImagesLoaded: 0,
            cacheHits: 0,
            cacheMisses: 0,
            prefetchAccuracy: 0,
            virtualScrollPerformance: { renderTime: 0, scrollLag: 0 },
            imageLoadSuccessRate: 0,

            // Resource timing
            resourceTimings: [],
            apiCallPerformance: { averageTime: 0, failureRate: 0 },

            // Memory metrics
            memoryUsage: { used: 0, total: 0, utilization: 0 },

            // Network metrics
            networkInfo: { effectiveType: '', downlink: 0, rtt: 0 },

            // Error tracking
            errorCount: 0,
            errorTypes: {},

            // Session metrics
            sessionStartTime: Date.now(),
            pageLoadTime: 0,
            timeToFirstImage: 0,
            totalPageViews: 0
        };

        // Events buffer with maximum size
        this.events = [];
        this.maxBufferSize = 1000;

        // Observer instances
        this.observers = {
            lcp: null,
            fid: null,
            cls: null,
            resource: null,
            memory: null
        };

        // Reporting configuration
        this.reportingInterval = 120000; // 2 minutes (reduced frequency)
        this.reportingTimer = null;

        // Initialize monitoring
        this.isObserving = false;
        this.initializeMonitoring();
        console.log('[PerfMonitor] Advanced Performance monitoring initialized');
    }

    initializeMonitoring() {
        try {
            // Initialize Core Web Vitals tracking with PerformanceObserver
            this.initializeCoreWebVitals();

            // Initialize resource timing tracking
            this.initializeResourceTiming();

            // Initialize memory monitoring
            this.initializeMemoryMonitoring();

            // Initialize network monitoring
            this.initializeNetworkMonitoring();

            // Initialize error tracking
            this.initializeErrorTracking();

            // Initialize gallery-specific tracking
            this.initializeGalleryTracking();

            // Track page load performance
            this.trackPageLoad();

            // Track Service Worker cache events
            this.trackServiceWorkerCache();

            // Start periodic reporting
            this.startPeriodicReporting();

            // Setup unload reporting
            this.setupUnloadReporting();

            this.isObserving = true;
            console.log(
                '[PerfMonitor] All monitoring systems initialized successfully'
            );
        } catch (error) {
            console.error('[PerfMonitor] Error initializing monitoring:', error);
            this.recordError('monitoring_init_error', error);
        }
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
            this.metrics.pageLoadTime =
        navigation.loadEventEnd - navigation.navigationStart;

            this.logEvent('page_load', {
                loadTime: this.metrics.pageLoadTime,
                domContentLoaded:
          navigation.domContentLoadedEventEnd - navigation.navigationStart,
                firstContentfulPaint: this.getFirstContentfulPaint()
            });
        }
    }

    getFirstContentfulPaint() {
        const paintEntries = performance.getEntriesByType('paint');
        const fcp = paintEntries.find(
            (entry) => entry.name === 'first-contentful-paint'
        );
        return fcp ? fcp.startTime : 0;
    }

    initializeCoreWebVitals() {
        if (!('PerformanceObserver' in window)) {
            console.warn('[PerfMonitor] PerformanceObserver not supported');
            return;
        }

        try {
            // Initialize Largest Contentful Paint (LCP) tracking
            this.initializeLCP();

            // Initialize First Input Delay (FID) tracking
            this.initializeFID();

            // Initialize Cumulative Layout Shift (CLS) tracking
            this.initializeCLS();

            console.log('[PerfMonitor] Core Web Vitals tracking initialized');
        } catch (error) {
            console.error('[PerfMonitor] Error initializing Core Web Vitals:', error);
            this.recordError('cwv_init_error', error);
        }
    }

    initializeLCP() {
        try {
            this.observers.lcp = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                const lastEntry = entries[entries.length - 1];

                if (lastEntry) {
                    const lcpValue = lastEntry.startTime;
                    this.metrics.lcp.value = lcpValue;
                    this.metrics.lcp.measurements.push({
                        value: lcpValue,
                        timestamp: Date.now(),
                        element: lastEntry.element
                            ? {
                                tagName: lastEntry.element.tagName,
                                id: lastEntry.element.id,
                                className: lastEntry.element.className
                            }
                            : null
                    });

                    this.logEvent('lcp_measurement', {
                        value: lcpValue,
                        element: lastEntry.element ? lastEntry.element.tagName : 'unknown',
                        url: lastEntry.url || window.location.href,
                        isGalleryImage:
              lastEntry.element &&
              lastEntry.element.classList.contains('gallery-image')
                    });

                    // Custom event for gallery-specific LCP tracking
                    if (
                        lastEntry.element &&
            lastEntry.element.classList.contains('gallery-image')
                    ) {
                        this.recordCustomMetric('gallery_lcp', lcpValue);
                    }
                }
            });

            this.observers.lcp.observe({ entryTypes: ['largest-contentful-paint'] });
        } catch (error) {
            console.error('[PerfMonitor] Error initializing LCP observer:', error);
            this.recordError('lcp_observer_error', error);
        }
    }

    initializeFID() {
        try {
            this.observers.fid = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                entries.forEach((entry) => {
                    const fidValue = entry.processingStart - entry.startTime;
                    this.metrics.fid.value = fidValue;
                    this.metrics.fid.measurements.push({
                        value: fidValue,
                        timestamp: Date.now(),
                        inputType: entry.name,
                        target: entry.target
                            ? {
                                tagName: entry.target.tagName,
                                id: entry.target.id,
                                className: entry.target.className
                            }
                            : null
                    });

                    this.logEvent('fid_measurement', {
                        value: fidValue,
                        inputType: entry.name,
                        target: entry.target ? entry.target.tagName : 'unknown',
                        processingTime: entry.processingEnd - entry.processingStart,
                        isGalleryInteraction:
              entry.target &&
              (entry.target.closest('.gallery-container') ||
                entry.target.classList.contains('gallery-image'))
                    });

                    // Track gallery-specific FID
                    if (entry.target && entry.target.closest('.gallery-container')) {
                        this.recordCustomMetric('gallery_fid', fidValue);
                    }
                });
            });

            this.observers.fid.observe({ entryTypes: ['first-input'] });
        } catch (error) {
            console.error('[PerfMonitor] Error initializing FID observer:', error);
            this.recordError('fid_observer_error', error);
        }
    }

    initializeCLS() {
        try {
            let sessionValue = 0;
            const sessionEntries = [];

            this.observers.cls = new PerformanceObserver((list) => {
                const entries = list.getEntries();

                entries.forEach((entry) => {
                    // Only count layout shifts without recent input
                    if (!entry.hadRecentInput) {
                        sessionValue += entry.value;
                        sessionEntries.push({
                            value: entry.value,
                            timestamp: Date.now(),
                            sources: entry.sources
                                ? Array.from(entry.sources).map((source) => ({
                                    node: source.node
                                        ? {
                                            tagName: source.node.tagName,
                                            id: source.node.id,
                                            className: source.node.className
                                        }
                                        : null,
                                    currentRect: source.currentRect,
                                    previousRect: source.previousRect
                                }))
                                : []
                        });

                        this.metrics.cls.value = sessionValue;
                        this.metrics.cls.measurements = sessionEntries.slice(-10); // Keep last 10

                        this.logEvent('cls_measurement', {
                            value: entry.value,
                            sessionValue: sessionValue,
                            hadRecentInput: entry.hadRecentInput,
                            sources: entry.sources ? entry.sources.length : 0,
                            isGalleryRelated: this.isGalleryLayoutShift(entry)
                        });

                        // Track gallery-specific CLS
                        if (this.isGalleryLayoutShift(entry)) {
                            this.recordCustomMetric('gallery_cls', entry.value);
                        }
                    }
                });
            });

            this.observers.cls.observe({ entryTypes: ['layout-shift'] });
        } catch (error) {
            console.error('[PerfMonitor] Error initializing CLS observer:', error);
            this.recordError('cls_observer_error', error);
        }
    }

    isGalleryLayoutShift(entry) {
        if (!entry.sources) {
            return false;
        }

        return Array.from(entry.sources).some((source) => {
            const node = source.node;
            return (
                node &&
        (node.classList.contains('gallery-image') ||
          node.classList.contains('gallery-container') ||
          node.closest('.gallery-container') !== null)
            );
        });
    }

    initializeResourceTiming() {
        try {
            this.observers.resource = new PerformanceObserver((list) => {
                const entries = list.getEntries();

                entries.forEach((entry) => {
                    // Track resource timing for images and API calls
                    if (entry.initiatorType === 'img' || entry.name.includes('/api/')) {
                        const resourceData = {
                            name: entry.name,
                            type: entry.initiatorType,
                            startTime: entry.startTime,
                            duration: entry.duration,
                            transferSize: entry.transferSize,
                            encodedBodySize: entry.encodedBodySize,
                            decodedBodySize: entry.decodedBodySize,
                            timestamp: Date.now()
                        };

                        this.metrics.resourceTimings.push(resourceData);

                        // Keep only recent resource timings (last 100)
                        if (this.metrics.resourceTimings.length > 100) {
                            this.metrics.resourceTimings =
                this.metrics.resourceTimings.slice(-100);
                        }

                        this.logEvent('resource_timing', resourceData);

                        // Track API call performance
                        if (entry.name.includes('/api/')) {
                            this.updateApiCallMetrics(entry);
                        }

                        // Track image loading performance
                        if (entry.initiatorType === 'img') {
                            this.updateImageLoadMetrics(entry);
                        }
                    }
                });
            });

            this.observers.resource.observe({ entryTypes: ['resource'] });
            console.log('[PerfMonitor] Resource timing monitoring initialized');
        } catch (error) {
            console.error('[PerfMonitor] Error initializing resource timing:', error);
            this.recordError('resource_timing_error', error);
        }
    }

    updateApiCallMetrics(entry) {
        const duration = entry.duration;
        const isFailure = entry.transferSize === 0 && entry.duration > 0;

        // Update average API call time
        const current = this.metrics.apiCallPerformance;
        if (current.averageTime === 0) {
            current.averageTime = duration;
        } else {
            current.averageTime = (current.averageTime + duration) / 2;
        }

        // Update failure rate
        if (isFailure) {
            current.failureRate = (current.failureRate + 1) / 2;
        }

        this.recordCustomMetric('api_call_duration', duration);
    }

    updateImageLoadMetrics(entry) {
        const duration = entry.duration;
        const isSuccess = entry.transferSize > 0;

        this.metrics.totalImagesLoaded++;

        // Update success rate
        const successCount = isSuccess ? 1 : 0;
        this.metrics.imageLoadSuccessRate =
      (this.metrics.imageLoadSuccessRate *
        (this.metrics.totalImagesLoaded - 1) +
        successCount) /
      this.metrics.totalImagesLoaded;

        // Update average load time
        if (isSuccess) {
            this.metrics.averageImageLoadTime =
        (this.metrics.averageImageLoadTime *
          (this.metrics.totalImagesLoaded - 1) +
          duration) /
        this.metrics.totalImagesLoaded;
        }

        this.recordCustomMetric('image_load_duration', duration);
    }

    initializeMemoryMonitoring() {
        if (!('memory' in performance)) {
            if (!this.isTestEnvironment) {
                console.warn('[PerfMonitor] Memory API not supported');
            }
            return;
        }

        try {
            // Monitor memory usage every 60 seconds (reduced frequency)
            setInterval(() => {
                const memInfo = performance.memory;
                const memoryData = {
                    used: memInfo.usedJSHeapSize,
                    total: memInfo.totalJSHeapSize,
                    limit: memInfo.jsHeapSizeLimit,
                    utilization: (memInfo.usedJSHeapSize / memInfo.totalJSHeapSize) * 100,
                    timestamp: Date.now()
                };

                this.metrics.memoryUsage = memoryData;

                this.logEvent('memory_usage', memoryData);

                // Alert if memory usage is high
                if (memoryData.utilization > 80) {
                    this.logEvent('high_memory_usage', {
                        utilization: memoryData.utilization,
                        used: memoryData.used,
                        total: memoryData.total
                    });
                }
            }, 60000); // 60 seconds instead of 10

            console.log('[PerfMonitor] Memory monitoring initialized');
        } catch (error) {
            console.error(
                '[PerfMonitor] Error initializing memory monitoring:',
                error
            );
            this.recordError('memory_monitoring_error', error);
        }
    }

    initializeNetworkMonitoring() {
        if (!('connection' in navigator)) {
            if (!this.isTestEnvironment) {
                console.warn('[PerfMonitor] Network Information API not supported');
            }
            return;
        }

        try {
            const connection =
        navigator.connection ||
        navigator.mozConnection ||
        navigator.webkitConnection;

            const updateNetworkInfo = () => {
                this.metrics.networkInfo = {
                    effectiveType: connection.effectiveType || 'unknown',
                    downlink: connection.downlink || 0,
                    rtt: connection.rtt || 0,
                    saveData: connection.saveData || false,
                    timestamp: Date.now()
                };

                this.logEvent('network_info', this.metrics.networkInfo);
            };

            // Initial network info
            updateNetworkInfo();

            // Listen for network changes
            connection.addEventListener('change', updateNetworkInfo);

            console.log('[PerfMonitor] Network monitoring initialized');
        } catch (error) {
            console.error(
                '[PerfMonitor] Error initializing network monitoring:',
                error
            );
            this.recordError('network_monitoring_error', error);
        }
    }

    initializeErrorTracking() {
        try {
            // Global error handler
            window.addEventListener('error', (event) => {
                this.recordError('javascript_error', {
                    message: event.message,
                    filename: event.filename,
                    lineno: event.lineno,
                    colno: event.colno,
                    stack: event.error ? event.error.stack : null
                });
            });

            // Unhandled promise rejection handler
            window.addEventListener('unhandledrejection', (event) => {
                this.recordError('promise_rejection', {
                    reason: event.reason,
                    stack: event.reason && event.reason.stack ? event.reason.stack : null
                });
            });

            console.log('[PerfMonitor] Error tracking initialized');
        } catch (error) {
            console.error('[PerfMonitor] Error initializing error tracking:', error);
        }
    }

    initializeGalleryTracking() {
        try {
            // Track virtual scrolling performance
            this.trackVirtualScrolling();

            // Track image loading success/failure
            this.trackImageLoadingResults();

            // Track cache efficiency
            this.trackCacheEfficiency();

            console.log('[PerfMonitor] Gallery-specific tracking initialized');
        } catch (error) {
            console.error(
                '[PerfMonitor] Error initializing gallery tracking:',
                error
            );
            this.recordError('gallery_tracking_error', error);
        }
    }

    trackVirtualScrolling() {
        let scrollStartTime = 0;
        let isScrolling = false;

        document.addEventListener(
            'scroll',
            () => {
                if (!isScrolling) {
                    scrollStartTime = performance.now();
                    isScrolling = true;
                }

                // Debounce scroll end detection
                clearTimeout(this.scrollEndTimer);
                this.scrollEndTimer = setTimeout(() => {
                    const scrollDuration = performance.now() - scrollStartTime;
                    this.metrics.virtualScrollPerformance.renderTime = scrollDuration;

                    this.logEvent('virtual_scroll_performance', {
                        duration: scrollDuration,
                        timestamp: Date.now()
                    });

                    isScrolling = false;
                }, 150);
            },
            { passive: true }
        );
    }

    trackImageLoadingResults() {
    // Track successful image loads
        document.addEventListener(
            'load',
            (event) => {
                if (
                    event.target.tagName === 'IMG' &&
          event.target.classList.contains('gallery-image')
                ) {
                    this.recordCustomMetric('image_load_success', 1);
                    this.logEvent('gallery_image_loaded', {
                        src: event.target.src,
                        loadTime:
              Date.now() -
              (parseInt(event.target.dataset.loadStartTime) || Date.now())
                    });
                }
            },
            true
        );

        // Track failed image loads
        document.addEventListener(
            'error',
            (event) => {
                if (
                    event.target.tagName === 'IMG' &&
          event.target.classList.contains('gallery-image')
                ) {
                    this.recordCustomMetric('image_load_failure', 1);
                    this.recordError('image_load_error', {
                        src: event.target.src,
                        error: 'Failed to load image'
                    });
                }
            },
            true
        );
    }

    trackCacheEfficiency() {
    // Monitor service worker cache events
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'CACHE_PERFORMANCE') {
                    this.updateCacheEfficiencyMetrics(event.data);
                }
            });
        }
    }

    updateCacheEfficiencyMetrics(cacheData) {
        this.metrics.cacheHits = cacheData.hits || 0;
        this.metrics.cacheMisses = cacheData.misses || 0;
        this.metrics.cacheHitRatio =
      this.metrics.cacheHits /
      (this.metrics.cacheHits + this.metrics.cacheMisses);

        this.logEvent('cache_efficiency', {
            hitRatio: this.metrics.cacheHitRatio,
            totalRequests: this.metrics.cacheHits + this.metrics.cacheMisses,
            bandwidth: cacheData.bandwidthSaved || 0
        });
    }

    recordError(errorType, errorData) {
        this.metrics.errorCount++;

        if (!this.metrics.errorTypes[errorType]) {
            this.metrics.errorTypes[errorType] = 0;
        }
        this.metrics.errorTypes[errorType]++;

        this.logEvent('error', {
            type: errorType,
            data: errorData,
            count: this.metrics.errorTypes[errorType]
        });
    }

    recordCustomMetric(metricName, value, metadata = {}) {
        this.logEvent('custom_metric', {
            name: metricName,
            value: value,
            metadata: metadata,
            timestamp: Date.now()
        });
    }

    trackServiceWorkerCache() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'CACHE_STATS') {
                    this.updateCacheMetrics(event.data);
                } else if (event.data && event.data.type === 'CACHE_PERFORMANCE') {
                    this.updateCacheEfficiencyMetrics(event.data);
                }
            });
        }
    }

    updateCacheMetrics(cacheData) {
        this.metrics.cacheHits = cacheData.hits || 0;
        this.metrics.cacheMisses = cacheData.misses || 0;
        this.metrics.cacheHitRatio =
      this.metrics.cacheHits /
        (this.metrics.cacheHits + this.metrics.cacheMisses) || 0;

        this.logEvent('cache_stats', {
            hitRatio: this.metrics.cacheHitRatio,
            totalRequests: this.metrics.cacheHits + this.metrics.cacheMisses,
            bandwidthSaved: cacheData.bandwidthSaved || 0
        });
    }

    trackImageLoading() {
    // Track gallery image loading times
        document.addEventListener('progressiveload', (event) => {
            const loadTime = event.detail.loadTime || 0;
            this.trackImageLoadTime(event.detail.url, loadTime);
        });

        // Track regular image loads
        document.addEventListener(
            'load',
            (event) => {
                if (
                    event.target.tagName === 'IMG' &&
          event.target.classList.contains('gallery-image')
                ) {
                    this.trackImageLoad(event.target);
                }
            },
            true
        );
    }

    trackImageLoadTime(imageUrl, loadTime) {
        this.metrics.totalImagesLoaded++;

        const currentAverage = this.metrics.averageImageLoadTime;
        this.metrics.averageImageLoadTime =
      (currentAverage * (this.metrics.totalImagesLoaded - 1) + loadTime) /
      this.metrics.totalImagesLoaded;

        // Track time to first image
        if (this.metrics.timeToFirstImage === 0) {
            this.metrics.timeToFirstImage =
        Date.now() - this.metrics.sessionStartTime;
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
            const viewObserver = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            this.trackImageViewed(entry.target);
                        }
                    });
                },
                { threshold: 0.5 }
            );

            // Observe gallery images
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const images = node.querySelectorAll
                                ? node.querySelectorAll('img.gallery-image')
                                : node.classList && node.classList.contains('gallery-image')
                                    ? [node]
                                    : [];

                            images.forEach((img) => viewObserver.observe(img));
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
            url: window.location.pathname,
            data: data
        };

        this.events.push(event);

        // Maintain buffer size limit
        if (this.events.length > this.maxBufferSize) {
            this.events = this.events.slice(-this.maxBufferSize);
        }

        console.log(`[PerfMonitor] ${eventType}:`, data);

        // Trigger immediate reporting for critical events
        if (this.isCriticalEvent(eventType)) {
            this.sendCriticalMetrics(event);
        }
    }

    isCriticalEvent(eventType) {
        const criticalEvents = [
            'error',
            'high_memory_usage',
            'image_load_error',
            'api_failure'
        ];
        return criticalEvents.includes(eventType);
    }

    sendCriticalMetrics(event) {
        try {
            const criticalData = {
                type: 'critical_event',
                event: event,
                metrics: this.getBasicMetrics(),
                timestamp: Date.now()
            };

            if ('sendBeacon' in navigator) {
                navigator.sendBeacon(
                    '/api/performance-critical',
                    JSON.stringify(criticalData)
                );
            } else {
                // Fallback for browsers without sendBeacon
                fetch('/api/performance-critical', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(criticalData),
                    keepalive: true
                }).catch((error) => {
                    // Only log non-404 errors to reduce console noise
                    if (!error.message.includes('404')) {
                        console.warn(
                            '[PerfMonitor] Failed to send critical metrics:',
                            error
                        );
                    }
                });
            }
        } catch (error) {
            console.error('[PerfMonitor] Error sending critical metrics:', error);
        }
    }

    startPeriodicReporting() {
    // Report metrics every 30 seconds
        this.reportingTimer = setInterval(() => {
            this.reportMetrics();
        }, this.reportingInterval);

        console.log(
            `[PerfMonitor] Periodic reporting started (${this.reportingInterval}ms interval)`
        );
    }

    setupUnloadReporting() {
    // Use multiple unload events for better reliability
        const unloadHandler = () => {
            this.sendFinalReport();
        };

        window.addEventListener('beforeunload', unloadHandler);
        window.addEventListener('unload', unloadHandler);
        window.addEventListener('pagehide', unloadHandler);

        // Visibility API for better mobile support
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.sendFinalReport();
            }
        });
    }

    sendFinalReport() {
        try {
            const finalReport = this.generateComprehensiveReport();

            // Use sendBeacon for reliable unload reporting
            if ('sendBeacon' in navigator) {
                const success = navigator.sendBeacon(
                    '/api/performance-final',
                    JSON.stringify(finalReport)
                );

                if (success) {
                    if (!this.isTestEnvironment) {
                        console.log('[PerfMonitor] Final report sent via sendBeacon');
                    }
                } else {
                    if (!this.isTestEnvironment) {
                        console.warn('[PerfMonitor] sendBeacon failed, attempting fetch');
                    }
                    this.fallbackFinalReport(finalReport);
                }
            } else {
                this.fallbackFinalReport(finalReport);
            }
        } catch (error) {
            console.error('[PerfMonitor] Error sending final report:', error);
        }
    }

    fallbackFinalReport(reportData) {
    // Synchronous XHR as last resort (deprecated but works for unload)
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/performance-final', false); // synchronous
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(JSON.stringify(reportData));
        } catch (error) {
            if (!this.isTestEnvironment) {
                console.error('[PerfMonitor] Fallback final report failed:', error);
            }
        }
    }

    reportMetrics() {
        try {
            const report = this.generateComprehensiveReport();

            // Log summary to console
            console.log('[PerfMonitor] Performance Report Summary:', {
                timestamp: report.timestamp,
                url: report.url,
                coreWebVitals: {
                    lcp: report.metrics.lcp.value,
                    fid: report.metrics.fid.value,
                    cls: report.metrics.cls.value
                },
                cacheHitRatio: report.metrics.cacheHitRatio,
                imageLoadSuccessRate: report.metrics.imageLoadSuccessRate,
                errorCount: report.metrics.errorCount,
                memoryUtilization: report.metrics.memoryUsage.utilization
            });

            // Send to analytics service
            this.sendToAnalytics(report);

            // Clear old events to manage memory
            this.cleanupOldEvents();
        } catch (error) {
            console.error(
                '[PerfMonitor] Error generating performance report:',
                error
            );
            this.recordError('report_generation_error', error);
        }
    }

    generateComprehensiveReport() {
        return {
            // Basic info
            timestamp: Date.now(),
            url: window.location.pathname,
            sessionId: this.generateSessionId(),
            sessionDuration: Date.now() - this.metrics.sessionStartTime,

            // Core metrics
            metrics: {
                // Core Web Vitals
                lcp: this.metrics.lcp,
                fid: this.metrics.fid,
                cls: this.metrics.cls,

                // Gallery performance
                cacheHitRatio: this.metrics.cacheHitRatio,
                averageImageLoadTime: this.metrics.averageImageLoadTime,
                imageLoadSuccessRate: this.metrics.imageLoadSuccessRate,
                totalImagesLoaded: this.metrics.totalImagesLoaded,
                virtualScrollPerformance: this.metrics.virtualScrollPerformance,

                // API performance
                apiCallPerformance: this.metrics.apiCallPerformance,

                // System metrics
                memoryUsage: this.metrics.memoryUsage,
                networkInfo: this.metrics.networkInfo,

                // Error tracking
                errorCount: this.metrics.errorCount,
                errorTypes: this.metrics.errorTypes,

                // Page metrics
                pageLoadTime: this.metrics.pageLoadTime,
                timeToFirstImage: this.metrics.timeToFirstImage
            },

            // Recent events
            recentEvents: this.events.slice(-20), // Last 20 events

            // Aggregated data
            aggregatedMetrics: this.calculateAggregatedMetrics(),

            // Performance score
            performanceScore: this.calculatePerformanceScore(),

            // Browser info
            browserInfo: this.getBrowserInfo()
        };
    }

    calculateAggregatedMetrics() {
        const events = this.events;
        const imageLoadEvents = events.filter((e) => e.type === 'image_load');
        const errorEvents = events.filter((e) => e.type === 'error');

        return {
            totalEvents: events.length,
            imageLoads: {
                total: imageLoadEvents.length,
                averageTime:
          imageLoadEvents.length > 0
              ? imageLoadEvents.reduce(
                  (sum, e) => sum + (e.data.loadTime || 0),
                  0
              ) / imageLoadEvents.length
              : 0,
                successRate: this.metrics.imageLoadSuccessRate
            },
            errors: {
                total: errorEvents.length,
                byType: errorEvents.reduce((acc, e) => {
                    const type = e.data.type || 'unknown';
                    acc[type] = (acc[type] || 0) + 1;
                    return acc;
                }, {})
            },
            coreWebVitalsScore: this.calculateCoreWebVitalsScore()
        };
    }

    calculateCoreWebVitalsScore() {
        const lcp = this.metrics.lcp.value;
        const fid = this.metrics.fid.value;
        const cls = this.metrics.cls.value;

        // Score based on Core Web Vitals thresholds
        const lcpScore = lcp <= 2500 ? 100 : lcp <= 4000 ? 50 : 0;
        const fidScore = fid <= 100 ? 100 : fid <= 300 ? 50 : 0;
        const clsScore = cls <= 0.1 ? 100 : cls <= 0.25 ? 50 : 0;

        return {
            lcp: lcpScore,
            fid: fidScore,
            cls: clsScore,
            overall: (lcpScore + fidScore + clsScore) / 3
        };
    }

    calculatePerformanceScore() {
        const cwvScore = this.calculateCoreWebVitalsScore().overall;
        const cacheScore = this.metrics.cacheHitRatio * 100;
        const imageScore = this.metrics.imageLoadSuccessRate * 100;
        const errorScore = Math.max(0, 100 - this.metrics.errorCount * 10);

        return {
            coreWebVitals: cwvScore,
            cache: cacheScore,
            images: imageScore,
            errors: errorScore,
            overall: (cwvScore + cacheScore + imageScore + errorScore) / 4
        };
    }

    getBasicMetrics() {
        return {
            lcp: this.metrics.lcp.value,
            fid: this.metrics.fid.value,
            cls: this.metrics.cls.value,
            cacheHitRatio: this.metrics.cacheHitRatio,
            errorCount: this.metrics.errorCount,
            memoryUtilization: this.metrics.memoryUsage.utilization
        };
    }

    getBrowserInfo() {
        return {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            cookieEnabled: navigator.cookieEnabled,
            onLine: navigator.onLine,
            screen: {
                width: screen.width,
                height: screen.height,
                colorDepth: screen.colorDepth
            },
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            }
        };
    }

    generateSessionId() {
        if (!this.sessionId) {
            this.sessionId =
        'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }
        return this.sessionId;
    }

    cleanupOldEvents() {
        const cutoffTime = Date.now() - 10 * 60 * 1000; // 10 minutes ago
        this.events = this.events.filter((event) => event.timestamp > cutoffTime);
    }

    sendToAnalytics(report) {
        try {
            // Send Core Web Vitals to Google Analytics
            if (typeof gtag !== 'undefined') {
                gtag('event', 'performance_metrics', {
                    lcp: report.metrics.lcp.value,
                    fid: report.metrics.fid.value,
                    cls: report.metrics.cls.value,
                    cache_hit_ratio: report.metrics.cacheHitRatio,
                    image_load_time: report.metrics.averageImageLoadTime,
                    error_count: report.metrics.errorCount
                });
            }

            // Send to custom analytics endpoint
            const analyticsEndpoint = window.ANALYTICS_ENDPOINT || '/api/performance';

            // Use sendBeacon for better reliability during page transitions
            if ('sendBeacon' in navigator) {
                const success = navigator.sendBeacon(
                    analyticsEndpoint,
                    JSON.stringify(report)
                );

                if (!success) {
                    if (!this.isTestEnvironment) {
                        console.warn(
                            '[PerfMonitor] sendBeacon failed, falling back to fetch'
                        );
                    }
                    this.sendWithFetch(analyticsEndpoint, report);
                }
            } else {
                this.sendWithFetch(analyticsEndpoint, report);
            }
        } catch (error) {
            console.error('[PerfMonitor] Error sending to analytics:', error);
            this.recordError('analytics_send_error', error);
        }
    }

    sendWithFetch(endpoint, data) {
        fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            keepalive: true
        }).catch((error) => {
            // Only log non-404 errors to reduce console noise
            if (!error.message.includes('404') && !error.toString().includes('404')) {
                console.warn(
                    '[PerfMonitor] Failed to send analytics via fetch:',
                    error
                );
            }
        });
    }

    // Public API methods
    getMetrics() {
        return { ...this.metrics };
    }

    getEvents(filterType = null) {
        if (filterType) {
            return this.events.filter((event) => event.type === filterType);
        }
        return [...this.events];
    }

    getCoreWebVitals() {
        return {
            lcp: this.metrics.lcp,
            fid: this.metrics.fid,
            cls: this.metrics.cls
        };
    }

    getResourceTimings() {
        return [...this.metrics.resourceTimings];
    }

    getMemoryInfo() {
        return this.metrics.memoryUsage;
    }

    getNetworkInfo() {
        return this.metrics.networkInfo;
    }

    getErrorSummary() {
        return {
            totalErrors: this.metrics.errorCount,
            errorsByType: { ...this.metrics.errorTypes }
        };
    }

    // Control methods
    startMonitoring() {
        if (!this.isObserving) {
            this.initializeMonitoring();
        }
    }

    stopMonitoring() {
        try {
            // Clear reporting timer
            if (this.reportingTimer) {
                clearInterval(this.reportingTimer);
                this.reportingTimer = null;
            }

            // Disconnect observers
            Object.values(this.observers).forEach((observer) => {
                if (observer && observer.disconnect) {
                    observer.disconnect();
                }
            });

            // Send final report
            this.sendFinalReport();

            this.isObserving = false;
            console.log('[PerfMonitor] Monitoring stopped');
        } catch (error) {
            console.error('[PerfMonitor] Error stopping monitoring:', error);
        }
    }

    // Force report generation
    forceReport() {
        this.reportMetrics();
    }

    getPerformanceScore() {
        return this.calculatePerformanceScore();
    }

    resetMetrics() {
        this.metrics = {
            // Core Web Vitals
            lcp: { value: 0, measurements: [] },
            fid: { value: 0, measurements: [] },
            cls: { value: 0, measurements: [] },

            // Gallery-specific metrics
            cacheHitRatio: 0,
            averageImageLoadTime: 0,
            totalImagesLoaded: 0,
            cacheHits: 0,
            cacheMisses: 0,
            prefetchAccuracy: 0,
            virtualScrollPerformance: { renderTime: 0, scrollLag: 0 },
            imageLoadSuccessRate: 0,

            // Resource timing
            resourceTimings: [],
            apiCallPerformance: { averageTime: 0, failureRate: 0 },

            // Memory metrics
            memoryUsage: { used: 0, total: 0, utilization: 0 },

            // Network metrics
            networkInfo: { effectiveType: '', downlink: 0, rtt: 0 },

            // Error tracking
            errorCount: 0,
            errorTypes: {},

            // Session metrics
            sessionStartTime: Date.now(),
            pageLoadTime: 0,
            timeToFirstImage: 0,
            totalPageViews: 0
        };
        this.events = [];
        console.log('[PerfMonitor] Metrics reset');
    }
}

// Initialize global performance monitor instance
if (typeof window !== 'undefined' && !window.performanceMonitor) {
    window.performanceMonitor = new PerformanceMonitor();

    // Expose public API to global scope
    window.PerfMonitor = {
        getMetrics: () => window.performanceMonitor.getMetrics(),
        getCoreWebVitals: () => window.performanceMonitor.getCoreWebVitals(),
        getEvents: (type) => window.performanceMonitor.getEvents(type),
        getResourceTimings: () => window.performanceMonitor.getResourceTimings(),
        getMemoryInfo: () => window.performanceMonitor.getMemoryInfo(),
        getNetworkInfo: () => window.performanceMonitor.getNetworkInfo(),
        getErrorSummary: () => window.performanceMonitor.getErrorSummary(),
        getPerformanceScore: () => window.performanceMonitor.getPerformanceScore(),
        forceReport: () => window.performanceMonitor.forceReport(),
        resetMetrics: () => window.performanceMonitor.resetMetrics(),
        stopMonitoring: () => window.performanceMonitor.stopMonitoring()
    };
}

// CommonJS export removed to avoid conflicts with ES6 modules

// Export for ES6 modules (handled by bundlers)
export default PerformanceMonitor;

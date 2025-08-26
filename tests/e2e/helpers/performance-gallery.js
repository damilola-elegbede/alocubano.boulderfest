/**
 * Gallery Performance and Caching Test Utilities
 * Comprehensive performance monitoring and caching validation for A Lo Cubano Boulder Fest gallery
 * 
 * Features:
 * - Gallery cache implementation and performance optimization testing
 * - Image loading performance monitoring and metrics collection
 * - Progressive loading behavior under different network conditions
 * - Cache invalidation when new photos are added
 * - Memory usage monitoring during large gallery browsing sessions
 * - Performance regression detection for gallery operations
 * 
 * PRD Requirements: REQ-FUNC-003, REQ-NFR-001, REQ-BUS-003
 * Task: Task_2_3_02 - Gallery Performance and Caching Tests
 */

import { expect } from '@playwright/test';

export class GalleryPerformanceHelper {
    constructor(page, options = {}) {
        this.page = page;
        this.config = {
            // Performance thresholds
            maxInitialLoadTime: options.maxInitialLoadTime || 2000, // 2s for initial gallery load
            maxImageLoadTime: options.maxImageLoadTime || 1500, // 1.5s for individual images
            maxCacheRetrievalTime: options.maxCacheRetrievalTime || 100, // 100ms for cached resources
            minCacheHitRatio: options.minCacheHitRatio || 0.8, // 80% cache hit ratio
            maxMemoryIncreasePercentage: options.maxMemoryIncreasePercentage || 150, // 150% memory increase threshold
            
            // Network simulation options
            networkProfiles: {
                'slow-3g': { downloadThroughput: 500 * 1024 / 8, uploadThroughput: 500 * 1024 / 8, latency: 400 },
                'fast-3g': { downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8, latency: 150 },
                '4g': { downloadThroughput: 4 * 1024 * 1024 / 8, uploadThroughput: 3 * 1024 * 1024 / 8, latency: 20 }
            },
            
            // Cache configuration
            cacheStorageNames: ['alocubano_image_cache_v3', 'alocubano_image_data_cache_v3'],
            
            // Gallery configuration
            gallerySelectors: {
                container: '.gallery-grid, .virtual-gallery, [data-gallery]',
                items: '.gallery-item, .photo-item, .virtual-item',
                images: '.gallery-image, .photo-item img, .gallery-item img',
                loadingIndicator: '.loading, .virtual-loading, [data-loading]',
                virtualContainer: '.virtual-scroll-container, .virtual-gallery, [data-virtual]'
            },
            
            // Monitoring options
            performanceObservationDuration: options.performanceObservationDuration || 10000, // 10s
            memoryCheckInterval: options.memoryCheckInterval || 2000, // 2s
            maxScrollTestDistance: options.maxScrollTestDistance || 5000, // 5000px
            
            // Regression detection
            performanceBaseline: options.performanceBaseline || null,
            regressionThreshold: options.regressionThreshold || 0.2 // 20% performance degradation threshold
        };
        
        this.metrics = {
            initialLoad: {},
            imageLoading: [],
            cachePerformance: {},
            memoryUsage: [],
            scrollPerformance: [],
            networkRequests: [],
            performanceEntries: [],
            errors: []
        };
        
        this.observers = new Map();
        this.isMonitoring = false;
        this.initialMemory = null;
    }

    /**
     * Start comprehensive performance monitoring
     * @param {Object} options - Monitoring configuration options
     */
    async startPerformanceMonitoring(options = {}) {
        if (this.isMonitoring) {
            console.log('[GalleryPerf] Monitoring already active');
            return;
        }
        
        this.isMonitoring = true;
        console.log('[GalleryPerf] Starting performance monitoring');
        
        // Clear previous metrics
        this.resetMetrics();
        
        // Capture initial memory baseline
        await this.captureMemoryBaseline();
        
        // Set up performance observers
        await this.setupPerformanceObservers();
        
        // Monitor network requests
        await this.setupNetworkMonitoring();
        
        // Set up cache monitoring
        await this.setupCacheMonitoring();
        
        // Set up memory monitoring if supported
        if (await this.isMemoryApiSupported()) {
            await this.startMemoryMonitoring();
        }
        
        // Set up error monitoring
        await this.setupErrorMonitoring();
        
        console.log('[GalleryPerf] Performance monitoring started');
    }

    /**
     * Stop performance monitoring and collect final metrics
     */
    async stopPerformanceMonitoring() {
        if (!this.isMonitoring) {
            return;
        }
        
        this.isMonitoring = false;
        console.log('[GalleryPerf] Stopping performance monitoring');
        
        // Disconnect all observers
        this.observers.forEach((observer, name) => {
            try {
                observer.disconnect?.();
                console.log(`[GalleryPerf] Disconnected ${name} observer`);
            } catch (error) {
                console.warn(`[GalleryPerf] Error disconnecting ${name} observer:`, error);
            }
        });
        
        this.observers.clear();
        
        // Collect final metrics
        const finalMetrics = await this.collectFinalMetrics();
        
        console.log('[GalleryPerf] Performance monitoring stopped');
        return finalMetrics;
    }

    /**
     * Test gallery cache implementation and effectiveness
     */
    async testGalleryCache() {
        console.log('[GalleryPerf] Testing gallery cache implementation');
        
        const cacheResults = {
            initialState: null,
            afterFirstLoad: null,
            afterReload: null,
            cacheHitRatio: 0,
            cacheEffectiveness: 0
        };
        
        // Check initial cache state
        cacheResults.initialState = await this.inspectCacheState();
        
        // Load gallery for the first time
        const firstLoadStart = performance.now();
        await this.page.waitForSelector(this.config.gallerySelectors.container, { timeout: 10000 });
        await this.waitForGalleryImagesLoad();
        const firstLoadTime = performance.now() - firstLoadStart;
        
        // Capture cache state after first load
        cacheResults.afterFirstLoad = await this.inspectCacheState();
        
        // Reload page to test cache effectiveness
        const reloadStart = performance.now();
        await this.page.reload();
        await this.page.waitForSelector(this.config.gallerySelectors.container, { timeout: 10000 });
        await this.waitForGalleryImagesLoad();
        const reloadTime = performance.now() - reloadStart;
        
        // Capture cache state after reload
        cacheResults.afterReload = await this.inspectCacheState();
        
        // Calculate cache effectiveness
        cacheResults.cacheEffectiveness = firstLoadTime > 0 ? (firstLoadTime - reloadTime) / firstLoadTime : 0;
        cacheResults.cacheHitRatio = await this.calculateCacheHitRatio();
        
        // Validate cache performance
        expect(reloadTime).toBeLessThan(firstLoadTime * 0.7); // At least 30% improvement
        expect(cacheResults.cacheHitRatio).toBeGreaterThan(this.config.minCacheHitRatio);
        
        console.log('[GalleryPerf] Cache test results:', {
            firstLoad: `${firstLoadTime.toFixed(2)}ms`,
            reload: `${reloadTime.toFixed(2)}ms`,
            improvement: `${(cacheResults.cacheEffectiveness * 100).toFixed(1)}%`,
            hitRatio: `${(cacheResults.cacheHitRatio * 100).toFixed(1)}%`
        });
        
        return cacheResults;
    }

    /**
     * Measure image loading performance with detailed metrics
     */
    async measureImageLoadingPerformance() {
        console.log('[GalleryPerf] Measuring image loading performance');
        
        const loadingMetrics = {
            totalImages: 0,
            loadedImages: 0,
            failedImages: 0,
            averageLoadTime: 0,
            loadTimes: [],
            largestContentfulPaint: 0,
            timeToFirstImage: 0,
            progressiveLoadingEffectiveness: 0
        };
        
        // Start measuring
        const measurementStart = performance.now();
        
        // Wait for gallery container
        await this.page.waitForSelector(this.config.gallerySelectors.container);
        
        // Set up image load monitoring
        const imageLoadPromises = await this.setupImageLoadMonitoring();
        
        // Wait for initial images to load or timeout
        try {
            await Promise.race([
                Promise.allSettled(imageLoadPromises),
                this.page.waitForTimeout(this.config.maxImageLoadTime * 2)
            ]);
        } catch (error) {
            console.warn('[GalleryPerf] Image loading timeout or error:', error);
        }
        
        // Calculate metrics
        const totalTime = performance.now() - measurementStart;
        loadingMetrics.totalImages = imageLoadPromises.length;
        loadingMetrics.loadedImages = this.metrics.imageLoading.filter(img => img.loaded).length;
        loadingMetrics.failedImages = this.metrics.imageLoading.filter(img => img.error).length;
        
        if (loadingMetrics.loadedImages > 0) {
            const successfulLoads = this.metrics.imageLoading.filter(img => img.loaded);
            loadingMetrics.loadTimes = successfulLoads.map(img => img.loadTime);
            loadingMetrics.averageLoadTime = successfulLoads.reduce((sum, img) => sum + img.loadTime, 0) / successfulLoads.length;
            loadingMetrics.timeToFirstImage = Math.min(...loadingMetrics.loadTimes);
        }
        
        // Get LCP if available
        loadingMetrics.largestContentfulPaint = await this.getLargestContentfulPaint();
        
        // Test progressive loading effectiveness
        loadingMetrics.progressiveLoadingEffectiveness = await this.testProgressiveLoading();
        
        // Validate performance thresholds
        expect(loadingMetrics.averageLoadTime).toBeLessThan(this.config.maxImageLoadTime);
        expect(loadingMetrics.timeToFirstImage).toBeLessThan(this.config.maxInitialLoadTime);
        expect(loadingMetrics.failedImages / loadingMetrics.totalImages).toBeLessThan(0.05); // Less than 5% failure rate
        
        console.log('[GalleryPerf] Image loading metrics:', {
            total: loadingMetrics.totalImages,
            loaded: loadingMetrics.loadedImages,
            failed: loadingMetrics.failedImages,
            avgLoadTime: `${loadingMetrics.averageLoadTime.toFixed(2)}ms`,
            timeToFirst: `${loadingMetrics.timeToFirstImage.toFixed(2)}ms`,
            lcp: `${loadingMetrics.largestContentfulPaint.toFixed(2)}ms`
        });
        
        return loadingMetrics;
    }

    /**
     * Test progressive loading behavior under different network conditions
     */
    async testProgressiveLoadingUnderNetworkConditions() {
        console.log('[GalleryPerf] Testing progressive loading under network conditions');
        
        const networkTests = [];
        
        for (const [profileName, profile] of Object.entries(this.config.networkProfiles)) {
            console.log(`[GalleryPerf] Testing with ${profileName} network`);
            
            // Apply network conditions
            await this.page.context().setNetworkConditions(profile);
            
            // Reload page to test under network conditions
            await this.page.reload();
            await this.page.waitForSelector(this.config.gallerySelectors.container);
            
            // Measure loading behavior
            const testStart = performance.now();
            const loadingBehavior = await this.analyzeProgressiveLoadingBehavior();
            const testDuration = performance.now() - testStart;
            
            networkTests.push({
                profile: profileName,
                duration: testDuration,
                behavior: loadingBehavior,
                passesThresholds: this.validateProgressiveLoadingThresholds(loadingBehavior, profileName)
            });
            
            console.log(`[GalleryPerf] ${profileName} results:`, {
                duration: `${testDuration.toFixed(2)}ms`,
                initialImages: loadingBehavior.initiallyVisibleImages,
                lazyImages: loadingBehavior.lazyLoadedImages,
                totalImages: loadingBehavior.totalImages
            });
        }
        
        // Reset network conditions
        await this.page.context().setNetworkConditions(null);
        
        // Validate that progressive loading works effectively across all conditions
        const failedTests = networkTests.filter(test => !test.passesThresholds);
        expect(failedTests).toHaveLength(0);
        
        return networkTests;
    }

    /**
     * Test cache invalidation when new photos are added
     */
    async testCacheInvalidation() {
        console.log('[GalleryPerf] Testing cache invalidation');
        
        const invalidationResults = {
            initialCacheState: null,
            afterInvalidation: null,
            invalidationEffective: false,
            newContentLoaded: false
        };
        
        // Capture initial cache state
        invalidationResults.initialCacheState = await this.inspectCacheState();
        
        // Simulate cache invalidation by clearing relevant caches
        await this.page.evaluate(async () => {
            // Clear localStorage cache
            localStorage.removeItem('alocubano_image_cache_v3');
            localStorage.removeItem('alocubano_image_data_cache_v3');
            
            // Clear sessionStorage
            sessionStorage.clear();
            
            // Clear IndexedDB if available
            if ('indexedDB' in window) {
                try {
                    const databases = await indexedDB.databases();
                    databases.forEach(db => {
                        if (db.name.includes('alocubano') || db.name.includes('gallery')) {
                            const deleteReq = indexedDB.deleteDatabase(db.name);
                            deleteReq.onsuccess = () => console.log(`Cleared IndexedDB: ${db.name}`);
                        }
                    });
                } catch (error) {
                    console.warn('Could not clear IndexedDB:', error);
                }
            }
            
            // Clear Service Worker caches
            if ('caches' in window) {
                try {
                    const cacheNames = await caches.keys();
                    for (const cacheName of cacheNames) {
                        if (cacheName.includes('alocubano') || cacheName.includes('gallery')) {
                            await caches.delete(cacheName);
                            console.log(`Cleared cache: ${cacheName}`);
                        }
                    }
                } catch (error) {
                    console.warn('Could not clear Service Worker caches:', error);
                }
            }
        });
        
        // Reload page to test cache rebuild
        const reloadStart = performance.now();
        await this.page.reload();
        await this.page.waitForSelector(this.config.gallerySelectors.container);
        await this.waitForGalleryImagesLoad();
        const reloadTime = performance.now() - reloadStart;
        
        // Capture cache state after invalidation and reload
        invalidationResults.afterInvalidation = await this.inspectCacheState();
        
        // Verify cache was properly invalidated and rebuilt
        invalidationResults.invalidationEffective = 
            invalidationResults.afterInvalidation.totalEntries >= invalidationResults.initialCacheState.totalEntries;
        invalidationResults.newContentLoaded = reloadTime > this.config.maxCacheRetrievalTime;
        
        console.log('[GalleryPerf] Cache invalidation results:', {
            invalidationTime: `${reloadTime.toFixed(2)}ms`,
            initialEntries: invalidationResults.initialCacheState.totalEntries,
            afterEntries: invalidationResults.afterInvalidation.totalEntries,
            effective: invalidationResults.invalidationEffective
        });
        
        return invalidationResults;
    }

    /**
     * Monitor memory usage during large gallery browsing sessions
     */
    async monitorMemoryUsageDuringBrowsing(scrollDistance = null) {
        console.log('[GalleryPerf] Monitoring memory usage during gallery browsing');
        
        const distance = scrollDistance || this.config.maxScrollTestDistance;
        const memoryResults = {
            initialMemory: null,
            peakMemory: null,
            finalMemory: null,
            memoryIncrease: 0,
            memoryIncreasePercentage: 0,
            memoryLeaks: [],
            gcEffectiveness: 0
        };
        
        // Capture initial memory
        memoryResults.initialMemory = await this.captureMemorySnapshot();
        
        // Start memory monitoring
        const memoryMonitoring = this.startMemoryMonitoring();
        
        // Perform extended browsing simulation
        await this.simulateExtendedBrowsing(distance);
        
        // Force garbage collection if supported
        await this.forceGarbageCollection();
        await this.page.waitForTimeout(2000); // Allow GC to complete
        
        // Capture final memory
        memoryResults.finalMemory = await this.captureMemorySnapshot();
        
        // Stop memory monitoring
        await memoryMonitoring.stop();
        
        // Calculate memory metrics
        if (memoryResults.initialMemory && memoryResults.finalMemory) {
            memoryResults.memoryIncrease = memoryResults.finalMemory.used - memoryResults.initialMemory.used;
            memoryResults.memoryIncreasePercentage = (memoryResults.memoryIncrease / memoryResults.initialMemory.used) * 100;
            
            // Find peak memory usage
            memoryResults.peakMemory = this.metrics.memoryUsage.reduce((max, current) => 
                current.used > max.used ? current : max, memoryResults.initialMemory);
        }
        
        // Detect potential memory leaks
        memoryResults.memoryLeaks = this.detectMemoryLeaks();
        
        // Validate memory usage
        expect(memoryResults.memoryIncreasePercentage).toBeLessThan(this.config.maxMemoryIncreasePercentage);
        expect(memoryResults.memoryLeaks.length).toBe(0);
        
        console.log('[GalleryPerf] Memory usage results:', {
            initialMemory: this.formatBytes(memoryResults.initialMemory?.used || 0),
            finalMemory: this.formatBytes(memoryResults.finalMemory?.used || 0),
            increase: this.formatBytes(memoryResults.memoryIncrease),
            increasePercentage: `${memoryResults.memoryIncreasePercentage.toFixed(1)}%`,
            peakMemory: this.formatBytes(memoryResults.peakMemory?.used || 0),
            leaks: memoryResults.memoryLeaks.length
        });
        
        return memoryResults;
    }

    /**
     * Detect performance regressions compared to baseline
     */
    async detectPerformanceRegressions(currentMetrics, baseline = null) {
        console.log('[GalleryPerf] Detecting performance regressions');
        
        const performanceBaseline = baseline || this.config.performanceBaseline;
        if (!performanceBaseline) {
            console.warn('[GalleryPerf] No baseline provided for regression detection');
            return { regressions: [], status: 'no_baseline' };
        }
        
        const regressions = [];
        const threshold = this.config.regressionThreshold;
        
        // Check gallery loading time regression
        if (currentMetrics.initialLoad && performanceBaseline.initialLoad) {
            const regression = this.calculateRegression(
                currentMetrics.initialLoad.duration,
                performanceBaseline.initialLoad.duration,
                threshold
            );
            if (regression.isRegression) {
                regressions.push({
                    metric: 'initialLoad',
                    current: regression.current,
                    baseline: regression.baseline,
                    increase: regression.increase,
                    severity: regression.severity
                });
            }
        }
        
        // Check image loading time regression
        if (currentMetrics.imageLoading && performanceBaseline.imageLoading) {
            const currentAvg = currentMetrics.imageLoading.averageLoadTime;
            const baselineAvg = performanceBaseline.imageLoading.averageLoadTime;
            const regression = this.calculateRegression(currentAvg, baselineAvg, threshold);
            
            if (regression.isRegression) {
                regressions.push({
                    metric: 'imageLoadTime',
                    current: regression.current,
                    baseline: regression.baseline,
                    increase: regression.increase,
                    severity: regression.severity
                });
            }
        }
        
        // Check cache hit ratio regression
        if (currentMetrics.cachePerformance && performanceBaseline.cachePerformance) {
            const currentRatio = currentMetrics.cachePerformance.cacheHitRatio;
            const baselineRatio = performanceBaseline.cachePerformance.cacheHitRatio;
            
            if (currentRatio < baselineRatio * (1 - threshold)) {
                regressions.push({
                    metric: 'cacheHitRatio',
                    current: currentRatio,
                    baseline: baselineRatio,
                    decrease: (baselineRatio - currentRatio) / baselineRatio,
                    severity: currentRatio < baselineRatio * 0.8 ? 'high' : 'medium'
                });
            }
        }
        
        // Check memory usage regression
        if (currentMetrics.memoryUsage && performanceBaseline.memoryUsage) {
            const currentPeak = Math.max(...currentMetrics.memoryUsage.map(m => m.used));
            const baselinePeak = Math.max(...performanceBaseline.memoryUsage.map(m => m.used));
            const regression = this.calculateRegression(currentPeak, baselinePeak, threshold);
            
            if (regression.isRegression) {
                regressions.push({
                    metric: 'memoryUsage',
                    current: regression.current,
                    baseline: regression.baseline,
                    increase: regression.increase,
                    severity: regression.severity
                });
            }
        }
        
        console.log('[GalleryPerf] Regression detection complete:', {
            regressionsFound: regressions.length,
            highSeverity: regressions.filter(r => r.severity === 'high').length,
            mediumSeverity: regressions.filter(r => r.severity === 'medium').length
        });
        
        return { regressions, status: regressions.length > 0 ? 'regressions_detected' : 'no_regressions' };
    }

    /**
     * Generate comprehensive performance report
     */
    async generatePerformanceReport() {
        console.log('[GalleryPerf] Generating performance report');
        
        const report = {
            timestamp: new Date().toISOString(),
            testConfiguration: {
                thresholds: {
                    maxInitialLoadTime: this.config.maxInitialLoadTime,
                    maxImageLoadTime: this.config.maxImageLoadTime,
                    minCacheHitRatio: this.config.minCacheHitRatio,
                    maxMemoryIncreasePercentage: this.config.maxMemoryIncreasePercentage
                },
                testEnvironment: await this.getTestEnvironment()
            },
            metrics: {
                initialLoad: this.metrics.initialLoad,
                imageLoading: {
                    summary: this.summarizeImageLoadingMetrics(),
                    details: this.metrics.imageLoading
                },
                cachePerformance: this.metrics.cachePerformance,
                memoryUsage: {
                    summary: this.summarizeMemoryMetrics(),
                    timeline: this.metrics.memoryUsage
                },
                scrollPerformance: this.metrics.scrollPerformance,
                errors: this.metrics.errors
            },
            performanceScore: await this.calculateOverallPerformanceScore(),
            recommendations: this.generatePerformanceRecommendations(),
            passedTests: this.getPassedTests(),
            failedTests: this.getFailedTests()
        };
        
        console.log('[GalleryPerf] Performance report generated:', {
            score: report.performanceScore,
            passedTests: report.passedTests.length,
            failedTests: report.failedTests.length,
            errorsCount: report.metrics.errors.length
        });
        
        return report;
    }

    // Helper methods

    async setupPerformanceObservers() {
        await this.page.evaluate(() => {
            // Set up performance monitoring in browser context
            window.galleryPerfMetrics = {
                navigationStart: performance.now(),
                loadTimes: [],
                resourceTimings: [],
                paintTimings: [],
                errors: []
            };
            
            // LCP Observer
            if ('PerformanceObserver' in window) {
                const lcpObserver = new PerformanceObserver((list) => {
                    const entries = list.getEntries();
                    entries.forEach(entry => {
                        window.galleryPerfMetrics.lcp = entry.startTime;
                    });
                });
                lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
                
                // FID Observer
                const fidObserver = new PerformanceObserver((list) => {
                    const entries = list.getEntries();
                    entries.forEach(entry => {
                        window.galleryPerfMetrics.fid = entry.processingStart - entry.startTime;
                    });
                });
                fidObserver.observe({ entryTypes: ['first-input'] });
                
                // CLS Observer
                let clsValue = 0;
                const clsObserver = new PerformanceObserver((list) => {
                    const entries = list.getEntries();
                    entries.forEach(entry => {
                        if (!entry.hadRecentInput) {
                            clsValue += entry.value;
                        }
                    });
                    window.galleryPerfMetrics.cls = clsValue;
                });
                clsObserver.observe({ entryTypes: ['layout-shift'] });
                
                // Resource timing observer
                const resourceObserver = new PerformanceObserver((list) => {
                    const entries = list.getEntries();
                    entries.forEach(entry => {
                        if (entry.initiatorType === 'img' || entry.name.includes('/api/')) {
                            window.galleryPerfMetrics.resourceTimings.push({
                                name: entry.name,
                                type: entry.initiatorType,
                                duration: entry.duration,
                                transferSize: entry.transferSize,
                                startTime: entry.startTime
                            });
                        }
                    });
                });
                resourceObserver.observe({ entryTypes: ['resource'] });
            }
        });
    }

    async setupNetworkMonitoring() {
        // Monitor network requests
        this.page.on('request', request => {
            if (request.url().includes('image') || request.url().includes('/api/gallery') || 
                request.url().includes('/api/image-proxy')) {
                this.metrics.networkRequests.push({
                    url: request.url(),
                    method: request.method(),
                    timestamp: Date.now(),
                    type: 'request'
                });
            }
        });
        
        this.page.on('response', response => {
            if (response.url().includes('image') || response.url().includes('/api/gallery') || 
                response.url().includes('/api/image-proxy')) {
                this.metrics.networkRequests.push({
                    url: response.url(),
                    status: response.status(),
                    timestamp: Date.now(),
                    type: 'response',
                    fromCache: response.fromServiceWorker()
                });
            }
        });
    }

    async setupCacheMonitoring() {
        await this.page.evaluate(() => {
            // Monitor cache operations
            window.cacheMetrics = {
                hits: 0,
                misses: 0,
                operations: []
            };
            
            // Intercept cache operations if ImageCacheManager exists
            if (window.ImageCacheManager) {
                const originalGetCachedImageVariant = window.ImageCacheManager.getCachedImageVariant;
                window.ImageCacheManager.getCachedImageVariant = function(fileId, options) {
                    const result = originalGetCachedImageVariant.call(this, fileId, options);
                    if (result) {
                        window.cacheMetrics.hits++;
                        window.cacheMetrics.operations.push({
                            type: 'hit',
                            fileId,
                            timestamp: Date.now()
                        });
                    } else {
                        window.cacheMetrics.misses++;
                        window.cacheMetrics.operations.push({
                            type: 'miss',
                            fileId,
                            timestamp: Date.now()
                        });
                    }
                    return result;
                };
            }
        });
    }

    async setupErrorMonitoring() {
        this.page.on('pageerror', error => {
            this.metrics.errors.push({
                type: 'javascript',
                message: error.message,
                timestamp: Date.now()
            });
        });
        
        this.page.on('requestfailed', request => {
            if (request.url().includes('image') || request.url().includes('/api/gallery')) {
                this.metrics.errors.push({
                    type: 'network',
                    url: request.url(),
                    failure: request.failure()?.errorText || 'Unknown error',
                    timestamp: Date.now()
                });
            }
        });
    }

    async setupImageLoadMonitoring() {
        const imageSelectors = await this.page.$$(this.config.gallerySelectors.images);
        const imagePromises = [];
        
        for (const image of imageSelectors) {
            const promise = this.page.evaluate((img) => {
                return new Promise((resolve) => {
                    const startTime = performance.now();
                    const src = img.getAttribute('data-src') || img.src;
                    
                    const onLoad = () => {
                        resolve({
                            src,
                            loaded: true,
                            loadTime: performance.now() - startTime,
                            timestamp: Date.now()
                        });
                    };
                    
                    const onError = () => {
                        resolve({
                            src,
                            loaded: false,
                            error: true,
                            timestamp: Date.now()
                        });
                    };
                    
                    if (img.complete && img.naturalWidth > 0) {
                        onLoad();
                    } else {
                        img.addEventListener('load', onLoad, { once: true });
                        img.addEventListener('error', onError, { once: true });
                        
                        // Timeout after max load time
                        setTimeout(() => {
                            resolve({
                                src,
                                loaded: false,
                                timeout: true,
                                timestamp: Date.now()
                            });
                        }, this.config.maxImageLoadTime * 2);
                    }
                });
            }, image);
            
            imagePromises.push(promise);
        }
        
        // Collect results as they complete
        Promise.allSettled(imagePromises).then(results => {
            results.forEach(result => {
                if (result.status === 'fulfilled') {
                    this.metrics.imageLoading.push(result.value);
                }
            });
        });
        
        return imagePromises;
    }

    async waitForGalleryImagesLoad(timeout = 10000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            const imageStates = await this.page.evaluate(() => {
                const images = document.querySelectorAll('.gallery-image, .photo-item img, .gallery-item img');
                let loaded = 0;
                let total = images.length;
                
                images.forEach(img => {
                    if (img.complete && img.naturalWidth > 0) {
                        loaded++;
                    }
                });
                
                return { loaded, total };
            });
            
            // Consider gallery loaded if at least 50% of images are loaded or we have at least 5 images loaded
            if (imageStates.total > 0 && (imageStates.loaded / imageStates.total >= 0.5 || imageStates.loaded >= 5)) {
                break;
            }
            
            await this.page.waitForTimeout(200);
        }
    }

    async inspectCacheState() {
        return await this.page.evaluate(() => {
            const cacheState = {
                localStorage: {},
                sessionStorage: {},
                indexedDB: null,
                serviceWorker: null,
                totalEntries: 0
            };
            
            // Check localStorage
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.includes('alocubano') || key.includes('gallery') || key.includes('image')) {
                    cacheState.localStorage[key] = localStorage.getItem(key)?.length || 0;
                    cacheState.totalEntries++;
                }
            }
            
            // Check sessionStorage
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                if (key.includes('alocubano') || key.includes('gallery') || key.includes('image')) {
                    cacheState.sessionStorage[key] = sessionStorage.getItem(key)?.length || 0;
                    cacheState.totalEntries++;
                }
            }
            
            // Check ImageCacheManager if available
            if (window.ImageCacheManager && typeof window.ImageCacheManager.getCacheStats === 'function') {
                cacheState.imageCacheStats = window.ImageCacheManager.getCacheStats();
                cacheState.totalEntries += cacheState.imageCacheStats.totalEntries || 0;
            }
            
            return cacheState;
        });
    }

    async calculateCacheHitRatio() {
        return await this.page.evaluate(() => {
            if (window.cacheMetrics) {
                const total = window.cacheMetrics.hits + window.cacheMetrics.misses;
                return total > 0 ? window.cacheMetrics.hits / total : 0;
            }
            return 0;
        });
    }

    async getLargestContentfulPaint() {
        return await this.page.evaluate(() => {
            return window.galleryPerfMetrics?.lcp || 0;
        });
    }

    async testProgressiveLoading() {
        return await this.page.evaluate(() => {
            const images = document.querySelectorAll('.gallery-image, .photo-item img');
            let lazyImages = 0;
            let immediateImages = 0;
            
            images.forEach(img => {
                if (img.getAttribute('loading') === 'lazy' || img.hasAttribute('data-src')) {
                    lazyImages++;
                } else {
                    immediateImages++;
                }
            });
            
            return lazyImages / (lazyImages + immediateImages);
        });
    }

    async analyzeProgressiveLoadingBehavior() {
        return await this.page.evaluate(() => {
            const allImages = document.querySelectorAll('.gallery-image, .photo-item img, .gallery-item img');
            const visibleImages = Array.from(allImages).filter(img => {
                const rect = img.getBoundingClientRect();
                return rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
            });
            const loadedImages = Array.from(allImages).filter(img => img.complete && img.naturalWidth > 0);
            
            return {
                totalImages: allImages.length,
                initiallyVisibleImages: visibleImages.length,
                loadedImages: loadedImages.length,
                lazyLoadedImages: allImages.length - loadedImages.length,
                progressiveLoadingRatio: visibleImages.length / allImages.length
            };
        });
    }

    validateProgressiveLoadingThresholds(behavior, networkProfile) {
        const thresholds = {
            'slow-3g': { minProgressiveRatio: 0.3, maxInitialLoad: 0.4 },
            'fast-3g': { minProgressiveRatio: 0.5, maxInitialLoad: 0.6 },
            '4g': { minProgressiveRatio: 0.7, maxInitialLoad: 0.8 }
        };
        
        const threshold = thresholds[networkProfile] || thresholds['fast-3g'];
        const initialLoadRatio = behavior.loadedImages / behavior.totalImages;
        
        return (
            behavior.progressiveLoadingRatio >= threshold.minProgressiveRatio &&
            initialLoadRatio <= threshold.maxInitialLoad
        );
    }

    async captureMemoryBaseline() {
        this.initialMemory = await this.captureMemorySnapshot();
    }

    async captureMemorySnapshot() {
        return await this.page.evaluate(() => {
            if (performance.memory) {
                return {
                    used: performance.memory.usedJSHeapSize,
                    total: performance.memory.totalJSHeapSize,
                    limit: performance.memory.jsHeapSizeLimit,
                    timestamp: Date.now()
                };
            }
            return null;
        });
    }

    async isMemoryApiSupported() {
        return await this.page.evaluate(() => {
            return 'memory' in performance;
        });
    }

    startMemoryMonitoring() {
        let intervalId;
        
        const monitor = async () => {
            const snapshot = await this.captureMemorySnapshot();
            if (snapshot) {
                this.metrics.memoryUsage.push(snapshot);
            }
        };
        
        intervalId = setInterval(monitor, this.config.memoryCheckInterval);
        
        return {
            stop: () => {
                if (intervalId) {
                    clearInterval(intervalId);
                }
            }
        };
    }

    async simulateExtendedBrowsing(scrollDistance) {
        const scrollStep = 200;
        const scrollDelay = 100;
        
        for (let scrolled = 0; scrolled < scrollDistance; scrolled += scrollStep) {
            await this.page.evaluate((step) => {
                window.scrollBy(0, step);
            }, scrollStep);
            
            await this.page.waitForTimeout(scrollDelay);
            
            // Track scroll performance
            const scrollMetric = await this.page.evaluate(() => {
                return {
                    scrollTop: window.scrollY,
                    timestamp: Date.now()
                };
            });
            
            this.metrics.scrollPerformance.push(scrollMetric);
        }
    }

    async forceGarbageCollection() {
        try {
            await this.page.evaluate(() => {
                // Force garbage collection if available (Chrome with --js-flags="--expose-gc")
                if (window.gc) {
                    window.gc();
                }
            });
        } catch (error) {
            console.warn('[GalleryPerf] Could not force garbage collection:', error);
        }
    }

    detectMemoryLeaks() {
        if (this.metrics.memoryUsage.length < 3) {
            return [];
        }
        
        const leaks = [];
        const samples = this.metrics.memoryUsage.slice(-10); // Look at last 10 samples
        
        // Check for consistent memory increase
        let increasingTrend = 0;
        for (let i = 1; i < samples.length; i++) {
            if (samples[i].used > samples[i - 1].used) {
                increasingTrend++;
            }
        }
        
        if (increasingTrend >= samples.length * 0.8) {
            leaks.push({
                type: 'consistent_increase',
                severity: 'medium',
                description: 'Memory usage shows consistent increasing trend'
            });
        }
        
        // Check for large memory spikes
        const maxMemory = Math.max(...samples.map(s => s.used));
        const minMemory = Math.min(...samples.map(s => s.used));
        const memoryRange = maxMemory - minMemory;
        const avgMemory = samples.reduce((sum, s) => sum + s.used, 0) / samples.length;
        
        if (memoryRange > avgMemory * 0.5) {
            leaks.push({
                type: 'memory_spikes',
                severity: 'high',
                description: 'Large memory usage variations detected'
            });
        }
        
        return leaks;
    }

    calculateRegression(current, baseline, threshold) {
        const increase = (current - baseline) / baseline;
        const isRegression = increase > threshold;
        
        return {
            current,
            baseline,
            increase,
            isRegression,
            severity: increase > threshold * 2 ? 'high' : 'medium'
        };
    }

    async getTestEnvironment() {
        return await this.page.evaluate(() => {
            return {
                userAgent: navigator.userAgent,
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight
                },
                deviceMemory: navigator.deviceMemory,
                hardwareConcurrency: navigator.hardwareConcurrency,
                connection: navigator.connection ? {
                    effectiveType: navigator.connection.effectiveType,
                    downlink: navigator.connection.downlink
                } : null
            };
        });
    }

    summarizeImageLoadingMetrics() {
        if (this.metrics.imageLoading.length === 0) {
            return null;
        }
        
        const loaded = this.metrics.imageLoading.filter(img => img.loaded);
        const failed = this.metrics.imageLoading.filter(img => img.error);
        const timeouts = this.metrics.imageLoading.filter(img => img.timeout);
        
        return {
            total: this.metrics.imageLoading.length,
            loaded: loaded.length,
            failed: failed.length,
            timeouts: timeouts.length,
            averageLoadTime: loaded.length > 0 ? 
                loaded.reduce((sum, img) => sum + img.loadTime, 0) / loaded.length : 0,
            successRate: this.metrics.imageLoading.length > 0 ?
                loaded.length / this.metrics.imageLoading.length : 0
        };
    }

    summarizeMemoryMetrics() {
        if (this.metrics.memoryUsage.length === 0) {
            return null;
        }
        
        const initial = this.metrics.memoryUsage[0];
        const final = this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1];
        const peak = this.metrics.memoryUsage.reduce((max, current) => 
            current.used > max.used ? current : max, initial);
        
        return {
            initial: initial.used,
            final: final.used,
            peak: peak.used,
            increase: final.used - initial.used,
            increasePercentage: ((final.used - initial.used) / initial.used) * 100
        };
    }

    async calculateOverallPerformanceScore() {
        const scores = [];
        
        // Gallery loading score (0-100)
        if (this.metrics.initialLoad.duration) {
            const loadScore = Math.max(0, 100 - (this.metrics.initialLoad.duration / this.config.maxInitialLoadTime) * 100);
            scores.push({ metric: 'loading', score: loadScore, weight: 0.3 });
        }
        
        // Image loading score (0-100)
        const imageSummary = this.summarizeImageLoadingMetrics();
        if (imageSummary) {
            const imageScore = imageSummary.successRate * 100;
            scores.push({ metric: 'images', score: imageScore, weight: 0.25 });
        }
        
        // Cache score (0-100)
        if (this.metrics.cachePerformance.cacheHitRatio !== undefined) {
            const cacheScore = this.metrics.cachePerformance.cacheHitRatio * 100;
            scores.push({ metric: 'cache', score: cacheScore, weight: 0.2 });
        }
        
        // Memory score (0-100)
        const memorySummary = this.summarizeMemoryMetrics();
        if (memorySummary) {
            const memoryScore = Math.max(0, 100 - (memorySummary.increasePercentage / this.config.maxMemoryIncreasePercentage) * 100);
            scores.push({ metric: 'memory', score: memoryScore, weight: 0.15 });
        }
        
        // Error score (0-100)
        const errorScore = Math.max(0, 100 - this.metrics.errors.length * 10);
        scores.push({ metric: 'errors', score: errorScore, weight: 0.1 });
        
        // Calculate weighted average
        const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
        const weightedScore = scores.reduce((sum, s) => sum + (s.score * s.weight), 0) / totalWeight;
        
        return Math.round(weightedScore);
    }

    generatePerformanceRecommendations() {
        const recommendations = [];
        
        // Analyze metrics and generate recommendations
        const imageSummary = this.summarizeImageLoadingMetrics();
        if (imageSummary && imageSummary.successRate < 0.95) {
            recommendations.push({
                category: 'images',
                priority: 'high',
                title: 'Improve Image Loading Reliability',
                description: `${((1 - imageSummary.successRate) * 100).toFixed(1)}% of images failed to load. Consider implementing better error handling and retry mechanisms.`
            });
        }
        
        if (this.metrics.cachePerformance.cacheHitRatio < this.config.minCacheHitRatio) {
            recommendations.push({
                category: 'cache',
                priority: 'medium',
                title: 'Optimize Cache Strategy',
                description: `Cache hit ratio is ${(this.metrics.cachePerformance.cacheHitRatio * 100).toFixed(1)}%. Consider improving cache preloading and retention policies.`
            });
        }
        
        const memorySummary = this.summarizeMemoryMetrics();
        if (memorySummary && memorySummary.increasePercentage > this.config.maxMemoryIncreasePercentage * 0.8) {
            recommendations.push({
                category: 'memory',
                priority: 'high',
                title: 'Address Memory Usage',
                description: `Memory usage increased by ${memorySummary.increasePercentage.toFixed(1)}%. Review for potential memory leaks and optimize resource cleanup.`
            });
        }
        
        return recommendations;
    }

    getPassedTests() {
        // Implementation depends on how tests are tracked
        return [];
    }

    getFailedTests() {
        // Implementation depends on how tests are tracked
        return [];
    }

    async collectFinalMetrics() {
        // Collect browser metrics
        const browserMetrics = await this.page.evaluate(() => {
            return window.galleryPerfMetrics || {};
        });
        
        // Merge with collected metrics
        return {
            ...this.metrics,
            browserMetrics,
            finalMemory: await this.captureMemorySnapshot(),
            cacheState: await this.inspectCacheState()
        };
    }

    resetMetrics() {
        this.metrics = {
            initialLoad: {},
            imageLoading: [],
            cachePerformance: {},
            memoryUsage: [],
            scrollPerformance: [],
            networkRequests: [],
            performanceEntries: [],
            errors: []
        };
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Utility functions for common gallery performance testing scenarios

/**
 * Quick gallery performance test with default settings
 */
export async function quickGalleryPerformanceTest(page, options = {}) {
    const helper = new GalleryPerformanceHelper(page, options);
    
    await helper.startPerformanceMonitoring();
    
    // Basic performance tests
    const cacheResults = await helper.testGalleryCache();
    const imageResults = await helper.measureImageLoadingPerformance();
    
    const finalMetrics = await helper.stopPerformanceMonitoring();
    const report = await helper.generatePerformanceReport();
    
    return {
        cacheResults,
        imageResults,
        finalMetrics,
        report,
        passed: report.performanceScore >= 70 // 70% threshold for passing
    };
}

/**
 * Comprehensive gallery performance test suite
 */
export async function comprehensiveGalleryPerformanceTest(page, options = {}) {
    const helper = new GalleryPerformanceHelper(page, options);
    
    await helper.startPerformanceMonitoring();
    
    // Run all performance tests
    const results = {
        cache: await helper.testGalleryCache(),
        imageLoading: await helper.measureImageLoadingPerformance(),
        progressiveLoading: await helper.testProgressiveLoadingUnderNetworkConditions(),
        cacheInvalidation: await helper.testCacheInvalidation(),
        memoryUsage: await helper.monitorMemoryUsageDuringBrowsing(),
        finalMetrics: null,
        report: null,
        regressions: null
    };
    
    results.finalMetrics = await helper.stopPerformanceMonitoring();
    results.report = await helper.generatePerformanceReport();
    
    // Check for regressions if baseline provided
    if (options.performanceBaseline) {
        results.regressions = await helper.detectPerformanceRegressions(results.finalMetrics, options.performanceBaseline);
    }
    
    return results;
}

/**
 * Simulate slow network conditions for testing
 */
export async function simulateSlowNetwork(page, profile = 'slow-3g') {
    const networkProfiles = {
        'slow-3g': { downloadThroughput: 500 * 1024 / 8, uploadThroughput: 500 * 1024 / 8, latency: 400 },
        'fast-3g': { downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8, latency: 150 },
        '4g': { downloadThroughput: 4 * 1024 * 1024 / 8, uploadThroughput: 3 * 1024 * 1024 / 8, latency: 20 }
    };
    
    const networkCondition = networkProfiles[profile];
    if (networkCondition) {
        await page.context().setNetworkConditions(networkCondition);
        console.log(`[GalleryPerf] Applied ${profile} network conditions`);
    }
}

/**
 * Reset network conditions to normal
 */
export async function resetNetworkConditions(page) {
    await page.context().setNetworkConditions(null);
    console.log('[GalleryPerf] Reset network conditions to normal');
}
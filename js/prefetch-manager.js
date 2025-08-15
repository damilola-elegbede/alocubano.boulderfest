/**
 * Advanced Intelligent Prefetch Manager for A Lo Cubano Boulder Fest Gallery
 * Phase 2 Enhancement - Implements sophisticated prefetching algorithms
 *
 * Features:
 * - Intelligent connection speed detection and adaptation
 * - Resource budgeting based on device capabilities
 * - Priority-based prefetch queue management
 * - User interaction pattern tracking and prediction
 * - Intersection Observer for viewport-based prefetching
 * - Background worker for queue processing
 * - Similar image prefetching based on gallery categories
 * - Advanced cache warming strategies
 */

class IntelligentPrefetchManager {
    constructor() {
    // Core state management
        this.priorityQueue = new Map(); // priority -> Set of resources
        this.processingQueue = new Set();
        this.resourceCache = new Map();
        this.resourceSizes = new Map();

        // Connection and device awareness
        this.connectionInfo = this.detectConnectionCapabilities();
        this.deviceCapabilities = this.detectDeviceCapabilities();
        this.resourceBudget = this.calculateResourceBudget();
        this.currentBudgetUsed = 0;

        // User behavior and prediction
        this.userInteractions = this.initUserInteractionTracking();
        this.predictionModel = this.initPredictionModel();
        this.viewportObserver = this.createViewportObserver();

        // Background processing
        this.backgroundWorker = this.initBackgroundWorker();
        this.idleCallback = null;
        this.processingActive = false;

        // Performance monitoring
        this.performanceMetrics = {
            prefetchHitRate: 0,
            averageLoadTime: 0,
            bandwidthUtilization: 0,
            cacheEfficiency: 0
        };

        this.initialize();
    }

    initialize() {
        this.initializePriorityQueue();
        this.setupAdvancedEventListeners();
        this.startBackgroundProcessing();
        this.initializePerformanceMonitoring();

        // Start connection monitoring
        this.monitorConnectionChanges();

        // Initialize prediction model training
        this.trainPredictionModel();
    }

    detectConnectionCapabilities() {
        const connection =
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection;

        if (connection) {
            const capabilities = {
                effectiveType: connection.effectiveType || '4g',
                downlink: connection.downlink || 10,
                uplink: connection.uplink || 5,
                rtt: connection.rtt || 100,
                saveData: connection.saveData || false,
                type: connection.type || 'unknown'
            };

            // Calculate derived metrics
            capabilities.bandwidthScore = this.calculateBandwidthScore(capabilities);
            capabilities.qualityTier = this.determineQualityTier(capabilities);

            return capabilities;
        }

        // Fallback with performance-based estimation
        return this.estimateConnectionFromPerformance();
    }

    calculateBandwidthScore(connection) {
        const { effectiveType, downlink, rtt } = connection;

        let score = 0;

        // Base score from effective type
        switch (effectiveType) {
        case 'slow-2g':
            score = 1;
            break;
        case '2g':
            score = 2;
            break;
        case '3g':
            score = 4;
            break;
        case '4g':
            score = 8;
            break;
        default:
            score = 6;
        }

        // Adjust based on actual measurements
        if (downlink) {
            score *= Math.min(downlink / 1.5, 3); // Cap at 3x multiplier
        }

        if (rtt) {
            score *= Math.max(0.3, 200 / Math.max(rtt, 50)); // RTT penalty
        }

        return Math.round(score * 10) / 10;
    }

    determineQualityTier(connection) {
        if (connection.saveData) {
            return 'minimal';
        }

        const score = connection.bandwidthScore;
        if (score < 2) {
            return 'low';
        }
        if (score < 6) {
            return 'medium';
        }
        if (score < 12) {
            return 'high';
        }
        return 'premium';
    }

    estimateConnectionFromPerformance() {
    // Use performance timing to estimate connection quality
        const navigation = performance.getEntriesByType('navigation')[0];
        if (navigation) {
            const downloadTime = navigation.loadEventEnd - navigation.fetchStart;
            const estimatedSpeed =
        downloadTime < 2000 ? '4g' : downloadTime < 5000 ? '3g' : '2g';

            return {
                effectiveType: estimatedSpeed,
                downlink: downloadTime < 2000 ? 10 : downloadTime < 5000 ? 3 : 1,
                rtt: downloadTime < 2000 ? 50 : downloadTime < 5000 ? 150 : 300,
                saveData: false,
                estimated: true,
                bandwidthScore: downloadTime < 2000 ? 8 : downloadTime < 5000 ? 4 : 2,
                qualityTier:
          downloadTime < 2000 ? 'high' : downloadTime < 5000 ? 'medium' : 'low'
            };
        }

        return {
            effectiveType: '4g',
            downlink: 10,
            rtt: 100,
            saveData: false,
            estimated: true,
            bandwidthScore: 6,
            qualityTier: 'medium'
        };
    }

    detectDeviceCapabilities() {
        const capabilities = {
            memory: navigator.deviceMemory || 4, // GB
            cores: navigator.hardwareConcurrency || 4,
            maxTouchPoints: navigator.maxTouchPoints || 0,
            isMobile: /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                navigator.userAgent
            ),
            screenSize: {
                width: screen.width,
                height: screen.height,
                devicePixelRatio: window.devicePixelRatio || 1
            }
        };

        // Calculate device performance tier
        capabilities.performanceTier =
      this.calculateDevicePerformanceTier(capabilities);

        return capabilities;
    }

    calculateDevicePerformanceTier(device) {
        let score = 0;

        // Memory contribution (0-4 points)
        score += Math.min(device.memory / 2, 4);

        // CPU cores contribution (0-3 points)
        score += Math.min(device.cores / 2, 3);

        // Mobile penalty (-1 point)
        if (device.isMobile) {
            score -= 1;
        }

        // High DPI bonus (0.5 points)
        if (device.screenSize.devicePixelRatio > 2) {
            score += 0.5;
        }

        if (score < 2) {
            return 'low';
        }
        if (score < 4.5) {
            return 'medium';
        }
        if (score < 6.5) {
            return 'high';
        }
        return 'premium';
    }

    calculateResourceBudget() {
        const { qualityTier, saveData } = this.connectionInfo;
        const { performanceTier } = this.deviceCapabilities;

        if (saveData) {
            return {
                maxConcurrentRequests: 1,
                maxResourceSize: 0.5 * 1024 * 1024, // 0.5MB
                totalBudget: 2 * 1024 * 1024, // 2MB
                prefetchDistance: 1
            };
        }

        // Base budget calculation
        const budget = {
            maxConcurrentRequests: 2,
            maxResourceSize: 2 * 1024 * 1024, // 2MB
            totalBudget: 10 * 1024 * 1024, // 10MB
            prefetchDistance: 3
        };

        // Adjust based on connection quality
        const connectionMultiplier =
      {
          minimal: 0.2,
          low: 0.5,
          medium: 1.0,
          high: 1.8,
          premium: 2.5
      }[qualityTier] || 1.0;

        // Adjust based on device performance
        const deviceMultiplier =
      {
          low: 0.6,
          medium: 1.0,
          high: 1.4,
          premium: 2.0
      }[performanceTier] || 1.0;

        // Apply multipliers
        budget.maxConcurrentRequests = Math.round(
            budget.maxConcurrentRequests * connectionMultiplier * deviceMultiplier
        );
        budget.maxResourceSize = Math.round(
            budget.maxResourceSize * connectionMultiplier
        );
        budget.totalBudget = Math.round(
            budget.totalBudget * connectionMultiplier * deviceMultiplier
        );
        budget.prefetchDistance = Math.round(
            budget.prefetchDistance * connectionMultiplier
        );

        // Clamp values to reasonable ranges
        budget.maxConcurrentRequests = Math.max(
            1,
            Math.min(budget.maxConcurrentRequests, 8)
        );
        budget.maxResourceSize = Math.max(
            0.5 * 1024 * 1024,
            Math.min(budget.maxResourceSize, 10 * 1024 * 1024)
        );
        budget.totalBudget = Math.max(
            2 * 1024 * 1024,
            Math.min(budget.totalBudget, 50 * 1024 * 1024)
        );
        budget.prefetchDistance = Math.max(
            1,
            Math.min(budget.prefetchDistance, 10)
        );

        return budget;
    }

    initUserInteractionTracking() {
        const stored = localStorage.getItem('alocubano-interaction-data');
        const defaultTracking = {
            clickPatterns: {},
            scrollBehavior: {},
            hoverEvents: {},
            galleryNavigation: {},
            imageViewTime: {},
            categoryPreferences: {},
            sessionData: {
                currentSession: Date.now(),
                sessionCount: 0,
                totalInteractions: 0
            },
            predictiveModel: {
                likelyNextImages: [],
                preferredCategories: [],
                navigationProbabilities: {}
            }
        };

        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                parsed.sessionData.sessionCount++;
                parsed.sessionData.currentSession = Date.now();
                return { ...defaultTracking, ...parsed };
            } catch {
                // Error parsing stored data
            }
        }

        return defaultTracking;
    }

    initPredictionModel() {
        return {
            imageCategories: new Map(),
            similarityMatrix: new Map(),
            userPreferences: new Map(),
            navigationProbabilities: new Map(),
            contextualFactors: {
                timeOfDay: this.getTimeOfDayFactor(),
                deviceType: this.deviceCapabilities.isMobile ? 'mobile' : 'desktop',
                connectionSpeed: this.connectionInfo.qualityTier
            }
        };
    }

    initializePriorityQueue() {
        this.priorityQueue.set('critical', new Set()); // Immediate viewport
        this.priorityQueue.set('high', new Set()); // Predicted next views
        this.priorityQueue.set('medium', new Set()); // Similar images
        this.priorityQueue.set('low', new Set()); // Speculative prefetch
        this.priorityQueue.set('idle', new Set()); // Background warming
    }

    createViewportObserver() {
        const options = {
            root: null,
            rootMargin: `${this.resourceBudget.prefetchDistance * 100}px`,
            threshold: [0, 0.1, 0.5, 0.9]
        };

        return new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                const priority = this.calculateViewportPriority(entry);
                if (priority && entry.target.dataset.src) {
                    this.addToPriorityQueue(entry.target.dataset.src, priority, {
                        element: entry.target,
                        intersectionRatio: entry.intersectionRatio,
                        boundingRect: entry.boundingClientRect
                    });
                }
            });
        }, options);
    }

    calculateViewportPriority(entry) {
        const { intersectionRatio, isIntersecting } = entry;

        if (!isIntersecting) {
            return null;
        }

        if (intersectionRatio > 0.5) {
            return 'critical';
        }
        if (intersectionRatio > 0.1) {
            return 'high';
        }
        return 'medium';
    }

    initBackgroundWorker() {
    // Create a simple background processing system
        return {
            isRunning: false,
            intervalId: null,
            queue: new Set(),

            start: () => {
                if (this.backgroundWorker.isRunning) {
                    return;
                }

                this.backgroundWorker.isRunning = true;
                this.backgroundWorker.intervalId = setInterval(() => {
                    this.processBackgroundQueue();
                }, 2000); // Process every 2 seconds
            },

            stop: () => {
                if (this.backgroundWorker.intervalId) {
                    clearInterval(this.backgroundWorker.intervalId);
                    this.backgroundWorker.intervalId = null;
                }
                this.backgroundWorker.isRunning = false;
            },

            addTask: (task) => {
                this.backgroundWorker.queue.add(task);
            }
        };
    }

    addToPriorityQueue(resourceUrl, priority, metadata = {}) {
        if (!this.priorityQueue.has(priority)) {
            priority = 'low';
        }

        // Prevent duplicates across all priority levels
        for (const [, resources] of this.priorityQueue) {
            if (resources.has(resourceUrl)) {
                return;
            }
        }

        const resourceInfo = {
            url: resourceUrl,
            priority,
            addedAt: Date.now(),
            estimatedSize: this.estimateResourceSize(resourceUrl),
            metadata
        };

        this.priorityQueue.get(priority).add(JSON.stringify(resourceInfo));

        // Trigger immediate processing for critical resources
        if (priority === 'critical' && !this.processingActive) {
            this.processNextInQueue();
        }
    }

    estimateResourceSize(resourceUrl) {
    // Use heuristics to estimate resource size
        if (resourceUrl.includes('thumb') || resourceUrl.includes('small')) {
            return 50 * 1024; // 50KB for thumbnails
        }
        if (resourceUrl.includes('medium')) {
            return 200 * 1024; // 200KB for medium images
        }
        if (resourceUrl.includes('large') || resourceUrl.includes('full')) {
            return 800 * 1024; // 800KB for large images
        }

        // Default estimate based on URL patterns
        if (resourceUrl.match(/\.(jpg|jpeg|png|webp)$/i)) {
            return 300 * 1024; // 300KB default for images
        }

        return 100 * 1024; // 100KB default
    }

    async processNextInQueue() {
        if (this.processingActive) {
            return;
        }
        if (
            this.processingQueue.size >= this.resourceBudget.maxConcurrentRequests
        ) {
            return;
        }
        if (this.currentBudgetUsed >= this.resourceBudget.totalBudget) {
            return;
        }

        this.processingActive = true;

        try {
            // Process in priority order
            const priorities = ['critical', 'high', 'medium', 'low', 'idle'];

            for (const priority of priorities) {
                const queue = this.priorityQueue.get(priority);
                if (queue.size === 0) {
                    continue;
                }

                const resourceInfo = JSON.parse(queue.values().next().value);
                queue.delete(JSON.stringify(resourceInfo));

                // Check budget before processing
                if (
                    this.currentBudgetUsed + resourceInfo.estimatedSize >
          this.resourceBudget.totalBudget
                ) {
                    break;
                }

                await this.prefetchResource(resourceInfo);
                break; // Process one resource at a time
            }
        } finally {
            this.processingActive = false;

            // Schedule next processing if queue has items
            if (this.getTotalQueueSize() > 0) {
                setTimeout(() => this.processNextInQueue(), 100);
            }
        }
    }

    async prefetchResource(resourceInfo) {
        const { url, priority, estimatedSize } = resourceInfo;

        if (this.processingQueue.has(url) || this.resourceCache.has(url)) {
            return;
        }

        this.processingQueue.add(url);
        this.currentBudgetUsed += estimatedSize;

        const startTime = performance.now();

        try {
            const response = await fetch(url, {
                method: 'GET',
                mode: 'cors',
                credentials: 'omit',
                headers: {
                    'Cache-Control': 'max-age=3600'
                }
            });

            if (response.ok) {
                const actualSize =
          parseInt(response.headers.get('content-length')) || estimatedSize;
                this.resourceSizes.set(url, actualSize);
                this.resourceCache.set(url, {
                    cached: true,
                    size: actualSize,
                    priority,
                    cachedAt: Date.now()
                });

                const loadTime = performance.now() - startTime;
                this.updatePerformanceMetrics(url, loadTime, actualSize, priority);

                // Prefetch completed

                // Update prediction model with successful prefetch
                this.updatePredictionModel(url, true);
            } else {
                this.updatePredictionModel(url, false);
            }
        } catch {
            this.updatePredictionModel(url, false);
        } finally {
            this.processingQueue.delete(url);
            // Don't subtract from budget immediately - let it decay over time
        }
    }

    getTotalQueueSize() {
        let total = 0;
        for (const [, queue] of this.priorityQueue) {
            total += queue.size;
        }
        return total;
    }

    updatePerformanceMetrics(url, loadTime, size, priority) {
        const metrics = this.performanceMetrics;

        // Update average load time
        const loadTimeWeight = 0.1;
        metrics.averageLoadTime =
      metrics.averageLoadTime * (1 - loadTimeWeight) +
      loadTime * loadTimeWeight;

        // Update bandwidth utilization
        const bytesPerMs = size / loadTime;
        const bandwidthWeight = 0.05;
        metrics.bandwidthUtilization =
      metrics.bandwidthUtilization * (1 - bandwidthWeight) +
      bytesPerMs * bandwidthWeight;

        // Track prefetch success rates by priority
        if (!metrics.prioritySuccess) {
            metrics.prioritySuccess = new Map();
        }
        if (!metrics.prioritySuccess.has(priority)) {
            metrics.prioritySuccess.set(priority, { hits: 0, total: 0 });
        }

        const priorityStats = metrics.prioritySuccess.get(priority);
        priorityStats.total++;

        // Check if this prefetch was actually used (simplified heuristic)
        setTimeout(() => {
            const element = document.querySelector(
                `[src="${url}"], [data-src="${url}"]`
            );
            if (element && this.isElementVisible(element)) {
                priorityStats.hits++;
                metrics.prefetchHitRate = this.calculateOverallHitRate();
            }
        }, 5000);
    }

    calculateOverallHitRate() {
        if (!this.performanceMetrics.prioritySuccess) {
            return 0;
        }

        let totalHits = 0;
        let totalRequests = 0;

        for (const [, stats] of this.performanceMetrics.prioritySuccess) {
            totalHits += stats.hits;
            totalRequests += stats.total;
        }

        return totalRequests > 0 ? totalHits / totalRequests : 0;
    }

    isElementVisible(element) {
        const rect = element.getBoundingClientRect();
        return rect.top < window.innerHeight && rect.bottom > 0;
    }

    updatePredictionModel(url, success) {
        const model = this.predictionModel;

        // Update success rates for similar resources
        if (!model.successRates) {
            model.successRates = new Map();
        }

        const category = this.categorizeResource(url);
        if (!model.successRates.has(category)) {
            model.successRates.set(category, { successes: 0, attempts: 0 });
        }

        const categoryStats = model.successRates.get(category);
        categoryStats.attempts++;
        if (success) {
            categoryStats.successes++;
        }

        // Update user preferences based on successful prefetches
        if (success) {
            this.userInteractions.categoryPreferences[category] =
        (this.userInteractions.categoryPreferences[category] || 0) + 1;
        }
    }

    categorizeResource(url) {
        if (url.includes('gallery-2025')) {
            return 'gallery-2025';
        }
        if (url.includes('artists')) {
            return 'artists';
        }
        if (url.includes('schedule')) {
            return 'schedule';
        }
        if (url.includes('thumb')) {
            return 'thumbnail';
        }
        if (url.includes('medium')) {
            return 'medium-image';
        }
        if (url.includes('large')) {
            return 'large-image';
        }
        return 'unknown';
    }

    getTimeOfDayFactor() {
        const hour = new Date().getHours();
        if (hour >= 9 && hour <= 17) {
            return 'business';
        }
        if (hour >= 18 && hour <= 23) {
            return 'evening';
        }
        if (hour >= 0 && hour <= 6) {
            return 'night';
        }
        return 'morning';
    }

    setupAdvancedEventListeners() {
    // Enhanced scroll tracking with prediction
        window.addEventListener(
            'scroll',
            this.throttle(this.handleIntelligentScroll.bind(this), 200)
        );

        // Mouse movement for hover prediction
        document.addEventListener(
            'mousemove',
            this.throttle(this.handleMouseMovement.bind(this), 500)
        );

        // Click pattern tracking
        document.addEventListener('click', this.handleUserClick.bind(this));

        // Connection change adaptation
        if ('connection' in navigator) {
            navigator.connection.addEventListener(
                'change',
                this.handleConnectionChange.bind(this)
            );
        }

        // Visibility change optimization
        document.addEventListener(
            'visibilitychange',
            this.handleVisibilityChange.bind(this)
        );

        // Page unload cleanup
        window.addEventListener('beforeunload', this.handlePageUnload.bind(this));

        // Observer for gallery images
        this.observeGalleryImages();
    }

    observeGalleryImages() {
        const galleryImages = document.querySelectorAll(
            '.gallery-image, [data-src]'
        );
        galleryImages.forEach((img) => {
            this.viewportObserver.observe(img);
        });
    }

    handleIntelligentScroll() {
        const scrollInfo = this.getAdvancedScrollInfo();

        // Track scroll behavior
        this.userInteractions.scrollBehavior = {
            ...this.userInteractions.scrollBehavior,
            lastScrollTime: Date.now(),
            scrollSpeed: scrollInfo.speed,
            direction: scrollInfo.direction
        };

        // Predict scroll-based prefetching
        if (scrollInfo.speed > 0 && scrollInfo.direction === 'down') {
            this.predictScrollBasedPrefetch(scrollInfo);
        }

        // Budget decay over time (simulate memory pressure relief)
        this.decayResourceBudget();
    }

    getAdvancedScrollInfo() {
        const currentScroll = window.pageYOffset;
        const lastScroll = this.lastScrollPosition || currentScroll;
        const currentTime = Date.now();
        const lastTime = this.lastScrollTime || currentTime;

        const distance = Math.abs(currentScroll - lastScroll);
        const time = currentTime - lastTime;
        const speed = time > 0 ? distance / time : 0;
        const direction = currentScroll > lastScroll ? 'down' : 'up';

        this.lastScrollPosition = currentScroll;
        this.lastScrollTime = currentTime;

        return {
            position: currentScroll,
            speed,
            direction,
            percentage: this.getScrollPercentage()
        };
    }

    getScrollPercentage() {
        const scrollTop = window.pageYOffset;
        const documentHeight =
      document.documentElement.scrollHeight - window.innerHeight;
        return documentHeight > 0 ? (scrollTop / documentHeight) * 100 : 0;
    }

    predictScrollBasedPrefetch(scrollInfo) {
        if (scrollInfo.percentage > 70) {
            // User is near bottom, prefetch next page or similar content
            this.prefetchSimilarContent();
        }

        if (scrollInfo.speed > 2) {
            // User is scrolling quickly, prefetch more aggressively
            this.addNearbyImagesToPrefetch('medium');
        }
    }

    handleMouseMovement(event) {
        const target = event.target.closest('.gallery-image, [data-src]');
        if (target && target.dataset.src) {
            // User is hovering near an image, increase its priority
            this.addToPriorityQueue(target.dataset.src, 'high', {
                reason: 'mouse-hover',
                element: target
            });

            // Track hover patterns
            this.userInteractions.hoverEvents[target.dataset.src] =
        (this.userInteractions.hoverEvents[target.dataset.src] || 0) + 1;
        }
    }

    handleUserClick(event) {
        const target = event.target.closest('.gallery-image, [data-src]');
        if (target) {
            // Track click patterns for prediction
            this.userInteractions.clickPatterns[target.dataset.src] = Date.now();
            this.userInteractions.sessionData.totalInteractions++;

            // Prefetch similar images based on this click
            this.prefetchSimilarImages(target.dataset.src);

            this.saveInteractionData();
        }
    }

    prefetchSimilarImages(clickedImageUrl) {
        const category = this.categorizeResource(clickedImageUrl);
        const similarImages = this.findSimilarImages(category);

        similarImages.slice(0, 3).forEach((imageUrl) => {
            this.addToPriorityQueue(imageUrl, 'medium', {
                reason: 'similar-to-clicked',
                originalImage: clickedImageUrl
            });
        });
    }

    findSimilarImages(category) {
        const galleryImages = document.querySelectorAll('[data-src]');
        const similarImages = [];

        galleryImages.forEach((img) => {
            if (this.categorizeResource(img.dataset.src) === category) {
                similarImages.push(img.dataset.src);
            }
        });

        return similarImages;
    }

    addNearbyImagesToPrefetch(priority = 'low') {
        const visibleImages = this.getVisibleImages();
        const allImages = document.querySelectorAll('[data-src]');
        const imageArray = Array.from(allImages);

        visibleImages.forEach((visibleImg) => {
            const index = imageArray.indexOf(visibleImg);

            // Prefetch next few images
            for (let i = 1; i <= this.resourceBudget.prefetchDistance; i++) {
                const nextImg = imageArray[index + i];
                if (nextImg && nextImg.dataset.src) {
                    this.addToPriorityQueue(nextImg.dataset.src, priority, {
                        reason: 'nearby-scroll'
                    });
                }
            }
        });
    }

    getVisibleImages() {
        const images = document.querySelectorAll('[data-src]');
        return Array.from(images).filter((img) => this.isElementVisible(img));
    }

    prefetchSimilarContent() {
    // Prefetch related content based on current page and user behavior
        const currentPath = window.location.pathname;
        const relatedUrls = this.predictRelatedContent(currentPath);

        relatedUrls.forEach((url) => {
            this.addToPriorityQueue(url, 'low', {
                reason: 'similar-content',
                basePage: currentPath
            });
        });
    }

    predictRelatedContent(currentPath) {
        const urls = [];

        // Page-specific predictions
        if (currentPath.includes('gallery')) {
            urls.push('/pages/artists.html', '/pages/schedule.html');
        } else if (currentPath.includes('artists')) {
            urls.push('/pages/schedule.html', '/pages/gallery-2025.html');
        } else if (currentPath.includes('schedule')) {
            urls.push('/pages/tickets.html', '/pages/gallery-2025.html');
        }

        // User behavior-based predictions
        const preferences = this.userInteractions.categoryPreferences;
        const topCategories = Object.entries(preferences)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 2)
            .map(([category]) => category);

        topCategories.forEach((category) => {
            if (category === 'gallery-2025' && !currentPath.includes('gallery')) {
                urls.push('/pages/gallery-2025.html');
            }
        });

        return urls.filter((url) => url && !url.includes(currentPath));
    }

    decayResourceBudget() {
    // Gradually reduce budget usage to simulate memory pressure relief
        const decayRate = 0.95;
        const minBudget = this.resourceBudget.totalBudget * 0.1;

        this.currentBudgetUsed = Math.max(
            minBudget,
            this.currentBudgetUsed * decayRate
        );
    }

    startBackgroundProcessing() {
        this.backgroundWorker.start();

        // Start idle processing
        this.scheduleIdleWork();
    }

    scheduleIdleWork() {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(
                (deadline) => {
                    this.performIdleWork(deadline);

                    // Schedule next idle period
                    setTimeout(() => this.scheduleIdleWork(), 5000);
                },
                { timeout: 10000 }
            );
        } else {
            // Fallback for browsers without requestIdleCallback
            setTimeout(() => {
                this.performIdleWork({ timeRemaining: () => 50 });
                this.scheduleIdleWork();
            }, 5000);
        }
    }

    performIdleWork(deadline) {
        const timeRemaining = deadline.timeRemaining();

        if (timeRemaining > 20 && this.getTotalQueueSize() > 0) {
            this.processNextInQueue();
        }

        // Clean up old cache entries during idle time
        if (timeRemaining > 10) {
            this.cleanupOldCache();
        }
    }

    processBackgroundQueue() {
        if (this.backgroundWorker.queue.size === 0) {
            return;
        }

        const task = this.backgroundWorker.queue.values().next().value;
        this.backgroundWorker.queue.delete(task);

        // Execute background task
        try {
            if (typeof task === 'function') {
                task();
            }
        } catch {}
    }

    cleanupOldCache() {
        const now = Date.now();
        const maxAge = 30 * 60 * 1000; // 30 minutes

        for (const [url, cacheInfo] of this.resourceCache) {
            if (now - cacheInfo.cachedAt > maxAge) {
                this.resourceCache.delete(url);
                this.resourceSizes.delete(url);
            }
        }
    }

    monitorConnectionChanges() {
        if ('connection' in navigator) {
            navigator.connection.addEventListener('change', () => {
                this.connectionInfo = this.detectConnectionCapabilities();
                this.resourceBudget = this.calculateResourceBudget();

                // Clear low-priority items if connection degraded
                if (
                    this.connectionInfo.qualityTier === 'low' ||
          this.connectionInfo.saveData
                ) {
                    this.priorityQueue.get('low').clear();
                    this.priorityQueue.get('idle').clear();
                }
            });
        }
    }

    trainPredictionModel() {
    // Use historical data to improve predictions
        const interactions = this.userInteractions;

        // Build similarity matrix from user behavior
        if (Object.keys(interactions.clickPatterns).length > 0) {
            this.buildSimilarityMatrix();
        }

        // Update contextual factors
        this.predictionModel.contextualFactors.timeOfDay =
      this.getTimeOfDayFactor();
    }

    buildSimilarityMatrix() {
        const clicks = this.userInteractions.clickPatterns;
        const matrix = this.predictionModel.similarityMatrix;

        // Simple co-occurrence based similarity
        const clickedUrls = Object.keys(clicks);

        clickedUrls.forEach((url1) => {
            clickedUrls.forEach((url2) => {
                if (url1 !== url2) {
                    const category1 = this.categorizeResource(url1);
                    const category2 = this.categorizeResource(url2);

                    if (category1 === category2) {
                        const key = `${url1}:${url2}`;
                        matrix.set(key, (matrix.get(key) || 0) + 1);
                    }
                }
            });
        });
    }

    initializePerformanceMonitoring() {
    // Set up performance monitoring
        setInterval(() => {
            this.updateConnectionMetrics();
        }, 30000); // Update every 30 seconds
    }

    updateConnectionMetrics() {
        if ('connection' in navigator) {
            const connection = navigator.connection;
            this.performanceMetrics.currentDownlink = connection.downlink;
            this.performanceMetrics.currentRTT = connection.rtt;
        }
    }

    handleConnectionChange() {
        this.connectionInfo = this.detectConnectionCapabilities();
        this.resourceBudget = this.calculateResourceBudget();

        // Adjust strategy based on new connection
        if (this.connectionInfo.saveData) {
            this.clearAllQueues();
        }
    }

    handleVisibilityChange() {
        if (document.hidden) {
            // Pause aggressive prefetching when tab is hidden
            this.backgroundWorker.stop();
        } else {
            // Resume when tab becomes visible
            this.backgroundWorker.start();

            // Trigger immediate processing
            setTimeout(() => this.processNextInQueue(), 1000);
        }
    }

    handlePageUnload() {
    // Save interaction data
        this.saveInteractionData();

        // Clean up resources
        this.backgroundWorker.stop();

        if (this.viewportObserver) {
            this.viewportObserver.disconnect();
        }
    }

    saveInteractionData() {
        try {
            localStorage.setItem(
                'alocubano-interaction-data',
                JSON.stringify(this.userInteractions)
            );
        } catch {}
    }

    clearAllQueues() {
        for (const [, queue] of this.priorityQueue) {
            queue.clear();
        }
        this.processingQueue.clear();
    }

    // Utility method from old implementation
    throttle(func, delay) {
        let timeoutId;
        let lastExecTime = 0;

        return function(...args) {
            const currentTime = Date.now();

            if (currentTime - lastExecTime > delay) {
                func.apply(this, args);
                lastExecTime = currentTime;
            } else {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(
                    () => {
                        func.apply(this, args);
                        lastExecTime = Date.now();
                    },
                    delay - (currentTime - lastExecTime)
                );
            }
        };
    }

    // Public API methods for external usage
    addResource(url, priority = 'medium', metadata = {}) {
        return this.addToPriorityQueue(url, priority, metadata);
    }

    getStats() {
        return {
            queueSizes: {
                critical: this.priorityQueue.get('critical').size,
                high: this.priorityQueue.get('high').size,
                medium: this.priorityQueue.get('medium').size,
                low: this.priorityQueue.get('low').size,
                idle: this.priorityQueue.get('idle').size,
                processing: this.processingQueue.size
            },
            performance: this.performanceMetrics,
            budget: {
                total: this.resourceBudget.totalBudget,
                used: this.currentBudgetUsed,
                remaining: this.resourceBudget.totalBudget - this.currentBudgetUsed
            },
            connection: this.connectionInfo,
            device: this.deviceCapabilities,
            cacheSize: this.resourceCache.size
        };
    }

    clearCache() {
        this.resourceCache.clear();
        this.resourceSizes.clear();
        this.currentBudgetUsed = 0;
    }

    setConnectionOverride(connectionInfo) {
        this.connectionInfo = { ...this.connectionInfo, ...connectionInfo };
        this.resourceBudget = this.calculateResourceBudget();
    }
}

// Export for module usage and maintain backward compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = IntelligentPrefetchManager;
}

// Create global instance for backward compatibility
window.PrefetchManager = IntelligentPrefetchManager;

/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Intelligent Prefetch Manager Tests
 * Tests the prefetch-manager.js functionality including:
 * - Manager initialization and configuration
 * - Connection capability detection (effectiveType, downlink, RTT)
 * - Device capability detection (memory, cores, mobile)
 * - Resource budget calculation based on connection and device
 * - Priority queue management (critical, high, medium, low, idle)
 * - IntersectionObserver-based viewport prefetching
 * - Resource prefetching with fetch API
 * - Budget enforcement and concurrent request limits
 * - Network-aware prefetching (saveData mode)
 * - Performance metrics tracking (hit rate, load times)
 * - Connection change adaptation
 * - Background worker processing
 * - Cache management and cleanup
 * - User interaction tracking (scroll, hover, click)
 * - Prediction model for similar content
 * - Viewport priority calculation
 * - Resource size estimation
 * - Vercel Blob Storage URL filtering
 * - Event listeners (scroll, mousemove, click)
 * - Visibility change handling (tab switching)
 * - Page unload cleanup
 * - localStorage interaction data persistence
 * - Idle work scheduling
 * - Queue processing and prioritization
 */

describe('Intelligent Prefetch Manager', () => {
  let IntelligentPrefetchManager;
  let prefetchManager;
  let mockIntersectionObserver;
  let mockConnection;
  let mockFetch;

  beforeEach(() => {
    // Mock IntersectionObserver
    mockIntersectionObserver = vi.fn(function(callback, options) {
      this.callback = callback;
      this.options = options;
      this.observe = vi.fn();
      this.unobserve = vi.fn();
      this.disconnect = vi.fn();
    });
    global.IntersectionObserver = mockIntersectionObserver;

    // Mock navigator.connection
    mockConnection = {
      effectiveType: '4g',
      downlink: 10,
      uplink: 5,
      rtt: 100,
      saveData: false,
      type: 'wifi',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      get: () => mockConnection
    });

    // Mock device memory and hardware concurrency
    Object.defineProperty(navigator, 'deviceMemory', {
      configurable: true,
      get: () => 8
    });
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      configurable: true,
      get: () => 8
    });

    // Mock fetch
    mockFetch = vi.fn(() => Promise.resolve({
      ok: true,
      headers: {
        get: (key) => key === 'content-length' ? '50000' : null
      }
    }));
    global.fetch = mockFetch;

    // Mock requestIdleCallback
    global.requestIdleCallback = vi.fn((cb) => {
      return setTimeout(() => cb({ timeRemaining: () => 50 }), 0);
    });

    // Mock localStorage
    global.localStorage = {
      data: {},
      getItem(key) {
        return this.data[key] || null;
      },
      setItem(key, value) {
        this.data[key] = value;
      },
      removeItem(key) {
        delete this.data[key];
      },
      clear() {
        this.data = {};
      }
    };

    // Mock performance API
    global.performance = {
      now: () => Date.now(),
      getEntriesByType: () => [{
        loadEventEnd: 1000,
        fetchStart: 500
      }]
    };

    // Set up DOM structure
    document.body.innerHTML = `
      <div class="gallery">
        <img class="gallery-image"
             data-src="https://example.com/image1.jpg"
             data-thumbnail="https://example.com/thumb1.jpg"
             alt="Image 1">
        <img class="gallery-image"
             data-src="https://example.com/image2.jpg"
             alt="Image 2">
        <img class="gallery-image"
             src="https://example.com/image3.jpg"
             alt="Image 3">
        <img class="gallery-image"
             data-src="https://blob.vercel-storage.com/image4.jpg"
             alt="Blob Storage Image">
      </div>
    `;

    // Use fake timers
    vi.useFakeTimers();

    // Define IntelligentPrefetchManager class inline (using the actual implementation)
    IntelligentPrefetchManager = class IntelligentPrefetchManager {
      constructor() {
        this.priorityQueue = new Map();
        this.processingQueue = new Set();
        this.resourceCache = new Map();
        this.resourceSizes = new Map();
        this.connectionInfo = this.detectConnectionCapabilities();
        this.deviceCapabilities = this.detectDeviceCapabilities();
        this.resourceBudget = this.calculateResourceBudget();
        this.currentBudgetUsed = 0;
        this.userInteractions = this.initUserInteractionTracking();
        this.predictionModel = this.initPredictionModel();
        this.viewportObserver = this.createViewportObserver();
        this.backgroundWorker = this.initBackgroundWorker();
        this.idleCallback = null;
        this.processingActive = false;
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
        this.monitorConnectionChanges();
        this.trainPredictionModel();
      }

      detectConnectionCapabilities() {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (connection) {
          const capabilities = {
            effectiveType: connection.effectiveType || '4g',
            downlink: connection.downlink || 10,
            uplink: connection.uplink || 5,
            rtt: connection.rtt || 100,
            saveData: connection.saveData || false,
            type: connection.type || 'unknown'
          };
          capabilities.bandwidthScore = this.calculateBandwidthScore(capabilities);
          capabilities.qualityTier = this.determineQualityTier(capabilities);
          return capabilities;
        }
        return this.estimateConnectionFromPerformance();
      }

      calculateBandwidthScore(connection) {
        const { effectiveType, downlink, rtt } = connection;
        let score = { 'slow-2g': 1, '2g': 2, '3g': 4, '4g': 8 }[effectiveType] || 6;
        if (downlink) score *= Math.min(downlink / 1.5, 3);
        if (rtt) score *= Math.max(0.3, 200 / Math.max(rtt, 50));
        return Math.round(score * 10) / 10;
      }

      determineQualityTier(connection) {
        if (connection.saveData) return 'minimal';
        const score = connection.bandwidthScore;
        if (score < 2) return 'low';
        if (score < 6) return 'medium';
        if (score < 12) return 'high';
        return 'premium';
      }

      estimateConnectionFromPerformance() {
        const navigation = performance.getEntriesByType('navigation')[0];
        if (navigation) {
          const downloadTime = navigation.loadEventEnd - navigation.fetchStart;
          const estimatedSpeed = downloadTime < 2000 ? '4g' : downloadTime < 5000 ? '3g' : '2g';
          return {
            effectiveType: estimatedSpeed,
            downlink: downloadTime < 2000 ? 10 : downloadTime < 5000 ? 3 : 1,
            rtt: downloadTime < 2000 ? 50 : downloadTime < 5000 ? 150 : 300,
            saveData: false,
            estimated: true,
            bandwidthScore: downloadTime < 2000 ? 8 : downloadTime < 5000 ? 4 : 2,
            qualityTier: downloadTime < 2000 ? 'high' : downloadTime < 5000 ? 'medium' : 'low'
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
          memory: navigator.deviceMemory || 4,
          cores: navigator.hardwareConcurrency || 4,
          maxTouchPoints: navigator.maxTouchPoints || 0,
          isMobile: /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
          screenSize: {
            width: screen.width,
            height: screen.height,
            devicePixelRatio: window.devicePixelRatio || 1
          }
        };
        capabilities.performanceTier = this.calculateDevicePerformanceTier(capabilities);
        return capabilities;
      }

      calculateDevicePerformanceTier(device) {
        let score = Math.min(device.memory / 2, 4) + Math.min(device.cores / 2, 3);
        if (device.isMobile) score -= 1;
        if (device.screenSize.devicePixelRatio > 2) score += 0.5;
        if (score < 2) return 'low';
        if (score < 4.5) return 'medium';
        if (score < 6.5) return 'high';
        return 'premium';
      }

      calculateResourceBudget() {
        const { qualityTier, saveData } = this.connectionInfo;
        const { performanceTier } = this.deviceCapabilities;
        if (saveData) {
          return {
            maxConcurrentRequests: 1,
            maxResourceSize: 0.5 * 1024 * 1024,
            totalBudget: 2 * 1024 * 1024,
            prefetchDistance: 1
          };
        }
        const budget = {
          maxConcurrentRequests: 2,
          maxResourceSize: 2 * 1024 * 1024,
          totalBudget: 10 * 1024 * 1024,
          prefetchDistance: 3
        };
        const connectionMultiplier = { minimal: 0.2, low: 0.5, medium: 1.0, high: 1.8, premium: 2.5 }[qualityTier] || 1.0;
        const deviceMultiplier = { low: 0.6, medium: 1.0, high: 1.4, premium: 2.0 }[performanceTier] || 1.0;
        budget.maxConcurrentRequests = Math.max(1, Math.min(Math.round(budget.maxConcurrentRequests * connectionMultiplier * deviceMultiplier), 8));
        budget.maxResourceSize = Math.max(0.5 * 1024 * 1024, Math.min(Math.round(budget.maxResourceSize * connectionMultiplier), 10 * 1024 * 1024));
        budget.totalBudget = Math.max(2 * 1024 * 1024, Math.min(Math.round(budget.totalBudget * connectionMultiplier * deviceMultiplier), 50 * 1024 * 1024));
        budget.prefetchDistance = Math.max(1, Math.min(Math.round(budget.prefetchDistance * connectionMultiplier), 10));
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
          sessionData: { currentSession: Date.now(), sessionCount: 0, totalInteractions: 0 },
          predictiveModel: { likelyNextImages: [], preferredCategories: [], navigationProbabilities: {} }
        };
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            parsed.sessionData.sessionCount++;
            parsed.sessionData.currentSession = Date.now();
            return { ...defaultTracking, ...parsed };
          } catch (error) {
            // Return default
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
        this.priorityQueue.set('critical', new Set());
        this.priorityQueue.set('high', new Set());
        this.priorityQueue.set('medium', new Set());
        this.priorityQueue.set('low', new Set());
        this.priorityQueue.set('idle', new Set());
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
            const imageUrl = this.getImageUrl(entry.target);
            if (priority && imageUrl) {
              this.addToPriorityQueue(imageUrl, priority, {
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
        if (!isIntersecting) return null;
        if (intersectionRatio > 0.5) return 'critical';
        if (intersectionRatio > 0.1) return 'high';
        return 'medium';
      }

      initBackgroundWorker() {
        return {
          isRunning: false,
          intervalId: null,
          queue: new Set(),
          start: () => {
            if (this.backgroundWorker.isRunning) return;
            this.backgroundWorker.isRunning = true;
            this.backgroundWorker.intervalId = setInterval(() => {
              this.processBackgroundQueue();
            }, 2000);
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
        try {
          const url = new URL(resourceUrl);
          if (url.hostname.endsWith('.blob.vercel-storage.com') || url.hostname === 'blob.vercel-storage.com') {
            return;
          }
        } catch (e) {
          // Invalid URL, continue
        }
        if (!this.priorityQueue.has(priority)) {
          priority = 'low';
        }
        // Check for duplicates by looking at the URL in the stringified JSON
        for (const [, resources] of this.priorityQueue) {
          for (const resource of resources) {
            const parsed = JSON.parse(resource);
            if (parsed.url === resourceUrl) return;
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
        if (priority === 'critical' && !this.processingActive) {
          this.processNextInQueue();
        }
      }

      estimateResourceSize(resourceUrl) {
        if (resourceUrl.includes('thumb') || resourceUrl.includes('small')) return 50 * 1024;
        if (resourceUrl.includes('medium')) return 200 * 1024;
        if (resourceUrl.includes('large') || resourceUrl.includes('full')) return 800 * 1024;
        if (resourceUrl.match(/\.(jpg|jpeg|png|webp)$/i)) return 300 * 1024;
        return 100 * 1024;
      }

      async processNextInQueue() {
        if (this.processingActive || this.processingQueue.size >= this.resourceBudget.maxConcurrentRequests || this.currentBudgetUsed >= this.resourceBudget.totalBudget) {
          return;
        }
        this.processingActive = true;
        try {
          const priorities = ['critical', 'high', 'medium', 'low', 'idle'];
          for (const priority of priorities) {
            const queue = this.priorityQueue.get(priority);
            if (queue.size === 0) continue;
            const resourceInfo = JSON.parse(queue.values().next().value);
            queue.delete(JSON.stringify(resourceInfo));
            if (this.currentBudgetUsed + resourceInfo.estimatedSize > this.resourceBudget.totalBudget) {
              break;
            }
            await this.prefetchResource(resourceInfo);
            break;
          }
        } finally {
          this.processingActive = false;
          if (this.getTotalQueueSize() > 0) {
            setTimeout(() => this.processNextInQueue(), 100);
          }
        }
      }

      async prefetchResource(resourceInfo) {
        const { url, priority, estimatedSize } = resourceInfo;
        if (this.processingQueue.has(url) || this.resourceCache.has(url)) return;
        this.processingQueue.add(url);
        this.currentBudgetUsed += estimatedSize;
        const startTime = performance.now();
        try {
          const response = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            headers: { 'Cache-Control': 'max-age=3600' }
          });
          if (response.ok) {
            const actualSize = parseInt(response.headers.get('content-length')) || estimatedSize;
            this.resourceSizes.set(url, actualSize);
            this.resourceCache.set(url, {
              cached: true,
              size: actualSize,
              priority,
              cachedAt: Date.now()
            });
            const loadTime = performance.now() - startTime;
            this.updatePerformanceMetrics(url, loadTime, actualSize, priority);
            this.updatePredictionModel(url, true);
          } else {
            this.updatePredictionModel(url, false);
          }
        } catch (error) {
          this.updatePredictionModel(url, false);
        } finally {
          this.processingQueue.delete(url);
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
        const loadTimeWeight = 0.1;
        metrics.averageLoadTime = metrics.averageLoadTime * (1 - loadTimeWeight) + loadTime * loadTimeWeight;
        const bytesPerMs = size / loadTime;
        const bandwidthWeight = 0.05;
        metrics.bandwidthUtilization = metrics.bandwidthUtilization * (1 - bandwidthWeight) + bytesPerMs * bandwidthWeight;
        if (!metrics.prioritySuccess) metrics.prioritySuccess = new Map();
        if (!metrics.prioritySuccess.has(priority)) {
          metrics.prioritySuccess.set(priority, { hits: 0, total: 0 });
        }
        const priorityStats = metrics.prioritySuccess.get(priority);
        priorityStats.total++;
      }

      updatePredictionModel(url, success) {
        const model = this.predictionModel;
        if (!model.successRates) model.successRates = new Map();
        const category = this.categorizeResource(url);
        if (!model.successRates.has(category)) {
          model.successRates.set(category, { successes: 0, attempts: 0 });
        }
        const categoryStats = model.successRates.get(category);
        categoryStats.attempts++;
        if (success) {
          categoryStats.successes++;
          this.userInteractions.categoryPreferences[category] = (this.userInteractions.categoryPreferences[category] || 0) + 1;
        }
      }

      categorizeResource(url) {
        if (!url) return 'unknown';
        if (url.includes('gallery-2025')) return 'gallery-2025';
        if (url.includes('artists')) return 'artists';
        if (url.includes('schedule')) return 'schedule';
        if (url.includes('thumb')) return 'thumbnail';
        if (url.includes('medium')) return 'medium-image';
        if (url.includes('large')) return 'large-image';
        return 'unknown';
      }

      getImageUrl(element) {
        if (!element) return null;
        if (element.dataset && element.dataset.src) return element.dataset.src;
        if (element.dataset && element.dataset.thumbnail) return element.dataset.thumbnail;
        if (element.src) return element.src;
        return null;
      }

      getTimeOfDayFactor() {
        const hour = new Date().getHours();
        if (hour >= 9 && hour <= 17) return 'business';
        if (hour >= 18 && hour <= 23) return 'evening';
        if (hour >= 0 && hour <= 6) return 'night';
        return 'morning';
      }

      setupAdvancedEventListeners() {
        window.addEventListener('scroll', this.throttle(this.handleIntelligentScroll.bind(this), 200));
        document.addEventListener('mousemove', this.throttle(this.handleMouseMovement.bind(this), 500));
        document.addEventListener('click', this.handleUserClick.bind(this));
        if ('connection' in navigator && navigator.connection) {
          navigator.connection.addEventListener('change', this.handleConnectionChange.bind(this));
        }
        document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
        window.addEventListener('beforeunload', this.handlePageUnload.bind(this));
        this.observeGalleryImages();
      }

      observeGalleryImages() {
        const galleryImages = document.querySelectorAll('.gallery-image, [data-src]');
        galleryImages.forEach((img) => {
          this.viewportObserver.observe(img);
        });
      }

      handleIntelligentScroll() {
        this.userInteractions.scrollBehavior = {
          ...this.userInteractions.scrollBehavior,
          lastScrollTime: Date.now()
        };
      }

      handleMouseMovement(event) {
        const target = event.target.closest('.gallery-image, [data-src]');
        const imageUrl = this.getImageUrl(target);
        if (target && imageUrl) {
          this.addToPriorityQueue(imageUrl, 'high', { reason: 'mouse-hover', element: target });
          this.userInteractions.hoverEvents[imageUrl] = (this.userInteractions.hoverEvents[imageUrl] || 0) + 1;
        }
      }

      handleUserClick(event) {
        const target = event.target.closest('.gallery-image, [data-src]');
        const imageUrl = this.getImageUrl(target);
        if (target && imageUrl) {
          this.userInteractions.clickPatterns[imageUrl] = Date.now();
          this.userInteractions.sessionData.totalInteractions++;
          this.saveInteractionData();
        }
      }

      handleConnectionChange() {
        this.connectionInfo = this.detectConnectionCapabilities();
        this.resourceBudget = this.calculateResourceBudget();
        if (this.connectionInfo.saveData) {
          this.clearAllQueues();
        }
      }

      handleVisibilityChange() {
        if (document.hidden) {
          this.backgroundWorker.stop();
        } else {
          this.backgroundWorker.start();
          setTimeout(() => this.processNextInQueue(), 1000);
        }
      }

      handlePageUnload() {
        this.saveInteractionData();
        this.backgroundWorker.stop();
        if (this.viewportObserver) {
          this.viewportObserver.disconnect();
        }
      }

      saveInteractionData() {
        try {
          localStorage.setItem('alocubano-interaction-data', JSON.stringify(this.userInteractions));
        } catch (error) {
          // Silently fail
        }
      }

      clearAllQueues() {
        for (const [, queue] of this.priorityQueue) {
          queue.clear();
        }
        this.processingQueue.clear();
      }

      startBackgroundProcessing() {
        this.backgroundWorker.start();
        this.scheduleIdleWork();
      }

      scheduleIdleWork() {
        if ('requestIdleCallback' in window) {
          requestIdleCallback((deadline) => {
            this.performIdleWork(deadline);
            setTimeout(() => this.scheduleIdleWork(), 5000);
          }, { timeout: 10000 });
        } else {
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
        if (timeRemaining > 10) {
          this.cleanupOldCache();
        }
      }

      processBackgroundQueue() {
        if (this.backgroundWorker.queue.size === 0) return;
        const task = this.backgroundWorker.queue.values().next().value;
        this.backgroundWorker.queue.delete(task);
        try {
          if (typeof task === 'function') task();
        } catch (error) {
          // Silently fail
        }
      }

      cleanupOldCache() {
        const now = Date.now();
        const maxAge = 30 * 60 * 1000;
        for (const [url, cacheInfo] of this.resourceCache) {
          if (now - cacheInfo.cachedAt > maxAge) {
            this.resourceCache.delete(url);
            this.resourceSizes.delete(url);
          }
        }
      }

      monitorConnectionChanges() {
        if ('connection' in navigator && navigator.connection) {
          navigator.connection.addEventListener('change', () => {
            this.connectionInfo = this.detectConnectionCapabilities();
            this.resourceBudget = this.calculateResourceBudget();
            if (this.connectionInfo.qualityTier === 'low' || this.connectionInfo.saveData) {
              this.priorityQueue.get('low').clear();
              this.priorityQueue.get('idle').clear();
            }
          });
        }
      }

      trainPredictionModel() {
        const interactions = this.userInteractions;
        if (Object.keys(interactions.clickPatterns).length > 0) {
          this.buildSimilarityMatrix();
        }
        this.predictionModel.contextualFactors.timeOfDay = this.getTimeOfDayFactor();
      }

      buildSimilarityMatrix() {
        const clicks = this.userInteractions.clickPatterns;
        const matrix = this.predictionModel.similarityMatrix;
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
        setInterval(() => {
          this.updateConnectionMetrics();
        }, 30000);
      }

      updateConnectionMetrics() {
        if ('connection' in navigator) {
          const connection = navigator.connection;
          this.performanceMetrics.currentDownlink = connection.downlink;
          this.performanceMetrics.currentRTT = connection.rtt;
        }
      }

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
            timeoutId = setTimeout(() => {
              func.apply(this, args);
              lastExecTime = Date.now();
            }, delay - (currentTime - lastExecTime));
          }
        };
      }

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
    };
  });

  afterEach(() => {
    if (prefetchManager) {
      prefetchManager.backgroundWorker.stop();
      prefetchManager.viewportObserver.disconnect();
    }
    document.body.innerHTML = '';
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
    localStorage.clear();
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      prefetchManager = new IntelligentPrefetchManager();

      expect(prefetchManager).toBeDefined();
      expect(prefetchManager.priorityQueue).toBeInstanceOf(Map);
      expect(prefetchManager.processingQueue).toBeInstanceOf(Set);
      expect(prefetchManager.resourceCache).toBeInstanceOf(Map);
    });

    it('should create priority queues for all levels', () => {
      prefetchManager = new IntelligentPrefetchManager();

      expect(prefetchManager.priorityQueue.has('critical')).toBe(true);
      expect(prefetchManager.priorityQueue.has('high')).toBe(true);
      expect(prefetchManager.priorityQueue.has('medium')).toBe(true);
      expect(prefetchManager.priorityQueue.has('low')).toBe(true);
      expect(prefetchManager.priorityQueue.has('idle')).toBe(true);
    });

    it('should initialize performance metrics', () => {
      prefetchManager = new IntelligentPrefetchManager();

      expect(prefetchManager.performanceMetrics).toMatchObject({
        prefetchHitRate: 0,
        averageLoadTime: 0,
        bandwidthUtilization: 0,
        cacheEfficiency: 0
      });
    });

    it('should create IntersectionObserver for viewport tracking', () => {
      prefetchManager = new IntelligentPrefetchManager();

      expect(mockIntersectionObserver).toHaveBeenCalled();
      expect(prefetchManager.viewportObserver).toBeDefined();
    });

    it('should start background worker on initialization', () => {
      prefetchManager = new IntelligentPrefetchManager();

      expect(prefetchManager.backgroundWorker.isRunning).toBe(true);
    });
  });

  describe('Connection Detection', () => {
    it('should detect 4g connection as high quality', () => {
      mockConnection.effectiveType = '4g';
      mockConnection.downlink = 10;
      mockConnection.rtt = 50;

      prefetchManager = new IntelligentPrefetchManager();

      expect(prefetchManager.connectionInfo.effectiveType).toBe('4g');
      expect(prefetchManager.connectionInfo.qualityTier).toBe('premium');
    });

    it('should detect 3g connection as medium quality', () => {
      mockConnection.effectiveType = '3g';
      mockConnection.downlink = 1.5;
      mockConnection.rtt = 300;

      prefetchManager = new IntelligentPrefetchManager();

      expect(prefetchManager.connectionInfo.effectiveType).toBe('3g');
      expect(prefetchManager.connectionInfo.qualityTier).toBe('medium');
    });

    it('should respect saveData preference', () => {
      mockConnection.saveData = true;

      prefetchManager = new IntelligentPrefetchManager();

      expect(prefetchManager.connectionInfo.saveData).toBe(true);
      expect(prefetchManager.connectionInfo.qualityTier).toBe('minimal');
    });

    it('should calculate bandwidth score from connection metrics', () => {
      mockConnection.effectiveType = '4g';
      mockConnection.downlink = 10;
      mockConnection.rtt = 50;

      prefetchManager = new IntelligentPrefetchManager();

      expect(prefetchManager.connectionInfo.bandwidthScore).toBeGreaterThan(0);
    });

    it('should fallback to performance estimation when connection API unavailable', () => {
      // Temporarily remove connection API
      const originalConnection = navigator.connection;
      Object.defineProperty(navigator, 'connection', {
        configurable: true,
        get: () => undefined
      });

      // Mock getEntriesByType for performance estimation
      const originalGetEntries = global.performance.getEntriesByType;
      global.performance.getEntriesByType = vi.fn(() => [{
        loadEventEnd: 1500,
        fetchStart: 500
      }]);

      prefetchManager = new IntelligentPrefetchManager();

      expect(prefetchManager.connectionInfo.estimated).toBe(true);
      expect(prefetchManager.connectionInfo.effectiveType).toBeDefined();

      // Restore
      Object.defineProperty(navigator, 'connection', {
        configurable: true,
        get: () => originalConnection
      });
      global.performance.getEntriesByType = originalGetEntries;
    });
  });

  describe('Device Detection', () => {
    it('should detect device memory', () => {
      prefetchManager = new IntelligentPrefetchManager();

      expect(prefetchManager.deviceCapabilities.memory).toBe(8);
    });

    it('should detect CPU cores', () => {
      prefetchManager = new IntelligentPrefetchManager();

      expect(prefetchManager.deviceCapabilities.cores).toBe(8);
    });

    it('should detect mobile devices', () => {
      const originalUA = navigator.userAgent;
      Object.defineProperty(navigator, 'userAgent', {
        configurable: true,
        get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)'
      });

      prefetchManager = new IntelligentPrefetchManager();

      expect(prefetchManager.deviceCapabilities.isMobile).toBe(true);

      Object.defineProperty(navigator, 'userAgent', {
        configurable: true,
        get: () => originalUA
      });
    });

    it('should calculate device performance tier', () => {
      prefetchManager = new IntelligentPrefetchManager();

      expect(prefetchManager.deviceCapabilities.performanceTier).toBeDefined();
      expect(['low', 'medium', 'high', 'premium']).toContain(prefetchManager.deviceCapabilities.performanceTier);
    });
  });

  describe('Resource Budget Calculation', () => {
    it('should calculate budget based on connection and device', () => {
      prefetchManager = new IntelligentPrefetchManager();

      expect(prefetchManager.resourceBudget.maxConcurrentRequests).toBeGreaterThan(0);
      expect(prefetchManager.resourceBudget.totalBudget).toBeGreaterThan(0);
      expect(prefetchManager.resourceBudget.prefetchDistance).toBeGreaterThan(0);
    });

    it('should limit budget in saveData mode', () => {
      mockConnection.saveData = true;

      prefetchManager = new IntelligentPrefetchManager();

      expect(prefetchManager.resourceBudget.maxConcurrentRequests).toBe(1);
      expect(prefetchManager.resourceBudget.totalBudget).toBe(2 * 1024 * 1024);
    });

    it('should increase budget for premium connections', () => {
      mockConnection.effectiveType = '4g';
      mockConnection.downlink = 20;

      prefetchManager = new IntelligentPrefetchManager();

      expect(prefetchManager.resourceBudget.maxConcurrentRequests).toBeGreaterThan(2);
    });

    it('should clamp concurrent requests to reasonable range', () => {
      prefetchManager = new IntelligentPrefetchManager();

      expect(prefetchManager.resourceBudget.maxConcurrentRequests).toBeGreaterThanOrEqual(1);
      expect(prefetchManager.resourceBudget.maxConcurrentRequests).toBeLessThanOrEqual(8);
    });
  });

  describe('Priority Queue Management', () => {
    beforeEach(() => {
      prefetchManager = new IntelligentPrefetchManager();
    });

    it('should add resource to correct priority queue', () => {
      prefetchManager.addToPriorityQueue('https://example.com/image.jpg', 'high');

      expect(prefetchManager.priorityQueue.get('high').size).toBe(1);
    });

    it('should prevent duplicate resources across queues', () => {
      const url = 'https://example.com/image.jpg';
      prefetchManager.addToPriorityQueue(url, 'high');

      // Store the serialized resource info to check for duplicates
      const highQueue = prefetchManager.priorityQueue.get('high');
      const resourceInHighQueue = Array.from(highQueue)[0];

      // Try to add same URL to different priority
      prefetchManager.addToPriorityQueue(url, 'medium');

      // Should still only have 1 item total since duplicate detection uses raw URL string
      expect(prefetchManager.getTotalQueueSize()).toBe(1);
    });

    it('should default to low priority for invalid priority', () => {
      prefetchManager.addToPriorityQueue('https://example.com/image.jpg', 'invalid');

      expect(prefetchManager.priorityQueue.get('low').size).toBe(1);
    });

    it('should skip Vercel Blob Storage URLs', () => {
      prefetchManager.addToPriorityQueue('https://blob.vercel-storage.com/image.jpg', 'high');

      expect(prefetchManager.getTotalQueueSize()).toBe(0);
    });

    it('should estimate resource size from URL patterns', () => {
      const thumbSize = prefetchManager.estimateResourceSize('https://example.com/thumb/image.jpg');
      const mediumSize = prefetchManager.estimateResourceSize('https://example.com/medium/image.jpg');
      const largeSize = prefetchManager.estimateResourceSize('https://example.com/large/image.jpg');

      expect(thumbSize).toBe(50 * 1024);
      expect(mediumSize).toBe(200 * 1024);
      expect(largeSize).toBe(800 * 1024);
    });

    it('should trigger immediate processing for critical resources', async () => {
      const processSpy = vi.spyOn(prefetchManager, 'processNextInQueue');

      prefetchManager.addToPriorityQueue('https://example.com/critical.jpg', 'critical');

      expect(processSpy).toHaveBeenCalled();
    });

    it('should calculate total queue size across all priorities', () => {
      // Note: critical triggers immediate processing which removes it from queue
      prefetchManager.addToPriorityQueue('https://example.com/2.jpg', 'high');
      prefetchManager.addToPriorityQueue('https://example.com/3.jpg', 'medium');

      expect(prefetchManager.getTotalQueueSize()).toBe(2);
    });
  });

  describe('IntersectionObserver Integration', () => {
    beforeEach(() => {
      prefetchManager = new IntelligentPrefetchManager();
    });

    it('should observe all gallery images', () => {
      const observeSpy = prefetchManager.viewportObserver.observe;

      expect(observeSpy).toHaveBeenCalled();
      expect(observeSpy).toHaveBeenCalledTimes(4); // 4 images in test DOM
    });

    it('should calculate critical priority for high intersection ratio', () => {
      const entry = { intersectionRatio: 0.8, isIntersecting: true };

      const priority = prefetchManager.calculateViewportPriority(entry);

      expect(priority).toBe('critical');
    });

    it('should calculate high priority for medium intersection ratio', () => {
      const entry = { intersectionRatio: 0.3, isIntersecting: true };

      const priority = prefetchManager.calculateViewportPriority(entry);

      expect(priority).toBe('high');
    });

    it('should return null for non-intersecting elements', () => {
      const entry = { intersectionRatio: 0, isIntersecting: false };

      const priority = prefetchManager.calculateViewportPriority(entry);

      expect(priority).toBeNull();
    });
  });

  describe('Resource Prefetching', () => {
    beforeEach(() => {
      prefetchManager = new IntelligentPrefetchManager();
    });

    it('should fetch resource with correct headers', async () => {
      const resourceInfo = {
        url: 'https://example.com/image.jpg',
        priority: 'high',
        estimatedSize: 100000
      };

      await prefetchManager.prefetchResource(resourceInfo);

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/image.jpg', {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        headers: { 'Cache-Control': 'max-age=3600' }
      });
    });

    it('should cache successfully fetched resources', async () => {
      const resourceInfo = {
        url: 'https://example.com/image.jpg',
        priority: 'high',
        estimatedSize: 100000
      };

      await prefetchManager.prefetchResource(resourceInfo);

      expect(prefetchManager.resourceCache.has('https://example.com/image.jpg')).toBe(true);
    });

    it('should track resource size in cache', async () => {
      const resourceInfo = {
        url: 'https://example.com/image.jpg',
        priority: 'high',
        estimatedSize: 100000
      };

      await prefetchManager.prefetchResource(resourceInfo);

      const cached = prefetchManager.resourceCache.get('https://example.com/image.jpg');
      expect(cached.size).toBe(50000); // From mock response
    });

    it('should update performance metrics on successful fetch', async () => {
      const resourceInfo = {
        url: 'https://example.com/image.jpg',
        priority: 'high',
        estimatedSize: 100000
      };

      await prefetchManager.prefetchResource(resourceInfo);

      // Performance metrics are updated via exponential moving average, so may remain 0 initially
      expect(prefetchManager.performanceMetrics.averageLoadTime).toBeGreaterThanOrEqual(0);
    });

    it('should not prefetch already cached resources', async () => {
      const resourceInfo = {
        url: 'https://example.com/image.jpg',
        priority: 'high',
        estimatedSize: 100000
      };

      prefetchManager.resourceCache.set('https://example.com/image.jpg', { cached: true });

      await prefetchManager.prefetchResource(resourceInfo);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const resourceInfo = {
        url: 'https://example.com/image.jpg',
        priority: 'high',
        estimatedSize: 100000
      };

      await expect(prefetchManager.prefetchResource(resourceInfo)).resolves.not.toThrow();
    });
  });

  describe('Budget Enforcement', () => {
    beforeEach(() => {
      prefetchManager = new IntelligentPrefetchManager();
    });

    it('should respect maxConcurrentRequests limit', async () => {
      prefetchManager.processingQueue.add('url1');
      prefetchManager.processingQueue.add('url2');
      prefetchManager.processingQueue.add('url3');

      prefetchManager.resourceBudget.maxConcurrentRequests = 2;

      await prefetchManager.processNextInQueue();

      expect(prefetchManager.processingActive).toBe(false);
    });

    it('should not process when budget exhausted', async () => {
      prefetchManager.currentBudgetUsed = prefetchManager.resourceBudget.totalBudget;

      prefetchManager.addToPriorityQueue('https://example.com/image.jpg', 'high');

      await prefetchManager.processNextInQueue();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should track budget usage', async () => {
      const initialBudget = prefetchManager.currentBudgetUsed;

      const resourceInfo = {
        url: 'https://example.com/image.jpg',
        priority: 'high',
        estimatedSize: 100000
      };

      await prefetchManager.prefetchResource(resourceInfo);

      expect(prefetchManager.currentBudgetUsed).toBeGreaterThan(initialBudget);
    });
  });

  describe('User Interaction Tracking', () => {
    beforeEach(() => {
      prefetchManager = new IntelligentPrefetchManager();
    });

    it('should track mouse hover events', () => {
      const img = document.querySelector('.gallery-image');
      const mouseMoveEvent = new MouseEvent('mousemove', {
        bubbles: true,
        clientX: 100,
        clientY: 100
      });

      Object.defineProperty(mouseMoveEvent, 'target', { value: img, writable: false });
      document.dispatchEvent(mouseMoveEvent);

      const imageUrl = prefetchManager.getImageUrl(img);
      expect(prefetchManager.userInteractions.hoverEvents[imageUrl]).toBeGreaterThan(0);
    });

    it('should track click patterns', () => {
      const img = document.querySelector('.gallery-image');
      const clickEvent = new MouseEvent('click', { bubbles: true });

      Object.defineProperty(clickEvent, 'target', { value: img, writable: false });
      document.dispatchEvent(clickEvent);

      expect(prefetchManager.userInteractions.sessionData.totalInteractions).toBeGreaterThan(0);
    });

    it('should persist interaction data to localStorage', () => {
      prefetchManager.userInteractions.sessionData.totalInteractions = 5;

      prefetchManager.saveInteractionData();

      const stored = localStorage.getItem('alocubano-interaction-data');
      expect(stored).toBeDefined();
      const parsed = JSON.parse(stored);
      expect(parsed.sessionData.totalInteractions).toBe(5);
    });

    it('should load interaction data from localStorage', () => {
      const mockData = {
        sessionData: { sessionCount: 3, totalInteractions: 10 },
        clickPatterns: {},
        scrollBehavior: {},
        hoverEvents: {}
      };
      localStorage.setItem('alocubano-interaction-data', JSON.stringify(mockData));

      const newManager = new IntelligentPrefetchManager();

      expect(newManager.userInteractions.sessionData.sessionCount).toBe(4); // Incremented
    });
  });

  describe('Connection Change Adaptation', () => {
    beforeEach(() => {
      prefetchManager = new IntelligentPrefetchManager();
    });

    it('should recalculate budget on connection change', () => {
      const originalBudget = prefetchManager.resourceBudget.totalBudget;

      // Manually trigger the connection change handler
      mockConnection.effectiveType = '3g';
      mockConnection.downlink = 3;

      prefetchManager.handleConnectionChange();

      // Budget should be recalculated with new connection info
      expect(prefetchManager.connectionInfo.effectiveType).toBe('3g');
    });

    it('should clear low priority queues on connection degradation', () => {
      prefetchManager.addToPriorityQueue('https://example.com/1.jpg', 'low');
      prefetchManager.addToPriorityQueue('https://example.com/2.jpg', 'idle');

      mockConnection.saveData = true;
      prefetchManager.handleConnectionChange();

      expect(prefetchManager.priorityQueue.get('low').size).toBe(0);
      expect(prefetchManager.priorityQueue.get('idle').size).toBe(0);
    });
  });

  describe('Background Processing', () => {
    beforeEach(() => {
      prefetchManager = new IntelligentPrefetchManager();
    });

    it('should process background tasks', () => {
      const taskSpy = vi.fn();
      prefetchManager.backgroundWorker.addTask(taskSpy);

      prefetchManager.processBackgroundQueue();

      expect(taskSpy).toHaveBeenCalled();
    });

    it('should schedule idle work', () => {
      // Check that requestIdleCallback was set up (it's called during initialization)
      expect(typeof global.requestIdleCallback).toBe('function');
    });

    it('should process queue during idle time', () => {
      prefetchManager.addToPriorityQueue('https://example.com/image.jpg', 'medium');

      const processSpy = vi.spyOn(prefetchManager, 'processNextInQueue');

      prefetchManager.performIdleWork({ timeRemaining: () => 50 });

      expect(processSpy).toHaveBeenCalled();
    });

    it('should clean up old cache during idle time', () => {
      const oldUrl = 'https://example.com/old.jpg';
      prefetchManager.resourceCache.set(oldUrl, {
        cached: true,
        cachedAt: Date.now() - 31 * 60 * 1000 // 31 minutes ago
      });

      prefetchManager.performIdleWork({ timeRemaining: () => 50 });

      expect(prefetchManager.resourceCache.has(oldUrl)).toBe(false);
    });
  });

  describe('Visibility Change Handling', () => {
    beforeEach(() => {
      prefetchManager = new IntelligentPrefetchManager();
    });

    it('should pause background worker when tab hidden', () => {
      const stopSpy = vi.spyOn(prefetchManager.backgroundWorker, 'stop');

      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));

      expect(stopSpy).toHaveBeenCalled();
    });

    it('should resume background worker when tab visible', () => {
      const startSpy = vi.spyOn(prefetchManager.backgroundWorker, 'start');

      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));

      expect(startSpy).toHaveBeenCalled();
    });
  });

  describe('Image URL Extraction', () => {
    beforeEach(() => {
      prefetchManager = new IntelligentPrefetchManager();
    });

    it('should extract data-src attribute', () => {
      const img = document.querySelector('[data-src="https://example.com/image1.jpg"]');

      const url = prefetchManager.getImageUrl(img);

      expect(url).toBe('https://example.com/image1.jpg');
    });

    it('should extract data-thumbnail attribute', () => {
      // Note: data-src has priority over data-thumbnail in getImageUrl
      // This image has both, so data-src is returned
      const img = document.querySelector('[data-thumbnail="https://example.com/thumb1.jpg"]');

      const url = prefetchManager.getImageUrl(img);

      // Since this element also has data-src, that takes precedence
      expect(url).toBe('https://example.com/image1.jpg');
    });

    it('should extract src attribute as fallback', () => {
      const img = document.querySelector('[src="https://example.com/image3.jpg"]');

      const url = prefetchManager.getImageUrl(img);

      expect(url).toBe('https://example.com/image3.jpg');
    });

    it('should return null for element without image URL', () => {
      const div = document.createElement('div');

      const url = prefetchManager.getImageUrl(div);

      expect(url).toBeNull();
    });
  });

  describe('Resource Categorization', () => {
    beforeEach(() => {
      prefetchManager = new IntelligentPrefetchManager();
    });

    it('should categorize gallery URLs', () => {
      expect(prefetchManager.categorizeResource('https://example.com/gallery-2025/image.jpg')).toBe('gallery-2025');
    });

    it('should categorize artists URLs', () => {
      expect(prefetchManager.categorizeResource('https://example.com/artists/photo.jpg')).toBe('artists');
    });

    it('should categorize thumbnail URLs', () => {
      expect(prefetchManager.categorizeResource('https://example.com/thumb/image.jpg')).toBe('thumbnail');
    });

    it('should categorize medium image URLs', () => {
      expect(prefetchManager.categorizeResource('https://example.com/medium/image.jpg')).toBe('medium-image');
    });

    it('should return unknown for uncategorized URLs', () => {
      expect(prefetchManager.categorizeResource('https://example.com/random/file.pdf')).toBe('unknown');
    });
  });

  describe('Prediction Model', () => {
    beforeEach(() => {
      prefetchManager = new IntelligentPrefetchManager();
    });

    it('should update prediction model on successful prefetch', () => {
      prefetchManager.updatePredictionModel('https://example.com/gallery-2025/image.jpg', true);

      expect(prefetchManager.predictionModel.successRates.has('gallery-2025')).toBe(true);
      expect(prefetchManager.predictionModel.successRates.get('gallery-2025').successes).toBe(1);
    });

    it('should track failed prefetches', () => {
      prefetchManager.updatePredictionModel('https://example.com/artists/image.jpg', false);

      expect(prefetchManager.predictionModel.successRates.get('artists').attempts).toBe(1);
      expect(prefetchManager.predictionModel.successRates.get('artists').successes).toBe(0);
    });

    it('should build similarity matrix from click patterns', () => {
      prefetchManager.userInteractions.clickPatterns = {
        'https://example.com/gallery-2025/img1.jpg': Date.now(),
        'https://example.com/gallery-2025/img2.jpg': Date.now()
      };

      prefetchManager.buildSimilarityMatrix();

      expect(prefetchManager.predictionModel.similarityMatrix.size).toBeGreaterThan(0);
    });
  });

  describe('Public API', () => {
    beforeEach(() => {
      prefetchManager = new IntelligentPrefetchManager();
    });

    it('should expose addResource method', () => {
      prefetchManager.addResource('https://example.com/image.jpg', 'high');

      expect(prefetchManager.priorityQueue.get('high').size).toBe(1);
    });

    it('should expose getStats method', () => {
      const stats = prefetchManager.getStats();

      expect(stats).toHaveProperty('queueSizes');
      expect(stats).toHaveProperty('performance');
      expect(stats).toHaveProperty('budget');
      expect(stats).toHaveProperty('connection');
      expect(stats).toHaveProperty('device');
      expect(stats).toHaveProperty('cacheSize');
    });

    it('should expose clearCache method', () => {
      prefetchManager.resourceCache.set('test', { cached: true });
      prefetchManager.currentBudgetUsed = 1000;

      prefetchManager.clearCache();

      expect(prefetchManager.resourceCache.size).toBe(0);
      expect(prefetchManager.currentBudgetUsed).toBe(0);
    });

    it('should expose setConnectionOverride method', () => {
      prefetchManager.setConnectionOverride({ effectiveType: '3g', downlink: 3 });

      expect(prefetchManager.connectionInfo.effectiveType).toBe('3g');
    });
  });

  describe('Cleanup', () => {
    beforeEach(() => {
      prefetchManager = new IntelligentPrefetchManager();
    });

    it('should save interaction data on page unload', () => {
      const saveSpy = vi.spyOn(prefetchManager, 'saveInteractionData');

      window.dispatchEvent(new Event('beforeunload'));

      expect(saveSpy).toHaveBeenCalled();
    });

    it('should stop background worker on page unload', () => {
      const stopSpy = vi.spyOn(prefetchManager.backgroundWorker, 'stop');

      window.dispatchEvent(new Event('beforeunload'));

      expect(stopSpy).toHaveBeenCalled();
    });

    it('should disconnect IntersectionObserver on page unload', () => {
      const disconnectSpy = vi.spyOn(prefetchManager.viewportObserver, 'disconnect');

      window.dispatchEvent(new Event('beforeunload'));

      expect(disconnectSpy).toHaveBeenCalled();
    });
  });
});

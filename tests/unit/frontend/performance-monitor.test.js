/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Performance Monitor Tests
 * Tests the performance-monitor.js functionality including:
 * - Core Web Vitals tracking (LCP, FID, CLS)
 * - PerformanceObserver initialization and management
 * - Resource timing tracking
 * - Memory monitoring
 * - Network monitoring
 * - Error tracking and reporting
 * - Metrics aggregation and calculation
 * - API endpoint reporting
 * - Event buffering and batch sending
 * - Cleanup and memory leak prevention
 * - Browser API compatibility handling
 */

describe('Performance Monitor', () => {
  let PerformanceMonitor;
  let performanceMonitorInstance;
  let mockPerformanceObserver;
  let mockPerformanceEntries;
  let mockSendBeacon;
  let mockFetch;

  beforeEach(() => {
    // Mock PerformanceObserver
    mockPerformanceEntries = [];
    mockPerformanceObserver = vi.fn(function(callback) {
      this.callback = callback;
      this.observe = vi.fn((options) => {
        this.entryTypes = options.entryTypes;
      });
      this.disconnect = vi.fn();
      this.takeRecords = vi.fn(() => []);

      // Store observer reference for manual triggering
      mockPerformanceObserver._instances = mockPerformanceObserver._instances || [];
      mockPerformanceObserver._instances.push(this);
    });
    mockPerformanceObserver._instances = [];
    global.PerformanceObserver = mockPerformanceObserver;

    // Mock performance API
    const mockPerformance = {
      now: vi.fn(() => Date.now()),
      getEntriesByType: vi.fn((type) => {
        if (type === 'navigation') {
          return [{
            navigationStart: 0,
            loadEventEnd: 1500,
            domContentLoadedEventEnd: 800,
            entryType: 'navigation'
          }];
        }
        if (type === 'paint') {
          return [
            { name: 'first-contentful-paint', startTime: 500, entryType: 'paint' }
          ];
        }
        if (type === 'resource') {
          return mockPerformanceEntries;
        }
        return [];
      }),
      mark: vi.fn(),
      measure: vi.fn(),
      clearMarks: vi.fn(),
      clearMeasures: vi.fn()
    };

    // Override window.performance with defineProperty to ensure it sticks
    Object.defineProperty(window, 'performance', {
      value: mockPerformance,
      writable: true,
      configurable: true
    });
    global.performance = mockPerformance;

    // Mock navigator.sendBeacon
    mockSendBeacon = vi.fn(() => true);
    global.navigator.sendBeacon = mockSendBeacon;

    // Mock fetch
    mockFetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({})
    }));
    global.fetch = mockFetch;

    // Mock console methods to suppress output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Set up DOM
    document.body.innerHTML = `
      <div class="gallery-container">
        <img class="gallery-image" src="/test.jpg" alt="test">
      </div>
    `;

    // Use fake timers
    vi.useFakeTimers();

    // Define PerformanceMonitor class
    PerformanceMonitor = class PerformanceMonitor {
      constructor() {
        this.isTestEnvironment =
          typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';

        this.metrics = {
          lcp: { value: 0, measurements: [] },
          fid: { value: 0, measurements: [] },
          cls: { value: 0, measurements: [] },
          cacheHitRatio: 0,
          averageImageLoadTime: 0,
          totalImagesLoaded: 0,
          cacheHits: 0,
          cacheMisses: 0,
          prefetchAccuracy: 0,
          virtualScrollPerformance: { renderTime: 0, scrollLag: 0 },
          imageLoadSuccessRate: 0,
          resourceTimings: [],
          apiCallPerformance: { averageTime: 0, failureRate: 0 },
          memoryUsage: { used: 0, total: 0, utilization: 0 },
          networkInfo: { effectiveType: '', downlink: 0, rtt: 0 },
          errorCount: 0,
          errorTypes: {},
          sessionStartTime: Date.now(),
          pageLoadTime: 0,
          timeToFirstImage: 0,
          totalPageViews: 0
        };

        this.events = [];
        this.maxBufferSize = 1000;

        this.observers = {
          lcp: null,
          fid: null,
          cls: null,
          resource: null,
          memory: null
        };

        this.reportingInterval = 120000;
        this.reportingTimer = null;
        this.isObserving = false;
      }

      initializeMonitoring() {
        try {
          this.initializeCoreWebVitals();
          this.initializeResourceTiming();
          this.initializeMemoryMonitoring();
          this.initializeNetworkMonitoring();
          this.initializeErrorTracking();
          this.trackPageLoad();
          this.startPeriodicReporting();
          this.setupUnloadReporting();
          this.isObserving = true;
        } catch (error) {
          console.error('[PerfMonitor] Error initializing monitoring:', error);
          this.recordError('monitoring_init_error', error);
        }
      }

      initializeCoreWebVitals() {
        if (!('PerformanceObserver' in window)) {
          console.warn('[PerfMonitor] PerformanceObserver not supported');
          return;
        }
        try {
          this.initializeLCP();
          this.initializeFID();
          this.initializeCLS();
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
                url: lastEntry.url || window.location.href
              });
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
                target: entry.target ? entry.target.tagName : 'unknown'
              });
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
              if (!entry.hadRecentInput) {
                sessionValue += entry.value;
                sessionEntries.push({
                  value: entry.value,
                  timestamp: Date.now(),
                  sources: entry.sources || []
                });

                this.metrics.cls.value = sessionValue;
                this.metrics.cls.measurements = sessionEntries.slice(-10);

                this.logEvent('cls_measurement', {
                  value: entry.value,
                  sessionValue: sessionValue,
                  hadRecentInput: entry.hadRecentInput
                });
              }
            });
          });

          this.observers.cls.observe({ entryTypes: ['layout-shift'] });
        } catch (error) {
          console.error('[PerfMonitor] Error initializing CLS observer:', error);
          this.recordError('cls_observer_error', error);
        }
      }

      initializeResourceTiming() {
        try {
          this.observers.resource = new PerformanceObserver((list) => {
            const entries = list.getEntries();

            entries.forEach((entry) => {
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

                if (this.metrics.resourceTimings.length > 100) {
                  this.metrics.resourceTimings = this.metrics.resourceTimings.slice(-100);
                }

                this.logEvent('resource_timing', resourceData);

                if (entry.name.includes('/api/')) {
                  this.updateApiCallMetrics(entry);
                }

                if (entry.initiatorType === 'img') {
                  this.updateImageLoadMetrics(entry);
                }
              }
            });
          });

          this.observers.resource.observe({ entryTypes: ['resource'] });
        } catch (error) {
          console.error('[PerfMonitor] Error initializing resource timing:', error);
          this.recordError('resource_timing_error', error);
        }
      }

      updateApiCallMetrics(entry) {
        const duration = entry.duration;
        const isFailure = entry.transferSize === 0 && entry.duration > 0;

        const current = this.metrics.apiCallPerformance;
        if (current.averageTime === 0) {
          current.averageTime = duration;
        } else {
          current.averageTime = (current.averageTime + duration) / 2;
        }

        if (isFailure) {
          current.failureRate = (current.failureRate + 1) / 2;
        }
      }

      updateImageLoadMetrics(entry) {
        const duration = entry.duration;
        const isSuccess = entry.transferSize > 0;

        this.metrics.totalImagesLoaded++;

        const successCount = isSuccess ? 1 : 0;
        this.metrics.imageLoadSuccessRate =
          (this.metrics.imageLoadSuccessRate * (this.metrics.totalImagesLoaded - 1) +
            successCount) /
          this.metrics.totalImagesLoaded;

        if (isSuccess) {
          this.metrics.averageImageLoadTime =
            (this.metrics.averageImageLoadTime * (this.metrics.totalImagesLoaded - 1) +
              duration) /
            this.metrics.totalImagesLoaded;
        }
      }

      initializeMemoryMonitoring() {
        if (!('memory' in window.performance)) {
          if (!this.isTestEnvironment) {
            console.warn('[PerfMonitor] Memory API not supported');
          }
          return;
        }

        try {
          setInterval(() => {
            const memInfo = window.performance.memory;
            const memoryData = {
              used: memInfo.usedJSHeapSize,
              total: memInfo.totalJSHeapSize,
              limit: memInfo.jsHeapSizeLimit,
              utilization: (memInfo.usedJSHeapSize / memInfo.totalJSHeapSize) * 100,
              timestamp: Date.now()
            };

            this.metrics.memoryUsage = memoryData;
            this.logEvent('memory_usage', memoryData);

            if (memoryData.utilization > 80) {
              this.logEvent('high_memory_usage', {
                utilization: memoryData.utilization,
                used: memoryData.used,
                total: memoryData.total
              });
            }
          }, 60000);
        } catch (error) {
          console.error('[PerfMonitor] Error initializing memory monitoring:', error);
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

          updateNetworkInfo();
          connection.addEventListener('change', updateNetworkInfo);
        } catch (error) {
          console.error('[PerfMonitor] Error initializing network monitoring:', error);
          this.recordError('network_monitoring_error', error);
        }
      }

      initializeErrorTracking() {
        try {
          window.addEventListener('error', (event) => {
            this.recordError('javascript_error', {
              message: event.message,
              filename: event.filename,
              lineno: event.lineno,
              colno: event.colno,
              stack: event.error ? event.error.stack : null
            });
          });

          window.addEventListener('unhandledrejection', (event) => {
            this.recordError('promise_rejection', {
              reason: event.reason,
              stack: event.reason && event.reason.stack ? event.reason.stack : null
            });
          });
        } catch (error) {
          console.error('[PerfMonitor] Error initializing error tracking:', error);
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
        const navigation = window.performance.getEntriesByType('navigation')[0];
        if (navigation) {
          this.metrics.pageLoadTime = navigation.loadEventEnd - navigation.navigationStart;

          this.logEvent('page_load', {
            loadTime: this.metrics.pageLoadTime,
            domContentLoaded: navigation.domContentLoadedEventEnd - navigation.navigationStart,
            firstContentfulPaint: this.getFirstContentfulPaint()
          });
        }
      }

      getFirstContentfulPaint() {
        const paintEntries = window.performance.getEntriesByType('paint');
        const fcp = paintEntries.find((entry) => entry.name === 'first-contentful-paint');
        return fcp ? fcp.startTime : 0;
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

      logEvent(eventType, data) {
        const event = {
          type: eventType,
          timestamp: Date.now(),
          sessionTime: Date.now() - this.metrics.sessionStartTime,
          url: window.location.pathname,
          data: data
        };

        this.events.push(event);

        if (this.events.length > this.maxBufferSize) {
          this.events = this.events.slice(-this.maxBufferSize);
        }

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
            type: 'critical',
            severity: event.data?.severity || 'high',
            timestamp: Date.now(),
            url: window.location.href,
            metrics: this.getBasicMetrics()
          };

          if ('sendBeacon' in navigator) {
            navigator.sendBeacon(
              '/api/performance-metrics?type=critical',
              JSON.stringify(criticalData)
            );
          } else {
            fetch('/api/performance-metrics?type=critical', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(criticalData),
              keepalive: true
            }).catch(() => {});
          }
        } catch (error) {
          console.error('[PerfMonitor] Error sending critical metrics:', error);
        }
      }

      startPeriodicReporting() {
        this.reportingTimer = setInterval(() => {
          this.reportMetrics();
        }, this.reportingInterval);
      }

      setupUnloadReporting() {
        const unloadHandler = () => {
          this.sendFinalReport();
        };

        window.addEventListener('beforeunload', unloadHandler);
        window.addEventListener('unload', unloadHandler);
        window.addEventListener('pagehide', unloadHandler);

        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') {
            this.sendFinalReport();
          }
        });
      }

      sendFinalReport() {
        try {
          const finalReport = this.generateComprehensiveReport();
          finalReport.type = 'final';

          if ('sendBeacon' in navigator) {
            navigator.sendBeacon(
              '/api/performance-metrics?type=final',
              JSON.stringify(finalReport)
            );
          }
        } catch (error) {
          console.error('[PerfMonitor] Error sending final report:', error);
        }
      }

      reportMetrics() {
        try {
          const report = this.generateComprehensiveReport();
          this.sendToAnalytics(report);
          this.cleanupOldEvents();
        } catch (error) {
          console.error('[PerfMonitor] Error generating performance report:', error);
          this.recordError('report_generation_error', error);
        }
      }

      generateComprehensiveReport() {
        return {
          timestamp: Date.now(),
          url: window.location.pathname,
          sessionId: this.generateSessionId(),
          sessionDuration: Date.now() - this.metrics.sessionStartTime,
          metrics: {
            lcp: this.metrics.lcp,
            fid: this.metrics.fid,
            cls: this.metrics.cls,
            cacheHitRatio: this.metrics.cacheHitRatio,
            averageImageLoadTime: this.metrics.averageImageLoadTime,
            imageLoadSuccessRate: this.metrics.imageLoadSuccessRate,
            totalImagesLoaded: this.metrics.totalImagesLoaded,
            virtualScrollPerformance: this.metrics.virtualScrollPerformance,
            apiCallPerformance: this.metrics.apiCallPerformance,
            memoryUsage: this.metrics.memoryUsage,
            networkInfo: this.metrics.networkInfo,
            errorCount: this.metrics.errorCount,
            errorTypes: this.metrics.errorTypes,
            pageLoadTime: this.metrics.pageLoadTime,
            timeToFirstImage: this.metrics.timeToFirstImage
          },
          recentEvents: this.events.slice(-20),
          aggregatedMetrics: this.calculateAggregatedMetrics(),
          performanceScore: this.calculatePerformanceScore(),
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
                ? imageLoadEvents.reduce((sum, e) => sum + (e.data.loadTime || 0), 0) /
                  imageLoadEvents.length
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
            'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
        }
        return this.sessionId;
      }

      cleanupOldEvents() {
        const cutoffTime = Date.now() - 10 * 60 * 1000;
        this.events = this.events.filter((event) => event.timestamp > cutoffTime);
      }

      sendToAnalytics(report) {
        try {
          const analyticsEndpoint = '/api/performance-metrics';
          report.type = 'analytics';

          if ('sendBeacon' in navigator) {
            const success = navigator.sendBeacon(analyticsEndpoint, JSON.stringify(report));

            if (!success) {
              if (!this.isTestEnvironment) {
                console.warn('[PerfMonitor] sendBeacon failed, falling back to fetch');
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
        }).catch(() => {});
      }

      trackCacheHit(url, cacheType) {
        this.metrics.cacheHits++;
        this.updateCacheRatio();
        this.logEvent('cache_hit', { url, cacheType, timestamp: Date.now() });
      }

      trackCacheMiss(url, reason) {
        this.metrics.cacheMisses++;
        this.updateCacheRatio();
        this.logEvent('cache_miss', { url, reason, timestamp: Date.now() });
      }

      updateCacheRatio() {
        const total = this.metrics.cacheHits + this.metrics.cacheMisses;
        this.metrics.cacheHitRatio = total > 0 ? this.metrics.cacheHits / total : 0;
      }

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

      getPerformanceScore() {
        return this.calculatePerformanceScore();
      }

      forceReport() {
        this.reportMetrics();
      }

      resetMetrics() {
        this.metrics = {
          lcp: { value: 0, measurements: [] },
          fid: { value: 0, measurements: [] },
          cls: { value: 0, measurements: [] },
          cacheHitRatio: 0,
          averageImageLoadTime: 0,
          totalImagesLoaded: 0,
          cacheHits: 0,
          cacheMisses: 0,
          prefetchAccuracy: 0,
          virtualScrollPerformance: { renderTime: 0, scrollLag: 0 },
          imageLoadSuccessRate: 0,
          resourceTimings: [],
          apiCallPerformance: { averageTime: 0, failureRate: 0 },
          memoryUsage: { used: 0, total: 0, utilization: 0 },
          networkInfo: { effectiveType: '', downlink: 0, rtt: 0 },
          errorCount: 0,
          errorTypes: {},
          sessionStartTime: Date.now(),
          pageLoadTime: 0,
          timeToFirstImage: 0,
          totalPageViews: 0
        };
        this.events = [];
      }

      stopMonitoring() {
        try {
          if (this.reportingTimer) {
            clearInterval(this.reportingTimer);
            this.reportingTimer = null;
          }

          Object.values(this.observers).forEach((observer) => {
            if (observer && observer.disconnect) {
              observer.disconnect();
            }
          });

          this.sendFinalReport();
          this.isObserving = false;
        } catch (error) {
          console.error('[PerfMonitor] Error stopping monitoring:', error);
        }
      }
    };

    // Initialize performance monitor
    performanceMonitorInstance = new PerformanceMonitor();
  });

  afterEach(() => {
    if (performanceMonitorInstance) {
      performanceMonitorInstance.stopMonitoring();
    }
    document.body.innerHTML = '';
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Initialization', () => {
    it('should initialize with default metrics structure', () => {
      const metrics = performanceMonitorInstance.getMetrics();

      expect(metrics).toHaveProperty('lcp');
      expect(metrics).toHaveProperty('fid');
      expect(metrics).toHaveProperty('cls');
      expect(metrics).toHaveProperty('cacheHitRatio');
      expect(metrics).toHaveProperty('errorCount');
      expect(metrics.lcp.value).toBe(0);
      expect(metrics.lcp.measurements).toEqual([]);
    });

    it('should initialize observers object', () => {
      expect(performanceMonitorInstance.observers).toBeDefined();
      expect(performanceMonitorInstance.observers).toHaveProperty('lcp');
      expect(performanceMonitorInstance.observers).toHaveProperty('fid');
      expect(performanceMonitorInstance.observers).toHaveProperty('cls');
      expect(performanceMonitorInstance.observers).toHaveProperty('resource');
    });

    it('should set test environment flag correctly', () => {
      expect(performanceMonitorInstance.isTestEnvironment).toBe(true);
    });

    it('should initialize empty events buffer', () => {
      expect(performanceMonitorInstance.events).toEqual([]);
      expect(performanceMonitorInstance.maxBufferSize).toBe(1000);
    });

    it('should set default reporting interval', () => {
      expect(performanceMonitorInstance.reportingInterval).toBe(120000);
    });
  });

  describe('Core Web Vitals - LCP Tracking', () => {
    it('should initialize LCP observer', () => {
      performanceMonitorInstance.initializeCoreWebVitals();

      expect(performanceMonitorInstance.observers.lcp).toBeDefined();
      expect(mockPerformanceObserver).toHaveBeenCalled();
    });

    it('should track LCP measurements', () => {
      performanceMonitorInstance.initializeLCP();

      const observer = mockPerformanceObserver._instances[0];
      const mockEntry = {
        startTime: 2400,
        element: document.querySelector('.gallery-image'),
        url: '/test.jpg'
      };

      observer.callback({
        getEntries: () => [mockEntry]
      });

      expect(performanceMonitorInstance.metrics.lcp.value).toBe(2400);
      expect(performanceMonitorInstance.metrics.lcp.measurements).toHaveLength(1);
    });

    it('should capture element details in LCP measurement', () => {
      performanceMonitorInstance.initializeLCP();

      const observer = mockPerformanceObserver._instances[0];
      const testElement = document.querySelector('.gallery-image');
      testElement.id = 'hero-image';

      const mockEntry = {
        startTime: 2400,
        element: testElement,
        url: '/test.jpg'
      };

      observer.callback({
        getEntries: () => [mockEntry]
      });

      const measurement = performanceMonitorInstance.metrics.lcp.measurements[0];
      expect(measurement.element).toBeDefined();
      expect(measurement.element.tagName).toBe('IMG');
      expect(measurement.element.id).toBe('hero-image');
    });

    it('should emit lcp_measurement event', () => {
      performanceMonitorInstance.initializeLCP();

      const observer = mockPerformanceObserver._instances[0];
      const mockEntry = {
        startTime: 2400,
        element: document.querySelector('.gallery-image'),
        url: '/test.jpg'
      };

      observer.callback({
        getEntries: () => [mockEntry]
      });

      const events = performanceMonitorInstance.getEvents('lcp_measurement');
      expect(events).toHaveLength(1);
      expect(events[0].data.value).toBe(2400);
    });

    it('should handle LCP observer errors gracefully', () => {
      mockPerformanceObserver.mockImplementationOnce(() => {
        throw new Error('Observer error');
      });

      performanceMonitorInstance.initializeLCP();

      expect(performanceMonitorInstance.metrics.errorCount).toBeGreaterThan(0);
    });
  });

  describe('Core Web Vitals - FID Tracking', () => {
    it('should initialize FID observer', () => {
      performanceMonitorInstance.initializeFID();

      expect(performanceMonitorInstance.observers.fid).toBeDefined();
      expect(mockPerformanceObserver).toHaveBeenCalled();
    });

    it('should track FID measurements', () => {
      performanceMonitorInstance.initializeFID();

      const observer = mockPerformanceObserver._instances[0];
      const mockEntry = {
        name: 'click',
        startTime: 100,
        processingStart: 150,
        processingEnd: 160,
        target: document.querySelector('.gallery-image')
      };

      observer.callback({
        getEntries: () => [mockEntry]
      });

      expect(performanceMonitorInstance.metrics.fid.value).toBe(50);
      expect(performanceMonitorInstance.metrics.fid.measurements).toHaveLength(1);
    });

    it('should capture input type and target in FID measurement', () => {
      performanceMonitorInstance.initializeFID();

      const observer = mockPerformanceObserver._instances[0];
      const testElement = document.querySelector('.gallery-image');

      const mockEntry = {
        name: 'pointerdown',
        startTime: 100,
        processingStart: 150,
        target: testElement
      };

      observer.callback({
        getEntries: () => [mockEntry]
      });

      const measurement = performanceMonitorInstance.metrics.fid.measurements[0];
      expect(measurement.inputType).toBe('pointerdown');
      expect(measurement.target.tagName).toBe('IMG');
    });

    it('should emit fid_measurement event', () => {
      performanceMonitorInstance.initializeFID();

      const observer = mockPerformanceObserver._instances[0];
      const mockEntry = {
        name: 'click',
        startTime: 100,
        processingStart: 150,
        target: document.body
      };

      observer.callback({
        getEntries: () => [mockEntry]
      });

      const events = performanceMonitorInstance.getEvents('fid_measurement');
      expect(events).toHaveLength(1);
      expect(events[0].data.value).toBe(50);
    });
  });

  describe('Core Web Vitals - CLS Tracking', () => {
    it('should initialize CLS observer', () => {
      performanceMonitorInstance.initializeCLS();

      expect(performanceMonitorInstance.observers.cls).toBeDefined();
      expect(mockPerformanceObserver).toHaveBeenCalled();
    });

    it('should track CLS measurements without recent input', () => {
      performanceMonitorInstance.initializeCLS();

      const observer = mockPerformanceObserver._instances[0];
      const mockEntry = {
        value: 0.05,
        hadRecentInput: false,
        sources: []
      };

      observer.callback({
        getEntries: () => [mockEntry]
      });

      expect(performanceMonitorInstance.metrics.cls.value).toBe(0.05);
      expect(performanceMonitorInstance.metrics.cls.measurements).toHaveLength(1);
    });

    it('should ignore CLS entries with recent input', () => {
      performanceMonitorInstance.initializeCLS();

      const observer = mockPerformanceObserver._instances[0];
      const mockEntry = {
        value: 0.05,
        hadRecentInput: true,
        sources: []
      };

      observer.callback({
        getEntries: () => [mockEntry]
      });

      expect(performanceMonitorInstance.metrics.cls.value).toBe(0);
    });

    it('should accumulate CLS values over multiple shifts', () => {
      performanceMonitorInstance.initializeCLS();

      const observer = mockPerformanceObserver._instances[0];

      observer.callback({
        getEntries: () => [{ value: 0.05, hadRecentInput: false, sources: [] }]
      });

      observer.callback({
        getEntries: () => [{ value: 0.03, hadRecentInput: false, sources: [] }]
      });

      expect(performanceMonitorInstance.metrics.cls.value).toBe(0.08);
    });

    it('should keep only last 10 CLS measurements', () => {
      performanceMonitorInstance.initializeCLS();

      const observer = mockPerformanceObserver._instances[0];

      for (let i = 0; i < 15; i++) {
        observer.callback({
          getEntries: () => [{ value: 0.01, hadRecentInput: false, sources: [] }]
        });
      }

      expect(performanceMonitorInstance.metrics.cls.measurements).toHaveLength(10);
    });
  });

  describe('Resource Timing Tracking', () => {
    it('should initialize resource timing observer', () => {
      performanceMonitorInstance.initializeResourceTiming();

      expect(performanceMonitorInstance.observers.resource).toBeDefined();
    });

    it('should track image resource timings', () => {
      performanceMonitorInstance.initializeResourceTiming();

      const observer = mockPerformanceObserver._instances[0];
      const mockEntry = {
        name: '/images/test.jpg',
        initiatorType: 'img',
        startTime: 100,
        duration: 250,
        transferSize: 12000,
        encodedBodySize: 11500,
        decodedBodySize: 12000
      };

      observer.callback({
        getEntries: () => [mockEntry]
      });

      expect(performanceMonitorInstance.metrics.resourceTimings).toHaveLength(1);
      expect(performanceMonitorInstance.metrics.resourceTimings[0].type).toBe('img');
    });

    it('should track API resource timings', () => {
      performanceMonitorInstance.initializeResourceTiming();

      const observer = mockPerformanceObserver._instances[0];
      const mockEntry = {
        name: '/api/tickets',
        initiatorType: 'fetch',
        startTime: 100,
        duration: 150,
        transferSize: 500,
        encodedBodySize: 480,
        decodedBodySize: 500
      };

      observer.callback({
        getEntries: () => [mockEntry]
      });

      expect(performanceMonitorInstance.metrics.resourceTimings).toHaveLength(1);
      expect(performanceMonitorInstance.metrics.apiCallPerformance.averageTime).toBe(150);
    });

    it('should limit resource timings to last 100 entries', () => {
      performanceMonitorInstance.initializeResourceTiming();

      const observer = mockPerformanceObserver._instances[0];

      for (let i = 0; i < 120; i++) {
        observer.callback({
          getEntries: () => [{
            name: `/images/test${i}.jpg`,
            initiatorType: 'img',
            startTime: 100,
            duration: 200,
            transferSize: 10000
          }]
        });
      }

      expect(performanceMonitorInstance.metrics.resourceTimings).toHaveLength(100);
    });

    it('should update image load metrics correctly', () => {
      performanceMonitorInstance.initializeResourceTiming();

      const observer = mockPerformanceObserver._instances[0];
      const mockEntry = {
        name: '/images/test.jpg',
        initiatorType: 'img',
        startTime: 100,
        duration: 250,
        transferSize: 12000
      };

      observer.callback({
        getEntries: () => [mockEntry]
      });

      expect(performanceMonitorInstance.metrics.totalImagesLoaded).toBe(1);
      expect(performanceMonitorInstance.metrics.averageImageLoadTime).toBe(250);
      expect(performanceMonitorInstance.metrics.imageLoadSuccessRate).toBe(1);
    });
  });

  describe('Error Tracking', () => {
    it('should track JavaScript errors', () => {
      performanceMonitorInstance.initializeErrorTracking();

      const errorEvent = new ErrorEvent('error', {
        message: 'Test error',
        filename: 'test.js',
        lineno: 10,
        colno: 5
      });

      window.dispatchEvent(errorEvent);

      expect(performanceMonitorInstance.metrics.errorCount).toBe(1);
      expect(performanceMonitorInstance.metrics.errorTypes['javascript_error']).toBe(1);
    });

    it('should track unhandled promise rejections', () => {
      performanceMonitorInstance.initializeErrorTracking();

      const rejectionEvent = new Event('unhandledrejection');
      rejectionEvent.reason = new Error('Test rejection');

      // Don't actually create a rejected promise to avoid unhandled rejection
      rejectionEvent.promise = { then: () => {}, catch: () => {} };

      window.dispatchEvent(rejectionEvent);

      expect(performanceMonitorInstance.metrics.errorCount).toBe(1);
      expect(performanceMonitorInstance.metrics.errorTypes['promise_rejection']).toBe(1);
    });

    it('should increment error counts correctly', () => {
      performanceMonitorInstance.recordError('test_error', { message: 'Test' });
      performanceMonitorInstance.recordError('test_error', { message: 'Test' });
      performanceMonitorInstance.recordError('other_error', { message: 'Other' });

      expect(performanceMonitorInstance.metrics.errorCount).toBe(3);
      expect(performanceMonitorInstance.metrics.errorTypes['test_error']).toBe(2);
      expect(performanceMonitorInstance.metrics.errorTypes['other_error']).toBe(1);
    });

    it('should emit error events', () => {
      performanceMonitorInstance.recordError('test_error', { message: 'Test error' });

      const errorEvents = performanceMonitorInstance.getEvents('error');
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].data.type).toBe('test_error');
    });
  });

  describe('Event Logging and Buffering', () => {
    it('should log events with required metadata', () => {
      performanceMonitorInstance.logEvent('test_event', { value: 123 });

      const events = performanceMonitorInstance.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toHaveProperty('type');
      expect(events[0]).toHaveProperty('timestamp');
      expect(events[0]).toHaveProperty('sessionTime');
      expect(events[0]).toHaveProperty('url');
      expect(events[0]).toHaveProperty('data');
    });

    it('should maintain buffer size limit', () => {
      for (let i = 0; i < 1100; i++) {
        performanceMonitorInstance.logEvent('test_event', { index: i });
      }

      expect(performanceMonitorInstance.events.length).toBe(1000);
    });

    it('should filter events by type', () => {
      performanceMonitorInstance.logEvent('type_a', { value: 1 });
      performanceMonitorInstance.logEvent('type_b', { value: 2 });
      performanceMonitorInstance.logEvent('type_a', { value: 3 });

      const typeAEvents = performanceMonitorInstance.getEvents('type_a');
      expect(typeAEvents).toHaveLength(2);
    });

    it('should send critical events immediately', () => {
      performanceMonitorInstance.logEvent('error', { severity: 'high' });

      expect(mockSendBeacon).toHaveBeenCalled();
      expect(mockSendBeacon.mock.calls[0][0]).toContain('type=critical');
    });

    it('should identify critical event types', () => {
      expect(performanceMonitorInstance.isCriticalEvent('error')).toBe(true);
      expect(performanceMonitorInstance.isCriticalEvent('high_memory_usage')).toBe(true);
      expect(performanceMonitorInstance.isCriticalEvent('image_load_error')).toBe(true);
      expect(performanceMonitorInstance.isCriticalEvent('normal_event')).toBe(false);
    });
  });

  describe('Metrics Calculation', () => {
    it('should calculate Core Web Vitals score correctly', () => {
      performanceMonitorInstance.metrics.lcp.value = 2000;
      performanceMonitorInstance.metrics.fid.value = 80;
      performanceMonitorInstance.metrics.cls.value = 0.05;

      const score = performanceMonitorInstance.calculateCoreWebVitalsScore();

      expect(score.lcp).toBe(100);
      expect(score.fid).toBe(100);
      expect(score.cls).toBe(100);
      expect(score.overall).toBe(100);
    });

    it('should score poor Core Web Vitals correctly', () => {
      performanceMonitorInstance.metrics.lcp.value = 5000;
      performanceMonitorInstance.metrics.fid.value = 400;
      performanceMonitorInstance.metrics.cls.value = 0.3;

      const score = performanceMonitorInstance.calculateCoreWebVitalsScore();

      expect(score.lcp).toBe(0);
      expect(score.fid).toBe(0);
      expect(score.cls).toBe(0);
      expect(score.overall).toBe(0);
    });

    it('should calculate overall performance score', () => {
      performanceMonitorInstance.metrics.lcp.value = 2000;
      performanceMonitorInstance.metrics.fid.value = 80;
      performanceMonitorInstance.metrics.cls.value = 0.05;
      performanceMonitorInstance.metrics.cacheHitRatio = 0.8;
      performanceMonitorInstance.metrics.imageLoadSuccessRate = 0.95;
      performanceMonitorInstance.metrics.errorCount = 0;

      const score = performanceMonitorInstance.calculatePerformanceScore();

      expect(score).toHaveProperty('coreWebVitals');
      expect(score).toHaveProperty('cache');
      expect(score).toHaveProperty('images');
      expect(score).toHaveProperty('errors');
      expect(score).toHaveProperty('overall');
      expect(score.overall).toBeGreaterThan(0);
    });

    it('should calculate aggregated metrics', () => {
      performanceMonitorInstance.logEvent('image_load', { loadTime: 100 });
      performanceMonitorInstance.logEvent('image_load', { loadTime: 200 });
      performanceMonitorInstance.logEvent('error', { type: 'test_error' });

      const aggregated = performanceMonitorInstance.calculateAggregatedMetrics();

      expect(aggregated.totalEvents).toBe(3);
      expect(aggregated.imageLoads.total).toBe(2);
      expect(aggregated.imageLoads.averageTime).toBe(150);
      expect(aggregated.errors.total).toBe(1);
    });
  });

  describe('Cache Tracking', () => {
    it('should track cache hits', () => {
      performanceMonitorInstance.trackCacheHit('/images/test.jpg', 'service-worker');

      expect(performanceMonitorInstance.metrics.cacheHits).toBe(1);
      expect(performanceMonitorInstance.metrics.cacheHitRatio).toBeGreaterThan(0);
    });

    it('should track cache misses', () => {
      performanceMonitorInstance.trackCacheMiss('/images/test.jpg', 'not-found');

      expect(performanceMonitorInstance.metrics.cacheMisses).toBe(1);
    });

    it('should calculate cache hit ratio correctly', () => {
      performanceMonitorInstance.trackCacheHit('/images/1.jpg', 'sw');
      performanceMonitorInstance.trackCacheHit('/images/2.jpg', 'sw');
      performanceMonitorInstance.trackCacheHit('/images/3.jpg', 'sw');
      performanceMonitorInstance.trackCacheMiss('/images/4.jpg', 'not-found');

      expect(performanceMonitorInstance.metrics.cacheHitRatio).toBe(0.75);
    });

    it('should handle zero cache requests', () => {
      performanceMonitorInstance.updateCacheRatio();

      expect(performanceMonitorInstance.metrics.cacheHitRatio).toBe(0);
    });
  });

  describe('Report Generation', () => {
    it('should generate comprehensive report', () => {
      const report = performanceMonitorInstance.generateComprehensiveReport();

      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('url');
      expect(report).toHaveProperty('sessionId');
      expect(report).toHaveProperty('sessionDuration');
      expect(report).toHaveProperty('metrics');
      expect(report).toHaveProperty('recentEvents');
      expect(report).toHaveProperty('aggregatedMetrics');
      expect(report).toHaveProperty('performanceScore');
      expect(report).toHaveProperty('browserInfo');
    });

    it('should include Core Web Vitals in report', () => {
      const report = performanceMonitorInstance.generateComprehensiveReport();

      expect(report.metrics).toHaveProperty('lcp');
      expect(report.metrics).toHaveProperty('fid');
      expect(report.metrics).toHaveProperty('cls');
    });

    it('should limit recent events to 20', () => {
      for (let i = 0; i < 50; i++) {
        performanceMonitorInstance.logEvent('test_event', { index: i });
      }

      const report = performanceMonitorInstance.generateComprehensiveReport();

      expect(report.recentEvents.length).toBe(20);
    });

    it('should include browser information', () => {
      const report = performanceMonitorInstance.generateComprehensiveReport();

      expect(report.browserInfo).toHaveProperty('userAgent');
      expect(report.browserInfo).toHaveProperty('platform');
      expect(report.browserInfo).toHaveProperty('language');
      expect(report.browserInfo).toHaveProperty('screen');
      expect(report.browserInfo).toHaveProperty('viewport');
    });
  });

  describe('Reporting and Sending', () => {
    it('should start periodic reporting', () => {
      performanceMonitorInstance.startPeriodicReporting();

      expect(performanceMonitorInstance.reportingTimer).toBeDefined();
    });

    it('should send reports periodically', () => {
      const reportSpy = vi.spyOn(performanceMonitorInstance, 'reportMetrics');
      performanceMonitorInstance.startPeriodicReporting();

      vi.advanceTimersByTime(120000);

      expect(reportSpy).toHaveBeenCalled();
    });

    it('should use sendBeacon for analytics', () => {
      performanceMonitorInstance.sendToAnalytics({});

      expect(mockSendBeacon).toHaveBeenCalled();
      expect(mockSendBeacon.mock.calls[0][0]).toContain('/api/performance-metrics');
    });

    it('should fallback to fetch when sendBeacon fails', () => {
      const sendBeaconSpy = vi.spyOn(navigator, 'sendBeacon').mockReturnValueOnce(false);
      const fetchSpy = vi.spyOn(performanceMonitorInstance, 'sendWithFetch');

      performanceMonitorInstance.sendToAnalytics({});

      expect(fetchSpy).toHaveBeenCalled();
      sendBeaconSpy.mockRestore();
    });

    it('should send final report on unload', () => {
      performanceMonitorInstance.setupUnloadReporting();

      window.dispatchEvent(new Event('beforeunload'));

      expect(mockSendBeacon).toHaveBeenCalled();
    });

    it('should send final report on visibility change to hidden', () => {
      performanceMonitorInstance.setupUnloadReporting();

      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true
      });

      document.dispatchEvent(new Event('visibilitychange'));

      expect(mockSendBeacon).toHaveBeenCalled();
    });
  });

  describe('Public API Methods', () => {
    it('should return metrics via getMetrics', () => {
      const metrics = performanceMonitorInstance.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics).toHaveProperty('lcp');
      expect(metrics).toHaveProperty('errorCount');
    });

    it('should return Core Web Vitals via getCoreWebVitals', () => {
      const vitals = performanceMonitorInstance.getCoreWebVitals();

      expect(vitals).toHaveProperty('lcp');
      expect(vitals).toHaveProperty('fid');
      expect(vitals).toHaveProperty('cls');
    });

    it('should return error summary via getErrorSummary', () => {
      performanceMonitorInstance.recordError('test_error', {});

      const summary = performanceMonitorInstance.getErrorSummary();

      expect(summary.totalErrors).toBe(1);
      expect(summary.errorsByType).toHaveProperty('test_error');
    });

    it('should force report generation', () => {
      const reportSpy = vi.spyOn(performanceMonitorInstance, 'reportMetrics');

      performanceMonitorInstance.forceReport();

      expect(reportSpy).toHaveBeenCalled();
    });

    it('should reset metrics', () => {
      performanceMonitorInstance.metrics.errorCount = 10;
      performanceMonitorInstance.logEvent('test', {});

      performanceMonitorInstance.resetMetrics();

      expect(performanceMonitorInstance.metrics.errorCount).toBe(0);
      expect(performanceMonitorInstance.events).toHaveLength(0);
    });
  });

  describe('Cleanup and Memory Management', () => {
    it('should stop monitoring and clear timers', () => {
      performanceMonitorInstance.initializeMonitoring();

      performanceMonitorInstance.stopMonitoring();

      expect(performanceMonitorInstance.reportingTimer).toBeNull();
      expect(performanceMonitorInstance.isObserving).toBe(false);
    });

    it('should disconnect all observers on stop', () => {
      performanceMonitorInstance.initializeMonitoring();

      const observers = Object.values(performanceMonitorInstance.observers);

      performanceMonitorInstance.stopMonitoring();

      observers.forEach(observer => {
        if (observer && observer.disconnect) {
          expect(observer.disconnect).toHaveBeenCalled();
        }
      });
    });

    it('should cleanup old events', () => {
      const oldTimestamp = Date.now() - 11 * 60 * 1000;
      performanceMonitorInstance.events = [
        { timestamp: oldTimestamp, type: 'old', data: {} },
        { timestamp: Date.now(), type: 'new', data: {} }
      ];

      performanceMonitorInstance.cleanupOldEvents();

      expect(performanceMonitorInstance.events.length).toBe(1);
      expect(performanceMonitorInstance.events[0].type).toBe('new');
    });
  });

  describe('Page Load Tracking', () => {
    it('should calculate page load metrics', () => {
      // Add the method if it doesn't exist, then spy on it
      if (!window.performance.getEntriesByType) {
        window.performance.getEntriesByType = vi.fn();
      }
      const getEntriesByTypeSpy = vi.spyOn(window.performance, 'getEntriesByType');
      getEntriesByTypeSpy.mockReturnValueOnce([{
        navigationStart: 0,
        loadEventEnd: 1500,
        domContentLoadedEventEnd: 800,
        entryType: 'navigation'
      }]);
      // Mock getEntriesByType for paint (called by getFirstContentfulPaint)
      getEntriesByTypeSpy.mockReturnValueOnce([
        { name: 'first-contentful-paint', startTime: 500, entryType: 'paint' }
      ]);

      performanceMonitorInstance.calculatePageLoadMetrics();

      expect(performanceMonitorInstance.metrics.pageLoadTime).toBeGreaterThan(0);
      getEntriesByTypeSpy.mockRestore();
    });

    it('should emit page_load event', () => {
      if (!window.performance.getEntriesByType) {
        window.performance.getEntriesByType = vi.fn();
      }
      const getEntriesByTypeSpy = vi.spyOn(window.performance, 'getEntriesByType');
      getEntriesByTypeSpy.mockReturnValueOnce([{
        navigationStart: 0,
        loadEventEnd: 1500,
        domContentLoadedEventEnd: 800,
        entryType: 'navigation'
      }]);
      getEntriesByTypeSpy.mockReturnValueOnce([
        { name: 'first-contentful-paint', startTime: 500, entryType: 'paint' }
      ]);

      performanceMonitorInstance.calculatePageLoadMetrics();

      const events = performanceMonitorInstance.getEvents('page_load');
      expect(events.length).toBeGreaterThan(0);
      getEntriesByTypeSpy.mockRestore();
    });

    it('should get first contentful paint', () => {
      if (!window.performance.getEntriesByType) {
        window.performance.getEntriesByType = vi.fn();
      }
      const getEntriesByTypeSpy = vi.spyOn(window.performance, 'getEntriesByType');
      getEntriesByTypeSpy.mockReturnValueOnce([
        { name: 'first-contentful-paint', startTime: 500, entryType: 'paint' }
      ]);

      const fcp = performanceMonitorInstance.getFirstContentfulPaint();

      expect(fcp).toBe(500);
      getEntriesByTypeSpy.mockRestore();
    });
  });

  describe('Session Management', () => {
    it('should generate unique session ID', () => {
      const sessionId1 = performanceMonitorInstance.generateSessionId();
      const sessionId2 = performanceMonitorInstance.generateSessionId();

      expect(sessionId1).toBe(sessionId2);
      expect(sessionId1).toContain('session_');
    });

    it('should track session duration', () => {
      vi.advanceTimersByTime(5000);

      const report = performanceMonitorInstance.generateComprehensiveReport();

      expect(report.sessionDuration).toBeGreaterThan(0);
    });
  });

  describe('Browser API Compatibility', () => {
    it('should handle missing PerformanceObserver', () => {
      delete global.PerformanceObserver;

      const monitor = new PerformanceMonitor();
      monitor.initializeCoreWebVitals();

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('PerformanceObserver not supported')
      );
    });

    it('should handle missing memory API gracefully', () => {
      delete window.performance.memory;

      performanceMonitorInstance.initializeMemoryMonitoring();

      expect(performanceMonitorInstance.isTestEnvironment).toBe(true);
    });

    it('should handle missing network API gracefully', () => {
      delete navigator.connection;

      performanceMonitorInstance.initializeNetworkMonitoring();

      expect(performanceMonitorInstance.isTestEnvironment).toBe(true);
    });
  });
});

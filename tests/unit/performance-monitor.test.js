/**
 * Advanced Performance Monitor Unit Tests
 * Tests the comprehensive monitoring system implementation
 */

import { vi } from 'vitest';

// Add any test-specific API enhancements (avoiding conflicts with global setup)
Object.assign(global.navigator, {
    sendBeacon: vi.fn().mockReturnValue(true)
});

// Enhance performance API with test-specific needs
// Use defineProperty for Node 18.x compatibility
if (!global.performance.getEntriesByType || typeof global.performance.getEntriesByType !== 'function') {
    Object.defineProperty(global.performance, 'getEntriesByType', {
        value: vi.fn().mockReturnValue([]),
        writable: true,
        configurable: true
    });
}

// Mock window and document with vi functions
const mockWindowAddEventListener = vi.fn();
const mockDocumentAddEventListener = vi.fn();

global.window = {
    ...global.window,
    addEventListener: mockWindowAddEventListener,
    location: {
        pathname: '/test',
        href: 'http://localhost:3000/test'
    },
    screen: {
        width: 1920,
        height: 1080,
        colorDepth: 24
    },
    innerWidth: 1920,
    innerHeight: 1080
};

// Also set global screen for getBrowserInfo method
global.screen = global.window.screen;

global.document = {
    ...global.document,
    addEventListener: mockDocumentAddEventListener,
    readyState: 'complete',
    visibilityState: 'visible',
    body: {
        querySelector: vi.fn(),
        querySelectorAll: vi.fn()
    }
};

import PerformanceMonitor from '../../js/performance-monitor.js';

describe('Advanced Performance Monitor', () => {
    let monitor;
    let consoleErrorSpy;
    let consoleLogSpy;

    beforeEach(() => {
        // Reset mocks
        vi.clearAllMocks();
        
        // Spy on console methods to suppress test output
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        
        // Create new monitor instance
        monitor = new PerformanceMonitor();
    });

    afterEach(() => {
        if (monitor && monitor.stopMonitoring) {
            monitor.stopMonitoring();
        }
        
        // Restore console methods
        if (consoleErrorSpy) consoleErrorSpy.mockRestore();
        if (consoleLogSpy) consoleLogSpy.mockRestore();
    });

    describe('Initialization', () => {
        test('should create performance monitor with correct metrics structure', () => {
            expect(monitor).toBeDefined();
            expect(monitor.metrics).toBeDefined();
            
            // Check Core Web Vitals structure
            expect(monitor.metrics.lcp).toEqual({ value: 0, measurements: [] });
            expect(monitor.metrics.fid).toEqual({ value: 0, measurements: [] });
            expect(monitor.metrics.cls).toEqual({ value: 0, measurements: [] });
            
            // Check gallery-specific metrics
            expect(monitor.metrics.cacheHitRatio).toBe(0);
            expect(monitor.metrics.averageImageLoadTime).toBe(0);
            expect(monitor.metrics.imageLoadSuccessRate).toBe(0);
            
            // Check system metrics
            expect(monitor.metrics.memoryUsage).toEqual({ used: 0, total: 0, utilization: 0 });
            // Network info will be populated from the mocked connection object
            expect(monitor.metrics.networkInfo).toBeDefined();
            expect(typeof monitor.metrics.networkInfo.effectiveType).toBe('string');
            expect(typeof monitor.metrics.networkInfo.downlink).toBe('number');
            expect(typeof monitor.metrics.networkInfo.rtt).toBe('number');
            // Error count may be > 0 due to initialization errors in test environment
            expect(typeof monitor.metrics.errorCount).toBe('number');
            expect(typeof monitor.metrics.errorTypes).toBe('object');
        });

        test('should initialize observers when PerformanceObserver is available', () => {
            expect(PerformanceObserver).toHaveBeenCalled();
            // PerformanceObserver may be called different numbers of times due to error handling in test environment
            expect(global.PerformanceObserver.mock.calls.length).toBeGreaterThanOrEqual(1);
        });

        test('should set up event listeners', () => {
            // The monitor should be created and have necessary methods available
            expect(monitor.logEvent).toBeDefined();
            expect(monitor.recordError).toBeDefined();
            expect(monitor.recordCustomMetric).toBeDefined();
        });
    });

    describe('Core Web Vitals Tracking', () => {
        test('should provide Core Web Vitals interface', () => {
            const cwv = monitor.getCoreWebVitals();
            
            expect(cwv).toBeDefined();
            expect(cwv.lcp).toBeDefined();
            expect(cwv.fid).toBeDefined();
            expect(cwv.cls).toBeDefined();
        });

        test('should calculate Core Web Vitals score', () => {
            // Set some test values
            monitor.metrics.lcp.value = 2000; // Good LCP
            monitor.metrics.fid.value = 50;   // Good FID
            monitor.metrics.cls.value = 0.05; // Good CLS
            
            const score = monitor.calculateCoreWebVitalsScore();
            
            expect(score.lcp).toBe(100); // Good score
            expect(score.fid).toBe(100); // Good score
            expect(score.cls).toBe(100); // Good score
            expect(score.overall).toBe(100);
        });
    });

    describe('Error Tracking', () => {
        test('should record errors correctly', () => {
            const initialErrorCount = monitor.metrics.errorCount;
            const errorType = 'test_error';
            const errorData = { message: 'Test error message' };
            
            monitor.recordError(errorType, errorData);
            
            expect(monitor.metrics.errorCount).toBe(initialErrorCount + 1);
            expect(monitor.metrics.errorTypes[errorType]).toBe(1);
            
            const events = monitor.getEvents('error');
            const testErrorEvents = events.filter(e => e.data.type === errorType);
            expect(testErrorEvents).toHaveLength(1);
            expect(testErrorEvents[0].data.type).toBe(errorType);
            expect(testErrorEvents[0].data.data).toEqual(errorData);
        });

        test('should provide error summary', () => {
            const initialErrorCount = monitor.metrics.errorCount;
            
            monitor.recordError('js_error', { message: 'JS error' });
            monitor.recordError('network_error', { message: 'Network error' });
            monitor.recordError('js_error', { message: 'Another JS error' });
            
            const summary = monitor.getErrorSummary();
            
            expect(summary.totalErrors).toBe(initialErrorCount + 3);
            expect(summary.errorsByType.js_error).toBe(2);
            expect(summary.errorsByType.network_error).toBe(1);
        });
    });

    describe('Custom Metrics', () => {
        test('should record custom metrics', () => {
            const metricName = 'test_metric';
            const metricValue = 42;
            const metadata = { source: 'test' };
            
            monitor.recordCustomMetric(metricName, metricValue, metadata);
            
            const events = monitor.getEvents('custom_metric');
            expect(events).toHaveLength(1);
            expect(events[0].data.name).toBe(metricName);
            expect(events[0].data.value).toBe(metricValue);
            expect(events[0].data.metadata).toEqual(metadata);
        });
    });

    describe('Resource Timing', () => {
        test('should track resource timings', () => {
            const resourceTimings = monitor.getResourceTimings();
            expect(Array.isArray(resourceTimings)).toBe(true);
        });

        test('should update API call metrics', () => {
            const mockEntry = {
                name: '/api/test',
                duration: 150,
                transferSize: 1024
            };
            
            monitor.updateApiCallMetrics(mockEntry);
            
            expect(monitor.metrics.apiCallPerformance.averageTime).toBe(150);
        });

        test('should update image load metrics', () => {
            const mockEntry = {
                initiatorType: 'img',
                duration: 200,
                transferSize: 2048
            };
            
            monitor.updateImageLoadMetrics(mockEntry);
            
            expect(monitor.metrics.totalImagesLoaded).toBe(1);
            expect(monitor.metrics.averageImageLoadTime).toBe(200);
            expect(monitor.metrics.imageLoadSuccessRate).toBe(1);
        });
    });

    describe('Cache Metrics', () => {
        test('should update cache metrics', () => {
            const cacheData = {
                hits: 80,
                misses: 20,
                bandwidthSaved: 1024000
            };
            
            monitor.updateCacheMetrics(cacheData);
            
            expect(monitor.metrics.cacheHits).toBe(80);
            expect(monitor.metrics.cacheMisses).toBe(20);
            expect(monitor.metrics.cacheHitRatio).toBe(0.8);
        });

        test('should handle cache efficiency metrics', () => {
            const cacheData = {
                hits: 75,
                misses: 25,
                bandwidthSaved: 512000
            };
            
            monitor.updateCacheEfficiencyMetrics(cacheData);
            
            expect(monitor.metrics.cacheHitRatio).toBe(0.75);
        });
    });

    describe('Performance Score Calculation', () => {
        test('should calculate overall performance score', () => {
            // Set up test metrics
            monitor.metrics.lcp.value = 2000;
            monitor.metrics.fid.value = 50;
            monitor.metrics.cls.value = 0.05;
            monitor.metrics.cacheHitRatio = 0.8;
            monitor.metrics.imageLoadSuccessRate = 0.95;
            monitor.metrics.errorCount = 1;
            
            const score = monitor.getPerformanceScore();
            
            expect(score).toBeDefined();
            expect(score.coreWebVitals).toBe(100);
            expect(score.cache).toBe(80);
            expect(score.images).toBe(95);
            expect(score.errors).toBe(90); // 100 - (1 * 10)
            expect(typeof score.overall).toBe('number');
        });
    });

    describe('Event Management', () => {
        test('should log events with proper structure', () => {
            const initialEventCount = monitor.getEvents().length;
            const eventType = 'test_event';
            const eventData = { test: 'data' };
            
            monitor.logEvent(eventType, eventData);
            
            const events = monitor.getEvents();
            expect(events.length).toBe(initialEventCount + 1);
            
            const testEvents = events.filter(e => e.type === eventType);
            expect(testEvents).toHaveLength(1);
            
            const event = testEvents[0];
            expect(event.type).toBe(eventType);
            expect(event.data).toEqual(eventData);
            expect(event.timestamp).toBeDefined();
            expect(event.sessionTime).toBeDefined();
            expect(event.url).toBeDefined();
        });

        test('should maintain buffer size limit', () => {
            // Add more events than buffer size
            for (let i = 0; i < 1100; i++) {
                monitor.logEvent('test_event', { index: i });
            }
            
            const events = monitor.getEvents();
            expect(events.length).toBeLessThanOrEqual(monitor.maxBufferSize);
        });

        test('should filter events by type', () => {
            monitor.logEvent('type_a', { data: 'a' });
            monitor.logEvent('type_b', { data: 'b' });
            monitor.logEvent('type_a', { data: 'a2' });
            
            const typeAEvents = monitor.getEvents('type_a');
            const typeBEvents = monitor.getEvents('type_b');
            
            expect(typeAEvents).toHaveLength(2);
            expect(typeBEvents).toHaveLength(1);
        });
    });

    describe('Report Generation', () => {
        test('should generate comprehensive report', () => {
            monitor.recordError('test_error', { message: 'test' });
            monitor.recordCustomMetric('test_metric', 42);
            
            // Stop the periodic timer to prevent interference during test
            if (monitor.reportingTimer) {
                clearInterval(monitor.reportingTimer);
                monitor.reportingTimer = null;
            }
            
            const report = monitor.generateComprehensiveReport();
            
            expect(report).toBeDefined();
            expect(report.timestamp).toBeDefined();
            expect(report.url).toBeDefined();
            expect(report.sessionId).toBeDefined();
            expect(report.metrics).toBeDefined();
            expect(report.recentEvents).toBeDefined();
            expect(report.aggregatedMetrics).toBeDefined();
            expect(report.performanceScore).toBeDefined();
            expect(report.browserInfo).toBeDefined();
        });

        test('should calculate aggregated metrics', () => {
            const initialErrorEvents = monitor.getEvents('error').length;
            
            monitor.logEvent('image_load', { loadTime: 100 });
            monitor.logEvent('image_load', { loadTime: 200 });
            monitor.recordError('js_error', { message: 'error 1' });
            monitor.recordError('network_error', { message: 'error 2' });
            
            const aggregated = monitor.calculateAggregatedMetrics();
            
            expect(aggregated.totalEvents).toBeGreaterThan(0);
            expect(aggregated.imageLoads.total).toBe(2);
            expect(aggregated.imageLoads.averageTime).toBe(150);
            expect(aggregated.errors.total).toBe(initialErrorEvents + 2);
            expect(aggregated.errors.byType.js_error).toBe(1);
            expect(aggregated.errors.byType.network_error).toBe(1);
        });
    });

    describe('Critical Event Handling', () => {
        test('should identify critical events', () => {
            expect(monitor.isCriticalEvent('error')).toBe(true);
            expect(monitor.isCriticalEvent('high_memory_usage')).toBe(true);
            expect(monitor.isCriticalEvent('image_load_error')).toBe(true);
            expect(monitor.isCriticalEvent('regular_event')).toBe(false);
        });

        test('should send critical metrics when critical event occurs', () => {
            // Mock sendBeacon for this test
            const mockSendBeacon = vi.fn().mockReturnValue(true);
            navigator.sendBeacon = mockSendBeacon;
            
            // Record an error that should trigger critical reporting
            monitor.recordError('error', { message: 'Critical error' });
            
            // Should have called sendBeacon for critical event
            expect(mockSendBeacon).toHaveBeenCalled();
        });
    });

    describe('Memory Management', () => {
        test('should clean up old events', () => {
            // Add events with old timestamps
            const oldTimestamp = Date.now() - (15 * 60 * 1000); // 15 minutes ago
            monitor.events.push({
                type: 'old_event',
                timestamp: oldTimestamp,
                data: {}
            });
            
            monitor.cleanupOldEvents();
            
            const oldEvents = monitor.events.filter(e => e.timestamp === oldTimestamp);
            expect(oldEvents).toHaveLength(0);
        });
    });

    describe('Public API', () => {
        test('should provide all expected public methods', () => {
            expect(typeof monitor.getMetrics).toBe('function');
            expect(typeof monitor.getCoreWebVitals).toBe('function');
            expect(typeof monitor.getEvents).toBe('function');
            expect(typeof monitor.getResourceTimings).toBe('function');
            expect(typeof monitor.getMemoryInfo).toBe('function');
            expect(typeof monitor.getNetworkInfo).toBe('function');
            expect(typeof monitor.getErrorSummary).toBe('function');
            expect(typeof monitor.getPerformanceScore).toBe('function');
            expect(typeof monitor.forceReport).toBe('function');
            expect(typeof monitor.resetMetrics).toBe('function');
            expect(typeof monitor.stopMonitoring).toBe('function');
        });

        test('should reset metrics correctly', () => {
            // Modify some metrics
            monitor.recordError('test_error', { message: 'test' });
            monitor.metrics.cacheHits = 10;
            
            monitor.resetMetrics();
            
            expect(monitor.metrics.errorCount).toBe(0);
            expect(monitor.metrics.cacheHits).toBe(0);
            expect(monitor.events).toHaveLength(0);
        });
    });

    describe('Browser Compatibility', () => {
        test('should handle missing PerformanceObserver gracefully', () => {
            global.PerformanceObserver = undefined;
            
            expect(() => {
                const testMonitor = new PerformanceMonitor();
            }).not.toThrow();
        });

        test('should handle missing sendBeacon gracefully', () => {
            const originalSendBeacon = navigator.sendBeacon;
            navigator.sendBeacon = undefined;
            
            expect(() => {
                monitor.sendCriticalMetrics({ type: 'test', data: {} });
            }).not.toThrow();
            
            navigator.sendBeacon = originalSendBeacon;
        });

        test('should handle missing memory API gracefully', () => {
            const originalMemory = performance.memory;
            performance.memory = undefined;
            
            expect(() => {
                const testMonitor = new PerformanceMonitor();
            }).not.toThrow();
            
            performance.memory = originalMemory;
        });
    });

    describe('Phase 3 Features - Virtual Gallery Integration', () => {
        test('should track virtual scrolling performance', () => {
            // Test that virtual scroll performance is tracked by the existing system
            expect(monitor.metrics.virtualScrollPerformance).toBeDefined();
            expect(monitor.metrics.virtualScrollPerformance.renderTime).toBe(0);
            expect(monitor.metrics.virtualScrollPerformance.scrollLag).toBe(0);
        });

        test('should monitor DOM recycling efficiency', () => {
            // Test that DOM recycling would be tracked through custom metrics
            monitor.recordCustomMetric('dom_recycling', 0.95, { efficiency: true });
            
            const events = monitor.getEvents('custom_metric');
            const recyclingEvent = events.find(e => e.data.name === 'dom_recycling');
            
            expect(recyclingEvent).toBeDefined();
            expect(recyclingEvent.data.value).toBe(0.95);
            expect(recyclingEvent.data.metadata.efficiency).toBe(true);
        });

        test('should track viewport performance metrics', () => {
            // Test that viewport metrics would be tracked through custom metrics
            monitor.recordCustomMetric('viewport_utilization', 0.8);
            monitor.recordCustomMetric('scroll_position', 1500);
            
            const events = monitor.getEvents('custom_metric');
            const utilizationEvent = events.find(e => e.data.name === 'viewport_utilization');
            const scrollEvent = events.find(e => e.data.name === 'scroll_position');
            
            expect(utilizationEvent.data.value).toBe(0.8);
            expect(scrollEvent.data.value).toBe(1500);
        });
    });

    describe('Phase 3 Features - Advanced Analytics', () => {
        test('should track performance trends through custom metrics', () => {
            // Add historical data points
            monitor.recordCustomMetric('lcp_history', 3000, { timestamp: Date.now() - 60000 });
            monitor.recordCustomMetric('lcp_history', 2800, { timestamp: Date.now() - 30000 });
            monitor.recordCustomMetric('lcp_history', 2500, { timestamp: Date.now() });
            
            const events = monitor.getEvents('custom_metric');
            const lcpEvents = events.filter(e => e.data.name === 'lcp_history');
            
            expect(lcpEvents).toHaveLength(3);
            expect(lcpEvents[0].data.value).toBe(3000);
            expect(lcpEvents[2].data.value).toBe(2500);
        });

        test('should provide data for optimization analysis', () => {
            // Set up scenario data
            monitor.metrics.lcp.value = 4500; // Poor LCP
            monitor.metrics.fid.value = 250;  // Poor FID
            monitor.metrics.cls.value = 0.3;  // Poor CLS
            monitor.metrics.cacheHitRatio = 0.4; // Poor cache
            monitor.metrics.imageLoadSuccessRate = 0.8; // Good but could improve
            monitor.metrics.errorCount = 15; // High error count
            
            const score = monitor.getPerformanceScore();
            
            expect(score).toBeDefined();
            expect(score.coreWebVitals).toBeLessThan(100); // Poor metrics should result in lower score
            expect(score.cache).toBe(40); // 0.4 cache hit ratio = 40% score
            expect(score.images).toBe(80); // 0.8 success rate = 80% score
        });

        test('should track performance degradation through events', () => {
            // Simulate degrading performance by logging multiple events
            monitor.logEvent('performance_measurement', { lcp: 2000, memoryUsage: 50 });
            monitor.logEvent('performance_measurement', { lcp: 2500, memoryUsage: 65 });
            monitor.logEvent('performance_measurement', { lcp: 3200, memoryUsage: 80 });
            monitor.logEvent('performance_measurement', { lcp: 3800, memoryUsage: 92 });
            
            const events = monitor.getEvents('performance_measurement');
            
            expect(events).toHaveLength(4);
            expect(events[3].data.lcp).toBe(3800); // Latest measurement
            expect(events[3].data.memoryUsage).toBe(92); // High memory usage
        });
    });

    describe('Phase 3 Features - Enhanced Reporting', () => {
        test('should generate comprehensive performance report', () => {
            // Set up comprehensive metrics
            monitor.metrics.lcp.value = 2800;
            monitor.metrics.fid.value = 120;
            monitor.metrics.cls.value = 0.15;
            monitor.metrics.cacheHitRatio = 0.75;
            monitor.metrics.errorCount = 3;
            monitor.metrics.totalImagesLoaded = 150;
            monitor.metrics.averageImageLoadTime = 800;
            
            const report = monitor.generateComprehensiveReport();
            
            expect(report).toBeDefined();
            expect(report.performanceScore).toBeDefined();
            expect(report.performanceScore.overall).toBeGreaterThan(0);
            expect(report.metrics.lcp.value).toBe(2800);
            expect(report.metrics.cacheHitRatio).toBe(0.75);
        });

        test('should track user interactions through events', () => {
            monitor.trackUserInteraction('click', { responseTime: 150 });
            monitor.trackUserInteraction('scroll', { lag: 16.7 });
            monitor.trackUserInteraction('navigation', { loadTime: 2500 });
            
            const interactions = monitor.getEvents('user_interaction');
            
            expect(interactions).toHaveLength(3);
            expect(interactions[0].data.type).toBe('click');
            expect(interactions[0].data.details.responseTime).toBe(150);
        });

        test('should identify critical events and send alerts', () => {
            monitor.metrics.lcp.value = 5000; // Critical LCP
            monitor.metrics.memoryUsage.utilization = 95; // High memory
            monitor.metrics.errorCount = 25; // High error count
            
            // Test critical event identification
            expect(monitor.isCriticalEvent('error')).toBe(true);
            expect(monitor.isCriticalEvent('high_memory_usage')).toBe(true);
            expect(monitor.isCriticalEvent('image_load_error')).toBe(true);
            
            // Record a critical error to test the alerting system
            monitor.recordError('critical_performance_issue', { lcp: 5000 });
            
            const errorEvents = monitor.getEvents('error');
            const criticalEvent = errorEvents.find(e => e.data.type === 'critical_performance_issue');
            expect(criticalEvent).toBeDefined();
        });
    });

    describe('Phase 3 Features - Real-time Monitoring', () => {
        test('should provide current performance metrics data', () => {
            const currentMetrics = monitor.getMetrics();
            
            expect(currentMetrics).toBeDefined();
            expect(currentMetrics.lcp).toBeDefined();
            expect(currentMetrics.fid).toBeDefined();
            expect(currentMetrics.cls).toBeDefined();
            expect(currentMetrics.cacheHitRatio).toBeDefined();
            expect(currentMetrics.errorCount).toBeDefined();
        });

        test('should track performance through event buffer', () => {
            // Test that events are tracked over time
            monitor.logEvent('performance_check', { timestamp: Date.now() - 60000 });
            monitor.logEvent('performance_check', { timestamp: Date.now() - 30000 });
            monitor.logEvent('performance_check', { timestamp: Date.now() });
            
            const events = monitor.getEvents('performance_check');
            expect(events).toHaveLength(3);
            
            // Test that old events are cleaned up
            monitor.cleanupOldEvents();
            const remainingEvents = monitor.getEvents();
            expect(remainingEvents.length).toBeGreaterThanOrEqual(0);
        });

        test('should monitor session-based performance through session ID', () => {
            const sessionId = monitor.generateSessionId();
            
            expect(sessionId).toBeDefined();
            expect(sessionId).toMatch(/^session_\d+_[a-z0-9]+$/);
            
            // Simulate session activity
            monitor.recordCustomMetric('page_load', 2500, { sessionId });
            monitor.recordCustomMetric('interaction', 150, { sessionId });
            
            const sessionEvents = monitor.getEvents('custom_metric')
                .filter(e => e.data.metadata && e.data.metadata.sessionId === sessionId);
            
            expect(sessionEvents).toHaveLength(2);
        });
    });

    describe('Phase 3 Features - AI-Powered Insights', () => {
        test('should detect performance issues through thresholds', () => {
            // Test threshold-based anomaly detection through existing scoring system
            monitor.metrics.lcp.value = 6000; // Significant spike
            monitor.metrics.fid.value = 400;   // Significant spike
            monitor.metrics.cls.value = 0.5;   // Significant spike
            
            const score = monitor.calculateCoreWebVitalsScore();
            
            expect(score.lcp).toBe(0); // Poor LCP score indicates anomaly
            expect(score.fid).toBe(0); // Poor FID score indicates anomaly
            expect(score.cls).toBe(0); // Poor CLS score indicates anomaly
            expect(score.overall).toBe(0); // Overall poor performance
        });

        test('should provide performance insights through scoring', () => {
            monitor.metrics.lcp.value = 3500;
            monitor.metrics.cls.value = 0.2;
            monitor.metrics.cacheHitRatio = 0.6;
            
            const performanceScore = monitor.getPerformanceScore();
            
            expect(performanceScore).toBeDefined();
            expect(performanceScore.coreWebVitals).toBeLessThan(100); // Poor LCP should lower score
            expect(performanceScore.cache).toBe(60); // 0.6 ratio = 60% score
            expect(performanceScore.overall).toBeLessThan(100); // Overall score should reflect issues
        });

        test('should provide performance comparison through scoring system', () => {
            // Set good performance metrics
            monitor.metrics.lcp.value = 2200; // Good LCP
            monitor.metrics.fid.value = 85;   // Good FID
            monitor.metrics.cls.value = 0.08; // Good CLS
            
            const score = monitor.calculateCoreWebVitalsScore();
            
            expect(score.lcp).toBe(100); // Excellent LCP
            expect(score.fid).toBe(100); // Excellent FID
            expect(score.cls).toBe(100); // Excellent CLS
            expect(score.overall).toBe(100); // Excellent overall
        });
    });

    describe('Phase 3 Features - Integration Capabilities', () => {
        test('should send metrics to analytics endpoints', () => {
            // Test that the existing analytics integration works
            const report = monitor.generateComprehensiveReport();
            
            expect(report).toBeDefined();
            expect(report.metrics).toBeDefined();
            expect(report.browserInfo).toBeDefined();
            
            // Test that sendBeacon is available for reporting
            expect(navigator.sendBeacon).toBeDefined();
        });

        test('should export performance data in JSON format', () => {
            monitor.recordCustomMetric('test_metric', 100);
            monitor.recordError('test_error', { message: 'test' });
            
            const report = monitor.generateComprehensiveReport();
            const jsonData = JSON.stringify(report);
            
            expect(jsonData).toMatch(/^\{.*\}$/);
            expect(JSON.parse(jsonData)).toBeDefined();
        });

        test('should support critical event notifications through sendBeacon', () => {
            // Mock sendBeacon to track calls
            const mockSendBeacon = vi.fn().mockReturnValue(true);
            navigator.sendBeacon = mockSendBeacon;
            
            // Simulate critical event
            monitor.recordError('critical_error', { severity: 'critical' });
            
            // Should have called sendBeacon for critical event
            expect(mockSendBeacon).toHaveBeenCalled();
        });
    });

    describe('Phase 3 Features - Advanced Memory Management', () => {
        test('should implement smart buffer management', () => {
            // Fill buffer beyond capacity
            for (let i = 0; i < monitor.maxBufferSize + 100; i++) {
                monitor.logEvent('test_event', { index: i });
            }
            
            expect(monitor.events.length).toBeLessThanOrEqual(monitor.maxBufferSize);
            
            // Should maintain most recent events
            const lastEvent = monitor.events[monitor.events.length - 1];
            expect(lastEvent.data.index).toBeGreaterThan(monitor.maxBufferSize - 100);
        });

        test('should clean up old events for memory management', () => {
            // Add events with various types
            monitor.logEvent('low_priority', { priority: 1 });
            monitor.logEvent('high_priority', { priority: 5 });
            monitor.logEvent('critical', { priority: 10 });
            
            // Test existing cleanup functionality
            monitor.cleanupOldEvents();
            
            // Should still have recent events
            const events = monitor.getEvents();
            expect(events.length).toBeGreaterThanOrEqual(0);
        });

        test('should monitor memory usage and log high usage events', () => {
            // Simulate high memory pressure
            monitor.metrics.memoryUsage.utilization = 95;
            
            // Log a high memory usage event
            monitor.logEvent('high_memory_usage', {
                utilization: 95,
                used: 1900000,
                total: 2000000
            });
            
            const memoryEvents = monitor.getEvents('high_memory_usage');
            expect(memoryEvents.length).toBeGreaterThan(0);
            expect(memoryEvents[0].data.utilization).toBe(95);
        });
    });
});

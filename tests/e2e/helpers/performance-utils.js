/**
 * Shared Performance Utilities for E2E Testing
 * Common utilities extracted from performance-gallery.js for reuse across test files
 * 
 * Features:
 * - Circular buffers for memory-efficient metrics collection
 * - Optimized timeout management with context
 * - Event handler management for proper cleanup
 * 
 * PRD Requirements: REQ-NFR-001 (Performance), REQ-NFR-002 (Memory Management)
 */

/**
 * Circular buffer for memory-efficient metrics collection
 * Prevents unbounded array growth during long-running tests
 */
export class CircularBuffer {
    constructor(maxSize = 1000) {
        this.maxSize = maxSize;
        this.buffer = [];
        this.index = 0;
        this.size = 0;
    }

    push(item) {
        if (this.size < this.maxSize) {
            this.buffer.push(item);
            this.size++;
        } else {
            this.buffer[this.index] = item;
            this.index = (this.index + 1) % this.maxSize;
        }
    }

    getAll() {
        if (this.size < this.maxSize) {
            return [...this.buffer];
        }
        return [...this.buffer.slice(this.index), ...this.buffer.slice(0, this.index)];
    }

    clear() {
        this.buffer = [];
        this.index = 0;
        this.size = 0;
    }

    length() {
        return this.size;
    }

    slice(start, end) {
        return this.getAll().slice(start, end);
    }
}

/**
 * Optimized timeout handler with context and error recovery
 * Provides consistent timeout values across different operations
 */
export class TimeoutManager {
    constructor(customTimeouts = {}) {
        this.timeouts = {
            // Image loading timeouts with clear rationale
            imageLoad: 3000, // 3s - allows for slow network conditions
            cacheRetrieval: 200, // 200ms - cached resources should be fast
            initialGalleryLoad: 5000, // 5s - initial DOM and critical images
            networkOperation: 10000, // 10s - API calls and data fetching
            cleanup: 1000, // 1s - resource cleanup operations
            
            // Memory and performance monitoring
            memorySnapshot: 500, // 500ms - memory measurement delay
            performanceCollection: 100, // 100ms - performance metric collection
            
            // User interaction simulation
            scrollDelay: 150, // 150ms - realistic scroll timing
            navigationDelay: 300, // 300ms - page navigation delay
            
            // Form interactions
            formFill: 100, // 100ms - delay between form field fills
            formSubmit: 2000, // 2s - form submission processing
            
            // Mobile interactions
            touchDelay: 100, // 100ms - touch interaction delay
            swipeDelay: 200, // 200ms - swipe gesture delay
            
            // Database operations
            dbQuery: 5000, // 5s - database query timeout
            dbCleanup: 3000, // 3s - database cleanup operations
            
            // Override with custom values
            ...customTimeouts
        };
    }

    getTimeout(operation, context = '') {
        const timeout = this.timeouts[operation];
        if (!timeout) {
            console.warn(`[TimeoutManager] Unknown timeout operation: ${operation}. Using default 5000ms`);
            return 5000;
        }
        
        if (context) {
            console.log(`[TimeoutManager] ${operation} timeout: ${timeout}ms (${context})`);
        }
        
        return timeout;
    }

    withTimeout(operation, promise, context = '') {
        const timeout = this.getTimeout(operation, context);
        return Promise.race([
            promise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`${operation} timed out after ${timeout}ms${context ? ` (${context})` : ''}`)), timeout)
            )
        ]);
    }

    /**
     * Create a delay promise with operation-specific timeout
     */
    delay(operation, context = '') {
        const timeout = this.getTimeout(operation, context);
        return new Promise(resolve => setTimeout(resolve, timeout));
    }
}

/**
 * Event handler manager for proper cleanup
 * Prevents memory leaks from unmanaged event listeners
 */
export class EventHandlerManager {
    constructor() {
        this.handlers = new Map();
    }

    addHandler(target, eventType, handler, options = {}) {
        const key = `${target.constructor.name}-${eventType}`;
        if (!this.handlers.has(key)) {
            this.handlers.set(key, []);
        }
        
        if (target.addEventListener) {
            target.addEventListener(eventType, handler, options);
        } else if (target.on) {
            target.on(eventType, handler);
        }
        
        this.handlers.get(key).push({ target, eventType, handler });
    }

    removeAllHandlers() {
        for (const [key, handlerList] of this.handlers) {
            for (const { target, eventType, handler } of handlerList) {
                try {
                    if (target.removeEventListener) {
                        target.removeEventListener(eventType, handler);
                    } else if (target.removeAllListeners) {
                        target.removeAllListeners(eventType);
                    } else if (target.off) {
                        target.off(eventType, handler);
                    }
                } catch (error) {
                    console.warn(`[EventManager] Failed to remove ${key} handler:`, error);
                }
            }
        }
        this.handlers.clear();
        console.log('[EventManager] All event handlers cleaned up');
    }

    getHandlerCount() {
        let count = 0;
        for (const handlerList of this.handlers.values()) {
            count += handlerList.length;
        }
        return count;
    }
}

/**
 * Memory monitoring utilities
 */
export class MemoryMonitor {
    constructor(timeoutManager = new TimeoutManager()) {
        this.timeoutManager = timeoutManager;
        this.memoryBuffer = new CircularBuffer(500); // Smaller buffer for memory tracking
    }

    async captureSnapshot(page) {
        return await page.evaluate(() => {
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

    async startMonitoring(page) {
        const interval = this.timeoutManager.getTimeout('memorySnapshot');
        
        const monitor = async () => {
            const snapshot = await this.captureSnapshot(page);
            if (snapshot) {
                this.memoryBuffer.push(snapshot);
            }
        };

        const intervalId = setInterval(monitor, interval);
        
        return {
            stop: () => {
                if (intervalId) {
                    clearInterval(intervalId);
                }
            },
            getMetrics: () => this.memoryBuffer.getAll()
        };
    }

    analyzeMemoryLeaks() {
        const memoryData = this.memoryBuffer.getAll();
        if (memoryData.length < 3) {
            return [];
        }
        
        const leaks = [];
        const samples = memoryData.slice(-10); // Look at last 10 samples
        
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

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

/**
 * Performance metrics aggregation utilities
 */
export class MetricsAggregator {
    static summarizeArrayMetrics(buffer, metricKey) {
        const data = buffer.getAll();
        if (data.length === 0) return null;

        const values = data.map(item => item[metricKey]).filter(val => val !== undefined);
        if (values.length === 0) return null;

        return {
            count: values.length,
            min: Math.min(...values),
            max: Math.max(...values),
            avg: values.reduce((sum, val) => sum + val, 0) / values.length,
            p50: this.percentile(values, 0.5),
            p90: this.percentile(values, 0.9),
            p95: this.percentile(values, 0.95)
        };
    }

    static percentile(values, p) {
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil(sorted.length * p) - 1;
        return sorted[index];
    }

    static calculateSuccessRate(buffer, successKey = 'loaded') {
        const data = buffer.getAll();
        if (data.length === 0) return 0;

        const successCount = data.filter(item => item[successKey]).length;
        return successCount / data.length;
    }
}

/**
 * Network monitoring utilities
 */
export class NetworkMonitor {
    constructor() {
        this.requestBuffer = new CircularBuffer(1000);
        this.eventManager = new EventHandlerManager();
    }

    startMonitoring(page, urlPatterns = []) {
        const shouldMonitor = (url) => {
            if (urlPatterns.length === 0) return true;
            return urlPatterns.some(pattern => url.includes(pattern));
        };

        const requestHandler = (request) => {
            if (shouldMonitor(request.url())) {
                this.requestBuffer.push({
                    url: request.url(),
                    method: request.method(),
                    timestamp: Date.now(),
                    type: 'request'
                });
            }
        };

        const responseHandler = (response) => {
            if (shouldMonitor(response.url())) {
                this.requestBuffer.push({
                    url: response.url(),
                    status: response.status(),
                    timestamp: Date.now(),
                    type: 'response',
                    fromCache: response.fromServiceWorker()
                });
            }
        };

        this.eventManager.addHandler(page, 'request', requestHandler);
        this.eventManager.addHandler(page, 'response', responseHandler);
    }

    stopMonitoring() {
        this.eventManager.removeAllHandlers();
    }

    getMetrics() {
        return this.requestBuffer.getAll();
    }

    calculateCacheHitRatio() {
        const responses = this.requestBuffer.getAll().filter(item => item.type === 'response');
        if (responses.length === 0) return 0;

        const cacheHits = responses.filter(response => response.fromCache).length;
        return cacheHits / responses.length;
    }
}

// Export common timeout configurations for different test types
export const TestTimeouts = {
    FAST: {
        imageLoad: 1500,
        networkOperation: 5000,
        initialGalleryLoad: 3000
    },
    STANDARD: {
        imageLoad: 3000,
        networkOperation: 10000,
        initialGalleryLoad: 5000
    },
    SLOW: {
        imageLoad: 5000,
        networkOperation: 15000,
        initialGalleryLoad: 8000
    }
};
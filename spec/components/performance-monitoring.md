# Performance Monitoring Components

## Overview

Advanced performance monitoring components provide real-time insights into gallery performance, user interactions, and system metrics. These components enable data-driven optimization and proactive performance management.

## Components Architecture

### 1. Performance Monitor Dashboard

Main component for displaying performance metrics and system health.

#### Structure

```html
<div class="performance-dashboard" data-performance-dashboard>
  <header class="dashboard-header">
    <h2 class="dashboard-title">Performance Monitor</h2>
    <div class="dashboard-controls">
      <button class="toggle-dashboard" aria-label="Toggle dashboard">
        <svg class="icon-dashboard"><!-- Dashboard icon --></svg>
      </button>
      <button class="export-metrics" aria-label="Export metrics">
        <svg class="icon-download"><!-- Download icon --></svg>
      </button>
    </div>
  </header>

  <div class="dashboard-content">
    <div class="metrics-grid">
      <!-- Real-time Metrics -->
      <div class="metric-card fps-card">
        <div class="metric-header">
          <h3 class="metric-title">Frame Rate</h3>
          <span class="metric-status good" aria-label="Status: Good"></span>
        </div>
        <div class="metric-value">
          <span class="value-number" data-metric="fps">60</span>
          <span class="value-unit">fps</span>
        </div>
        <div class="metric-chart">
          <canvas class="fps-chart" width="120" height="40"></canvas>
        </div>
      </div>

      <!-- Memory Usage -->
      <div class="metric-card memory-card">
        <div class="metric-header">
          <h3 class="metric-title">Memory Usage</h3>
          <span
            class="metric-status warning"
            aria-label="Status: Warning"
          ></span>
        </div>
        <div class="metric-value">
          <span class="value-number" data-metric="memory">42.3</span>
          <span class="value-unit">MB</span>
        </div>
        <div class="metric-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: 65%"></div>
          </div>
          <span class="progress-label">65% of limit</span>
        </div>
      </div>

      <!-- Network Performance -->
      <div class="metric-card network-card">
        <div class="metric-header">
          <h3 class="metric-title">Network</h3>
          <span class="metric-status good" aria-label="Status: Good"></span>
        </div>
        <div class="metric-stats">
          <div class="stat-item">
            <span class="stat-label">Requests</span>
            <span class="stat-value" data-metric="requests">143</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Cache Hit</span>
            <span class="stat-value" data-metric="cache-hit">87%</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Avg Load</span>
            <span class="stat-value" data-metric="avg-load">1.2s</span>
          </div>
        </div>
      </div>

      <!-- User Interaction -->
      <div class="metric-card interaction-card">
        <div class="metric-header">
          <h3 class="metric-title">User Interactions</h3>
          <span class="metric-status good" aria-label="Status: Good"></span>
        </div>
        <div class="interaction-heatmap">
          <canvas class="heatmap-canvas" width="200" height="100"></canvas>
        </div>
        <div class="interaction-stats">
          <div class="stat-item">
            <span class="stat-label">Clicks</span>
            <span class="stat-value" data-metric="clicks">28</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Scrolls</span>
            <span class="stat-value" data-metric="scrolls">156</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Performance Logs -->
    <div class="performance-logs">
      <header class="logs-header">
        <h3 class="logs-title">Performance Log</h3>
        <div class="logs-controls">
          <select class="log-filter" aria-label="Filter logs">
            <option value="all">All Events</option>
            <option value="warnings">Warnings</option>
            <option value="errors">Errors</option>
            <option value="performance">Performance</option>
          </select>
          <button class="clear-logs" aria-label="Clear logs">Clear</button>
        </div>
      </header>
      <div class="logs-content">
        <div class="log-entry warning" data-timestamp="1642534800000">
          <span class="log-time">14:20:00</span>
          <span class="log-level warning">WARN</span>
          <span class="log-message"
            >Frame rate dropped below 30fps for 2 seconds</span
          >
        </div>
        <div class="log-entry info" data-timestamp="1642534740000">
          <span class="log-time">14:19:00</span>
          <span class="log-level info">INFO</span>
          <span class="log-message"
            >Virtual scrolling: recycled 15 DOM elements</span
          >
        </div>
      </div>
    </div>
  </div>
</div>
```

#### CSS Specifications

```css
.performance-dashboard {
  /* Layout */
  position: fixed;
  top: 20px;
  right: 20px;
  width: 400px;
  max-height: 80vh;

  /* Styling */
  background: var(--color-white);
  border: 1px solid var(--color-gray-200);
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);

  /* State management */
  transform: translateX(100%);
  opacity: 0;
  transition: all var(--transition-base) var(--ease-out-expo);

  /* Performance */
  contain: layout style paint;
  will-change: transform, opacity;

  /* Active state */
  &.is-open {
    transform: translateX(0);
    opacity: 1;
  }

  /* Mobile responsiveness */
  @media (max-width: 768px) {
    position: fixed;
    top: 0;
    right: 0;
    left: 0;
    bottom: 0;
    width: auto;
    max-height: none;
    border-radius: 0;

    &.is-open {
      transform: translateY(0);
    }

    &:not(.is-open) {
      transform: translateY(100%);
    }
  }
}

.dashboard-header {
  /* Header layout */
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-lg);
  border-bottom: 1px solid var(--color-gray-200);

  /* Sticky header */
  position: sticky;
  top: 0;
  background: var(--color-white);
  z-index: 10;
}

.dashboard-title {
  /* Title styling */
  font-family: var(--font-display);
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--color-black);
  margin: 0;
}

.dashboard-controls {
  /* Controls layout */
  display: flex;
  gap: var(--space-sm);
}

.toggle-dashboard,
.export-metrics {
  /* Button styling */
  padding: var(--space-sm);
  background: var(--color-gray-100);
  border: 1px solid var(--color-gray-200);
  border-radius: 6px;
  color: var(--color-gray-600);
  cursor: pointer;

  /* Transitions */
  transition: all var(--transition-base);

  &:hover {
    background: var(--color-gray-200);
    color: var(--color-black);
  }
}

.dashboard-content {
  /* Content area */
  padding: var(--space-lg);
  overflow-y: auto;
  max-height: calc(80vh - 80px);
}

.metrics-grid {
  /* Grid layout */
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-md);
  margin-bottom: var(--space-xl);
}

.metric-card {
  /* Card styling */
  padding: var(--space-md);
  background: var(--color-gray-50);
  border: 1px solid var(--color-gray-200);
  border-radius: 8px;

  /* Grid layout for mobile */
  @media (max-width: 768px) {
    grid-column: 1 / -1;
  }
}

.metric-header {
  /* Header layout */
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-sm);
}

.metric-title {
  /* Title styling */
  font-family: var(--font-code);
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-gray-700);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.metric-status {
  /* Status indicator */
  width: 8px;
  height: 8px;
  border-radius: 50%;

  &.good {
    background: #10b981; /* Green */
  }

  &.warning {
    background: #f59e0b; /* Amber */
  }

  &.error {
    background: #ef4444; /* Red */
  }
}

.metric-value {
  /* Value display */
  display: flex;
  align-items: baseline;
  gap: var(--space-xs);
  margin-bottom: var(--space-sm);
}

.value-number {
  /* Number styling */
  font-family: var(--font-code);
  font-size: var(--font-size-xl);
  font-weight: 700;
  color: var(--color-black);
}

.value-unit {
  /* Unit styling */
  font-family: var(--font-code);
  font-size: var(--font-size-sm);
  color: var(--color-gray-600);
}

.metric-chart {
  /* Chart container */
  height: 40px;
  margin-bottom: var(--space-sm);
}

.fps-chart {
  /* Chart styling */
  width: 100%;
  height: 100%;
  border-radius: 4px;
}

.metric-progress {
  /* Progress container */
  margin-bottom: var(--space-sm);
}

.progress-bar {
  /* Progress bar */
  width: 100%;
  height: 6px;
  background: var(--color-gray-200);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: var(--space-xs);
}

.progress-fill {
  /* Progress fill */
  height: 100%;
  background: linear-gradient(90deg, #10b981, #059669);
  transition: width var(--transition-base);
}

.progress-label {
  /* Progress label */
  font-family: var(--font-code);
  font-size: var(--font-size-xs);
  color: var(--color-gray-600);
}

.metric-stats {
  /* Stats grid */
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-sm);
}

.stat-item {
  /* Stat item */
  text-align: center;
}

.stat-label {
  /* Stat label */
  display: block;
  font-family: var(--font-code);
  font-size: var(--font-size-xs);
  color: var(--color-gray-600);
  margin-bottom: var(--space-xs);
  text-transform: uppercase;
}

.stat-value {
  /* Stat value */
  display: block;
  font-family: var(--font-code);
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-black);
}

.interaction-heatmap {
  /* Heatmap container */
  height: 100px;
  margin-bottom: var(--space-sm);
  border-radius: 4px;
  overflow: hidden;
}

.heatmap-canvas {
  /* Heatmap canvas */
  width: 100%;
  height: 100%;
}

.interaction-stats {
  /* Interaction stats */
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-sm);
}
```

### 2. Real-time Metrics Collector

Component that collects and processes performance metrics.

#### JavaScript Interface

```javascript
class PerformanceMetricsCollector {
  constructor(options = {}) {
    this.options = {
      sampleRate: 60, // Hz
      bufferSize: 300, // samples
      thresholds: {
        fps: { warning: 30, error: 15 },
        memory: { warning: 50, error: 100 }, // MB
        loadTime: { warning: 3000, error: 5000 }, // ms
      },
      ...options,
    };

    this.metrics = {
      fps: new MetricBuffer(this.options.bufferSize),
      memory: new MetricBuffer(this.options.bufferSize),
      network: new NetworkMetrics(),
      interactions: new InteractionTracker(),
      customTimings: new Map(),
    };

    this.observers = [];
    this.isCollecting = false;
  }

  // Core collection methods
  startCollection() {
    if (this.isCollecting) return;

    this.isCollecting = true;
    this.setupFrameRateMonitoring();
    this.setupMemoryMonitoring();
    this.setupNetworkMonitoring();
    this.setupInteractionTracking();
    this.setupCustomMetrics();
  }

  stopCollection() {
    this.isCollecting = false;
    this.observers.forEach((observer) => observer.disconnect());
    this.observers = [];
  }

  // Frame rate monitoring
  setupFrameRateMonitoring() {
    let lastTime = performance.now();
    let frameCount = 0;

    const measureFPS = (currentTime) => {
      frameCount++;

      if (currentTime - lastTime >= 1000) {
        const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        this.metrics.fps.add(fps, currentTime);

        // Check thresholds
        this.checkThreshold("fps", fps);

        frameCount = 0;
        lastTime = currentTime;
      }

      if (this.isCollecting) {
        requestAnimationFrame(measureFPS);
      }
    };

    requestAnimationFrame(measureFPS);
  }

  // Memory monitoring
  setupMemoryMonitoring() {
    const measureMemory = () => {
      if (performance.memory) {
        const memoryMB = performance.memory.usedJSHeapSize / (1024 * 1024);
        this.metrics.memory.add(memoryMB, performance.now());
        this.checkThreshold("memory", memoryMB);
      }
    };

    // Measure every 5 seconds
    const memoryInterval = setInterval(measureMemory, 5000);

    // Cleanup
    this.observers.push({
      disconnect: () => clearInterval(memoryInterval),
    });
  }

  // Network monitoring
  setupNetworkMonitoring() {
    // Monitor fetch requests
    this.interceptFetch();

    // Monitor resource loading
    if ("PerformanceObserver" in window) {
      const resourceObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          this.metrics.network.addResource(entry);
        });
      });

      resourceObserver.observe({ entryTypes: ["resource"] });
      this.observers.push(resourceObserver);
    }
  }

  // Intercept fetch requests for network monitoring
  interceptFetch() {
    const originalFetch = window.fetch;

    window.fetch = (...args) => {
      const startTime = performance.now();
      const [resource, options] = args;

      return originalFetch(...args)
        .then((response) => {
          const endTime = performance.now();
          const duration = endTime - startTime;

          // Record network metrics
          this.metrics.network.requests.push({
            url: typeof resource === "string" ? resource : resource.url,
            method: options?.method || "GET",
            status: response.status,
            duration: duration,
            timestamp: startTime,
          });

          return response;
        })
        .catch((error) => {
          const endTime = performance.now();
          const duration = endTime - startTime;

          // Record failed network metrics
          this.metrics.network.requests.push({
            url: typeof resource === "string" ? resource : resource.url,
            method: options?.method || "GET",
            status: 0,
            duration: duration,
            timestamp: startTime,
            error: error.message,
          });

          throw error;
        });
    };
  }

  // Custom timing metrics
  markTiming(name) {
    const mark = `${name}-start`;
    performance.mark(mark);
    return mark;
  }

  measureTiming(name, startMark) {
    const measureName = `${name}-duration`;
    performance.measure(measureName, startMark);

    const entries = performance.getEntriesByName(measureName);
    if (entries.length > 0) {
      const duration = entries[entries.length - 1].duration;
      this.metrics.customTimings.set(name, duration);

      // Clean up marks and measures
      performance.clearMarks(startMark);
      performance.clearMeasures(measureName);

      return duration;
    }
  }

  // Threshold checking
  checkThreshold(metric, value) {
    const thresholds = this.options.thresholds[metric];
    if (!thresholds) return;

    let status = "good";
    if (value >= thresholds.error) {
      status = "error";
    } else if (value >= thresholds.warning) {
      status = "warning";
    }

    // Emit status change event
    this.emit("threshold-change", { metric, value, status });
  }

  // Data export
  exportMetrics() {
    return {
      timestamp: Date.now(),
      fps: this.metrics.fps.getStats(),
      memory: this.metrics.memory.getStats(),
      network: this.metrics.network.getStats(),
      interactions: this.metrics.interactions.getStats(),
      customTimings: Object.fromEntries(this.metrics.customTimings),
    };
  }
}

// Metric buffer for time-series data
class MetricBuffer {
  constructor(maxSize = 300) {
    this.maxSize = maxSize;
    this.data = [];
  }

  add(value, timestamp = Date.now()) {
    this.data.push({ value, timestamp });

    // Keep buffer size manageable
    if (this.data.length > this.maxSize) {
      this.data.shift();
    }
  }

  getStats() {
    if (this.data.length === 0) return null;

    const values = this.data.map((d) => d.value);
    return {
      current: values[values.length - 1],
      average: values.reduce((a, b) => a + b) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length,
      history: this.data.slice(-100), // Last 100 samples
    };
  }
}

// Network metrics tracking
class NetworkMetrics {
  constructor() {
    this.requests = [];
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  addRequest(url, duration, cached = false) {
    this.requests.push({
      url,
      duration,
      cached,
      timestamp: Date.now(),
    });

    if (cached) {
      this.cacheHits++;
    } else {
      this.cacheMisses++;
    }
  }

  addResource(entry) {
    const cached = entry.responseStart === 0;
    this.addRequest(entry.name, entry.duration, cached);
  }

  getStats() {
    const totalRequests = this.requests.length;
    const cacheHitRate =
      totalRequests > 0
        ? ((this.cacheHits / totalRequests) * 100).toFixed(1)
        : 0;

    const durations = this.requests.map((r) => r.duration);
    const avgDuration =
      durations.length > 0
        ? (durations.reduce((a, b) => a + b) / durations.length).toFixed(1)
        : 0;

    return {
      totalRequests,
      cacheHitRate: `${cacheHitRate}%`,
      avgLoadTime: `${avgDuration}ms`,
      recentRequests: this.requests.slice(-10),
    };
  }
}

// Interaction tracking
class InteractionTracker {
  constructor() {
    this.interactions = {
      clicks: 0,
      scrolls: 0,
      keystrokes: 0,
      touches: 0,
    };

    this.heatmapData = new Map();
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Click tracking
    document.addEventListener("click", (e) => {
      this.interactions.clicks++;
      this.recordHeatmapPoint(e.clientX, e.clientY, "click");
    });

    // Scroll tracking
    let scrollTimer;
    document.addEventListener("scroll", () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        this.interactions.scrolls++;
      }, 100);
    });

    // Touch tracking
    document.addEventListener("touchstart", (e) => {
      this.interactions.touches++;
      const touch = e.touches[0];
      this.recordHeatmapPoint(touch.clientX, touch.clientY, "touch");
    });

    // Keyboard tracking
    document.addEventListener("keydown", () => {
      this.interactions.keystrokes++;
    });
  }

  recordHeatmapPoint(x, y, type) {
    const key = `${Math.floor(x / 20)},${Math.floor(y / 20)}`;
    const current = this.heatmapData.get(key) || { count: 0, types: {} };

    current.count++;
    current.types[type] = (current.types[type] || 0) + 1;

    this.heatmapData.set(key, current);
  }

  getStats() {
    return {
      ...this.interactions,
      heatmapData: Array.from(this.heatmapData.entries()),
    };
  }
}
```

### 3. Performance Alert System

Component for managing performance alerts and notifications.

#### Structure

```html
<div class="performance-alerts" data-performance-alerts>
  <div class="alert-container">
    <div class="alert error" data-alert-id="fps-critical">
      <div class="alert-icon">
        <svg class="icon-warning"><!-- Warning icon --></svg>
      </div>
      <div class="alert-content">
        <h4 class="alert-title">Critical Performance Issue</h4>
        <p class="alert-message">
          Frame rate has dropped below 15fps. Consider reducing visual
          complexity.
        </p>
        <div class="alert-actions">
          <button class="alert-action primary">Optimize</button>
          <button class="alert-action secondary">Dismiss</button>
        </div>
      </div>
      <button class="alert-close" aria-label="Close alert">
        <svg class="icon-close"><!-- Close icon --></svg>
      </button>
    </div>
  </div>
</div>
```

#### CSS Specifications

```css
.performance-alerts {
  /* Positioning */
  position: fixed;
  top: 20px;
  left: 20px;
  z-index: 1000;

  /* Layout */
  max-width: 400px;
  pointer-events: none;
}

.alert-container {
  /* Container styling */
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.alert {
  /* Alert styling */
  display: flex;
  align-items: flex-start;
  gap: var(--space-md);
  padding: var(--space-md);
  background: var(--color-white);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);

  /* Animation */
  transform: translateX(-100%);
  opacity: 0;
  animation: slideInAlert 0.3s var(--ease-out-expo) forwards;

  /* Pointer events */
  pointer-events: auto;

  /* Status styling */
  &.error {
    border-left: 4px solid #ef4444;
  }

  &.warning {
    border-left: 4px solid #f59e0b;
  }

  &.info {
    border-left: 4px solid #3b82f6;
  }

  &.success {
    border-left: 4px solid #10b981;
  }
}

@keyframes slideInAlert {
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.alert-icon {
  /* Icon styling */
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.alert-content {
  /* Content area */
  flex: 1;
  min-width: 0;
}

.alert-title {
  /* Title styling */
  font-family: var(--font-display);
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-black);
  margin: 0 0 var(--space-xs) 0;
}

.alert-message {
  /* Message styling */
  font-size: var(--font-size-sm);
  color: var(--color-gray-700);
  margin: 0 0 var(--space-md) 0;
  line-height: 1.4;
}

.alert-actions {
  /* Actions layout */
  display: flex;
  gap: var(--space-sm);
}

.alert-action {
  /* Action button */
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--color-gray-300);
  border-radius: 4px;
  font-size: var(--font-size-xs);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-base);

  &.primary {
    background: var(--color-red);
    border-color: var(--color-red);
    color: var(--color-white);

    &:hover {
      background: #b91c1c;
      border-color: #b91c1c;
    }
  }

  &.secondary {
    background: var(--color-white);
    color: var(--color-gray-700);

    &:hover {
      background: var(--color-gray-100);
    }
  }
}

.alert-close {
  /* Close button */
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  color: var(--color-gray-500);
  cursor: pointer;
  border-radius: 4px;
  transition: all var(--transition-base);

  &:hover {
    background: var(--color-gray-100);
    color: var(--color-gray-700);
  }
}
```

## Implementation Guidelines

### Integration with Virtual Gallery

```javascript
// Initialize performance monitoring for gallery
const galleryPerformanceMonitor = new PerformanceMetricsCollector({
  thresholds: {
    fps: { warning: 30, error: 20 },
    memory: { warning: 100, error: 200 },
    scrollLatency: { warning: 16, error: 32 },
  },
});

// Monitor virtual scrolling performance
class VirtualGalleryPerformanceAdapter {
  constructor(virtualGallery, performanceMonitor) {
    this.gallery = virtualGallery;
    this.monitor = performanceMonitor;
    this.setupGalleryMetrics();
  }

  setupGalleryMetrics() {
    // Monitor scroll performance
    this.gallery.on("scroll", (scrollData) => {
      const scrollMark = this.monitor.markTiming("gallery-scroll");

      // Process scroll after next frame
      requestAnimationFrame(() => {
        const duration = this.monitor.measureTiming(
          "gallery-scroll",
          scrollMark,
        );

        if (duration > 16) {
          // > 1 frame at 60fps
          this.monitor.emit("performance-warning", {
            type: "scroll-lag",
            duration,
            scrollData,
          });
        }
      });
    });

    // Monitor DOM recycling
    this.gallery.on("recycle", (recycleData) => {
      this.monitor.metrics.customTimings.set(
        "dom-recycle-count",
        recycleData.recycledCount,
      );
      this.monitor.metrics.customTimings.set(
        "dom-active-elements",
        recycleData.activeElements,
      );
    });

    // Monitor image loading
    this.gallery.on("image-load-start", (imageData) => {
      const loadMark = this.monitor.markTiming(`image-load-${imageData.id}`);
      imageData.loadMark = loadMark;
    });

    this.gallery.on("image-load-complete", (imageData) => {
      if (imageData.loadMark) {
        const duration = this.monitor.measureTiming(
          `image-load-${imageData.id}`,
          imageData.loadMark,
        );

        // Track slow loading images
        if (duration > 3000) {
          this.monitor.emit("performance-warning", {
            type: "slow-image-load",
            duration,
            imageUrl: imageData.url,
          });
        }
      }
    });
  }
}
```

### Performance Optimization Recommendations

```javascript
class PerformanceOptimizer {
  constructor(metricsCollector, alertSystem) {
    this.metrics = metricsCollector;
    this.alerts = alertSystem;
    this.optimizations = new Map();

    this.setupOptimizationRules();
  }

  setupOptimizationRules() {
    // FPS optimization
    this.metrics.on("threshold-change", (event) => {
      if (event.metric === "fps" && event.status === "warning") {
        this.suggestOptimization("reduce-animations", {
          title: "Reduce Animations",
          description:
            "Temporarily disable non-essential animations to improve frame rate",
          action: () => this.reduceAnimations(),
          priority: "high",
        });
      }
    });

    // Memory optimization
    this.metrics.on("threshold-change", (event) => {
      if (event.metric === "memory" && event.status === "warning") {
        this.suggestOptimization("clear-cache", {
          title: "Clear Image Cache",
          description: "Clear unused images from memory to reduce memory usage",
          action: () => this.clearImageCache(),
          priority: "medium",
        });
      }
    });
  }

  suggestOptimization(id, optimization) {
    this.optimizations.set(id, optimization);

    // Show alert
    this.alerts.show({
      type: "warning",
      title: optimization.title,
      message: optimization.description,
      actions: [
        {
          label: "Apply",
          action: optimization.action,
          primary: true,
        },
        {
          label: "Dismiss",
          action: () => this.dismissOptimization(id),
        },
      ],
    });
  }

  applyOptimization(id) {
    const optimization = this.optimizations.get(id);
    if (optimization && optimization.action) {
      optimization.action();
      this.optimizations.delete(id);
    }
  }

  // Example optimization methods
  reduceAnimations() {
    document.body.classList.add("reduce-motion");

    // Re-enable after performance improves
    setTimeout(() => {
      const currentFPS = this.metrics.metrics.fps.getStats()?.current;
      if (currentFPS && currentFPS > 40) {
        document.body.classList.remove("reduce-motion");
      }
    }, 10000);
  }

  clearImageCache() {
    // Clear cached images (implementation depends on caching strategy)
    if ("caches" in window) {
      caches.delete("image-cache-v1");
    }

    // Clear in-memory image cache
    window.galleryImageCache?.clear();
  }
}
```

## Accessibility and User Experience

### Screen Reader Announcements

```javascript
// Announce performance issues to screen readers
class PerformanceAccessibilityManager {
  constructor(performanceMonitor) {
    this.monitor = performanceMonitor;
    this.setupAccessibilityFeatures();
  }

  setupAccessibilityFeatures() {
    this.monitor.on("threshold-change", (event) => {
      if (event.status === "error") {
        this.announceToScreenReader(
          `Performance issue detected: ${event.metric} has reached critical levels. ` +
            `Some features may be temporarily disabled to improve performance.`,
        );
      }
    });
  }

  announceToScreenReader(message) {
    const announcement = document.createElement("div");
    announcement.setAttribute("aria-live", "assertive");
    announcement.setAttribute("aria-atomic", "true");
    announcement.className = "sr-only";
    announcement.textContent = message;

    document.body.appendChild(announcement);
    setTimeout(() => document.body.removeChild(announcement), 1000);
  }
}
```

### Reduced Motion Support

```css
@media (prefers-reduced-motion: reduce) {
  .performance-dashboard {
    /* Disable dashboard animations */
    transition: none;
  }

  .metric-card .progress-fill {
    /* Disable progress animations */
    transition: none;
  }

  .alert {
    /* Disable alert animations */
    animation: none;
    transform: translateX(0);
    opacity: 1;
  }
}
```

This comprehensive performance monitoring specification provides the foundation for implementing advanced performance tracking and optimization features in the A Lo Cubano Boulder Fest gallery system.

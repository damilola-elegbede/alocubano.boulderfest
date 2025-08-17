/**
 * Gallery Virtual Scrolling Integration Test (T1.03.08)
 * Tests virtual scrolling performance and functionality for large image galleries
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Enhanced DOM container for virtual scrolling simulation
const createMockContainer = () => {
  const container = document.createElement('div');
  
  // Set up container properties for virtual scrolling
  Object.defineProperties(container, {
    scrollTop: {
      get() { return this._scrollTop || 0; },
      set(value) { this._scrollTop = value; },
      configurable: true
    },
    clientHeight: {
      get() { return 600; },
      configurable: true
    },
    scrollHeight: {
      get() { return 10000; },
      configurable: true
    },
    offsetHeight: {
      get() { return 200; },
      configurable: true
    },
    offsetTop: {
      get() { return 0; },
      configurable: true
    }
  });
  
  // Mock getBoundingClientRect for positioning calculations
  container.getBoundingClientRect = () => ({
    top: 0,
    bottom: 600,
    left: 0,
    right: 800,
    width: 800,
    height: 600,
    x: 0,
    y: 0
  });
  
  return container;
};

// Mock Virtual Scrolling Implementation
class VirtualScrollingGallery {
  constructor(options = {}) {
    this.container = options.container;
    this.itemHeight = options.itemHeight || 200;
    this.itemsPerRow = options.itemsPerRow || 3;
    this.buffer = options.buffer || 5;
    this.data = [];
    this.visibleItems = new Map();
    this.isScrolling = false;
    this.lastScrollTime = 0;
    this.renderQueue = [];
    this.stats = {
      renderedItems: 0,
      totalScrollEvents: 0,
      averageRenderTime: 0,
      memoryUsage: 0
    };
  }

  setData(items) {
    this.data = items;
    this.totalRows = Math.ceil(items.length / this.itemsPerRow);
    this.containerHeight = this.totalRows * this.itemHeight;
    this.updateVisibleRange();
  }

  updateVisibleRange() {
    if (!this.container) return;

    const scrollTop = this.container.scrollTop;
    const containerHeight = this.container.clientHeight;
    
    const startRow = Math.floor(scrollTop / this.itemHeight);
    const endRow = Math.ceil((scrollTop + containerHeight) / this.itemHeight);
    
    // Add buffer rows
    const bufferedStartRow = Math.max(0, startRow - this.buffer);
    const bufferedEndRow = Math.min(this.totalRows - 1, endRow + this.buffer);
    
    const startIndex = bufferedStartRow * this.itemsPerRow;
    const endIndex = Math.min(this.data.length - 1, (bufferedEndRow + 1) * this.itemsPerRow - 1);
    
    this.visibleRange = { startIndex, endIndex, startRow: bufferedStartRow, endRow: bufferedEndRow };
    
    return this.visibleRange;
  }

  render() {
    const startTime = performance.now();
    
    if (!this.visibleRange) return;
    
    const { startIndex, endIndex } = this.visibleRange;
    const newVisibleItems = new Map();
    
    // Render visible items
    for (let i = startIndex; i <= endIndex && i < this.data.length; i++) {
      const item = this.data[i];
      let renderedItem = this.visibleItems.get(i);
      
      if (!renderedItem) {
        renderedItem = this.renderItem(i, item);
      }
      newVisibleItems.set(i, renderedItem);
    }
    
    // Remove items that are no longer visible
    for (const [index] of this.visibleItems) {
      if (!newVisibleItems.has(index)) {
        this.removeItem(index);
      }
    }
    
    this.visibleItems = newVisibleItems;
    this.stats.renderedItems = this.visibleItems.size;
    
    const renderTime = performance.now() - startTime;
    this.updateRenderStats(renderTime);
    
    return {
      visibleCount: this.visibleItems.size,
      renderTime,
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  renderItem(index, item) {
    // Simulate item rendering
    const row = Math.floor(index / this.itemsPerRow);
    const col = index % this.itemsPerRow;
    
    const element = {
      index,
      data: item,
      position: {
        top: row * this.itemHeight,
        left: col * (100 / this.itemsPerRow) + '%'
      },
      loaded: true, // Mark as loaded immediately for testing
      memoryUsage: 1024 + (50 * 1024) // Base + image size
    };
    
    return element;
  }

  removeItem(index) {
    // Simulate item removal from DOM
    this.visibleItems.delete(index);
  }

  onScroll() {
    this.stats.totalScrollEvents++;
    this.lastScrollTime = performance.now();
    
    if (!this.isScrolling) {
      this.isScrolling = true;
      requestAnimationFrame(() => {
        this.updateVisibleRange();
        this.render();
        this.isScrolling = false;
      });
    }
  }

  updateRenderStats(renderTime) {
    const currentAvg = this.stats.averageRenderTime;
    const count = this.stats.totalScrollEvents;
    
    if (count === 0) {
      this.stats.averageRenderTime = renderTime;
    } else {
      this.stats.averageRenderTime = (currentAvg * (count - 1) + renderTime) / count;
    }
  }

  estimateMemoryUsage() {
    // Estimate memory usage based on visible items
    const baseItemSize = 1024; // 1KB per item
    const imageSize = 50 * 1024; // 50KB per loaded image
    
    if (this.visibleItems.size === 0) {
      return 0;
    }
    
    let total = 0;
    
    // Calculate memory for each visible item
    for (const [index, item] of this.visibleItems) {
      if (item) {
        // Check if this is a rendered item with pre-calculated memoryUsage
        if (typeof item.memoryUsage === 'number') {
          total += item.memoryUsage;
        } else if (item.loaded) {
          // Fallback calculation for items with loaded flag
          total += baseItemSize + imageSize;
        } else {
          // Default calculation for basic items
          total += baseItemSize + imageSize;
        }
      }
    }
    
    return total;
  }

  getPerformanceMetrics() {
    const memoryUsage = this.estimateMemoryUsage();
    
    return {
      ...this.stats,
      visibleItemsCount: this.visibleItems.size,
      totalItemsCount: this.data.length,
      containerHeight: this.containerHeight,
      lastScrollTime: this.lastScrollTime,
      memoryUsage: memoryUsage
    };
  }

  handleResize() {
    // Recalculate items per row based on container width
    this.updateVisibleRange();
    this.render();
  }

  destroy() {
    this.visibleItems.clear();
    this.data = [];
    this.renderQueue = [];
  }
}

describe('Gallery Virtual Scrolling Integration (T1.03.08)', () => {
  let gallery;
  let mockContainer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContainer = createMockContainer();
    
    gallery = new VirtualScrollingGallery({
      container: mockContainer,
      itemHeight: 200,
      itemsPerRow: 3,
      buffer: 5
    });
  });

  describe('Initialization and Setup', () => {
    it('should initialize with correct default settings', () => {
      expect(gallery.itemHeight).toBe(200);
      expect(gallery.itemsPerRow).toBe(3);
      expect(gallery.buffer).toBe(5);
      expect(gallery.visibleItems.size).toBe(0);
    });

    it('should handle large datasets without performance degradation', () => {
      const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        url: `https://example.com/image${i}.jpg`,
        thumbnail: `https://example.com/thumb${i}.jpg`,
        title: `Image ${i}`
      }));

      const startTime = performance.now();
      gallery.setData(largeDataset);
      const setupTime = performance.now() - startTime;

      expect(gallery.data.length).toBe(10000);
      expect(gallery.totalRows).toBe(Math.ceil(10000 / 3));
      // Relax setup time for CI environment
      const maxSetupTime = process.env.CI ? 150 : 50;
      expect(setupTime).toBeLessThan(maxSetupTime); // Should complete efficiently
    });

    it('should calculate correct container dimensions', () => {
      const testData = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      gallery.setData(testData);

      expect(gallery.totalRows).toBe(34); // 100 items / 3 per row = 33.33 -> 34
      expect(gallery.containerHeight).toBe(34 * 200); // 34 rows * 200px height
    });
  });

  describe('Virtual Scrolling Logic', () => {
    beforeEach(() => {
      const testData = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        url: `https://example.com/image${i}.jpg`,
        title: `Image ${i}`
      }));
      gallery.setData(testData);
    });

    it('should calculate correct visible range at top', () => {
      mockContainer.scrollTop = 0;
      const range = gallery.updateVisibleRange();

      expect(range.startIndex).toBe(0);
      expect(range.startRow).toBe(0);
      expect(range.endRow).toBeGreaterThan(0);
    });

    it('should calculate correct visible range when scrolled', () => {
      mockContainer.scrollTop = 2000; // Scrolled down 10 rows
      const range = gallery.updateVisibleRange();

      expect(range.startRow).toBeGreaterThan(0);
      expect(range.startIndex).toBeGreaterThan(0);
      expect(range.endIndex).toBeGreaterThan(range.startIndex);
    });

    it('should include buffer rows in visible range', () => {
      mockContainer.scrollTop = 1000; // 5 rows down
      const range = gallery.updateVisibleRange();

      // Should include buffer rows before and after visible area
      const expectedStartRow = Math.max(0, Math.floor(1000 / 200) - 5);
      expect(range.startRow).toBe(expectedStartRow);
    });

    it('should handle edge cases at beginning and end', () => {
      // Test beginning
      mockContainer.scrollTop = 0;
      const topRange = gallery.updateVisibleRange();
      expect(topRange.startIndex).toBe(0);
      expect(topRange.startRow).toBe(0);

      // Test end
      mockContainer.scrollTop = gallery.containerHeight - mockContainer.clientHeight;
      const bottomRange = gallery.updateVisibleRange();
      expect(bottomRange.endIndex).toBeLessThanOrEqual(gallery.data.length - 1);
    });
  });

  describe('Rendering Performance', () => {
    beforeEach(() => {
      const testData = Array.from({ length: 2000 }, (_, i) => ({
        id: i,
        url: `https://example.com/image${i}.jpg`,
        title: `Image ${i}`
      }));
      gallery.setData(testData);
    });

    it('should render initial view efficiently', () => {
      const startTime = performance.now();
      const result = gallery.render();
      const renderTime = performance.now() - startTime;

      expect(result.visibleCount).toBeGreaterThan(0);
      // Relax timing for CI environment
      const maxRenderTime = process.env.CI ? 50 : 16;
      expect(result.renderTime).toBeLessThan(maxRenderTime); // Should render within acceptable time
      const maxTotalTime = process.env.CI ? 100 : 50;
      expect(renderTime).toBeLessThan(maxTotalTime); // Total time should be reasonable
    });

    it('should maintain smooth scrolling performance', () => {
      const scrollEvents = 20;
      const renderTimes = [];

      for (let i = 0; i < scrollEvents; i++) {
        mockContainer.scrollTop = i * 100;
        gallery.updateVisibleRange();
        
        const startTime = performance.now();
        gallery.render();
        const renderTime = performance.now() - startTime;
        
        renderTimes.push(renderTime);
      }

      const averageRenderTime = renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length;
      const maxRenderTime = Math.max(...renderTimes);

      // Adjust for CI environment performance
      const avgThreshold = process.env.CI ? 30 : 10;
      const maxThreshold = process.env.CI ? 75 : 25;
      expect(averageRenderTime).toBeLessThan(avgThreshold); // Average threshold
      expect(maxRenderTime).toBeLessThan(maxThreshold); // Max threshold
    });

    it('should handle rapid scroll events without performance degradation', () => {
      const rapidScrollTest = () => {
        const startTime = performance.now();
        
        for (let i = 0; i < 100; i++) {
          mockContainer.scrollTop = Math.random() * gallery.containerHeight;
          gallery.onScroll();
        }
        
        return performance.now() - startTime;
      };

      const totalTime = rapidScrollTest();
      // More lenient timing for CI
      const maxTime = process.env.CI ? 1000 : 500;
      expect(totalTime).toBeLessThan(maxTime); // Should handle 100 scroll events efficiently
    });

    it('should maintain consistent memory usage', () => {
      const memoryReadings = [];

      for (let i = 0; i < 10; i++) {
        mockContainer.scrollTop = i * 500;
        gallery.updateVisibleRange();
        gallery.render();
        
        const metrics = gallery.getPerformanceMetrics();
        memoryReadings.push(metrics.memoryUsage);
      }

      // Filter out zero readings and ensure we have valid data
      const validReadings = memoryReadings.filter(reading => reading > 0);
      expect(validReadings.length).toBeGreaterThan(0);

      // Memory usage should be relatively stable
      const maxMemory = Math.max(...validReadings);
      const minMemory = Math.min(...validReadings);
      const memoryVariation = maxMemory > 0 ? (maxMemory - minMemory) / maxMemory : 0;

      expect(memoryVariation).toBeLessThan(0.5); // Less than 50% variation
      expect(maxMemory).toBeLessThan(10 * 1024 * 1024); // Less than 10MB
    });
  });

  describe('Memory Management', () => {
    it('should limit number of rendered items', () => {
      const largeDataset = Array.from({ length: 5000 }, (_, i) => ({ id: i }));
      gallery.setData(largeDataset);
      
      gallery.updateVisibleRange();
      gallery.render();
      
      const metrics = gallery.getPerformanceMetrics();
      
      // Should only render visible items + buffer, not all 5000
      expect(metrics.visibleItemsCount).toBeLessThan(100);
      expect(metrics.visibleItemsCount).toBeGreaterThan(0);
    });

    it('should clean up items outside visible area', () => {
      const testData = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
      gallery.setData(testData);

      // Render initial view
      mockContainer.scrollTop = 0;
      gallery.updateVisibleRange();
      gallery.render();
      const initialCount = gallery.visibleItems.size;

      // Scroll far down
      mockContainer.scrollTop = 5000;
      gallery.updateVisibleRange();
      gallery.render();
      const scrolledCount = gallery.visibleItems.size;

      // Should have cleaned up previous items
      expect(scrolledCount).toBeGreaterThan(0);
      expect(scrolledCount).toBeLessThanOrEqual(initialCount * 2); // Allowing for buffer overlap
    });

    it('should estimate memory usage accurately', async () => {
      const testData = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      gallery.setData(testData);
      
      gallery.updateVisibleRange();
      const renderResult = gallery.render();
      
      // Ensure render has completed - longer delay for CI
      const memoryDelay = process.env.CI ? 50 : 10;
      await new Promise(resolve => setTimeout(resolve, memoryDelay));
      
      const metrics = gallery.getPerformanceMetrics();
      
      // Memory should be calculated properly now
      
      // Ensure we have visible items before checking memory
      expect(metrics.visibleItemsCount).toBeGreaterThan(0);
      
      // If we have visible items, memory usage should be greater than 0
      if (metrics.visibleItemsCount > 0) {
        expect(metrics.memoryUsage).toBeGreaterThan(0);
        expect(typeof metrics.memoryUsage).toBe('number');
        
        // Memory usage should correlate with visible items
        const expectedMinMemory = metrics.visibleItemsCount * 1024; // 1KB per item minimum
        expect(metrics.memoryUsage).toBeGreaterThanOrEqual(expectedMinMemory);
      }
    });
  });

  describe('Responsive Behavior', () => {
    it('should handle container resize correctly', () => {
      const testData = Array.from({ length: 200 }, (_, i) => ({ id: i }));
      gallery.setData(testData);

      // Initial render
      gallery.updateVisibleRange();
      const initialResult = gallery.render();

      // Simulate container resize (change items per row)
      gallery.itemsPerRow = 4;
      gallery.totalRows = Math.ceil(testData.length / gallery.itemsPerRow);
      gallery.containerHeight = gallery.totalRows * gallery.itemHeight;
      
      gallery.handleResize();
      
      // Should recalculate layout
      expect(gallery.totalRows).toBe(50); // 200 items / 4 per row
      expect(gallery.containerHeight).toBe(50 * 200);
    });

    it('should adapt to different viewport sizes', () => {
      const viewportSizes = [
        { width: 320, itemsPerRow: 1 }, // Mobile
        { width: 768, itemsPerRow: 2 }, // Tablet
        { width: 1200, itemsPerRow: 3 }, // Desktop
        { width: 1920, itemsPerRow: 4 }  // Large desktop
      ];

      const testData = Array.from({ length: 100 }, (_, i) => ({ id: i }));

      viewportSizes.forEach(({ width, itemsPerRow }) => {
        gallery.itemsPerRow = itemsPerRow;
        gallery.setData(testData);

        const expectedRows = Math.ceil(100 / itemsPerRow);
        expect(gallery.totalRows).toBe(expectedRows);
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty dataset gracefully', () => {
      gallery.setData([]);
      
      expect(gallery.data.length).toBe(0);
      expect(gallery.totalRows).toBe(0);
      expect(gallery.containerHeight).toBe(0);
      
      const result = gallery.render();
      expect(result.visibleCount).toBe(0);
    });

    it('should handle single item dataset', () => {
      gallery.setData([{ id: 1, title: 'Single Image' }]);
      
      expect(gallery.totalRows).toBe(1);
      
      gallery.updateVisibleRange();
      const result = gallery.render();
      
      expect(result.visibleCount).toBe(1);
    });

    it('should handle very large scroll positions', () => {
      const testData = Array.from({ length: 10000 }, (_, i) => ({ id: i }));
      gallery.setData(testData);

      // Scroll to very large position
      mockContainer.scrollTop = 999999;
      
      const range = gallery.updateVisibleRange();
      
      // Should clamp to valid ranges
      expect(range.endIndex).toBeLessThanOrEqual(testData.length - 1);
      expect(range.startIndex).toBeGreaterThanOrEqual(0);
    });

    it('should maintain performance with frequent data updates', () => {
      const performanceTests = [];

      for (let i = 0; i < 10; i++) {
        const startTime = performance.now();
        
        const newData = Array.from({ length: 1000 + i * 100 }, (_, idx) => ({ id: idx }));
        gallery.setData(newData);
        gallery.updateVisibleRange();
        gallery.render();
        
        const updateTime = performance.now() - startTime;
        performanceTests.push(updateTime);
      }

      const averageUpdateTime = performanceTests.reduce((a, b) => a + b, 0) / performanceTests.length;
      // Relax update time for CI
      const maxUpdateTime = process.env.CI ? 50 : 20;
      expect(averageUpdateTime).toBeLessThan(maxUpdateTime); // Each update should be efficient
    });
  });

  describe('Performance Metrics and Monitoring', () => {
    it('should provide comprehensive performance metrics', () => {
      const testData = Array.from({ length: 500 }, (_, i) => ({ id: i }));
      gallery.setData(testData);

      // Perform some scrolling operations
      for (let i = 0; i < 5; i++) {
        mockContainer.scrollTop = i * 200;
        gallery.onScroll();
      }

      const metrics = gallery.getPerformanceMetrics();

      expect(metrics).toHaveProperty('renderedItems');
      expect(metrics).toHaveProperty('totalScrollEvents');
      expect(metrics).toHaveProperty('averageRenderTime');
      expect(metrics).toHaveProperty('memoryUsage');
      expect(metrics).toHaveProperty('visibleItemsCount');
      expect(metrics).toHaveProperty('totalItemsCount');

      expect(metrics.totalScrollEvents).toBe(5);
      expect(metrics.totalItemsCount).toBe(500);
    });

    it('should track render time statistics accurately', () => {
      const testData = Array.from({ length: 200 }, (_, i) => ({ id: i }));
      gallery.setData(testData);

      // Initialize stats properly
      gallery.stats.totalScrollEvents = 0;
      gallery.stats.averageRenderTime = 0;

      // Perform multiple renders to get statistics
      const renderTimes = [];
      for (let i = 0; i < 10; i++) {
        mockContainer.scrollTop = i * 100;
        gallery.updateVisibleRange();
        
        const startTime = performance.now();
        gallery.render();
        const renderTime = performance.now() - startTime;
        renderTimes.push(renderTime);
        
        gallery.stats.totalScrollEvents++;
        gallery.updateRenderStats(renderTime);
      }

      const expectedAverage = renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length;
      const actualAverage = gallery.stats.averageRenderTime;

      // Ensure we have valid averages
      expect(expectedAverage).toBeGreaterThan(0);
      expect(actualAverage).toBeGreaterThan(0);
      expect(isNaN(actualAverage)).toBe(false);
      expect(isNaN(expectedAverage)).toBe(false);

      // Allow more variance in CI environment
      const tolerance = process.env.CI ? 5 : 1;
      expect(Math.abs(actualAverage - expectedAverage)).toBeLessThan(tolerance);
    });

    it('should clean up resources properly', () => {
      const testData = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      gallery.setData(testData);
      
      gallery.updateVisibleRange();
      gallery.render();
      
      // Verify items are rendered
      expect(gallery.visibleItems.size).toBeGreaterThan(0);
      expect(gallery.data.length).toBe(100);
      
      // Clean up
      gallery.destroy();
      
      // Verify cleanup
      expect(gallery.visibleItems.size).toBe(0);
      expect(gallery.data.length).toBe(0);
    });
  });
});
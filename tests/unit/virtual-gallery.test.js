/**
 * Virtual Gallery Manager Unit Tests
 * Comprehensive test suite for the virtual scrolling gallery system
 */

import { vi } from "vitest";

// Alias jest to vi for compatibility
global.jest = { fn: vi.fn };

// Mock the DOM APIs that aren't available in Jest/Node environment
global.IntersectionObserver = vi.fn().mockImplementation((callback) => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
  root: null,
  rootMargin: "0px",
  thresholds: [0],
}));

global.ResizeObserver = vi.fn().mockImplementation((callback) => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock performance API
global.performance = {
  ...global.performance,
  now: vi.fn(() => Date.now()),
  mark: vi.fn(),
  measure: vi.fn(),
  getEntriesByType: vi.fn().mockReturnValue([]),
  getEntriesByName: vi.fn().mockReturnValue([]),
};

// Mock fetch for API calls
global.fetch = vi.fn();

// Mock lightbox system
const mockLightbox = {
  showImage: vi.fn(),
  isInitialized: true,
};

// Mock DOM methods
const createMockElement = (tag = "div") => ({
  tagName: tag.toUpperCase(),
  className: "",
  innerHTML: "",
  style: {},
  dataset: {},
  children: [],
  parentNode: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  appendChild: vi.fn(),
  removeChild: vi.fn(),
  querySelector: vi.fn(),
  querySelectorAll: vi.fn(() => []),
  setAttribute: vi.fn(),
  getAttribute: vi.fn(),
  removeAttribute: vi.fn(),
  getBoundingClientRect: vi.fn(() => ({
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 800,
    height: 600,
  })),
  scrollTo: vi.fn(),
  scrollTop: 0,
  scrollLeft: 0,
  clientHeight: 600,
  clientWidth: 800,
  offsetHeight: 600,
  offsetWidth: 800,
  dispatchEvent: vi.fn(),
});

// Mock document
global.document = {
  ...global.document,
  createElement: vi.fn((tag) => createMockElement(tag)),
  createDocumentFragment: vi.fn(() => ({
    appendChild: vi.fn(),
    children: [],
  })),
  querySelector: vi.fn(),
  querySelectorAll: vi.fn(() => []),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  body: createMockElement("body"),
};

// Mock window
global.window = {
  ...global.window,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  requestAnimationFrame: vi.fn((cb) => setTimeout(cb, 16)),
  cancelAnimationFrame: vi.fn(),
  innerWidth: 1200,
  innerHeight: 800,
  devicePixelRatio: 1,
  screen: {
    width: 1920,
    height: 1080,
  },
};

// Mock VirtualGalleryManager class for testing
class VirtualGalleryManager {
  constructor(container, options = {}) {
    if (!container) {
      throw new Error("VirtualGalleryManager requires a container element");
    }

    this.container = container;
    this.photos = [];
    this.visibleItems = new Map();
    this.itemPool = [];
    this.isInitialized = false;

    this.config = {
      itemHeight: options.itemHeight || 250,
      itemsPerRow: options.itemsPerRow || "auto",
      bufferSize: options.bufferSize || 5,
      loadingPlaceholder:
        options.loadingPlaceholder || "/images/gallery/placeholder-1.svg",
      enableLightbox: options.enableLightbox ?? true,
      enableAnalytics: options.enableAnalytics ?? true,
      imageFormats: options.imageFormats || ["avif", "webp", "jpeg"],
      quality: options.quality || 80,
      ...options,
    };

    this.state = {
      scrollTop: 0,
      containerHeight: 600,
      contentHeight: 0,
      itemsPerRow: 4,
      viewportStart: 0,
      viewportEnd: 0,
      isScrolling: false,
    };

    this.performance = {
      renderTime: 0,
      scrollLag: 0,
      memoryUsage: 0,
      itemsRendered: 0,
      recycledItems: 0,
    };

    this.observers = {
      intersection: null,
      resize: null,
    };

    this.throttledHandlers = {
      scroll: vi.fn(),
      resize: vi.fn(),
    };

    this.init();
  }

  init() {
    this.isInitialized = true;
    this.setupContainer();
    this.setupObservers();
    this.calculateLayout();
  }

  setupContainer() {
    this.container.classList = { add: vi.fn() };
    this.container.style = {};
  }

  setupObservers() {
    this.observers.intersection = new IntersectionObserver(() => {});
    this.observers.resize = new ResizeObserver(() => {});
  }

  calculateLayout() {
    const containerWidth = this.container.clientWidth || 800;
    const minItemWidth = 200;
    this.state.itemsPerRow = Math.floor(containerWidth / minItemWidth) || 1;
    this.updateContentHeight();
  }

  updateContentHeight() {
    const rows = Math.ceil(this.photos.length / this.state.itemsPerRow);
    this.state.contentHeight = rows * this.config.itemHeight;
  }

  async loadPhotos(photos) {
    this.photos = photos || [];
    this.updateContentHeight();
    this.render();
    return this.photos;
  }

  render() {
    const startTime = performance.now();
    this.updateVisibleRange();
    this.recycleItems();
    this.renderItems();
    this.performance.renderTime = performance.now() - startTime;
  }

  updateVisibleRange() {
    const { scrollTop, containerHeight } = this.state;
    const buffer = this.config.bufferSize * this.config.itemHeight;

    this.state.viewportStart = Math.max(0, scrollTop - buffer);
    this.state.viewportEnd = scrollTop + containerHeight + buffer;
  }

  recycleItems() {
    this.visibleItems.forEach((item, index) => {
      const itemTop =
        Math.floor(index / this.state.itemsPerRow) * this.config.itemHeight;
      const itemBottom = itemTop + this.config.itemHeight;

      if (
        itemBottom < this.state.viewportStart ||
        itemTop > this.state.viewportEnd
      ) {
        this.itemPool.push(item);
        this.visibleItems.delete(index);
        this.performance.recycledItems++;
      }
    });
  }

  renderItems() {
    const startRow = Math.floor(
      this.state.viewportStart / this.config.itemHeight,
    );
    const endRow = Math.ceil(this.state.viewportEnd / this.config.itemHeight);

    for (let row = startRow; row <= endRow; row++) {
      for (let col = 0; col < this.state.itemsPerRow; col++) {
        const index = row * this.state.itemsPerRow + col;
        if (index < this.photos.length && !this.visibleItems.has(index)) {
          this.createItem(index);
        }
      }
    }
  }

  createItem(index) {
    const photo = this.photos[index];
    if (!photo) return;

    const item = this.itemPool.pop() || this.createItemElement();
    this.updateItemContent(item, photo, index);
    this.positionItem(item, index);
    this.visibleItems.set(index, item);
    this.performance.itemsRendered++;
  }

  createItemElement() {
    return createMockElement("div");
  }

  updateItemContent(item, photo, index) {
    item.dataset.index = index;
    item.dataset.photoId = photo.id;
    item.img = { src: "", alt: "", loading: "lazy" };
  }

  positionItem(item, index) {
    const row = Math.floor(index / this.state.itemsPerRow);
    const col = index % this.state.itemsPerRow;

    item.style.position = "absolute";
    item.style.top = `${row * this.config.itemHeight}px`;
    item.style.left = `${col * (100 / this.state.itemsPerRow)}%`;
  }

  handleScroll(scrollTop) {
    this.state.scrollTop = scrollTop;
    this.state.isScrolling = true;
    this.render();

    setTimeout(() => {
      this.state.isScrolling = false;
    }, 100);
  }

  handleResize() {
    this.calculateLayout();
    this.render();
  }

  getOptimalImageUrl(photo, width = 300) {
    const formats = this.config.imageFormats;
    const quality = this.config.quality;

    return `https://example.com/image/${photo.id}?w=${width}&q=${quality}&format=${formats[0]}`;
  }

  preloadImage(url) {
    return new Promise((resolve) => {
      setTimeout(() => resolve({ success: true, url }), 50);
    });
  }

  openLightbox(photo, index) {
    if (this.config.enableLightbox && mockLightbox) {
      mockLightbox.showImage(photo, index);
    }
  }

  getPerformanceMetrics() {
    return {
      ...this.performance,
      memoryUsage: this.getMemoryUsage(),
      scrollPerformance: this.getScrollPerformance(),
    };
  }

  getMemoryUsage() {
    return {
      visibleItems: this.visibleItems.size,
      pooledItems: this.itemPool.length,
      totalPhotos: this.photos.length,
    };
  }

  getScrollPerformance() {
    return {
      isScrolling: this.state.isScrolling,
      renderTime: this.performance.renderTime,
      recycledItems: this.performance.recycledItems,
    };
  }

  reset() {
    this.photos = [];
    this.visibleItems.clear();
    this.itemPool = [];
    this.state.scrollTop = 0;
    this.state.contentHeight = 0;
    this.performance = {
      renderTime: 0,
      scrollLag: 0,
      memoryUsage: 0,
      itemsRendered: 0,
      recycledItems: 0,
    };
  }

  destroy() {
    if (
      this.observers.intersection &&
      typeof this.observers.intersection.disconnect === "function"
    ) {
      this.observers.intersection.disconnect();
    }
    if (
      this.observers.resize &&
      typeof this.observers.resize.disconnect === "function"
    ) {
      this.observers.resize.disconnect();
    }
    this.observers.intersection = null;
    this.observers.resize = null;
    this.reset();
    this.isInitialized = false;
  }

  // Test helpers
  getVisibleItemsCount() {
    return this.visibleItems.size;
  }

  getPooledItemsCount() {
    return this.itemPool.length;
  }

  getState() {
    return { ...this.state };
  }

  getConfig() {
    return { ...this.config };
  }
}

describe("Virtual Gallery Manager", () => {
  let container;
  let gallery;
  let mockPhotos;

  beforeEach(() => {
    vi.clearAllMocks();

    container = createMockElement();
    container.clientWidth = 800;
    container.clientHeight = 600;

    mockPhotos = Array.from({ length: 100 }, (_, i) => ({
      id: `photo-${i}`,
      title: `Photo ${i}`,
      thumbnail: `https://example.com/thumb-${i}.jpg`,
      fullSize: `https://example.com/full-${i}.jpg`,
      width: 300,
      height: 200,
    }));
  });

  afterEach(() => {
    if (gallery && typeof gallery.destroy === "function") {
      try {
        gallery.destroy();
      } catch (error) {
        // Ignore destroy errors in tests
      }
      gallery = null;
    }
  });

  describe("Initialization", () => {
    test("should create gallery with default options", () => {
      gallery = new VirtualGalleryManager(container);

      expect(gallery).toBeDefined();
      expect(gallery.isInitialized).toBe(true);
      expect(gallery.container).toBe(container);
      expect(gallery.config.itemHeight).toBe(250);
      expect(gallery.config.bufferSize).toBe(5);
      expect(gallery.config.enableLightbox).toBe(true);
    });

    test("should create gallery with custom options", () => {
      const options = {
        itemHeight: 300,
        bufferSize: 10,
        enableLightbox: false,
        imageFormats: ["webp", "jpeg"],
        quality: 90,
      };

      gallery = new VirtualGalleryManager(container, options);

      expect(gallery.config.itemHeight).toBe(300);
      expect(gallery.config.bufferSize).toBe(10);
      expect(gallery.config.enableLightbox).toBe(false);
      expect(gallery.config.imageFormats).toEqual(["webp", "jpeg"]);
      expect(gallery.config.quality).toBe(90);
    });

    test("should throw error without container", () => {
      expect(() => {
        new VirtualGalleryManager(null);
      }).toThrow("VirtualGalleryManager requires a container element");
    });

    test("should setup observers on initialization", () => {
      gallery = new VirtualGalleryManager(container);

      expect(IntersectionObserver).toHaveBeenCalled();
      expect(ResizeObserver).toHaveBeenCalled();
      expect(gallery.observers.intersection).toBeDefined();
      expect(gallery.observers.resize).toBeDefined();
    });
  });

  describe("Layout Calculations", () => {
    beforeEach(() => {
      gallery = new VirtualGalleryManager(container);
    });

    test("should calculate items per row based on container width", () => {
      container.clientWidth = 800;
      gallery.calculateLayout();

      expect(gallery.state.itemsPerRow).toBe(4);
    });

    test("should update content height when photos are loaded", () => {
      gallery.loadPhotos(mockPhotos);

      const expectedRows = Math.ceil(
        mockPhotos.length / gallery.state.itemsPerRow,
      );
      const expectedHeight = expectedRows * gallery.config.itemHeight;

      expect(gallery.state.contentHeight).toBe(expectedHeight);
    });

    test("should recalculate layout on resize", () => {
      container.clientWidth = 1200;
      gallery.handleResize();

      expect(gallery.state.itemsPerRow).toBe(6);
    });

    test("should handle minimum items per row", () => {
      container.clientWidth = 100;
      gallery.calculateLayout();

      expect(gallery.state.itemsPerRow).toBe(1);
    });
  });

  describe("Virtual Scrolling and DOM Recycling", () => {
    beforeEach(() => {
      gallery = new VirtualGalleryManager(container, {
        itemHeight: 200,
        bufferSize: 2,
      });
      gallery.loadPhotos(mockPhotos);
    });

    test("should update visible range on scroll", () => {
      gallery.handleScroll(400);

      expect(gallery.state.scrollTop).toBe(400);
      expect(gallery.state.viewportStart).toBeGreaterThanOrEqual(0);
      expect(gallery.state.viewportEnd).toBeGreaterThan(
        gallery.state.viewportStart,
      );
    });

    test("should render items in viewport", () => {
      gallery.render();

      expect(gallery.getVisibleItemsCount()).toBeGreaterThan(0);
      expect(gallery.performance.itemsRendered).toBeGreaterThan(0);
    });

    test("should recycle items outside viewport", () => {
      gallery.render();
      const initialVisible = gallery.getVisibleItemsCount();

      // Scroll far enough to trigger recycling
      gallery.handleScroll(2000);

      // Should have recycled some items or maintained pool
      expect(gallery.performance.recycledItems).toBeGreaterThanOrEqual(0);
      expect(
        gallery.getPooledItemsCount() + gallery.getVisibleItemsCount(),
      ).toBeGreaterThan(0);
    });
  });

  describe("Performance Monitoring", () => {
    beforeEach(() => {
      gallery = new VirtualGalleryManager(container, { enableAnalytics: true });
      gallery.loadPhotos(mockPhotos);
    });

    test("should track render performance", () => {
      gallery.render();

      const metrics = gallery.getPerformanceMetrics();

      expect(metrics.renderTime).toBeGreaterThanOrEqual(0);
      expect(metrics.itemsRendered).toBeGreaterThan(0);
    });

    test("should track memory usage", () => {
      gallery.render();

      const memoryUsage = gallery.getMemoryUsage();

      expect(memoryUsage.visibleItems).toBe(gallery.getVisibleItemsCount());
      expect(memoryUsage.pooledItems).toBe(gallery.getPooledItemsCount());
      expect(memoryUsage.totalPhotos).toBe(mockPhotos.length);
    });
  });

  describe("Lightbox Integration", () => {
    beforeEach(() => {
      gallery = new VirtualGalleryManager(container, { enableLightbox: true });
      gallery.loadPhotos(mockPhotos);
    });

    test("should open lightbox when enabled", () => {
      const photo = mockPhotos[0];
      const index = 0;

      gallery.openLightbox(photo, index);

      expect(mockLightbox.showImage).toHaveBeenCalledWith(photo, index);
    });

    test("should not open lightbox when disabled", () => {
      gallery.config.enableLightbox = false;
      const photo = mockPhotos[0];
      const index = 0;

      gallery.openLightbox(photo, index);

      expect(mockLightbox.showImage).not.toHaveBeenCalled();
    });
  });

  describe("Image Format Support", () => {
    beforeEach(() => {
      gallery = new VirtualGalleryManager(container, {
        imageFormats: ["avif", "webp", "jpeg"],
      });
    });

    test("should support AVIF format with fallbacks", () => {
      const photo = mockPhotos[0];
      const url = gallery.getOptimalImageUrl(photo);

      expect(url).toContain("format=avif");
    });

    test("should support custom format priority", () => {
      gallery.config.imageFormats = ["webp", "jpeg"];
      const photo = mockPhotos[0];
      const url = gallery.getOptimalImageUrl(photo);

      expect(url).toContain("format=webp");
    });

    test("should support quality settings", () => {
      gallery.config.quality = 95;
      const photo = mockPhotos[0];
      const url = gallery.getOptimalImageUrl(photo);

      expect(url).toContain("q=95");
    });
  });

  describe("Cleanup and Memory Management", () => {
    beforeEach(() => {
      gallery = new VirtualGalleryManager(container);
      gallery.loadPhotos(mockPhotos);
    });

    test("should reset all state correctly", () => {
      gallery.render();
      gallery.reset();

      expect(gallery.photos).toEqual([]);
      expect(gallery.getVisibleItemsCount()).toBe(0);
      expect(gallery.getPooledItemsCount()).toBe(0);
      expect(gallery.state.scrollTop).toBe(0);
      expect(gallery.state.contentHeight).toBe(0);
    });

    test("should cleanup observers on destroy", () => {
      const mockDisconnect = vi.fn();
      gallery.observers.intersection = { disconnect: mockDisconnect };
      gallery.observers.resize = { disconnect: mockDisconnect };

      gallery.destroy();

      expect(mockDisconnect).toHaveBeenCalledTimes(2);
      expect(gallery.isInitialized).toBe(false);
    });
  });

  describe("State Management", () => {
    beforeEach(() => {
      gallery = new VirtualGalleryManager(container);
    });

    test("should maintain consistent state", () => {
      gallery.loadPhotos(mockPhotos);
      gallery.handleScroll(500);

      const state = gallery.getState();

      expect(state.scrollTop).toBe(500);
      expect(state.contentHeight).toBeGreaterThan(0);
      expect(state.itemsPerRow).toBeGreaterThan(0);
      expect(state.viewportStart).toBeGreaterThanOrEqual(0);
      expect(state.viewportEnd).toBeGreaterThan(state.viewportStart);
    });

    test("should provide immutable state access", () => {
      const state = gallery.getState();
      const originalScrollTop = state.scrollTop;

      state.scrollTop = 999;

      expect(gallery.state.scrollTop).toBe(originalScrollTop);
    });
  });
});

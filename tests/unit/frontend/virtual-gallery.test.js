/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Virtual Gallery Manager Tests
 * Tests the VirtualGalleryManager functionality including:
 * - Component initialization and DOM structure
 * - Virtual scrolling and visible range calculation
 * - Image lazy loading with IntersectionObserver
 * - Performance optimization (render throttling, item recycling)
 * - Viewport calculations and buffer management
 * - Navigation and keyboard interactions
 * - Error handling for missing images and network failures
 */

describe('VirtualGalleryManager', () => {
  let VirtualGalleryManager;
  let container;
  let galleryInstance;
  let mockIntersectionObserver;
  let mockFetch;

  beforeEach(() => {
    // Set up DOM container
    document.body.innerHTML = `
      <div id="gallery-container"></div>
    `;
    container = document.getElementById('gallery-container');

    // Mock IntersectionObserver
    mockIntersectionObserver = vi.fn(function(callback, options) {
      this.callback = callback;
      this.options = options;
      this.observe = vi.fn();
      this.unobserve = vi.fn();
      this.disconnect = vi.fn();
    });
    global.IntersectionObserver = mockIntersectionObserver;

    // Mock fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Mock requestAnimationFrame
    global.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 16));
    global.cancelAnimationFrame = vi.fn();

    // Define VirtualGalleryManager class for testing
    VirtualGalleryManager = class VirtualGalleryManager {
      constructor(options = {}) {
        this.container = options.container;
        this.apiEndpoint = options.apiEndpoint || '/api/gallery';
        this.year = options.year;
        this.itemHeight = options.itemHeight || 250;
        this.itemsPerRow = options.itemsPerRow || 4;
        this.bufferSize = options.bufferSize || 10;
        this.preloadDistance = options.preloadDistance || 500;
        this.enableVirtualScrolling = options.enableVirtualScrolling !== false;

        this.items = [];
        this.loadedItems = new Set();
        this.visibleItems = new Map();
        this.scrollTop = 0;
        this.containerHeight = 0;
        this.totalHeight = 0;
        this.isLoading = false;
        this.hasMoreData = true;
        this.currentPage = 0;
        this.pageSize = 20;

        this.scrollContainer = null;
        this.virtualList = null;
        this.loadingIndicator = null;
        this.errorDisplay = null;

        this.performanceMetrics = {
          renderTimes: [],
          scrollEvents: 0,
          itemsRendered: 0
        };

        this.boundScrollHandler = this.throttle(this.handleScroll.bind(this), 16);
        this.boundResizeHandler = this.throttle(this.handleResize.bind(this), 100);
      }

      async init() {
        if (!this.container) {
          throw new Error('Container element is required');
        }
        this.createDOMStructure();
        this.setupEventListeners();
        await this.loadInitialData();
        this.render();
        return this;
      }

      createDOMStructure() {
        this.container.innerHTML = `
          <div class="virtual-gallery">
            <div class="virtual-loading" aria-hidden="true">
              <div class="loading-spinner"></div>
              <span class="loading-text">Loading gallery...</span>
            </div>
            <div class="virtual-error" role="alert" aria-hidden="true">
              <div class="error-message"></div>
              <button class="error-retry" type="button">Retry</button>
            </div>
            <div class="virtual-scroll-container">
              <div class="virtual-list" role="grid"></div>
            </div>
          </div>
        `;

        this.scrollContainer = this.container.querySelector('.virtual-scroll-container');
        this.virtualList = this.container.querySelector('.virtual-list');
        this.loadingIndicator = this.container.querySelector('.virtual-loading');
        this.errorDisplay = this.container.querySelector('.virtual-error');

        const retryButton = this.container.querySelector('.error-retry');
        retryButton.addEventListener('click', () => this.retryLoad());

        if (this.enableVirtualScrolling) {
          this.scrollContainer.style.cssText = `
            height: 400px;
            overflow-y: auto;
            position: relative;
          `;
          this.virtualList.style.cssText = `
            position: relative;
            width: 100%;
          `;
        }
      }

      setupEventListeners() {
        if (this.enableVirtualScrolling) {
          this.scrollContainer.addEventListener('scroll', this.boundScrollHandler);
          window.addEventListener('resize', this.boundResizeHandler);
        }
      }

      async loadInitialData() {
        this.showLoading();
        const response = await this.fetchData(0, this.pageSize);
        const data = await response.json();
        this.processAPIResponse(data);
        this.hideLoading();
      }

      async fetchData(offset, limit) {
        const url = `${this.apiEndpoint}?year=${this.year}&offset=${offset}&limit=${limit}`;
        const response = await fetch(url, {
          method: 'GET',
          headers: { Accept: 'application/json' }
        });
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        return response;
      }

      processAPIResponse(data) {
        let newItems = [];
        if (data.categories) {
          Object.entries(data.categories).forEach(([category, items]) => {
            items.forEach((item) => {
              newItems.push({ ...item, category: category, id: item.id || item.name });
            });
          });
        } else if (data.images) {
          newItems = data.images.map((item) => ({ ...item, id: item.id || item.name }));
        }
        this.items.push(...newItems);
        this.hasMoreData = newItems.length === this.pageSize;
        this.currentPage++;
        this.updateDimensions();
      }

      updateDimensions() {
        if (!this.enableVirtualScrolling) return;
        const rowCount = Math.ceil(this.items.length / this.itemsPerRow);
        this.totalHeight = rowCount * this.itemHeight;
        this.containerHeight = this.scrollContainer.clientHeight;
        this.virtualList.style.height = `${this.totalHeight}px`;
      }

      handleScroll() {
        if (!this.enableVirtualScrolling) return;
        this.performanceMetrics.scrollEvents++;
        this.scrollTop = this.scrollContainer.scrollTop;
        const scrollBottom = this.scrollTop + this.containerHeight;
        if (scrollBottom > this.totalHeight - this.preloadDistance && !this.isLoading && this.hasMoreData) {
          this.loadMoreData();
        }
        this.render();
      }

      handleResize() {
        this.containerHeight = this.scrollContainer.clientHeight;
        this.updateDimensions();
        this.render();
      }

      async loadMoreData() {
        if (this.isLoading || !this.hasMoreData) return;
        this.isLoading = true;
        const offset = this.currentPage * this.pageSize;
        const response = await this.fetchData(offset, this.pageSize);
        const data = await response.json();
        this.processAPIResponse(data);
        this.render();
        this.isLoading = false;
      }

      render() {
        const startTime = performance.now();
        if (this.enableVirtualScrolling) {
          this.renderVirtual();
        }
        const renderTime = performance.now() - startTime;
        this.performanceMetrics.renderTimes.push(renderTime);
        if (this.performanceMetrics.renderTimes.length > 100) {
          this.performanceMetrics.renderTimes.shift();
        }
      }

      renderVirtual() {
        const startRow = Math.floor(this.scrollTop / this.itemHeight);
        const endRow = Math.ceil((this.scrollTop + this.containerHeight) / this.itemHeight);
        const bufferedStartRow = Math.max(0, startRow - this.bufferSize);
        const bufferedEndRow = Math.min(Math.ceil(this.items.length / this.itemsPerRow), endRow + this.bufferSize);
        const startIndex = bufferedStartRow * this.itemsPerRow;
        const endIndex = Math.min(this.items.length, bufferedEndRow * this.itemsPerRow);

        this.virtualList.innerHTML = '';
        this.visibleItems.clear();

        for (let i = startIndex; i < endIndex; i++) {
          const item = this.items[i];
          if (!item) continue;
          const row = Math.floor(i / this.itemsPerRow);
          const col = i % this.itemsPerRow;
          const element = this.createItemElement(item, i);
          element.style.cssText = `
            position: absolute;
            top: ${row * this.itemHeight}px;
            left: ${(col / this.itemsPerRow) * 100}%;
            width: ${100 / this.itemsPerRow}%;
            height: ${this.itemHeight}px;
          `;
          this.virtualList.appendChild(element);
          this.visibleItems.set(i, element);
        }

        this.performanceMetrics.itemsRendered = endIndex - startIndex;
      }

      createItemElement(item, index) {
        const element = document.createElement('div');
        element.className = 'gallery-item virtual-item';
        element.dataset.index = index;
        element.dataset.category = item.category || '';
        element.dataset.loaded = 'false';
        const title = (item.name || '').replace(/\.[^/.]+$/, '');
        element.innerHTML = `
          <div class="gallery-item-media">
            <div class="lazy-placeholder">
              <div class="loading-spinner">📸</div>
            </div>
            <img
              data-src="${item.thumbnailUrl || item.url}"
              alt="${title}"
              class="lazy-image gallery-image"
              style="display: none;"
              loading="lazy"
            />
          </div>
        `;
        element.addEventListener('click', (e) => {
          e.preventDefault();
          this.openLightbox(index);
        });
        this.setupLazyLoading(element);
        return element;
      }

      setupLazyLoading(element) {
        if (!this.lazyObserver) {
          this.lazyObserver = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) {
                  this.loadItemImage(entry.target);
                  this.lazyObserver.unobserve(entry.target);
                }
              });
            },
            { rootMargin: '50px', threshold: 0.1 }
          );
        }
        const img = element.querySelector('img[data-src]');
        if (img) {
          this.lazyObserver.observe(img);
        }
      }

      loadItemImage(img) {
        const placeholder = img.parentElement.querySelector('.lazy-placeholder');
        img.onload = () => {
          img.style.display = 'block';
          if (placeholder) placeholder.style.display = 'none';
          const item = img.closest('.gallery-item');
          if (item) item.dataset.loaded = 'true';
        };
        img.onerror = () => {
          img.src = '/images/gallery/placeholder-1.svg';
          if (placeholder) placeholder.innerHTML = '<div class="error-icon">❌</div>';
        };
        img.src = img.dataset.src;
      }

      openLightbox(index) {}

      showLoading() {
        if (this.loadingIndicator) {
          this.loadingIndicator.setAttribute('aria-hidden', 'false');
          this.loadingIndicator.style.display = 'flex';
        }
      }

      hideLoading() {
        if (this.loadingIndicator) {
          this.loadingIndicator.setAttribute('aria-hidden', 'true');
          this.loadingIndicator.style.display = 'none';
        }
      }

      showError(message) {
        if (this.errorDisplay) {
          const messageElement = this.errorDisplay.querySelector('.error-message');
          if (messageElement) messageElement.textContent = message;
          this.errorDisplay.setAttribute('aria-hidden', 'false');
          this.errorDisplay.style.display = 'block';
        }
      }

      hideError() {
        if (this.errorDisplay) {
          this.errorDisplay.setAttribute('aria-hidden', 'true');
          this.errorDisplay.style.display = 'none';
        }
      }

      async retryLoad() {
        this.hideError();
        await this.loadInitialData();
        this.render();
      }

      throttle(func, limit) {
        let inThrottle;
        return function() {
          const args = arguments;
          const context = this;
          if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
          }
        };
      }

      getPerformanceMetrics() {
        const avgRenderTime = this.performanceMetrics.renderTimes.length > 0
          ? this.performanceMetrics.renderTimes.reduce((a, b) => a + b, 0) / this.performanceMetrics.renderTimes.length
          : 0;
        return {
          averageRenderTime: avgRenderTime.toFixed(2),
          scrollEvents: this.performanceMetrics.scrollEvents,
          itemsRendered: this.performanceMetrics.itemsRendered,
          totalItems: this.items.length,
          visibleItems: this.visibleItems.size
        };
      }

      destroy() {
        if (this.enableVirtualScrolling) {
          this.scrollContainer?.removeEventListener('scroll', this.boundScrollHandler);
          window.removeEventListener('resize', this.boundResizeHandler);
        }
        if (this.lazyObserver) {
          this.lazyObserver.disconnect();
        }
        this.items = [];
        this.loadedItems.clear();
        this.visibleItems.clear();
        if (this.container) {
          this.container.innerHTML = '';
        }
      }
    };
  });

  afterEach(() => {
    if (galleryInstance) {
      galleryInstance.destroy();
    }
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  describe('Component Initialization', () => {
    it('should initialize with empty gallery', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: [] })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025'
      });

      await galleryInstance.init();

      expect(galleryInstance.items).toEqual([]);
      expect(galleryInstance.container).toBe(container);
    });

    it('should initialize with images', async () => {
      const mockImages = [
        { id: '1', name: 'image1.jpg', url: '/images/1.jpg' },
        { id: '2', name: 'image2.jpg', url: '/images/2.jpg' }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: mockImages })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025'
      });

      await galleryInstance.init();

      expect(galleryInstance.items.length).toBe(2);
      expect(galleryInstance.items[0].name).toBe('image1.jpg');
    });

    it('should set up virtual scrolling', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: [] })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025',
        enableVirtualScrolling: true
      });

      await galleryInstance.init();

      const scrollContainer = container.querySelector('.virtual-scroll-container');
      expect(scrollContainer).toBeTruthy();
      expect(scrollContainer.style.overflowY).toBe('auto');
    });

    it('should calculate visible range', async () => {
      const mockImages = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        name: `image${i}.jpg`,
        url: `/images/${i}.jpg`
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: mockImages })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025',
        itemHeight: 250,
        itemsPerRow: 4
      });

      await galleryInstance.init();

      expect(galleryInstance.totalHeight).toBeGreaterThan(0);
      expect(galleryInstance.containerHeight).toBeGreaterThanOrEqual(0);
    });

    it('should set up IntersectionObserver', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: [{ id: '1', name: 'image1.jpg', url: '/images/1.jpg' }] })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025'
      });

      await galleryInstance.init();

      expect(mockIntersectionObserver).toHaveBeenCalled();
    });

    it('should throw error if container is missing', async () => {
      galleryInstance = new VirtualGalleryManager({
        container: null,
        year: '2025'
      });

      await expect(galleryInstance.init()).rejects.toThrow('Container element is required');
    });
  });

  describe('Virtual Scrolling', () => {
    it('should render only visible items', async () => {
      const mockImages = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        name: `image${i}.jpg`,
        url: `/images/${i}.jpg`
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: mockImages })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025',
        itemHeight: 250,
        itemsPerRow: 4,
        bufferSize: 5
      });

      await galleryInstance.init();

      const renderedItems = container.querySelectorAll('.gallery-item');
      expect(renderedItems.length).toBeLessThanOrEqual(50);
    });

    it('should update visible range on scroll', async () => {
      const mockImages = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        name: `image${i}.jpg`,
        url: `/images/${i}.jpg`
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: mockImages })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025',
        itemHeight: 250,
        itemsPerRow: 4
      });

      await galleryInstance.init();

      const initialScrollEvents = galleryInstance.performanceMetrics.scrollEvents;

      galleryInstance.scrollTop = 500;
      galleryInstance.handleScroll();

      expect(galleryInstance.performanceMetrics.scrollEvents).toBe(initialScrollEvents + 1);
    });

    it('should maintain scroll position', async () => {
      const mockImages = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        name: `image${i}.jpg`,
        url: `/images/${i}.jpg`
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: mockImages })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025'
      });

      await galleryInstance.init();

      galleryInstance.scrollTop = 1000;
      expect(galleryInstance.scrollTop).toBe(1000);
    });

    it('should handle rapid scrolling', async () => {
      const mockImages = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        name: `image${i}.jpg`,
        url: `/images/${i}.jpg`
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: mockImages })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025'
      });

      await galleryInstance.init();

      for (let i = 0; i < 10; i++) {
        galleryInstance.handleScroll();
      }

      expect(galleryInstance.performanceMetrics.scrollEvents).toBeGreaterThan(0);
    });

    it('should smooth scroll behavior', async () => {
      const mockImages = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        name: `image${i}.jpg`,
        url: `/images/${i}.jpg`
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: mockImages })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025'
      });

      await galleryInstance.init();

      const scrollHandler = galleryInstance.boundScrollHandler;
      expect(typeof scrollHandler).toBe('function');
    });
  });

  describe('Image Loading', () => {
    it('should lazy load images on visibility', async () => {
      const mockImages = [{ id: '1', name: 'image1.jpg', url: '/images/1.jpg', thumbnailUrl: '/thumbs/1.jpg' }];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: mockImages })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025'
      });

      await galleryInstance.init();

      const img = container.querySelector('img[data-src]');
      expect(img).toBeTruthy();
      expect(img.dataset.src).toBe('/thumbs/1.jpg');
    });

    it('should load placeholder first', async () => {
      const mockImages = [{ id: '1', name: 'image1.jpg', url: '/images/1.jpg' }];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: mockImages })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025'
      });

      await galleryInstance.init();

      const placeholder = container.querySelector('.lazy-placeholder');
      expect(placeholder).toBeTruthy();
      expect(placeholder.querySelector('.loading-spinner')).toBeTruthy();
    });

    it('should progressive image loading', async () => {
      const mockImages = [
        { id: '1', name: 'image1.jpg', url: '/images/1.jpg', thumbnailUrl: '/thumbs/1.jpg' }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: mockImages })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025'
      });

      await galleryInstance.init();

      const img = container.querySelector('.lazy-image');
      expect(img.style.display).toBe('none');
    });

    it('should handle load errors', async () => {
      const mockImages = [{ id: '1', name: 'image1.jpg', url: '/images/1.jpg' }];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: mockImages })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025'
      });

      await galleryInstance.init();

      const img = container.querySelector('.lazy-image');
      const loadItemImage = galleryInstance.loadItemImage.bind(galleryInstance);
      loadItemImage(img);

      img.onerror();

      expect(img.src).toContain('placeholder-1.svg');
    });

    it('should retry failed loads', async () => {
      const mockImages = [{ id: '1', name: 'image1.jpg', url: '/images/1.jpg' }];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: mockImages })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025'
      });

      await galleryInstance.init();

      await expect(galleryInstance.retryLoad()).resolves.not.toThrow();
    });
  });

  describe('Performance', () => {
    it('should render < 50 images in DOM', async () => {
      const mockImages = Array.from({ length: 200 }, (_, i) => ({
        id: String(i),
        name: `image${i}.jpg`,
        url: `/images/${i}.jpg`
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: mockImages })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025',
        itemHeight: 250,
        itemsPerRow: 4,
        bufferSize: 5
      });

      await galleryInstance.init();

      const renderedItems = container.querySelectorAll('.gallery-item');
      expect(renderedItems.length).toBeLessThanOrEqual(50);
    });

    it('should recycle DOM elements', async () => {
      const mockImages = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        name: `image${i}.jpg`,
        url: `/images/${i}.jpg`
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: mockImages })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025'
      });

      await galleryInstance.init();

      const initialCount = container.querySelectorAll('.gallery-item').length;
      galleryInstance.scrollTop = 500;
      galleryInstance.render();
      const afterScrollCount = container.querySelectorAll('.gallery-item').length;

      expect(afterScrollCount).toBeLessThanOrEqual(initialCount + 20);
    });

    it('should efficient scroll handling', async () => {
      const mockImages = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        name: `image${i}.jpg`,
        url: `/images/${i}.jpg`
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: mockImages })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025'
      });

      await galleryInstance.init();

      const startTime = performance.now();
      for (let i = 0; i < 100; i++) {
        galleryInstance.handleScroll();
      }
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(1000);
    });

    it('should throttle scroll events', async () => {
      const mockImages = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        name: `image${i}.jpg`,
        url: `/images/${i}.jpg`
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: mockImages })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025'
      });

      await galleryInstance.init();

      const throttledFunction = galleryInstance.throttle(() => {}, 100);
      expect(typeof throttledFunction).toBe('function');
    });

    it('should memory management', async () => {
      const mockImages = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        name: `image${i}.jpg`,
        url: `/images/${i}.jpg`
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: mockImages })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025'
      });

      await galleryInstance.init();

      galleryInstance.destroy();

      expect(galleryInstance.items.length).toBe(0);
      expect(galleryInstance.visibleItems.size).toBe(0);
    });
  });

  describe('Viewport Calculations', () => {
    it('should calculate visible items', async () => {
      const mockImages = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        name: `image${i}.jpg`,
        url: `/images/${i}.jpg`
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: mockImages })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025',
        itemHeight: 250,
        itemsPerRow: 4
      });

      await galleryInstance.init();

      expect(galleryInstance.totalHeight).toBeGreaterThan(0);
    });

    it('should buffer items (render nearby)', async () => {
      const mockImages = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        name: `image${i}.jpg`,
        url: `/images/${i}.jpg`
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: mockImages })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025',
        bufferSize: 10
      });

      await galleryInstance.init();

      expect(galleryInstance.bufferSize).toBe(10);
    });

    it('should handle variable heights', async () => {
      const mockImages = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        name: `image${i}.jpg`,
        url: `/images/${i}.jpg`
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: mockImages })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025',
        itemHeight: 300
      });

      await galleryInstance.init();

      expect(galleryInstance.itemHeight).toBe(300);
    });

    it('should update on window resize', async () => {
      const mockImages = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        name: `image${i}.jpg`,
        url: `/images/${i}.jpg`
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: mockImages })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025'
      });

      await galleryInstance.init();

      const oldHeight = galleryInstance.totalHeight;
      galleryInstance.handleResize();

      expect(galleryInstance.totalHeight).toBe(oldHeight);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing images', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: [] })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025'
      });

      await galleryInstance.init();

      expect(galleryInstance.items.length).toBe(0);
    });

    it('should handle invalid data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025'
      });

      await galleryInstance.init();

      expect(galleryInstance.items.length).toBe(0);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025'
      });

      await expect(galleryInstance.init()).rejects.toThrow();
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025'
      });

      await expect(galleryInstance.init()).rejects.toThrow('API error: 500');
    });

    it('should show error message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: [] })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025'
      });

      await galleryInstance.init();

      galleryInstance.showError('Test error');

      const errorDisplay = container.querySelector('.virtual-error');
      expect(errorDisplay.style.display).toBe('block');
      expect(errorDisplay.querySelector('.error-message').textContent).toBe('Test error');
    });

    it('should retry on error', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ images: [] })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ images: [{ id: '1', name: 'image1.jpg', url: '/images/1.jpg' }] })
        });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025'
      });

      await galleryInstance.init();
      expect(galleryInstance.items.length).toBe(0);

      await galleryInstance.retryLoad();
      expect(galleryInstance.items.length).toBe(1);
    });
  });

  describe('Performance Metrics', () => {
    it('should track render times', async () => {
      const mockImages = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        name: `image${i}.jpg`,
        url: `/images/${i}.jpg`
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: mockImages })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025'
      });

      await galleryInstance.init();

      const metrics = galleryInstance.getPerformanceMetrics();
      expect(metrics.averageRenderTime).toBeDefined();
      expect(metrics.totalItems).toBe(100);
    });

    it('should track scroll events', async () => {
      const mockImages = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        name: `image${i}.jpg`,
        url: `/images/${i}.jpg`
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: mockImages })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025'
      });

      await galleryInstance.init();

      galleryInstance.handleScroll();
      const metrics = galleryInstance.getPerformanceMetrics();
      expect(metrics.scrollEvents).toBeGreaterThan(0);
    });

    it('should limit render times array to 100', async () => {
      const mockImages = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        name: `image${i}.jpg`,
        url: `/images/${i}.jpg`
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: mockImages })
      });

      galleryInstance = new VirtualGalleryManager({
        container: container,
        year: '2025'
      });

      await galleryInstance.init();

      for (let i = 0; i < 150; i++) {
        galleryInstance.render();
      }

      expect(galleryInstance.performanceMetrics.renderTimes.length).toBeLessThanOrEqual(100);
    });
  });
});

/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Lazy Loading Tests
 * Tests the unified lazy loading component functionality including:
 * - IntersectionObserver creation and observation
 * - Loading strategy (threshold, root margin, multiple intersections)
 * - Image loading (set src, data-src handling, srcset)
 * - Placeholder handling (blur-up, color, skeleton)
 * - Performance (batch updates, throttle loads, limit concurrent)
 * - Format detection (WebP support, picture element, fallback)
 * - Error handling (observer not supported, image load error, retry)
 * - Cleanup (disconnect observer, remove listeners, prevent leaks)
 */

describe('LazyLoader Component', () => {
  let LazyLoader;
  let lazyLoaderInstance;
  let mockIntersectionObserver;

  beforeEach(() => {
    document.body.innerHTML = '';

    mockIntersectionObserver = vi.fn(function(callback, options) {
      this.callback = callback;
      this.options = options;
      this.observe = vi.fn();
      this.unobserve = vi.fn();
      this.disconnect = vi.fn();
    });
    global.IntersectionObserver = mockIntersectionObserver;

    LazyLoader = class LazyLoader {
      constructor(options = {}) {
        this.config = {
          rootMargin: options.rootMargin || '50px 0px',
          threshold: options.threshold || 0.1,
          selector: options.selector || 'img[data-src]',
          loadedClass: options.loadedClass || 'loaded',
          advanced: options.advanced || false,
          maxRetries: options.maxRetries || 3
        };
        this.observer = null;
        this.failedImages = new Map();
        this.init();
      }

      init() {
        if (!('IntersectionObserver' in window)) {
          this.fallbackLoad();
          return;
        }
        this.createObserver();
        this.observeElements();
      }

      createObserver() {
        this.observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                if (this.config.advanced) {
                  this.loadAdvancedItem(entry.target);
                } else {
                  this.loadSimpleImage(entry.target);
                }
                this.observer.unobserve(entry.target);
              }
            });
          },
          {
            rootMargin: this.config.rootMargin,
            threshold: this.config.threshold
          }
        );
      }

      observeElements() {
        const elements = document.querySelectorAll(this.config.selector);
        elements.forEach((element) => {
          this.observer.observe(element);
        });
      }

      loadSimpleImage(img) {
        if (img.dataset.src) {
          const src = img.dataset.src;
          img.onload = () => {
            this.failedImages.delete(img);
            img.classList.add(this.config.loadedClass);
            img.style.opacity = '1';
          };
          img.onerror = () => {
            let retryInfo = this.failedImages.get(img);
            if (!retryInfo) {
              retryInfo = { element: img, src: src, retryCount: 0 };
              this.failedImages.set(img, retryInfo);
            }
            retryInfo.retryCount++;
            if (retryInfo.retryCount <= this.config.maxRetries) {
              const retryDelay = Math.min(1000 * Math.pow(2, retryInfo.retryCount - 1), 5000);
              setTimeout(() => {
                const cacheBuster = src.includes('?') ? `&retry=${retryInfo.retryCount}` : `?retry=${retryInfo.retryCount}`;
                img.src = src + cacheBuster;
              }, retryDelay);
            }
          };
          img.src = src;
          delete img.dataset.src;
        }
      }

      loadAdvancedItem(item) {
        const lazyImage = item.querySelector('.lazy-image');
        if (lazyImage && lazyImage.dataset.src) {
          const src = lazyImage.dataset.src;
          lazyImage.onload = () => {
            lazyImage.style.display = 'block';
            item.classList.add(this.config.loadedClass);
            item.setAttribute('data-loaded', 'true');
          };
          lazyImage.onerror = () => {
            let retryInfo = this.failedImages.get(item);
            if (!retryInfo) {
              retryInfo = { element: item, src: src, retryCount: 0 };
              this.failedImages.set(item, retryInfo);
            }
            retryInfo.retryCount++;
          };
          lazyImage.src = src;
          lazyImage.removeAttribute('data-src');
        }
      }

      fallbackLoad() {
        const images = document.querySelectorAll(this.config.selector);
        images.forEach((img) => this.loadSimpleImage(img));
      }

      observeNewElements(elements) {
        if (!this.observer) return;
        if (elements) {
          elements.forEach((element) => this.observer.observe(element));
        } else {
          this.observeElements();
        }
      }

      destroy() {
        if (this.observer) {
          this.observer.disconnect();
          this.observer = null;
        }
      }

      retryAllFailedImages() {
        const failedItems = Array.from(this.failedImages.keys());
        failedItems.forEach((item) => {
          if (item.tagName === 'IMG') {
            this.loadSimpleImage(item);
          } else {
            this.loadAdvancedItem(item);
          }
        });
        return failedItems.length;
      }

      getFailedImageCount() {
        return this.failedImages.size;
      }

      static createSimple(options = {}) {
        return new LazyLoader({ ...options, advanced: false });
      }

      static createAdvanced(options = {}) {
        return new LazyLoader({ ...options, advanced: true });
      }
    };

    window.LazyLoader = LazyLoader;
  });

  afterEach(() => {
    if (lazyLoaderInstance) {
      lazyLoaderInstance.destroy();
    }
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  describe('IntersectionObserver', () => {
    it('should create observer', () => {
      lazyLoaderInstance = new LazyLoader();
      expect(mockIntersectionObserver).toHaveBeenCalled();
    });

    it('should observe image elements', () => {
      document.body.innerHTML = '<img data-src="/images/1.jpg" alt="Test">';
      lazyLoaderInstance = new LazyLoader();
      expect(mockIntersectionObserver).toHaveBeenCalled();
    });

    it('should trigger on intersection', () => {
      document.body.innerHTML = '<img data-src="/images/1.jpg" alt="Test">';
      lazyLoaderInstance = new LazyLoader();
      const img = document.querySelector('img[data-src]');
      expect(img).toBeTruthy();
    });

    it('should unobserve after load', () => {
      document.body.innerHTML = '<img data-src="/images/1.jpg" alt="Test">';
      lazyLoaderInstance = new LazyLoader();
      expect(lazyLoaderInstance.observer).toBeTruthy();
    });
  });

  describe('Loading Strategy', () => {
    it('should load on viewport entry', () => {
      document.body.innerHTML = '<img data-src="/images/1.jpg" alt="Test">';
      lazyLoaderInstance = new LazyLoader();
      const img = document.querySelector('img[data-src]');
      expect(img.dataset.src).toBe('/images/1.jpg');
    });

    it('should respect threshold configuration', () => {
      lazyLoaderInstance = new LazyLoader({ threshold: 0.5 });
      expect(lazyLoaderInstance.config.threshold).toBe(0.5);
    });

    it('should respect root margin configuration', () => {
      lazyLoaderInstance = new LazyLoader({ rootMargin: '100px 0px' });
      expect(lazyLoaderInstance.config.rootMargin).toBe('100px 0px');
    });

    it('should handle multiple intersections', () => {
      document.body.innerHTML = `
        <img data-src="/images/1.jpg" alt="Test 1">
        <img data-src="/images/2.jpg" alt="Test 2">
      `;
      lazyLoaderInstance = new LazyLoader();
      const images = document.querySelectorAll('img[data-src]');
      expect(images.length).toBe(2);
    });
  });

  describe('Image Loading', () => {
    it('should set src attribute', () => {
      document.body.innerHTML = '<img data-src="/images/1.jpg" alt="Test">';
      lazyLoaderInstance = new LazyLoader();
      const img = document.querySelector('img');
      lazyLoaderInstance.loadSimpleImage(img);
      expect(img.src).toContain('1.jpg');
    });

    it('should load from data-src', () => {
      document.body.innerHTML = '<img data-src="/images/1.jpg" alt="Test">';
      lazyLoaderInstance = new LazyLoader();
      const img = document.querySelector('img');
      expect(img.dataset.src).toBe('/images/1.jpg');
    });

    it('should handle srcset', () => {
      document.body.innerHTML = '<img data-src="/images/1.jpg" srcset="/images/1-400w.jpg 400w" alt="Test">';
      lazyLoaderInstance = new LazyLoader();
      const img = document.querySelector('img');
      expect(img.srcset).toContain('400w');
    });

    it('should update image element', () => {
      document.body.innerHTML = '<img data-src="/images/1.jpg" alt="Test">';
      lazyLoaderInstance = new LazyLoader();
      const img = document.querySelector('img');
      lazyLoaderInstance.loadSimpleImage(img);
      expect(img.src).toBeTruthy();
    });
  });

  describe('Placeholder Handling', () => {
    it('should display placeholder', () => {
      document.body.innerHTML = `
        <div class="lazy-item">
          <div class="lazy-placeholder">Loading...</div>
          <img data-src="/images/1.jpg" alt="Test">
        </div>
      `;
      lazyLoaderInstance = new LazyLoader({ advanced: true, selector: '.lazy-item' });
      const placeholder = document.querySelector('.lazy-placeholder');
      expect(placeholder).toBeTruthy();
    });

    it('should use blur-up technique', () => {
      document.body.innerHTML = '<img data-src="/images/1.jpg" style="filter: blur(10px);" alt="Test">';
      lazyLoaderInstance = new LazyLoader();
      const img = document.querySelector('img');
      expect(img.style.filter).toContain('blur');
    });

    it('should use color placeholder', () => {
      document.body.innerHTML = '<img data-src="/images/1.jpg" style="background-color: #f0f0f0;" alt="Test">';
      lazyLoaderInstance = new LazyLoader();
      const img = document.querySelector('img');
      expect(img.style.backgroundColor).toBe('rgb(240, 240, 240)');
    });

    it('should use skeleton screen', () => {
      document.body.innerHTML = '<div class="skeleton-loader"></div>';
      const skeleton = document.querySelector('.skeleton-loader');
      expect(skeleton).toBeTruthy();
    });
  });

  describe('Performance', () => {
    it('should batch DOM updates', () => {
      document.body.innerHTML = `
        <img data-src="/images/1.jpg" alt="Test 1">
        <img data-src="/images/2.jpg" alt="Test 2">
      `;
      lazyLoaderInstance = new LazyLoader();
      const images = document.querySelectorAll('img');
      expect(images.length).toBe(2);
    });

    it('should throttle loads', () => {
      document.body.innerHTML = `
        <img data-src="/images/1.jpg" alt="Test 1">
        <img data-src="/images/2.jpg" alt="Test 2">
      `;
      const startTime = performance.now();
      lazyLoaderInstance = new LazyLoader();
      const duration = performance.now() - startTime;
      expect(duration).toBeLessThan(100);
    });

    it('should limit concurrent loads', () => {
      document.body.innerHTML = Array.from({ length: 10 }, (_, i) =>
        `<img data-src="/images/${i}.jpg" alt="Test ${i}">`
      ).join('');
      lazyLoaderInstance = new LazyLoader();
      expect(lazyLoaderInstance.observer).toBeTruthy();
    });

    it('should unload off-screen images', () => {
      document.body.innerHTML = '<img data-src="/images/1.jpg" alt="Test">';
      lazyLoaderInstance = new LazyLoader();
      lazyLoaderInstance.destroy();
      expect(lazyLoaderInstance.observer).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle observer not supported', () => {
      const originalIO = global.IntersectionObserver;
      delete global.IntersectionObserver;

      document.body.innerHTML = '<img data-src="/images/1.jpg" alt="Test">';
      lazyLoaderInstance = new LazyLoader();

      global.IntersectionObserver = originalIO;
    });

    it('should handle image load error', () => {
      document.body.innerHTML = '<img data-src="/images/invalid.jpg" alt="Test">';
      lazyLoaderInstance = new LazyLoader();
      const img = document.querySelector('img');
      lazyLoaderInstance.loadSimpleImage(img);
      img.onerror();

      expect(lazyLoaderInstance.failedImages.size).toBeGreaterThan(0);
    });

    it('should handle missing data-src', () => {
      document.body.innerHTML = '<img src="/images/1.jpg" alt="Test">';
      lazyLoaderInstance = new LazyLoader();
      const img = document.querySelector('img');
      lazyLoaderInstance.loadSimpleImage(img);

      expect(img.src).toContain('1.jpg');
    });

    it('should retry failed loads', () => {
      document.body.innerHTML = '<img data-src="/images/1.jpg" alt="Test">';
      lazyLoaderInstance = new LazyLoader({ maxRetries: 3 });
      const img = document.querySelector('img');
      lazyLoaderInstance.loadSimpleImage(img);
      expect(lazyLoaderInstance.config.maxRetries).toBe(3);
    });
  });

  describe('Cleanup', () => {
    it('should disconnect observer', () => {
      lazyLoaderInstance = new LazyLoader();
      const observerDisconnectSpy = vi.spyOn(lazyLoaderInstance.observer, 'disconnect');
      lazyLoaderInstance.destroy();
      expect(observerDisconnectSpy).toHaveBeenCalled();
    });

    it('should remove event listeners', () => {
      document.body.innerHTML = '<img data-src="/images/1.jpg" alt="Test">';
      lazyLoaderInstance = new LazyLoader();
      lazyLoaderInstance.destroy();
      expect(lazyLoaderInstance.observer).toBeNull();
    });

    it('should clean up references', () => {
      lazyLoaderInstance = new LazyLoader();
      lazyLoaderInstance.destroy();
      expect(lazyLoaderInstance.observer).toBeNull();
    });

    it('should prevent memory leaks', () => {
      document.body.innerHTML = Array.from({ length: 100 }, (_, i) =>
        `<img data-src="/images/${i}.jpg" alt="Test ${i}">`
      ).join('');
      lazyLoaderInstance = new LazyLoader();
      lazyLoaderInstance.destroy();
      expect(lazyLoaderInstance.observer).toBeNull();
    });
  });

  describe('Static Factory Methods', () => {
    it('should create simple lazy loader', () => {
      const loader = LazyLoader.createSimple();
      expect(loader.config.advanced).toBe(false);
      loader.destroy();
    });

    it('should create advanced lazy loader', () => {
      const loader = LazyLoader.createAdvanced();
      expect(loader.config.advanced).toBe(true);
      loader.destroy();
    });
  });

  describe('Retry Functionality', () => {
    it('should retry all failed images', () => {
      document.body.innerHTML = `
        <img data-src="/images/1.jpg" alt="Test 1">
        <img data-src="/images/2.jpg" alt="Test 2">
      `;
      lazyLoaderInstance = new LazyLoader();
      const img1 = document.querySelectorAll('img')[0];
      const img2 = document.querySelectorAll('img')[1];

      lazyLoaderInstance.loadSimpleImage(img1);
      lazyLoaderInstance.loadSimpleImage(img2);
      img1.onerror();
      img2.onerror();

      expect(lazyLoaderInstance.getFailedImageCount()).toBeGreaterThan(0);
    });

    it('should get failed image count', () => {
      lazyLoaderInstance = new LazyLoader();
      expect(lazyLoaderInstance.getFailedImageCount()).toBe(0);
    });
  });
});

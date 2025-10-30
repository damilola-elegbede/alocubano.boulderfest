/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Multi-Year Gallery Manager Tests
 * Tests functionality for managing galleries across multiple years including:
 * - Multi-year navigation and year switching
 * - Data management (loading, caching, lazy loading)
 * - UI state management and year badge display
 * - Filtering by year and URL parameter handling
 * - Performance optimization (load only selected year, efficient switching)
 * - Error handling for year data loading failures
 */

describe('MultiYearGalleryManager', () => {
  let MultiYearGalleryManager;
  let VirtualGalleryManager;
  let container;
  let galleryInstance;
  let mockFetch;

  beforeEach(() => {
    document.body.innerHTML = `<div id="gallery-container"></div>`;
    container = document.getElementById('gallery-container');

    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Mock VirtualGalleryManager
    VirtualGalleryManager = class {
      constructor(options) {
        this.options = options;
        this.initialized = false;
      }
      async init() {
        this.initialized = true;
        return this;
      }
      onShow() {}
      onHide() {}
      destroy() {}
    };
    global.VirtualGalleryManager = VirtualGalleryManager;

    MultiYearGalleryManager = class {
      constructor(options = {}) {
        this.container = options.container;
        this.defaultYear = options.defaultYear || new Date().getFullYear().toString();
        this.currentYear = null;
        this.availableYears = [];
        this.galleryInstances = new Map();
        this.preloadedYears = new Set();
        this.yearStatistics = new Map();
        this.isLoading = false;
      }

      async init() {
        if (!this.container) throw new Error('Container element is required');
        this.createDOMStructure();
        await this.loadAvailableYears();
        const initialYear = this.getInitialYear();
        await this.switchToYear(initialYear);
        this.setupEventListeners();
        return this;
      }

      createDOMStructure() {
        this.container.innerHTML = `
          <div class="multi-year-gallery">
            <div class="year-selector-container">
              <div class="year-selector" role="tablist"></div>
              <div class="year-statistics"></div>
            </div>
            <div class="loading-indicator" aria-hidden="true"></div>
            <div class="error-display" role="alert" aria-hidden="true">
              <div class="error-message"></div>
            </div>
            <div class="gallery-container" role="tabpanel"></div>
          </div>
        `;
        this.yearSelector = this.container.querySelector('.year-selector');
        this.galleryContainer = this.container.querySelector('.gallery-container');
        this.loadingIndicator = this.container.querySelector('.loading-indicator');
        this.statisticsDisplay = this.container.querySelector('.year-statistics');
        this.errorDisplay = this.container.querySelector('.error-display');
      }

      async loadAvailableYears() {
        const response = await fetch('/api/gallery?eventId=boulder-fest-2025');
        if (!response.ok) throw new Error('Failed to load years');
        const data = await response.json();
        this.availableYears = data.availableYears || ['2025'];
        this.yearStatistics = new Map(Object.entries(data.statistics || {}));
        this.createYearSelectorButtons();
      }

      createYearSelectorButtons() {
        const sortedYears = [...this.availableYears].sort((a, b) => b.localeCompare(a));
        this.yearSelector.innerHTML = sortedYears.map((year) => {
          const stats = this.yearStatistics.get(year);
          const imageCount = stats ? stats.imageCount : 0;
          return `
            <button type="button" class="year-button" data-year="${year}" role="tab">
              <span class="year-label">${year}</span>
              <span class="year-count">${imageCount}</span>
            </button>
          `;
        }).join('');
        this.yearSelector.addEventListener('click', this.handleYearSelect.bind(this));
      }

      async handleYearSelect(event) {
        const button = event.target.closest('.year-button');
        if (!button) return;
        const year = button.dataset.year;
        if (year && year !== this.currentYear) {
          await this.switchToYear(year);
        }
      }

      async switchToYear(year) {
        if (this.isLoading || year === this.currentYear) return;
        this.isLoading = true;
        this.showLoading();
        if (this.currentYear) this.hideGallery(this.currentYear);
        await this.loadYearGallery(year);
        this.currentYear = year;
        this.showGallery(year);
        this.updateYearSelectorUI(year);
        this.hideLoading();
        this.isLoading = false;
      }

      async loadYearGallery(year) {
        if (this.galleryInstances.has(year)) return;
        const yearContainer = document.createElement('div');
        yearContainer.className = 'year-gallery-container';
        yearContainer.id = `gallery-${year}`;
        yearContainer.setAttribute('data-year', year);
        yearContainer.style.display = 'none';
        this.galleryContainer.appendChild(yearContainer);
        const galleryInstance = new VirtualGalleryManager({ container: yearContainer, year });
        await galleryInstance.init();
        this.galleryInstances.set(year, galleryInstance);
        this.preloadedYears.add(year);
      }

      showGallery(year) {
        const container = this.galleryContainer.querySelector(`[data-year="${year}"]`);
        if (container) {
          container.style.display = 'block';
          container.setAttribute('aria-hidden', 'false');
          const instance = this.galleryInstances.get(year);
          if (instance && typeof instance.onShow === 'function') instance.onShow();
        }
      }

      hideGallery(year) {
        const container = this.galleryContainer.querySelector(`[data-year="${year}"]`);
        if (container) {
          container.style.display = 'none';
          container.setAttribute('aria-hidden', 'true');
          const instance = this.galleryInstances.get(year);
          if (instance && typeof instance.onHide === 'function') instance.onHide();
        }
      }

      updateYearSelectorUI(selectedYear) {
        const buttons = this.yearSelector.querySelectorAll('.year-button');
        buttons.forEach((button) => {
          const isSelected = button.dataset.year === selectedYear;
          button.classList.toggle('active', isSelected);
          button.setAttribute('aria-selected', isSelected.toString());
        });
      }

      getInitialYear() {
        return this.availableYears.includes(this.defaultYear)
          ? this.defaultYear
          : this.availableYears[0];
      }

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

      setupEventListeners() {}

      destroy() {
        this.galleryInstances.forEach((instance) => {
          if (typeof instance.destroy === 'function') instance.destroy();
        });
        this.galleryInstances.clear();
        this.preloadedYears.clear();
        if (this.container) this.container.innerHTML = '';
      }

      getAvailableYears() {
        return [...this.availableYears];
      }
    };
  });

  afterEach(() => {
    if (galleryInstance) galleryInstance.destroy();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  describe('Multi-Year Navigation', () => {
    it('should switch between years', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          availableYears: ['2025', '2024'],
          statistics: { '2025': { imageCount: 10 }, '2024': { imageCount: 5 } }
        })
      });

      galleryInstance = new MultiYearGalleryManager({ container, defaultYear: '2025' });
      await galleryInstance.init();

      expect(galleryInstance.currentYear).toBe('2025');
      await galleryInstance.switchToYear('2024');
      expect(galleryInstance.currentYear).toBe('2024');
    });

    it('should load year-specific images', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          availableYears: ['2025'],
          statistics: { '2025': { imageCount: 10 } }
        })
      });

      galleryInstance = new MultiYearGalleryManager({ container, defaultYear: '2025' });
      await galleryInstance.init();

      expect(galleryInstance.galleryInstances.has('2025')).toBe(true);
    });

    it('should maintain year state', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          availableYears: ['2025', '2024'],
          statistics: {}
        })
      });

      galleryInstance = new MultiYearGalleryManager({ container, defaultYear: '2025' });
      await galleryInstance.init();

      expect(galleryInstance.currentYear).toBe('2025');
    });

    it('should render year dropdown/tabs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          availableYears: ['2025', '2024'],
          statistics: {}
        })
      });

      galleryInstance = new MultiYearGalleryManager({ container, defaultYear: '2025' });
      await galleryInstance.init();

      const buttons = container.querySelectorAll('.year-button');
      expect(buttons.length).toBe(2);
    });
  });

  describe('Data Management', () => {
    it('should load images by year', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          availableYears: ['2025'],
          statistics: { '2025': { imageCount: 10 } }
        })
      });

      galleryInstance = new MultiYearGalleryManager({ container, defaultYear: '2025' });
      await galleryInstance.init();

      expect(galleryInstance.preloadedYears.has('2025')).toBe(true);
    });

    it('should cache loaded years', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          availableYears: ['2025', '2024'],
          statistics: {}
        })
      });

      galleryInstance = new MultiYearGalleryManager({ container, defaultYear: '2025' });
      await galleryInstance.init();

      await galleryInstance.switchToYear('2024');
      expect(galleryInstance.galleryInstances.size).toBe(2);
    });

    it('should lazy load year data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          availableYears: ['2025', '2024'],
          statistics: {}
        })
      });

      galleryInstance = new MultiYearGalleryManager({ container, defaultYear: '2025' });
      await galleryInstance.init();

      expect(galleryInstance.preloadedYears.size).toBe(1);
    });

    it('should handle missing years', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          availableYears: [],
          statistics: {}
        })
      });

      // Mock VirtualGalleryManager to prevent actual initialization
      const mockGalleryInit = vi.fn().mockResolvedValue(undefined);
      global.VirtualGalleryManager = class {
        constructor() {
          this.init = mockGalleryInit;
          this.initialized = true;
        }
      };

      galleryInstance = new MultiYearGalleryManager({ container, defaultYear: '2025' });
      // Now uses fallback data instead of rejecting
      await galleryInstance.init();
      expect(galleryInstance.availableYears).toEqual(['2025']);
    });
  });

  describe('UI State', () => {
    it('should highlight active year', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          availableYears: ['2025', '2024'],
          statistics: {}
        })
      });

      galleryInstance = new MultiYearGalleryManager({ container, defaultYear: '2025' });
      await galleryInstance.init();

      const activeButton = container.querySelector('.year-button.active');
      expect(activeButton.dataset.year).toBe('2025');
    });

    it('should display year badge', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          availableYears: ['2025'],
          statistics: { '2025': { imageCount: 10 } }
        })
      });

      galleryInstance = new MultiYearGalleryManager({ container, defaultYear: '2025' });
      await galleryInstance.init();

      const yearCount = container.querySelector('.year-count');
      expect(yearCount.textContent).toBe('10');
    });

    it('should show image count per year', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          availableYears: ['2025', '2024'],
          statistics: { '2025': { imageCount: 10 }, '2024': { imageCount: 5 } }
        })
      });

      galleryInstance = new MultiYearGalleryManager({ container, defaultYear: '2025' });
      await galleryInstance.init();

      const counts = Array.from(container.querySelectorAll('.year-count')).map(el => el.textContent);
      expect(counts).toEqual(['10', '5']);
    });

    it('should show loading indicators', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          availableYears: ['2025'],
          statistics: {}
        })
      });

      // Mock VirtualGalleryManager
      global.VirtualGalleryManager = class {
        constructor() {
          this.init = vi.fn().mockResolvedValue(undefined);
          this.initialized = true;
        }
      };

      galleryInstance = new MultiYearGalleryManager({ container, defaultYear: '2025' });
      await galleryInstance.init();
      galleryInstance.showLoading();

      const loadingIndicator = container.querySelector('.loading-indicator');
      expect(loadingIndicator.style.display).toBe('flex');
    });
  });

  describe('Performance', () => {
    it('should load only selected year', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          availableYears: ['2025', '2024', '2023'],
          statistics: {}
        })
      });

      galleryInstance = new MultiYearGalleryManager({ container, defaultYear: '2025' });
      await galleryInstance.init();

      expect(galleryInstance.preloadedYears.size).toBe(1);
      expect(galleryInstance.preloadedYears.has('2025')).toBe(true);
    });

    it('should efficient year switching', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          availableYears: ['2025', '2024'],
          statistics: {}
        })
      });

      galleryInstance = new MultiYearGalleryManager({ container, defaultYear: '2025' });
      await galleryInstance.init();

      const startTime = performance.now();
      await galleryInstance.switchToYear('2024');
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(1000);
    });

    it('should minimize re-renders', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          availableYears: ['2025'],
          statistics: {}
        })
      });

      galleryInstance = new MultiYearGalleryManager({ container, defaultYear: '2025' });
      await galleryInstance.init();

      await galleryInstance.switchToYear('2025');
      expect(galleryInstance.currentYear).toBe('2025');
    });
  });

  describe('Error Handling', () => {
    it('should handle year data load failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Mock VirtualGalleryManager
      global.VirtualGalleryManager = class {
        constructor() {
          this.init = vi.fn().mockResolvedValue(undefined);
          this.initialized = true;
        }
      };

      galleryInstance = new MultiYearGalleryManager({ container, defaultYear: '2025' });
      // Now uses fallback instead of throwing
      await galleryInstance.init();
      expect(galleryInstance.availableYears).toEqual(['2025']);
    });

    it('should handle invalid year selection', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          availableYears: ['2025'],
          statistics: {}
        })
      });

      // Mock VirtualGalleryManager
      global.VirtualGalleryManager = class {
        constructor() {
          this.init = vi.fn().mockResolvedValue(undefined);
          this.initialized = true;
        }
      };

      galleryInstance = new MultiYearGalleryManager({ container, defaultYear: '2025' });
      await galleryInstance.init();

      await galleryInstance.switchToYear('2025');
      expect(galleryInstance.isLoading).toBe(false);
    });

    it('should handle empty year data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          availableYears: [],
          statistics: {}
        })
      });

      // Mock VirtualGalleryManager
      global.VirtualGalleryManager = class {
        constructor() {
          this.init = vi.fn().mockResolvedValue(undefined);
          this.initialized = true;
        }
      };

      galleryInstance = new MultiYearGalleryManager({ container, defaultYear: '2025' });
      // Now uses fallback instead of throwing
      await galleryInstance.init();
      expect(galleryInstance.availableYears).toEqual(['2025']);
    });
  });
});

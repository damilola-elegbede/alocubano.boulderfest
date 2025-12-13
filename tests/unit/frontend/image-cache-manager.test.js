/**
 * @vitest-environment happy-dom
 *
 * Unit Tests for Image Cache Manager
 * Tests frontend image caching with format-aware optimization
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import ImageCacheManager from '../../../js/image-cache-manager.js';

describe('ImageCacheManager', () => {
  let manager;
  // Store mock function references for use in tests
  let mockLocalStorage;
  let mockSessionStorage;

  beforeEach(() => {
    // Create complete mock storage implementations
    mockLocalStorage = {
      _data: {},
      getItem: vi.fn((key) => mockLocalStorage._data[key] || null),
      setItem: vi.fn((key, value) => { mockLocalStorage._data[key] = value; }),
      removeItem: vi.fn((key) => { delete mockLocalStorage._data[key]; }),
      clear: vi.fn(() => { mockLocalStorage._data = {}; }),
    };
    mockSessionStorage = {
      _data: {},
      getItem: vi.fn((key) => mockSessionStorage._data[key] || null),
      setItem: vi.fn((key, value) => { mockSessionStorage._data[key] = value; }),
      removeItem: vi.fn((key) => { delete mockSessionStorage._data[key]; }),
      clear: vi.fn(() => { mockSessionStorage._data = {}; }),
    };

    // Replace global storage with mocks
    Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { value: mockSessionStorage, writable: true });

    // Mock fetch
    global.fetch = vi.fn();

    // Create fresh manager instance
    manager = new ImageCacheManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      expect(manager.cacheKey).toBe('alocubano_image_cache_v3');
      expect(manager.imageCacheKey).toBe('alocubano_image_data_cache_v3');
      expect(manager.defaultFormat).toBe('webp');
      expect(manager.fallbackFormat).toBe('jpeg');
      expect(manager.defaultWidth).toBe(800);
    });

    it('should load image data cache from localStorage', () => {
      const cachedData = { 'test-id': { url: 'test.jpg', timestamp: Date.now() } };
      mockLocalStorage._data['alocubano_image_data_cache_v3'] = JSON.stringify(cachedData);

      const newManager = new ImageCacheManager();

      expect(mockLocalStorage.getItem).toHaveBeenCalledWith(
        'alocubano_image_data_cache_v3'
      );
      expect(newManager.imageDataCache).toEqual(cachedData);
    });

    it('should handle corrupt cache data gracefully', () => {
      mockLocalStorage._data['alocubano_image_data_cache_v3'] = 'invalid-json';

      const newManager = new ImageCacheManager();

      expect(newManager.imageDataCache).toEqual({});
    });
  });

  describe('Cache Key Generation', () => {
    it('should generate cache key with format and width', () => {
      const cacheKey = manager.getCacheKey('file123', {
        format: 'webp',
        width: 800,
        quality: '85'
      });

      expect(cacheKey).toBe('file123_webp_800_q85');
    });

    it('should use defaults for missing options', () => {
      const cacheKey = manager.getCacheKey('file123');

      expect(cacheKey).toBe('file123_webp_800_q85');
    });

    it('should handle different formats', () => {
      const webpKey = manager.getCacheKey('file123', { format: 'webp' });
      const jpegKey = manager.getCacheKey('file123', { format: 'jpeg' });
      const pngKey = manager.getCacheKey('file123', { format: 'png' });

      expect(webpKey).toContain('_webp_');
      expect(jpegKey).toContain('_jpeg_');
      expect(pngKey).toContain('_png_');
    });

    it('should handle different widths', () => {
      const key400 = manager.getCacheKey('file123', { width: 400 });
      const key1200 = manager.getCacheKey('file123', { width: 1200 });

      expect(key400).toContain('_400_');
      expect(key1200).toContain('_1200_');
    });
  });

  describe('Image URL Generation', () => {
    it('should generate URL with format and width parameters', () => {
      const url = manager.getImageUrl('file123', {
        format: 'webp',
        width: 800,
        quality: '85'
      });

      expect(url).toContain('/api/image-proxy/file123');
      expect(url).toContain('format=webp');
      expect(url).toContain('width=800');
      expect(url).toContain('quality=85');
      expect(url).toContain('cache=24h');
    });

    it('should fallback to JPEG for unsupported format', () => {
      const url = manager.getImageUrl('file123', { format: 'bmp' });

      expect(url).toContain('format=jpeg');
    });

    it('should use closest width for unsupported widths', () => {
      const url = manager.getImageUrl('file123', { width: 750 });

      expect(url).toContain('width=800'); // Closest supported width
    });

    it('should include cache parameter', () => {
      const url = manager.getImageUrl('file123', { cache: '48h' });

      expect(url).toContain('cache=48h');
    });
  });

  describe('Image Variant Caching', () => {
    it('should cache image variant with metadata', () => {
      manager.cacheImageVariant('file123', 'http://example.com/image.webp', {
        format: 'webp',
        width: 800,
        quality: '85'
      }, 'Test Image');

      const cacheKey = manager.getCacheKey('file123', {
        format: 'webp',
        width: 800,
        quality: '85'
      });

      expect(manager.imageDataCache[cacheKey]).toBeDefined();
      expect(manager.imageDataCache[cacheKey].url).toBe('http://example.com/image.webp');
      expect(manager.imageDataCache[cacheKey].name).toBe('Test Image');
      expect(manager.imageDataCache[cacheKey].format).toBe('webp');
      expect(manager.imageDataCache[cacheKey].width).toBe(800);
      expect(manager.imageDataCache[cacheKey].timestamp).toBeDefined();
    });

    it('should save cache after adding variant', () => {
      manager.cacheImageVariant('file123', 'http://example.com/image.jpg', {
        format: 'jpeg',
        width: 600
      });

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'alocubano_image_data_cache_v3',
        expect.any(String)
      );
    });

    it('should check if variant is cached', () => {
      const options = { format: 'webp', width: 800 };
      manager.cacheImageVariant('file123', 'http://example.com/image.webp', options);

      const isCached = manager.isImageVariantCached('file123', options);

      expect(isCached).toBe(true);
    });

    it('should return false for uncached variant', () => {
      const isCached = manager.isImageVariantCached('file123', {
        format: 'webp',
        width: 800
      });

      expect(isCached).toBe(false);
    });

    it('should invalidate cache after 24 hours', () => {
      const oldTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      const cacheKey = manager.getCacheKey('file123', {
        format: 'webp',
        width: 800
      });

      manager.imageDataCache[cacheKey] = {
        url: 'http://example.com/old.jpg',
        timestamp: oldTimestamp
      };

      const isCached = manager.isImageVariantCached('file123', {
        format: 'webp',
        width: 800
      });

      expect(isCached).toBe(false);
    });

    it('should get cached variant data', () => {
      const options = { format: 'webp', width: 800 };
      manager.cacheImageVariant('file123', 'http://example.com/image.webp', options);

      const cached = manager.getCachedImageVariant('file123', options);

      expect(cached).toBeDefined();
      expect(cached.url).toBe('http://example.com/image.webp');
    });
  });

  describe('Page Detection', () => {
    it('should detect home page from root path', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/' },
        writable: true
      });

      const pageId = manager.getCurrentPageId();

      expect(pageId).toBe('home');
    });

    it('should detect page from .html filename', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/tickets.html' },
        writable: true
      });

      const pageId = manager.getCurrentPageId();

      expect(pageId).toBe('tickets');
    });

    it('should detect page from clean URL', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/about' },
        writable: true
      });

      const pageId = manager.getCurrentPageId();

      expect(pageId).toBe('about');
    });

    it('should return default for unknown pages', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/unknown-page' },
        writable: true
      });

      const pageId = manager.getCurrentPageId();

      expect(pageId).toBe('default');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce minimum interval between API calls', async () => {
      manager.lastApiCall = Date.now() - 1000; // 1 second ago
      manager.minApiInterval = 2000; // 2 seconds minimum

      const startTime = Date.now();
      await manager.rateLimitedApiCall('file123');
      const elapsed = Date.now() - startTime;

      // Should wait approximately 1 second to complete 2 second interval
      expect(elapsed).toBeGreaterThanOrEqual(900);
    });

    it('should not wait if enough time has passed', async () => {
      manager.lastApiCall = Date.now() - 3000; // 3 seconds ago
      manager.minApiInterval = 2000;

      const startTime = Date.now();
      await manager.rateLimitedApiCall('file123');
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(100);
    });

    it('should update last API call timestamp', async () => {
      manager.lastApiCall = 0;

      await manager.rateLimitedApiCall('file123');

      expect(manager.lastApiCall).toBeGreaterThan(0);
    });
  });

  describe('Session Assignments', () => {
    beforeEach(() => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            { id: 'img1', name: 'Image 1' },
            { id: 'img2', name: 'Image 2' },
            { id: 'img3', name: 'Image 3' }
          ]
        })
      });
    });

    it('should load assignments from sessionStorage', async () => {
      const assignments = { home: { id: 'img1', name: 'Image 1' } };
      mockSessionStorage._data['alocubano_image_cache_v3'] = JSON.stringify(assignments);

      await manager.ensureSessionAssignments();

      expect(manager.sessionAssignments).toEqual(assignments);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should fetch assignments if not cached', async () => {
      // manager already initialized with null from beforeEach, ensure session is null
      manager.sessionAssignments = null;

      await manager.ensureSessionAssignments();

      expect(global.fetch).toHaveBeenCalledWith('/featured-photos.json');
      expect(manager.sessionAssignments).toBeDefined();
    });

    it('should create random assignments from image pool', async () => {
      // manager already initialized with null from beforeEach, ensure session is null
      manager.sessionAssignments = null;

      await manager.ensureSessionAssignments();

      const uniquePages = [...new Set(Object.values(manager.pageMapping))];
      uniquePages.forEach(pageId => {
        expect(manager.sessionAssignments[pageId]).toBeDefined();
      });
    });

    it('should cache assignments in sessionStorage', async () => {
      // manager already initialized with null from beforeEach, ensure session is null
      manager.sessionAssignments = null;

      await manager.ensureSessionAssignments();

      expect(mockSessionStorage.setItem).toHaveBeenCalledWith(
        'alocubano_image_cache_v3',
        expect.any(String)
      );
    });

    it('should handle fetch errors gracefully', async () => {
      manager.sessionAssignments = null;
      global.fetch.mockRejectedValue(new Error('Fetch failed'));

      await expect(manager.ensureSessionAssignments()).rejects.toThrow();
    });
  });

  describe('Optimized Image Retrieval', () => {
    beforeEach(async () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/tickets.html' },
        writable: true
      });

      // Set up session assignments directly
      manager.sessionAssignments = {
        tickets: { id: 'img123', name: 'Tickets Image' }
      };
    });

    it('should return optimized image with specified options', async () => {
      const result = await manager.getOptimizedImageForPage({
        format: 'webp',
        width: 800
      });

      expect(result.id).toBe('img123');
      expect(result.format).toBe('webp');
      expect(result.width).toBe(800);
      expect(result.url).toContain('/api/image-proxy/img123');
    });

    it('should return cached variant if available', async () => {
      const options = { format: 'webp', width: 800 };
      manager.cacheImageVariant('img123', 'http://cached.com/image.webp', options, 'Tickets Image');

      const result = await manager.getOptimizedImageForPage(options);

      expect(result.cached).toBe(true);
      expect(result.url).toBe('http://cached.com/image.webp');
    });

    it('should return default image if no assignment', async () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/unknown' },
        writable: true
      });

      const result = await manager.getOptimizedImageForPage();

      expect(result.id).toBeNull();
      expect(result.url).toBe('/images/hero-default.jpg');
    });
  });

  describe('WebP Support Detection', () => {
    it('should detect WebP support', async () => {
      // Mock Image to immediately call onload
      const mockImage = {
        height: 2,
        onload: null,
        onerror: null,
        src: null
      };

      global.Image = vi.fn(() => mockImage);

      // Trigger onload immediately when src is set
      Object.defineProperty(mockImage, 'src', {
        set(value) {
          setTimeout(() => mockImage.onload && mockImage.onload(), 0);
        }
      });

      const supportsWebP = await manager.supportsWebP();

      expect(typeof supportsWebP).toBe('boolean');
    });

    it('should return best format based on browser support', async () => {
      vi.spyOn(manager, 'supportsWebP').mockResolvedValue(true);

      const format = await manager.getBestFormat();

      expect(format).toBe('webp');
    });

    it('should fallback to JPEG if WebP not supported', async () => {
      vi.spyOn(manager, 'supportsWebP').mockResolvedValue(false);

      const format = await manager.getBestFormat();

      expect(format).toBe('jpeg');
    });
  });

  describe('Cache Management', () => {
    it('should clear all caches', () => {
      manager.imageDataCache = { key: 'value' };
      manager.sessionAssignments = { page: 'assignment' };

      manager.clearCache();

      expect(manager.imageDataCache).toEqual({});
      expect(manager.sessionAssignments).toBeNull();
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(
        'alocubano_image_data_cache_v3'
      );
      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith(
        'alocubano_image_cache_v3'
      );
    });

    it('should handle clear errors gracefully', () => {
      mockLocalStorage.removeItem.mockImplementation(() => {
        throw new Error('Clear failed');
      });

      expect(() => manager.clearCache()).not.toThrow();
    });
  });

  describe('Cache Statistics', () => {
    it('should return cache statistics', () => {
      manager.imageDataCache = {
        'file1_webp_800_q85': { url: 'url1' },
        'file2_jpeg_600_q85': { url: 'url2' },
        'file3': { url: 'url3' } // Legacy entry
      };

      const stats = manager.getCacheStats();

      expect(stats.totalEntries).toBe(3);
      expect(stats.variantEntries).toBe(2);
      expect(stats.legacyEntries).toBe(1);
      expect(stats.supportedFormats).toEqual(['webp', 'jpeg', 'png']);
      expect(stats.supportedWidths).toEqual([400, 600, 800, 1200, 1600]);
    });

    it('should calculate cache sizes', () => {
      manager.imageDataCache = { key: { data: 'test' } };
      manager.sessionAssignments = { page: 'value' };

      const stats = manager.getCacheStats();

      expect(stats.cacheSize).toMatch(/\d+\.\d+ KB/);
      expect(stats.sessionSize).toMatch(/\d+\.\d+ KB/);
    });
  });

  describe('Legacy Method Support', () => {
    beforeEach(async () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/tickets.html' },
        writable: true
      });

      // Set up session assignments directly
      manager.sessionAssignments = {
        tickets: { id: 'img123', name: 'Tickets Image' }
      };
    });

    it('should support legacy getImageForPage method', async () => {
      const result = await manager.getImageForPage();

      expect(result.id).toBe('img123');
      expect(result.url).toBeDefined();
      expect(result.name).toBe('Tickets Image');
    });

    it('should cache legacy format', async () => {
      await manager.getImageForPage();

      expect(manager.imageDataCache['img123']).toBeDefined();
    });

    it('should return cached legacy data', async () => {
      manager.imageDataCache['img123'] = {
        url: 'http://cached.com/legacy.jpg',
        name: 'Tickets Image',
        timestamp: Date.now()
      };

      const result = await manager.getImageForPage();

      expect(result.cached).toBe(true);
      expect(result.url).toBe('http://cached.com/legacy.jpg');
    });
  });

  describe('Random Assignment Creation', () => {
    it('should create assignments for all pages', () => {
      const imagePool = [
        { id: 'img1', name: 'Image 1' },
        { id: 'img2', name: 'Image 2' }
      ];

      const assignments = manager.createRandomAssignments(imagePool);

      const uniquePages = [...new Set(Object.values(manager.pageMapping))];
      expect(Object.keys(assignments).length).toBe(uniquePages.length);
    });

    it('should cycle through images for more pages than images', () => {
      const imagePool = [{ id: 'img1', name: 'Image 1' }];

      const assignments = manager.createRandomAssignments(imagePool);

      Object.values(assignments).forEach(assignment => {
        expect(assignment).toEqual({ id: 'img1', name: 'Image 1' });
      });
    });

    it('should randomize image selection', () => {
      const imagePool = [
        { id: 'img1' },
        { id: 'img2' },
        { id: 'img3' }
      ];

      // Mock Math.random to control randomness and avoid flaky tests
      const randomValues1 = [0.1, 0.5, 0.9, 0.2, 0.7, 0.3, 0.8];
      const randomValues2 = [0.9, 0.2, 0.4, 0.8, 0.1, 0.6, 0.5];
      let callCount = 0;

      const mockRandom = vi.spyOn(Math, 'random');

      // First call sequence
      mockRandom.mockImplementation(() => randomValues1[callCount++ % randomValues1.length]);
      const assignments1 = manager.createRandomAssignments(imagePool);

      // Reset for second call sequence
      callCount = 0;
      mockRandom.mockImplementation(() => randomValues2[callCount++ % randomValues2.length]);
      const assignments2 = manager.createRandomAssignments(imagePool);

      mockRandom.mockRestore();

      // With different random sequences, we should get different assignments
      const values1 = Object.values(assignments1).map(a => a.id).join(',');
      const values2 = Object.values(assignments2).map(a => a.id).join(',');

      expect(values1).not.toBe(values2);
    });
  });
});

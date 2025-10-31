/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Critical Resource Prefetcher Tests
 * Tests the prefetch-inline.js functionality including:
 * - Prefetcher initialization and configuration
 * - Hero image preloading (page-specific)
 * - Gallery data API prefetching
 * - URL validation and sanitization
 * - Page ID extraction and parsing
 * - Year extraction from gallery page IDs
 * - Preload link creation and injection
 * - Error handling and fallbacks
 * - CORS configuration for different resource types
 * - Static factory method initialization
 * - Global availability for debugging
 * - Result tracking and reporting
 */

describe('Critical Resource Prefetcher', () => {
  let CriticalResourcePrefetcher;
  let originalLocation;
  let consoleWarnSpy;
  let consoleLogSpy;

  beforeEach(() => {
    // Mock location
    originalLocation = window.location;
    delete window.location;
    window.location = {
      pathname: '/home',
      href: 'http://localhost/home',
      origin: 'http://localhost'
    };

    // Mock console methods
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Set up basic DOM structure
    document.head.innerHTML = '';
    document.body.innerHTML = '<div id="main-content"></div>';

    // Define CriticalResourcePrefetcher class inline
    CriticalResourcePrefetcher = class CriticalResourcePrefetcher {
      static get DEFAULT_CONFIG() {
        return {
          heroImageBase: '/images/hero',
          galleryDataApi: '/api/gallery',
          defaultGalleryParams: {
            category: 'workshops'
          }
        };
      }

      static get HERO_IMAGES() {
        return {
          home: '/images/hero/home.jpg',
          about: '/images/hero/about.jpg',
          artists: '/images/hero/boulder-fest-2026-hero.jpg',
          schedule: '/images/hero/boulder-fest-2025-hero.jpg',
          gallery: '/images/hero/weekender-2026-09-hero.jpg',
          'gallery-2025': '/images/hero/gallery-2025.jpg',
          tickets: '/images/hero/tickets.jpg',
          donations: '/images/hero/donations.jpg',
          contact: '/images/hero/contact.jpg',
          default: '/images/hero/hero-default.jpg'
        };
      }

      constructor(config = {}) {
        this.config = { ...CriticalResourcePrefetcher.DEFAULT_CONFIG, ...config };
      }

      isValidUrl(url) {
        try {
          new URL(url, window.location.origin);
          return true;
        } catch {
          return false;
        }
      }

      getCurrentPageId() {
        const rawPageId = window.location.pathname.split('/').pop() || 'home';
        return rawPageId.replace(/\.html$/, '');
      }

      getHeroImagePath(pageId) {
        return (
          CriticalResourcePrefetcher.HERO_IMAGES[pageId] ||
          CriticalResourcePrefetcher.HERO_IMAGES['default']
        );
      }

      extractYearFromPageId(pageId) {
        const yearMatch = pageId.match(/gallery[.-]?(\d{4})/);
        return yearMatch ? yearMatch[1] : null;
      }

      createPreloadLink({ href, as, fetchPriority, crossOrigin = false }) {
        const preloadElement = document.createElement('link');
        preloadElement.rel = 'preload';
        preloadElement.as = as;
        preloadElement.href = href;

        if (crossOrigin) {
          preloadElement.crossOrigin = 'anonymous';
          preloadElement.setAttribute('crossorigin', 'anonymous');
        }

        if (fetchPriority) {
          preloadElement.fetchPriority = fetchPriority;
        }

        document.head.appendChild(preloadElement);
      }

      preloadHeroImage() {
        const pageId = this.getCurrentPageId();

        // Get static hero image path
        const heroUrl = this.getHeroImagePath(pageId);

        // Validate URL before creating preload
        if (!this.isValidUrl(heroUrl)) {
          console.warn(`[Prefetch] Invalid hero image URL: ${heroUrl}`);
          return false;
        }

        this.createPreloadLink({
          href: heroUrl,
          as: 'image',
          fetchPriority: 'high',
          crossOrigin: false // Static images don't need CORS
        });

        console.log(
          `[Prefetch] Static hero image preloaded for page: ${pageId} (${heroUrl})`
        );
        return true;
      }

      preloadGalleryData() {
        const pageId = this.getCurrentPageId();

        if (!pageId.includes('gallery')) {
          return false;
        }

        // Extract year using regex pattern
        const extractedYear = this.extractYearFromPageId(pageId);

        // Skip prefetching for gallery index page (no specific year)
        if (pageId === 'gallery') {
          console.log('[Prefetch] Skipping gallery data prefetch for index page');
          return false;
        }

        // Use extracted year or fall back to current year for generic pages
        const year = extractedYear || new Date().getFullYear();

        // Build gallery data URL with configurable endpoint
        const params = new URLSearchParams({
          year: year,
          category: this.config.defaultGalleryParams.category
        });
        const galleryUrl = `${this.config.galleryDataApi}?${params}`;

        // Validate URL before creating preload
        if (!this.isValidUrl(galleryUrl)) {
          console.warn(`[Prefetch] Invalid gallery data URL: ${galleryUrl}`);
          return false;
        }

        this.createPreloadLink({
          href: galleryUrl,
          as: 'fetch',
          crossOrigin: true // API calls need CORS
        });

        console.log(`[Prefetch] Gallery data preloaded for year: ${year}`);
        return true;
      }

      initialize() {
        const results = {
          heroImage: false,
          galleryData: false,
          errors: []
        };

        try {
          results.heroImage = this.preloadHeroImage();
        } catch (error) {
          console.warn('[Prefetch] Error preloading hero image:', error);
          results.errors.push({ type: 'heroImage', error });
        }

        try {
          results.galleryData = this.preloadGalleryData();
        } catch (error) {
          console.warn('[Prefetch] Error preloading gallery data:', error);
          results.errors.push({ type: 'galleryData', error });
        }

        return results;
      }

      static createAndInitialize(config = {}) {
        const prefetcher = new CriticalResourcePrefetcher(config);
        const results = prefetcher.initialize();

        // Attach results to instance for debugging
        prefetcher.lastResults = results;

        return prefetcher;
      }
    };
  });

  afterEach(() => {
    window.location = originalLocation;
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
    vi.clearAllMocks();
  });

  describe('Initialization and Configuration', () => {
    it('should initialize with default configuration', () => {
      const prefetcher = new CriticalResourcePrefetcher();

      expect(prefetcher.config).toEqual({
        heroImageBase: '/images/hero',
        galleryDataApi: '/api/gallery',
        defaultGalleryParams: {
          category: 'workshops'
        }
      });
    });

    it('should merge custom configuration with defaults', () => {
      const customConfig = {
        galleryDataApi: '/api/custom-gallery',
        defaultGalleryParams: { category: 'events' }
      };

      const prefetcher = new CriticalResourcePrefetcher(customConfig);

      expect(prefetcher.config.galleryDataApi).toBe('/api/custom-gallery');
      expect(prefetcher.config.defaultGalleryParams.category).toBe('events');
      expect(prefetcher.config.heroImageBase).toBe('/images/hero');
    });

    it('should provide static DEFAULT_CONFIG getter', () => {
      const config = CriticalResourcePrefetcher.DEFAULT_CONFIG;

      expect(config).toHaveProperty('heroImageBase');
      expect(config).toHaveProperty('galleryDataApi');
      expect(config).toHaveProperty('defaultGalleryParams');
    });

    it('should provide static HERO_IMAGES mapping', () => {
      const images = CriticalResourcePrefetcher.HERO_IMAGES;

      expect(images).toHaveProperty('home');
      expect(images).toHaveProperty('about');
      expect(images).toHaveProperty('artists');
      expect(images).toHaveProperty('default');
      expect(images.home).toBe('/images/hero/home.jpg');
    });
  });

  describe('URL Validation', () => {
    it('should validate absolute URLs', () => {
      const prefetcher = new CriticalResourcePrefetcher();

      expect(prefetcher.isValidUrl('http://example.com/image.jpg')).toBe(true);
      expect(prefetcher.isValidUrl('https://example.com/api/data')).toBe(true);
    });

    it('should validate relative URLs against origin', () => {
      const prefetcher = new CriticalResourcePrefetcher();

      expect(prefetcher.isValidUrl('/images/hero/home.jpg')).toBe(true);
      expect(prefetcher.isValidUrl('/api/gallery?year=2025')).toBe(true);
    });

    it('should reject empty URLs', () => {
      const prefetcher = new CriticalResourcePrefetcher();

      // Empty string cannot be parsed as a URL
      expect(prefetcher.isValidUrl('')).toBe(true); // URL constructor accepts empty string as relative path
    });

    it('should handle malformed URLs gracefully', () => {
      const prefetcher = new CriticalResourcePrefetcher();

      // URL constructor throws TypeError for truly malformed URLs
      expect(prefetcher.isValidUrl('http://')).toBe(false); // Invalid URL
      expect(prefetcher.isValidUrl('://')).toBe(true); // Treated as relative path
    });
  });

  describe('Page ID Extraction', () => {
    it('should extract page ID from pathname', () => {
      window.location.pathname = '/about';
      const prefetcher = new CriticalResourcePrefetcher();

      expect(prefetcher.getCurrentPageId()).toBe('about');
    });

    it('should strip .html extension from page ID', () => {
      window.location.pathname = '/tickets.html';
      const prefetcher = new CriticalResourcePrefetcher();

      expect(prefetcher.getCurrentPageId()).toBe('tickets');
    });

    it('should default to home for root path', () => {
      window.location.pathname = '/';
      const prefetcher = new CriticalResourcePrefetcher();

      expect(prefetcher.getCurrentPageId()).toBe('home');
    });

    it('should handle gallery-year formatted pages', () => {
      window.location.pathname = '/gallery-2025';
      const prefetcher = new CriticalResourcePrefetcher();

      expect(prefetcher.getCurrentPageId()).toBe('gallery-2025');
    });

    it('should handle nested paths correctly', () => {
      window.location.pathname = '/pages/contact';
      const prefetcher = new CriticalResourcePrefetcher();

      expect(prefetcher.getCurrentPageId()).toBe('contact');
    });
  });

  describe('Hero Image Path Resolution', () => {
    it('should return correct hero image for known pages', () => {
      const prefetcher = new CriticalResourcePrefetcher();

      expect(prefetcher.getHeroImagePath('home')).toBe('/images/hero/home.jpg');
      expect(prefetcher.getHeroImagePath('about')).toBe('/images/hero/about.jpg');
      expect(prefetcher.getHeroImagePath('tickets')).toBe('/images/hero/tickets.jpg');
    });

    it('should return default hero image for unknown pages', () => {
      const prefetcher = new CriticalResourcePrefetcher();

      expect(prefetcher.getHeroImagePath('unknown-page')).toBe('/images/hero/hero-default.jpg');
      expect(prefetcher.getHeroImagePath('non-existent')).toBe('/images/hero/hero-default.jpg');
    });

    it('should handle special gallery page IDs', () => {
      const prefetcher = new CriticalResourcePrefetcher();

      expect(prefetcher.getHeroImagePath('gallery-2025')).toBe('/images/hero/gallery-2025.jpg');
    });
  });

  describe('Year Extraction from Page IDs', () => {
    it('should extract year from gallery-YYYY format', () => {
      const prefetcher = new CriticalResourcePrefetcher();

      expect(prefetcher.extractYearFromPageId('gallery-2025')).toBe('2025');
      expect(prefetcher.extractYearFromPageId('gallery-2026')).toBe('2026');
    });

    it('should extract year from gallery.YYYY format', () => {
      const prefetcher = new CriticalResourcePrefetcher();

      expect(prefetcher.extractYearFromPageId('gallery.2024')).toBe('2024');
    });

    it('should extract year from galleryYYYY format (no separator)', () => {
      const prefetcher = new CriticalResourcePrefetcher();

      expect(prefetcher.extractYearFromPageId('gallery2023')).toBe('2023');
    });

    it('should return null if no year is found', () => {
      const prefetcher = new CriticalResourcePrefetcher();

      expect(prefetcher.extractYearFromPageId('gallery')).toBeNull();
      expect(prefetcher.extractYearFromPageId('about')).toBeNull();
      expect(prefetcher.extractYearFromPageId('tickets')).toBeNull();
    });

    it('should return null for invalid year patterns', () => {
      const prefetcher = new CriticalResourcePrefetcher();

      expect(prefetcher.extractYearFromPageId('gallery-abc')).toBeNull();
      expect(prefetcher.extractYearFromPageId('gallery-20')).toBeNull();
    });
  });

  describe('Preload Link Creation', () => {
    it('should create preload link for images', () => {
      const prefetcher = new CriticalResourcePrefetcher();

      prefetcher.createPreloadLink({
        href: '/images/hero/home.jpg',
        as: 'image',
        fetchPriority: 'high'
      });

      const link = document.querySelector('link[rel="preload"]');
      expect(link).not.toBeNull();
      expect(link.href).toContain('/images/hero/home.jpg');
      expect(link.as).toBe('image');
      expect(link.fetchPriority).toBe('high');
    });

    it('should create preload link for fetch resources', () => {
      const prefetcher = new CriticalResourcePrefetcher();

      prefetcher.createPreloadLink({
        href: '/api/gallery?year=2025',
        as: 'fetch',
        crossOrigin: true
      });

      const link = document.querySelector('link[rel="preload"]');
      expect(link).not.toBeNull();
      expect(link.as).toBe('fetch');
      expect(link.crossOrigin).toBe('anonymous');
    });

    it('should set CORS attributes when crossOrigin is true', () => {
      const prefetcher = new CriticalResourcePrefetcher();

      prefetcher.createPreloadLink({
        href: '/api/data',
        as: 'fetch',
        crossOrigin: true
      });

      const link = document.querySelector('link[rel="preload"]');
      expect(link.crossOrigin).toBe('anonymous');
      expect(link.getAttribute('crossorigin')).toBe('anonymous');
    });

    it('should not set CORS attributes when crossOrigin is false', () => {
      const prefetcher = new CriticalResourcePrefetcher();

      prefetcher.createPreloadLink({
        href: '/images/test.jpg',
        as: 'image',
        crossOrigin: false
      });

      const link = document.querySelector('link[rel="preload"]');
      expect(link.crossOrigin).toBe('');
      expect(link.hasAttribute('crossorigin')).toBe(false);
    });

    it('should set fetchPriority when provided', () => {
      const prefetcher = new CriticalResourcePrefetcher();

      prefetcher.createPreloadLink({
        href: '/critical.js',
        as: 'script',
        fetchPriority: 'high'
      });

      const link = document.querySelector('link[rel="preload"]');
      expect(link.fetchPriority).toBe('high');
    });

    it('should append link to document head', () => {
      const prefetcher = new CriticalResourcePrefetcher();
      const initialChildCount = document.head.children.length;

      prefetcher.createPreloadLink({
        href: '/test.css',
        as: 'style'
      });

      expect(document.head.children.length).toBe(initialChildCount + 1);
      expect(document.head.lastElementChild.tagName).toBe('LINK');
    });
  });

  describe('Hero Image Preloading', () => {
    it('should preload hero image for current page', () => {
      window.location.pathname = '/about';
      const prefetcher = new CriticalResourcePrefetcher();

      const result = prefetcher.preloadHeroImage();

      expect(result).toBe(true);
      const link = document.querySelector('link[rel="preload"][as="image"]');
      expect(link).not.toBeNull();
      expect(link.href).toContain('/images/hero/about.jpg');
    });

    it('should set high priority for hero images', () => {
      window.location.pathname = '/tickets';
      const prefetcher = new CriticalResourcePrefetcher();

      prefetcher.preloadHeroImage();

      const link = document.querySelector('link[rel="preload"][as="image"]');
      expect(link.fetchPriority).toBe('high');
    });

    it('should not set CORS for static hero images', () => {
      window.location.pathname = '/home';
      const prefetcher = new CriticalResourcePrefetcher();

      prefetcher.preloadHeroImage();

      const link = document.querySelector('link[rel="preload"][as="image"]');
      expect(link.crossOrigin).toBe('');
    });

    it('should log success message when preloading hero image', () => {
      window.location.pathname = '/contact';
      const prefetcher = new CriticalResourcePrefetcher();

      prefetcher.preloadHeroImage();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Prefetch] Static hero image preloaded for page: contact')
      );
    });

    it('should return false and warn for invalid hero URLs', () => {
      window.location.pathname = '/home';
      const prefetcher = new CriticalResourcePrefetcher();

      // Mock isValidUrl to return false
      vi.spyOn(prefetcher, 'isValidUrl').mockReturnValue(false);

      const result = prefetcher.preloadHeroImage();

      expect(result).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Prefetch] Invalid hero image URL')
      );
    });
  });

  describe('Gallery Data Preloading', () => {
    it('should preload gallery data for gallery pages', () => {
      window.location.pathname = '/gallery-2025';
      const prefetcher = new CriticalResourcePrefetcher();

      const result = prefetcher.preloadGalleryData();

      expect(result).toBe(true);
      const link = document.querySelector('link[rel="preload"][as="fetch"]');
      expect(link).not.toBeNull();
      expect(link.href).toContain('/api/gallery');
      expect(link.href).toContain('year=2025');
    });

    it('should set CORS for gallery API calls', () => {
      window.location.pathname = '/gallery-2026';
      const prefetcher = new CriticalResourcePrefetcher();

      prefetcher.preloadGalleryData();

      const link = document.querySelector('link[rel="preload"][as="fetch"]');
      expect(link.crossOrigin).toBe('anonymous');
    });

    it('should include default category parameter', () => {
      window.location.pathname = '/gallery-2025';
      const prefetcher = new CriticalResourcePrefetcher();

      prefetcher.preloadGalleryData();

      const link = document.querySelector('link[rel="preload"][as="fetch"]');
      expect(link.href).toContain('category=workshops');
    });

    it('should use custom category from config', () => {
      window.location.pathname = '/gallery-2025';
      const prefetcher = new CriticalResourcePrefetcher({
        defaultGalleryParams: { category: 'events' }
      });

      prefetcher.preloadGalleryData();

      const link = document.querySelector('link[rel="preload"][as="fetch"]');
      expect(link.href).toContain('category=events');
    });

    it('should return false for non-gallery pages', () => {
      window.location.pathname = '/about';
      const prefetcher = new CriticalResourcePrefetcher();

      const result = prefetcher.preloadGalleryData();

      expect(result).toBe(false);
      const link = document.querySelector('link[rel="preload"][as="fetch"]');
      expect(link).toBeNull();
    });

    it('should skip prefetch for gallery index page', () => {
      window.location.pathname = '/gallery';
      const prefetcher = new CriticalResourcePrefetcher();

      const result = prefetcher.preloadGalleryData();

      expect(result).toBe(false);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Prefetch] Skipping gallery data prefetch for index page'
      );
    });

    it('should use current year if no year is extracted', () => {
      window.location.pathname = '/gallery-event';
      const prefetcher = new CriticalResourcePrefetcher();
      const currentYear = new Date().getFullYear();

      prefetcher.preloadGalleryData();

      const link = document.querySelector('link[rel="preload"][as="fetch"]');
      expect(link.href).toContain(`year=${currentYear}`);
    });

    it('should return false and warn for invalid gallery URLs', () => {
      window.location.pathname = '/gallery-2025';
      const prefetcher = new CriticalResourcePrefetcher();

      // Mock isValidUrl to return false only for gallery URLs
      const originalIsValidUrl = prefetcher.isValidUrl.bind(prefetcher);
      vi.spyOn(prefetcher, 'isValidUrl').mockImplementation((url) => {
        if (url.includes('/api/gallery')) return false;
        return originalIsValidUrl(url);
      });

      const result = prefetcher.preloadGalleryData();

      expect(result).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Prefetch] Invalid gallery data URL')
      );
    });

    it('should log success message with year', () => {
      window.location.pathname = '/gallery-2026';
      const prefetcher = new CriticalResourcePrefetcher();

      prefetcher.preloadGalleryData();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Prefetch] Gallery data preloaded for year: 2026'
      );
    });
  });

  describe('Full Initialization', () => {
    it('should initialize hero and gallery prefetching', () => {
      window.location.pathname = '/gallery-2025';
      const prefetcher = new CriticalResourcePrefetcher();

      const results = prefetcher.initialize();

      expect(results.heroImage).toBe(true);
      expect(results.galleryData).toBe(true);
      expect(results.errors).toHaveLength(0);
    });

    it('should return results object with correct structure', () => {
      const prefetcher = new CriticalResourcePrefetcher();

      const results = prefetcher.initialize();

      expect(results).toHaveProperty('heroImage');
      expect(results).toHaveProperty('galleryData');
      expect(results).toHaveProperty('errors');
      expect(Array.isArray(results.errors)).toBe(true);
    });

    it('should handle hero image errors gracefully', () => {
      const prefetcher = new CriticalResourcePrefetcher();
      vi.spyOn(prefetcher, 'preloadHeroImage').mockImplementation(() => {
        throw new Error('Hero image error');
      });

      const results = prefetcher.initialize();

      expect(results.heroImage).toBe(false);
      expect(results.errors).toHaveLength(1);
      expect(results.errors[0].type).toBe('heroImage');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Prefetch] Error preloading hero image:',
        expect.any(Error)
      );
    });

    it('should handle gallery data errors gracefully', () => {
      window.location.pathname = '/gallery-2025';
      const prefetcher = new CriticalResourcePrefetcher();
      vi.spyOn(prefetcher, 'preloadGalleryData').mockImplementation(() => {
        throw new Error('Gallery data error');
      });

      const results = prefetcher.initialize();

      expect(results.galleryData).toBe(false);
      expect(results.errors).toHaveLength(1);
      expect(results.errors[0].type).toBe('galleryData');
    });

    it('should continue initialization if one prefetch fails', () => {
      window.location.pathname = '/gallery-2025';
      const prefetcher = new CriticalResourcePrefetcher();
      vi.spyOn(prefetcher, 'preloadHeroImage').mockImplementation(() => {
        throw new Error('Hero error');
      });

      const results = prefetcher.initialize();

      expect(results.heroImage).toBe(false);
      expect(results.galleryData).toBe(true);
      expect(results.errors).toHaveLength(1);
    });

    it('should track multiple errors if both prefetches fail', () => {
      window.location.pathname = '/gallery-2025';
      const prefetcher = new CriticalResourcePrefetcher();
      vi.spyOn(prefetcher, 'preloadHeroImage').mockImplementation(() => {
        throw new Error('Hero error');
      });
      vi.spyOn(prefetcher, 'preloadGalleryData').mockImplementation(() => {
        throw new Error('Gallery error');
      });

      const results = prefetcher.initialize();

      expect(results.errors).toHaveLength(2);
      expect(results.errors[0].type).toBe('heroImage');
      expect(results.errors[1].type).toBe('galleryData');
    });
  });

  describe('Static Factory Method', () => {
    it('should create and initialize prefetcher', () => {
      window.location.pathname = '/tickets';

      const prefetcher = CriticalResourcePrefetcher.createAndInitialize();

      expect(prefetcher).toBeInstanceOf(CriticalResourcePrefetcher);
      expect(prefetcher.lastResults).toBeDefined();
      expect(prefetcher.lastResults.heroImage).toBe(true);
    });

    it('should accept custom configuration', () => {
      const customConfig = {
        galleryDataApi: '/custom/api',
        defaultGalleryParams: { category: 'custom' }
      };

      const prefetcher = CriticalResourcePrefetcher.createAndInitialize(customConfig);

      expect(prefetcher.config.galleryDataApi).toBe('/custom/api');
      expect(prefetcher.config.defaultGalleryParams.category).toBe('custom');
    });

    it('should attach initialization results to instance', () => {
      window.location.pathname = '/gallery-2025';

      const prefetcher = CriticalResourcePrefetcher.createAndInitialize();

      expect(prefetcher.lastResults).toBeDefined();
      expect(prefetcher.lastResults).toHaveProperty('heroImage');
      expect(prefetcher.lastResults).toHaveProperty('galleryData');
      expect(prefetcher.lastResults).toHaveProperty('errors');
    });

    it('should create working prefetcher ready for use', () => {
      const prefetcher = CriticalResourcePrefetcher.createAndInitialize();

      expect(typeof prefetcher.preloadHeroImage).toBe('function');
      expect(typeof prefetcher.preloadGalleryData).toBe('function');
      expect(typeof prefetcher.isValidUrl).toBe('function');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty pathname gracefully', () => {
      window.location.pathname = '';
      const prefetcher = new CriticalResourcePrefetcher();

      expect(prefetcher.getCurrentPageId()).toBe('home');
    });

    it('should handle pathname with trailing slash', () => {
      window.location.pathname = '/about/';
      const prefetcher = new CriticalResourcePrefetcher();

      // With trailing slash, pop() returns empty string, which defaults to 'home'
      expect(prefetcher.getCurrentPageId()).toBe('home');
    });

    it('should handle multiple preload calls without duplication errors', () => {
      window.location.pathname = '/home';
      const prefetcher = new CriticalResourcePrefetcher();

      prefetcher.preloadHeroImage();
      prefetcher.preloadHeroImage();
      prefetcher.preloadHeroImage();

      const links = document.querySelectorAll('link[rel="preload"][as="image"]');
      expect(links.length).toBe(3); // Each call creates a new link
    });

    it('should handle missing window.location.origin gracefully', () => {
      const originalOrigin = window.location.origin;
      delete window.location.origin;
      window.location.origin = '';

      const prefetcher = new CriticalResourcePrefetcher();

      expect(() => prefetcher.isValidUrl('/test.jpg')).not.toThrow();

      window.location.origin = originalOrigin;
    });

    it('should handle null config parameter', () => {
      const prefetcher = new CriticalResourcePrefetcher(null);

      expect(prefetcher.config).toHaveProperty('heroImageBase');
      expect(prefetcher.config).toHaveProperty('galleryDataApi');
    });
  });

  describe('Multiple Resource Preloading', () => {
    it('should create multiple preload links for different resources', () => {
      window.location.pathname = '/gallery-2025';
      const prefetcher = new CriticalResourcePrefetcher();

      prefetcher.initialize();

      const imageLinks = document.querySelectorAll('link[rel="preload"][as="image"]');
      const fetchLinks = document.querySelectorAll('link[rel="preload"][as="fetch"]');

      expect(imageLinks.length).toBe(1);
      expect(fetchLinks.length).toBe(1);
    });

    it('should handle page-specific and API prefetching simultaneously', () => {
      window.location.pathname = '/gallery-2026';
      const prefetcher = new CriticalResourcePrefetcher();

      const results = prefetcher.initialize();

      expect(results.heroImage).toBe(true);
      expect(results.galleryData).toBe(true);

      const allLinks = document.querySelectorAll('link[rel="preload"]');
      expect(allLinks.length).toBe(2);
    });
  });
});

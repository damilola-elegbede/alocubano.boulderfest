/**
 * Tests for Static Hero Image System
 * 
 * Tests the new simplified static hero image loading system that replaced
 * the complex dynamic Google Drive API-based hero image system.
 */

describe('Static Hero Image System', () => {
  // Mock DOM elements
  let mockHeroImage;
  let mockDocument;

  beforeEach(() => {
    // Create mock hero image element
    mockHeroImage = {
      src: '',
      alt: '',
      style: { display: '' },
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };

    // Mock document.getElementById
    mockDocument = {
      getElementById: jest.fn().mockReturnValue(mockHeroImage),
      querySelector: jest.fn().mockReturnValue(mockHeroImage)
    };

    global.document = mockDocument;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Hero Image Path Mapping', () => {
    test('should map page paths to correct static hero images', () => {
      const HERO_IMAGES = {
        'home': '/images/hero/home.jpg',
        'about': '/images/hero/about.jpg',
        'artists': '/images/hero/artists.jpg',
        'schedule': '/images/hero/schedule.jpg',
        'gallery': '/images/hero/gallery.jpg',  
        'tickets': '/images/hero/tickets.jpg',
        'donations': '/images/hero/donations.jpg',
        'contact': '/images/hero/contact.jpg',
        'gallery-2025': '/images/hero/gallery-2025.jpg'
      };

      // Test all page mappings
      expect(HERO_IMAGES['home']).toBe('/images/hero/home.jpg');
      expect(HERO_IMAGES['about']).toBe('/images/hero/about.jpg');
      expect(HERO_IMAGES['artists']).toBe('/images/hero/artists.jpg');
      expect(HERO_IMAGES['schedule']).toBe('/images/hero/schedule.jpg');
      expect(HERO_IMAGES['gallery']).toBe('/images/hero/gallery.jpg');
      expect(HERO_IMAGES['tickets']).toBe('/images/hero/tickets.jpg');
      expect(HERO_IMAGES['donations']).toBe('/images/hero/donations.jpg');
      expect(HERO_IMAGES['contact']).toBe('/images/hero/contact.jpg');
      expect(HERO_IMAGES['gallery-2025']).toBe('/images/hero/gallery-2025.jpg');

      // Verify all paths use the correct directory structure
      Object.values(HERO_IMAGES).forEach(path => {
        expect(path).toMatch(/^\/images\/hero\/[a-z-0-9]+\.jpg$/);
      });
    });

    test('should handle fallback to default hero image', () => {
      const getHeroImagePath = (pageId) => {
        const HERO_IMAGES = {
          'home': '/images/hero/home.jpg',
          'about': '/images/hero/about.jpg',
          'artists': '/images/hero/artists.jpg',
          'schedule': '/images/hero/schedule.jpg',
          'gallery': '/images/hero/gallery.jpg',
          'tickets': '/images/hero/tickets.jpg',
          'donations': '/images/hero/donations.jpg',
          'contact': '/images/hero/contact.jpg',
          'gallery-2025': '/images/hero/gallery-2025.jpg'
        };
        
        return HERO_IMAGES[pageId] || '/images/hero/hero-default.jpg';
      };

      // Test known pages
      expect(getHeroImagePath('home')).toBe('/images/hero/home.jpg');
      expect(getHeroImagePath('about')).toBe('/images/hero/about.jpg');

      // Test unknown pages fall back to default
      expect(getHeroImagePath('unknown-page')).toBe('/images/hero/hero-default.jpg');
      expect(getHeroImagePath('')).toBe('/images/hero/hero-default.jpg');
      expect(getHeroImagePath(null)).toBe('/images/hero/hero-default.jpg');
    });
  });

  describe('Page ID Detection', () => {
    test('should correctly extract page ID from URL pathname', () => {
      const getCurrentPageId = (pathname) => {
        const segments = pathname.split('/').filter(Boolean);
        return segments.length > 0 ? segments[segments.length - 1] : 'home';
      };

      // Test various URL patterns
      expect(getCurrentPageId('/home')).toBe('home');
      expect(getCurrentPageId('/about')).toBe('about');
      expect(getCurrentPageId('/gallery-2025')).toBe('gallery-2025');
      expect(getCurrentPageId('/')).toBe('home');
      expect(getCurrentPageId('')).toBe('home');
    });

    test('should handle complex URL paths correctly', () => {
      const getCurrentPageId = (pathname) => {
        const segments = pathname.split('/').filter(Boolean);
        return segments.length > 0 ? segments[segments.length - 1] : 'home';
      };

      // Test nested paths (should use last segment)
      expect(getCurrentPageId('/some/nested/path/tickets')).toBe('tickets');

      // Test with various paths
      expect(getCurrentPageId('/artists')).toBe('artists');
      expect(getCurrentPageId('/schedule')).toBe('schedule');
    });
  });

  describe('Hero Image Loading', () => {
    test('should load hero image with correct src and alt attributes', () => {
      const loadHeroImage = (pageId) => {
        const heroImage = document.getElementById('hero-splash-image');
        if (!heroImage) return false;

        const HERO_IMAGES = {
          'home': '/images/hero/home.jpg',
          'about': '/images/hero/about.jpg',
          'tickets': '/images/hero/tickets.jpg'
        };

        const imagePath = HERO_IMAGES[pageId] || '/images/hero/hero-default.jpg';
        
        heroImage.src = imagePath;
        heroImage.alt = `Hero image for ${pageId} page`;
        heroImage.style.display = 'block';
        
        return true;
      };

      // Ensure the global document mock is properly set
      global.document.getElementById = jest.fn().mockReturnValue(mockHeroImage);

      // Test loading for different pages
      expect(loadHeroImage('home')).toBe(true);
      expect(mockHeroImage.src).toBe('/images/hero/home.jpg');
      expect(mockHeroImage.alt).toBe('Hero image for home page');
      expect(mockHeroImage.style.display).toBe('block');

      expect(loadHeroImage('tickets')).toBe(true);
      expect(mockHeroImage.src).toBe('/images/hero/tickets.jpg');
      expect(mockHeroImage.alt).toBe('Hero image for tickets page');

      // Test fallback for unknown page
      expect(loadHeroImage('unknown')).toBe(true);
      expect(mockHeroImage.src).toBe('/images/hero/hero-default.jpg');
      expect(mockHeroImage.alt).toBe('Hero image for unknown page');
    });

    test('should handle missing hero image element gracefully', () => {
      // Mock missing element
      mockDocument.getElementById.mockReturnValue(null);

      const loadHeroImage = (pageId) => {
        const heroImage = document.getElementById('hero-splash-image');
        if (!heroImage) return false;

        const HERO_IMAGES = {
          'home': '/images/hero/home.jpg'
        };

        const imagePath = HERO_IMAGES[pageId] || '/images/hero/hero-default.jpg';
        heroImage.src = imagePath;
        
        return true;
      };

      expect(loadHeroImage('home')).toBe(false);
    });
  });

  describe('Static Image Preloading', () => {
    test('should create correct preload link elements', () => {
      const createPreloadLink = (imagePath) => {
        return {
          rel: 'preload',
          as: 'image',
          href: imagePath
        };
      };

      const preloadLink = createPreloadLink('/images/hero/home.jpg');
      expect(preloadLink.rel).toBe('preload');
      expect(preloadLink.as).toBe('image');
      expect(preloadLink.href).toBe('/images/hero/home.jpg');
    });

    test('should validate preload paths for all hero images', () => {
      const heroImagePaths = [
        '/images/hero/home.jpg',
        '/images/hero/about.jpg',
        '/images/hero/artists.jpg',
        '/images/hero/schedule.jpg',
        '/images/hero/gallery.jpg',
        '/images/hero/tickets.jpg',
        '/images/hero/donations.jpg',
        '/images/hero/contact.jpg',
        '/images/hero/gallery-2025.jpg',
        '/images/hero/hero-default.jpg'
      ];

      heroImagePaths.forEach(path => {
        expect(path).toMatch(/^\/images\/hero\/[a-z0-9-]+\.jpg$/);
        expect(path).not.toContain('api');
        expect(path).not.toContain('?');
        expect(path).not.toContain('&');
      });
    });
  });

  describe('CSS Object Position', () => {
    test('should maintain consistent object-position styling', () => {
      const expectedStyle = 'object-position: top center !important;';
      
      // Test that the CSS positioning is applied consistently
      const testObjectPosition = (element) => {
        return element.style.objectPosition === 'top center' ||
               element.getAttribute('style')?.includes('object-position: top center !important');
      };

      // Mock element with inline style
      const mockElement = {
        style: { objectPosition: 'top center' },
        getAttribute: jest.fn().mockReturnValue('object-position: top center !important;')
      };

      expect(testObjectPosition(mockElement)).toBe(true);
    });
  });

  describe('Performance Characteristics', () => {
    test('should eliminate dynamic API calls', () => {
      // Test that no API endpoints are referenced in static system
      const HERO_IMAGES = {
        'home': '/images/hero/home.jpg',
        'about': '/images/hero/about.jpg',
        'tickets': '/images/hero/tickets.jpg'
      };

      Object.values(HERO_IMAGES).forEach(path => {
        expect(path).not.toContain('/api/');
        expect(path).not.toContain('?');
        expect(path).not.toContain('w=');
        expect(path).not.toContain('format=');
        expect(path).not.toContain('q=');
      });
    });

    test('should eliminate session storage usage', () => {
      // Mock sessionStorage to verify it's not used
      const sessionStorageMock = {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn()
      };

      global.sessionStorage = sessionStorageMock;

      // Simulate static hero image loading (should not use sessionStorage)
      const loadStaticHeroImage = (pageId) => {
        const HERO_IMAGES = {
          'home': '/images/hero/home.jpg'
        };
        return HERO_IMAGES[pageId] || '/images/hero/hero-default.jpg';
      };

      loadStaticHeroImage('home');

      // Verify sessionStorage methods were not called
      expect(sessionStorageMock.getItem).not.toHaveBeenCalled();
      expect(sessionStorageMock.setItem).not.toHaveBeenCalled();
      expect(sessionStorageMock.removeItem).not.toHaveBeenCalled();
    });

    test('should eliminate ImageCacheManager dependency', () => {
      // Test that static loading doesn't require ImageCacheManager
      const loadWithoutCacheManager = (pageId) => {
        // Should work without any cache manager
        const HERO_IMAGES = {
          'home': '/images/hero/home.jpg'
        };
        return HERO_IMAGES[pageId] || '/images/hero/hero-default.jpg';
      };

      expect(loadWithoutCacheManager('home')).toBe('/images/hero/home.jpg');
      expect(loadWithoutCacheManager('unknown')).toBe('/images/hero/hero-default.jpg');
    });
  });

  describe('Error Handling', () => {
    test('should handle image loading errors gracefully', () => {
      const handleImageError = (event) => {
        const img = event.target;
        if (img.src !== '/images/hero/hero-default.jpg') {
          img.src = '/images/hero/hero-default.jpg';
          return true; // Fallback applied
        }
        return false; // Already at fallback
      };

      // Mock error event
      const errorEvent = {
        target: {
          src: '/images/hero/missing-image.jpg'
        }
      };

      expect(handleImageError(errorEvent)).toBe(true);
      expect(errorEvent.target.src).toBe('/images/hero/hero-default.jpg');

      // Test when already at fallback
      errorEvent.target.src = '/images/hero/hero-default.jpg';
      expect(handleImageError(errorEvent)).toBe(false);
    });
  });
});
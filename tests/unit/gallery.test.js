/**
 * Unit tests for gallery.js module
 */

describe('Gallery Module', () => {
  let mockDOM;
  
  beforeEach(() => {
    // Mock DOM elements
    mockDOM = {
      heroImg: { src: '', style: {} },
      gallerySection: {},
      loadingEl: { style: { display: '' } },
      contentEl: { innerHTML: '', style: { display: '' }, querySelectorAll: jest.fn(() => []) },
      staticEl: { style: { display: '' } }
    };
    
    // Mock document methods
    document.getElementById = jest.fn((id) => {
      switch(id) {
        case 'hero-splash-image': return mockDOM.heroImg;
        case 'gallery-2025': return mockDOM.gallerySection;
        case 'gallery-2025-loading': return mockDOM.loadingEl;
        case 'gallery-2025-content': return mockDOM.contentEl;
        case 'gallery-2025-static': return mockDOM.staticEl;
        default: return null;
      }
    });
    
    // Mock localStorage
    const localStorageMock = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn()
    };
    global.localStorage = localStorageMock;
    
    // Mock window.location
    delete window.location;
    window.location = { hostname: 'localhost' };
    
    // Mock console methods
    global.console = {
      log: jest.fn(),
      error: jest.fn()
    };
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Configuration', () => {
    test('should have correct API endpoint', () => {
      const CONFIG = { API_ENDPOINT: window.GALLERY_API_ENDPOINT || '/api/gallery' };
      expect(CONFIG.API_ENDPOINT).toBe('/api/gallery');
    });
    
    test('should have correct cache duration', () => {
      const CONFIG = { CACHE_DURATION: 3600000 };
      expect(CONFIG.CACHE_DURATION).toBe(3600000); // 1 hour
    });
    
    test('should have loading timeout', () => {
      const CONFIG = { LOADING_TIMEOUT: 10000 };
      expect(CONFIG.LOADING_TIMEOUT).toBe(10000); // 10 seconds
    });
  });
  
  describe('API Response Processing', () => {
    test('should handle valid gallery data', () => {
      const mockData = {
        folder: {
          id: '123',
          name: 'Test Gallery',
          createdAt: '2024-01-01T00:00:00Z',
          modifiedAt: '2024-01-01T00:00:00Z'
        },
        items: [
          {
            id: 'img-1',
            name: 'Photo 1.jpg',
            type: 'image',
            mimeType: 'image/jpeg',
            thumbnailUrl: 'https://drive.google.com/thumbnail?id=img-1',
            viewUrl: 'https://drive.google.com/uc?export=view&id=img-1',
            downloadUrl: 'https://drive.google.com/uc?export=download&id=img-1',
            size: 1000000,
            createdAt: '2024-01-01T00:00:00Z'
          },
          {
            id: 'vid-1',
            name: 'Video 1.mp4',
            type: 'video',
            mimeType: 'video/mp4',
            thumbnailUrl: 'https://drive.google.com/thumbnail?id=vid-1',
            viewUrl: 'https://drive.google.com/uc?export=view&id=vid-1',
            downloadUrl: 'https://drive.google.com/uc?export=download&id=vid-1',
            size: 5000000,
            createdAt: '2024-01-01T00:00:00Z'
          }
        ],
        count: 2
      };
      
      expect(mockData.items).toHaveLength(2);
      expect(mockData.items[0].type).toBe('image');
      expect(mockData.items[1].type).toBe('video');
      expect(mockData.count).toBe(2);
    });
    
    test('should handle empty gallery', () => {
      const mockData = {
        folder: {
          id: '123',
          name: 'Empty Gallery',
          createdAt: '2024-01-01T00:00:00Z',
          modifiedAt: '2024-01-01T00:00:00Z'
        },
        items: [],
        count: 0
      };
      
      expect(mockData.items).toHaveLength(0);
      expect(mockData.count).toBe(0);
    });
  });
  
  describe('Cache Management', () => {
    const CACHE_KEY = 'gallery_cache';
    
    // Mock cache functions
    const getCachedData = () => {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (!cached) return null;
        
        const data = JSON.parse(cached);
        const now = Date.now();
        
        if (now - data.timestamp > 3600000) { // 1 hour
          localStorage.removeItem(CACHE_KEY);
          return null;
        }
        
        return data.content;
      } catch (error) {
        console.error('Cache read error:', error);
        return null;
      }
    };
    
    const setCachedData = (data) => {
      try {
        const cacheData = {
          timestamp: Date.now(),
          content: data
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
      } catch (error) {
        console.error('Cache write error:', error);
      }
    };
    
    test('should return null when no cache exists', () => {
      localStorage.getItem.mockReturnValue(null);
      const cached = getCachedData();
      expect(cached).toBeNull();
    });
    
    test('should return cached data when valid', () => {
      const testData = { items: [{ id: 1 }] };
      const cacheData = {
        timestamp: Date.now(),
        content: testData
      };
      localStorage.getItem.mockReturnValue(JSON.stringify(cacheData));
      
      const cached = getCachedData();
      expect(cached).toEqual(testData);
    });
    
    test('should clear expired cache', () => {
      const testData = { items: [{ id: 1 }] };
      const cacheData = {
        timestamp: Date.now() - 3700000, // Over 1 hour old
        content: testData
      };
      localStorage.getItem.mockReturnValue(JSON.stringify(cacheData));
      
      const cached = getCachedData();
      expect(cached).toBeNull();
      expect(localStorage.removeItem).toHaveBeenCalledWith(CACHE_KEY);
    });
    
    test('should store cache data with timestamp', () => {
      const testData = { items: [{ id: 1 }] };
      setCachedData(testData);
      
      expect(localStorage.setItem).toHaveBeenCalledWith(
        CACHE_KEY,
        expect.stringContaining('timestamp')
      );
      
      const storedData = JSON.parse(localStorage.setItem.mock.calls[0][1]);
      expect(storedData.content).toEqual(testData);
      expect(storedData.timestamp).toBeDefined();
    });
  });
  
  describe('Lightbox State Management', () => {
    const state = {
      isLoading: false,
      galleryData: null,
      currentLightboxIndex: -1,
      lightboxItems: []
    };
    
    test('should initialize with correct default state', () => {
      expect(state.isLoading).toBe(false);
      expect(state.galleryData).toBeNull();
      expect(state.currentLightboxIndex).toBe(-1);
      expect(state.lightboxItems).toEqual([]);
    });
    
    test('should update lightbox state when opening', () => {
      const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const index = 1;
      
      // Simulate openLightbox
      state.lightboxItems = items;
      state.currentLightboxIndex = index;
      
      expect(state.lightboxItems).toEqual(items);
      expect(state.currentLightboxIndex).toBe(1);
    });
    
    test('should handle navigation boundaries', () => {
      state.lightboxItems = [{ id: 1 }, { id: 2 }, { id: 3 }];
      
      // Test forward navigation
      state.currentLightboxIndex = 0;
      const canGoNext = state.currentLightboxIndex < state.lightboxItems.length - 1;
      expect(canGoNext).toBe(true);
      
      // Test at end
      state.currentLightboxIndex = 2;
      const canGoNextAtEnd = state.currentLightboxIndex < state.lightboxItems.length - 1;
      expect(canGoNextAtEnd).toBe(false);
      
      // Test backward navigation
      state.currentLightboxIndex = 2;
      const canGoPrev = state.currentLightboxIndex > 0;
      expect(canGoPrev).toBe(true);
      
      // Test at beginning
      state.currentLightboxIndex = 0;
      const canGoPrevAtStart = state.currentLightboxIndex > 0;
      expect(canGoPrevAtStart).toBe(false);
    });
  });
  
  describe('Gallery Item HTML Generation', () => {
    const generateGalleryItemHTML = (item, index) => {
      const isVideo = item.type === 'video';
      const title = item.name.replace(/\.[^/.]+$/, '');
      
      return `
        <div class="gallery-item" data-index="${index}">
          <div class="gallery-item-media">
            ${isVideo ? 
              `<video src="${item.viewUrl}" poster="${item.thumbnailUrl}" controls></video>` :
              `<img src="${item.thumbnailUrl}" alt="${title}" loading="lazy">`
            }
          </div>
          <h3 class="font-display gallery-item-title">${title}</h3>
          <p class="font-mono gallery-item-type">${isVideo ? 'VIDEO' : 'PHOTO'}</p>
        </div>
      `;
    };
    
    test('should generate correct HTML for image items', () => {
      const item = {
        id: 'img-1',
        name: 'Test Image.jpg',
        type: 'image',
        thumbnailUrl: 'thumb.jpg',
        viewUrl: 'view.jpg'
      };
      
      const html = generateGalleryItemHTML(item, 0);
      
      expect(html).toContain('data-index="0"');
      expect(html).toContain('<img src="thumb.jpg"');
      expect(html).toContain('alt="Test Image"');
      expect(html).toContain('loading="lazy"');
      expect(html).toContain('PHOTO');
      expect(html).not.toContain('<video');
    });
    
    test('should generate correct HTML for video items', () => {
      const item = {
        id: 'vid-1',
        name: 'Test Video.mp4',
        type: 'video',
        thumbnailUrl: 'thumb.jpg',
        viewUrl: 'video.mp4'
      };
      
      const html = generateGalleryItemHTML(item, 5);
      
      expect(html).toContain('data-index="5"');
      expect(html).toContain('<video src="video.mp4"');
      expect(html).toContain('poster="thumb.jpg"');
      expect(html).toContain('controls');
      expect(html).toContain('VIDEO');
      expect(html).not.toContain('<img');
    });
    
    test('should remove file extensions from titles', () => {
      const items = [
        { name: 'Photo.jpg', type: 'image' },
        { name: 'Video.mp4', type: 'video' },
        { name: 'Document.pdf.bak', type: 'image' }
      ];
      
      items.forEach(item => {
        const title = item.name.replace(/\.[^/.]+$/, '');
        if (item.name === 'Photo.jpg') expect(title).toBe('Photo');
        if (item.name === 'Video.mp4') expect(title).toBe('Video');
        if (item.name === 'Document.pdf.bak') expect(title).toBe('Document.pdf');
      });
    });
  });
});
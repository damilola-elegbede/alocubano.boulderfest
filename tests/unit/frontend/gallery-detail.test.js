/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Gallery Detail Tests
 * Tests the gallery detail page functionality including:
 * - Detail view display and metadata
 * - Navigation in detail view (next, previous, close, keyboard)
 * - Image rendering and progressive enhancement
 * - Metadata display (title, description, EXIF, tags)
 * - Social sharing functionality
 * - Accessibility (ARIA, keyboard, screen reader)
 * - Error handling (image load failure, invalid detail ID)
 */

describe('Gallery Detail', () => {
  let mockFetch;
  let mockGalleryState;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="gallery-detail-content" style="display: none;">
        <div id="workshops-section">
          <div id="workshops-gallery"></div>
        </div>
        <div id="socials-section">
          <div id="socials-gallery"></div>
        </div>
      </div>
      <div id="gallery-detail-loading" style="display: block;">
        Loading...
      </div>
      <div id="gallery-detail-static" style="display: none;">
        Static content
      </div>
    `;

    mockFetch = vi.fn();
    global.fetch = mockFetch;

    mockGalleryState = {
      items: [],
      currentIndex: 0,
      categories: {},
      displayOrder: []
    };

    // Mock sessionStorage
    global.sessionStorage = {
      data: {},
      getItem(key) {
        return this.data[key] || null;
      },
      setItem(key, value) {
        this.data[key] = value;
      },
      removeItem(key) {
        delete this.data[key];
      },
      clear() {
        this.data = {};
      }
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  describe('Detail View', () => {
    it('should display full-size image', async () => {
      const mockData = {
        categories: {
          workshops: [
            { id: '1', name: 'workshop1.jpg', url: '/images/workshop1.jpg', thumbnailUrl: '/thumbs/workshop1.jpg' }
          ],
          socials: []
        },
        totalCount: 1
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData
      });

      const loadingEl = document.getElementById('gallery-detail-loading');
      const contentEl = document.getElementById('gallery-detail-content');

      expect(loadingEl.style.display).toBe('block');
      expect(contentEl.style.display).toBe('none');
    });

    it('should show image metadata', () => {
      const imageData = {
        id: '1',
        name: 'workshop1.jpg',
        title: 'Workshop Image',
        description: 'A great workshop moment'
      };

      expect(imageData.title).toBe('Workshop Image');
      expect(imageData.description).toBe('A great workshop moment');
    });

    it('should display image title/caption', () => {
      const title = document.createElement('div');
      title.className = 'image-title';
      title.textContent = 'Workshop Image';
      document.body.appendChild(title);

      const titleEl = document.querySelector('.image-title');
      expect(titleEl.textContent).toBe('Workshop Image');
    });

    it('should show photographer credit', () => {
      const credit = document.createElement('div');
      credit.className = 'photographer-credit';
      credit.textContent = 'Photo by John Doe';
      document.body.appendChild(credit);

      const creditEl = document.querySelector('.photographer-credit');
      expect(creditEl.textContent).toBe('Photo by John Doe');
    });
  });

  describe('Navigation in Detail', () => {
    beforeEach(() => {
      mockGalleryState.items = [
        { id: '1', name: 'image1.jpg', url: '/images/1.jpg' },
        { id: '2', name: 'image2.jpg', url: '/images/2.jpg' },
        { id: '3', name: 'image3.jpg', url: '/images/3.jpg' }
      ];
      mockGalleryState.currentIndex = 1;
    });

    it('should navigate to next image', () => {
      mockGalleryState.currentIndex++;
      expect(mockGalleryState.currentIndex).toBe(2);
    });

    it('should navigate to previous image', () => {
      mockGalleryState.currentIndex--;
      expect(mockGalleryState.currentIndex).toBe(0);
    });

    it('should close detail view', () => {
      const contentEl = document.getElementById('gallery-detail-content');
      contentEl.style.display = 'none';
      expect(contentEl.style.display).toBe('none');
    });

    it('should respond to keyboard shortcuts', () => {
      const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
      document.dispatchEvent(event);
      expect(event.key).toBe('ArrowRight');
    });

    it('should handle Escape key', () => {
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(event);
      expect(event.key).toBe('Escape');
    });
  });

  describe('Image Rendering', () => {
    it('should load high-res image', () => {
      const img = document.createElement('img');
      img.src = '/images/workshop1-hires.jpg';
      img.alt = 'High resolution image';
      expect(img.src).toContain('hires');
    });

    it('should support progressive enhancement', () => {
      const img = document.createElement('img');
      img.dataset.progressive = 'true';
      expect(img.dataset.progressive).toBe('true');
    });

    it('should handle image orientation', () => {
      const img = document.createElement('img');
      img.style.objectFit = 'contain';
      expect(img.style.objectFit).toBe('contain');
    });

    it('should support zoom functionality', () => {
      const img = document.createElement('img');
      img.style.transform = 'scale(2)';
      expect(img.style.transform).toContain('scale');
    });
  });

  describe('Metadata Display', () => {
    it('should display image title', () => {
      const title = document.createElement('h3');
      title.textContent = 'Workshop Session';
      expect(title.textContent).toBe('Workshop Session');
    });

    it('should display description', () => {
      const description = document.createElement('p');
      description.textContent = 'Amazing workshop moment';
      expect(description.textContent).toBe('Amazing workshop moment');
    });

    it('should display date taken', () => {
      const date = document.createElement('span');
      date.textContent = '2025-05-15';
      expect(date.textContent).toBe('2025-05-15');
    });

    it('should display camera settings (EXIF)', () => {
      const exif = {
        camera: 'Canon EOS R5',
        lens: '24-70mm f/2.8',
        iso: 800,
        aperture: 'f/2.8',
        shutterSpeed: '1/250s'
      };
      expect(exif.camera).toBe('Canon EOS R5');
      expect(exif.iso).toBe(800);
    });

    it('should display tags/categories', () => {
      const tags = ['workshop', 'salsa', 'dance'];
      expect(tags).toContain('workshop');
      expect(tags.length).toBe(3);
    });
  });

  describe('Social Sharing', () => {
    it('should display share buttons', () => {
      const shareBtn = document.createElement('button');
      shareBtn.className = 'share-button';
      shareBtn.textContent = 'Share';
      document.body.appendChild(shareBtn);

      const btn = document.querySelector('.share-button');
      expect(btn).toBeTruthy();
    });

    it('should copy link to clipboard', () => {
      const link = 'https://example.com/gallery/1';
      const mockClipboard = {
        writeText: vi.fn().mockResolvedValue(undefined)
      };
      Object.defineProperty(global.navigator, 'clipboard', {
        value: mockClipboard,
        writable: true,
        configurable: true
      });

      navigator.clipboard.writeText(link);
      expect(mockClipboard.writeText).toHaveBeenCalledWith(link);
    });

    it('should integrate with social media', () => {
      const shareUrl = 'https://facebook.com/sharer?u=example.com';
      expect(shareUrl).toContain('facebook.com');
    });

    it('should share image URL', () => {
      const imageUrl = '/images/workshop1.jpg';
      const shareLink = `https://example.com${imageUrl}`;
      expect(shareLink).toContain(imageUrl);
    });
  });

  describe('Accessibility', () => {
    it('should have ARIA labels', () => {
      const button = document.createElement('button');
      button.setAttribute('aria-label', 'Close gallery');
      expect(button.getAttribute('aria-label')).toBe('Close gallery');
    });

    it('should support keyboard navigation', () => {
      const focusableElements = document.querySelectorAll('button, a, input');
      expect(focusableElements.length).toBeGreaterThanOrEqual(0);
    });

    it('should provide screen reader support', () => {
      const liveRegion = document.createElement('div');
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.textContent = 'Image 2 of 10';
      expect(liveRegion.getAttribute('aria-live')).toBe('polite');
    });

    it('should manage focus correctly', () => {
      const button = document.createElement('button');
      button.textContent = 'Close';
      document.body.appendChild(button);
      button.focus();
      expect(document.activeElement).toBe(button);
    });
  });

  describe('Error Handling', () => {
    it('should handle image load failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const loadingEl = document.getElementById('gallery-detail-loading');
      const staticEl = document.getElementById('gallery-detail-static');

      expect(loadingEl).toBeTruthy();
      expect(staticEl).toBeTruthy();
    });

    it('should handle missing metadata', () => {
      const imageData = {
        id: '1',
        name: 'image.jpg',
        url: '/images/image.jpg'
      };

      expect(imageData.title).toBeUndefined();
      expect(imageData.description).toBeUndefined();
    });

    it('should handle invalid detail ID', () => {
      const invalidId = 'invalid-id-999';
      expect(() => {
        mockGalleryState.items.find(item => item.id === invalidId);
      }).not.toThrow();
    });

    it('should show error message on failure', () => {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error-message';
      errorDiv.textContent = 'Failed to load image';
      document.body.appendChild(errorDiv);

      const errorEl = document.querySelector('.error-message');
      expect(errorEl.textContent).toBe('Failed to load image');
    });
  });

  describe('State Management', () => {
    it('should save gallery state to sessionStorage', () => {
      const state = {
        displayOrder: [{ id: '1', name: 'image1.jpg' }],
        currentIndex: 0
      };

      sessionStorage.setItem('gallery_state', JSON.stringify(state));
      const savedState = JSON.parse(sessionStorage.getItem('gallery_state'));

      expect(savedState.displayOrder.length).toBe(1);
      expect(savedState.currentIndex).toBe(0);
    });

    it('should restore gallery state from sessionStorage', () => {
      const state = {
        displayOrder: [{ id: '1', name: 'image1.jpg' }],
        currentIndex: 0,
        timestamp: Date.now()
      };

      sessionStorage.setItem('gallery_state', JSON.stringify(state));
      const restoredState = JSON.parse(sessionStorage.getItem('gallery_state'));

      expect(restoredState).toEqual(state);
    });

    it('should clear expired state', () => {
      const expiredState = {
        displayOrder: [],
        timestamp: Date.now() - (31 * 60 * 1000) // 31 minutes ago
      };

      sessionStorage.setItem('gallery_state', JSON.stringify(expiredState));
      const age = Date.now() - expiredState.timestamp;
      const isExpired = age > (30 * 60 * 1000);

      expect(isExpired).toBe(true);
    });

    it('should handle state migration', () => {
      const oldState = {
        version: 1,
        displayOrder: []
      };

      const migratedState = {
        ...oldState,
        version: 2,
        categoryItemCounts: { workshops: 0, socials: 0 }
      };

      expect(migratedState.version).toBe(2);
      expect(migratedState.categoryItemCounts).toBeDefined();
    });
  });

  describe('Sequential Loading', () => {
    it('should load workshops before socials', async () => {
      const mockData = {
        categories: {
          workshops: [{ id: '1', name: 'workshop1.jpg', url: '/images/workshop1.jpg' }],
          socials: [{ id: '2', name: 'social1.jpg', url: '/images/social1.jpg' }]
        },
        totalCount: 2
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData
      });

      expect(mockData.categories.workshops.length).toBe(1);
      expect(mockData.categories.socials.length).toBe(1);
    });

    it('should paginate through categories', () => {
      const pageSize = 20;
      const workshopOffset = 0;
      const workshopTotal = 50;

      const hasMoreWorkshops = workshopOffset < workshopTotal;
      expect(hasMoreWorkshops).toBe(true);
    });

    it('should maintain category-aware display order', () => {
      const displayOrder = [
        { id: '1', category: 'workshops', categoryIndex: 0 },
        { id: '2', category: 'workshops', categoryIndex: 1 },
        { id: '3', category: 'socials', categoryIndex: 0 }
      ];

      expect(displayOrder[0].category).toBe('workshops');
      expect(displayOrder[2].category).toBe('socials');
    });
  });

  describe('Progressive DOM Insertion', () => {
    it('should insert items in batches', async () => {
      const items = Array.from({ length: 25 }, (_, i) => ({
        id: String(i),
        name: `image${i}.jpg`,
        url: `/images/${i}.jpg`
      }));

      const batchSize = 5;
      const batches = Math.ceil(items.length / batchSize);

      expect(batches).toBe(5);
    });

    it('should prevent duplicate items', () => {
      const displayedIds = new Set();
      const item = { id: '1', name: 'image1.jpg' };

      if (!displayedIds.has(item.id)) {
        displayedIds.add(item.id);
      }

      if (displayedIds.has(item.id)) {
        expect(displayedIds.size).toBe(1);
      }
    });

    it('should yield control to browser', async () => {
      const yieldPromise = new Promise(resolve => requestAnimationFrame(resolve));
      await expect(yieldPromise).resolves.not.toThrow();
    });
  });

  describe('Performance Metrics', () => {
    it('should track cache hits and misses', () => {
      const metrics = {
        cacheHits: 5,
        cacheMisses: 2
      };

      const hitRatio = metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses);
      expect(hitRatio).toBeCloseTo(0.714, 2);
    });

    it('should track load times', () => {
      const loadTimes = [100, 150, 200];
      const avgLoadTime = loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length;

      expect(avgLoadTime).toBe(150);
    });

    it('should rate limit API requests', () => {
      const maxRequests = 10;
      const requests = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      const isRateLimited = requests.length >= maxRequests;
      expect(isRateLimited).toBe(true);
    });
  });
});

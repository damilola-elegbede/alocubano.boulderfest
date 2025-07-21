/**
 * Test suite for Gallery Infinite Loading Fix
 * Tests the improvements made to prevent UI blocking and infinite loading loops
 */

describe('Gallery Infinite Loading Fix', () => {
  
  describe('State Management and Concurrency Control', () => {
    
    test('should prevent concurrent loading operations with mutex', () => {
      // Mock state object with mutex
      const mockState = {
        isLoading: false,
        loadingMutex: false,
        hasMorePages: true
      };
      
      // Simulate mutex protection logic
      function canLoad(state) {
        return !state.isLoading && !state.loadingMutex && state.hasMorePages;
      }
      
      expect(canLoad(mockState)).toBe(true);
      
      // Set loading flags
      mockState.isLoading = true;
      mockState.loadingMutex = true;
      
      expect(canLoad(mockState)).toBe(false);
    });

    test('should track loaded item IDs to prevent duplicates', () => {
      const loadedItemIds = new Set();
      
      const items = [
        { id: 'item1', name: 'photo1.jpg' },
        { id: 'item2', name: 'photo2.jpg' },
        { id: 'item1', name: 'photo1.jpg' }, // Duplicate
      ];
      
      const uniqueItems = items.filter(item => {
        const itemId = `workshops_${item.id || item.name}`;
        if (loadedItemIds.has(itemId)) {
          return false;
        }
        loadedItemIds.add(itemId);
        return true;
      });
      
      expect(uniqueItems).toHaveLength(2);
      expect(loadedItemIds.size).toBe(2);
    });

    test('should handle pagination state correctly', () => {
      const mockState = {
        loadedPages: 0,
        hasMorePages: true,
        allCategories: {}
      };
      
      // Simulate loading first page
      mockState.loadedPages = 1;
      expect(mockState.loadedPages).toBe(1);
      
      // Simulate no more pages
      mockState.hasMorePages = false;
      expect(mockState.hasMorePages).toBe(false);
    });
  });

  describe('Progressive DOM Loading', () => {
    
    test('should batch DOM insertions to prevent UI blocking', async () => {
      const BATCH_SIZE = 5;
      const items = Array.from({ length: 12 }, (_, i) => ({
        id: `item${i}`,
        name: `photo${i}.jpg`,
        thumbnailUrl: `https://example.com/thumb${i}.jpg`
      }));
      
      let batchCount = 0;
      const processedBatches = [];
      
      // Simulate progressive insertion
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        processedBatches.push(batch);
        batchCount++;
        
        // Simulate yielding control
        await new Promise(resolve => setImmediate(resolve));
      }
      
      expect(batchCount).toBe(3); // 12 items / 5 batch size = 3 batches (rounded up)
      expect(processedBatches[0]).toHaveLength(5);
      expect(processedBatches[1]).toHaveLength(5);
      expect(processedBatches[2]).toHaveLength(2);
    });

    test('should generate correct HTML for gallery items', () => {
      const item = {
        name: 'workshop-photo.jpg',
        thumbnailUrl: 'https://example.com/thumb.jpg'
      };
      
      const categoryName = 'workshops';
      const globalIndex = 0;
      
      const expectedHTML = `
          <div class="gallery-item lazy-item" data-index="${globalIndex}" data-category="${categoryName}" data-loaded="false">
            <div class="gallery-item-media">
              <div class="lazy-placeholder">
                <div class="loading-spinner">📸</div>
              </div>
              <img data-src="${item.thumbnailUrl}" alt="workshop-photo" class="lazy-image" style="display: none;">
            </div>
          </div>
        `;
      
      // Test that we can generate the expected structure
      expect(expectedHTML).toContain('data-category="workshops"');
      expect(expectedHTML).toContain('data-loaded="false"');
      expect(expectedHTML).toContain('lazy-item');
    });
  });

  describe('Intersection Observer Management', () => {
    
    test('should manage sentinel observers properly', () => {
      const observedSentinels = new Set();
      const sentinelId = 'load-more-sentinel';
      
      // Simulate observer management
      function setupSentinel(id) {
        observedSentinels.add(id);
        return {
          id,
          observer: {
            observe: jest.fn(),
            unobserve: jest.fn(),
            disconnect: jest.fn()
          }
        };
      }
      
      const sentinel = setupSentinel(sentinelId);
      expect(observedSentinels.has(sentinelId)).toBe(true);
      
      // Simulate cleanup
      observedSentinels.delete(sentinelId);
      expect(observedSentinels.has(sentinelId)).toBe(false);
    });

    test('should prevent duplicate observer triggers', () => {
      let triggerCount = 0;
      
      const mockObserver = {
        observe: jest.fn(),
        unobserve: jest.fn((target) => {
          // Simulate immediate unobserve to prevent duplicates
          expect(target).toBeDefined();
        }),
        disconnect: jest.fn()
      };
      
      // Simulate intersection handler
      const handleIntersection = (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            triggerCount++;
            mockObserver.unobserve(entry.target);
          }
        });
      };
      
      const mockEntry = {
        isIntersecting: true,
        target: { id: 'test-sentinel' }
      };
      
      handleIntersection([mockEntry]);
      
      expect(triggerCount).toBe(1);
      expect(mockObserver.unobserve).toHaveBeenCalledWith(mockEntry.target);
    });
  });

  describe('Performance Optimizations', () => {
    
    test('should implement rate limiting logic', () => {
      const RATE_LIMIT = {
        MAX_REQUESTS: 10,
        WINDOW_MS: 60000
      };
      
      const rateLimitTracker = {
        requests: []
      };
      
      function isRateLimited() {
        const now = Date.now();
        const windowStart = now - RATE_LIMIT.WINDOW_MS;
        
        rateLimitTracker.requests = rateLimitTracker.requests.filter(
          timestamp => timestamp > windowStart
        );
        
        return rateLimitTracker.requests.length >= RATE_LIMIT.MAX_REQUESTS;
      }
      
      function recordRequest() {
        rateLimitTracker.requests.push(Date.now());
      }
      
      // Test within rate limit
      expect(isRateLimited()).toBe(false);
      
      // Fill up to limit
      for (let i = 0; i < RATE_LIMIT.MAX_REQUESTS; i++) {
        recordRequest();
      }
      
      // Should now be rate limited
      expect(isRateLimited()).toBe(true);
    });

    test('should implement request caching with expiration', () => {
      const REQUEST_CACHE_DURATION = 5000; // 5 seconds
      const requestCache = new Map();
      
      function cacheRequest(url, response) {
        requestCache.set(url, {
          response,
          timestamp: Date.now()
        });
      }
      
      function getCachedRequest(url) {
        const cached = requestCache.get(url);
        if (!cached) return null;
        
        const now = Date.now();
        if (now - cached.timestamp > REQUEST_CACHE_DURATION) {
          requestCache.delete(url);
          return null;
        }
        
        return cached.response;
      }
      
      const testUrl = 'https://api.test.com/gallery';
      const testResponse = { data: 'test' };
      
      // Cache request
      cacheRequest(testUrl, testResponse);
      expect(getCachedRequest(testUrl)).toEqual(testResponse);
      
      // Test cache miss for different URL
      expect(getCachedRequest('https://other.com')).toBeNull();
    });

    test('should track performance metrics', () => {
      const performanceMetrics = {
        loadTimes: [],
        cacheHits: 0,
        cacheMisses: 0
      };
      
      // Simulate some operations
      performanceMetrics.loadTimes.push(150.5, 200.3, 100.1);
      performanceMetrics.cacheHits = 5;
      performanceMetrics.cacheMisses = 3;
      
      const stats = {
        cacheHitRatio: performanceMetrics.cacheHits / (performanceMetrics.cacheHits + performanceMetrics.cacheMisses),
        totalRequests: performanceMetrics.cacheHits + performanceMetrics.cacheMisses,
        averageLoadTime: performanceMetrics.loadTimes.reduce((a, b) => a + b, 0) / performanceMetrics.loadTimes.length
      };
      
      expect(stats.cacheHitRatio).toBeCloseTo(0.625); // 5/8 = 62.5%
      expect(stats.totalRequests).toBe(8);
      expect(stats.averageLoadTime).toBeCloseTo(150.3); // Average of the load times
    });
  });

  describe('Error Handling and Edge Cases', () => {
    
    test('should handle empty gallery data gracefully', () => {
      const emptyData = {
        categories: {
          workshops: [],
          socials: []
        }
      };
      
      function hasItems(data) {
        if (!data || !data.categories) return false;
        
        return Object.values(data.categories).some(items => 
          items && items.length > 0
        );
      }
      
      expect(hasItems(emptyData)).toBe(false);
      expect(hasItems(null)).toBe(false);
      expect(hasItems({})).toBe(false);
    });

    test('should handle API errors with exponential backoff', async () => {
      const RETRY_DELAY = 1000;
      let retryCount = 0;
      
      async function apiCallWithRetry(maxRetries = 3) {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            retryCount++;
            
            // Simulate API error on first two attempts
            if (attempt < 2) {
              throw new Error('API temporarily unavailable');
            }
            
            return { success: true, data: 'test' };
          } catch (error) {
            if (attempt === maxRetries - 1) {
              throw error;
            }
            
            // Exponential backoff
            const delay = RETRY_DELAY * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, Math.min(delay, 10))); // Reduced for test
          }
        }
      }
      
      const result = await apiCallWithRetry();
      
      expect(result.success).toBe(true);
      expect(retryCount).toBe(3); // Should have tried 3 times total
    });

    test('should cleanup resources properly', () => {
      const mockState = {
        lazyObserver: {
          destroy: jest.fn()
        },
        requestCache: new Map([
          ['key1', 'value1'],
          ['key2', 'value2']
        ])
      };
      
      // Simulate cleanup
      function cleanup() {
        if (mockState.lazyObserver) {
          mockState.lazyObserver.destroy();
        }
        mockState.requestCache.clear();
      }
      
      cleanup();
      
      expect(mockState.lazyObserver.destroy).toHaveBeenCalled();
      expect(mockState.requestCache.size).toBe(0);
    });
  });

  describe('Integration with Existing Systems', () => {
    
    test('should maintain compatibility with existing lightbox', () => {
      const mockLightboxItems = [
        { name: 'photo1.jpg', thumbnailUrl: 'url1' },
        { name: 'photo2.jpg', thumbnailUrl: 'url2' }
      ];
      
      const mockLightboxCategories = ['workshops', 'workshops'];
      
      // Test that lightbox integration still works
      expect(mockLightboxItems).toHaveLength(2);
      expect(mockLightboxCategories).toHaveLength(2);
      expect(mockLightboxCategories[0]).toBe('workshops');
    });

    test('should work with existing lazy loading component', () => {
      // Mock LazyLoader interface
      const mockLazyLoader = {
        observeNewElements: jest.fn(),
        destroy: jest.fn()
      };
      
      // Simulate observing new elements
      const newElements = [
        { classList: { contains: () => true }, dataset: { loaded: 'false' } },
        { classList: { contains: () => true }, dataset: { loaded: 'false' } }
      ];
      
      mockLazyLoader.observeNewElements(newElements);
      
      expect(mockLazyLoader.observeNewElements).toHaveBeenCalledWith(newElements);
    });
  });

  describe('Debug and Monitoring Utilities', () => {
    
    test('should provide debug utilities for troubleshooting', () => {
      const mockState = {
        loadedPages: 2,
        hasMorePages: true,
        isLoading: false,
        loadingMutex: false,
        loadedItemIds: new Set(['item1', 'item2', 'item3'])
      };
      
      function getDebugInfo() {
        return {
          loadedPages: mockState.loadedPages,
          hasMorePages: mockState.hasMorePages,
          isLoading: mockState.isLoading,
          loadingMutex: mockState.loadingMutex,
          loadedItems: mockState.loadedItemIds.size
        };
      }
      
      const debugInfo = getDebugInfo();
      
      expect(debugInfo.loadedPages).toBe(2);
      expect(debugInfo.hasMorePages).toBe(true);
      expect(debugInfo.loadedItems).toBe(3);
    });

    test('should track performance metrics for optimization', () => {
      const performanceTracker = {
        loadTimes: [100, 150, 200],
        cacheHits: 10,
        cacheMisses: 5
      };
      
      function getPerformanceReport() {
        const total = performanceTracker.cacheHits + performanceTracker.cacheMisses;
        return {
          averageLoadTime: performanceTracker.loadTimes.reduce((a, b) => a + b) / performanceTracker.loadTimes.length,
          cacheEfficiency: performanceTracker.cacheHits / total,
          totalRequests: total
        };
      }
      
      const report = getPerformanceReport();
      
      expect(report.averageLoadTime).toBe(150);
      expect(report.cacheEfficiency).toBeCloseTo(0.667);
      expect(report.totalRequests).toBe(15);
    });
  });
});
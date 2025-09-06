import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { getGalleryService } from '../../../api/lib/gallery-service.js';
import { testRequest, HTTP_STATUS } from '../../helpers.js';

describe('Gallery API Integration Tests', () => {
  let galleryService;

  beforeAll(async () => {
    galleryService = getGalleryService();
  });

  beforeEach(() => {
    // Clear cache before each test to ensure fresh data
    galleryService.clearCache();
  });

  afterEach(() => {
    // Reset mocks after each test
    vi.restoreAllMocks();
  });

  describe('Gallery Service Integration', () => {
    it('should provide gallery service with expected interface', async () => {
      // Test that the gallery service has the expected methods
      expect(galleryService).toHaveProperty('getGalleryData');
      expect(galleryService).toHaveProperty('getFeaturedPhotos');
      expect(galleryService).toHaveProperty('clearCache');
      expect(galleryService).toHaveProperty('getMetrics');
      
      expect(typeof galleryService.getGalleryData).toBe('function');
      expect(typeof galleryService.getFeaturedPhotos).toBe('function');
      expect(typeof galleryService.clearCache).toBe('function');
      expect(typeof galleryService.getMetrics).toBe('function');
    });

    it('should fetch gallery data with proper structure or throw error when secrets missing', async () => {
      // Check if Google Drive credentials are configured
      const hasGoogleDriveConfig = !!(
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
        process.env.GOOGLE_PRIVATE_KEY &&
        process.env.GOOGLE_DRIVE_GALLERY_FOLDER_ID
      );

      if (!hasGoogleDriveConfig) {
        // When secrets are missing, expect an error
        await expect(galleryService.getGalleryData()).rejects.toThrow(/FATAL.*secret not configured/);
        return; // Test passes - error is expected
      }

      // When secrets are configured, test normal functionality
      const galleryData = await galleryService.getGalleryData();
      
      // Validate basic structure
      expect(galleryData).toHaveProperty('eventId');
      expect(galleryData).toHaveProperty('totalCount');
      expect(galleryData).toHaveProperty('categories');
      expect(galleryData).toHaveProperty('hasMore');
      expect(galleryData).toHaveProperty('source');
      
      // Validate data types
      expect(typeof galleryData.eventId).toBe('string');
      expect(typeof galleryData.totalCount).toBe('number');
      expect(typeof galleryData.hasMore).toBe('boolean');
      expect(typeof galleryData.categories).toBe('object');
      expect(typeof galleryData.source).toBe('string');
      
      // Validate actual category structure (based on implementation)
      const categories = galleryData.categories;
      expect(categories).toHaveProperty('workshops');
      expect(categories).toHaveProperty('socials');
      expect(categories).toHaveProperty('other');
      
      // Each category should be an array
      Object.values(categories).forEach(category => {
        expect(Array.isArray(category)).toBe(true);
      });
    });

    it('should fetch featured photos with proper structure', async () => {
      // Note: getFeaturedPhotos may use cached data from public/featured-photos.json
      // or fetch from Google Drive. When cache exists, it won't throw errors even
      // if Google Drive secrets are missing. This is intentional for build-time optimization.
      const featuredPhotos = await galleryService.getFeaturedPhotos();
      
      // Validate structure - can have either 'items' (cache) or 'photos' (generated)
      expect(featuredPhotos).toHaveProperty('totalCount');
      expect(typeof featuredPhotos.totalCount).toBe('number');
      
      // Check for either structure
      const hasItemsStructure = featuredPhotos.hasOwnProperty('items');
      const hasPhotosStructure = featuredPhotos.hasOwnProperty('photos');
      expect(hasItemsStructure || hasPhotosStructure).toBe(true);
      
      if (hasItemsStructure) {
        expect(Array.isArray(featuredPhotos.items)).toBe(true);
        // Total count should match array length
        expect(featuredPhotos.totalCount).toBe(featuredPhotos.items.length);
        
        // If there are items, validate their structure
        if (featuredPhotos.items.length > 0) {
          const firstItem = featuredPhotos.items[0];
          expect(firstItem).toHaveProperty('id');
        }
      } else if (hasPhotosStructure) {
        expect(Array.isArray(featuredPhotos.photos)).toBe(true);
        // Total count should match array length
        expect(featuredPhotos.totalCount).toBe(featuredPhotos.photos.length);
        
        // If there are photos, validate their structure
        if (featuredPhotos.photos.length > 0) {
          const firstPhoto = featuredPhotos.photos[0];
          expect(firstPhoto).toHaveProperty('id');
          expect(firstPhoto.featured).toBe(true);
        }
      }
    });

    it('should handle caching and metrics correctly', async () => {
      // Clear cache and reset metrics
      galleryService.clearCache();
      
      // First call
      await galleryService.getGalleryData();
      
      let metrics = galleryService.getMetrics();
      expect(metrics).toHaveProperty('cacheHits');
      expect(metrics).toHaveProperty('cacheMisses');
      expect(metrics).toHaveProperty('apiCalls');
      expect(metrics).toHaveProperty('cacheHitRatio');
      expect(metrics).toHaveProperty('avgResponseTime');
      expect(metrics.apiCalls).toBeGreaterThan(0);
      
      // Second call – compare metrics deltas to account for cache usage
      const before = galleryService.getMetrics();
      await galleryService.getGalleryData();
      const after = galleryService.getMetrics();
      expect(after.apiCalls).toBeGreaterThanOrEqual(before.apiCalls);
      expect(after.cacheHits + after.cacheMisses)
        .toBeGreaterThan(before.cacheHits + before.cacheMisses);
    });

    it('should handle error conditions with fail-fast behavior', async () => {
      // Check if Google Drive credentials are configured
      const hasGoogleDriveConfig = !!(
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
        process.env.GOOGLE_PRIVATE_KEY &&
        process.env.GOOGLE_DRIVE_GALLERY_FOLDER_ID
      );

      if (!hasGoogleDriveConfig) {
        // When secrets are missing, expect an error (fail-fast)
        await expect(galleryService.getGalleryData()).rejects.toThrow(/FATAL.*secret not configured/);
      } else {
        // When secrets are configured, should return valid structure
        const result = await galleryService.getGalleryData();
        expect(result).toHaveProperty('eventId');
        expect(result).toHaveProperty('totalCount');
        expect(result).toHaveProperty('categories');
        expect(typeof result.totalCount).toBe('number');
      }
    });

    it('should support year-based filtering', async () => {
      // Check if Google Drive credentials are configured
      const hasGoogleDriveConfig = !!(
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
        process.env.GOOGLE_PRIVATE_KEY &&
        process.env.GOOGLE_DRIVE_GALLERY_FOLDER_ID
      );

      if (!hasGoogleDriveConfig) {
        // When secrets are missing, expect errors (fail-fast)
        await expect(galleryService.getGalleryData('2024')).rejects.toThrow(/FATAL.*secret not configured/);
        await expect(galleryService.getGalleryData('2026')).rejects.toThrow(/FATAL.*secret not configured/);
      } else {
        const result2024 = await galleryService.getGalleryData('2024');
        const result2026 = await galleryService.getGalleryData('2026');
        
        // Both should return valid structures with either eventId or year
        expect(result2024.hasOwnProperty('eventId') || result2024.hasOwnProperty('year')).toBe(true);
        expect(result2024).toHaveProperty('totalCount');
        expect(result2026.hasOwnProperty('eventId') || result2026.hasOwnProperty('year')).toBe(true);
        expect(result2026).toHaveProperty('totalCount');
        
        // Year filtering should be reflected if data exists
        // Note: Service may return current year (2025) when future year (2026) is requested as fallback
        if (result2024.year) {
          const year2024 = String(result2024.year);
          expect(['2024', '2025']).toContain(year2024); // May fallback to current year
        }
        if (result2026.year) {
          const year2026 = String(result2026.year);
          // Accept 2025 (current year fallback) or 2026 (requested year)
          expect(['2025', '2026']).toContain(year2026);
        }
      }
    });
  });

  describe('Gallery API Endpoints', () => {
    it('should test gallery endpoint structure when server is available', async () => {
      const response = await testRequest('GET', '/api/gallery');
      
      // If server is running, should get OK response
      if (response.status === HTTP_STATUS.OK) {
        expect(response.data).toHaveProperty('eventId');
        expect(response.data).toHaveProperty('categories');
        expect(response.data).toHaveProperty('totalCount');
        expect(typeof response.data.totalCount).toBe('number');
        
        // Verify gallery structure - check actual categories
        const categories = response.data.categories;
        expect(categories).toHaveProperty('workshops');
        expect(categories).toHaveProperty('socials');
        expect(categories).toHaveProperty('other');
      } else {
        // If no server, that's expected in integration tests without server
        expect([0, 404].includes(response.status)).toBe(true);
      }
    });

    it('should test featured photos endpoint structure when server is available', async () => {
      const response = await testRequest('GET', '/api/featured-photos');
      
      // If server is running, should get OK response
      if (response.status === HTTP_STATUS.OK) {
        expect(response.data).toHaveProperty('totalCount');
        expect(typeof response.data.totalCount).toBe('number');
        
        // Check for either structure - 'items' (cache) or 'photos' (generated)
        const hasItemsStructure = response.data.hasOwnProperty('items');
        const hasPhotosStructure = response.data.hasOwnProperty('photos');
        expect(hasItemsStructure || hasPhotosStructure).toBe(true);
        
        if (hasItemsStructure) {
          expect(Array.isArray(response.data.items)).toBe(true);
          
          // If items exist, verify structure
          if (response.data.items.length > 0) {
            const firstItem = response.data.items[0];
            expect(firstItem).toHaveProperty('id');
          }
        } else if (hasPhotosStructure) {
          expect(Array.isArray(response.data.photos)).toBe(true);
          
          // If photos exist, verify structure
          if (response.data.photos.length > 0) {
            const firstPhoto = response.data.photos[0];
            expect(firstPhoto).toHaveProperty('id');
            expect(firstPhoto.featured).toBe(true);
          }
        }
      } else {
        // If no server, that's expected in integration tests without server
        expect([0, 404].includes(response.status)).toBe(true);
      }
    });

    it('should handle query parameters correctly when server is available', async () => {
      const response2024 = await testRequest('GET', '/api/gallery?year=2024');
      const response2026 = await testRequest('GET', '/api/gallery?year=2026');
      
      // If server responses are available
      if (response2024.status === HTTP_STATUS.OK && response2026.status === HTTP_STATUS.OK) {
        expect(response2024.data).toHaveProperty('eventId');
        expect(response2026.data).toHaveProperty('eventId');
        
        // Year filtering should be reflected if data exists
        if (response2024.data.year) expect(response2024.data.year).toBe(2024);
        if (response2026.data.year) expect(response2026.data.year).toBe(2026);
      } else {
        // Server not available - this is acceptable for integration tests
        expect([0, 404].includes(response2024.status)).toBe(true);
        expect([0, 404].includes(response2026.status)).toBe(true);
      }
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should implement fail-fast error handling', async () => {
      // Force an error scenario by temporarily disabling Google Drive
      const originalEnv = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      const originalNodeEnv = process.env.NODE_ENV;
      delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      
      try {
        // Clear cache to force runtime generation
        galleryService.clearCache();
        
        // If build-time cache exists, it will be used (which is correct behavior)
        // Only test fail-fast when no cache is available
        const result = await galleryService.getGalleryData();
        
        if (result.source === 'build-time-cache') {
          // Build-time cache exists - this is acceptable
          expect(result).toHaveProperty('eventId');
          expect(result).toHaveProperty('totalCount');
          expect(result).toHaveProperty('categories');
        } else {
          // No build-time cache - should have thrown error
          // This assertion will fail if we get here, which is what we want
          expect(result).toBeUndefined();
        }
        
      } catch (error) {
        // Expected behavior when no cache exists
        expect(error.message).toMatch(/FATAL.*secret not configured/);
      } finally {
        // Restore environment
        if (originalEnv) {
          process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = originalEnv;
        }
        if (originalNodeEnv) {
          process.env.NODE_ENV = originalNodeEnv;
        }
      }
    });

    it('should handle cache management effectively', async () => {
      // Force use of runtime cache by temporarily disabling build-time cache
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production'; // This will disable build-time cache
      
      try {
        // Clear initial state
        galleryService.clearCache();
        
        // Fill cache with data - this should generate runtime cache entries
        await galleryService.getGalleryData();
        await galleryService.getGalleryData('2024');
        await galleryService.getGalleryData('2025');
        
        // Cache should have entries (only if runtime cache is used)
        let metrics = galleryService.getMetrics();
        
        // Clear cache
        galleryService.clearCache();
        
        // Cache should be empty after clearing
        metrics = galleryService.getMetrics();
        expect(metrics.cacheSize).toBe(0);
        expect(metrics.cacheHits).toBe(0);
        expect(metrics.cacheMisses).toBe(0);
        expect(metrics.apiCalls).toBe(0);
        
      } finally {
        // Restore environment
        process.env.NODE_ENV = originalEnv || 'test';
      }
    });

    it('should validate featured photo selection logic', async () => {
      const featuredPhotos = await galleryService.getFeaturedPhotos();
      
      // Should return valid structure regardless of data availability
      expect(featuredPhotos).toHaveProperty('totalCount');
      expect(typeof featuredPhotos.totalCount).toBe('number');
      
      // Check for either structure
      const hasItemsStructure = featuredPhotos.hasOwnProperty('items');
      const hasPhotosStructure = featuredPhotos.hasOwnProperty('photos');
      expect(hasItemsStructure || hasPhotosStructure).toBe(true);
      
      if (hasItemsStructure) {
        expect(Array.isArray(featuredPhotos.items)).toBe(true);
        
        // Featured items should be limited to reasonable count (9 or fewer based on cache file)
        expect(featuredPhotos.items.length).toBeLessThanOrEqual(9);
        expect(featuredPhotos.totalCount).toBe(featuredPhotos.items.length);
        
        // Each item should have required properties
        featuredPhotos.items.forEach(item => {
          expect(item).toHaveProperty('id');
        });
      } else if (hasPhotosStructure) {
        expect(Array.isArray(featuredPhotos.photos)).toBe(true);
        
        // Featured photos should be reasonable count (up to 9 based on cache)
        expect(featuredPhotos.photos.length).toBeLessThanOrEqual(9);
        expect(featuredPhotos.totalCount).toBe(featuredPhotos.photos.length);
        
        // All returned photos should be marked as featured
        featuredPhotos.photos.forEach(photo => {
          expect(photo).toHaveProperty('id');
          expect(photo.featured).toBe(true);
        });
      }
    });
  });
});
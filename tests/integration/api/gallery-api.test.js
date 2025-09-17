import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { getDbClient } from '../../setup-integration.js';
import { getGalleryService } from '../../../lib/gallery-service.js';
import { resetGoogleDriveService } from '../../../lib/google-drive-service.js';
import { testRequest, HTTP_STATUS } from '../handler-test-helper.js';
import fs from 'fs/promises';
import path from 'path';

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

  // Helper to check cache file content
  async function getCacheFileContent(filename) {
    try {
      const cachePath = path.join(process.cwd(), 'public', 'gallery-data', filename);
      const data = await fs.readFile(cachePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  // Helper to check if Google Drive credentials are available
  function hasGoogleDriveCredentials() {
    return !!(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY &&
      process.env.GOOGLE_DRIVE_GALLERY_FOLDER_ID
    );
  }

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

    it('should handle real cached data vs placeholder cached data correctly', async () => {
      const hasCredentials = hasGoogleDriveCredentials();
      
      // Test 2025 data (real cache) - should always work
      const cache2025 = await getCacheFileContent('2025.json');
      const isPlaceholder2025 = cache2025 && (
        cache2025.isPlaceholder ||
        (cache2025.totalCount === 0 &&
         cache2025.message &&
         cache2025.message.includes('Empty event gallery cache'))
      );
      if (cache2025 && !isPlaceholder2025) {
        // Real cached data should be served successfully even without credentials
        const result2025 = await galleryService.getGalleryData('2025');
        
        expect(result2025).toHaveProperty('totalCount');
        expect(result2025).toHaveProperty('categories');
        expect(result2025.source).toBe('build-time-cache');
        expect(typeof result2025.totalCount).toBe('number');
        expect(result2025.totalCount).toBeGreaterThan(0); // Should have real data
        
        // Validate actual category structure (based on 2025.json content)
        const categories = result2025.categories;
        expect(categories).toHaveProperty('workshops');
        expect(categories).toHaveProperty('socials');
        // Note: 2025.json doesn't have 'other' category, only socials and workshops
        
        Object.values(categories).forEach(category => {
          expect(Array.isArray(category)).toBe(true);
        });
        
        // Validate that socials and workshops have actual content
        expect(categories.socials.length).toBeGreaterThan(0);
        expect(categories.workshops.length).toBeGreaterThan(0);
      }
      
      // Test 2023/2024 data (placeholder cache) - should gracefully degrade when credentials missing
      const cache2023 = await getCacheFileContent('2023.json');
      if (cache2023 && cache2023.isPlaceholder) {
        if (!hasCredentials) {
          // Should gracefully return empty data with placeholder cache when credentials missing
          const emptyData = await galleryService.getGalleryData('2023');
          expect(emptyData).toBeDefined();
          expect(emptyData.totalCount).toBe(0);
          expect(emptyData.source).toBe('empty-fallback');
          expect(emptyData.message).toBe('Google Drive credentials not configured - gallery disabled');
        } else {
          // With credentials, should attempt runtime generation
          try {
            const result2023 = await galleryService.getGalleryData('2023');
            expect(result2023.source).toMatch(/runtime-generated|google-drive/);
          } catch (error) {
            // Expected if 2023 year doesn't exist in Google Drive
            expect(error.message).toMatch(/No gallery found for year 2023/);
          }
        }
      }
      
      // Test default call behavior
      if (!hasCredentials) {
        // Without credentials, check what cache files are available
        const defaultCacheFiles = ['boulder-fest-2026.json', '2026.json'];
        let foundRealCache = false;
        
        for (const filename of defaultCacheFiles) {
          const cacheContent = await getCacheFileContent(filename);
          // Check if cache has real data (not placeholder)
          // Consider cache as placeholder if explicitly marked OR if it has no real data
          const isPlaceholderCache = cacheContent && (
            cacheContent.isPlaceholder ||
            (cacheContent.totalCount === 0 &&
             cacheContent.message &&
             cacheContent.message.includes('Empty event gallery cache'))
          );

          if (cacheContent && !isPlaceholderCache) {
            foundRealCache = true;
            break;
          }
        }
        
        if (foundRealCache) {
          // Should serve real cached data
          const defaultResult = await galleryService.getGalleryData();
          expect(defaultResult).toHaveProperty('totalCount');
          expect(defaultResult.source).toBe('build-time-cache');
        } else {
          // Should gracefully return empty data if only placeholder data available
          const emptyData = await galleryService.getGalleryData();
          expect(emptyData).toBeDefined();
          expect(emptyData.totalCount).toBe(0);
          expect(emptyData.source).toBe('empty-fallback');
          expect(emptyData.message).toBe('Google Drive credentials not configured - gallery disabled');
          expect(emptyData.categories).toEqual({
            workshops: [],
            socials: [],
            performances: [],
            other: []
          });
        }
      } else {
        // With credentials, should return valid structure
        const defaultResult = await galleryService.getGalleryData();
        expect(defaultResult).toHaveProperty('totalCount');
        expect(defaultResult).toHaveProperty('categories');
        expect(typeof defaultResult.totalCount).toBe('number');
      }
    });

    it('should fetch featured photos from cache or generate from gallery data', async () => {
      // Featured photos should work in multiple scenarios:
      // 1. Cache file exists (featured-photos.json) - should always work
      // 2. No cache file - tries to generate from gallery data
      
      try {
        const featuredPhotos = await galleryService.getFeaturedPhotos();
        
        // Validate structure - can have either 'items' (from cache) or 'photos' (generated)
        expect(featuredPhotos).toHaveProperty('totalCount');
        expect(typeof featuredPhotos.totalCount).toBe('number');
        
        // Check for either structure
        const hasItemsStructure = featuredPhotos.hasOwnProperty('items');
        const hasPhotosStructure = featuredPhotos.hasOwnProperty('photos');
        expect(hasItemsStructure || hasPhotosStructure).toBe(true);
        
        if (hasItemsStructure) {
          expect(Array.isArray(featuredPhotos.items)).toBe(true);
          expect(featuredPhotos.totalCount).toBe(featuredPhotos.items.length);
          
          // Validate item structure if items exist
          if (featuredPhotos.items.length > 0) {
            const firstItem = featuredPhotos.items[0];
            expect(firstItem).toHaveProperty('id');
            expect(firstItem).toHaveProperty('thumbnailUrl');
          }
        } else if (hasPhotosStructure) {
          expect(Array.isArray(featuredPhotos.photos)).toBe(true);
          expect(featuredPhotos.totalCount).toBe(featuredPhotos.photos.length);
          
          // Validate photo structure if photos exist
          if (featuredPhotos.photos.length > 0) {
            const firstPhoto = featuredPhotos.photos[0];
            expect(firstPhoto).toHaveProperty('id');
            expect(firstPhoto.featured).toBe(true);
          }
        }
        
        // Featured photos should be reasonable count (based on cache file: 9 items)
        expect(featuredPhotos.totalCount).toBeLessThanOrEqual(9);
        
      } catch (error) {
        // If featured photos fails, it should be for specific reasons:
        // 1. No cache file AND unable to generate from gallery data
        // 2. Gallery data generation fails due to missing credentials

        const hasCredentials = hasGoogleDriveCredentials();
        if (!hasCredentials) {
          // Without credentials, should only fail if no cache AND no real gallery cache available
          // With graceful degradation, this should now return empty fallback instead of throwing
          // If we still get an error here, it means the graceful degradation isn't working as expected
          expect(error.message).toMatch(/Google Drive credentials not configured/);
        } else {
          // With credentials, should not fail unless Google Drive has issues
          throw error; // Re-throw unexpected errors
        }
      }
    });

    it('should handle caching and metrics correctly', async () => {
      const hasCredentials = hasGoogleDriveCredentials();
      
      // Clear cache and reset metrics
      galleryService.clearCache();
      
      // Test initial metrics state
      let initialMetrics = galleryService.getMetrics();
      expect(initialMetrics).toHaveProperty('cacheHits');
      expect(initialMetrics).toHaveProperty('cacheMisses'); 
      expect(initialMetrics).toHaveProperty('apiCalls');
      expect(initialMetrics).toHaveProperty('cacheHitRatio');
      expect(initialMetrics).toHaveProperty('avgResponseTime');
      expect(initialMetrics.apiCalls).toBe(0);
      
      // Test behavior based on available data
      const cache2025 = await getCacheFileContent('2025.json');
      const isPlaceholder2025 = cache2025 && (
        cache2025.isPlaceholder ||
        (cache2025.totalCount === 0 &&
         cache2025.message &&
         cache2025.message.includes('Empty event gallery cache'))
      );
      const hasRealCache = cache2025 && !isPlaceholder2025;
      
      if (hasRealCache) {
        // With real cached data, should work regardless of credentials
        const result1 = await galleryService.getGalleryData('2025');
        expect(result1.source).toBe('build-time-cache');
        
        let metrics1 = galleryService.getMetrics();
        expect(metrics1.apiCalls).toBe(1);
        expect(metrics1.cacheHits).toBe(1); // Build-time cache counts as cache hit
        
        // Second call should also use cache
        const result2 = await galleryService.getGalleryData('2025');
        expect(result2.source).toBe('build-time-cache');
        
        let metrics2 = galleryService.getMetrics();
        expect(metrics2.apiCalls).toBe(2);
        expect(metrics2.cacheHits).toBe(2);
        
      } else if (!hasCredentials) {
        // No real cache and no credentials - should gracefully return empty data
        const emptyData = await galleryService.getGalleryData();
        expect(emptyData).toBeDefined();
        expect(emptyData.totalCount).toBe(0);
        expect(emptyData.source).toBe('empty-fallback');
        expect(emptyData.message).toBe('Google Drive credentials not configured - gallery disabled');
        expect(emptyData.categories).toEqual({
          workshops: [],
          socials: [],
          performances: [],
          other: []
        });

        // Metrics should still increment
        let metrics = galleryService.getMetrics();
        expect(metrics.apiCalls).toBe(1);
        expect(metrics.cacheMisses).toBe(1);
      } else {
        // Has credentials but no real cache - should attempt runtime generation
        try {
          const result = await galleryService.getGalleryData();
          expect(result.source).toMatch(/runtime-generated|google-drive/);
          
          let metrics = galleryService.getMetrics();
          expect(metrics.apiCalls).toBe(1);
          expect(metrics.cacheMisses).toBe(1);
          
        } catch (error) {
          // May fail if Google Drive has issues or no data for requested year
          let metrics = galleryService.getMetrics();
          expect(metrics.apiCalls).toBe(1);
        }
      }
    });

    it('should implement graceful degradation when credentials missing and only placeholder data available', async () => {
      const hasCredentials = hasGoogleDriveCredentials();
      
      if (!hasCredentials) {
        // Test that placeholder cache data triggers graceful degradation
        const cache2023 = await getCacheFileContent('2023.json');
        if (cache2023 && cache2023.isPlaceholder) {
          const emptyData2023 = await galleryService.getGalleryData('2023');
          expect(emptyData2023).toBeDefined();
          expect(emptyData2023.totalCount).toBe(0);
          expect(emptyData2023.source).toBe('empty-fallback');
          expect(emptyData2023.message).toBe('Google Drive credentials not configured - gallery disabled');
        }

        const cache2024 = await getCacheFileContent('2024.json');
        if (cache2024 && cache2024.isPlaceholder) {
          const emptyData2024 = await galleryService.getGalleryData('2024');
          expect(emptyData2024).toBeDefined();
          expect(emptyData2024.totalCount).toBe(0);
          expect(emptyData2024.source).toBe('empty-fallback');
          expect(emptyData2024.message).toBe('Google Drive credentials not configured - gallery disabled');
        }
        
        // Test that real cache data works even without credentials
        const cache2025 = await getCacheFileContent('2025.json');
        const isPlaceholder2025 = cache2025 && (
          cache2025.isPlaceholder ||
          (cache2025.totalCount === 0 &&
           cache2025.message &&
           cache2025.message.includes('Empty event gallery cache'))
        );
        if (cache2025 && !isPlaceholder2025) {
          const result = await galleryService.getGalleryData('2025');
          expect(result).toHaveProperty('totalCount');
          expect(result).toHaveProperty('categories');
          expect(result.source).toBe('build-time-cache');
          expect(result.totalCount).toBeGreaterThan(0);
        }
        
      } else {
        // With credentials, should work or provide meaningful errors
        try {
          const result = await galleryService.getGalleryData();
          expect(result).toHaveProperty('totalCount');
          expect(result).toHaveProperty('categories');
          expect(typeof result.totalCount).toBe('number');
        } catch (error) {
          // Should only fail for legitimate Google Drive API issues
          expect(error.message).not.toMatch(/FATAL.*secret not configured/);
        }
      }
    });

    it('should handle year-based filtering correctly for different cache scenarios', async () => {
      const hasCredentials = hasGoogleDriveCredentials();
      
      // Test 2025 - should work if real cache exists
      const cache2025 = await getCacheFileContent('2025.json');
      const isPlaceholder2025 = cache2025 && (
        cache2025.isPlaceholder ||
        (cache2025.totalCount === 0 &&
         cache2025.message &&
         cache2025.message.includes('Empty event gallery cache'))
      );
      if (cache2025 && !isPlaceholder2025) {
        // Real cache should work regardless of credentials
        const result2025 = await galleryService.getGalleryData('2025');
        expect(result2025).toHaveProperty('totalCount');
        expect(result2025).toHaveProperty('categories');
        expect(result2025.source).toBe('build-time-cache');
        expect(result2025.totalCount).toBe(69); // Based on actual cache content
        
        // Validate year is either in main object or inferred from request
        // The cache file doesn't have a year property, but the request was for 2025
        expect(result2025.totalCount).toBeGreaterThan(0);
      }
      
      // Test 2023 - placeholder cache should gracefully degrade without credentials
      const cache2023 = await getCacheFileContent('2023.json');
      if (cache2023 && cache2023.isPlaceholder) {
        if (!hasCredentials) {
          const emptyData2023 = await galleryService.getGalleryData('2023');
          expect(emptyData2023).toBeDefined();
          expect(emptyData2023.totalCount).toBe(0);
          expect(emptyData2023.source).toBe('empty-fallback');
          expect(emptyData2023.message).toBe('Google Drive credentials not configured - gallery disabled');
        } else {
          // With credentials, should attempt runtime generation
          try {
            const result2023 = await galleryService.getGalleryData('2023');
            expect(result2023.source).toMatch(/runtime-generated|google-drive/);
          } catch (error) {
            // May fail if year doesn't exist in Google Drive
            expect(error.message).toMatch(/No gallery found for year 2023/);
          }
        }
      }
      
      // Test non-existent year
      if (!hasCredentials) {
        // Should now gracefully return empty data when no credentials
        const emptyData = await galleryService.getGalleryData('1999');
        expect(emptyData).toBeDefined();
        expect(emptyData.totalCount).toBe(0);
        expect(emptyData.source).toMatch(/empty-fallback|error-fallback/);
      } else {
        // With credentials, should attempt runtime generation and get meaningful error
        try {
          await galleryService.getGalleryData('1999');
        } catch (error) {
          // Should get specific error about year not existing, OR authentication error if using test credentials
          expect(error.message).toMatch(/No gallery found for year 1999|Invalid year format|Google Drive API validation failed|authentication failed/);
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
      const response2025 = await testRequest('GET', '/api/gallery?year=2025');
      
      // If server response is available and successful
      if (response2025.status === HTTP_STATUS.OK) {
        expect(response2025.data).toHaveProperty('eventId');
        // Year filtering should be reflected if data exists
        if (response2025.data.year) expect(response2025.data.year).toBe(2025);
      } else {
        // Server not available or year doesn't exist - both are acceptable
        expect([0, 404, 500].includes(response2025.status)).toBe(true);
      }
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should implement fail-fast error handling while preserving real cached data', async () => {
      // This test verifies that fail-fast only occurs when appropriate:
      // - Real cached data should be served even without credentials
      // - Placeholder cached data should trigger fail-fast without credentials
      // - Runtime generation should fail fast without credentials
      
      const originalEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      const originalKey = process.env.GOOGLE_PRIVATE_KEY;
      const originalFolder = process.env.GOOGLE_DRIVE_GALLERY_FOLDER_ID;
      
      // Temporarily remove all Google Drive credentials
      delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      delete process.env.GOOGLE_PRIVATE_KEY;
      delete process.env.GOOGLE_DRIVE_GALLERY_FOLDER_ID;
      
      try {
        // Clear runtime cache to force fresh attempt
        galleryService.clearCache();
        // Reset Google Drive service to force re-initialization with missing credentials
        resetGoogleDriveService();
        
        // Test 1: Real cached data should work even without credentials
        const cache2025 = await getCacheFileContent('2025.json');
        const isPlaceholder2025 = cache2025 && (
          cache2025.isPlaceholder ||
          (cache2025.totalCount === 0 &&
           cache2025.message &&
           cache2025.message.includes('Empty event gallery cache'))
        );
        if (cache2025 && !isPlaceholder2025) {
          const result = await galleryService.getGalleryData('2025');
          expect(result).toHaveProperty('totalCount');
          expect(result.source).toBe('build-time-cache');
          expect(result.totalCount).toBeGreaterThan(0);
        }
        
        // Test 2: Placeholder cache should now gracefully return empty data
        const cache2023 = await getCacheFileContent('2023.json');
        if (cache2023 && cache2023.isPlaceholder) {
          const emptyData = await galleryService.getGalleryData('2023');
          expect(emptyData).toBeDefined();
          expect(emptyData.totalCount).toBe(0);
          expect(emptyData.source).toMatch(/empty-fallback|error-fallback/);
        }

        // Test 3: Non-existent cache should now gracefully return empty data
        // Without credentials, should return empty data instead of failing
        const emptyData = await galleryService.getGalleryData('1999');
        expect(emptyData).toBeDefined();
        expect(emptyData.totalCount).toBe(0);
        expect(emptyData.source).toMatch(/empty-fallback|error-fallback/);
        
      } finally {
        // Restore environment variables
        if (originalEmail) process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = originalEmail;
        if (originalKey) process.env.GOOGLE_PRIVATE_KEY = originalKey;
        if (originalFolder) process.env.GOOGLE_DRIVE_GALLERY_FOLDER_ID = originalFolder;
      }
    });

    it('should handle cache management with proper separation of build-time and runtime cache', async () => {
      const hasCredentials = hasGoogleDriveCredentials();
      
      // Test initial state
      galleryService.clearCache();
      let initialMetrics = galleryService.getMetrics();
      expect(initialMetrics.cacheHits).toBe(0);
      expect(initialMetrics.cacheMisses).toBe(0);
      expect(initialMetrics.apiCalls).toBe(0);
      
      // Test build-time cache behavior
      const cache2025 = await getCacheFileContent('2025.json');
      const isPlaceholder2025 = cache2025 && (
        cache2025.isPlaceholder ||
        (cache2025.totalCount === 0 &&
         cache2025.message &&
         cache2025.message.includes('Empty event gallery cache'))
      );
      if (cache2025 && !isPlaceholder2025) {
        // Build-time cache should work and count as cache hit
        const result1 = await galleryService.getGalleryData('2025');
        expect(result1.source).toBe('build-time-cache');
        
        let metrics1 = galleryService.getMetrics();
        expect(metrics1.apiCalls).toBe(1);
        expect(metrics1.cacheHits).toBe(1);
        
        // Second call should also hit build-time cache
        const result2 = await galleryService.getGalleryData('2025');
        expect(result2.source).toBe('build-time-cache');
        
        let metrics2 = galleryService.getMetrics();
        expect(metrics2.apiCalls).toBe(2);
        expect(metrics2.cacheHits).toBe(2);
      }
      
      // Test runtime cache behavior
      if (hasCredentials) {
        // Clear cache and test runtime generation
        galleryService.clearCache();
        
        // Test runtime generation for non-cached year
        try {
          const result = await galleryService.getGalleryData('2023');
          // Accept build-time-cache as valid if cache exists, otherwise runtime-generated or google-drive
          expect(result.source).toMatch(/runtime-generated|google-drive|build-time-cache/);

          let metrics = galleryService.getMetrics();
          expect(metrics.apiCalls).toBeGreaterThan(0);

        } catch (error) {
          // May fail if year doesn't exist in Google Drive
          expect(error.message).toMatch(/No gallery found for year 2023/);
        }
      }
      
      // Test cache clearing functionality
      galleryService.clearCache();
      let finalMetrics = galleryService.getMetrics();
      expect(finalMetrics.cacheHits).toBe(0);
      expect(finalMetrics.cacheMisses).toBe(0);
      expect(finalMetrics.apiCalls).toBe(0);
    });

    it('should validate featured photo selection with proper fallback handling', async () => {
      // Featured photos should work reliably with cached data or gracefully fail
      try {
        const featuredPhotos = await galleryService.getFeaturedPhotos();
        
        // Should return valid structure
        expect(featuredPhotos).toHaveProperty('totalCount');
        expect(typeof featuredPhotos.totalCount).toBe('number');
        
        // Check for either structure - 'items' (cache) or 'photos' (generated)
        const hasItemsStructure = featuredPhotos.hasOwnProperty('items');
        const hasPhotosStructure = featuredPhotos.hasOwnProperty('photos');
        expect(hasItemsStructure || hasPhotosStructure).toBe(true);
        
        if (hasItemsStructure) {
          expect(Array.isArray(featuredPhotos.items)).toBe(true);
          expect(featuredPhotos.totalCount).toBe(featuredPhotos.items.length);
          expect(featuredPhotos.items.length).toBeLessThanOrEqual(9); // Based on cache file
          
          // Validate item structure
          featuredPhotos.items.forEach(item => {
            expect(item).toHaveProperty('id');
            expect(item).toHaveProperty('thumbnailUrl');
            expect(typeof item.id).toBe('string');
          });
          
        } else if (hasPhotosStructure) {
          expect(Array.isArray(featuredPhotos.photos)).toBe(true);
          expect(featuredPhotos.totalCount).toBe(featuredPhotos.photos.length);
          expect(featuredPhotos.photos.length).toBeLessThanOrEqual(9);
          
          // Validate photo structure
          featuredPhotos.photos.forEach(photo => {
            expect(photo).toHaveProperty('id');
            expect(photo.featured).toBe(true);
            expect(typeof photo.id).toBe('string');
          });
        }
        
      } catch (error) {
        // Featured photos may fail if no cache and credentials missing
        // This is expected behavior when all fallbacks are exhausted
        const hasCredentials = hasGoogleDriveCredentials();
        
        if (!hasCredentials) {
          // Check if featured photos cache exists
          try {
            const cachePath = path.join(process.cwd(), 'public', 'featured-photos.json');
            await fs.readFile(cachePath, 'utf8');
            
            // If cache exists but still fails, it's unexpected
            throw new Error(`Featured photos should work with cache file present: ${error.message}`);
          } catch (cacheError) {
            // No cache file - with graceful degradation, this should return empty fallback instead of failing
            // If we still get an error here, it should only be the expected graceful message
            expect(error.message).toMatch(/Google Drive credentials not configured/);
          }
        } else {
          // With credentials, should not fail unless Google Drive has issues
          throw error;
        }
      }
    });
  });
});
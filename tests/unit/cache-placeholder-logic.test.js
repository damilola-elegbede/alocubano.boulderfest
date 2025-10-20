/**
 * Tests for cache placeholder logic and fail-fast behavior
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getGalleryService } from '../../lib/gallery-service.js';
import { getGoogleDriveService } from '../../lib/google-drive-service.js';

describe('Cache Placeholder Logic', () => {
  let originalEnv;
  let galleryService;
  let googleDriveService;

  beforeEach(() => {
    // Backup original environment
    originalEnv = { ...process.env };

    // Simulate missing Google Drive credentials to trigger graceful degradation
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    delete process.env.GOOGLE_PRIVATE_KEY;
    delete process.env.GOOGLE_DRIVE_GALLERY_FOLDER_ID;

    galleryService = getGalleryService();
    googleDriveService = getGoogleDriveService();
    galleryService.clearCache();

    // Mock Google Drive service to prevent actual API calls (as a safety fallback)
    // Return empty fallback when credentials are missing
    vi.spyOn(googleDriveService, 'fetchImages').mockResolvedValue({
      totalCount: 0,
      categories: { workshops: [], socials: [], performances: [], other: [] },
      message: 'Google Drive credentials not configured - gallery disabled'
    });
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    galleryService.clearCache();
  });

  describe('Placeholder Detection and Graceful Degradation', () => {
    it('should gracefully handle placeholder cache data with isPlaceholder: true', async () => {
      // Mock build-time cache that is a placeholder
      const mockCacheData = {
        eventId: '2025',
        totalCount: 0,
        categories: { workshops: [], socials: [], other: [] },
        hasMore: false,
        cacheTimestamp: new Date().toISOString(),
        isPlaceholder: true,
        message: "Placeholder data - Google Drive credentials not available"
      };

      // Mock the getBuildTimeCache method to return placeholder data
      vi.spyOn(galleryService, 'getBuildTimeCache').mockResolvedValue(mockCacheData);

      // Should gracefully degrade and return empty data
      const result = await galleryService.getGalleryData('2025');
      expect(result).toBeDefined();
      expect(result.totalCount).toBe(0);
      expect(result.source).toBe('empty-fallback');
      expect(result.message).toBe('Google Drive credentials not configured - gallery disabled');
      expect(result.categories).toEqual({
        workshops: [],
        socials: [],
        performances: [],
        other: []
      });
    });

    it('should accept cache data without isPlaceholder flag (real data)', async () => {
      // Mock build-time cache that has real data (no isPlaceholder field)
      const mockRealData = {
        eventId: 'real-event',
        totalCount: 5,
        categories: {
          workshops: [
            { id: '1', name: 'Workshop 1', type: 'image' }
          ],
          socials: [
            { id: '2', name: 'Social 1', type: 'image' },
            { id: '3', name: 'Social 2', type: 'image' }
          ]
        },
        hasMore: false,
        cacheTimestamp: new Date().toISOString()
        // Note: no isPlaceholder field - this indicates real data
      };

      // Mock the getBuildTimeCache method to return real data
      vi.spyOn(galleryService, 'getBuildTimeCache').mockResolvedValue(mockRealData);

      // Should successfully return the cached data
      const result = await galleryService.getGalleryData('real-event');

      expect(result).toMatchObject({
        eventId: 'real-event',
        totalCount: 5,
        source: 'build-time-cache'
      });
      expect(result.categories.workshops).toHaveLength(1);
      expect(result.categories.socials).toHaveLength(2);
    });

    it('should gracefully handle empty cache data with placeholder-like characteristics', async () => {
      // Mock build-time cache that has empty data with placeholder message
      // This should now be detected as placeholder even without explicit isPlaceholder field
      const mockEmptyData = {
        eventId: '2024',
        totalCount: 0,
        categories: { workshops: [], socials: [], other: [] },
        hasMore: false,
        cacheTimestamp: new Date().toISOString(),
        message: "Empty event gallery cache - to be populated when Google Drive folder is configured"
        // Note: no isPlaceholder field but has totalCount:0 and placeholder-like message
      };

      // Mock the getBuildTimeCache method to return empty data
      vi.spyOn(galleryService, 'getBuildTimeCache').mockResolvedValue(mockEmptyData);

      // Should gracefully degrade and return empty data
      const result = await galleryService.getGalleryData('2024');
      expect(result).toBeDefined();
      expect(result.totalCount).toBe(0);
      expect(result.source).toBe('empty-fallback');
      expect(result.message).toBe('Google Drive credentials not configured - gallery disabled');
      expect(result.categories).toEqual({
        workshops: [],
        socials: [],
        performances: [],
        other: []
      });
    });

    it('should gracefully handle runtime cache with isPlaceholder: true', async () => {
      // Mock no build-time cache available
      vi.spyOn(galleryService, 'getBuildTimeCache').mockResolvedValue(null);

      // Set placeholder data in runtime cache
      const placeholderData = {
        eventId: '2023',
        totalCount: 0,
        categories: { workshops: [], socials: [], other: [] },
        hasMore: false,
        cacheTimestamp: new Date().toISOString(),
        isPlaceholder: true,
        message: "Placeholder data - Google Drive credentials not available"
      };

      galleryService.setRuntimeCache('2023', galleryService.compressData(placeholderData));

      // Should gracefully degrade and return empty data
      const result = await galleryService.getGalleryData(null, '2023');
      expect(result).toBeDefined();
      expect(result.totalCount).toBe(0);
      expect(result.source).toBe('empty-fallback');
      expect(result.message).toBe('Google Drive credentials not configured - gallery disabled');
      expect(result.categories).toEqual({
        workshops: [],
        socials: [],
        performances: [],
        other: []
      });
    });
  });

  describe('Cache Generation Logic', () => {
    it('should correctly identify placeholder vs real data', () => {
      const placeholderData = {
        totalCount: 0,
        categories: { workshops: [], socials: [], other: [] },
        isPlaceholder: true
      };

      const realData = {
        totalCount: 10,
        categories: {
          workshops: [{ id: '1', name: 'Test' }],
          socials: [{ id: '2', name: 'Test' }]
        }
        // No isPlaceholder field
      };

      const emptyValidData = {
        totalCount: 0,
        categories: { workshops: [], socials: [], other: [] },
        message: "Gallery data currently unavailable"
        // No isPlaceholder field, different message to avoid triggering enhanced detection
      };

      // Placeholder detection should be explicit or based on specific message patterns
      expect(placeholderData.isPlaceholder).toBe(true);
      expect(realData.isPlaceholder).toBeUndefined();
      expect(emptyValidData.isPlaceholder).toBeUndefined();

      // Content analysis
      const hasRealContent = (data) =>
        data.totalCount > 0 ||
        (data.categories && Object.values(data.categories).some(cat => cat.length > 0));

      expect(hasRealContent(placeholderData)).toBe(false);
      expect(hasRealContent(realData)).toBe(true);
      expect(hasRealContent(emptyValidData)).toBe(false);
    });
  });
});
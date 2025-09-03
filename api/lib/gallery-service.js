/**
 * Unified Gallery Service
 * Handles gallery data in both local development and Vercel runtime environments
 */

import fs from 'fs/promises';
import path from 'path';
import { shouldUseBuildTimeCache } from './environment.js';
import { getGoogleDriveService } from './google-drive-service.js';

class GalleryService {
  constructor() {
    this.cache = new Map(); // In-memory cache for Vercel
    this.cacheTimestamp = null;
    this.cacheTTL = 15 * 60 * 1000; // 15 minutes
    this.maxCacheSize = 50; // Maximum number of cached items
    this.compressionEnabled = true;
    
    // Performance metrics
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      apiCalls: 0,
      avgResponseTime: 0
    };
  }

  /**
   * Get gallery data - tries cache first, falls back to runtime generation
   */
  async getGalleryData(year = null, eventId = null) {
    const startTime = performance.now();
    this.metrics.apiCalls++;
    
    try {
      // Try build-time cache first (local development)
      if (shouldUseBuildTimeCache()) {
        const cachedData = await this.getBuildTimeCache(year, eventId);
        if (cachedData) {
          this.metrics.cacheHits++;
          this.updateResponseTime(startTime);
          console.log('Gallery: Serving from build-time cache');
          return { ...cachedData, source: 'build-time-cache' };
        }
      }

      // Try runtime cache (Vercel or fallback)
      const cacheKey = eventId || year || 'default';
      const runtimeCache = this.getRuntimeCache(cacheKey);
      if (runtimeCache && !this.isCacheExpired(cacheKey)) {
        this.metrics.cacheHits++;
        this.updateResponseTime(startTime);
        console.log('Gallery: Serving from runtime cache');
        return { ...this.decompressData(runtimeCache), source: 'runtime-cache' };
      }

      // Generate runtime data (Vercel environment)
      this.metrics.cacheMisses++;
      console.log('Gallery: Generating runtime data');
      const freshData = await this.generateRuntimeData(year, eventId);
      
      // Cache the results with compression
      this.setRuntimeCache(cacheKey, this.compressData(freshData));
      this.updateResponseTime(startTime);
      
      return { ...freshData, source: 'runtime-generated' };
      
    } catch (error) {
      console.error('Gallery Service Error:', error);
      
      // Fallback to any available cache
      const cacheKey = eventId || year || 'default';
      const fallbackData = this.getRuntimeCache(cacheKey) || await this.getBuildTimeCache(year, eventId);
      if (fallbackData) {
        console.log('Gallery: Serving stale cache due to error');
        return { ...this.decompressData(fallbackData), source: 'fallback-cache', error: error.message };
      }
      
      // Final fallback - empty gallery
      return this.getEmptyGallery();
    }
  }

  /**
   * Get featured photos data
   */
  async getFeaturedPhotos() {
    try {
      // Try build-time cache first
      if (shouldUseBuildTimeCache()) {
        const cachedData = await this.getFeaturedPhotosCache();
        if (cachedData) {
          // Convert cache format (items) to API format (photos) if needed
          if (cachedData.items && !cachedData.photos) {
            return {
              photos: cachedData.items.map(item => ({
                ...item,
                featured: true
              })),
              totalCount: cachedData.totalCount,
              cacheTimestamp: cachedData.cacheTimestamp
            };
          }
          return cachedData;
        }
      }

      // Generate from gallery data
      const galleryData = await this.getGalleryData();
      return this.selectFeaturedPhotos(galleryData);
      
    } catch (error) {
      console.error('Featured Photos Service Error:', error);
      return { photos: [], totalCount: 0, error: error.message };
    }
  }

  /**
   * Try to read build-time cache file
   */
  async getBuildTimeCache(year, eventId) {
    try {
      let cachePath;
      
      if (eventId) {
        cachePath = path.join(process.cwd(), 'public', 'gallery-data', `${eventId}.json`);
      } else if (year) {
        cachePath = path.join(process.cwd(), 'public', 'gallery-data', `${year}.json`);
      } else {
        // Try default cache files
        const possiblePaths = [
          path.join(process.cwd(), 'public', 'gallery-data', 'boulder-fest-2026.json'),
          path.join(process.cwd(), 'public', 'gallery-data', '2026.json')
        ];
        
        for (const filePath of possiblePaths) {
          try {
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
          } catch (e) {
            continue; // Try next file
          }
        }
        return null;
      }
      
      const data = await fs.readFile(cachePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // Cache file doesn't exist or is invalid
      return null;
    }
  }

  /**
   * Try to read featured photos cache file
   */
  async getFeaturedPhotosCache() {
    try {
      const cachePath = path.join(process.cwd(), 'public', 'featured-photos.json');
      const data = await fs.readFile(cachePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get runtime cache and update access time
   */
  getRuntimeCache(key = 'default') {
    const data = this.cache.get(key);
    if (data) {
      // Update access time for LRU tracking
      this.cache.set(`${key}_accessTime`, Date.now());
    }
    return data;
  }

  /**
   * Set runtime cache with LRU eviction
   */
  setRuntimeCache(key = 'default', data) {
    // Implement LRU eviction - account for 3 entries per cache item (data, timestamp, accessTime)
    const effectiveMaxSize = this.maxCacheSize * 3;
    if (this.cache.size >= effectiveMaxSize) {
      this.evictLeastRecentlyUsed();
    }
    
    this.cache.set(key, data);
    this.cache.set(`${key}_timestamp`, Date.now());
    this.cache.set(`${key}_accessTime`, Date.now());
  }

  /**
   * Check if runtime cache is expired
   */
  isCacheExpired(key = 'default') {
    const timestamp = this.cache.get(`${key}_timestamp`);
    if (!timestamp) return true;
    return (Date.now() - timestamp) > this.cacheTTL;
  }

  /**
   * Generate runtime data using Google Drive API
   */
  async generateRuntimeData(year, eventId) {
    try {
      // Try to use Google Drive service if configured
      const googleDriveService = getGoogleDriveService();
      
      // Check if Google Drive is configured with Service Account credentials
      if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
        console.log('Gallery: Using Google Drive Service Account API for runtime data');
        
        // Ensure Google Drive service is initialized before fetching
        await googleDriveService.ensureInitialized?.();
        
        const driveData = await googleDriveService.fetchImages({
          year,
          eventId,
          maxResults: 1000,
          includeVideos: false
        });
        
        // Add Google Drive source indicator
        return {
          ...driveData,
          source: 'google-drive-service-account',
          message: 'Data fetched from Google Drive API using Service Account authentication'
        };
      } else {
        console.log('Gallery: Google Drive Service Account API not configured, using placeholder data');
        
        // Fallback to placeholder data
        const currentYear = new Date().getFullYear();
        const displayYear = year || currentYear;
        const displayEventId = eventId || `boulder-fest-${currentYear}`;
        
        return {
          eventId: displayEventId,
          event: displayEventId,
          year: displayYear,
          totalCount: 0,
          categories: {
            workshops: [],
            socials: [],
            performances: [],
            other: []
          },
          hasMore: false,
          cacheTimestamp: new Date().toISOString(),
          source: 'placeholder',
          message: 'Google Drive Service Account API not configured - set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY environment variables'
        };
      }
    } catch (error) {
      console.error('Gallery: Google Drive API error, falling back to placeholder:', error.message);
      
      // Fallback to placeholder data on error
      const currentYear = new Date().getFullYear();
      const displayYear = year || currentYear;
      const displayEventId = eventId || `boulder-fest-${currentYear}`;
      
      return {
        eventId: displayEventId,
        event: displayEventId,
        year: displayYear,
        totalCount: 0,
        categories: {
          workshops: [],
          socials: [],
          performances: [],
          other: []
        },
        hasMore: false,
        cacheTimestamp: new Date().toISOString(),
        source: 'fallback-placeholder',
        message: `Google Drive API error: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * Select featured photos from gallery data
   */
  selectFeaturedPhotos(galleryData) {
    if (!galleryData || !galleryData.categories) {
      return { photos: [], totalCount: 0 };
    }
    
    const allPhotos = [];
    
    // Collect photos from all categories
    Object.values(galleryData.categories).forEach(category => {
      if (Array.isArray(category)) {
        allPhotos.push(...category.filter(item => item.type === 'image'));
      }
    });
    
    // Select featured photos (first few)
    const featured = allPhotos.slice(0, 6).map(photo => ({
      ...photo,
      featured: true
    }));
    
    return {
      photos: featured,
      totalCount: featured.length,
      cacheTimestamp: new Date().toISOString()
    };
  }

  /**
   * Return empty gallery structure
   */
  getEmptyGallery() {
    return {
      eventId: 'unknown',
      event: 'unknown',
      totalCount: 0,
      categories: {},
      hasMore: false,
      cacheTimestamp: new Date().toISOString(),
      source: 'fallback',
      error: 'Unable to load gallery data'
    };
  }

  /**
   * Evict least recently used cache entries with improved logic
   */
  evictLeastRecentlyUsed() {
    const entries = [];
    
    // Collect all cache entries with access times
    for (const [key, value] of this.cache.entries()) {
      if (key.endsWith('_accessTime')) {
        const dataKey = key.replace('_accessTime', '');
        // Ensure the data entry actually exists
        if (this.cache.has(dataKey)) {
          entries.push({ key: dataKey, accessTime: value || 0 });
        }
      }
    }
    
    if (entries.length === 0) {
      // No entries to evict, clear corrupted cache
      console.warn('Gallery cache corrupted, clearing all entries');
      this.cache.clear();
      return;
    }
    
    // Sort by access time (oldest first) and remove at least 25% of entries
    entries.sort((a, b) => a.accessTime - b.accessTime);
    const toRemove = Math.max(1, Math.ceil(entries.length * 0.25));
    
    console.log(`Gallery cache evicting ${toRemove} of ${entries.length} entries`);
    
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      const key = entries[i].key;
      this.cache.delete(key);
      this.cache.delete(`${key}_timestamp`);
      this.cache.delete(`${key}_accessTime`);
    }
  }

  /**
   * Compress data for efficient storage
   */
  compressData(data) {
    if (!this.compressionEnabled) return data;
    
    try {
      // Simple compression by removing redundant fields and stringifying
      const compressed = {
        ...data,
        _compressed: true,
        _originalSize: JSON.stringify(data).length
      };
      return compressed;
    } catch (error) {
      console.warn('Data compression failed:', error);
      return data;
    }
  }

  /**
   * Decompress data
   */
  decompressData(data) {
    if (!data || !data._compressed) return data;
    
    try {
      const { _compressed, _originalSize, ...decompressed } = data;
      return decompressed;
    } catch (error) {
      console.warn('Data decompression failed:', error);
      return data;
    }
  }

  /**
   * Update response time metrics
   */
  updateResponseTime(startTime) {
    const responseTime = performance.now() - startTime;
    this.metrics.avgResponseTime = 
      (this.metrics.avgResponseTime * (this.metrics.apiCalls - 1) + responseTime) / this.metrics.apiCalls;
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    const cacheHitRatio = 
      this.metrics.cacheHits + this.metrics.cacheMisses > 0
        ? (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)) * 100
        : 0;

    return {
      ...this.metrics,
      cacheHitRatio: cacheHitRatio.toFixed(1) + '%',
      cacheSize: this.cache.size,
      avgResponseTime: this.metrics.avgResponseTime.toFixed(2) + 'ms'
    };
  }

  /**
   * Clear runtime cache (useful for debugging)
   */
  clearCache() {
    this.cache.clear();
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      apiCalls: 0,
      avgResponseTime: 0
    };
    console.log('Gallery cache cleared');
  }
}

// Export singleton instance
let galleryServiceInstance = null;

export function getGalleryService() {
  if (!galleryServiceInstance) {
    galleryServiceInstance = new GalleryService();
  }
  return galleryServiceInstance;
}

export default { getGalleryService };
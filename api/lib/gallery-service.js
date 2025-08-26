/**
 * Unified Gallery Service
 * Handles gallery data in both local development and Vercel runtime environments
 */

import fs from 'fs/promises';
import path from 'path';
import { shouldUseBuildTimeCache } from './environment.js';

class GalleryService {
  constructor() {
    this.cache = new Map(); // In-memory cache for Vercel
    this.cacheTimestamp = null;
    this.cacheTTL = 15 * 60 * 1000; // 15 minutes
  }

  /**
   * Get gallery data - tries cache first, falls back to runtime generation
   */
  async getGalleryData(year = null, eventId = null) {
    try {
      // Try build-time cache first (local development)
      if (shouldUseBuildTimeCache()) {
        const cachedData = await this.getBuildTimeCache(year, eventId);
        if (cachedData) {
          console.log('Gallery: Serving from build-time cache');
          return { ...cachedData, source: 'build-time-cache' };
        }
      }

      // Try runtime cache (Vercel or fallback)
      const cacheKey = eventId || year || 'default';
      const runtimeCache = this.getRuntimeCache(cacheKey);
      if (runtimeCache && !this.isCacheExpired(cacheKey)) {
        console.log('Gallery: Serving from runtime cache');
        return { ...runtimeCache, source: 'runtime-cache' };
      }

      // Generate runtime data (Vercel environment)
      console.log('Gallery: Generating runtime data');
      const freshData = await this.generateRuntimeData(year, eventId);
      
      // Cache the results
      this.setRuntimeCache(cacheKey, freshData);
      
      return { ...freshData, source: 'runtime-generated' };
      
    } catch (error) {
      console.error('Gallery Service Error:', error);
      
      // Fallback to any available cache
      const cacheKey = eventId || year || 'default';
      const fallbackData = this.getRuntimeCache(cacheKey) || await this.getBuildTimeCache(year, eventId);
      if (fallbackData) {
        console.log('Gallery: Serving stale cache due to error');
        return { ...fallbackData, source: 'fallback-cache', error: error.message };
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
   * Get runtime cache
   */
  getRuntimeCache(key = 'default') {
    return this.cache.get(key);
  }

  /**
   * Set runtime cache
   */
  setRuntimeCache(key = 'default', data) {
    this.cache.set(key, data);
    this.cache.set(`${key}_timestamp`, Date.now());
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
   * Generate runtime data (placeholder for now)
   */
  async generateRuntimeData(year, eventId) {
    // This would integrate with Google Drive API in production
    // For now, return a structured placeholder
    
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
      message: 'Runtime API placeholder - Google Drive integration needed'
    };
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
   * Clear runtime cache (useful for debugging)
   */
  clearCache() {
    this.cache.clear();
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
/**
 * Google Drive API Service
 * Fetches images from Google Drive folder using Drive API v3
 * Implements caching, categorization, and structured data formatting
 * Compatible with existing gallery service architecture
 */

import { logger } from './logger.js';

class GoogleDriveService {
  constructor() {
    this.apiKey = null;
    this.folderId = null;
    this.initialized = false;
    this.initializationPromise = null;
    this.cache = new Map();
    this.cacheTTL = 30 * 60 * 1000; // 30 minutes
    this.maxCacheSize = 20;
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
    
    // Performance metrics
    this.metrics = {
      apiCalls: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalItemsFetched: 0,
      avgResponseTime: 0,
      rateLimitHits: 0,
      errors: 0
    };

    // Supported image MIME types
    this.imageMimeTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp',
      'image/tiff',
      'image/svg+xml',
      'image/x-icon',
      'image/avif'
    ];

    // Category patterns for filename-based categorization
    this.categoryPatterns = {
      workshops: /workshop|class|lesson|tutorial|learn/i,
      socials: /social|party|dance|dancing|fun|music/i, 
      performances: /performance|show|stage|concert|artist|performer/i,
      other: /.*/  // Catch-all pattern
    };
  }

  /**
   * Ensure Google Drive service is initialized with promise-based lazy singleton pattern
   * @returns {Promise<GoogleDriveService>} The initialized service instance
   */
  async ensureInitialized() {
    // Return immediately if already initialized (fast path)
    if (this.initialized && this.apiKey && this.folderId) {
      return this;
    }

    // If initialization is already in progress, return the existing promise
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start new initialization
    this.initializationPromise = this._performInitialization();

    try {
      const service = await this.initializationPromise;
      return service;
    } catch (error) {
      // Clear the failed promise so next call can retry
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Perform the actual Google Drive service initialization
   * @private
   */
  async _performInitialization() {
    try {
      // Load configuration from environment variables
      this.apiKey = process.env.GOOGLE_DRIVE_API_KEY;
      this.folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

      // Validate required configuration
      if (!this.apiKey || this.apiKey.trim() === '') {
        throw new Error('GOOGLE_DRIVE_API_KEY environment variable is required');
      }

      if (!this.folderId || this.folderId.trim() === '') {
        throw new Error('GOOGLE_DRIVE_FOLDER_ID environment variable is required');
      }

      // Test API connectivity with a simple validation call
      await this._validateApiAccess();

      this.initialized = true;
      logger.log('✅ Google Drive service initialized successfully');
      
      return this;
    } catch (error) {
      logger.error('❌ Google Drive service initialization failed:', {
        error: error.message,
        hasApiKey: !!this.apiKey,
        hasFolderId: !!this.folderId,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Validate API access by making a test request
   * @private
   */
  async _validateApiAccess() {
    try {
      const testUrl = `https://www.googleapis.com/drive/v3/files/${this.folderId}?key=${this.apiKey}&fields=id,name`;
      
      const response = await fetch(testUrl);
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid Google Drive API key - authentication failed');
        } else if (response.status === 404) {
          throw new Error('Google Drive folder not found or inaccessible');
        } else if (response.status === 403) {
          throw new Error('Google Drive API access forbidden - check API key permissions');
        } else {
          throw new Error(`Google Drive API validation failed with status ${response.status}`);
        }
      }

      const data = await response.json();
      if (!data.id) {
        throw new Error('Invalid response from Google Drive API - folder validation failed');
      }

      logger.log(`✅ Google Drive API access validated for folder: ${data.name || 'Unnamed Folder'}`);
    } catch (error) {
      if (error.message.includes('fetch')) {
        throw new Error(`Network error connecting to Google Drive API: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Fetch images from Google Drive folder
   * @param {Object} options - Fetch options
   * @param {string} options.year - Filter by year (optional)
   * @param {string} options.eventId - Filter by event ID (optional) 
   * @param {number} options.maxResults - Maximum number of results (default: 1000)
   * @param {boolean} options.includeVideos - Include video files (default: false)
   * @returns {Promise<Object>} Structured gallery data
   */
  async fetchImages(options = {}) {
    const startTime = performance.now();
    this.metrics.apiCalls++;

    try {
      await this.ensureInitialized();

      const {
        year = null,
        eventId = null,
        maxResults = 1000,
        includeVideos = false
      } = options;

      // Generate cache key
      const cacheKey = this._generateCacheKey(options);
      
      // Check cache first
      const cachedData = this._getFromCache(cacheKey);
      if (cachedData && !this._isCacheExpired(cacheKey)) {
        this.metrics.cacheHits++;
        this._updateResponseTime(startTime);
        logger.log('Google Drive: Serving from cache');
        return { ...cachedData, source: 'cache' };
      }

      this.metrics.cacheMisses++;

      // Fetch fresh data from API with retry logic
      const freshData = await this._fetchWithRetry(options);
      
      // Cache the results
      this._setCache(cacheKey, freshData);
      this._updateResponseTime(startTime);
      
      return { ...freshData, source: 'api' };

    } catch (error) {
      this.metrics.errors++;
      logger.error('Google Drive API fetch failed:', {
        error: error.message,
        options,
        timestamp: new Date().toISOString()
      });
      
      // Try to return stale cache as fallback
      const cacheKey = this._generateCacheKey(options);
      const staleData = this._getFromCache(cacheKey);
      if (staleData) {
        logger.log('Google Drive: Serving stale cache due to error');
        return { ...staleData, source: 'stale-cache', error: error.message };
      }
      
      // Return empty gallery if no cache available
      return this._getEmptyGallery(error.message);
    }
  }

  /**
   * Fetch data from Google Drive API with retry logic
   * @private
   */
  async _fetchWithRetry(options, retryCount = 0) {
    try {
      return await this._performApiFetch(options);
    } catch (error) {
      // Handle rate limiting
      if (error.message.includes('429') || error.message.includes('quota')) {
        this.metrics.rateLimitHits++;
        
        if (retryCount < this.maxRetries) {
          const delay = this._calculateBackoffDelay(retryCount);
          logger.warn(`Google Drive API rate limited, retrying in ${delay}ms... (attempt ${retryCount + 1}/${this.maxRetries})`);
          await this._delay(delay);
          return this._fetchWithRetry(options, retryCount + 1);
        }
      }
      
      // Handle temporary errors with exponential backoff
      if (retryCount < this.maxRetries && this._isRetryableError(error)) {
        const delay = this._calculateBackoffDelay(retryCount);
        logger.warn(`Google Drive API error, retrying in ${delay}ms... (attempt ${retryCount + 1}/${this.maxRetries}): ${error.message}`);
        await this._delay(delay);
        return this._fetchWithRetry(options, retryCount + 1);
      }
      
      throw error;
    }
  }

  /**
   * Perform the actual API fetch
   * @private
   */
  async _performApiFetch(options) {
    const {
      maxResults = 1000,
      includeVideos = false
    } = options;

    // Build MIME type filter
    let mimeTypes = [...this.imageMimeTypes];
    if (includeVideos) {
      mimeTypes.push('video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm');
    }
    
    // Build query string for file types
    const mimeTypeQuery = mimeTypes.map(type => `mimeType='${type}'`).join(' or ');
    
    // Build API URL
    const baseUrl = 'https://www.googleapis.com/drive/v3/files';
    const params = new URLSearchParams({
      key: this.apiKey,
      q: `'${this.folderId}' in parents and (${mimeTypeQuery}) and trashed=false`,
      fields: 'nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,thumbnailLink,imageMediaMetadata)',
      pageSize: Math.min(maxResults, 1000).toString(),
      orderBy: 'createdTime desc'
    });

    const url = `${baseUrl}?${params.toString()}`;
    
    logger.log(`🔄 Fetching images from Google Drive folder: ${this.folderId}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 429) {
        throw new Error(`Google Drive API quota exceeded (429)`);
      } else if (response.status === 403) {
        throw new Error(`Google Drive API access forbidden (403) - check API permissions`);
      } else if (response.status === 404) {
        throw new Error(`Google Drive folder not found (404)`);
      } else {
        throw new Error(`Google Drive API request failed with status ${response.status}`);
      }
    }

    const data = await response.json();
    
    if (!data.files || !Array.isArray(data.files)) {
      throw new Error('Invalid response format from Google Drive API');
    }

    // Process and categorize the files
    const processedData = this._processApiResponse(data.files, options);
    
    this.metrics.totalItemsFetched += data.files.length;
    logger.log(`✅ Fetched ${data.files.length} files from Google Drive`);
    
    return processedData;
  }

  /**
   * Process API response and structure data for gallery
   * @private
   */
  _processApiResponse(files, options) {
    const { year, eventId } = options;
    const currentYear = new Date().getFullYear();
    const displayYear = year || currentYear;
    const displayEventId = eventId || `boulder-fest-${currentYear}`;

    // Initialize categories
    const categories = {
      workshops: [],
      socials: [],
      performances: [],
      other: []
    };

    // Process each file
    files.forEach(file => {
      const processedFile = this._processFile(file);
      if (processedFile) {
        const category = this._categorizeFile(file.name);
        categories[category].push(processedFile);
      }
    });

    // Calculate totals
    const totalCount = Object.values(categories).reduce((sum, items) => sum + items.length, 0);
    const hasMore = false; // TODO: Implement pagination if needed

    return {
      eventId: displayEventId,
      event: displayEventId,
      year: displayYear,
      totalCount,
      categories,
      hasMore,
      cacheTimestamp: new Date().toISOString(),
      metadata: {
        apiCallTimestamp: new Date().toISOString(),
        folderId: this.folderId,
        filesProcessed: files.length,
        categoryCounts: Object.fromEntries(
          Object.entries(categories).map(([key, items]) => [key, items.length])
        )
      }
    };
  }

  /**
   * Process individual file from API response
   * @private
   */
  _processFile(file) {
    try {
      const isVideo = file.mimeType?.startsWith('video/');
      
      return {
        id: file.id,
        name: file.name || 'Untitled',
        type: isVideo ? 'video' : 'image',
        mimeType: file.mimeType,
        url: file.webViewLink,
        thumbnailUrl: file.thumbnailLink || null,
        size: file.size ? parseInt(file.size, 10) : null,
        createdTime: file.createdTime,
        modifiedTime: file.modifiedTime,
        dimensions: file.imageMediaMetadata ? {
          width: file.imageMediaMetadata.width,
          height: file.imageMediaMetadata.height,
          rotation: file.imageMediaMetadata.rotation || 0
        } : null,
        downloadUrl: `https://drive.google.com/uc?id=${file.id}`,
        previewUrl: `https://drive.google.com/file/d/${file.id}/view`
      };
    } catch (error) {
      logger.warn(`Failed to process file ${file.id}:`, error.message);
      return null;
    }
  }

  /**
   * Categorize file based on filename patterns
   * @private
   */
  _categorizeFile(filename) {
    if (!filename) return 'other';
    
    // Check each category pattern
    for (const [category, pattern] of Object.entries(this.categoryPatterns)) {
      if (category !== 'other' && pattern.test(filename)) {
        return category;
      }
    }
    
    return 'other';
  }

  /**
   * Generate cache key for request
   * @private
   */
  _generateCacheKey(options) {
    const { year, eventId, maxResults, includeVideos } = options;
    return `${eventId || year || 'default'}-${maxResults}-${includeVideos}`;
  }

  /**
   * Get data from cache
   * @private
   */
  _getFromCache(key) {
    const entry = this.cache.get(key);
    if (entry) {
      // Update access time for LRU tracking
      entry.accessTime = Date.now();
      return entry.data;
    }
    return null;
  }

  /**
   * Set data in cache with LRU eviction
   * @private
   */
  _setCache(key, data) {
    // Implement LRU eviction
    if (this.cache.size >= this.maxCacheSize) {
      this._evictLeastRecentlyUsed();
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      accessTime: Date.now()
    });
  }

  /**
   * Check if cache entry is expired
   * @private
   */
  _isCacheExpired(key) {
    const entry = this.cache.get(key);
    if (!entry) return true;
    return (Date.now() - entry.timestamp) > this.cacheTTL;
  }

  /**
   * Evict least recently used cache entries
   * @private
   */
  _evictLeastRecentlyUsed() {
    const entries = Array.from(this.cache.entries());
    if (entries.length === 0) return;
    
    // Sort by access time (oldest first)
    entries.sort((a, b) => a[1].accessTime - b[1].accessTime);
    
    // Remove oldest 25% of entries
    const toRemove = Math.max(1, Math.ceil(entries.length * 0.25));
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }
    
    logger.log(`Google Drive cache evicted ${toRemove} entries`);
  }

  /**
   * Calculate exponential backoff delay
   * @private
   */
  _calculateBackoffDelay(retryCount) {
    return this.retryDelay * Math.pow(2, retryCount) + Math.random() * 1000;
  }

  /**
   * Check if error is retryable
   * @private
   */
  _isRetryableError(error) {
    const retryableMessages = [
      'network',
      'timeout',
      'temporary',
      'unavailable',
      '502',
      '503',
      '504'
    ];
    
    return retryableMessages.some(msg => 
      error.message.toLowerCase().includes(msg)
    );
  }

  /**
   * Utility delay function
   * @private
   */
  async _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update response time metrics
   * @private
   */
  _updateResponseTime(startTime) {
    const responseTime = performance.now() - startTime;
    this.metrics.avgResponseTime = 
      (this.metrics.avgResponseTime * (this.metrics.apiCalls - 1) + responseTime) / this.metrics.apiCalls;
  }

  /**
   * Get empty gallery structure for fallback
   * @private
   */
  _getEmptyGallery(errorMessage = 'Failed to load gallery data') {
    return {
      eventId: 'unknown',
      event: 'unknown',
      year: new Date().getFullYear(),
      totalCount: 0,
      categories: {
        workshops: [],
        socials: [],
        performances: [],
        other: []
      },
      hasMore: false,
      cacheTimestamp: new Date().toISOString(),
      source: 'fallback',
      error: errorMessage
    };
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
      avgResponseTime: this.metrics.avgResponseTime.toFixed(2) + 'ms',
      initialized: this.initialized,
      hasApiKey: !!this.apiKey,
      hasFolderId: !!this.folderId
    };
  }

  /**
   * Clear cache (useful for debugging)
   */
  clearCache() {
    this.cache.clear();
    this.metrics.cacheHits = 0;
    this.metrics.cacheMisses = 0;
    logger.log('Google Drive cache cleared');
  }

  /**
   * Health check for the service
   */
  async healthCheck() {
    try {
      await this.ensureInitialized();
      
      // Test API access
      await this._validateApiAccess();
      
      const metrics = this.getMetrics();
      
      return {
        status: 'healthy',
        service: 'google-drive',
        metrics,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        service: 'google-drive',
        error: error.message,
        metrics: this.getMetrics(),
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Export singleton instance
let googleDriveServiceInstance = null;

/**
 * Get Google Drive service singleton instance
 * @returns {GoogleDriveService} Google Drive service instance
 */
export function getGoogleDriveService() {
  if (!googleDriveServiceInstance) {
    googleDriveServiceInstance = new GoogleDriveService();
  }
  return googleDriveServiceInstance;
}

/**
 * Fetch images from Google Drive (convenience function)
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} Structured gallery data
 */
export async function fetchGoogleDriveImages(options = {}) {
  const service = getGoogleDriveService();
  return service.fetchImages(options);
}

/**
 * Get Google Drive service metrics
 * @returns {Object} Performance and usage metrics
 */
export function getGoogleDriveMetrics() {
  const service = getGoogleDriveService();
  return service.getMetrics();
}

/**
 * Clear Google Drive service cache
 */
export function clearGoogleDriveCache() {
  const service = getGoogleDriveService();
  service.clearCache();
}

/**
 * Reset Google Drive service for testing
 */
export function resetGoogleDriveService() {
  if (googleDriveServiceInstance) {
    googleDriveServiceInstance.clearCache();
    googleDriveServiceInstance.initialized = false;
    googleDriveServiceInstance.initializationPromise = null;
  }
  googleDriveServiceInstance = null;
}

export { GoogleDriveService };
export default { getGoogleDriveService, fetchGoogleDriveImages, getGoogleDriveMetrics, clearGoogleDriveCache, resetGoogleDriveService };
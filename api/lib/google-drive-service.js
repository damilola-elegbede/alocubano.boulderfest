/**
 * Google Drive API Service
 * Fetches images from Google Drive folder using Drive API v3 with Service Account authentication
 * Implements caching, categorization, and structured data formatting
 * Compatible with existing gallery service architecture
 * 
 * Required environment variables:
 * - GOOGLE_SERVICE_ACCOUNT_EMAIL: Service account email
 * - GOOGLE_PRIVATE_KEY: Service account private key (base64 encoded or with escaped newlines)
 */

import { google } from 'googleapis';
import { logger } from './logger.js';

class GoogleDriveService {
  constructor() {
    this.drive = null;
    this.auth = null;
    this.serviceAccountEmail = null;
    this.privateKey = null;
    this.rootFolderId = null;
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
    if (this.initialized && this.drive && this.auth) {
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
      this.serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      this.privateKey = process.env.GOOGLE_PRIVATE_KEY;
      this.rootFolderId = process.env.GOOGLE_DRIVE_GALLERY_FOLDER_ID;

      // Validate required configuration - fail fast and loud
      if (!this.serviceAccountEmail || this.serviceAccountEmail.trim() === '') {
        throw new Error('❌ FATAL: GOOGLE_SERVICE_ACCOUNT_EMAIL secret not configured');
      }

      if (!this.privateKey || this.privateKey.trim() === '') {
        throw new Error('❌ FATAL: GOOGLE_PRIVATE_KEY secret not configured');
      }

      if (!this.rootFolderId || this.rootFolderId.trim() === '') {
        throw new Error('❌ FATAL: GOOGLE_DRIVE_GALLERY_FOLDER_ID secret not configured');
      }

      // Initialize Google Auth with Service Account
      this.auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: this.serviceAccountEmail,
          private_key: this.privateKey.replace(/\\n/g, '\n'), // Handle escaped newlines
        },
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      });

      // Initialize Google Drive client
      this.drive = google.drive({ version: 'v3', auth: this.auth });

      // Test API connectivity with a simple validation call
      await this._validateApiAccess();

      this.initialized = true;
      logger.log('✅ Google Drive service initialized successfully with Service Account');
      
      return this;
    } catch (error) {
      logger.error('❌ Google Drive service initialization failed:', {
        error: error.message,
        hasServiceAccountEmail: !!this.serviceAccountEmail,
        hasPrivateKey: !!this.privateKey,
        hasRootFolderId: !!this.rootFolderId,
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
      const response = await this.drive.files.get({
        fileId: this.rootFolderId,
        fields: 'id,name'
      });

      if (!response.data || !response.data.id) {
        throw new Error('Invalid response from Google Drive API - folder validation failed');
      }

      logger.log(`✅ Google Drive API access validated for folder: ${response.data.name || 'Unnamed Folder'}`);
    } catch (error) {
      if (error.code === 401) {
        throw new Error('Invalid Google Drive Service Account credentials - authentication failed');
      } else if (error.code === 404) {
        throw new Error('Google Drive folder not found or inaccessible');
      } else if (error.code === 403) {
        throw new Error('Google Drive API access forbidden - check Service Account permissions');
      } else {
        throw new Error(`Google Drive API validation failed: ${error.message}`);
      }
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
      
      // No fallback - fail immediately
      throw error;
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
      // Handle rate limiting using proper status code checking
      const statusCode = error.code || error.response?.status || 0;
      const isRateLimited = statusCode === 429 || error.message.includes('429') || error.message.includes('quota');
      
      if (isRateLimited) {
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
   * Perform the actual API fetch using folder structure navigation
   * Navigates: root folder → year folder → category folders → images
   * @private
   */
  async _performApiFetch(options) {
    const {
      year,
      maxResults = 1000,
      includeVideos = false
    } = options;

    let displayYear = year || new Date().getFullYear().toString();
    
    // Sanitize year - must be exactly 4 digits
    if (!/^\d{4}$/.test(displayYear)) {
      throw new Error(`Invalid year format: ${displayYear}. Year must be 4 digits (e.g., 2025)`);
    }
    
    logger.log(`🔄 Fetching images from Google Drive for year: ${displayYear}`);

    // Step 1: Find year folder within root gallery folder
    // Support multiple naming patterns: "2025", "ALoCubano_BoulderFest_2025", etc.
    const yearFolders = await this.drive.files.list({
      q: `'${this.rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and (name = '${displayYear}' or name contains '${displayYear}') and trashed = false`,
      fields: 'files(id, name)',
    });

    if (!yearFolders.data.files || yearFolders.data.files.length === 0) {
      throw new Error(`No gallery found for year ${displayYear}`);
    }

    const yearFolder = yearFolders.data.files[0];
    const yearFolderId = yearFolder.id;
    logger.log(`📁 Found year folder: "${yearFolder.name}" (${yearFolderId})`);

    // Step 2: Get category folders within the year folder
    const categoryFolders = await this.drive.files.list({
      q: `'${yearFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      orderBy: 'name',
    });

    const categories = {
      workshops: [],
      socials: [],
      performances: [],
      other: []
    };
    let totalFiles = 0;

    // Step 3: Process each category folder
    for (const folder of categoryFolders.data.files) {
      const categoryName = this._mapCategoryName(folder.name.toLowerCase());
      
      logger.log(`📂 Processing category folder: ${folder.name} → ${categoryName}`);

      // Get images from this category folder
      const mimeTypeQuery = includeVideos 
        ? "mimeType contains 'image/' or mimeType contains 'video/'"
        : "mimeType contains 'image/'";

      const filesResponse = await this.drive.files.list({
        q: `'${folder.id}' in parents and (${mimeTypeQuery}) and trashed = false`,
        fields: 'files(id, name, mimeType, thumbnailLink, webViewLink, webContentLink, size, createdTime, modifiedTime, imageMediaMetadata)',
        pageSize: Math.min(maxResults, 1000),
        orderBy: 'createdTime desc',
      });

      const files = filesResponse.data.files || [];
      
      // Process files to create gallery items
      const galleryItems = files.map(file => this._processFile(file, categoryName));
      
      categories[categoryName] = galleryItems.filter(item => item !== null);
      totalFiles += categories[categoryName].length;
      
      logger.log(`  ✅ Found ${categories[categoryName].length} items in ${categoryName}`);
    }

    // Process and return structured data
    const processedData = this._processStructuredApiResponse(categories, options, totalFiles);
    
    this.metrics.totalItemsFetched += totalFiles;
    logger.log(`✅ Fetched ${totalFiles} files from Google Drive across ${categoryFolders.data.files.length} categories`);
    
    return processedData;
  }

  /**
   * Map folder names to standard category names
   * @private
   */
  _mapCategoryName(folderName) {
    const lowerName = folderName.toLowerCase();
    
    if (lowerName.includes('workshop') || lowerName.includes('class') || lowerName.includes('lesson')) {
      return 'workshops';
    } else if (lowerName.includes('social') || lowerName.includes('party') || lowerName.includes('dance')) {
      return 'socials';
    } else if (lowerName.includes('performance') || lowerName.includes('show') || lowerName.includes('stage')) {
      return 'performances';
    } else {
      return 'other';
    }
  }

  /**
   * Process structured API response from folder navigation
   * @private
   */
  _processStructuredApiResponse(categories, options, totalFiles) {
    const { year, eventId } = options;
    const currentYear = new Date().getFullYear();
    const displayYear = year || currentYear;
    const displayEventId = eventId || `boulder-fest-${displayYear}`;

    return {
      eventId: displayEventId,
      event: displayEventId,
      year: displayYear,
      totalCount: totalFiles,
      categories,
      hasMore: false, // TODO: Implement pagination if needed
      cacheTimestamp: new Date().toISOString(),
      metadata: {
        apiCallTimestamp: new Date().toISOString(),
        rootFolderId: this.rootFolderId,
        filesProcessed: totalFiles,
        categoryCounts: Object.fromEntries(
          Object.entries(categories).map(([key, items]) => [key, items.length])
        )
      }
    };
  }

  /**
   * Process API response and structure data for gallery (legacy method for backward compatibility)
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
        folderId: this.rootFolderId,
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
  _processFile(file, categoryName = 'other') {
    try {
      const isVideo = file.mimeType?.startsWith('video/');
      
      return {
        id: file.id,
        name: file.name || 'Untitled',
        type: isVideo ? 'video' : 'image',
        mimeType: file.mimeType,
        category: categoryName,
        // Use direct Google Drive URLs for fast loading without proxy overhead
        thumbnailUrl: file.thumbnailLink || `https://drive.google.com/thumbnail?id=${file.id}&sz=w400`,
        // For full resolution in lightbox, use the lh3 URL with original size parameter
        viewUrl: file.thumbnailLink ? file.thumbnailLink.replace(/=s\d+/, '=s0') : `https://lh3.googleusercontent.com/d/${file.id}=s0`,
        downloadUrl: `https://drive.google.com/uc?export=download&id=${file.id}`,
        size: file.size ? parseInt(file.size, 10) : 0,
        createdAt: file.createdTime,
        createdTime: file.createdTime, // Keep both for compatibility
        modifiedTime: file.modifiedTime,
        dimensions: file.imageMediaMetadata ? {
          width: file.imageMediaMetadata.width,
          height: file.imageMediaMetadata.height,
          rotation: file.imageMediaMetadata.rotation || 0
        } : null,
        // Keep original URLs for reference
        originalUrl: file.webViewLink,
        originalThumbnailUrl: file.thumbnailLink,
        directDownloadUrl: `https://drive.google.com/uc?id=${file.id}`,
        previewUrl: `https://drive.google.com/file/d/${file.id}/view`,
        // Keep proxy URL as optional for future optimization needs
        proxyUrl: `/api/image-proxy/${file.id}`
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
    // Check HTTP status codes first (more reliable)
    const statusCode = error.code || error.response?.status || 0;
    const retryableStatusCodes = [502, 503, 504];
    
    if (retryableStatusCodes.includes(statusCode)) {
      return true;
    }
    
    // Fallback to message checking for other retryable errors
    const retryableMessages = [
      'network',
      'timeout', 
      'temporary',
      'unavailable'
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
      hasServiceAccountEmail: !!this.serviceAccountEmail,
      hasPrivateKey: !!this.privateKey,
      hasRootFolderId: !!this.rootFolderId,
      authType: 'service-account'
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
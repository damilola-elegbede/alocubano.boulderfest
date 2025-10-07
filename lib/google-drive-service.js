/**
 * Google Drive API Service
 * Fetches images from Google Drive folder using Drive API v3 with Service Account authentication
 * Implements caching, categorization, and structured data formatting
 * Compatible with existing gallery service architecture
 *
 * CACHING STRATEGY:
 * ==================
 * Two-tier caching system for optimal performance and cost reduction:
 *
 * 1. SERVER-SIDE CACHE (L1 - This Layer):
 *    - Duration: 30 minutes (configurable via cacheTTL)
 *    - Storage: In-memory Map with LRU eviction
 *    - Purpose: Reduce Google Drive API calls and quota usage
 *    - Max Size: 20 entries (configurable via maxCacheSize)
 *    - Eviction: Least Recently Used (LRU) when size limit reached
 *
 * 2. HTTP CACHE (L2 - CDN/Browser):
 *    - Duration: 24 hours (set via Cache-Control header in API responses)
 *    - Storage: Browser cache and CDN edge locations
 *    - Purpose: Fast content delivery without server requests
 *    - Headers: Cache-Control: public, max-age=86400
 *
 * CACHE KEY STRATEGY:
 * - Keys include: eventId/year + maxResults + includeVideos
 * - Example: "boulder-fest-2025-100-false"
 * - Ensures proper cache isolation for different queries
 *
 * CACHE INVALIDATION:
 * - Time-based: Automatic expiration after TTL
 * - Manual: clearCache() method for admin operations
 * - Admin API: POST /api/cache with action=clear&type=google-drive
 *
 * Required environment variables:
 * - GOOGLE_SERVICE_ACCOUNT_EMAIL: Service account email
 * - GOOGLE_PRIVATE_KEY: Service account private key (base64 encoded or with escaped newlines)
 */

import { drive } from '@googleapis/drive';
import { JWT } from 'google-auth-library';
import { logger } from './logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class GoogleDriveService {
  constructor() {
    this.drive = null;
    this.auth = null;
    this.serviceAccountEmail = null;
    this.privateKey = null;
    this.rootFolderId = null;
    this.initialized = false;
    this.initializationPromise = null;

    // L1 Cache: Server-side in-memory cache (30 minutes)
    // Reduces Google Drive API calls and quota usage
    // LRU eviction when maxCacheSize is reached
    this.cache = new Map();
    this.cacheTTL = 30 * 60 * 1000; // 30 minutes - server-side cache duration
    this.maxCacheSize = 20; // Maximum number of cached query results
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second

    // Blob manifest cache
    this.blobManifest = null;
    this.blobManifestPath = path.join(__dirname, '../.gallery-sync-cache.json');
    this.blobManifestLoadTime = null;
    this.blobManifestTTL = 5 * 60 * 1000; // 5 minutes cache for manifest

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

      // Initialize Google Auth with Service Account using JWT (new recommended approach)
      this.auth = new JWT({
        email: this.serviceAccountEmail,
        key: this.privateKey.replace(/\\n/g, '\n'), // Handle escaped newlines
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      });

      // Initialize Google Drive client
      this.drive = drive({ version: 'v3', auth: this.auth });

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
   *
   * CACHING BEHAVIOR:
   * 1. Check server-side cache (L1) first
   * 2. If cache hit and not expired, return cached data
   * 3. If cache miss, fetch from Google Drive API
   * 4. Store in server-side cache with 30-minute TTL
   * 5. Response includes Cache-Control header for HTTP cache (L2)
   *
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

      // Generate cache key based on query parameters
      // This ensures different queries don't share cache entries
      const cacheKey = this._generateCacheKey(options);

      // L1 Cache Check: Server-side in-memory cache (30 minutes)
      // Reduces Google Drive API calls and quota usage
      const cachedData = this._getFromCache(cacheKey);
      if (cachedData && !this._isCacheExpired(cacheKey)) {
        this.metrics.cacheHits++;
        this._updateResponseTime(startTime);
        logger.log('Google Drive: Serving from cache');
        return { ...cachedData, source: 'cache' };
      }

      this.metrics.cacheMisses++;

      // Fetch fresh data from API with retry logic
      // Handles rate limiting automatically with exponential backoff
      const freshData = await this._fetchWithRetry(options);

      // Store in L1 cache (30 minutes server-side)
      // Subsequent requests for same query will hit cache
      this._setCache(cacheKey, freshData);
      this._updateResponseTime(startTime);

      // Note: L2 cache (24 hours HTTP/CDN) is set via Cache-Control header
      // in the API response (see api/gallery.js)
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
   * Navigates: root folder → event folder → category folders → images
   * @private
   */
  async _performApiFetch(options) {
    const {
      year,
      eventId,
      maxResults = 1000,
      includeVideos = false
    } = options;

    // Use eventId if provided, otherwise construct from year
    let targetFolder;
    if (eventId) {
      targetFolder = eventId;
      logger.log(`🔄 Fetching images from Google Drive for event: ${eventId}`);
    } else {
      const displayYear = year || new Date().getFullYear().toString();
      // Sanitize year - must be exactly 4 digits
      if (!/^\d{4}$/.test(displayYear)) {
        throw new Error(`Invalid year format: ${displayYear}. Year must be 4 digits (e.g., 2025)`);
      }
      targetFolder = `boulder-fest-${displayYear}`;
      logger.log(`🔄 Fetching images from Google Drive for year-based folder: ${targetFolder}`);
    }

    // Step 1: Find event folder within root gallery folder
    // Support exact match first, then partial match
    const eventFolders = await this.drive.files.list({
      q: `'${this.rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${targetFolder}' and trashed = false`,
      fields: 'files(id, name)',
    });

    if (!eventFolders.data.files || eventFolders.data.files.length === 0) {
      throw new Error(`No gallery found for event ${targetFolder}`);
    }

    const eventFolder = eventFolders.data.files[0];
    const eventFolderId = eventFolder.id;
    logger.log(`📁 Found event folder: "${eventFolder.name}" (${eventFolderId})`);

    // Step 2: Get category folders within the event folder
    const categoryFolders = await this.drive.files.list({
      q: `'${eventFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
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

      // Frontend compatibility fields
      availableYears: [displayYear.toString()],
      statistics: {
        [displayYear]: {
          imageCount: totalFiles,
          totalSize: 0 // TODO: Calculate actual sizes if needed
        }
      },

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
   * Load Blob manifest from disk (with caching)
   * @private
   */
  _loadBlobManifest() {
    try {
      // Return cached manifest if still valid
      const now = Date.now();
      if (this.blobManifest && this.blobManifestLoadTime &&
          (now - this.blobManifestLoadTime) < this.blobManifestTTL) {
        return this.blobManifest;
      }

      // Load from disk
      if (fs.existsSync(this.blobManifestPath)) {
        const data = fs.readFileSync(this.blobManifestPath, 'utf-8');
        this.blobManifest = JSON.parse(data);
        this.blobManifestLoadTime = now;
        logger.info(`Loaded Blob manifest: ${Object.keys(this.blobManifest.files || {}).length} files`);
        return this.blobManifest;
      }

      logger.info('No Blob manifest found, using direct Google Drive URLs');
      return null;
    } catch (error) {
      logger.warn('Failed to load Blob manifest:', error.message);
      return null;
    }
  }

  /**
   * Get Blob URLs for a file (if available)
   * @private
   */
  _getBlobUrls(fileId) {
    const manifest = this._loadBlobManifest();
    if (!manifest || !manifest.files || !manifest.files[fileId]) {
      return null;
    }

    const entry = manifest.files[fileId];
    if (!entry.synced || !entry.blobUrls) {
      return null;
    }

    return entry.blobUrls;
  }

  /**
   * Process individual file from API response
   * Prefers Vercel Blob URLs if available, falls back to Google Drive URLs
   * @private
   */
  _processFile(file, categoryName = 'other') {
    try {
      const isVideo = file.mimeType?.startsWith('video/');

      // Try to get Blob URLs first
      const blobUrls = this._getBlobUrls(file.id);

      // Build base response
      const response = {
        id: file.id,
        name: file.name || 'Untitled',
        type: isVideo ? 'video' : 'image',
        mimeType: file.mimeType,
        category: categoryName,
        size: file.size ? parseInt(file.size, 10) : 0,
        createdAt: file.createdTime,
        createdTime: file.createdTime, // Keep both for compatibility
        modifiedTime: file.modifiedTime,
        dimensions: file.imageMediaMetadata ? {
          width: file.imageMediaMetadata.width,
          height: file.imageMediaMetadata.height,
          rotation: file.imageMediaMetadata.rotation || 0
        } : null
      };

      // Use Blob URLs if available (optimized AVIF/WebP), otherwise fall back to Google Drive
      if (blobUrls && blobUrls.thumb_avif && blobUrls.full_avif) {
        response.thumbnailUrl = blobUrls.thumb_avif;
        response.thumbnailUrl_webp = blobUrls.thumb_webp;
        response.viewUrl = blobUrls.full_avif;
        response.viewUrl_webp = blobUrls.full_webp;
        response.usingBlob = true;
        response.blobUrls = blobUrls; // Include all variants for frontend choice
      } else {
        // Fallback to direct Google Drive URLs
        response.thumbnailUrl = file.thumbnailLink || `https://drive.google.com/thumbnail?id=${file.id}&sz=w400`;
        response.viewUrl = file.thumbnailLink ? file.thumbnailLink.replace(/=s\d+/, '=s0') :
          `https://lh3.googleusercontent.com/d/${file.id}=s0`;
        response.usingBlob = false;
      }

      // Keep original URLs for reference and fallback
      response.originalUrl = file.webViewLink;
      response.originalThumbnailUrl = file.thumbnailLink;
      response.directDownloadUrl = `https://drive.google.com/uc?id=${file.id}`;
      response.previewUrl = `https://drive.google.com/file/d/${file.id}/view`;
      response.downloadUrl = `https://drive.google.com/uc?export=download&id=${file.id}`;

      return response;
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
   * Includes all query parameters to ensure proper cache isolation
   * @private
   */
  _generateCacheKey(options) {
    const { year, eventId, maxResults, includeVideos } = options;
    return `${eventId || year || 'default'}-${maxResults}-${includeVideos}`;
  }

  /**
   * Get data from L1 cache (server-side in-memory)
   * Updates access time for LRU tracking
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
   * Set data in L1 cache with LRU eviction
   * Stores data with timestamp and access time for TTL and LRU management
   * @private
   */
  _setCache(key, data) {
    // Implement LRU eviction when cache reaches max size
    if (this.cache.size >= this.maxCacheSize) {
      this._evictLeastRecentlyUsed();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(), // For TTL expiration
      accessTime: Date.now() // For LRU eviction
    });
  }

  /**
   * Check if cache entry is expired (30 minutes TTL)
   * @private
   */
  _isCacheExpired(key) {
    const entry = this.cache.get(key);
    if (!entry) return true;
    return (Date.now() - entry.timestamp) > this.cacheTTL;
  }

  /**
   * Evict least recently used cache entries (LRU)
   * Removes oldest 25% of entries when max size reached
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
   * Calculate exponential backoff delay for retries
   * @private
   */
  _calculateBackoffDelay(retryCount) {
    return this.retryDelay * Math.pow(2, retryCount) + Math.random() * 1000;
  }

  /**
   * Check if error is retryable (network/temporary errors)
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
   * Utility delay function for retry logic
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
   * Get performance metrics including cache effectiveness
   * Provides insights into cache hit ratio and API usage
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
   * Clear L1 cache (server-side in-memory)
   * Useful for debugging or forced refresh
   * Admin endpoint: POST /api/cache with action=clear&type=google-drive
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
 * Admin endpoint: POST /api/cache with action=clear&type=google-drive
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
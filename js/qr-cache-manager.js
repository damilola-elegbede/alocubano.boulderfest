/**
 * QR Code Cache Manager
 *
 * High-performance caching system for QR codes with:
 * - 7-day localStorage cache with versioning
 * - Progressive loading with skeleton UI
 * - Retry logic with exponential backoff
 * - Offline support and fallback handling
 * - Performance monitoring and metrics
 */

class QRCacheManager {
  constructor() {
    this.cachePrefix = 'alocubano_qr_';
    this.cacheVersion = '1.2.0';
    this.cacheExpiryDays = 7;
    this.maxRetries = 3;
    this.baseRetryDelay = 1000; // 1 second
    this.performanceMarks = new Map();

    // Initialize cache on construction
    this.init();
  }

  init() {
    this.cleanExpiredCache();
    this.setupPerformanceMonitoring();
  }

  /**
   * Generate cache key for QR code
   */
  getCacheKey(token) {
    return `${this.cachePrefix}${token}_v${this.cacheVersion}`;
  }

  /**
   * Generate metadata key for cache entry
   */
  getMetadataKey(token) {
    return `${this.cachePrefix}${token}_meta_v${this.cacheVersion}`;
  }

  /**
   * Check if QR code is cached and not expired
   */
  isCached(token) {
    try {
      const cacheKey = this.getCacheKey(token);
      const metaKey = this.getMetadataKey(token);

      const cached = localStorage.getItem(cacheKey);
      const metadata = localStorage.getItem(metaKey);

      if (!cached || !metadata) return false;

      const meta = JSON.parse(metadata);
      const expiryTime = meta.timestamp + (this.cacheExpiryDays * 24 * 60 * 60 * 1000);

      return Date.now() < expiryTime;
    } catch (error) {
      console.warn('Error checking QR cache:', error);
      return false;
    }
  }

  /**
   * Get cached QR code data
   */
  getCached(token) {
    try {
      if (!this.isCached(token)) return null;

      const cacheKey = this.getCacheKey(token);
      const cached = localStorage.getItem(cacheKey);

      if (cached) {
        // Track cache hit
        this.trackPerformance('qr_cache_hit', token);
        return cached;
      }
    } catch (error) {
      console.warn('Error retrieving from QR cache:', error);
    }
    return null;
  }

  /**
   * Cache QR code data
   */
  setCached(token, dataUrl) {
    try {
      const cacheKey = this.getCacheKey(token);
      const metaKey = this.getMetadataKey(token);

      const metadata = {
        timestamp: Date.now(),
        version: this.cacheVersion,
        size: dataUrl.length,
        token: token
      };

      localStorage.setItem(cacheKey, dataUrl);
      localStorage.setItem(metaKey, JSON.stringify(metadata));

      console.log(`QR code cached for token: ${token.substring(0, 8)}...`);
      return true;
    } catch (error) {
      console.warn('Error caching QR code:', error);
      // Try to free up space by cleaning old cache
      this.cleanExpiredCache();
      return false;
    }
  }

  /**
   * Load QR code with progressive enhancement and caching
   */
  async loadQRCode(token, container, options = {}) {
    const {
      showSkeleton = true,
      retryOnError = true,
      preloadNext = null,
      onProgress = null
    } = options;

    // Persist token on container for retry functionality
    if (container) {
      container.dataset.qrContainer = token;
    }

    // Start performance tracking
    const perfId = this.startPerformanceTracking('qr_load', token);

    try {
      // Show skeleton loader
      if (showSkeleton) {
        this.showSkeleton(container);
      }

      // Check cache first
      const cached = this.getCached(token);
      if (cached) {
        this.renderQRCode(container, cached, token);
        this.endPerformanceTracking(perfId, 'cached');

        // Preload next QR if specified
        if (preloadNext) {
          this.preloadQRCode(preloadNext);
        }

        return cached;
      }

      // Track cache miss
      this.trackPerformance('qr_cache_miss', token);

      // Load from server with retry logic
      const dataUrl = await this.fetchQRCodeWithRetry(token, retryOnError, onProgress);

      // Cache the result
      this.setCached(token, dataUrl);

      // Render the QR code
      this.renderQRCode(container, dataUrl, token);

      this.endPerformanceTracking(perfId, 'network');

      // Preload next QR if specified
      if (preloadNext) {
        this.preloadQRCode(preloadNext);
      }

      return dataUrl;

    } catch (error) {
      console.error('Failed to load QR code:', error);
      this.showError(container, error.message, token);
      this.endPerformanceTracking(perfId, 'error');
      throw error;
    }
  }

  /**
   * Fetch QR code from server with retry logic and exponential backoff
   */
  async fetchQRCodeWithRetry(token, retryOnError, onProgress, attempt = 1) {
    try {
      if (onProgress) {
        onProgress({ stage: 'fetching', attempt });
      }

      const response = await fetch(`/api/qr/generate?token=${encodeURIComponent(token)}`, {
        method: 'GET',
        headers: {
          'Accept': 'image/png',
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Convert response to blob and then to data URL
      const blob = await response.blob();
      const dataUrl = await this.blobToDataUrl(blob);

      if (onProgress) {
        onProgress({ stage: 'completed', dataUrl });
      }

      return dataUrl;

    } catch (error) {
      if (retryOnError && attempt < this.maxRetries) {
        const delay = this.baseRetryDelay * Math.pow(2, attempt - 1);
        console.warn(`QR fetch attempt ${attempt} failed, retrying in ${delay}ms:`, error.message);

        if (onProgress) {
          onProgress({ stage: 'retrying', attempt, delay, error: error.message });
        }

        await this.delay(delay);
        return this.fetchQRCodeWithRetry(token, retryOnError, onProgress, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Convert blob to data URL
   */
  blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Preload QR code in background
   */
  async preloadQRCode(token) {
    if (this.isCached(token)) return; // Already cached

    try {
      console.log(`Preloading QR code for token: ${token.substring(0, 8)}...`);
      const dataUrl = await this.fetchQRCodeWithRetry(token, false);
      this.setCached(token, dataUrl);
    } catch (error) {
      console.warn('Preload failed:', error.message);
    }
  }

  /**
   * Show skeleton loader
   */
  showSkeleton(container) {
    container.innerHTML = `
      <div class="qr-skeleton">
        <div class="qr-skeleton-image"></div>
        <div class="qr-skeleton-text"></div>
        <div class="qr-skeleton-button"></div>
      </div>
    `;

    // Inject skeleton styles if not already present
    this.injectSkeletonStyles();
  }

  /**
   * Render QR code in container
   */
  renderQRCode(container, dataUrl, token) {
    const qrId = `qr-${token.substring(0, 8)}`;

    container.innerHTML = `
      <div class="qr-code-display" data-token="${token}">
        <img
          id="${qrId}"
          src="${dataUrl}"
          alt="Your Ticket QR Code"
          class="qr-code-image"
          loading="lazy"
          decoding="async"
        />
        <div class="qr-instructions">
          <strong>Your Ticket QR Code</strong><br>
          Show this code at the entrance
        </div>
        <button
          class="qr-download-button"

          aria-label="Download QR code as PNG"
        >
          💾 Download QR Code
        </button>
      </div>
    `;

    // Add fade-in animation
    const qrDisplay = container.querySelector('.qr-code-display');
    qrDisplay.style.opacity = '0';
    qrDisplay.style.transform = 'translateY(10px)';

    // Trigger animation
    requestAnimationFrame(() => {
      qrDisplay.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      qrDisplay.style.opacity = '1';
      qrDisplay.style.transform = 'translateY(0)';

      // Attach event listener for download button (CSP compliance)
      const downloadBtn = container.querySelector('.qr-download-button');
      if (downloadBtn) {
        downloadBtn.addEventListener('click', () => this.downloadQRCode(token));
      }
    });
  }

  /**
   * Show error state
   */
  showError(container, message, token) {
    container.innerHTML = `
      <div class="qr-error">
        <div class="qr-error-icon">⚠️</div>
        <div class="qr-error-message">
          <strong>Failed to load QR code</strong><br>
          ${message}
        </div>
        <button
          class="qr-retry-button"

        >
          🔄 Try Again
        </button>
      </div>
    `;
    // Attach event listener for retry button (CSP compliance)
    const retryBtn = container.querySelector('.qr-retry-button');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => this.retryLoad(token));
    }
  }

  /**
   * Retry loading QR code
   */
  async retryLoad(token) {
    const container = document.querySelector(`[data-qr-container="${token}"]`);
    if (!container) return;

    // Clear any cached error state
    this.clearCache(token);

    // Reload
    await this.loadQRCode(token, container, { retryOnError: true });
  }

  /**
   * Download QR code
   */
  async downloadQRCode(token) {
    try {
      const cached = this.getCached(token);
      let dataUrl = cached;

      if (!dataUrl) {
        // If not cached, fetch it
        dataUrl = await this.fetchQRCodeWithRetry(token, true);
        this.setCached(token, dataUrl);
      }

      // Create download link
      const link = document.createElement('a');
      link.download = `ticket-qr-${token.substring(0, 8)}.png`;
      link.href = dataUrl;

      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Track download
      this.trackPerformance('qr_download', token);

    } catch (error) {
      console.error('Download failed:', error);
      alert('Unable to download QR code. Please try again.');
    }
  }

  /**
   * Clear cache for specific token
   */
  clearCache(token) {
    try {
      const cacheKey = this.getCacheKey(token);
      const metaKey = this.getMetadataKey(token);

      localStorage.removeItem(cacheKey);
      localStorage.removeItem(metaKey);
    } catch (error) {
      console.warn('Error clearing QR cache:', error);
    }
  }

  /**
   * Clean expired cache entries
   */
  cleanExpiredCache() {
    try {
      const keysToRemove = [];
      const now = Date.now();

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);

        if (key?.startsWith(this.cachePrefix) && key.includes('_meta_')) {
          try {
            const metadata = JSON.parse(localStorage.getItem(key));
            const expiryTime = metadata.timestamp + (this.cacheExpiryDays * 24 * 60 * 60 * 1000);

            if (now > expiryTime) {
              const token = metadata.token;
              keysToRemove.push(this.getCacheKey(token));
              keysToRemove.push(this.getMetadataKey(token));
            }
          } catch (error) {
            // Invalid metadata, remove it
            keysToRemove.push(key);
          }
        }
      }

      keysToRemove.forEach(key => localStorage.removeItem(key));

      if (keysToRemove.length > 0) {
        console.log(`Cleaned ${keysToRemove.length / 2} expired QR cache entries`);
      }
    } catch (error) {
      console.warn('Error cleaning QR cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    try {
      let totalEntries = 0;
      let totalSize = 0;
      let oldestEntry = null;
      let newestEntry = null;

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);

        if (key?.startsWith(this.cachePrefix) && key.includes('_meta_')) {
          try {
            const metadata = JSON.parse(localStorage.getItem(key));
            totalEntries++;
            totalSize += metadata.size || 0;

            if (!oldestEntry || metadata.timestamp < oldestEntry) {
              oldestEntry = metadata.timestamp;
            }
            if (!newestEntry || metadata.timestamp > newestEntry) {
              newestEntry = metadata.timestamp;
            }
          } catch (error) {
            // Skip invalid entries
          }
        }
      }

      return {
        totalEntries,
        totalSize,
        oldestEntry: oldestEntry ? new Date(oldestEntry) : null,
        newestEntry: newestEntry ? new Date(newestEntry) : null,
        cacheVersion: this.cacheVersion
      };
    } catch (error) {
      console.warn('Error getting cache stats:', error);
      return null;
    }
  }

  /**
   * Performance monitoring
   */
  setupPerformanceMonitoring() {
    this.performanceMetrics = {
      cacheHits: 0,
      cacheMisses: 0,
      networkRequests: 0,
      errors: 0,
      downloads: 0,
      avgLoadTime: 0,
      loadTimes: []
    };
  }

  startPerformanceTracking(operation, token) {
    const id = `${operation}_${token}_${Date.now()}`;
    this.performanceMarks.set(id, {
      startTime: performance.now(),
      operation,
      token
    });
    return id;
  }

  endPerformanceTracking(id, type) {
    const mark = this.performanceMarks.get(id);
    if (!mark) return;

    const duration = performance.now() - mark.startTime;
    this.performanceMarks.delete(id);

    // Update metrics
    this.performanceMetrics.loadTimes.push(duration);
    if (this.performanceMetrics.loadTimes.length > 100) {
      this.performanceMetrics.loadTimes.shift(); // Keep only last 100
    }

    const avg = this.performanceMetrics.loadTimes.reduce((a, b) => a + b, 0) / this.performanceMetrics.loadTimes.length;
    this.performanceMetrics.avgLoadTime = Math.round(avg);

    console.log(`QR ${mark.operation} (${type}): ${Math.round(duration)}ms`);
  }

  trackPerformance(type, token) {
    switch (type) {
      case 'qr_cache_hit':
        this.performanceMetrics.cacheHits++;
        break;
      case 'qr_cache_miss':
        this.performanceMetrics.cacheMisses++;
        this.performanceMetrics.networkRequests++;
        break;
      case 'qr_download':
        this.performanceMetrics.downloads++;
        break;
      case 'qr_error':
        this.performanceMetrics.errors++;
        break;
    }
  }

  /**
   * Inject skeleton styles
   */
  injectSkeletonStyles() {
    if (document.getElementById('qr-skeleton-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'qr-skeleton-styles';
    styles.textContent = `
      .qr-skeleton {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 30px 20px;
        background: #f8f9fa;
        border-radius: 8px;
      }

      .qr-skeleton-image {
        width: 250px;
        height: 250px;
        background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
        background-size: 200% 100%;
        animation: qr-skeleton-loading 1.5s infinite;
        border-radius: 8px;
        margin-bottom: 15px;
      }

      .qr-skeleton-text {
        width: 180px;
        height: 16px;
        background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
        background-size: 200% 100%;
        animation: qr-skeleton-loading 1.5s infinite;
        border-radius: 4px;
        margin-bottom: 15px;
      }

      .qr-skeleton-button {
        width: 150px;
        height: 36px;
        background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
        background-size: 200% 100%;
        animation: qr-skeleton-loading 1.5s infinite;
        border-radius: 6px;
      }

      @keyframes qr-skeleton-loading {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }

      .qr-code-display {
        text-align: center;
      }

      .qr-code-image {
        width: 250px;
        height: 250px;
        padding: 10px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        margin-bottom: 15px;
      }

      .qr-instructions {
        margin-bottom: 15px;
        font-size: 14px;
        color: #666;
      }

      .qr-download-button, .qr-retry-button {
        padding: 8px 16px;
        background: #ce1126;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s ease;
      }

      .qr-download-button:hover, .qr-retry-button:hover {
        background: #a50e1f;
        transform: translateY(-1px);
      }

      .qr-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 30px 20px;
        background: #ffeaea;
        border: 2px dashed #d32f2f;
        border-radius: 8px;
        color: #d32f2f;
      }

      .qr-error-icon {
        font-size: 48px;
        margin-bottom: 15px;
      }

      .qr-error-message {
        text-align: center;
        margin-bottom: 15px;
        font-size: 14px;
      }

      @media (max-width: 480px) {
        .qr-skeleton-image, .qr-code-image {
          width: 220px;
          height: 220px;
        }
      }

      /* Dark mode support */
      [data-theme="dark"] .qr-skeleton {
        background: #3a3a3a;
      }

      [data-theme="dark"] .qr-skeleton-image,
      [data-theme="dark"] .qr-skeleton-text,
      [data-theme="dark"] .qr-skeleton-button {
        background: linear-gradient(90deg, #4a4a4a 25%, #5a5a5a 50%, #4a4a4a 75%);
        background-size: 200% 100%;
      }

      [data-theme="dark"] .qr-error {
        background: #4a2525;
        border-color: #d32f2f;
        color: #ff6b6b;
      }
    `;

    document.head.appendChild(styles);
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      cacheStats: this.getCacheStats()
    };
  }
}

// Create global instance
window.qrCacheManager = new QRCacheManager();

// Export for module usage
export default QRCacheManager;

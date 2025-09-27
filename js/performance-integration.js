/**
 * Performance Integration Script
 *
 * Simple integration script that initializes all performance optimizations
 * across the application with minimal configuration required
 */

class PerformanceIntegration {
  constructor() {
    this.initialized = false;
    this.modules = {
      qrCache: null,
      walletLazy: null,
      swManager: null,
      dashboard: null
    };

    this.init();
  }

  async init() {
    if (this.initialized) return;

    try {
      // Initialize in optimal order
      await this.initializeServiceWorker();
      await this.initializeQRCache();
      await this.initializeWalletLazy();
      await this.initializeDashboard();

      this.setupGlobalHelpers();
      this.initialized = true;

      console.log('🚀 Performance optimizations initialized successfully');
    } catch (error) {
      console.error('Performance integration failed:', error);
    }
  }

  async initializeServiceWorker() {
    try {
      // Import and initialize service worker manager
      const { default: ServiceWorkerManager } = await import('/js/sw-registration.js');
      this.modules.swManager = new ServiceWorkerManager();
    } catch (error) {
      console.warn('Service Worker initialization failed:', error);
    }
  }

  async initializeQRCache() {
    try {
      // QR cache manager should already be loaded
      if (window.qrCacheManager) {
        this.modules.qrCache = window.qrCacheManager;
        console.log('✅ QR Cache Manager ready');
      }
    } catch (error) {
      console.warn('QR Cache initialization failed:', error);
    }
  }

  async initializeWalletLazy() {
    try {
      // Wallet lazy loader should already be loaded
      if (window.walletLazyLoader) {
        this.modules.walletLazy = window.walletLazyLoader;
        console.log('✅ Wallet Lazy Loader ready');
      }
    } catch (error) {
      console.warn('Wallet Lazy Loader initialization failed:', error);
    }
  }

  async initializeDashboard() {
    try {
      // Only load dashboard in development or when needed
      if (this.shouldLoadDashboard()) {
        await import('/js/performance-dashboard.js');
        this.modules.dashboard = window.performanceDashboard;
        console.log('✅ Performance Dashboard ready (Ctrl+Shift+P to open)');
      }
    } catch (error) {
      console.warn('Performance Dashboard initialization failed:', error);
    }
  }

  shouldLoadDashboard() {
    // Load dashboard in development or when explicitly requested
    return (
      window.location.hostname === 'localhost' ||
      window.location.hostname.includes('vercel.app') ||
      localStorage.getItem('enable-performance-dashboard') === 'true' ||
      window.location.search.includes('debug=true')
    );
  }

  setupGlobalHelpers() {
    // Global performance utilities
    window.perf = {
      // Quick access to modules
      qr: this.modules.qrCache,
      wallet: this.modules.walletLazy,
      sw: this.modules.swManager,
      dashboard: this.modules.dashboard,

      // Utility functions
      showDashboard: () => this.modules.dashboard?.show(),
      hideDashboard: () => this.modules.dashboard?.hide(),
      clearCache: () => this.clearAllCaches(),
      getStats: () => this.getAllStats(),

      // Quick performance tests
      testQR: (token) => this.testQRPerformance(token),
      testWallet: (ticketId) => this.testWalletPerformance(ticketId),

      // Enable/disable features
      enableDashboard: () => {
        localStorage.setItem('enable-performance-dashboard', 'true');
        window.location.reload();
      },
      disableDashboard: () => {
        localStorage.removeItem('enable-performance-dashboard');
        this.modules.dashboard?.hide();
      }
    };

    // Add helpful console messages
    console.log('🔧 Performance utilities available at window.perf');
    console.log('  • window.perf.showDashboard() - Open performance dashboard');
    console.log('  • window.perf.clearCache() - Clear all caches');
    console.log('  • window.perf.getStats() - Get performance statistics');
  }

  async clearAllCaches() {
    const results = {
      qrCache: false,
      walletCache: false,
      serviceWorker: false,
      localStorage: false
    };

    try {
      // Clear QR cache
      if (this.modules.qrCache) {
        this.modules.qrCache.cleanExpiredCache();
        results.qrCache = true;
      }

      // Clear localStorage performance data
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('alocubano_qr_') || key.includes('performance'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      results.localStorage = keysToRemove.length > 0;

      // Clear service worker cache
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        for (const cacheName of cacheNames) {
          if (cacheName.includes('alocubano') || cacheName.includes('qr-cache')) {
            await caches.delete(cacheName);
            results.serviceWorker = true;
          }
        }
      }

      console.log('🧹 Cache clearing results:', results);
      return results;

    } catch (error) {
      console.error('Error clearing caches:', error);
      return results;
    }
  }

  getAllStats() {
    const stats = {
      timestamp: new Date().toISOString(),
      qrCache: this.modules.qrCache?.getPerformanceMetrics() || null,
      wallet: this.modules.walletLazy?.getPerformanceMetrics() || null,
      serviceWorker: this.modules.swManager?.getStatus() || 'unknown',
      browser: {
        userAgent: navigator.userAgent,
        online: navigator.onLine,
        connection: navigator.connection ? {
          effectiveType: navigator.connection.effectiveType,
          downlink: navigator.connection.downlink
        } : null
      }
    };

    console.table(stats);
    return stats;
  }

  async testQRPerformance(token) {
    if (!this.modules.qrCache || !token) {
      console.error('QR Cache not available or token missing');
      return null;
    }

    const container = document.createElement('div');
    const start = performance.now();

    try {
      await this.modules.qrCache.loadQRCode(token, container);
      const end = performance.now();
      const duration = Math.round(end - start);

      console.log(`🎯 QR Performance Test: ${duration}ms for token ${token.substring(0, 8)}...`);
      return { token, duration, cached: this.modules.qrCache.isCached(token) };

    } catch (error) {
      console.error('QR performance test failed:', error);
      return { token, error: error.message };
    }
  }

  async testWalletPerformance(ticketId) {
    if (!this.modules.walletLazy || !ticketId) {
      console.error('Wallet Lazy Loader not available or ticketId missing');
      return null;
    }

    const container = document.createElement('div');
    container.style.visibility = 'hidden';
    document.body.appendChild(container);

    const start = performance.now();

    try {
      this.modules.walletLazy.observeWalletContainer(container, ticketId);

      // Wait for loading to complete
      await new Promise(resolve => {
        const observer = new MutationObserver(() => {
          if (container.querySelector('.wallet-button')) {
            observer.disconnect();
            resolve();
          }
        });
        observer.observe(container, { childList: true, subtree: true });

        // Timeout after 5 seconds
        setTimeout(resolve, 5000);
      });

      const end = performance.now();
      const duration = Math.round(end - start);

      console.log(`📱 Wallet Performance Test: ${duration}ms for ticket ${ticketId}`);
      return { ticketId, duration };

    } catch (error) {
      console.error('Wallet performance test failed:', error);
      return { ticketId, error: error.message };
    } finally {
      document.body.removeChild(container);
    }
  }

  // Check if optimizations are working
  getHealthStatus() {
    const health = {
      qrCache: !!this.modules.qrCache && this.modules.qrCache.getCacheStats().totalEntries >= 0,
      walletLazy: !!this.modules.walletLazy,
      serviceWorker: this.modules.swManager?.isControlling() || false,
      dashboard: !!this.modules.dashboard,
      overall: 'unknown'
    };

    const score = Object.values(health).filter(v => v === true).length;
    health.overall = score >= 3 ? 'excellent' : score >= 2 ? 'good' : score >= 1 ? 'limited' : 'poor';

    return health;
  }
}

// Initialize performance integration
const performanceIntegration = new PerformanceIntegration();

// Export for debugging
window.performanceIntegration = performanceIntegration;

export default PerformanceIntegration;
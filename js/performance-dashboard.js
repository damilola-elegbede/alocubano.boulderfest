/**
 * Performance Dashboard
 *
 * Real-time monitoring and debugging tools for QR cache and wallet performance
 * Includes visual performance metrics and optimization recommendations
 */

class PerformanceDashboard {
  constructor() {
    this.isVisible = false;
    this.updateInterval = null;
    this.refreshRate = 1000; // 1 second

    this.init();
  }

  init() {
    // Add keyboard shortcut to toggle dashboard
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+P or Cmd+Shift+P
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        this.toggle();
      }
    });

    // Add to console for manual access
    window.performanceDashboard = this;
    console.log('Performance Dashboard: Press Ctrl+Shift+P to toggle or use window.performanceDashboard.show()');
  }

  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  show() {
    if (this.isVisible) return;

    this.createDashboard();
    this.isVisible = true;

    // Start updating metrics
    this.updateInterval = setInterval(() => {
      this.updateMetrics();
    }, this.refreshRate);

    console.log('Performance Dashboard opened');
  }

  hide() {
    if (!this.isVisible) return;

    const dashboard = document.getElementById('performance-dashboard');
    if (dashboard) {
      dashboard.remove();
    }

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    this.isVisible = false;
    console.log('Performance Dashboard closed');
  }

  createDashboard() {
    // Remove existing dashboard if any
    const existing = document.getElementById('performance-dashboard');
    if (existing) existing.remove();

    const dashboard = document.createElement('div');
    dashboard.id = 'performance-dashboard';
    dashboard.innerHTML = `
      <div class="perf-dashboard">
        <div class="perf-header">
          <h3>🚀 Performance Dashboard</h3>
          <button class="perf-close" onclick="window.performanceDashboard.hide()">×</button>
        </div>

        <div class="perf-content">
          <div class="perf-section">
            <h4>🎯 QR Cache Performance</h4>
            <div id="qr-metrics" class="perf-metrics">
              <div class="perf-metric">
                <span class="metric-label">Cache Hits:</span>
                <span class="metric-value" id="qr-cache-hits">-</span>
              </div>
              <div class="perf-metric">
                <span class="metric-label">Cache Misses:</span>
                <span class="metric-value" id="qr-cache-misses">-</span>
              </div>
              <div class="perf-metric">
                <span class="metric-label">Hit Rate:</span>
                <span class="metric-value" id="qr-hit-rate">-</span>
              </div>
              <div class="perf-metric">
                <span class="metric-label">Avg Load Time:</span>
                <span class="metric-value" id="qr-avg-load">-</span>
              </div>
              <div class="perf-metric">
                <span class="metric-label">Cache Size:</span>
                <span class="metric-value" id="qr-cache-size">-</span>
              </div>
              <div class="perf-metric">
                <span class="metric-label">Storage Used:</span>
                <span class="metric-value" id="qr-storage-used">-</span>
              </div>
            </div>
          </div>

          <div class="perf-section">
            <h4>📱 Wallet Performance</h4>
            <div id="wallet-metrics" class="perf-metrics">
              <div class="perf-metric">
                <span class="metric-label">Components Loaded:</span>
                <span class="metric-value" id="wallet-loaded">-</span>
              </div>
              <div class="perf-metric">
                <span class="metric-label">Avg Load Time:</span>
                <span class="metric-value" id="wallet-avg-load">-</span>
              </div>
              <div class="perf-metric">
                <span class="metric-label">Errors:</span>
                <span class="metric-value" id="wallet-errors">-</span>
              </div>
              <div class="perf-metric">
                <span class="metric-label">Observed Elements:</span>
                <span class="metric-value" id="wallet-observed">-</span>
              </div>
            </div>
          </div>

          <div class="perf-section">
            <h4>🔧 Actions</h4>
            <div class="perf-actions">
              <button onclick="window.performanceDashboard.clearQRCache()">Clear QR Cache</button>
              <button onclick="window.performanceDashboard.preloadAllQRs()">Preload All QRs</button>
              <button onclick="window.performanceDashboard.resetMetrics()">Reset Metrics</button>
              <button onclick="window.performanceDashboard.exportMetrics()">Export Data</button>
            </div>
          </div>

          <div class="perf-section">
            <h4>📊 Recommendations</h4>
            <div id="recommendations" class="perf-recommendations">
              <div class="loading">Analyzing performance...</div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Inject styles
    this.injectStyles();

    // Add to page
    document.body.appendChild(dashboard);

    // Initial metrics update
    setTimeout(() => this.updateMetrics(), 100);
  }

  updateMetrics() {
    // QR Cache Metrics
    const qrMetrics = window.qrCacheManager?.getPerformanceMetrics() || {};
    const qrStats = window.qrCacheManager?.getCacheStats() || {};

    this.updateElement('qr-cache-hits', qrMetrics.cacheHits || 0);
    this.updateElement('qr-cache-misses', qrMetrics.cacheMisses || 0);

    const hitRate = qrMetrics.cacheHits && qrMetrics.cacheMisses ?
      Math.round((qrMetrics.cacheHits / (qrMetrics.cacheHits + qrMetrics.cacheMisses)) * 100) : 0;
    this.updateElement('qr-hit-rate', `${hitRate}%`);

    this.updateElement('qr-avg-load', `${qrMetrics.avgLoadTime || 0}ms`);
    this.updateElement('qr-cache-size', qrStats.totalEntries || 0);
    this.updateElement('qr-storage-used', this.formatBytes(qrStats.totalSize || 0));

    // Wallet Metrics
    const walletMetrics = window.walletLazyLoader?.getPerformanceMetrics() || {};

    this.updateElement('wallet-loaded', walletMetrics.loadedComponents || 0);
    this.updateElement('wallet-avg-load', `${walletMetrics.avgLoadTime || 0}ms`);
    this.updateElement('wallet-errors', walletMetrics.errors || 0);
    this.updateElement('wallet-observed', walletMetrics.observedElements || 0);

    // Update recommendations
    this.updateRecommendations(qrMetrics, walletMetrics, qrStats);
  }

  updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  updateRecommendations(qrMetrics, walletMetrics, qrStats) {
    const recommendations = [];

    // QR Cache recommendations
    if (qrMetrics.cacheHits && qrMetrics.cacheMisses) {
      const hitRate = qrMetrics.cacheHits / (qrMetrics.cacheHits + qrMetrics.cacheMisses);
      if (hitRate < 0.7) {
        recommendations.push({
          type: 'warning',
          message: `Low cache hit rate (${Math.round(hitRate * 100)}%). Consider preloading QR codes.`
        });
      } else if (hitRate > 0.9) {
        recommendations.push({
          type: 'success',
          message: `Excellent cache hit rate (${Math.round(hitRate * 100)}%)! 🎉`
        });
      }
    }

    if (qrMetrics.avgLoadTime > 1000) {
      recommendations.push({
        type: 'warning',
        message: `QR load time is high (${qrMetrics.avgLoadTime}ms). Check network or optimize images.`
      });
    }

    if (qrStats.totalEntries > 20) {
      recommendations.push({
        type: 'info',
        message: `Large QR cache (${qrStats.totalEntries} items). Consider periodic cleanup.`
      });
    }

    // Wallet recommendations
    if (walletMetrics.errors > 0) {
      recommendations.push({
        type: 'error',
        message: `${walletMetrics.errors} wallet loading errors detected. Check console for details.`
      });
    }

    if (walletMetrics.avgLoadTime > 500) {
      recommendations.push({
        type: 'warning',
        message: `Wallet components loading slowly (${walletMetrics.avgLoadTime}ms). Consider network optimization.`
      });
    }

    // Performance recommendations
    if (this.isSlowConnection()) {
      recommendations.push({
        type: 'info',
        message: 'Slow connection detected. Aggressive preloading is recommended.'
      });
    }

    this.renderRecommendations(recommendations);
  }

  renderRecommendations(recommendations) {
    const container = document.getElementById('recommendations');
    if (!container) return;

    if (recommendations.length === 0) {
      container.innerHTML = '<div class="rec-success">✅ All systems performing optimally!</div>';
      return;
    }

    const html = recommendations.map(rec => `
      <div class="rec-item rec-${rec.type}">
        ${this.getIconForType(rec.type)} ${rec.message}
      </div>
    `).join('');

    container.innerHTML = html;
  }

  getIconForType(type) {
    const icons = {
      success: '✅',
      warning: '⚠️',
      error: '❌',
      info: 'ℹ️'
    };
    return icons[type] || 'ℹ️';
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  isSlowConnection() {
    if ('connection' in navigator) {
      const connection = navigator.connection;
      return connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g';
    }
    return false;
  }

  // Action methods
  clearQRCache() {
    if (window.qrCacheManager) {
      // Clear cache entries
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('alocubano_qr_')) {
          localStorage.removeItem(key);
        }
      }
      console.log('QR cache cleared');
      this.updateMetrics();
    }
  }

  preloadAllQRs() {
    // Find all QR tokens on the page and preload them
    const tokens = this.extractQRTokensFromPage();
    console.log(`Preloading ${tokens.length} QR codes...`);

    tokens.forEach(token => {
      if (window.qrCacheManager) {
        window.qrCacheManager.preloadQRCode(token);
      }
    });
  }

  extractQRTokensFromPage() {
    const tokens = [];

    // Look for tickets with data attributes
    const ticketElements = document.querySelectorAll('[data-ticket-id], [data-token]');
    ticketElements.forEach(el => {
      const token = el.getAttribute('data-token') || el.getAttribute('data-ticket-id');
      if (token) tokens.push(token);
    });

    // Look in URLs
    const links = document.querySelectorAll('a[href*="token="]');
    links.forEach(link => {
      const url = new URL(link.href, window.location.origin);
      const token = url.searchParams.get('token');
      if (token) tokens.push(token);
    });

    return [...new Set(tokens)]; // Remove duplicates
  }

  resetMetrics() {
    if (window.qrCacheManager) {
      window.qrCacheManager.setupPerformanceMonitoring();
    }
    if (window.walletLazyLoader) {
      window.walletLazyLoader.performanceMetrics = {
        loads: 0,
        errors: 0,
        avgLoadTime: 0,
        loadTimes: []
      };
    }
    console.log('Performance metrics reset');
    this.updateMetrics();
  }

  exportMetrics() {
    const data = {
      timestamp: new Date().toISOString(),
      qrCache: window.qrCacheManager?.getPerformanceMetrics() || {},
      wallet: window.walletLazyLoader?.getPerformanceMetrics() || {},
      page: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        connection: navigator.connection ? {
          effectiveType: navigator.connection.effectiveType,
          downlink: navigator.connection.downlink
        } : null
      }
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `performance-metrics-${Date.now()}.json`;
    link.click();

    URL.revokeObjectURL(url);
    console.log('Performance metrics exported');
  }

  injectStyles() {
    if (document.getElementById('performance-dashboard-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'performance-dashboard-styles';
    styles.textContent = `
      .perf-dashboard {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 400px;
        max-height: 80vh;
        background: white;
        border: 2px solid #333;
        border-radius: 8px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        overflow: hidden;
      }

      .perf-header {
        background: #333;
        color: white;
        padding: 12px 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .perf-header h3 {
        margin: 0;
        font-size: 16px;
      }

      .perf-close {
        background: none;
        border: none;
        color: white;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .perf-close:hover {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 4px;
      }

      .perf-content {
        max-height: calc(80vh - 60px);
        overflow-y: auto;
        padding: 16px;
      }

      .perf-section {
        margin-bottom: 20px;
      }

      .perf-section h4 {
        margin: 0 0 10px 0;
        font-size: 14px;
        color: #333;
        border-bottom: 1px solid #eee;
        padding-bottom: 5px;
      }

      .perf-metrics {
        display: grid;
        gap: 8px;
      }

      .perf-metric {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
      }

      .metric-label {
        color: #666;
      }

      .metric-value {
        font-weight: 600;
        color: #333;
        font-family: monospace;
      }

      .perf-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      .perf-actions button {
        padding: 8px 12px;
        border: 1px solid #ddd;
        background: white;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;
      }

      .perf-actions button:hover {
        background: #f5f5f5;
        border-color: #999;
      }

      .perf-recommendations {
        font-size: 12px;
      }

      .rec-item {
        padding: 8px;
        border-radius: 4px;
        margin-bottom: 6px;
        border-left: 3px solid;
      }

      .rec-success {
        background: #d4edda;
        color: #155724;
        border-left-color: #28a745;
      }

      .rec-warning {
        background: #fff3cd;
        color: #856404;
        border-left-color: #ffc107;
      }

      .rec-error {
        background: #f8d7da;
        color: #721c24;
        border-left-color: #dc3545;
      }

      .rec-info {
        background: #d1ecf1;
        color: #0c5460;
        border-left-color: #17a2b8;
      }

      .loading {
        color: #666;
        font-style: italic;
      }

      /* Dark mode support */
      [data-theme="dark"] .perf-dashboard {
        background: #2d2d2d;
        border-color: #555;
        color: #fff;
      }

      [data-theme="dark"] .perf-section h4 {
        color: #fff;
        border-bottom-color: #555;
      }

      [data-theme="dark"] .metric-label {
        color: #ccc;
      }

      [data-theme="dark"] .metric-value {
        color: #fff;
      }

      [data-theme="dark"] .perf-actions button {
        background: #404040;
        border-color: #555;
        color: #fff;
      }

      [data-theme="dark"] .perf-actions button:hover {
        background: #505050;
        border-color: #777;
      }
    `;

    document.head.appendChild(styles);
  }
}

// Initialize performance dashboard
const performanceDashboard = new PerformanceDashboard();

// Export for global access
window.PerformanceDashboard = PerformanceDashboard;
export default PerformanceDashboard;
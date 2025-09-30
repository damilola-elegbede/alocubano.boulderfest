/**
 * Wallet Lazy Loader
 *
 * Advanced lazy loading system for wallet components with:
 * - Intersection Observer for viewport detection
 * - Dynamic imports with fallback
 * - Resource hints and prefetching
 * - Performance monitoring
 * - Graceful degradation
 */

class WalletLazyLoader {
  constructor() {
    this.observerOptions = {
      root: null,
      rootMargin: '100px', // Load 100px before coming into view
      threshold: 0.1
    };

    this.loadedComponents = new Set();
    this.observers = new Map();
    this.performanceMetrics = {
      loads: 0,
      errors: 0,
      avgLoadTime: 0,
      loadTimes: []
    };

    this.init();
  }

  init() {
    this.setupIntersectionObserver();
    this.setupResourceHints();
    this.preloadWalletAssets();
  }

  /**
   * Setup Intersection Observer for lazy loading
   */
  setupIntersectionObserver() {
    if (!('IntersectionObserver' in window)) {
      // Fallback for browsers without Intersection Observer
      this.loadAllWalletComponents();
      return;
    }

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          this.loadWalletComponent(entry.target);
        }
      });
    }, this.observerOptions);
  }

  /**
   * Add resource hints for better performance
   */
  setupResourceHints() {
    // DNS prefetch for wallet API endpoints
    this.addResourceHint('dns-prefetch', '//pay.google.com');
    this.addResourceHint('dns-prefetch', '//wallet.apple.com');

    // Preconnect to Apple Wallet API
    this.addResourceHint('preconnect', 'https://wallet.apple.com');
    this.addResourceHint('preconnect', 'https://pay.google.com');
  }

  /**
   * Preload critical wallet assets
   */
  async preloadWalletAssets() {
    try {
      // Preload wallet button styles and icons
      this.addResourceHint('prefetch', '/images/payment-icons/apple-pay.svg');
      this.addResourceHint('prefetch', '/images/payment-icons/card_google-pay.svg');

      // Prefetch wallet buttons module if user is likely to need it
      if (this.shouldPreloadWalletModule()) {
        this.preloadWalletModule();
      }
    } catch (error) {
      console.warn('Error preloading wallet assets:', error);
    }
  }

  /**
   * Determine if wallet module should be preloaded
   */
  shouldPreloadWalletModule() {
    // Preload if user is on ticket-related pages
    const path = window.location.pathname.toLowerCase();
    const walletPages = [
      'my-ticket',
      'my-tickets',
      'register-tickets',
      'success',
      'tickets'
    ];

    return walletPages.some(page => path.includes(page));
  }

  /**
   * Preload wallet module in background
   */
  async preloadWalletModule() {
    try {
      // Use dynamic import to preload the module
      const modulePromise = import('/js/wallet-buttons.js');

      // Don't await - let it load in background
      modulePromise.catch(error => {
        console.warn('Wallet module preload failed:', error);
      });

      console.log('Wallet module preload initiated');
    } catch (error) {
      console.warn('Error initiating wallet module preload:', error);
    }
  }

  /**
   * Observe wallet container for lazy loading
   */
  observeWalletContainer(container, ticketId, options = {}) {
    if (!container || this.loadedComponents.has(container)) return;

    // Mark as being observed
    container.setAttribute('data-wallet-lazy', 'true');
    container.setAttribute('data-ticket-id', ticketId);
    container.setAttribute('data-wallet-options', JSON.stringify(options));

    // Track in observers Map for metrics
    this.observers.set(container, {
      ticketId,
      options,
      timestamp: Date.now()
    });

    // Add to observer
    if (this.observer) {
      this.observer.observe(container);
    } else {
      // Fallback: load immediately
      this.loadWalletComponent(container);
    }
  }

  /**
   * Load wallet component when it comes into view
   */
  async loadWalletComponent(container) {
    if (this.loadedComponents.has(container)) return;

    const startTime = performance.now();
    const ticketId = container.getAttribute('data-ticket-id');
    const options = JSON.parse(container.getAttribute('data-wallet-options') || '{}');

    try {
      // Mark as loading
      container.classList.add('wallet-loading');
      this.showWalletSkeleton(container);

      // Load wallet buttons module
      const WalletButtons = await this.loadWalletModule();

      // Create wallet buttons
      const walletButtons = WalletButtons.createInlineButtons(ticketId, {
        title: options.title || 'Add to Wallet',
        size: options.size || 'default',
        showBothOnDesktop: options.showBothOnDesktop !== false,
        className: options.className || 'wallet-buttons-lazy-loaded'
      });

      // Replace skeleton with actual buttons
      container.innerHTML = '';
      container.appendChild(walletButtons);

      // Mark as loaded
      container.classList.remove('wallet-loading');
      container.classList.add('wallet-loaded');
      this.loadedComponents.add(container);

      // Stop observing and remove from tracking
      if (this.observer) {
        this.observer.unobserve(container);
      }
      this.observers.delete(container);

      // Track performance
      const loadTime = performance.now() - startTime;
      this.trackPerformance('load', loadTime);

      console.log(`Wallet component loaded for ticket ${ticketId} in ${Math.round(loadTime)}ms`);

    } catch (error) {
      console.error('Failed to load wallet component:', error);
      this.showWalletError(container, error.message);
      this.trackPerformance('error');
    }
  }

  /**
   * Load wallet module with fallback
   */
  async loadWalletModule() {
    try {
      // Try dynamic import first
      const module = await import('/js/wallet-buttons.js');
      return module.default || window.WalletButtons;
    } catch (error) {
      console.warn('Dynamic import failed, falling back to global:', error);

      // Fallback: check if global is available
      if (window.WalletButtons) {
        return window.WalletButtons;
      }

      // Last resort: load script manually
      return this.loadWalletScript();
    }
  }

  /**
   * Manually load wallet script as fallback
   */
  loadWalletScript() {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (window.WalletButtons) {
        resolve(window.WalletButtons);
        return;
      }

      const script = document.createElement('script');
      script.src = '/js/wallet-buttons.js';
      script.onload = () => {
        if (window.WalletButtons) {
          resolve(window.WalletButtons);
        } else {
          reject(new Error('WalletButtons not available after script load'));
        }
      };
      script.onerror = () => reject(new Error('Failed to load wallet script'));

      document.head.appendChild(script);
    });
  }

  /**
   * Show wallet skeleton while loading
   */
  showWalletSkeleton(container) {
    container.innerHTML = `
      <div class="wallet-skeleton">
        <div class="wallet-skeleton-title"></div>
        <div class="wallet-skeleton-buttons">
          <div class="wallet-skeleton-button"></div>
          <div class="wallet-skeleton-button"></div>
        </div>
      </div>
    `;

    this.injectWalletSkeletonStyles();
  }

  /**
   * Show wallet error state
   */
  showWalletError(container, message) {
    // Create error UI structure safely
    container.innerHTML = `
      <div class="wallet-error">
        <div class="wallet-error-icon">⚠️</div>
        <div class="wallet-error-message">
          Unable to load wallet options<br>
          <small class="wallet-error-detail"></small>
        </div>
        <button
          class="wallet-retry-button"
          onclick="walletLazyLoader.retryWalletLoad(this.closest('[data-ticket-id]'))"
        >
          Try Again
        </button>
      </div>
    `;

    // Safely set error message using textContent (XSS-safe)
    const detailEl = container.querySelector('.wallet-error-detail');
    if (detailEl) {
      detailEl.textContent = message;
    }
  }

  /**
   * Retry loading wallet component
   */
  retryWalletLoad(container) {
    if (!container) return;

    // Remove from loaded set to allow reload
    this.loadedComponents.delete(container);

    // Clear error state
    container.classList.remove('wallet-error');

    // Reload
    this.loadWalletComponent(container);
  }

  /**
   * Load all wallet components immediately (fallback)
   */
  loadAllWalletComponents() {
    const containers = document.querySelectorAll('[data-wallet-lazy="true"]');
    containers.forEach(container => {
      this.loadWalletComponent(container);
    });
  }

  /**
   * Add resource hint to document head
   */
  addResourceHint(rel, href) {
    // Check if hint already exists
    if (document.querySelector(`link[rel="${rel}"][href="${href}"]`)) return;

    const link = document.createElement('link');
    link.rel = rel;
    link.href = href;
    document.head.appendChild(link);
  }

  /**
   * Inject wallet skeleton styles
   */
  injectWalletSkeletonStyles() {
    if (document.getElementById('wallet-skeleton-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'wallet-skeleton-styles';
    styles.textContent = `
      .wallet-skeleton {
        padding: 20px;
        background: var(--color-surface, #f8f9fa);
        border-radius: 8px;
        text-align: center;
      }

      .wallet-skeleton-title {
        width: 120px;
        height: 16px;
        background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
        background-size: 200% 100%;
        animation: wallet-skeleton-loading 1.5s infinite;
        border-radius: 4px;
        margin: 0 auto 15px;
      }

      .wallet-skeleton-buttons {
        display: flex;
        gap: 12px;
        justify-content: center;
        flex-wrap: wrap;
      }

      .wallet-skeleton-button {
        width: 160px;
        height: 44px;
        background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
        background-size: 200% 100%;
        animation: wallet-skeleton-loading 1.5s infinite;
        border-radius: 8px;
      }

      @keyframes wallet-skeleton-loading {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }

      .wallet-error {
        padding: 20px;
        background: var(--color-error-light, #ffeaea);
        border: 1px solid var(--color-error, #d32f2f);
        border-radius: 8px;
        text-align: center;
        color: var(--color-error, #d32f2f);
      }

      .wallet-error-icon {
        font-size: 24px;
        margin-bottom: 10px;
      }

      .wallet-error-message {
        margin-bottom: 15px;
        font-size: 14px;
      }

      .wallet-retry-button {
        padding: 8px 16px;
        background: var(--color-error, #d32f2f);
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s ease;
      }

      .wallet-retry-button:hover {
        background: var(--color-error-dark, #b71c1c);
        transform: translateY(-1px);
      }

      .wallet-loading {
        opacity: 0.8;
      }

      .wallet-loaded {
        animation: wallet-fade-in 0.3s ease;
      }

      @keyframes wallet-fade-in {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* Mobile responsive */
      @media (max-width: 640px) {
        .wallet-skeleton-buttons {
          flex-direction: column;
          align-items: center;
        }

        .wallet-skeleton-button {
          width: 100%;
          max-width: 280px;
        }
      }

      /* Dark mode support */
      [data-theme="dark"] .wallet-skeleton {
        background: var(--color-surface-dark, #2d3748);
      }

      [data-theme="dark"] .wallet-skeleton-title,
      [data-theme="dark"] .wallet-skeleton-button {
        background: linear-gradient(90deg, #4a4a4a 25%, #5a5a5a 50%, #4a4a4a 75%);
        background-size: 200% 100%;
      }

      [data-theme="dark"] .wallet-error {
        background: var(--color-error-dark, #4a2525);
        color: var(--color-error-light, #ff6b6b);
      }
    `;

    document.head.appendChild(styles);
  }

  /**
   * Track performance metrics
   */
  trackPerformance(type, loadTime = null) {
    switch (type) {
      case 'load':
        this.performanceMetrics.loads++;
        if (loadTime !== null) {
          this.performanceMetrics.loadTimes.push(loadTime);
          if (this.performanceMetrics.loadTimes.length > 50) {
            this.performanceMetrics.loadTimes.shift();
          }
          const avg = this.performanceMetrics.loadTimes.reduce((a, b) => a + b, 0) / this.performanceMetrics.loadTimes.length;
          this.performanceMetrics.avgLoadTime = Math.round(avg);
        }
        break;
      case 'error':
        this.performanceMetrics.errors++;
        break;
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      loadedComponents: this.loadedComponents.size,
      observedElements: this.observers.size
    };
  }

  /**
   * Cleanup observers
   */
  destroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
    this.observers.clear();
    this.loadedComponents.clear();
  }

  /**
   * Static method to initialize lazy loading for wallet containers
   */
  static initializeLazyWallet(selector, ticketId, options = {}) {
    const containers = document.querySelectorAll(selector);
    containers.forEach(container => {
      window.walletLazyLoader.observeWalletContainer(container, ticketId, options);
    });
  }

  /**
   * Static method to create and observe a wallet container
   */
  static createLazyWalletContainer(ticketId, options = {}) {
    const container = document.createElement('div');
    container.className = 'wallet-lazy-container';
    container.setAttribute('data-testid', 'wallet-lazy-container');

    window.walletLazyLoader.observeWalletContainer(container, ticketId, options);
    return container;
  }
}

// Create global instance
window.walletLazyLoader = new WalletLazyLoader();

// Export for module usage
export default WalletLazyLoader;
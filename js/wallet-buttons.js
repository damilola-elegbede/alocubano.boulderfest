/**
 * Wallet Buttons Component
 * Provides Apple and Google Wallet download functionality with platform detection
 */

class WalletButtons {
  constructor() {
    this.platform = this.detectPlatform();
    // Click tracking ensured via static method
  }

  /**
   * Detect user's platform for optimal wallet experience
   */
  detectPlatform() {
    const userAgent = navigator.userAgent;

    // iOS detection (iPhone, iPad, iPod)
    const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;

    // Android detection
    const isAndroid = /Android/.test(userAgent);

    // Mac detection (for desktop users who might have iPhone)
    const isMac = /Macintosh|MacIntel|MacPPC|Mac68K/.test(userAgent);

    return {
      isIOS,
      isAndroid,
      isMac,
      isDesktop: !isIOS && !isAndroid,
      canUseAppleWallet: isIOS || isMac,
      canUseGoogleWallet: isAndroid || !isIOS, // Show Google Wallet for Android and desktop
    };
  }

  /**
   * Create wallet button container with appropriate buttons based on platform
   */
  createWalletButtons(ticketId, options = {}) {
    const {
      title = 'Add to Wallet',
      showBothOnDesktop = true,
      className = 'wallet-buttons-container',
      size = 'default' // 'small', 'default', 'large'
    } = options;

    const container = document.createElement('div');
    container.className = className;
    container.setAttribute('data-wallet-container', ticketId);

    // Add title if provided
    if (title) {
      const titleElement = document.createElement('h3');
      titleElement.className = 'wallet-title';
      titleElement.textContent = title;
      container.appendChild(titleElement);
    }

    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = `wallet-buttons wallet-buttons-${size}`;

    // Determine which buttons to show
    const showApple = this.platform.canUseAppleWallet && (this.platform.isIOS || showBothOnDesktop);
    const showGoogle = this.platform.canUseGoogleWallet && (this.platform.isAndroid || showBothOnDesktop);

    if (showApple) {
      const appleButton = this.createAppleWalletButton(ticketId, size);
      buttonsContainer.appendChild(appleButton);
    }

    if (showGoogle) {
      const googleButton = this.createGoogleWalletButton(ticketId, size);
      buttonsContainer.appendChild(googleButton);
    }

    // Add helpful text for desktop users
    if (this.platform.isDesktop && showBothOnDesktop) {
      const helpText = document.createElement('p');
      helpText.className = 'wallet-help-text';
      helpText.textContent = 'Choose your preferred wallet app';
      buttonsContainer.appendChild(helpText);
    }

    container.appendChild(buttonsContainer);
    return container;
  }

  /**
   * Create Apple Wallet button
   */
  createAppleWalletButton(ticketId, size = 'default') {
    const button = document.createElement('a');
    button.href = `/api/tickets/apple-wallet/${encodeURIComponent(ticketId)}`;
    button.className = `wallet-button wallet-button-apple wallet-button-${size}`;
    button.setAttribute('data-wallet-type', 'apple');
    button.setAttribute('data-ticket-id', ticketId);
    button.setAttribute('aria-label', 'Add ticket to Apple Wallet');

    // Add Apple logo and text
    button.innerHTML = `
      <img src="/images/add-to-wallet-apple.svg" alt="Add to Apple Wallet" class="wallet-icon" />
      <span class="wallet-text">Add to Apple Wallet</span>
    `;

    // Add click handler
    button.addEventListener('click', (e) => this.handleWalletClick(e, 'apple', ticketId));

    return button;
  }

  /**
   * Create Google Wallet button
   */
  createGoogleWalletButton(ticketId, size = 'default') {
    const button = document.createElement('a');
    button.href = `/api/tickets/google-wallet/${encodeURIComponent(ticketId)}`;
    button.className = `wallet-button wallet-button-google wallet-button-${size}`;
    button.setAttribute('data-wallet-type', 'google');
    button.setAttribute('data-ticket-id', ticketId);
    button.setAttribute('aria-label', 'Add ticket to Google Wallet');

    // Add Google logo and text
    button.innerHTML = `
      <img src="/images/add-to-wallet-google.png" alt="Add to Google Wallet" class="wallet-icon" />
      <span class="wallet-text">Add to Google Wallet</span>
    `;

    // Add click handler
    button.addEventListener('click', (e) => this.handleWalletClick(e, 'google', ticketId));

    return button;
  }

  /**
   * Handle wallet button clicks with error handling and analytics
   */
  async handleWalletClick(event, walletType, ticketId) {
    const button = event.currentTarget;

    // Track click for analytics
    this.trackWalletClick(walletType, ticketId);

    // Add loading state
    const originalContent = button.innerHTML;
    button.classList.add('wallet-button-loading');
    button.innerHTML = `
      <div class="wallet-loading-spinner"></div>
      <span class="wallet-text">Adding to ${walletType === 'apple' ? 'Apple' : 'Google'} Wallet...</span>
    `;

    try {
      // Let the browser handle the download naturally
      // The href will trigger the download

      // Show success state briefly
      setTimeout(() => {
        button.classList.remove('wallet-button-loading');
        button.classList.add('wallet-button-success');
        button.innerHTML = `
          <div class="wallet-success-icon">✓</div>
          <span class="wallet-text">Added to Wallet</span>
        `;

        // Reset after 3 seconds
        setTimeout(() => {
          button.classList.remove('wallet-button-success');
          button.innerHTML = originalContent;
        }, 3000);
      }, 1000);

    } catch (error) {
      console.error(`Error adding to ${walletType} wallet:`, error);

      // Show error state
      button.classList.remove('wallet-button-loading');
      button.classList.add('wallet-button-error');
      button.innerHTML = `
        <div class="wallet-error-icon">⚠</div>
        <span class="wallet-text">Try Again</span>
      `;

      // Reset after 3 seconds
      setTimeout(() => {
        button.classList.remove('wallet-button-error');
        button.innerHTML = originalContent;
      }, 3000);
    }
  }

  /**
   * Track wallet button clicks for analytics
   */
  trackWalletClick(walletType, ticketId) {
    // Track in localStorage for basic analytics
    try {
      const analytics = JSON.parse(localStorage.getItem('wallet_analytics') || '[]');
      analytics.push({
        timestamp: Date.now(),
        walletType,
        ticketId,
        platform: this.platform.isIOS ? 'ios' : this.platform.isAndroid ? 'android' : 'desktop'
      });

      // Keep only last 100 events
      if (analytics.length > 100) {
        analytics.splice(0, analytics.length - 100);
      }

      localStorage.setItem('wallet_analytics', JSON.stringify(analytics));
    } catch (error) {
      console.warn('Could not save wallet analytics:', error);
    }

    // Send to server analytics if available
    if (window.gtag) {
      window.gtag('event', 'wallet_button_click', {
        event_category: 'engagement',
        event_label: walletType,
        custom_parameters: {
          ticket_id: ticketId,
          platform: this.platform.isIOS ? 'ios' : this.platform.isAndroid ? 'android' : 'desktop'
        }
      });
    }

    console.log(`Wallet button clicked: ${walletType} for ticket ${ticketId}`);
  }

  /**
   * Setup global click tracking for wallet buttons (static to prevent duplicates)
   */
  static ensureClickTracking() {
    if (WalletButtons._clickTrackingRegistered) {
      return;
    }
    WalletButtons._clickTrackingRegistered = true;

    // Track wallet button interactions globally
    document.addEventListener('click', (event) => {
      if (event.target.closest('.wallet-button')) {
        const button = event.target.closest('.wallet-button');
        const walletType = button.getAttribute('data-wallet-type');
        const ticketId = button.getAttribute('data-ticket-id');

        // Additional analytics can be added here
        console.log(`Wallet interaction: ${walletType} wallet for ticket ${ticketId}`);
      }
    });
  }

  /**
   * Add wallet buttons to existing elements in the page
   */
  enhancePageWithWalletButtons(ticketSelector = '[data-ticket-id]') {
    const ticketElements = document.querySelectorAll(ticketSelector);

    ticketElements.forEach(element => {
      const ticketId = element.getAttribute('data-ticket-id');
      if (!ticketId) return;

      // Check if wallet buttons already exist
      const existingWallet = element.querySelector('.wallet-buttons-container');
      if (existingWallet) return;

      // Create wallet buttons
      const walletButtons = this.createWalletButtons(ticketId, {
        title: 'Add to Phone Wallet',
        size: 'default'
      });

      // Add to element
      element.appendChild(walletButtons);
    });
  }

  /**
   * Static method to create inline wallet buttons for any ticket ID
   */
  static createInlineButtons(ticketId, options = {}) {
    const wallet = new WalletButtons();
    return wallet.createWalletButtons(ticketId, options);
  }
}

// Initialize static flag and setup click tracking once
WalletButtons._clickTrackingRegistered = false;

// Setup click tracking immediately when module loads
WalletButtons.ensureClickTracking();

// Add CSS styles for wallet buttons
const walletStyles = `
  .wallet-buttons-container {
    margin: 20px 0;
    padding: 20px;
    background: var(--color-surface, #f8f9fa);
    border-radius: 8px;
    text-align: center;
  }

  .wallet-title {
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 15px 0;
    color: var(--color-text-primary, #333);
  }

  .wallet-buttons {
    display: flex;
    gap: 12px;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
  }

  .wallet-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 20px;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 500;
    font-size: 15px;
    transition: all 0.3s ease;
    min-height: 44px; /* Touch-friendly */
    min-width: 160px;
    border: 2px solid transparent;
    position: relative;
    overflow: hidden;
  }

  /* Size variants */
  .wallet-buttons-small .wallet-button {
    padding: 8px 16px;
    font-size: 14px;
    min-width: 140px;
    min-height: 40px;
  }

  .wallet-buttons-large .wallet-button {
    padding: 16px 24px;
    font-size: 16px;
    min-width: 180px;
    min-height: 48px;
  }

  .wallet-button-apple {
    background: #000;
    color: white;
  }

  .wallet-button-apple:hover {
    background: #333;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .wallet-button-google {
    background: #4285f4;
    color: white;
  }

  .wallet-button-google:hover {
    background: #3367d6;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(66, 133, 244, 0.3);
  }

  .wallet-icon {
    height: 40px;
    width: auto; /* Maintain aspect ratio */
  }

  .wallet-text {
    font-weight: 500;
  }

  .wallet-help-text {
    font-size: 12px;
    color: var(--color-text-secondary, #666);
    margin: 10px 0 0 0;
    font-style: italic;
  }

  /* Loading state */
  .wallet-button-loading {
    opacity: 0.8;
    cursor: wait;
  }

  .wallet-loading-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top: 2px solid white;
    border-radius: 50%;
    animation: wallet-spin 1s linear infinite;
  }

  /* Success state */
  .wallet-button-success {
    background: #10b981 !important;
  }

  .wallet-success-icon {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: white;
    color: #10b981;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: bold;
  }

  /* Error state */
  .wallet-button-error {
    background: #ef4444 !important;
  }

  .wallet-error-icon {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: white;
    color: #ef4444;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: bold;
  }

  @keyframes wallet-spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* Mobile optimization */
  @media (max-width: 640px) {
    .wallet-buttons {
      gap: 8px;
    }

    .wallet-button {
      flex: 1;
      max-width: 48%;
    }
  }

  /* Success page specific styles */
  .wallet-buttons-success-page .wallet-buttons-container {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    margin: var(--space-lg) 0;
  }

  /* Registration page specific styles */
  .wallet-buttons-registration .wallet-buttons-container {
    background: transparent;
    border: none;
    padding: var(--space-md) 0;
  }

  /* Dark mode support */
  [data-theme="dark"] .wallet-buttons-container {
    background: var(--color-surface-dark, #2d3748);
  }

  [data-theme="dark"] .wallet-title {
    color: var(--color-text-primary-dark, #f7fafc);
  }

  [data-theme="dark"] .wallet-help-text {
    color: var(--color-text-secondary-dark, #a0aec0);
  }

  /* Print styles */
  @media print {
    .wallet-buttons-container {
      display: none;
    }
  }
`;

// Inject styles into the page
function injectWalletStyles() {
  const styleSheet = document.createElement('style');
  styleSheet.type = 'text/css';
  styleSheet.innerHTML = walletStyles;
  document.head.appendChild(styleSheet);
}

// Auto-inject styles when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectWalletStyles);
} else {
  injectWalletStyles();
}

// Performance optimization: Track loading and usage
WalletButtons.performanceMetrics = {
  loadTime: Date.now(),
  buttonsCreated: 0,
  downloadsInitiated: 0,
  errors: 0
};

// Track performance
const originalCreateInlineButtons = WalletButtons.createInlineButtons;
WalletButtons.createInlineButtons = function(ticketId, options = {}) {
  WalletButtons.performanceMetrics.buttonsCreated++;
  return originalCreateInlineButtons.call(this, ticketId, options);
};

// Initialize performance monitoring
WalletButtons.getPerformanceMetrics = function() {
  return {
    ...WalletButtons.performanceMetrics,
    timeSinceLoad: Date.now() - WalletButtons.performanceMetrics.loadTime
  };
};

// Optimize for lazy loading integration
WalletButtons.isLazyLoadingOptimized = true;

// Export for use in other scripts
window.WalletButtons = WalletButtons;

export default WalletButtons;
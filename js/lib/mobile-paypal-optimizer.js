/**
 * Mobile PayPal Performance Optimizer
 * Optimizes PayPal integration for mobile devices and slow connections
 */

export class MobilePayPalOptimizer {
    constructor() {
        this.connectionType = this.getConnectionType();
        this.isLowEndDevice = this.detectLowEndDevice();
        this.isMobile = this.isMobileDevice();
        this.preloadTimeout = null;
    }

    /**
     * Initialize mobile optimizations
     */
    init() {
        if (this.isMobile) {
            this.optimizeForMobile();
        }

        if (this.isSlowConnection()) {
            this.optimizeForSlowConnection();
        }

        // Add network change listener
        this.setupNetworkListener();
    }

    /**
     * Optimize PayPal experience for mobile devices
     */
    optimizeForMobile() {
        // Preload PayPal resources only on user interaction intent
        this.setupLazyPayPalPreload();

        // Optimize touch interactions
        this.optimizeTouchInteractions();

        // Add mobile-specific CSS optimizations
        this.addMobileOptimizations();
    }

    /**
     * Optimize for slow connections (3G and below)
     */
    optimizeForSlowConnection() {
        // Reduce resource loading
        this.minimizeResourceLoading();

        // Add connection status indicator
        this.addConnectionStatusIndicator();

        // Increase timeout values
        this.adjustTimeouts();
    }

    /**
     * Setup lazy preloading of PayPal resources
     */
    setupLazyPayPalPreload() {
        // Preload on first interaction with cart/payment elements
        const paymentTriggers = [
            '.floating-cart-container',
            '[data-testid*="add"]',
            '.cart-checkout-btn',
            '.nav-cart-button'
        ];

        let preloaded = false;

        paymentTriggers.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                element.addEventListener('touchstart', () => {
                    if (!preloaded) {
                        this.preloadPayPalResources();
                        preloaded = true;
                    }
                }, { once: true, passive: true });
            });
        });
    }

    /**
     * Preload PayPal resources
     */
    preloadPayPalResources() {
        // Only preload on good connections
        if (this.isSlowConnection()) {
            return;
        }

        // Preload PayPal domains
        const paypalDomains = [
            'https://www.paypal.com',
            'https://www.sandbox.paypal.com'
        ];

        paypalDomains.forEach(domain => {
            const link = document.createElement('link');
            link.rel = 'dns-prefetch';
            link.href = domain;
            document.head.appendChild(link);
        });

        // Preload critical PayPal resources
        if (!this.isLowEndDevice) {
            this.preloadPayPalCriticalAssets();
        }
    }

    /**
     * Preload critical PayPal assets
     */
    preloadPayPalCriticalAssets() {
        const criticalAssets = [
            '/images/payment-icons/card_paypal.svg'
        ];

        criticalAssets.forEach(asset => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = 'image';
            link.href = asset;
            document.head.appendChild(link);
        });
    }

    /**
     * Optimize touch interactions
     */
    optimizeTouchInteractions() {
        // Add touch-friendly CSS for PayPal elements
        const style = document.createElement('style');
        style.textContent = `
            @media (max-width: 768px) {
                [data-method="paypal"] {
                    touch-action: manipulation;
                    -webkit-tap-highlight-color: rgba(91, 107, 181, 0.2);
                }

                .payment-method-option {
                    cursor: pointer;
                    -webkit-touch-callout: none;
                    -webkit-user-select: none;
                    user-select: none;
                }

                .paypal-icon {
                    pointer-events: none;
                }
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Add mobile-specific optimizations
     */
    addMobileOptimizations() {
        // Optimize modal for mobile
        const style = document.createElement('style');
        style.textContent = `
            @media (max-width: 768px) {
                .payment-selector-modal {
                    --mobile-padding: env(safe-area-inset-bottom, 0px);
                }

                .payment-selector-content {
                    padding-bottom: calc(20px + var(--mobile-padding));
                }

                .payment-processing-overlay {
                    backdrop-filter: blur(2px);
                }

                .payment-method-option {
                    min-height: 60px;
                    padding: 16px 20px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Minimize resource loading for slow connections
     */
    minimizeResourceLoading() {
        // Disable non-critical animations on slow connections
        if (this.connectionType === 'slow-2g' || this.connectionType === '2g') {
            const style = document.createElement('style');
            style.textContent = `
                .payment-selector-modal *,
                .payment-method-option,
                .payment-processing-spinner {
                    transition: none !important;
                    animation: none !important;
                }
            `;
            document.head.appendChild(style);
        }
    }

    /**
     * Add connection status indicator
     */
    addConnectionStatusIndicator() {
        if (!this.isSlowConnection()) {
            return;
        }

        // Add connection indicator to payment modal
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.classList?.contains('payment-selector-modal')) {
                        this.addNetworkStatusToModal(node);
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true });
    }

    /**
     * Add network status to payment modal
     */
    addNetworkStatusToModal(modal) {
        const header = modal.querySelector('.payment-selector-header');
        if (!header || header.querySelector('.payment-network-status')) {
            return;
        }

        const statusElement = document.createElement('div');
        statusElement.className = `payment-network-status ${this.isSlowConnection() ? 'slow' : ''}`;
        statusElement.innerHTML = `
            <div class="payment-network-status-icon"></div>
            <span>${this.getConnectionMessage()}</span>
        `;

        header.appendChild(statusElement);
    }

    /**
     * Get connection status message
     */
    getConnectionMessage() {
        switch (this.connectionType) {
        case 'slow-2g':
        case '2g':
            return 'Slow connection detected - Payment may take longer';
        case '3g':
            return 'Moderate connection - Payment processing';
        default:
            return 'Good connection';
        }
    }

    /**
     * Adjust timeouts for mobile/slow connections
     */
    adjustTimeouts() {
        if (this.isSlowConnection()) {
            // Extend default timeout for payment requests
            window.MOBILE_PAYMENT_TIMEOUT = 30000; // 30 seconds
            window.MOBILE_RETRY_DELAY = 3000; // 3 seconds
        }
    }

    /**
     * Setup network change listener
     */
    setupNetworkListener() {
        if ('connection' in navigator) {
            navigator.connection.addEventListener('change', () => {
                this.connectionType = this.getConnectionType();
                this.updateOptimizations();
            });
        }
    }

    /**
     * Update optimizations based on connection change
     */
    updateOptimizations() {
        // Remove existing status indicators
        const existingStatus = document.querySelectorAll('.payment-network-status');
        existingStatus.forEach(el => el.remove());

        // Reapply optimizations
        if (this.isSlowConnection()) {
            this.optimizeForSlowConnection();
        }
    }

    /**
     * Detect if user is on mobile device
     */
    isMobileDevice() {
        return window.innerWidth <= 768 ||
               /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    /**
     * Get connection type
     */
    getConnectionType() {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        return connection?.effectiveType || 'unknown';
    }

    /**
     * Check if connection is slow
     */
    isSlowConnection() {
        return ['slow-2g', '2g', '3g'].includes(this.connectionType);
    }

    /**
     * Detect low-end device based on available indicators
     */
    detectLowEndDevice() {
        // Basic heuristics for low-end device detection
        const indicators = {
            lowMemory: navigator.deviceMemory && navigator.deviceMemory <= 2,
            lowCores: navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2,
            slowGPU: this.detectSlowGPU(),
            oldBrowser: this.detectOldBrowser()
        };

        // Consider low-end if multiple indicators are true
        const trueCount = Object.values(indicators).filter(Boolean).length;
        return trueCount >= 2;
    }

    /**
     * Detect slow GPU (simplified)
     */
    detectSlowGPU() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (!gl) {
                return true;
            } // No WebGL support indicates older device

            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                // Basic check for integrated/older GPUs
                return /intel|adreno 3|mali-4/i.test(renderer);
            }
        } catch (e) {
            return true; // Error suggests limited capabilities
        }
        return false;
    }

    /**
     * Detect old browser
     */
    detectOldBrowser() {
        // Check for modern features
        return !window.fetch ||
               !window.Promise ||
               !document.querySelector ||
               !window.addEventListener;
    }

    /**
     * Get performance recommendations for current device/connection
     */
    getPerformanceRecommendations() {
        const recommendations = {
            device: this.isMobile ? 'mobile' : 'desktop',
            connection: this.connectionType,
            isLowEnd: this.isLowEndDevice,
            optimizations: []
        };

        if (this.isLowEndDevice) {
            recommendations.optimizations.push('disable-animations');
            recommendations.optimizations.push('reduce-image-quality');
        }

        if (this.isSlowConnection()) {
            recommendations.optimizations.push('extend-timeouts');
            recommendations.optimizations.push('minimize-requests');
            recommendations.optimizations.push('show-progress-indicators');
        }

        return recommendations;
    }

    /**
     * Cleanup resources
     */
    destroy() {
        if (this.preloadTimeout) {
            clearTimeout(this.preloadTimeout);
        }

        // Remove event listeners if possible
        if ('connection' in navigator) {
            navigator.connection.removeEventListener('change', this.updateOptimizations);
        }
    }
}

// Export singleton instance
let optimizerInstance = null;

export function getMobilePayPalOptimizer() {
    if (!optimizerInstance) {
        optimizerInstance = new MobilePayPalOptimizer();
    }
    return optimizerInstance;
}

// Auto-initialize if mobile device detected
if (typeof window !== 'undefined' && window.innerWidth <= 768) {
    document.addEventListener('DOMContentLoaded', () => {
        const optimizer = getMobilePayPalOptimizer();
        optimizer.init();
    });
}
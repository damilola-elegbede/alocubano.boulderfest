/**
 * PayPal SDK Loader Utility
 * Handles conditional loading of PayPal SDK with error handling and fallbacks
 */

class PayPalSDKLoader {
    constructor() {
        this.isLoaded = false;
        this.isLoading = false;
        this.loadPromise = null;
        this.config = null;
        this.retryAttempts = 0;
        this.maxRetries = 3;
    }

    /**
   * Load PayPal SDK conditionally based on environment and configuration
   * @param {Object} options - Loading options
   * @returns {Promise<Object>} PayPal SDK instance or error
   */
    async loadSDK(options = {}) {
    // Return existing instance if already loaded
        if (this.isLoaded && window.paypal) {
            return { success: true, paypal: window.paypal };
        }

        // Return existing promise if currently loading
        if (this.isLoading && this.loadPromise) {
            return this.loadPromise;
        }

        // Start loading process
        this.isLoading = true;
        this.loadPromise = this._performLoad(options);

        try {
            const result = await this.loadPromise;
            this.isLoaded = result.success;
            return result;
        } catch (error) {
            this.isLoading = false;
            this.loadPromise = null;
            throw error;
        }
    }

    /**
   * Perform the actual SDK loading
   * @param {Object} options - Loading options
   * @returns {Promise<Object>} Load result
   */
    async _performLoad(options = {}) {
        try {
            // Fetch PayPal configuration from API
            const config = await this._fetchPayPalConfig();
            if (!config.success) {
                return {
                    success: false,
                    error: config.error,
                    fallbackToStripe: true
                };
            }

            this.config = config.data;

            // Check if SDK is already loaded
            if (window.paypal) {
                return { success: true, paypal: window.paypal };
            }

            // Build SDK URL with environment-specific parameters
            const sdkUrl = this._buildSDKUrl(options);

            // Load the SDK script
            const paypal = await this._loadScript(sdkUrl);

            // Verify SDK loaded correctly
            if (!paypal || !paypal.Buttons) {
                throw new Error('PayPal SDK loaded but missing required components');
            }

            return {
                success: true,
                paypal: paypal,
                environment: this.config.environment
            };

        } catch (error) {
            // Store error for debugging without console
            this.lastError = error;

            // Check if we should retry
            if (this.retryAttempts < this.maxRetries) {
                this.retryAttempts++;
                // Log retry attempt without console
                this.lastRetryInfo = `Retry attempt ${this.retryAttempts}/${this.maxRetries}`;

                // Wait before retry
                await this._delay(1000 * this.retryAttempts);
                return this._performLoad(options);
            }

            return {
                success: false,
                error: error.message,
                fallbackToStripe: true
            };
        } finally {
            this.isLoading = false;
        }
    }

    /**
   * Fetch PayPal configuration from API
   * @returns {Promise<Object>} Configuration data
   */
    async _fetchPayPalConfig() {
        try {
            const response = await fetch('/api/config/paypal-public', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache'
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                return {
                    success: false,
                    error: errorData.message || 'Failed to load PayPal configuration'
                };
            }

            const data = await response.json();
            return { success: true, data };

        } catch (error) {
            return {
                success: false,
                error: `Configuration fetch failed: ${error.message}`
            };
        }
    }

    /**
   * Build PayPal SDK URL with all necessary parameters
   * @param {Object} options - URL building options
   * @returns {string} Complete SDK URL
   */
    _buildSDKUrl(options = {}) {
        const baseUrl = 'https://www.paypal.com/sdk/js';
        const params = new URLSearchParams();

        // Required parameters
        params.set('client-id', this.config.clientId);
        params.set('currency', this.config.currency || 'USD');
        params.set('intent', this.config.intent || 'capture');

        // Component parameters
        if (this.config.components) {
            params.set('components', this.config.components.join(','));
        }

        // Funding parameters
        if (this.config.enableFunding) {
            params.set('enable-funding', this.config.enableFunding.join(','));
        }
        if (this.config.disableFunding) {
            params.set('disable-funding', this.config.disableFunding.join(','));
        }

        // Environment-specific parameters
        if (this.config.environment === 'sandbox') {
            params.set('debug', 'true');
            // Enable Venmo testing in sandbox - requires US buyer country
            params.set('buyer-country', 'US');
        }

        // Mobile-specific optimizations
        if (this._isMobileDevice()) {
            params.set('commit', 'true');
            params.set('vault', 'false'); // Disable vaulting on mobile for simpler flow
        }

        // Override with any provided options
        Object.entries(options).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                params.set(key, value);
            }
        });

        return `${baseUrl}?${params.toString()}`;
    }

    /**
   * Load script and return PayPal SDK instance
   * @param {string} url - SDK URL to load
   * @returns {Promise<Object>} PayPal SDK instance
   */
    async _loadScript(url) {
        return new Promise((resolve, reject) => {
            // Check if script already exists
            const existingScript = document.querySelector('script[src^="https://www.paypal.com/sdk/js"]');
            if (existingScript) {
                existingScript.remove();
            }

            const script = document.createElement('script');
            script.src = url;
            script.async = true;
            script.defer = true;

            // Set up loading handlers
            script.onload = () => {
                // Small delay to ensure SDK is fully initialized
                setTimeout(() => {
                    if (window.paypal) {
                        resolve(window.paypal);
                    } else {
                        reject(new Error('PayPal SDK script loaded but window.paypal not available'));
                    }
                }, 100);
            };

            script.onerror = () => {
                reject(new Error('Failed to load PayPal SDK script'));
            };

            // Add script to head
            document.head.appendChild(script);

            // Timeout after 15 seconds
            setTimeout(() => {
                if (!window.paypal) {
                    reject(new Error('PayPal SDK loading timeout'));
                }
            }, 15000);
        });
    }

    /**
   * Check if PayPal SDK is available
   * @returns {boolean} Whether SDK is loaded and ready
   */
    isSDKReady() {
        return this.isLoaded && window.paypal && window.paypal.Buttons;
    }

    /**
   * Get current PayPal configuration
   * @returns {Object|null} Current config or null if not loaded
   */
    getConfig() {
        return this.config;
    }

    /**
   * Get PayPal SDK environment
   * @returns {string} Environment ('sandbox' or 'live')
   */
    getEnvironment() {
        return this.config?.environment || 'sandbox';
    }

    /**
   * Detect mobile device for optimization
   * @returns {boolean} Whether user is on mobile
   */
    _isMobileDevice() {
        return window.innerWidth <= 768 ||
           /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    /**
   * Utility delay function
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Delay promise
   */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
   * Reset loader state (useful for testing)
   */
    reset() {
        this.isLoaded = false;
        this.isLoading = false;
        this.loadPromise = null;
        this.config = null;
        this.retryAttempts = 0;
    }

    /**
   * Cleanup and remove SDK (useful for testing)
   */
    cleanup() {
        this.reset();

        // Remove PayPal scripts
        const scripts = document.querySelectorAll('script[src^="https://www.paypal.com/sdk/js"]');
        scripts.forEach(script => script.remove());

        // Clear global PayPal object
        if (window.paypal) {
            delete window.paypal;
        }
    }
}

// Export singleton instance
let paypalSDKLoader = null;

export function getPayPalSDKLoader() {
    if (!paypalSDKLoader) {
        paypalSDKLoader = new PayPalSDKLoader();
    }
    return paypalSDKLoader;
}

export { PayPalSDKLoader };
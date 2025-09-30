/**
 * Service Worker Registration
 *
 * Handles registration and management of the QR cache service worker
 * with proper error handling and fallback strategies
 */

class ServiceWorkerManager {
    constructor() {
        this.swRegistration = null;
        this.isSupported = 'serviceWorker' in navigator;
        this.isOnline = navigator.onLine;

        this.init();
    }

    async init() {
        if (!this.isSupported) {
            console.log('Service Worker not supported in this browser');
            return;
        }

        try {
            await this.registerServiceWorker();
            this.setupEventListeners();
            this.schedulePeriodicCleanup();
        } catch (error) {
            console.error('Service Worker initialization failed:', error);
        }
    }

    async registerServiceWorker() {
        try {
            this.swRegistration = await navigator.serviceWorker.register('/sw-qr-cache.js', {
                scope: '/'
            });

            console.log('Service Worker registered successfully:', this.swRegistration.scope);

            // Handle updates
            this.swRegistration.addEventListener('updatefound', () => {
                console.log('Service Worker update found');
                this.handleServiceWorkerUpdate();
            });

            // Check for existing SW
            if (this.swRegistration.active) {
                console.log('Service Worker is active and ready');
            }

            return this.swRegistration;

        } catch (error) {
            console.error('Service Worker registration failed:', error);
            throw error;
        }
    }

    handleServiceWorkerUpdate() {
        const newWorker = this.swRegistration.installing;
        if (!newWorker) {
            return;
        }

        newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New SW is available
                this.notifyUpdate();
            }
        });
    }

    notifyUpdate() {
    // Simple notification - could be enhanced with UI
        console.log('New Service Worker version available. Refresh to update.');

        // Auto-refresh if user hasn't interacted in a while
        if (this.shouldAutoRefresh()) {
            setTimeout(() => {
                window.location.reload();
            }, 5000);
        }
    }

    shouldAutoRefresh() {
    // Only auto-refresh if user has been idle
        const idleTime = Date.now() - (window.lastUserActivity || Date.now());
        return idleTime > 30000; // 30 seconds idle
    }

    setupEventListeners() {
    // Online/offline detection
        window.addEventListener('online', () => {
            this.isOnline = true;
            console.log('Network connectivity restored');
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            console.log('Network connectivity lost - relying on cache');
        });

        // Listen for SW messages
        navigator.serviceWorker.addEventListener('message', (event) => {
            this.handleServiceWorkerMessage(event);
        });

        // Track user activity for auto-refresh decisions
        ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(name => {
            window.addEventListener(name, () => {
                window.lastUserActivity = Date.now();
            }, { passive: true });
        });
    }

    handleServiceWorkerMessage(event) {
        const message = event.data;
        if (!message || typeof message !== 'object') {
            console.warn('Unexpected SW message payload:', message);
            return;
        }
        const { type, data } = message;

        switch (type) {
        case 'CACHE_CLEANUP_COMPLETE':
            // Fix: event.data contains cleanedCount directly, not in a data property
            console.log(`Service Worker cache cleanup: ${event.data.cleanedCount} entries removed`);
            break;

        case 'SW_METRICS':
            console.log('Service Worker metrics:', data.metrics);
            break;

        default:
            console.log('Unknown SW message:', event.data);
        }
    }

    // Schedule periodic cache cleanup
    schedulePeriodicCleanup() {
    // Clean up cache every 6 hours
        setInterval(() => {
            this.requestCacheCleanup();
        }, 6 * 60 * 60 * 1000);

        // Initial cleanup after 1 minute
        setTimeout(() => {
            this.requestCacheCleanup();
        }, 60000);
    }

    requestCacheCleanup() {
        if (this.swRegistration && this.swRegistration.active) {
            this.swRegistration.active.postMessage({
                type: 'CACHE_CLEANUP'
            });
        }
    }

    // Get performance metrics from SW
    async getServiceWorkerMetrics() {
        if (!this.swRegistration || !this.swRegistration.active) {
            return null;
        }

        return new Promise((resolve) => {
            const messageChannel = new MessageChannel();
            let timeoutId = null;
            let resolved = false;

            const cleanup = () => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
            };

            const resolveOnce = (value) => {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    resolve(value);
                }
            };

            messageChannel.port1.onmessage = (event) => {
                // Validate event data structure
                if (event.data && typeof event.data === 'object' && event.data.type === 'SW_METRICS') {
                    resolveOnce(event.data.metrics);
                } else {
                    // Handle unexpected payload
                    console.warn('Unexpected SW message payload:', event.data);
                    resolveOnce(null);
                }
            };

            this.swRegistration.active.postMessage({
                type: 'GET_SW_METRICS'
            }, [messageChannel.port2]);

            // Timeout after 5 seconds
            timeoutId = setTimeout(() => {
                resolveOnce(null);
            }, 5000);
        });
    }

    // Check if SW is controlling the page
    isControlling() {
        return !!navigator.serviceWorker.controller;
    }

    // Get SW status
    getStatus() {
        if (!this.isSupported) {
            return 'unsupported';
        }
        if (!this.swRegistration) {
            return 'unregistered';
        }
        if (this.swRegistration.active) {
            return 'active';
        }
        if (this.swRegistration.installing) {
            return 'installing';
        }
        if (this.swRegistration.waiting) {
            return 'waiting';
        }
        return 'unknown';
    }

    // Manual update check
    async checkForUpdate() {
        if (this.swRegistration) {
            try {
                await this.swRegistration.update();
                console.log('Service Worker update check completed');
            } catch (error) {
                console.error('Service Worker update check failed:', error);
            }
        }
    }

    // Unregister SW (for debugging)
    async unregister() {
        if (this.swRegistration) {
            try {
                const success = await this.swRegistration.unregister();
                console.log('Service Worker unregistered:', success);
                return success;
            } catch (error) {
                console.error('Service Worker unregistration failed:', error);
                return false;
            }
        }
        return false;
    }
}

// Initialize SW manager
const swManager = new ServiceWorkerManager();

// Export for global access
window.swManager = swManager;

// Add to performance dashboard if available
if (window.performanceDashboard) {
    // Enhance dashboard with SW metrics
    const originalGetMetrics = window.performanceDashboard.updateMetrics;
    window.performanceDashboard.updateMetrics = async function() {
    // Call original method
        originalGetMetrics.call(this);

        // Add SW metrics
        const swMetrics = await swManager.getServiceWorkerMetrics();
        if (swMetrics) {
            console.log('SW Performance:', swMetrics);
        }
    };
}

export default ServiceWorkerManager;
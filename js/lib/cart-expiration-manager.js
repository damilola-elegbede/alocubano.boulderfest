/**
 * Cart Expiration Manager
 *
 * Handles cart item expiration and checkout session timeouts.
 * - Cart items expire after 24 hours
 * - Checkout sessions expire after 15 minutes
 */

import {
    CART_TIMEOUT,
    isExpired,
    isNearExpiry,
    getTimeRemaining,
    formatTimeRemaining,
    getExpiredItems,
    startCheckoutSession as startSession,
    clearCheckoutSession as clearSession,
    isCheckoutSessionActive,
    cleanCartState
} from './pure/cart-persistence.js';

export class CartExpirationManager {
    constructor(cartManager) {
        this.cartManager = cartManager;
        this.cleanupInterval = null;
        this.checkoutTimer = null;
        this.expirationWarnings = new Set();
    }

    /**
     * Initialize expiration management
     */
    initialize() {
        // Clean expired items on initialization
        this.cleanExpiredItems();

        // Start periodic cleanup (every 5 minutes)
        this.startPeriodicCleanup();

        // Listen for cart events (CartManager extends EventTarget)
        this.cartManager.addEventListener('cart:checkout:started', () => this.startCheckoutTimer());
        this.cartManager.addEventListener('cart:checkout:ended', () => this.stopCheckoutTimer());
    }

    /**
     * Clean expired items from cart
     */
    async cleanExpiredItems() {
        const state = this.cartManager.getState();
        const beforeCleanup = { ...state };

        // Clean expired items
        const cleaned = cleanCartState(state);

        // Check if any items were removed
        const expired = getExpiredItems(beforeCleanup);
        if (expired.expiredTickets.length > 0 || expired.expiredDonations.length > 0) {
            // Update cart state
            this.cartManager.state = cleaned;
            await this.cartManager.saveToStorage();

            // Notify about expired items
            this.cartManager.emit('cart:items:expired', expired);

            // Show user notification
            if (typeof window !== 'undefined') {
                this.showExpirationNotification(expired);
            }
        }

        return expired;
    }

    /**
     * Start periodic cleanup interval
     */
    startPeriodicCleanup() {
        this.stopPeriodicCleanup();

        // Run cleanup every 5 minutes
        this.cleanupInterval = setInterval(() => {
            this.cleanExpiredItems();
            this.checkExpiringItems();
        }, 5 * 60 * 1000);
    }

    /**
     * Stop periodic cleanup interval
     */
    stopPeriodicCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * Check for items nearing expiration
     */
    checkExpiringItems() {
        const state = this.cartManager.getState();
        const warnings = [];

        // Check tickets
        Object.entries(state.tickets || {}).forEach(([ticketType, ticket]) => {
            const timestamp = ticket.addedAt || state.metadata?.createdAt;
            if (isNearExpiry(timestamp)) {
                const key = `ticket_${ticketType}`;
                if (!this.expirationWarnings.has(key)) {
                    this.expirationWarnings.add(key);
                    warnings.push({
                        type: 'ticket',
                        item: ticket,
                        timeRemaining: getTimeRemaining(timestamp)
                    });
                }
            }
        });

        // Check donations
        (state.donations || []).forEach(donation => {
            const timestamp = donation.addedAt || state.metadata?.createdAt;
            if (isNearExpiry(timestamp)) {
                const key = `donation_${donation.id}`;
                if (!this.expirationWarnings.has(key)) {
                    this.expirationWarnings.add(key);
                    warnings.push({
                        type: 'donation',
                        item: donation,
                        timeRemaining: getTimeRemaining(timestamp)
                    });
                }
            }
        });

        if (warnings.length > 0) {
            this.cartManager.emit('cart:items:expiring', warnings);
            this.showExpiringNotification(warnings);
        }
    }

    /**
     * Start checkout session
     */
    async startCheckoutSession() {
        const state = this.cartManager.getState();
        const updatedState = startSession(state);

        this.cartManager.state = updatedState;
        await this.cartManager.saveToStorage();

        this.startCheckoutTimer();

        this.cartManager.emit('cart:checkout:started', {
            sessionId: updatedState.metadata.checkoutSessionId,
            expiresIn: CART_TIMEOUT.CHECKOUT_SESSION
        });

        return updatedState.metadata.checkoutSessionId;
    }

    /**
     * End checkout session
     */
    async endCheckoutSession(completed = false) {
        const state = this.cartManager.getState();
        const sessionId = state.metadata?.checkoutSessionId;

        const updatedState = clearSession(state);
        this.cartManager.state = updatedState;

        if (completed) {
            // Clear cart on successful checkout
            await this.cartManager.clear();
        } else {
            await this.cartManager.saveToStorage();
        }

        this.stopCheckoutTimer();

        this.cartManager.emit('cart:checkout:ended', {
            sessionId,
            completed
        });
    }

    /**
     * Start checkout session timer
     */
    startCheckoutTimer() {
        this.stopCheckoutTimer();

        const state = this.cartManager.getState();
        if (!state.metadata?.checkoutStartedAt) {
            return;
        }

        // Check every 10 seconds
        this.checkoutTimer = setInterval(() => {
            const remaining = this.getCheckoutTimeRemaining();

            if (remaining <= 0) {
                // Session expired
                this.endCheckoutSession(false);
                this.cartManager.emit('cart:checkout:expired');
                this.showCheckoutExpiredNotification();
            } else if (remaining <= 60000) {
                // Less than 1 minute warning
                this.cartManager.emit('cart:checkout:warning', {
                    timeRemaining: remaining,
                    formatted: formatTimeRemaining(remaining)
                });

                if (remaining === 60000) {
                    this.showCheckoutWarningNotification();
                }
            }
        }, 10000);
    }

    /**
     * Stop checkout session timer
     */
    stopCheckoutTimer() {
        if (this.checkoutTimer) {
            clearInterval(this.checkoutTimer);
            this.checkoutTimer = null;
        }
    }

    /**
     * Get checkout time remaining
     */
    getCheckoutTimeRemaining() {
        const state = this.cartManager.getState();
        if (!state.metadata?.checkoutStartedAt) {
            return 0;
        }
        return getTimeRemaining(state.metadata.checkoutStartedAt, CART_TIMEOUT.CHECKOUT_SESSION);
    }

    /**
     * Check if in active checkout
     */
    isInCheckout() {
        const state = this.cartManager.getState();
        return isCheckoutSessionActive(state);
    }

    /**
     * Get expiration info for all items
     */
    getExpirationInfo() {
        const state = this.cartManager.getState();
        const info = {
            tickets: {},
            donations: [],
            checkoutSession: null
        };

        // Get ticket expiration info
        Object.entries(state.tickets || {}).forEach(([ticketType, ticket]) => {
            const timestamp = ticket.addedAt || state.metadata?.createdAt;
            const remaining = getTimeRemaining(timestamp);
            info.tickets[ticketType] = {
                expiresAt: timestamp + CART_TIMEOUT.ITEM_EXPIRY,
                timeRemaining: remaining,
                formatted: formatTimeRemaining(remaining),
                isNearExpiry: isNearExpiry(timestamp),
                isExpired: isExpired(timestamp)
            };
        });

        // Get donation expiration info
        (state.donations || []).forEach(donation => {
            const timestamp = donation.addedAt || state.metadata?.createdAt;
            const remaining = getTimeRemaining(timestamp);
            info.donations.push({
                id: donation.id,
                expiresAt: timestamp + CART_TIMEOUT.ITEM_EXPIRY,
                timeRemaining: remaining,
                formatted: formatTimeRemaining(remaining),
                isNearExpiry: isNearExpiry(timestamp),
                isExpired: isExpired(timestamp)
            });
        });

        // Get checkout session info
        if (state.metadata?.checkoutStartedAt) {
            const remaining = this.getCheckoutTimeRemaining();
            info.checkoutSession = {
                sessionId: state.metadata.checkoutSessionId,
                expiresAt: state.metadata.checkoutStartedAt + CART_TIMEOUT.CHECKOUT_SESSION,
                timeRemaining: remaining,
                formatted: formatTimeRemaining(remaining),
                isActive: remaining > 0
            };
        }

        return info;
    }

    /**
     * Show expiration notification
     */
    showExpirationNotification(expired) {
        const ticketCount = expired.expiredTickets.length;
        const donationCount = expired.expiredDonations.length;

        // Prepare notification message for UI system
        const items = [];

        if (ticketCount > 0) {
            items.push(`${ticketCount} ticket${ticketCount > 1 ? 's' : ''}`);
        }
        if (donationCount > 0) {
            items.push(`${donationCount} donation${donationCount > 1 ? 's' : ''}`);
        }

        // Message format: 'Some items in your cart have expired and been removed: X tickets and Y donations'
        // Consider implementing a toast notification system in the UI layer
    }

    /**
     * Show expiring items notification
     */
    showExpiringNotification() {
        // Message format: 'X item(s) in your cart will expire soon!'
        // Consider implementing a toast notification system in the UI layer
        // Expiration warnings tracked in this.expirationWarnings
    }

    /**
     * Show checkout expired notification
     */
    showCheckoutExpiredNotification() {
        const message = 'Your checkout session has expired. Please try again.';
        if (typeof window !== 'undefined' && window.alert) {
            alert(message);
        }
    }

    /**
     * Show checkout warning notification
     */
    showCheckoutWarningNotification() {
        // Message: 'Your checkout session will expire in 1 minute!'
        // Consider implementing a toast notification system in the UI layer
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.stopPeriodicCleanup();
        this.stopCheckoutTimer();
        this.expirationWarnings.clear();
    }
}

// Export timeout constants for external use
export { CART_TIMEOUT, formatTimeRemaining };
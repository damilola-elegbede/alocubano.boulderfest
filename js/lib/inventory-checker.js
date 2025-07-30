/**
 * Inventory Checker
 * Real-time inventory availability checking and updates
 */

class InventoryChecker extends EventTarget {
    constructor() {
        super();
        this.apiEndpoint = '/api/inventory/check-availability';
        this.checkInterval = 30000; // 30 seconds
        this.intervalId = null;
        this.lastCheck = null;
        this.isChecking = false;
        this.cache = new Map();
        this.cacheExpiry = 60000; // 1 minute cache

        this.retryConfig = {
            maxRetries: 3,
            backoffMultiplier: 2,
            initialDelay: 1000
        };
    }

    async checkAvailability(items) {
        if (this.isChecking) {
            // Return cached result if available
            const cacheKey = this.generateCacheKey(items);
            const cached = this.cache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
                return cached.data;
            }

            // Wait for current check to complete
            await this.waitForCurrentCheck();
        }

        this.isChecking = true;

        try {
            const response = await this.makeRequest(items);
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Availability check failed');
            }

            // Cache result
            const cacheKey = this.generateCacheKey(items);
            this.cache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });

            // Clean old cache entries
            this.cleanCache();

            this.lastCheck = Date.now();
            this.isChecking = false;

            // Dispatch availability update if items unavailable
            if (!result.available) {
                this.dispatchEvent(new CustomEvent('availability-changed', {
                    detail: result
                }));
            }

            return result;

        } catch (error) {
            this.isChecking = false;
            console.error('Inventory check failed:', error);

            // Return optimistic result on error to not block user
            return {
                available: true,
                unavailable: [],
                message: 'Unable to verify availability. Please proceed with caution.'
            };
        }
    }

    async makeRequest(items, retryCount = 0) {
        try {
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ items }),
                signal: AbortSignal.timeout(10000) // 10 second timeout
            });

            return response;

        } catch (error) {
            if (retryCount < this.retryConfig.maxRetries &&
          (error.name === 'AbortError' || error.name === 'TypeError')) {

                const delay = this.retryConfig.initialDelay *
          Math.pow(this.retryConfig.backoffMultiplier, retryCount);

                console.log(`Inventory check failed, retrying in ${delay}ms (attempt ${retryCount + 1}/${this.retryConfig.maxRetries})`);

                await new Promise(resolve => setTimeout(resolve, delay));
                return this.makeRequest(items, retryCount + 1);
            }

            throw error;
        }
    }

    generateCacheKey(items) {
        return items
            .map(item => `${item.ticketType}-${item.quantity}`)
            .sort()
            .join('|');
    }

    cleanCache() {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > this.cacheExpiry) {
                this.cache.delete(key);
            }
        }
    }

    async waitForCurrentCheck() {
        while (this.isChecking) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    startPeriodicCheck() {
        if (this.intervalId) {
            this.stopPeriodicCheck();
        }

        this.intervalId = setInterval(() => {
            this.performPeriodicCheck();
        }, this.checkInterval);

        console.log('Started periodic inventory checking');
    }

    stopPeriodicCheck() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('Stopped periodic inventory checking');
        }
    }

    async performPeriodicCheck() {
        try {
            // Get current cart items
            const cartItems = this.getCurrentCartItems();

            if (cartItems.length === 0) {
                return; // No items to check
            }

            const result = await this.checkAvailability(cartItems);

            if (!result.available) {
                this.handleInventoryUnavailable(result);
            }

        } catch (error) {
            console.warn('Periodic inventory check failed:', error);
        }
    }

    getCurrentCartItems() {
        const items = [];

        // Get items from ticket selection UI
        document.querySelectorAll('.ticket-card').forEach(card => {
            const quantityEl = card.querySelector('.quantity');
            const quantity = parseInt(quantityEl?.textContent || '0');

            if (quantity > 0) {
                items.push({
                    ticketType: card.dataset.ticketType,
                    quantity: quantity,
                    name: card.querySelector('h4')?.textContent?.trim()
                });
            }
        });

        return items;
    }

    handleInventoryUnavailable(result) {
        console.warn('Inventory unavailable:', result.unavailable);

        // Show notification to user
        this.showInventoryNotification(result);

        // Update UI to reflect unavailable items
        this.updateInventoryUI(result);

        // Dispatch event for other components
        this.dispatchEvent(new CustomEvent('inventory-unavailable', {
            detail: result
        }));
    }

    showInventoryNotification(result) {
        const notification = this.createNotification(
            'Some tickets are no longer available',
            'warning',
            5000
        );

        // Add details
        const details = document.createElement('div');
        details.className = 'notification-details';

        result.unavailable.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.textContent = `${item.name}: ${item.available} remaining (you selected ${item.requested})`;
            details.appendChild(itemEl);
        });

        notification.appendChild(details);

        // Add action button
        const actionBtn = document.createElement('button');
        actionBtn.textContent = 'Update Selection';
        actionBtn.className = 'notification-action';
        actionBtn.onclick = () => {
            this.autoAdjustQuantities(result.unavailable);
            notification.remove();
        };

        notification.appendChild(actionBtn);
    }

    updateInventoryUI(result) {
        result.unavailable.forEach(item => {
            const card = document.querySelector(`[data-ticket-type="${item.ticketType}"]`);
            if (card) {
                // Add unavailable indicator
                let indicator = card.querySelector('.inventory-indicator');
                if (!indicator) {
                    indicator = document.createElement('div');
                    indicator.className = 'inventory-indicator';
                    card.appendChild(indicator);
                }

                indicator.textContent = `Only ${item.available} remaining`;
                indicator.className = 'inventory-indicator warning';

                // Disable increase button if at limit
                const quantityEl = card.querySelector('.quantity');
                const currentQuantity = parseInt(quantityEl?.textContent || '0');

                if (currentQuantity >= item.available) {
                    const plusBtn = card.querySelector('.qty-btn.plus');
                    if (plusBtn) {
                        plusBtn.disabled = true;
                        plusBtn.title = 'No more tickets available';
                    }
                }
            }
        });
    }

    autoAdjustQuantities(unavailableItems) {
        unavailableItems.forEach(item => {
            const card = document.querySelector(`[data-ticket-type="${item.ticketType}"]`);
            if (card) {
                const quantityEl = card.querySelector('.quantity');
                if (quantityEl) {
                    const newQuantity = Math.min(item.requested, item.available);
                    quantityEl.textContent = newQuantity.toString();

                    // Trigger update event
                    const event = new CustomEvent('quantity-adjusted', {
                        detail: {
                            ticketType: item.ticketType,
                            oldQuantity: item.requested,
                            newQuantity: newQuantity
                        }
                    });
                    card.dispatchEvent(event);
                }
            }
        });

        // Show success notification
        this.createNotification(
            'Ticket quantities have been adjusted to available amounts',
            'success',
            3000
        );
    }

    createNotification(message, type = 'info', duration = 5000) {
    // Remove existing notifications
        document.querySelectorAll('.inventory-notification').forEach(el => el.remove());

        const notification = document.createElement('div');
        notification.className = `inventory-notification ${type}`;
        notification.setAttribute('role', 'alert');
        notification.setAttribute('aria-live', 'polite');

        const messageEl = document.createElement('div');
        messageEl.className = 'notification-message';
        messageEl.textContent = message;
        notification.appendChild(messageEl);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'notification-close';
        closeBtn.innerHTML = '×';
        closeBtn.setAttribute('aria-label', 'Close notification');
        closeBtn.onclick = () => notification.remove();
        notification.appendChild(closeBtn);

        // Add to page
        document.body.appendChild(notification);

        // Auto-remove after duration
        if (duration > 0) {
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, duration);
        }

        return notification;
    }

    // Manual refresh for user-triggered checks
    async refresh() {
        this.cache.clear();
        const items = this.getCurrentCartItems();

        if (items.length > 0) {
            return await this.checkAvailability(items);
        }

        return { available: true, unavailable: [] };
    }

    // Get inventory status for specific ticket type
    async getTicketAvailability(ticketType) {
        try {
            const response = await fetch(`${this.apiEndpoint}/${ticketType}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to get ticket availability');
            }

            return await response.json();

        } catch (error) {
            console.error('Failed to get ticket availability:', error);
            return { available: 0, sold: 0, total: 0 };
        }
    }

    // Preload availability data
    async preloadAvailability() {
        try {
            const ticketTypes = Array.from(document.querySelectorAll('.ticket-card'))
                .map(card => card.dataset.ticketType)
                .filter(Boolean);

            const promises = ticketTypes.map(type => this.getTicketAvailability(type));
            const results = await Promise.allSettled(promises);

            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    const ticketType = ticketTypes[index];
                    this.updateTicketAvailabilityDisplay(ticketType, result.value);
                }
            });

        } catch (error) {
            console.warn('Failed to preload availability data:', error);
        }
    }

    updateTicketAvailabilityDisplay(ticketType, availability) {
        const card = document.querySelector(`[data-ticket-type="${ticketType}"]`);
        if (!card) {
            return;
        }

        let indicator = card.querySelector('.availability-display');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'availability-display';
            card.appendChild(indicator);
        }

        const remaining = availability.total - availability.sold;

        if (remaining === 0) {
            indicator.textContent = 'Sold Out';
            indicator.className = 'availability-display sold-out';
            card.classList.add('sold-out');
        } else if (remaining < 10) {
            indicator.textContent = `${remaining} left`;
            indicator.className = 'availability-display low-stock';
        } else {
            indicator.textContent = 'Available';
            indicator.className = 'availability-display available';
        }
    }

    // Event listener helpers
    on(eventType, callback) {
        this.addEventListener(eventType, callback);
        return this;
    }

    off(eventType, callback) {
        this.removeEventListener(eventType, callback);
        return this;
    }

    // Cleanup
    destroy() {
        this.stopPeriodicCheck();
        this.cache.clear();
        this.removeAllEventListeners();
    }
}

export { InventoryChecker };
/**
 * Inventory Checker
 * Real-time inventory availability checking and updates
 */
export class InventoryChecker extends EventTarget {
    constructor() {
        super();
        this.apiEndpoint = '/api/inventory/check-availability';
        this.checkInterval = 30000; // 30 seconds
        this.cache = new Map();
        this.cacheExpiry = 60000; // 1 minute cache
        this.isChecking = false;
    }

    async checkAvailability(items) {
        if (this.isChecking) {
            return { available: true, message: 'Check in progress' };
        }

        const cacheKey = this.generateCacheKey(items);
        const cached = this.cache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.data;
        }

        this.isChecking = true;

        try {
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    items: items.map(item => ({
                        ticketType: item.ticketType,
                        quantity: item.quantity,
                        eventId: item.eventId
                    }))
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            // Cache result
            this.cache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });

            // Dispatch event if items unavailable
            if (!result.available) {
                this.dispatchEvent(new CustomEvent('availability-changed', {
                    detail: result
                }));
            }

            return result;

        } catch (error) {
            // Return optimistic result on error
            // In production, you might want to be more conservative
            return {
                available: true,
                unavailable: [],
                message: 'Unable to verify availability - proceeding optimistically',
                error: error.message
            };
        } finally {
            this.isChecking = false;
        }
    }

    async checkCartAvailability(cartState) {
        const items = Object.values(cartState.tickets);
        if (items.length === 0) {
            return { available: true, message: 'No items to check' };
        }

        return this.checkAvailability(items);
    }

    startPeriodicCheck(cartManager) {
        if (this.intervalId) {
            this.stopPeriodicCheck();
        }

        this.cartManager = cartManager;
        this.intervalId = setInterval(() => {
            this.performPeriodicCheck();
        }, this.checkInterval);
    }

    async performPeriodicCheck() {
        if (!this.cartManager) {
            return;
        }

        const cartState = this.cartManager.getState();
        if (cartState.isEmpty) {
            return;
        }

        try {
            const result = await this.checkCartAvailability(cartState);

            if (!result.available && result.unavailable && result.unavailable.length > 0) {
                // Some items are no longer available
                this.dispatchEvent(new CustomEvent('inventory-warning', {
                    detail: {
                        unavailable: result.unavailable,
                        message: result.message || 'Some items are no longer available'
                    }
                }));
            }
        } catch {
            // Periodic check failed - continue silently
        }
    }

    stopPeriodicCheck() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.cartManager = null;
    }

    // Mock inventory checking for development
    async mockCheckAvailability(items) {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 500));

        // Simulate some business logic
        const unavailable = [];
        const warnings = [];

        items.forEach(item => {
            // Mock: General admission has limited availability
            if (item.ticketType === 'general' && item.quantity > 5) {
                unavailable.push({
                    ticketType: item.ticketType,
                    requestedQuantity: item.quantity,
                    availableQuantity: 5,
                    message: 'Only 5 General Admission tickets remaining'
                });
            }

            // Mock: VIP tickets are limited
            if (item.ticketType === 'vip' && item.quantity > 2) {
                unavailable.push({
                    ticketType: item.ticketType,
                    requestedQuantity: item.quantity,
                    availableQuantity: 2,
                    message: 'Only 2 VIP tickets remaining'
                });
            }

            // Mock: Workshop tickets have time-based availability
            if (item.ticketType === 'workshop' && new Date().getHours() > 20) {
                warnings.push({
                    ticketType: item.ticketType,
                    message: 'Workshop registration closes at 8 PM daily'
                });
            }
        });

        return {
            available: unavailable.length === 0,
            unavailable,
            warnings,
            message: unavailable.length > 0
                ? 'Some items have limited availability'
                : 'All items are available',
            timestamp: Date.now()
        };
    }

    generateCacheKey(items) {
        return items
            .map(item => `${item.ticketType}-${item.quantity}`)
            .sort()
            .join('|');
    }

    clearCache() {
        this.cache.clear();
    }

    getCacheStats() {
        return {
            size: this.cache.size,
            entries: Array.from(this.cache.keys())
        };
    }

    // For testing and development
    setMockMode(enabled = true) {
        this.mockMode = enabled;
        if (enabled) {
            this.originalCheckAvailability = this.checkAvailability;
            this.checkAvailability = this.mockCheckAvailability;
        } else if (this.originalCheckAvailability) {
            this.checkAvailability = this.originalCheckAvailability;
        }
    }
}

// Singleton instance
let inventoryCheckerInstance = null;

export function getInventoryChecker() {
    if (!inventoryCheckerInstance) {
        inventoryCheckerInstance = new InventoryChecker();
    }
    return inventoryCheckerInstance;
}
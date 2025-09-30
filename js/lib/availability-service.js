/**
 * Ticket Availability Service
 * Real-time availability checking for tickets before adding to cart
 */

export class AvailabilityService {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 30000; // 30 seconds
        this.pollingInterval = null;
        this.listeners = new Set();
    }

    /**
     * Check if a specific ticket type is available with the requested quantity
     * @param {string} ticketType - Ticket type identifier
     * @param {number} requestedQuantity - Number of tickets requested
     * @returns {Promise<{available: boolean, remaining: number, status: string, message: string}>}
     */
    async checkAvailability(ticketType, requestedQuantity = 1) {
        try {
            // Get fresh availability data
            const tickets = await this.fetchTicketTypes();

            // Find the specific ticket
            const ticket = tickets.find(t => t.id === ticketType);

            if (!ticket) {
                return {
                    available: false,
                    remaining: 0,
                    status: 'not_found',
                    message: 'Ticket type not found'
                };
            }

            // Check if ticket is sold out or unavailable
            if (ticket.status === 'sold_out' || ticket.status === 'sold-out') {
                return {
                    available: false,
                    remaining: 0,
                    status: 'sold_out',
                    message: 'This ticket type is sold out'
                };
            }

            // Accept both 'available' (from bootstrap.json) and 'on_sale' as valid statuses
            const validStatuses = ['on_sale', 'available'];
            if (!validStatuses.includes(ticket.status)) {
                return {
                    available: false,
                    remaining: 0,
                    status: ticket.status,
                    message: `Tickets are currently ${ticket.status.replace('_', ' ').replace('-', ' ')}`
                };
            }

            // Calculate remaining tickets
            const remaining = ticket.availability !== null ? ticket.availability : Infinity;

            // Check if requested quantity is available
            if (remaining < requestedQuantity) {
                return {
                    available: false,
                    remaining: remaining,
                    status: 'insufficient',
                    message: remaining === 0
                        ? 'This ticket type is sold out'
                        : `Only ${remaining} ticket${remaining === 1 ? '' : 's'} remaining`
                };
            }

            return {
                available: true,
                remaining: remaining,
                status: 'available',
                message: 'Tickets available'
            };

        } catch {
            // Failed to check availability - return error state
            return {
                available: false,
                remaining: 0,
                status: 'error',
                message: 'Unable to check availability. Please try again.'
            };
        }
    }

    /**
     * Fetch all ticket types from API
     * Uses caching to avoid excessive API calls
     */
    async fetchTicketTypes() {
        const now = Date.now();
        const cached = this.cache.get('tickets');

        // Return cached data if still valid
        if (cached && (now - cached.timestamp) < this.cacheTimeout) {
            return cached.data;
        }

        try {
            const response = await fetch('/api/tickets/types?include_test=true');

            if (!response.ok) {
                throw new Error(`API returned ${response.status}`);
            }

            const result = await response.json();

            if (!result.success || !result.tickets) {
                throw new Error('Invalid API response format');
            }

            // Cache the result
            this.cache.set('tickets', {
                data: result.tickets,
                timestamp: now
            });

            // Notify listeners of availability update
            this.notifyListeners(result.tickets);

            return result.tickets;

        } catch (fetchError) {
            // Failed to fetch ticket types - use cached data if available

            // Return cached data if available, even if expired
            if (cached) {
                // Using expired cache due to API error
                return cached.data;
            }

            throw fetchError;
        }
    }

    /**
     * Get availability status for all tickets
     * Returns a map of ticketType -> availability info
     */
    async getAllAvailability() {
        try {
            const tickets = await this.fetchTicketTypes();
            const availabilityMap = new Map();

            for (const ticket of tickets) {
                const remaining = ticket.availability !== null ? ticket.availability : Infinity;
                // Accept both 'available' (from bootstrap.json) and 'on_sale' as valid statuses
                const validStatuses = ['on_sale', 'available'];
                const isAvailable = validStatuses.includes(ticket.status) && remaining > 0;

                availabilityMap.set(ticket.ticket_type, {
                    available: isAvailable,
                    remaining: remaining,
                    status: ticket.status,
                    maxQuantity: ticket.max_quantity,
                    soldCount: ticket.sold_count
                });
            }

            return availabilityMap;

        } catch {
            // Failed to get all availability - return empty map
            return new Map();
        }
    }

    /**
     * Start polling for availability updates
     * @param {number} interval - Polling interval in milliseconds (default: 30s)
     */
    startPolling(interval = 30000) {
        // Stop existing polling
        this.stopPolling();

        // Start new polling
        this.pollingInterval = setInterval(async() => {
            try {
                // Force refresh by clearing cache
                this.cache.delete('tickets');
                await this.fetchTicketTypes();
            } catch {
                // Polling error - will retry on next interval
            }
        }, interval);

        // Availability polling started
    }

    /**
     * Stop polling for availability updates
     */
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            // Availability polling stopped
        }
    }

    /**
     * Add a listener for availability updates
     * @param {Function} callback - Called with updated ticket data
     */
    addListener(callback) {
        this.listeners.add(callback);
    }

    /**
     * Remove a listener
     * @param {Function} callback - Listener to remove
     */
    removeListener(callback) {
        this.listeners.delete(callback);
    }

    /**
     * Notify all listeners of availability updates
     * @private
     */
    notifyListeners(tickets) {
        for (const listener of this.listeners) {
            try {
                listener(tickets);
            } catch {
                // Listener error - continue with other listeners
            }
        }
    }

    /**
     * Clear the availability cache
     * Forces fresh data on next fetch
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Cleanup - stop polling and clear cache
     */
    destroy() {
        this.stopPolling();
        this.clearCache();
        this.listeners.clear();
    }
}

// Singleton instance
let availabilityServiceInstance = null;

/**
 * Get the singleton availability service instance
 */
export function getAvailabilityService() {
    if (!availabilityServiceInstance) {
        availabilityServiceInstance = new AvailabilityService();
    }
    return availabilityServiceInstance;
}
/**
 * Ticket Data Service
 * Provides cached access to ticket type data from the API
 */

class TicketDataService {
    constructor() {
        this.cache = new Map();
        this.eventIdToTicketsMap = new Map();
        this.ticketTypeToEventMap = new Map();
        this.lastFetch = null;
        this.ttl = 2 * 60 * 1000; // 2 minutes cache timeout
        this.isLoading = false;
        this.loadPromise = null;
    }

    /**
     * Load all ticket data from API
     */
    async loadTicketData() {
        // Return cached data if still valid
        if (this.isValid()) {
            return Array.from(this.cache.values());
        }

        // Prevent concurrent loads
        if (this.loadPromise) {
            return this.loadPromise;
        }

        this.isLoading = true;
        this.loadPromise = this.fetchFromAPI();

        try {
            const data = await this.loadPromise;
            return data;
        } finally {
            this.isLoading = false;
            this.loadPromise = null;
        }
    }

    /**
     * Fetch ticket data from API
     */
    async fetchFromAPI() {
        try {
            const response = await fetch('/api/tickets/types?include_test=true');

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.success || !data.tickets) {
                throw new Error('Invalid API response format');
            }

            // Clear caches
            this.cache.clear();
            this.eventIdToTicketsMap.clear();
            this.ticketTypeToEventMap.clear();

            // Process and cache ticket data
            for (const ticket of data.tickets) {
                // Cache ticket by ID
                this.cache.set(ticket.id, ticket);

                // Build event ID to tickets mapping
                if (!this.eventIdToTicketsMap.has(ticket.event_id)) {
                    this.eventIdToTicketsMap.set(ticket.event_id, []);
                }
                this.eventIdToTicketsMap.get(ticket.event_id).push(ticket);

                // Build ticket type to event ID mapping
                // API returns 'id' field as the ticket type identifier
                if (!ticket.id) {
                    throw new Error(`Ticket missing required 'id' field: ${JSON.stringify(ticket)}`);
                }
                this.ticketTypeToEventMap.set(ticket.id, ticket.event_id);
            }

            this.lastFetch = Date.now();

            // Successfully loaded ticket types from API

            return data.tickets;

        } catch {
            // Failed to fetch ticket data - using fallback

            // Load fallback data for robustness
            this._loadFallbackTickets();
            // Using fallback ticket data due to API failure

            return Array.from(this.cache.values());
        }
    }

    /**
     * Load basic fallback ticket data when API fails
     */
    _loadFallbackTickets() {
        // Basic fallback data matching API structure
        const fallbackTickets = [
            {
                id: 'boulderfest-2026-early-bird-full',
                name: 'Early Bird Full Weekend Pass',
                price_cents: 9900,
                event_id: 3,
                event_name: 'A Lo Cubano Boulder Fest 2026',
                event_date: '2026-05-15',
                event_venue: 'Avalon Ballroom',
                status: 'available'
            },
            {
                id: 'boulderfest-2026-regular-full',
                name: 'Full Weekend Pass',
                price_cents: 12900,
                event_id: 3,
                event_name: 'A Lo Cubano Boulder Fest 2026',
                event_date: '2026-05-15',
                event_venue: 'Avalon Ballroom',
                status: 'available'
            },
            {
                id: 'weekender-2025-11-full',
                name: 'November Weekender Full Pass',
                price_cents: 6500,
                event_id: 2,
                event_name: 'November Salsa Weekender 2025',
                event_date: '2025-11-08',
                event_venue: 'Boulder Theater',
                status: 'available'
            }
        ];

        // Clear caches and load fallback data
        this.cache.clear();
        this.eventIdToTicketsMap.clear();
        this.ticketTypeToEventMap.clear();

        for (const ticket of fallbackTickets) {
            // Cache ticket by ID
            this.cache.set(ticket.id, ticket);

            // Build event ID to tickets mapping
            if (!this.eventIdToTicketsMap.has(ticket.event_id)) {
                this.eventIdToTicketsMap.set(ticket.event_id, []);
            }
            this.eventIdToTicketsMap.get(ticket.event_id).push(ticket);

            // Build ticket type to event ID mapping
            this.ticketTypeToEventMap.set(ticket.id, ticket.event_id);
        }

        this.lastFetch = Date.now();
    }

    /**
     * Get tickets for a specific event
     */
    async getTicketsByEventId(eventId) {
        await this.loadTicketData();
        return this.eventIdToTicketsMap.get(eventId) || [];
    }

    /**
     * Get event ID from ticket type
     */
    async getEventIdFromTicketType(ticketType) {
        await this.loadTicketData();
        const eventId = this.ticketTypeToEventMap.get(ticketType);

        if (!eventId) {
            // No event mapping found for ticket type
            throw new Error(`No event mapping found for ticket type: ${ticketType}`);
        }

        return eventId;
    }

    /**
     * Get ticket data by type
     */
    async getTicketByType(ticketType) {
        await this.loadTicketData();

        for (const ticket of this.cache.values()) {
            if (ticket.id === ticketType) {
                return ticket;
            }
        }

        return null;
    }

    /**
     * Get individual ticket by ticket type (alias for getTicketByType)
     */
    async getTicketById(ticketType) {
        return await this.getTicketByType(ticketType);
    }

    /**
     * Get all available tickets
     */
    async getAllTickets() {
        await this.loadTicketData();
        return Array.from(this.cache.values());
    }

    /**
     * Force refresh from API and clear cache
     */
    async refreshCache() {
        this.invalidate();
        return await this.loadTicketData();
    }

    /**
     * Get all ticket types on current page
     */
    async getTicketTypesOnPage() {
        // Check both data-ticket-type and data-ticket-id for compatibility
        const ticketCards = document.querySelectorAll('[data-ticket-type], [data-ticket-id]');
        const ticketTypesOnPage = Array.from(ticketCards).map(card =>
            card.dataset.ticketType || card.dataset.ticketId
        );

        // Filter out any empty values
        return ticketTypesOnPage.filter(type => type && type.trim());
    }

    /**
     * Detect event ID from tickets on current page
     */
    async detectEventIdFromPage() {
        const ticketTypesOnPage = await this.getTicketTypesOnPage();

        if (ticketTypesOnPage.length === 0) {
            // No ticket types found on page, using default
            return 1; // Default to boulderfest-2026 (event ID: 1)
        }

        // Get event ID from first ticket type
        const firstTicketType = ticketTypesOnPage[0];
        const eventId = await this.getEventIdFromTicketType(firstTicketType);

        // Verify all tickets on page belong to same event
        const eventIds = [];
        for (const ticketType of ticketTypesOnPage) {
            try {
                const id = await this.getEventIdFromTicketType(ticketType);
                eventIds.push(id);
            } catch (error) {
                // Failed to map ticket type - continuing with validation
                throw error;
            }
        }

        const uniqueEventIds = [...new Set(eventIds)];
        if (uniqueEventIds.length > 1) {
            throw new Error(`Mixed events on page! Found tickets for events: ${uniqueEventIds.join(', ')}`);
        }

        // Successfully detected event ID from page ticket types
        return eventId;
    }

    /**
     * Check if cached data is still valid
     */
    isValid() {
        return this.lastFetch &&
               (Date.now() - this.lastFetch) < this.ttl &&
               this.cache.size > 0;
    }

    /**
     * Check if data is currently loading
     */
    isLoadingData() {
        return this.isLoading;
    }

    /**
     * Invalidate cache
     */
    invalidate() {
        this.cache.clear();
        this.eventIdToTicketsMap.clear();
        this.ticketTypeToEventMap.clear();
        this.lastFetch = null;
        this.loadPromise = null;
        // Ticket data cache invalidated
    }

    /**
     * Get cache stats for debugging
     */
    getStats() {
        return {
            cacheSize: this.cache.size,
            eventMappings: this.eventIdToTicketsMap.size,
            typeMappings: this.ticketTypeToEventMap.size,
            isValid: this.isValid(),
            isLoading: this.isLoading,
            lastFetch: this.lastFetch,
            ttl: this.ttl
        };
    }

    /**
     * Check if a ticket type is available for purchase
     */
    async isTicketAvailable(ticketType) {
        const ticket = await this.getTicketByType(ticketType);
        if (!ticket) {
            return false;
        }

        return ticket.status === 'active' &&
               (ticket.availability === null || ticket.availability > 0);
    }

    /**
     * Get tickets filtered by status
     */
    async getTicketsByStatus(status) {
        await this.loadTicketData();
        return Array.from(this.cache.values()).filter(ticket => ticket.status === status);
    }

    /**
     * Get available tickets (status = 'active' and availability > 0)
     */
    async getAvailableTickets() {
        await this.loadTicketData();
        return Array.from(this.cache.values()).filter(ticket =>
            ticket.status === 'active' &&
            (ticket.availability === null || ticket.availability > 0)
        );
    }

    /**
     * Get ticket data in format compatible with legacy TICKET_TYPE_TO_EVENT_MAP
     */
    async getLegacyMapping() {
        await this.loadTicketData();
        const mapping = {};

        for (const [ticketType, eventId] of this.ticketTypeToEventMap.entries()) {
            mapping[ticketType] = eventId;
        }

        return mapping;
    }

    /**
     * Debug helper: Log current service state
     */
    debug() {
        const stats = this.getStats();
        return {
            ...stats,
            tickets: Array.from(this.cache.values()).map(t => ({
                id: t.id,
                ticket_type: t.id,
                name: t.name,
                price_cents: t.price_cents,
                status: t.status,
                event_id: t.event_id,
                availability: t.availability
            })),
            ticketTypes: Array.from(this.ticketTypeToEventMap.keys()),
            eventGroups: Object.fromEntries(
                Array.from(this.eventIdToTicketsMap.entries()).map(([eventId, tickets]) => [
                    eventId,
                    tickets.map(t => t.id)
                ])
            )
        };
    }
}

// Export singleton instance
export const ticketDataService = new TicketDataService();

// Export class for testing
export { TicketDataService };

// Global access for debugging
if (typeof window !== 'undefined') {
    window.ticketDataService = ticketDataService;
    window.debugTickets = () => ticketDataService.debug();
}
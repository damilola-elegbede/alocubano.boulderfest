/**
 * Events Management Service
 * Single source of truth for event data across the application
 * Provides cached access to events with automatic initialization
 */

class EventsService {
    constructor() {
        this.events = new Map(); // Cache events by ID
        this.eventsBySlug = new Map(); // Cache events by slug for migration support
        this.initialized = false;
        this.initializationPromise = null;
        this.lastFetchTime = null;
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache timeout
    }

    /**
     * Ensure the service is initialized and return the instance
     */
    async ensureInitialized() {
        if (this.initialized && this.isCacheValid()) {
            return this;
        }

        if (this.initializationPromise) {
            await this.initializationPromise;
            return this;
        }

        this.initializationPromise = this._performInitialization();

        try {
            await this.initializationPromise;
            return this;
        } catch (error) {
            this.initializationPromise = null; // Enable retry
            throw error;
        }
    }

    /**
     * Load events from the API and populate cache
     */
    async loadEvents() {
        await this.ensureInitialized();
        return Array.from(this.events.values());
    }

    /**
     * Get event by integer ID
     */
    async getEventById(id) {
        await this.ensureInitialized();
        return this.events.get(id) || null;
    }

    /**
     * Get event by slug (for migration support)
     */
    async getEventBySlug(slug) {
        await this.ensureInitialized();
        return this.eventsBySlug.get(slug) || null;
    }

    /**
     * Get display name for an event ID
     */
    async getEventName(id) {
        const event = await this.getEventById(id);
        if (!event) {
            // Event not found for ID
            return 'A Lo Cubano Tickets';
        }
        return event.displayName;
    }

    /**
     * Get all cached events
     */
    async getAllEvents() {
        await this.ensureInitialized();
        return Array.from(this.events.values());
    }

    /**
     * Clear the cache and force reload on next access
     */
    clearCache() {
        this.events.clear();
        this.eventsBySlug.clear();
        this.initialized = false;
        this.initializationPromise = null;
        this.lastFetchTime = null;
        // Events cache cleared
    }

    /**
     * Get cache statistics for debugging
     */
    getCacheStats() {
        return {
            initialized: this.initialized,
            eventCount: this.events.size,
            lastFetchTime: this.lastFetchTime,
            cacheValid: this.isCacheValid(),
            cacheAge: this.lastFetchTime ? Date.now() - this.lastFetchTime : null
        };
    }

    /**
     * Performance method: Check if cache is still valid
     */
    isCacheValid() {
        if (!this.lastFetchTime) {
            return false;
        }
        return (Date.now() - this.lastFetchTime) < this.cacheTimeout;
    }

    /**
     * Internal initialization logic
     */
    async _performInitialization() {
        try {
            // Loading events from API

            const response = await fetch('/api/events/list');
            if (!response.ok) {
                throw new Error(`Failed to fetch events: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            if (!data.success || !Array.isArray(data.events)) {
                throw new Error('Invalid events data received from API');
            }

            // Clear existing cache
            this.events.clear();
            this.eventsBySlug.clear();

            // Populate cache with event data
            data.events.forEach(event => {
                this.events.set(event.id, event);
                this.eventsBySlug.set(event.slug, event);
            });

            this.initialized = true;
            this.lastFetchTime = Date.now();
            this.initializationPromise = null;

            // Events service initialized successfully

            return this;

        } catch (error) {
            // Failed to initialize events service - using fallback

            // Fallback to hardcoded data for robustness
            this._loadFallbackEvents();
            this.initialized = true;
            this.lastFetchTime = Date.now();
            this.initializationPromise = null;

            // Using fallback event data due to API failure
            return this;
        }
    }

    /**
     * Fallback event data for when API is unavailable
     */
    _loadFallbackEvents() {
        const fallbackEvents = [
            {
                id: 1,
                slug: 'boulderfest-2026',
                name: 'A Lo Cubano Boulder Fest 2026',
                displayName: 'Boulder Fest 2026 Tickets',
                type: 'festival',
                status: 'upcoming',
                description: 'The premier Cuban salsa festival in Boulder',
                venue: {
                    name: 'Avalon Ballroom',
                    address: '6185 Arapahoe Road',
                    city: 'Boulder',
                    state: 'CO',
                    zip: '80303'
                },
                dates: {
                    start: '2026-05-15',
                    end: '2026-05-17',
                    year: 2026
                }
            },
            {
                id: 2,
                slug: '2025-11-weekender',
                name: 'A Lo Cubano Weekender November 2025',
                displayName: 'November 2025 Weekender Tickets',
                type: 'weekender',
                status: 'upcoming',
                description: 'An intimate weekend intensive',
                venue: {
                    name: 'Venue TBA',
                    address: 'Address TBA',
                    city: 'Boulder',
                    state: 'CO'
                },
                dates: {
                    start: '2025-11-01',
                    end: '2025-11-03',
                    year: 2025
                }
            },
            // Test events
            {
                id: -1,
                slug: 'test-weekender',
                name: 'Test Weekender',
                displayName: '[TEST] Weekender Tickets',
                type: 'weekender',
                status: 'active',
                description: 'Test event for development',
                venue: {
                    name: 'Test Venue',
                    city: 'Boulder',
                    state: 'CO'
                },
                dates: {
                    start: '2024-12-01',
                    end: '2024-12-03',
                    year: 2024
                },
                config: { is_test: true }
            },
            {
                id: -2,
                slug: 'test-festival',
                name: 'Test Festival',
                displayName: '[TEST] Festival Tickets',
                type: 'festival',
                status: 'active',
                description: 'Test festival event',
                venue: {
                    name: 'Test Venue',
                    city: 'Boulder',
                    state: 'CO'
                },
                dates: {
                    start: '2024-12-15',
                    end: '2024-12-17',
                    year: 2024
                },
                config: { is_test: true }
            }
        ];

        // Legacy slug mappings for migration support
        const legacyMappings = [
            { legacy: 'weekender-2025-11', current: '2025-11-weekender' },
            { legacy: 'boulderfest-2025', current: 'boulderfest-2026' },
            { legacy: 'alocubano-boulderfest-2026', current: 'boulderfest-2026' },
            { legacy: 'november-2025-weekender', current: '2025-11-weekender' }
        ];

        fallbackEvents.forEach(event => {
            this.events.set(event.id, event);
            this.eventsBySlug.set(event.slug, event);
        });

        // Add legacy mappings
        legacyMappings.forEach(mapping => {
            const event = this.eventsBySlug.get(mapping.current);
            if (event) {
                this.eventsBySlug.set(mapping.legacy, event);
            }
        });
    }

    /**
     * Migration helper: Convert legacy event identifiers to current format
     */
    async migrateLegacyEventId(legacyId) {
        await this.ensureInitialized();

        // Handle legacy string identifiers that should map to slugs
        const legacyMappings = {
            'weekender-2025-11': '2025-11-weekender',
            'boulderfest-2025': 'boulderfest-2026',
            'alocubano-boulderfest-2026': 'boulderfest-2026',
            'november-2025-weekender': '2025-11-weekender',
            'Test Weekender': 'test-weekender',
            'Test Festival': 'test-festival'
        };

        const mappedSlug = legacyMappings[legacyId] || legacyId;
        const event = await this.getEventBySlug(mappedSlug);

        return event ? event.id : null;
    }

    /**
     * Debug helper: Log current service state
     */
    debug() {
        const stats = this.getCacheStats();
        // Debug information available in stats variable
        return {
            ...stats,
            events: Array.from(this.events.values()).map(e => ({
                id: e.id,
                slug: e.slug,
                name: e.name,
                displayName: e.displayName
            })),
            slugs: Array.from(this.eventsBySlug.keys())
        };
    }
}

// Singleton instance
const eventsService = new EventsService();

// Export singleton instance and class
export { eventsService as default, EventsService };

// Global access for debugging
if (typeof window !== 'undefined') {
    window.eventsService = eventsService;
    window.debugEvents = () => eventsService.debug();
}
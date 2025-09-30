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
        this.LOCALSTORAGE_KEY = 'events_cache';
        this.LOCALSTORAGE_EXPIRY = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Preload all events and cache in localStorage (for fast cart operations)
     * Call this on tickets page load to warm the cache
     */
    async preloadAndCache() {
        try {
            await this.ensureInitialized();
            const events = Array.from(this.events.values());

            // Store in localStorage with timestamp
            const cache = {
                events: events,
                timestamp: Date.now()
            };

            localStorage.setItem(this.LOCALSTORAGE_KEY, JSON.stringify(cache));

            return events;
        } catch {
            // Failed to preload events - non-critical
            return [];
        }
    }

    /**
     * Get event from localStorage cache (fast, no API call)
     * Returns null if not cached or expired
     */
    getFromLocalStorageCache(eventId) {
        try {
            const cached = localStorage.getItem(this.LOCALSTORAGE_KEY);
            if (!cached) {
                return null;
            }

            const cache = JSON.parse(cached);
            const age = Date.now() - cache.timestamp;

            // Check expiry
            if (age > this.LOCALSTORAGE_EXPIRY) {
                localStorage.removeItem(this.LOCALSTORAGE_KEY);
                return null;
            }

            // Find event by ID
            const event = cache.events.find(e => e.id === eventId);
            return event || null;
        } catch {
            // Cache read error - return null, fall back to API
            return null;
        }
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
     * Get display name for an event ID - NO FALLBACK
     */
    async getEventName(id) {
        const event = await this.getEventById(id);
        if (!event) {
            // Event not found for ID - NO FALLBACK
            return null;
        }
        return event.name;
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

        } catch {
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
                slug: 'boulderfest-2025',
                name: 'A Lo Cubano Boulder Fest 2025',
                displayName: 'Boulder Fest 2025 Tickets',
                type: 'festival',
                status: 'completed',
                description: 'The 2025 Cuban salsa festival in Boulder',
                venue: {
                    name: 'Avalon Ballroom',
                    address: '6185 Arapahoe Road',
                    city: 'Boulder',
                    state: 'CO',
                    zip: '80303'
                },
                dates: {
                    start: '2025-05-16',
                    end: '2025-05-18',
                    year: 2025
                }
            },
            {
                id: 2,
                slug: 'weekender-2025-11',
                name: 'November Salsa Weekender 2025',
                displayName: 'November 2025 Weekender Tickets',
                type: 'weekender',
                status: 'upcoming',
                description: 'An intimate weekend of Cuban salsa workshops',
                venue: {
                    name: 'Boulder Theater',
                    address: '2032 14th Street',
                    city: 'Boulder',
                    state: 'CO',
                    zip: '80302'
                },
                dates: {
                    start: '2025-11-08',
                    end: '2025-11-09',
                    year: 2025
                }
            },
            {
                id: 3,
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
            { legacy: '2025-11-weekender', current: 'weekender-2025-11' },
            { legacy: 'november-2025-weekender', current: 'weekender-2025-11' },
            { legacy: 'alocubano-boulderfest-2025', current: 'boulderfest-2025' },
            { legacy: 'alocubano-boulderfest-2026', current: 'boulderfest-2026' }
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
            '2025-11-weekender': 'weekender-2025-11',
            'november-2025-weekender': 'weekender-2025-11',
            'alocubano-boulderfest-2025': 'boulderfest-2025',
            'alocubano-boulderfest-2026': 'boulderfest-2026',
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
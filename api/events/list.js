/**
 * Events List API Endpoint
 * Returns all events with their IDs, names, slugs, and relevant data
 * Serves as the data source for the events management service
 */

import { getDatabaseClient } from '../../lib/database.js';
import { processDatabaseResult } from '../../lib/bigint-serializer.js';
import { getTestEvents as getSharedTestEvents } from '../../lib/test-events.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });
    }

    try {
        const client = await getDatabaseClient();

        // Get all events ordered by display order and start date
        const eventsResult = await client.execute(`
            SELECT
                id,
                slug,
                name,
                type,
                status,
                description,
                venue_name,
                venue_address,
                venue_city,
                venue_state,
                venue_zip,
                start_date,
                end_date,
                year,
                max_capacity,
                early_bird_end_date,
                regular_price_start_date,
                display_order,
                is_featured,
                is_visible,
                created_at,
                updated_at,
                config
            FROM events
            WHERE is_visible = 1
            ORDER BY display_order ASC, start_date ASC
        `);

        // Process BigInt values from database before JSON serialization
        const processedResult = processDatabaseResult(eventsResult);

        // Transform events for frontend consumption
        const events = processedResult.rows.map(event => {
            // Parse config JSON if present
            let config = {};
            try {
                if (event.config) {
                    config = JSON.parse(event.config);
                }
            } catch (error) {
                console.warn(`Failed to parse config for event ${event.id}:`, error);
                config = {};
            }

            // Calculate display name for cart integration
            const displayName = generateDisplayName(event);

            return {
                id: event.id,
                slug: event.slug,
                name: event.name,
                displayName, // For cart/UI display
                type: event.type,
                status: event.status,
                description: event.description,
                venue: {
                    name: event.venue_name,
                    address: event.venue_address,
                    city: event.venue_city,
                    state: event.venue_state,
                    zip: event.venue_zip
                },
                dates: {
                    start: event.start_date,
                    end: event.end_date,
                    year: event.year
                },
                capacity: {
                    max: event.max_capacity,
                    earlyBirdEnd: event.early_bird_end_date,
                    regularPriceStart: event.regular_price_start_date
                },
                display: {
                    order: event.display_order,
                    featured: Boolean(event.is_featured),
                    visible: Boolean(event.is_visible)
                },
                timestamps: {
                    created: event.created_at,
                    updated: event.updated_at
                },
                config
            };
        });

        // Add test events for development/testing (only in non-production environments)
        const testEvents = process.env.NODE_ENV !== 'production' ? getSharedTestEvents() : [];
        const allEvents = [...testEvents, ...events];

        return res.status(200).json({
            success: true,
            events: allEvents,
            meta: {
                total: allEvents.length,
                database: events.length,
                test: process.env.NODE_ENV !== 'production' ? testEvents.length : 0,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Failed to fetch events:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch events',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

/**
 * Generate display name for cart and UI components
 */
function generateDisplayName(event) {
    const typeDisplayMap = {
        'festival': 'Festival',
        'weekender': 'Weekender',
        'workshop': 'Workshop',
        'special': 'Special Event'
    };

    const typeDisplay = typeDisplayMap[event.type] || 'Event';
    const year = event.year || new Date(event.start_date).getFullYear();

    // Format based on event type and naming patterns
    if (event.type === 'weekender') {
        const monthYear = new Date(event.start_date).toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric'
        });
        return `${monthYear} ${typeDisplay} Tickets`;
    }

    if (event.type === 'festival') {
        return `${event.name.replace(/A Lo Cubano /i, '')} Tickets`;
    }

    return `${event.name} Tickets`;
}


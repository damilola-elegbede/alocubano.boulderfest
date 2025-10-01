/**
 * Shared test events for development and testing
 * Single source of truth for test event data
 *
 * Test events use negative IDs (-1, -2) to distinguish them from production events
 * and include is_test: true flag in config for easy filtering
 */

/**
 * Get complete test events with full structure (for public events API)
 */
export function getTestEvents() {
    return [
        {
            id: -1,
            slug: 'test-weekender',
            name: 'Test Weekender',
            displayName: '[TEST] Weekender Tickets',
            type: 'weekender',
            status: 'active',
            description: 'Test event for development and testing purposes',
            venue: {
                name: 'Test Venue',
                address: 'Test Address',
                city: 'Boulder',
                state: 'CO',
                zip: '80303'
            },
            dates: {
                start: '2024-12-01',
                end: '2024-12-03',
                year: 2024
            },
            capacity: {
                max: 10,
                earlyBirdEnd: '2024-11-01',
                regularPriceStart: '2024-11-15'
            },
            display: {
                order: 999,
                featured: false,
                visible: true
            },
            timestamps: {
                created: '2024-01-01T00:00:00.000Z',
                updated: '2024-01-01T00:00:00.000Z'
            },
            config: {
                ticket_types: ['test-weekender-pass'],
                features: { testing: true },
                is_test: true
            }
        },
        {
            id: -2,
            slug: 'test-festival',
            name: 'Test Festival',
            displayName: '[TEST] Festival Tickets',
            type: 'festival',
            status: 'active',
            description: 'Test festival event for development and testing purposes',
            venue: {
                name: 'Test Venue',
                address: 'Test Address',
                city: 'Boulder',
                state: 'CO',
                zip: '80303'
            },
            dates: {
                start: '2024-12-15',
                end: '2024-12-17',
                year: 2024
            },
            capacity: {
                max: 20,
                earlyBirdEnd: '2024-11-15',
                regularPriceStart: '2024-12-01'
            },
            display: {
                order: 999,
                featured: false,
                visible: true
            },
            timestamps: {
                created: '2024-01-01T00:00:00.000Z',
                updated: '2024-01-01T00:00:00.000Z'
            },
            config: {
                ticket_types: ['test-festival-pass'],
                features: { testing: true },
                is_test: true
            }
        }
    ];
}

/**
 * Get simplified test events for admin event selector
 * Returns only fields needed for dropdown display
 */
export function getAdminTestEvents() {
    return [
        {
            id: -1,
            slug: 'test-weekender',
            name: 'Test Weekender',
            type: 'weekender',
            status: 'test',
            start_date: '2024-12-01',
            end_date: '2024-12-03'
        },
        {
            id: -2,
            slug: 'test-festival',
            name: 'Test Festival',
            type: 'festival',
            status: 'test',
            start_date: '2024-12-15',
            end_date: '2024-12-17'
        }
    ];
}

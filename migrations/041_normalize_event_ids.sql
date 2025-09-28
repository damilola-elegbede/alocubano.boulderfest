-- Migration: 041 - Normalize Event IDs and Ensure Required Events
-- Purpose: Ensure all required events exist and normalize ticket event_id values to integers
-- Dependencies: 039_cleanup_test_events.sql

-- =============================================================================
-- STEP 1: Insert Missing Event Records (Idempotent)
-- =============================================================================

-- Insert Boulder Fest 2026 (main production event) if not exists
INSERT OR IGNORE INTO events (
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
    max_capacity,
    early_bird_end_date,
    regular_price_start_date,
    display_order,
    is_featured,
    is_visible,
    created_by,
    config
) VALUES (
    'boulderfest-2026',
    'A Lo Cubano Boulder Fest 2026',
    'festival',
    'upcoming',
    'The premier Cuban salsa festival in Boulder, featuring world-class instructors, live music, and three nights of social dancing.',
    'Avalon Ballroom',
    '6185 Arapahoe Road',
    'Boulder',
    'CO',
    '80303',
    '2026-05-15',
    '2026-05-17',
    500,
    '2026-03-01',
    '2026-04-01',
    1,
    TRUE,
    TRUE,
    'system',
    json('{"ticket_types": ["full-pass", "day-pass", "workshop-only", "social-only", "vip"], "features": {"workshops": true, "performances": true, "social_dancing": true, "live_music": true, "vendor_booths": true}}')
);

-- Insert Boulder Fest 2025 (legacy event) if not exists
INSERT OR IGNORE INTO events (
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
    max_capacity,
    early_bird_end_date,
    regular_price_start_date,
    display_order,
    is_featured,
    is_visible,
    created_by,
    config
) VALUES (
    'boulderfest-2025',
    'A Lo Cubano Boulder Fest 2025',
    'festival',
    'completed',
    'The 2025 Cuban salsa festival in Boulder - featuring world-class instructors and live music.',
    'Avalon Ballroom',
    '6185 Arapahoe Road',
    'Boulder',
    'CO',
    '80303',
    '2025-05-16',
    '2025-05-18',
    500,
    '2025-03-01',
    '2025-04-01',
    3,
    FALSE,
    FALSE,
    'system',
    json('{"ticket_types": ["full-pass", "day-pass", "workshop-only", "social-only"], "features": {"workshops": true, "performances": true, "social_dancing": true, "live_music": true}}')
);

-- Insert November 2025 Weekender (current production weekender) if not exists
INSERT OR IGNORE INTO events (
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
    max_capacity,
    early_bird_end_date,
    regular_price_start_date,
    display_order,
    is_featured,
    is_visible,
    created_by,
    config
) VALUES (
    'weekender-2025-11',
    'November Salsa Weekender 2025',
    'weekender',
    'upcoming',
    'An intimate weekend of Cuban salsa workshops and social dancing in the heart of Boulder.',
    'Boulder Theater',
    '2032 14th Street',
    'Boulder',
    'CO',
    '80302',
    '2025-11-08',
    '2025-11-09',
    200,
    '2025-09-15',
    '2025-10-01',
    2,
    TRUE,
    TRUE,
    'system',
    json('{"ticket_types": ["weekend-pass", "saturday-pass", "sunday-pass", "saturday-social", "sunday-social"], "features": {"workshops": true, "social_dancing": true, "intimate_format": true, "limited_capacity": true}}')
);

-- Insert Test Weekender (for testing) if not exists - using negative ID for clear test identification
INSERT OR IGNORE INTO events (
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
    max_capacity,
    early_bird_end_date,
    regular_price_start_date,
    display_order,
    is_featured,
    is_visible,
    created_by,
    config
) VALUES (
    -1,
    'test-weekender',
    'Test Weekender Event',
    'weekender',
    'test',
    'Test weekender event for development and testing purposes only.',
    'Test Ballroom',
    '123 Test Street',
    'Boulder',
    'CO',
    '80301',
    '2024-01-01',
    '2024-01-02',
    50,
    '2023-12-01',
    '2023-12-15',
    999,
    FALSE,
    FALSE,
    'system',
    json('{"ticket_types": ["test-pass", "test-day"], "features": {"workshops": true, "social_dancing": true}, "test_mode": true}')
);

-- Insert Test Festival (for testing) if not exists - using negative ID for clear test identification
INSERT OR IGNORE INTO events (
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
    max_capacity,
    early_bird_end_date,
    regular_price_start_date,
    display_order,
    is_featured,
    is_visible,
    created_by,
    config
) VALUES (
    -2,
    'test-festival',
    'Test Festival Event',
    'festival',
    'test',
    'Test festival event for development and testing purposes only.',
    'Test Ballroom',
    '123 Test Street',
    'Boulder',
    'CO',
    '80301',
    '2024-01-01',
    '2024-01-03',
    100,
    '2023-12-01',
    '2023-12-15',
    998,
    FALSE,
    FALSE,
    'system',
    json('{"ticket_types": ["test-full-pass", "test-day-pass"], "features": {"workshops": true, "performances": true, "social_dancing": true}, "test_mode": true}')
);

-- =============================================================================
-- STEP 2: Create Temporary Mapping Table for Event ID Normalization
-- =============================================================================

-- Create temporary table to map string event_id values to integer IDs
CREATE TEMP TABLE event_id_mapping AS
SELECT DISTINCT
    CASE
        -- Direct slug mappings
        WHEN event_id = 'boulderfest-2026' THEN (SELECT id FROM events WHERE slug = 'boulderfest-2026')
        WHEN event_id = 'boulderfest-2025' THEN (SELECT id FROM events WHERE slug = 'boulderfest-2025')
        WHEN event_id = 'weekender-2025-11' THEN (SELECT id FROM events WHERE slug = 'weekender-2025-11')
        WHEN event_id = 'test-weekender' THEN (SELECT id FROM events WHERE slug = 'test-weekender')
        WHEN event_id = 'test-festival' THEN (SELECT id FROM events WHERE slug = 'test-festival')

        -- Legacy variant mappings (handle potential inconsistencies)
        WHEN event_id = '2025-11-weekender' THEN (SELECT id FROM events WHERE slug = 'weekender-2025-11')
        WHEN event_id = 'boulder-fest-2026' THEN (SELECT id FROM events WHERE slug = 'boulderfest-2026')
        WHEN event_id = 'boulder-fest-2025' THEN (SELECT id FROM events WHERE slug = 'boulderfest-2025')

        -- Default to boulderfest-2026 for any unmatched strings
        ELSE (SELECT id FROM events WHERE slug = 'boulderfest-2026')
    END as new_event_id,
    event_id as old_event_id
FROM tickets
WHERE event_id IS NOT NULL
AND typeof(event_id) = 'text'  -- Only process text values
AND new_event_id IS NOT NULL;  -- Ensure we have a valid mapping

-- =============================================================================
-- STEP 3: Update Tickets with String event_id Values to Use Integer IDs
-- =============================================================================

-- Update tickets that currently have string event_id values
UPDATE tickets
SET event_id = (
    SELECT new_event_id
    FROM event_id_mapping
    WHERE old_event_id = tickets.event_id
)
WHERE typeof(event_id) = 'text'  -- Only update text values
AND event_id IN (SELECT old_event_id FROM event_id_mapping);

-- Handle any remaining NULL event_id values by defaulting to boulderfest-2026
UPDATE tickets
SET event_id = (SELECT id FROM events WHERE slug = 'boulderfest-2026')
WHERE event_id IS NULL;

-- =============================================================================
-- STEP 4: Update Transactions with String event_id Values (if any exist)
-- =============================================================================

-- Check if transactions table has string event_id values and update them
UPDATE transactions
SET event_id = (
    CASE
        WHEN event_id = 'boulderfest-2026' THEN (SELECT id FROM events WHERE slug = 'boulderfest-2026')
        WHEN event_id = 'boulderfest-2025' THEN (SELECT id FROM events WHERE slug = 'boulderfest-2025')
        WHEN event_id = 'weekender-2025-11' THEN (SELECT id FROM events WHERE slug = 'weekender-2025-11')
        WHEN event_id = '2025-11-weekender' THEN (SELECT id FROM events WHERE slug = 'weekender-2025-11')
        WHEN event_id = 'test-weekender' THEN (SELECT id FROM events WHERE slug = 'test-weekender')
        WHEN event_id = 'test-festival' THEN (SELECT id FROM events WHERE slug = 'test-festival')
        ELSE (SELECT id FROM events WHERE slug = 'boulderfest-2026')
    END
)
WHERE typeof(event_id) = 'text';

-- Handle any remaining NULL event_id values in transactions
UPDATE transactions
SET event_id = (SELECT id FROM events WHERE slug = 'boulderfest-2026')
WHERE event_id IS NULL;

-- =============================================================================
-- STEP 5: Add Performance Indexes for Event-Related Queries
-- =============================================================================

-- Indexes for event lookups (idempotent)
CREATE INDEX IF NOT EXISTS idx_events_slug_status ON events(slug, status);
CREATE INDEX IF NOT EXISTS idx_events_type_status ON events(type, status);
CREATE INDEX IF NOT EXISTS idx_events_display_order ON events(display_order);

-- Indexes for ticket-event relationships
CREATE INDEX IF NOT EXISTS idx_tickets_event_status ON tickets(event_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_event_type ON tickets(event_id, ticket_type);

-- Indexes for transaction-event relationships
CREATE INDEX IF NOT EXISTS idx_transactions_event_status ON transactions(event_id, status);

-- =============================================================================
-- VERIFICATION QUERIES (Comments for debugging)
-- =============================================================================

-- After migration, verify with these queries:
-- SELECT id, slug, name, type, status FROM events ORDER BY display_order;
-- SELECT COUNT(*), event_id FROM tickets GROUP BY event_id;
-- SELECT COUNT(*), event_id FROM transactions GROUP BY event_id;
-- SELECT DISTINCT typeof(event_id) FROM tickets;
-- SELECT DISTINCT typeof(event_id) FROM transactions;
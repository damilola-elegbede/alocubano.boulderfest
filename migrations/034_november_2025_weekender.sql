-- Migration: 034 - November 2025 Weekender Event
-- Purpose: Add November 2025 Weekender event to events table
-- Dependencies: 019_multi_event_architecture.sql

-- Insert November 2025 Weekender Event
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
    '2025-11-weekender',
    'A Lo Cubano Weekender November 2025',
    'weekender',
    'upcoming',
    'An intimate weekend intensive of authentic Cuban salsa, focused learning, and deep cultural connection in November 2025',
    'Venue TBA',
    'Address TBA',
    'Boulder',
    'CO',
    NULL,
    '2025-11-01',  -- Placeholder start date (TBA)
    '2025-11-03',  -- Placeholder end date (TBA)
    50,            -- Limited to 50 dancers for intimate experience
    '2025-09-01',  -- Placeholder early bird end
    '2025-10-01',  -- Placeholder regular price start
    2,             -- Display order (after main festival)
    TRUE,          -- Featured event
    TRUE,          -- Visible to public
    'system',
    json('{"ticket_types": ["weekender-pass", "day-pass", "workshop-only"], "features": {"workshops": true, "social_dancing": true, "intimate_format": true, "limited_capacity": true}, "format": "weekender", "capacity_limit": 50, "focus": "intensive_learning"}')
);

-- Add event settings for November 2025 Weekender
INSERT OR IGNORE INTO event_settings (event_id, key, value) VALUES
    ((SELECT id FROM events WHERE slug = '2025-11-weekender'), 'registration_open', 'false'),
    ((SELECT id FROM events WHERE slug = '2025-11-weekender'), 'early_bird_active', 'false'),
    ((SELECT id FROM events WHERE slug = '2025-11-weekender'), 'artist_announcements', 'pending'),
    ((SELECT id FROM events WHERE slug = '2025-11-weekender'), 'schedule_published', 'false'),
    ((SELECT id FROM events WHERE slug = '2025-11-weekender'), 'venue_confirmed', 'false'),
    ((SELECT id FROM events WHERE slug = '2025-11-weekender'), 'dates_confirmed', 'false');
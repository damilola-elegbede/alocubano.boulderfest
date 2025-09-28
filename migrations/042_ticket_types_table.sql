-- Migration: 042 - Bootstrap Ticket Types Table
-- Purpose: Ensure ticket_types table exists and populate with bootstrap data
-- Dependencies: 041_normalize_event_ids.sql
-- Note: Works with existing table structure (display_order, not sort_order)

-- =============================================================================
-- STEP 1: Create ticket_types table (idempotent - works with existing table)
-- =============================================================================

-- Note: Table already exists with proper structure from earlier migrations
-- This migration focuses on data population and additional indexes

-- =============================================================================
-- STEP 2: Create additional performance indexes (idempotent)
-- =============================================================================

-- Core ordering and display indexes (using existing display_order column)
CREATE INDEX IF NOT EXISTS idx_ticket_types_event_display_order
    ON ticket_types(event_id, display_order);

CREATE INDEX IF NOT EXISTS idx_ticket_types_availability_display
    ON ticket_types(event_id, status, display_order);

-- Performance tracking index (if not already exists)
CREATE INDEX IF NOT EXISTS idx_ticket_types_performance_sales
    ON ticket_types(event_id, sold_count, max_quantity)
    WHERE status IN ('available', 'sold-out');

-- =============================================================================
-- STEP 3: Insert bootstrap ticket types from config
-- =============================================================================

-- November 2025 Weekender active tickets
INSERT OR IGNORE INTO ticket_types (
    id, event_id, name, description, price_cents, status, display_order, metadata
) VALUES
(
    '2025-11-weekender-full',
    '5',
    'Full Pass',
    'Full weekend access to workshops and socials',
    6500,
    'available',
    1,
    json('{"includes_workshops": true, "includes_socials": true, "pass_type": "weekend"}')
),
(
    '2025-11-weekender-class',
    '5',
    'Single Class',
    'Access to one workshop session',
    2500,
    'available',
    2,
    json('{"includes_workshops": true, "includes_socials": false, "pass_type": "single_class"}')
);

-- Boulder Fest 2026 placeholder tickets (no prices set yet)
INSERT OR IGNORE INTO ticket_types (
    id, event_id, name, description, price_cents, status, display_order, metadata
) VALUES
(
    '2026-early-bird-full',
    '1',
    'Early Bird Full Pass',
    'Special early pricing for full festival access',
    0,
    'coming-soon',
    1,
    json('{"early_bird": true, "includes_workshops": true, "includes_socials": true, "pass_type": "full"}')
),
(
    '2026-regular-full',
    '1',
    'Full Festival Pass',
    'Complete 3-day festival experience',
    0,
    'coming-soon',
    2,
    json('{"includes_workshops": true, "includes_socials": true, "includes_performances": true, "pass_type": "full"}')
),
(
    '2026-friday-pass',
    '1',
    'Friday Pass',
    'Friday workshops and social dance',
    0,
    'coming-soon',
    3,
    json('{"includes_workshops": true, "includes_socials": true, "pass_type": "day", "day": "friday"}')
),
(
    '2026-saturday-pass',
    '1',
    'Saturday Pass',
    'Saturday workshops and social dance',
    0,
    'coming-soon',
    4,
    json('{"includes_workshops": true, "includes_socials": true, "pass_type": "day", "day": "saturday"}')
),
(
    '2026-sunday-pass',
    '1',
    'Sunday Pass',
    'Sunday workshops and social dance',
    0,
    'coming-soon',
    5,
    json('{"includes_workshops": true, "includes_socials": true, "pass_type": "day", "day": "sunday"}')
);

-- Test ticket types for development
INSERT OR IGNORE INTO ticket_types (
    id, event_id, name, description, price_cents, status, display_order, metadata
) VALUES
(
    'test-basic',
    '-1',
    'Test Basic Ticket',
    'Basic test ticket for development',
    100,
    'test',
    1,
    json('{"test_mode": true, "includes_workshops": true}')
),
(
    'test-premium',
    '-2',
    'Test Premium Ticket',
    'Premium test ticket for development',
    500,
    'test',
    1,
    json('{"test_mode": true, "includes_workshops": true, "includes_socials": true}')
);

-- =============================================================================
-- VERIFICATION QUERIES (Comments for debugging)
-- =============================================================================

-- After migration, verify with these queries:
-- SELECT COUNT(*) as total_ticket_types FROM ticket_types;
-- SELECT event_id, COUNT(*) as ticket_count FROM ticket_types GROUP BY event_id ORDER BY event_id;
-- SELECT id, name, price_cents, status FROM ticket_types WHERE event_id = 2; -- November Weekender
-- SELECT id, name, status FROM ticket_types WHERE event_id = 3; -- Boulder Fest 2026
-- SELECT * FROM ticket_types WHERE status = 'test'; -- Test tickets
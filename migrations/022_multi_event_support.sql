-- Migration: Multi-Event Architecture Support
-- Description: Adds comprehensive multi-event support to enable managing multiple festivals,
--              weekenders, and special events with complete data isolation and cross-event analytics
-- Author: System Architect
-- Date: 2025-01-09

-- ============================================================================
-- STEP 1: Create Core Events Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('festival', 'weekender', 'workshop', 'special')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'upcoming', 'active', 'completed', 'cancelled')),
    
    -- Event Details
    description TEXT,
    venue_name TEXT,
    venue_address TEXT,
    venue_city TEXT DEFAULT 'Boulder',
    venue_state TEXT DEFAULT 'CO',
    venue_zip TEXT,
    
    -- Event Dates
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    year INTEGER GENERATED ALWAYS AS (CAST(strftime('%Y', start_date) AS INTEGER)) STORED,
    
    -- Capacity and Pricing
    max_capacity INTEGER,
    early_bird_end_date DATE,
    regular_price_start_date DATE,
    
    -- Display and Ordering
    display_order INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT FALSE,
    is_visible BOOLEAN DEFAULT TRUE,
    
    -- Metadata
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    
    -- Configuration (JSON for flexible event-specific settings)
    config TEXT -- JSON stored as TEXT for SQLite compatibility
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_year ON events(year);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_dates ON events(start_date, end_date);

-- ============================================================================
-- STEP 2: Create Event Settings Table (Key-Value Store)
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, key)
);

CREATE INDEX IF NOT EXISTS idx_event_settings_lookup ON event_settings(event_id, key);

-- ============================================================================
-- STEP 3: Create Event Access Control Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    role TEXT DEFAULT 'viewer' CHECK(role IN ('viewer', 'manager', 'admin')),
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    granted_by TEXT,
    UNIQUE(event_id, user_email)
);

CREATE INDEX IF NOT EXISTS idx_event_access_user ON event_access(user_email);
CREATE INDEX IF NOT EXISTS idx_event_access_event ON event_access(event_id);

-- ============================================================================
-- STEP 4: Create Event Audit Log Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER REFERENCES events(id),
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    user_email TEXT,
    ip_address TEXT,
    user_agent TEXT,
    details TEXT, -- JSON stored as TEXT
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_event ON event_audit_log(event_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON event_audit_log(user_email);
CREATE INDEX IF NOT EXISTS idx_audit_created ON event_audit_log(created_at);

-- ============================================================================
-- STEP 5: Add event_id to existing tables (with safe column checks)
-- ============================================================================

-- Add event_id to tickets table if it doesn't exist
-- SQLite doesn't support conditional ALTER TABLE, so we need to handle this carefully
-- The application code should check if the column exists before running this

-- For tickets table
ALTER TABLE tickets ADD COLUMN event_id INTEGER REFERENCES events(id);
CREATE INDEX IF NOT EXISTS idx_tickets_event ON tickets(event_id);

-- For transactions table
ALTER TABLE transactions ADD COLUMN event_id INTEGER REFERENCES events(id);
CREATE INDEX IF NOT EXISTS idx_transactions_event ON transactions(event_id);

-- For newsletter_subscribers table (if it exists)
-- Note: This table might not exist in all installations
-- Skipping newsletter_subscribers modifications as it's not a core table

-- ============================================================================
-- STEP 6: Insert Default Event for Existing Data
-- ============================================================================

-- Create the main 2026 festival event as the default
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
    'The premier Cuban salsa festival in Boulder, featuring world-class instructors, live music, and social dancing',
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
    json('{"ticket_types": ["full-pass", "day-pass", "workshop-only", "social-only", "vip"], "features": {"workshops": true, "performances": true, "social_dancing": true, "live_music": true}}')
);

-- Get the ID of the default event we just created
-- We'll use this to update existing records
-- Note: In SQLite, last_insert_rowid() gives us the ID of the last inserted row

-- ============================================================================
-- STEP 7: Update Existing Records with Default Event ID
-- ============================================================================

-- Update all existing tickets with the default event
UPDATE tickets 
SET event_id = (SELECT id FROM events WHERE slug = 'boulderfest-2026')
WHERE event_id IS NULL;

-- Update all existing transactions with the default event
UPDATE transactions 
SET event_id = (SELECT id FROM events WHERE slug = 'boulderfest-2026')
WHERE event_id IS NULL;

-- Newsletter subscribers table update skipped (table may not exist)

-- ============================================================================
-- STEP 8: Create Sample Weekender Events
-- ============================================================================

-- Add a sample weekender event for testing
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
    display_order,
    is_featured,
    is_visible,
    created_by,
    config
) VALUES (
    'winter-weekender-2025',
    'Winter Salsa Weekender 2025',
    'weekender',
    'completed',
    'A cozy winter weekend of Cuban salsa workshops and social dancing',
    'Studio 55',
    '2875 55th Street',
    'Boulder',
    'CO',
    '80301',
    '2025-02-14',
    '2025-02-16',
    150,
    2,
    FALSE,
    TRUE,
    'system',
    json('{"ticket_types": ["weekend-pass", "single-workshop"], "features": {"workshops": true, "social_dancing": true}}')
);

-- Add an upcoming weekender event
INSERT OR IGNORE INTO events (
    slug,
    name,
    type,
    status,
    description,
    venue_name,
    venue_city,
    venue_state,
    start_date,
    end_date,
    max_capacity,
    display_order,
    is_featured,
    is_visible,
    created_by,
    config
) VALUES (
    'spring-weekender-2026',
    'Spring Salsa Weekender 2026',
    'weekender',
    'upcoming',
    'Spring into salsa with intensive workshops and social dancing',
    'Boulder Theater',
    'Boulder',
    'CO',
    '2026-03-20',
    '2026-03-22',
    200,
    3,
    TRUE,
    TRUE,
    'system',
    json('{"ticket_types": ["weekend-pass", "day-pass", "social-only"], "features": {"workshops": true, "social_dancing": true, "live_music": false}}')
);

-- ============================================================================
-- STEP 9: Set Default Event Settings
-- ============================================================================

-- Add settings for the main festival
INSERT OR IGNORE INTO event_settings (event_id, key, value) VALUES
    ((SELECT id FROM events WHERE slug = 'boulderfest-2026'), 'registration_open', 'true'),
    ((SELECT id FROM events WHERE slug = 'boulderfest-2026'), 'early_bird_active', 'true'),
    ((SELECT id FROM events WHERE slug = 'boulderfest-2026'), 'check_in_enabled', 'false'),
    ((SELECT id FROM events WHERE slug = 'boulderfest-2026'), 'email_confirmation_template', 'festival_confirmation_2026'),
    ((SELECT id FROM events WHERE slug = 'boulderfest-2026'), 'currency', 'USD'),
    ((SELECT id FROM events WHERE slug = 'boulderfest-2026'), 'timezone', 'America/Denver');

-- ============================================================================
-- STEP 10: Grant Admin Access to Default Admin User
-- ============================================================================

-- Grant admin access to the default admin for all events
INSERT OR IGNORE INTO event_access (event_id, user_email, role, granted_by) 
SELECT id, 'admin@alocubanoboulderfest.com', 'admin', 'system'
FROM events;

-- ============================================================================
-- STEP 11: Create Views for Easier Querying
-- ============================================================================

-- Create a view for event statistics
CREATE VIEW IF NOT EXISTS event_statistics AS
SELECT 
    e.id as event_id,
    e.slug,
    e.name,
    e.type,
    e.status,
    e.start_date,
    e.end_date,
    COUNT(DISTINCT t.id) as total_tickets,
    COUNT(DISTINCT t.transaction_id) as total_orders,
    COUNT(DISTINCT CASE WHEN t.checked_in_at IS NOT NULL THEN t.id END) as checked_in,
    COALESCE(SUM(t.price_cents) / 100.0, 0) as total_revenue,
    COUNT(DISTINCT CASE WHEN t.ticket_type LIKE '%workshop%' THEN t.id END) as workshop_tickets,
    COUNT(DISTINCT CASE WHEN t.ticket_type LIKE '%vip%' THEN t.id END) as vip_tickets,
    e.max_capacity,
    CASE 
        WHEN e.max_capacity IS NOT NULL 
        THEN ROUND(COUNT(DISTINCT t.id) * 100.0 / e.max_capacity, 2)
        ELSE NULL 
    END as capacity_percentage
FROM events e
LEFT JOIN tickets t ON e.id = t.event_id AND t.status = 'valid'
GROUP BY e.id;

-- Create a view for current active events
CREATE VIEW IF NOT EXISTS active_events AS
SELECT * FROM events 
WHERE status IN ('active', 'upcoming') 
AND is_visible = TRUE
ORDER BY 
    CASE status 
        WHEN 'active' THEN 1 
        WHEN 'upcoming' THEN 2 
        ELSE 3 
    END,
    start_date ASC;

-- ============================================================================
-- STEP 12: Add Triggers for Updated Timestamps
-- ============================================================================

-- Trigger to update the updated_at timestamp on events table
CREATE TRIGGER IF NOT EXISTS update_events_timestamp 
AFTER UPDATE ON events
BEGIN
    UPDATE events SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger to update the updated_at timestamp on event_settings table
CREATE TRIGGER IF NOT EXISTS update_event_settings_timestamp 
AFTER UPDATE ON event_settings
BEGIN
    UPDATE event_settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ============================================================================
-- STEP 13: Add Initial Audit Log Entry
-- ============================================================================

INSERT OR IGNORE INTO event_audit_log (
    event_id,
    action,
    entity_type,
    entity_id,
    user_email,
    details
) VALUES (
    (SELECT id FROM events WHERE slug = 'boulderfest-2026'),
    'CREATE',
    'event',
    (SELECT id FROM events WHERE slug = 'boulderfest-2026'),
    'system',
    json('{"message": "Multi-event architecture migration completed", "timestamp": "' || datetime('now') || '"}')
);

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- This migration adds comprehensive multi-event support to the admin portal,
-- enabling management of multiple festivals, weekenders, and special events
-- with complete data isolation and cross-event analytics capabilities.
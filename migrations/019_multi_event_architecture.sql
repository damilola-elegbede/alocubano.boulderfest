-- Migration: 019 - Multi-Event Architecture
-- Purpose: Multi-event support with events, settings, access control, and audit
-- Dependencies: 018_cache_and_webhook_systems.sql

-- Core Events Table (EXACT schema from 022_multi_event_support.sql)
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

-- Event Settings Table (EXACT schema from 022_multi_event_support.sql)
CREATE TABLE IF NOT EXISTS event_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, key)
);

-- Event Access Control Table (EXACT schema from 022_multi_event_support.sql)
CREATE TABLE IF NOT EXISTS event_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    role TEXT DEFAULT 'viewer' CHECK(role IN ('viewer', 'manager', 'admin')),
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    granted_by TEXT,
    UNIQUE(event_id, user_email)
);

-- Event Audit Log Table (EXACT schema from 022_multi_event_support.sql)
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

-- Create indexes for performance (EXACT from 022_multi_event_support.sql)
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_year ON events(year);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_dates ON events(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_event_settings_lookup ON event_settings(event_id, key);

CREATE INDEX IF NOT EXISTS idx_event_access_user ON event_access(user_email);
CREATE INDEX IF NOT EXISTS idx_event_access_event ON event_access(event_id);

CREATE INDEX IF NOT EXISTS idx_audit_event ON event_audit_log(event_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON event_audit_log(user_email);
CREATE INDEX IF NOT EXISTS idx_audit_created ON event_audit_log(created_at);

-- Add event_id to existing tables (EXACT from 022_multi_event_support.sql)
ALTER TABLE tickets ADD COLUMN event_id INTEGER REFERENCES events(id);
CREATE INDEX IF NOT EXISTS idx_tickets_event ON tickets(event_id);

ALTER TABLE transactions ADD COLUMN event_id INTEGER REFERENCES events(id);
CREATE INDEX IF NOT EXISTS idx_transactions_event ON transactions(event_id);

-- Insert Default Event for Existing Data (EXACT from 022_multi_event_support.sql)
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

-- Update Existing Records with Default Event ID (EXACT from 022_multi_event_support.sql)
UPDATE tickets
SET event_id = (SELECT id FROM events WHERE slug = 'boulderfest-2026')
WHERE event_id IS NULL;

UPDATE transactions
SET event_id = (SELECT id FROM events WHERE slug = 'boulderfest-2026')
WHERE event_id IS NULL;

-- Triggers for Updated Timestamps (EXACT from 022_multi_event_support.sql)
CREATE TRIGGER IF NOT EXISTS update_events_timestamp
AFTER UPDATE ON events
BEGIN
    UPDATE events SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_event_settings_timestamp
AFTER UPDATE ON event_settings
BEGIN
    UPDATE event_settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
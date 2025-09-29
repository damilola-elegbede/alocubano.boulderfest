-- Migration: 003 - Events Table
-- Purpose: Core events table for multi-event architecture
-- Dependencies: 002_schema_migrations.sql

-- Core Events Table (must come before transactions/tickets for FK references)
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_year ON events(year);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_dates ON events(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_events_display_order ON events(display_order);
CREATE INDEX IF NOT EXISTS idx_events_slug_status ON events(slug, status);
CREATE INDEX IF NOT EXISTS idx_events_type_status ON events(type, status);

-- Trigger for updated timestamp
CREATE TRIGGER IF NOT EXISTS update_events_timestamp
AFTER UPDATE ON events
BEGIN
    UPDATE events SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
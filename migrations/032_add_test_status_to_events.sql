-- Migration: 032 - Add 'test' status to events table
-- Purpose: Support test events in bootstrap configuration
-- Dependencies: 003_events_table.sql
-- Issue: Bootstrap fails because test events have status='test' but CHECK constraint doesn't allow it

-- SQLite doesn't support modifying CHECK constraints directly
-- We need to recreate the table with the updated constraint

-- Disable foreign key checks temporarily to allow table recreation
PRAGMA foreign_keys = OFF;

-- Step 1: Rename existing events table to preserve data during migration
-- This ensures data is not lost if migration aborts between steps
ALTER TABLE events RENAME TO events_old;

-- Step 2: Create new events table with updated status constraint
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('festival', 'weekender', 'workshop', 'special')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'upcoming', 'active', 'completed', 'cancelled', 'test')),

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

-- Step 3: Copy data from old table to new table
INSERT INTO events (
    id, slug, name, type, status, description,
    venue_name, venue_address, venue_city, venue_state, venue_zip,
    start_date, end_date, max_capacity,
    early_bird_end_date, regular_price_start_date,
    display_order, is_featured, is_visible,
    created_at, updated_at, created_by, config
)
SELECT
    id, slug, name, type, status, description,
    venue_name, venue_address, venue_city, venue_state, venue_zip,
    start_date, end_date, max_capacity,
    early_bird_end_date, regular_price_start_date,
    display_order, is_featured, is_visible,
    created_at, updated_at, created_by, config
FROM events_old;

-- Step 4: Drop old table only after new table is successfully populated
DROP TABLE events_old;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_year ON events(year);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_dates ON events(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_events_display_order ON events(display_order);
CREATE INDEX IF NOT EXISTS idx_events_slug_status ON events(slug, status);
CREATE INDEX IF NOT EXISTS idx_events_type_status ON events(type, status);

-- Step 6: Recreate trigger for updated timestamp
CREATE TRIGGER IF NOT EXISTS update_events_timestamp
AFTER UPDATE ON events
BEGIN
    UPDATE events SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Re-enable foreign key checks
PRAGMA foreign_keys = ON;

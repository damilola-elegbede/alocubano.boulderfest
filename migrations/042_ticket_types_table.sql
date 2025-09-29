-- Migration: 042 - Bootstrap Ticket Types Table
-- Purpose: Ensure ticket_types table exists and populate with bootstrap data
-- Dependencies: 041_normalize_event_ids.sql
-- Note: Works with existing table structure (display_order, not sort_order)

-- =============================================================================
-- STEP 1: Create ticket_types table with correct INTEGER event_id
-- =============================================================================

-- Create ticket_types table with INTEGER event_id to match events table
CREATE TABLE IF NOT EXISTS ticket_types (
    id TEXT PRIMARY KEY,
    event_id INTEGER NOT NULL,
    stripe_price_id TEXT UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL,
    currency TEXT DEFAULT 'USD',
    status TEXT CHECK(status IN ('available', 'sold-out', 'coming-soon', 'closed', 'test')) DEFAULT 'available',
    max_quantity INTEGER,
    sold_count INTEGER DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    metadata TEXT, -- JSON stored as TEXT
    availability TEXT, -- JSON stored as TEXT
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

-- Create bootstrap_versions table for tracking bootstrap application
CREATE TABLE IF NOT EXISTS bootstrap_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    checksum TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'success',
    error_message TEXT,
    applied_by TEXT
);

-- Core indexes for ticket_types
CREATE INDEX IF NOT EXISTS idx_ticket_types_event_status ON ticket_types(event_id, status);
CREATE INDEX IF NOT EXISTS idx_ticket_types_stripe_price ON ticket_types(stripe_price_id);

-- Indexes for bootstrap_versions
CREATE INDEX IF NOT EXISTS idx_bootstrap_versions_checksum ON bootstrap_versions(checksum);
CREATE INDEX IF NOT EXISTS idx_bootstrap_versions_applied_at ON bootstrap_versions(applied_at DESC);

-- Triggers for updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_ticket_types_timestamp
AFTER UPDATE ON ticket_types
FOR EACH ROW
BEGIN
    UPDATE ticket_types SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

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
-- STEP 3: Bootstrap data population
-- =============================================================================

-- NOTE: Ticket types data is NOT populated by this migration.
-- Data population happens exclusively via bootstrap-service.js reading config/bootstrap.json.
-- This ensures single source of truth for bootstrap data and proper version tracking.

-- =============================================================================
-- VERIFICATION QUERIES (Comments for debugging)
-- =============================================================================

-- After migration, verify with these queries:
-- SELECT COUNT(*) as total_ticket_types FROM ticket_types;
-- SELECT event_id, COUNT(*) as ticket_count FROM ticket_types GROUP BY event_id ORDER BY event_id;
-- SELECT id, name, price_cents, status FROM ticket_types WHERE event_id = 2; -- November Weekender
-- SELECT id, name, status FROM ticket_types WHERE event_id = 3; -- Boulder Fest 2026
-- SELECT * FROM ticket_types WHERE status = 'test'; -- Test tickets
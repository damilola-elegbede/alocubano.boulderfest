-- Migration: 022 - Ticket Types Table
-- Purpose: Create ticket_types table and bootstrap tracking
-- Dependencies: 003_events_table.sql
-- Note: Data populated by bootstrap service, not migrations

-- Create ticket_types table with INTEGER event_id FK
CREATE TABLE IF NOT EXISTS ticket_types (
    id TEXT PRIMARY KEY,
    event_id INTEGER NOT NULL,
    stripe_price_id TEXT UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER,
    currency TEXT DEFAULT 'USD',
    status TEXT CHECK(status IN ('available', 'sold-out', 'coming-soon', 'closed', 'test')) DEFAULT 'available',
    max_quantity INTEGER,
    sold_count INTEGER DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    metadata TEXT,
    availability TEXT,
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
CREATE INDEX IF NOT EXISTS idx_ticket_types_event_display_order ON ticket_types(event_id, display_order);
CREATE INDEX IF NOT EXISTS idx_ticket_types_availability_display ON ticket_types(event_id, status, display_order);
CREATE INDEX IF NOT EXISTS idx_ticket_types_performance_sales ON ticket_types(event_id, sold_count, max_quantity) WHERE status IN ('available', 'sold-out');

-- Indexes for bootstrap_versions
CREATE INDEX IF NOT EXISTS idx_bootstrap_versions_checksum ON bootstrap_versions(checksum);
CREATE INDEX IF NOT EXISTS idx_bootstrap_versions_applied_at ON bootstrap_versions(applied_at DESC);

-- Trigger for updated_at timestamp
-- Prevent infinite recursion by only updating when updated_at hasn't changed
CREATE TRIGGER IF NOT EXISTS update_ticket_types_timestamp
AFTER UPDATE ON ticket_types
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE ticket_types SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
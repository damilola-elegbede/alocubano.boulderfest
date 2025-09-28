-- Migration: Bootstrap Ticket System
-- Description: Create tables for bootstrap-driven ticket management
-- Date: 2025-01-28

-- Events table for managing all events
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  end_date DATE,
  venue TEXT NOT NULL,
  status TEXT CHECK(status IN ('active', 'past', 'cancelled', 'test')) DEFAULT 'active',
  display_order INTEGER DEFAULT 0,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_display_order ON events(display_order);

-- Ticket types table for all ticket configurations
CREATE TABLE IF NOT EXISTS ticket_types (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  stripe_price_id TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT CHECK(status IN ('available', 'sold-out', 'coming-soon', 'closed', 'test')) DEFAULT 'available',
  max_quantity INTEGER,
  sold_count INTEGER DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  metadata JSON,
  availability JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (event_id) REFERENCES events(id)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ticket_types_event_status ON ticket_types(event_id, status);
CREATE INDEX IF NOT EXISTS idx_ticket_types_stripe_price ON ticket_types(stripe_price_id);
CREATE INDEX IF NOT EXISTS idx_ticket_types_display_order ON ticket_types(display_order);

-- Bootstrap version tracking
CREATE TABLE IF NOT EXISTS bootstrap_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  checksum TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'success',
  error_message TEXT,
  applied_by TEXT
);

-- Index for version lookup
CREATE INDEX IF NOT EXISTS idx_bootstrap_versions_checksum ON bootstrap_versions(checksum);
CREATE INDEX IF NOT EXISTS idx_bootstrap_versions_applied_at ON bootstrap_versions(applied_at DESC);

-- Add ticket_type_id column to tickets table if it doesn't exist
-- This links tickets to the new ticket_types table
ALTER TABLE tickets ADD COLUMN ticket_type_id TEXT REFERENCES ticket_types(id);

-- Create index for the new column
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_type_id ON tickets(ticket_type_id);

-- Add event_id column to tickets table if it doesn't exist
ALTER TABLE tickets ADD COLUMN event_id TEXT REFERENCES events(id);

-- Create index for the new column
CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON tickets(event_id);

-- Trigger to update the updated_at timestamp for events
CREATE TRIGGER IF NOT EXISTS update_events_timestamp
AFTER UPDATE ON events
FOR EACH ROW
BEGIN
  UPDATE events SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger to update the updated_at timestamp for ticket_types
CREATE TRIGGER IF NOT EXISTS update_ticket_types_timestamp
AFTER UPDATE ON ticket_types
FOR EACH ROW
BEGIN
  UPDATE ticket_types SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger to update sold_count when a ticket is created
CREATE TRIGGER IF NOT EXISTS increment_ticket_sold_count
AFTER INSERT ON tickets
FOR EACH ROW
WHEN NEW.ticket_type_id IS NOT NULL
BEGIN
  UPDATE ticket_types
  SET sold_count = sold_count + 1
  WHERE id = NEW.ticket_type_id;
END;

-- Trigger to update sold_count when a ticket is deleted (for refunds)
CREATE TRIGGER IF NOT EXISTS decrement_ticket_sold_count
AFTER DELETE ON tickets
FOR EACH ROW
WHEN OLD.ticket_type_id IS NOT NULL
BEGIN
  UPDATE ticket_types
  SET sold_count = MAX(0, sold_count - 1)
  WHERE id = OLD.ticket_type_id;
END;
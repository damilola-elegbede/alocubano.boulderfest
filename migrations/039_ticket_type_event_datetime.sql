-- Migration: 039 - Ticket Type Event Date/Time
-- Purpose: Add event_date and event_time to ticket_types and tickets
-- Dependencies: 022_ticket_types_table.sql, 005_tickets.sql

-- Add event_date and event_time to ticket_types
-- These define when the ticket type becomes valid (e.g., Friday Pass valid from Friday 2:00 PM)
ALTER TABLE ticket_types ADD COLUMN event_date DATE NOT NULL DEFAULT '2026-01-01';
ALTER TABLE ticket_types ADD COLUMN event_time TIME NOT NULL DEFAULT '00:00';

-- Add event_time to tickets (event_date already exists)
-- Tickets inherit event_date and event_time from their ticket_type
ALTER TABLE tickets ADD COLUMN event_time TIME NOT NULL DEFAULT '00:00';

-- Create index for ticket validity queries
CREATE INDEX IF NOT EXISTS idx_ticket_types_event_datetime
  ON ticket_types(event_date, event_time);

CREATE INDEX IF NOT EXISTS idx_tickets_event_datetime
  ON tickets(event_date, event_time);

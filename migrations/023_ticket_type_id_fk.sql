-- Migration: 023 - Add ticket_type_id Foreign Key
-- Purpose: Link tickets.ticket_type_id → ticket_types.id for sold_count tracking
-- Dependencies: 005_tickets.sql, 022_ticket_types_table.sql

-- Add FK constraint to existing column (already exists from migration 005)
-- SQLite doesn't support ADD CONSTRAINT, so we rely on the column already being there

-- Create index for FK relationship
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_type_id ON tickets(ticket_type_id);

-- Trigger to increment sold_count when ticket is created with ticket_type_id
CREATE TRIGGER IF NOT EXISTS increment_ticket_sold_count
AFTER INSERT ON tickets
FOR EACH ROW
WHEN NEW.ticket_type_id IS NOT NULL
BEGIN
    UPDATE ticket_types
    SET sold_count = sold_count + 1
    WHERE id = NEW.ticket_type_id;
END;

-- Trigger to decrement sold_count when ticket is deleted (for refunds)
CREATE TRIGGER IF NOT EXISTS decrement_ticket_sold_count
AFTER DELETE ON tickets
FOR EACH ROW
WHEN OLD.ticket_type_id IS NOT NULL
BEGIN
    UPDATE ticket_types
    SET sold_count = MAX(0, sold_count - 1)
    WHERE id = OLD.ticket_type_id;
END;
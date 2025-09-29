-- Migration: 043 - Add ticket_type_id Foreign Key
-- Purpose: Link tickets.ticket_type_id → ticket_types.id for sold_count tracking
-- Dependencies: 042_ticket_types_table.sql
-- Context: Enables automatic sold_count increments via triggers

-- =============================================================================
-- STEP 1: Add ticket_type_id column to tickets table
-- =============================================================================

ALTER TABLE tickets ADD COLUMN ticket_type_id TEXT REFERENCES ticket_types(id);

-- =============================================================================
-- STEP 2: Create index for FK relationship
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_tickets_ticket_type_id ON tickets(ticket_type_id);

-- =============================================================================
-- STEP 3: Create triggers for sold_count automation
-- =============================================================================

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

-- =============================================================================
-- VERIFICATION QUERIES (Comments for debugging)
-- =============================================================================

-- After migration, verify with these queries:
-- PRAGMA table_info(tickets); -- Check ticket_type_id column exists
-- SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='tickets'; -- Check triggers
-- SELECT id, sold_count FROM ticket_types; -- Check sold_count values

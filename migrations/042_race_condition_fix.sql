-- Migration: 042 - Fix sold_count Race Condition
-- Purpose: Remove trigger-based sold_count updates in favor of explicit updates
-- Dependencies: 023_ticket_type_id_fk.sql, 022_ticket_types_table.sql
-- Issue: Triggers in migration 023 cause double-counting when webhooks and manual
--        entry both update sold_count. Manual entry explicitly updates sold_count,
--        while Stripe/PayPal webhooks rely on triggers, leading to race conditions.
-- Solution: Drop triggers and use explicit sold_count updates in all code paths.
--          Add CHECK constraints to prevent invalid sold_count values.

-- ============================================================================
-- STEP 1: Drop problematic triggers from migration 023
-- ============================================================================
-- These triggers increment/decrement sold_count automatically when tickets are
-- inserted/deleted, but this conflicts with manual updates in webhook handlers
-- and manual entry endpoints, causing double-counting.

DROP TRIGGER IF EXISTS increment_ticket_sold_count;
DROP TRIGGER IF EXISTS decrement_ticket_sold_count;

-- ============================================================================
-- STEP 2: Add CHECK constraints for sold_count validation
-- ============================================================================
-- SQLite doesn't support adding constraints to existing tables directly.
-- We need to recreate the ticket_types table with the new constraints.

-- Disable foreign key constraints during table recreation
PRAGMA foreign_keys = OFF;

-- Create new ticket_types table with CHECK constraints
CREATE TABLE ticket_types_new (
    id TEXT PRIMARY KEY,
    event_id INTEGER NOT NULL,
    stripe_price_id TEXT UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER,
    currency TEXT DEFAULT 'USD',
    status TEXT CHECK(status IN ('available', 'sold-out', 'coming-soon', 'closed', 'test')) DEFAULT 'available',
    max_quantity INTEGER,
    sold_count INTEGER DEFAULT 0 CHECK(
        sold_count >= 0 AND
        (max_quantity IS NULL OR sold_count <= max_quantity)
    ),
    display_order INTEGER DEFAULT 0,
    metadata TEXT,
    availability TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

-- Copy data from old table
INSERT INTO ticket_types_new
SELECT * FROM ticket_types;

-- Drop old table
DROP TABLE ticket_types;

-- Rename new table
ALTER TABLE ticket_types_new RENAME TO ticket_types;

-- ============================================================================
-- STEP 3: Recreate all indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_ticket_types_event_status ON ticket_types(event_id, status);
CREATE INDEX IF NOT EXISTS idx_ticket_types_stripe_price ON ticket_types(stripe_price_id);
CREATE INDEX IF NOT EXISTS idx_ticket_types_event_display_order ON ticket_types(event_id, display_order);
CREATE INDEX IF NOT EXISTS idx_ticket_types_availability_display ON ticket_types(event_id, status, display_order);
CREATE INDEX IF NOT EXISTS idx_ticket_types_performance_sales ON ticket_types(event_id, sold_count, max_quantity) WHERE status IN ('available', 'sold-out');

-- ============================================================================
-- STEP 4: Recreate update trigger
-- ============================================================================
CREATE TRIGGER IF NOT EXISTS update_ticket_types_timestamp
AFTER UPDATE ON ticket_types
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE ticket_types SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ============================================================================
-- STEP 5: Recreate views that depend on ticket_types
-- ============================================================================
-- Recreate ticket_availability_view (from migration 024)
DROP VIEW IF EXISTS ticket_availability_view;

CREATE VIEW IF NOT EXISTS ticket_availability_view AS
SELECT
    tt.id,
    tt.name,
    tt.event_id,
    tt.max_quantity,
    tt.sold_count,
    COALESCE(SUM(CASE
        WHEN tr.status = 'active' AND tr.expires_at > CURRENT_TIMESTAMP
        THEN tr.quantity
        ELSE 0
    END), 0) as reserved_count,
    CASE
        WHEN tt.max_quantity IS NULL THEN NULL
        ELSE MAX(0, tt.max_quantity - tt.sold_count - COALESCE(SUM(
            CASE
                WHEN tr.status = 'active' AND tr.expires_at > CURRENT_TIMESTAMP
                THEN tr.quantity
                ELSE 0
            END
        ), 0))
    END as available_quantity,
    tt.status,
    tt.price_cents
FROM ticket_types tt
LEFT JOIN ticket_reservations tr ON tr.ticket_type_id = tt.id
WHERE tt.status IN ('available', 'test')
GROUP BY tt.id;

-- Re-enable foreign key constraints
PRAGMA foreign_keys = ON;

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================
-- IMPORTANT: All code that creates tickets MUST now explicitly update sold_count.
-- Previously, triggers handled this automatically, but they caused race conditions
-- with manual entry and webhook handlers.
--
-- Required updates in application code:
-- 1. Webhook handlers (Stripe/PayPal) must call: UPDATE ticket_types SET sold_count = sold_count + 1
-- 2. Manual entry endpoints must call: UPDATE ticket_types SET sold_count = sold_count + 1
-- 3. Refund handlers must call: UPDATE ticket_types SET sold_count = MAX(0, sold_count - 1)
--
-- The CHECK constraints will prevent:
-- - Negative sold_count values
-- - sold_count exceeding max_quantity (overselling)
--
-- ROLLBACK INSTRUCTIONS (if needed):
-- To rollback this migration, recreate the triggers from migration 023:
/*
CREATE TRIGGER IF NOT EXISTS increment_ticket_sold_count
AFTER INSERT ON tickets
FOR EACH ROW
WHEN NEW.ticket_type_id IS NOT NULL
BEGIN
    UPDATE ticket_types
    SET sold_count = sold_count + 1
    WHERE id = NEW.ticket_type_id;
END;

CREATE TRIGGER IF NOT EXISTS decrement_ticket_sold_count
AFTER DELETE ON tickets
FOR EACH ROW
WHEN OLD.ticket_type_id IS NOT NULL
BEGIN
    UPDATE ticket_types
    SET sold_count = MAX(0, sold_count - 1)
    WHERE id = OLD.ticket_type_id;
END;
*/

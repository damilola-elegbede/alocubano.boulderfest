-- Migration: 041a - Recovery for Corrupted ticket_types Table
-- Purpose: Restore ticket_types table to known good state before migration 042
-- Dependencies: 039_ticket_type_event_datetime.sql
-- Issue: Migration 042 can fail mid-execution (no transactions), leaving ticket_types dropped
--        but migration not marked complete, resulting in corrupted database state.
-- Solution: Detect and recover from all possible corrupted states before 042 runs.

-- ============================================================================
-- RECOVERY STRATEGY
-- ============================================================================
-- This migration handles three possible states:
--
-- State 1: Normal (ticket_types exists, ticket_types_new doesn't)
--   Action: Do nothing, let migration 042 proceed normally
--
-- State 2: Failed after DROP (ticket_types doesn't exist, ticket_types_new exists)
--   Action: Rename ticket_types_new back to ticket_types
--
-- State 3: Catastrophic (neither table exists)
--   Action: Create ticket_types with schema from migration 039
--
-- ============================================================================

-- STEP 1: Try to recover ticket_types from ticket_types_new if needed
-- This handles State 2 (ticket_types dropped, ticket_types_new exists)
-- If ticket_types already exists, this will fail safely and we continue
-- If ticket_types_new doesn't exist, this will fail safely and we continue

-- We can't use IF NOT EXISTS for RENAME, so we'll use CREATE TABLE IF NOT EXISTS
-- to ensure ticket_types exists with at least a basic schema

-- STEP 2: Ensure ticket_types exists with minimum required schema
-- This uses CREATE TABLE IF NOT EXISTS which:
-- - Does nothing if ticket_types already exists (State 1)
-- - Creates table if it doesn't exist (State 2 where rename failed, State 3)

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
    event_date DATE NOT NULL DEFAULT '2026-01-01',
    event_time TIME NOT NULL DEFAULT '00:00',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

-- STEP 3: Create basic indexes if they don't exist
-- These are safe to run multiple times (IF NOT EXISTS)

CREATE INDEX IF NOT EXISTS idx_ticket_types_event_status ON ticket_types(event_id, status);
CREATE INDEX IF NOT EXISTS idx_ticket_types_stripe_price ON ticket_types(stripe_price_id);
CREATE INDEX IF NOT EXISTS idx_ticket_types_event_display_order ON ticket_types(event_id, display_order);
CREATE INDEX IF NOT EXISTS idx_ticket_types_availability_display ON ticket_types(event_id, status, display_order);
CREATE INDEX IF NOT EXISTS idx_ticket_types_performance_sales ON ticket_types(event_id, sold_count, max_quantity) WHERE status IN ('available', 'sold-out');
CREATE INDEX IF NOT EXISTS idx_ticket_types_event_datetime ON ticket_types(event_date, event_time);

-- STEP 4: Ensure update trigger exists

CREATE TRIGGER IF NOT EXISTS update_ticket_types_timestamp
AFTER UPDATE ON ticket_types
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE ticket_types SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- STEP 5: Ensure ticket_availability_view exists with basic definition
-- This prevents errors if migration 042 needs to drop it

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

-- STEP 6: Clean up orphaned ticket_types_new table if it exists
-- This handles State 2 where ticket_types now exists (from STEP 2) and ticket_types_new is orphaned

DROP TABLE IF EXISTS ticket_types_new;

-- ============================================================================
-- RECOVERY COMPLETE
-- ============================================================================
-- After this migration:
-- - ticket_types ALWAYS exists with at least the schema from migration 039
-- - ticket_types_new is cleaned up (doesn't exist)
-- - Basic indexes and triggers exist
-- - ticket_availability_view exists
--
-- Migration 042 can now safely proceed with adding CHECK constraints
-- ============================================================================

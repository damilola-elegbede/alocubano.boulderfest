-- Migration: 064 - Fix ticket_reservations FK pointing to deleted ticket_types_backup
-- Purpose: Repair ticket_reservations.ticket_type_id FK that points to deleted table
-- Dependencies: 024_ticket_reservations.sql, 060_add_unavailable_ticket_status.sql
--
-- Root Cause:
--   Migration 060 used UNSAFE pattern: ALTER TABLE RENAME TO _backup → DROP _backup
--   This orphaned the FK constraint because SQLite auto-updates FK references during RENAME
--   even when PRAGMA foreign_keys = OFF (OFF only disables enforcement, not schema updates)
--
-- Issue:
--   ticket_reservations.ticket_type_id FK points to "ticket_types_backup" which no longer exists
--   All reservation INSERTs fail with "no such table: main.ticket_types_backup"
--
-- Solution:
--   Use SAFE pattern: CREATE _new → DROP original → RENAME _new TO original
--   This allows SQLite to auto-fix the orphaned FK during the final RENAME operation
--
-- Impact:
--   - Dev: 0 rows (no data loss)
--   - Prod: 38 rows (all historical/expired, will be preserved)
--   - No active reservations affected

-- ============================================================================
-- STEP 1: Drop views that depend on ticket_reservations
-- ============================================================================

PRAGMA foreign_keys = OFF;

-- Drop views that reference ticket_reservations (will be recreated after)
DROP VIEW IF EXISTS ticket_availability_view;

-- ============================================================================
-- STEP 2: Recreate ticket_reservations table with correct FK constraint
-- ============================================================================

-- Clean up any orphaned temporary tables from previous failed migration attempts
DROP TABLE IF EXISTS ticket_reservations_new;

CREATE TABLE ticket_reservations_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Ticket type being reserved - NOW CORRECTLY REFERENCES ticket_types
    ticket_type_id TEXT NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
    -- Quantity reserved
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    -- Session tracking (Stripe checkout session or internal session ID)
    session_id TEXT NOT NULL,
    -- Reservation lifecycle timestamps
    reserved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    -- Reservation status
    status TEXT CHECK(status IN ('active', 'fulfilled', 'expired', 'released')) DEFAULT 'active',
    -- Fulfillment tracking (when reservation is converted to actual tickets)
    fulfilled_at DATETIME,
    transaction_id INTEGER REFERENCES transactions(id),
    -- Metadata for debugging and tracking
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Copy all existing data
INSERT INTO ticket_reservations_new SELECT * FROM ticket_reservations;

-- Drop old table (orphans child FK constraints temporarily)
DROP TABLE ticket_reservations;

-- Rename new table (SQLite auto-fixes orphaned FK constraints)
ALTER TABLE ticket_reservations_new RENAME TO ticket_reservations;

-- ============================================================================
-- STEP 3: Recreate indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ticket_reservations_session ON ticket_reservations(session_id);
CREATE INDEX IF NOT EXISTS idx_ticket_reservations_status ON ticket_reservations(status);
CREATE INDEX IF NOT EXISTS idx_ticket_reservations_expires ON ticket_reservations(expires_at);
CREATE INDEX IF NOT EXISTS idx_ticket_reservations_ticket_type ON ticket_reservations(ticket_type_id);
CREATE INDEX IF NOT EXISTS idx_ticket_reservations_status_expires ON ticket_reservations(status, expires_at);

-- ============================================================================
-- STEP 4: Recreate views that depend on ticket_reservations
-- ============================================================================

CREATE VIEW IF NOT EXISTS ticket_availability_view AS
SELECT
    tt.id,
    tt.name,
    tt.event_id,
    tt.max_quantity,
    tt.sold_count,
    tt.test_sold_count,
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

-- ============================================================================
-- STEP 5: Re-enable FK constraints and verify integrity
-- ============================================================================

PRAGMA foreign_keys = ON;

-- Verify no orphaned FK records exist
PRAGMA foreign_key_check;

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================
-- CHANGES SUMMARY:
--
-- 1. FK CONSTRAINT REPAIR:
--    - Fixed ticket_reservations.ticket_type_id FK that pointed to deleted "ticket_types_backup"
--    - Now correctly points to ticket_types.id
--    - Checkout ticket reservation now works again
--
-- SAFE PATTERN USED:
-- CREATE ticket_reservations_new → DROP ticket_reservations → RENAME ticket_reservations_new
--   - Allows SQLite to auto-fix orphaned FK constraints during RENAME
--
-- VERIFICATION QUERY:
-- PRAGMA foreign_key_list(ticket_reservations);
-- -- ticket_type_id should reference "ticket_types", not "ticket_types_backup"

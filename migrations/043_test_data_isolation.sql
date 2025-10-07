-- Migration: 043 - Test Data Isolation for Sold Count
-- Purpose: Separate test ticket sales from production sold_count tracking
-- Dependencies: 022_ticket_types_table.sql, 042_race_condition_fix.sql
-- Issue: Test ticket purchases increment the production sold_count, contaminating
--        availability calculations and causing false "sold out" states during testing.
-- Solution: Add test_sold_count column to track test sales separately. Update
--          availability views to exclude test sales from production counts.

-- ============================================================================
-- STEP 1: Add test_sold_count column to ticket_types
-- ============================================================================
-- SQLite doesn't support adding columns with constraints to existing tables directly.
-- We need to recreate the table with the new column.

-- Disable foreign key constraints during table recreation
PRAGMA foreign_keys = OFF;

-- Clean up any orphaned temporary tables from previous failed migration attempts
DROP TABLE IF EXISTS ticket_types_new;

-- Drop views that depend on ticket_types before table recreation
DROP VIEW IF EXISTS ticket_availability_view;
DROP VIEW IF EXISTS test_ticket_sales_view;

-- Create new ticket_types table with test_sold_count column
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
    test_sold_count INTEGER DEFAULT 0 CHECK(test_sold_count >= 0),
    display_order INTEGER DEFAULT 0,
    metadata TEXT,
    availability TEXT,
    event_date DATE NOT NULL DEFAULT '2026-01-01',
    event_time TIME NOT NULL DEFAULT '00:00',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

-- Copy data from old table (includes all columns from migration 039)
INSERT INTO ticket_types_new
SELECT
    id, event_id, stripe_price_id, name, description, price_cents, currency,
    status, max_quantity, sold_count,
    0 as test_sold_count, -- Initialize test_sold_count to 0
    display_order, metadata, availability,
    event_date, event_time, -- Added in migration 039
    created_at, updated_at
FROM ticket_types;

-- Drop old table
DROP TABLE ticket_types;

-- Rename new table
ALTER TABLE ticket_types_new RENAME TO ticket_types;

-- ============================================================================
-- STEP 2: Recreate all indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_ticket_types_event_status ON ticket_types(event_id, status);
CREATE INDEX IF NOT EXISTS idx_ticket_types_stripe_price ON ticket_types(stripe_price_id);
CREATE INDEX IF NOT EXISTS idx_ticket_types_event_display_order ON ticket_types(event_id, display_order);
CREATE INDEX IF NOT EXISTS idx_ticket_types_availability_display ON ticket_types(event_id, status, display_order);
CREATE INDEX IF NOT EXISTS idx_ticket_types_performance_sales ON ticket_types(event_id, sold_count, max_quantity) WHERE status IN ('available', 'sold-out');

-- New index for test sales tracking
CREATE INDEX IF NOT EXISTS idx_ticket_types_test_sales ON ticket_types(event_id, test_sold_count) WHERE test_sold_count > 0;

-- ============================================================================
-- STEP 3: Recreate update trigger
-- ============================================================================
CREATE TRIGGER IF NOT EXISTS update_ticket_types_timestamp
AFTER UPDATE ON ticket_types
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE ticket_types SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ============================================================================
-- STEP 4: Recreate availability view with test data exclusion
-- ============================================================================
-- Update ticket_availability_view to exclude test sales from production counts
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
        -- Production availability: max_quantity - production_sold_count - reserved_count
        -- Explicitly excludes test_sold_count from calculations
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
-- STEP 5: Create view for test data analytics
-- ============================================================================
-- Provide separate view for test sales analysis
CREATE VIEW IF NOT EXISTS test_ticket_sales_view AS
SELECT
    tt.id,
    tt.name,
    tt.event_id,
    tt.test_sold_count,
    COUNT(t.id) as actual_test_tickets,
    tt.test_sold_count - COUNT(t.id) as discrepancy,
    MIN(t.created_at) as first_test_sale,
    MAX(t.created_at) as last_test_sale
FROM ticket_types tt
LEFT JOIN tickets t ON t.ticket_type_id = tt.id AND t.is_test = 1
WHERE tt.test_sold_count > 0 OR t.id IS NOT NULL
GROUP BY tt.id;

-- Re-enable foreign key constraints
PRAGMA foreign_keys = ON;

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================
-- IMPORTANT: Application code must now track test sales separately:
--
-- For PRODUCTION tickets (is_test = 0):
--   UPDATE ticket_types SET sold_count = sold_count + 1 WHERE id = ?
--
-- For TEST tickets (is_test = 1):
--   UPDATE ticket_types SET test_sold_count = test_sold_count + 1 WHERE id = ?
--
-- For REFUNDS:
--   Production: UPDATE ticket_types SET sold_count = MAX(0, sold_count - 1) WHERE id = ?
--   Test: UPDATE ticket_types SET test_sold_count = MAX(0, test_sold_count - 1) WHERE id = ?
--
-- BENEFITS:
-- 1. Test ticket purchases no longer affect production availability
-- 2. Production sold_count remains accurate even during heavy testing
-- 3. Test sales can be analyzed separately via test_ticket_sales_view
-- 4. Prevents false "sold out" states during test ticket creation
--
-- DATA INTEGRITY:
-- - The test_ticket_sales_view can identify discrepancies between test_sold_count
--   and actual test ticket records for data integrity monitoring
-- - Run: SELECT * FROM test_ticket_sales_view WHERE discrepancy != 0;
--
-- ROLLBACK INSTRUCTIONS (if needed):
-- To rollback, recreate ticket_types without test_sold_count column:
/*
PRAGMA foreign_keys = OFF;

CREATE TABLE ticket_types_rollback (
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

INSERT INTO ticket_types_rollback
SELECT
    id, event_id, stripe_price_id, name, description, price_cents, currency,
    status, max_quantity, sold_count, display_order, metadata, availability,
    created_at, updated_at
FROM ticket_types;

DROP TABLE ticket_types;
ALTER TABLE ticket_types_rollback RENAME TO ticket_types;
DROP VIEW IF EXISTS test_ticket_sales_view;

PRAGMA foreign_keys = ON;
*/

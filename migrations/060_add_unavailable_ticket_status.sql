-- Migration: 060 - Add 'unavailable' Status to Ticket Types
-- Purpose: Add 'unavailable' status option for tickets that are no longer available
-- Dependencies: 022_ticket_types_table.sql, 039_ticket_type_event_datetime.sql, 043_test_data_isolation.sql
-- Note: This allows tickets to display "NOT AVAILABLE" banner instead of "SOLD OUT"

-- Disable foreign key constraints during table recreation
PRAGMA foreign_keys = OFF;

-- Clean up any orphaned tables from previous failed migration attempts
DROP TABLE IF EXISTS ticket_types_new;
DROP TABLE IF EXISTS ticket_types_backup;

-- Drop views that depend on ticket_types before table recreation
DROP VIEW IF EXISTS ticket_availability_view;
DROP VIEW IF EXISTS test_ticket_sales_view;

-- Step 1: Rename existing table to backup
ALTER TABLE ticket_types RENAME TO ticket_types_backup;

-- Step 2: Create new ticket_types table with updated status constraint
CREATE TABLE ticket_types (
    id TEXT PRIMARY KEY,
    event_id INTEGER NOT NULL,
    stripe_price_id TEXT UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER,
    currency TEXT DEFAULT 'USD',
    status TEXT CHECK(status IN ('available', 'sold-out', 'coming-soon', 'closed', 'test', 'unavailable')) DEFAULT 'available',
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

-- Step 3: Copy all existing data from backup table
INSERT INTO ticket_types
SELECT * FROM ticket_types_backup;

-- Step 4: Drop backup table
DROP TABLE ticket_types_backup;

-- Step 5: Recreate all indexes
CREATE INDEX idx_ticket_types_event_status ON ticket_types(event_id, status);
CREATE INDEX idx_ticket_types_stripe_price ON ticket_types(stripe_price_id);
CREATE INDEX idx_ticket_types_event_display_order ON ticket_types(event_id, display_order);
CREATE INDEX idx_ticket_types_availability_display ON ticket_types(event_id, status, display_order);
CREATE INDEX idx_ticket_types_performance_sales ON ticket_types(event_id, sold_count, max_quantity) WHERE status IN ('available', 'sold-out');
CREATE INDEX idx_ticket_types_event_datetime ON ticket_types(event_date, event_time);
CREATE INDEX idx_ticket_types_test_sales ON ticket_types(event_id, test_sold_count) WHERE test_sold_count > 0;

-- Step 6: Recreate trigger for updated_at timestamp
CREATE TRIGGER update_ticket_types_timestamp
AFTER UPDATE ON ticket_types
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE ticket_types SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Step 7: Recreate views that depend on ticket_types
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

-- Migration: 061 - Fix Orphaned FK Constraint from Migration 060
-- Purpose: Repair tickets.ticket_type_id FK that points to deleted table
-- Dependencies: 044_critical_constraints.sql, 060_add_unavailable_ticket_status.sql
--
-- Root Cause:
--   Migration 060 used UNSAFE pattern: ALTER TABLE RENAME TO _backup → DROP _backup
--   This orphaned the FK constraint because SQLite auto-updates FK references during RENAME
--   even when PRAGMA foreign_keys = OFF (OFF only disables enforcement, not schema updates)
--
-- Issue:
--   tickets.ticket_type_id FK points to "ticket_types_backup" which no longer exists
--   All ticket INSERTs fail with "no such table: main.ticket_types_backup"
--
-- Solution:
--   Use SAFE pattern: CREATE _new → DROP original → RENAME _new TO original
--   This allows SQLite to auto-fix the orphaned FK during the final RENAME operation

-- ============================================================================
-- STEP 1: Recreate tickets table with correct FK constraint
-- ============================================================================

PRAGMA foreign_keys = OFF;

-- Clean up any orphaned temporary tables from previous failed migration attempts
DROP TABLE IF EXISTS tickets_new;

-- Drop views that depend on tickets table
DROP VIEW IF EXISTS v_data_mode_statistics;
DROP VIEW IF EXISTS v_test_data_cleanup_candidates;
DROP VIEW IF EXISTS test_ticket_sales_view;

-- Create new tickets table with correct FK to ticket_types.id
CREATE TABLE tickets_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT UNIQUE NOT NULL,
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
    ticket_type TEXT NOT NULL,
    ticket_type_id TEXT REFERENCES ticket_types(id) ON DELETE SET NULL,
    event_id INTEGER NOT NULL REFERENCES events(id),
    event_date DATE,
    event_time TIME NOT NULL DEFAULT '00:00',
    event_end_date DATETIME,
    price_cents INTEGER NOT NULL,

    -- Attendee Information
    attendee_first_name TEXT,
    attendee_last_name TEXT,
    attendee_email TEXT,
    attendee_phone TEXT,

    -- Ticket Status and Validation
    status TEXT DEFAULT 'valid' CHECK (
        status IN ('valid', 'used', 'cancelled', 'refunded', 'transferred', 'flagged_for_review')
    ),
    validation_status TEXT DEFAULT 'active' CHECK (
        validation_status IN ('active', 'invalidated', 'suspicious', 'expired')
    ),
    validation_code TEXT UNIQUE,
    validation_signature TEXT,
    cancellation_reason TEXT,

    -- QR Code
    qr_token TEXT,
    qr_code_data TEXT,
    qr_code_generated_at TIMESTAMP,
    qr_access_method TEXT,

    -- Scan Tracking
    scan_count INTEGER DEFAULT 0 CHECK (scan_count >= 0),
    max_scan_count INTEGER DEFAULT 10 CHECK (max_scan_count >= 0),
    first_scanned_at TIMESTAMP,
    last_scanned_at TIMESTAMP,

    -- Check-in
    checked_in_at TIMESTAMP,
    checked_in_by TEXT,
    check_in_location TEXT,

    -- Wallet Integration
    wallet_source TEXT CHECK (wallet_source IN ('apple_wallet', 'google_wallet') OR wallet_source IS NULL),
    apple_pass_serial TEXT,
    google_pass_id TEXT,
    wallet_pass_generated_at TIMESTAMP,
    wallet_pass_updated_at TIMESTAMP,
    wallet_pass_revoked_at TIMESTAMP,
    wallet_pass_revoked_reason TEXT,

    -- Registration
    registration_status TEXT NOT NULL DEFAULT 'pending' CHECK (registration_status IN ('pending', 'completed', 'expired')),
    registered_at DATETIME,
    registration_deadline DATETIME,

    -- Test Mode
    is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1)),

    -- Metadata and Timestamps
    ticket_metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Copy all data
INSERT INTO tickets_new SELECT * FROM tickets;

-- Drop old table (orphans child FK constraints temporarily)
DROP TABLE tickets;

-- Rename new table (SQLite auto-fixes orphaned FK constraints)
ALTER TABLE tickets_new RENAME TO tickets;

-- ============================================================================
-- STEP 2: Recreate all indexes (including missing ones from migrations 032, 039, 055)
-- ============================================================================

-- Indexes from migration 044
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_qr_token_unique ON tickets(qr_token);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_id_status ON tickets(ticket_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_scan_validation ON tickets(id, scan_count, max_scan_count, status);
CREATE INDEX IF NOT EXISTS idx_tickets_validation_composite ON tickets(id, status, scan_count, max_scan_count);
CREATE INDEX IF NOT EXISTS idx_tickets_checked_in ON tickets(checked_in_at);
CREATE INDEX IF NOT EXISTS idx_tickets_status_checkin ON tickets(status, checked_in_at);
CREATE INDEX IF NOT EXISTS idx_tickets_transaction_id ON tickets(transaction_id);
CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_attendee_email ON tickets(attendee_email);
CREATE INDEX IF NOT EXISTS idx_tickets_validation_signature ON tickets(validation_signature);
CREATE INDEX IF NOT EXISTS idx_tickets_qr_code ON tickets(qr_code_data);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_apple_pass_serial ON tickets(apple_pass_serial) WHERE apple_pass_serial IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_google_pass_id ON tickets(google_pass_id) WHERE google_pass_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_status_created_at ON tickets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_type_created_at ON tickets(ticket_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_attendee_name_search ON tickets(attendee_last_name, attendee_first_name);
CREATE INDEX IF NOT EXISTS idx_tickets_transaction_status ON tickets(transaction_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_wallet_source ON tickets(wallet_source) WHERE wallet_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_qr_access_method ON tickets(qr_access_method);
CREATE INDEX IF NOT EXISTS idx_tickets_wallet_analytics ON tickets(wallet_source, qr_access_method, created_at) WHERE wallet_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_registration_status ON tickets(registration_status, registration_deadline);
CREATE INDEX IF NOT EXISTS idx_tickets_deadline ON tickets(registration_deadline) WHERE registration_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_tickets_flagged_review ON tickets(status, created_at DESC) WHERE status = 'flagged_for_review';
CREATE INDEX IF NOT EXISTS idx_tickets_event_status ON tickets(event_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_event_type ON tickets(event_id, ticket_type);
CREATE INDEX IF NOT EXISTS idx_tickets_test_mode ON tickets(is_test, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_type_id ON tickets(ticket_type_id);

-- MISSING INDEX from migration 032 (scan tracking enhancements)
CREATE INDEX IF NOT EXISTS idx_tickets_validation_status ON tickets(validation_status);

-- MISSING INDEX from migration 032 (event end date expiry checks)
CREATE INDEX IF NOT EXISTS idx_tickets_event_end_date ON tickets(event_end_date);

-- MISSING INDEX from migration 039 (event datetime queries)
CREATE INDEX IF NOT EXISTS idx_tickets_event_datetime ON tickets(event_date, event_time);

-- NEW INDEX from migration 055 (performance optimization)
CREATE INDEX IF NOT EXISTS idx_tickets_status_created_registration
ON tickets(status, created_at DESC, registration_status);

-- ============================================================================
-- STEP 3: Recreate triggers
-- ============================================================================

-- Timestamp update trigger (from migration 005, recreated in 044)
CREATE TRIGGER IF NOT EXISTS update_tickets_timestamp
AFTER UPDATE ON tickets
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Scan count validation trigger (from migration 044)
CREATE TRIGGER IF NOT EXISTS trg_tickets_scan_count_validation
BEFORE UPDATE ON tickets
FOR EACH ROW
WHEN NEW.scan_count > NEW.max_scan_count
BEGIN
    SELECT RAISE(ABORT, 'scan_count cannot exceed max_scan_count');
END;

-- ============================================================================
-- STEP 4: Recreate views that depend on tickets
-- ============================================================================

-- v_data_mode_statistics (from migration 028, updated in 041, recreated in 044)
CREATE VIEW IF NOT EXISTS v_data_mode_statistics AS
SELECT
    'transactions' as table_name,
    SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END) as production_count,
    SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) as test_count,
    COUNT(*) as total_count,
    ROUND(SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as test_percentage,
    SUM(CASE WHEN is_test = 0 THEN amount_cents ELSE 0 END) as production_amount_cents,
    SUM(CASE WHEN is_test = 1 THEN amount_cents ELSE 0 END) as test_amount_cents
FROM transactions
UNION ALL
SELECT
    'tickets' as table_name,
    SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END) as production_count,
    SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) as test_count,
    COUNT(*) as total_count,
    ROUND(SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as test_percentage,
    SUM(CASE WHEN is_test = 0 THEN price_cents ELSE 0 END) as production_amount_cents,
    SUM(CASE WHEN is_test = 1 THEN price_cents ELSE 0 END) as test_amount_cents
FROM tickets;

-- v_test_data_cleanup_candidates (from migration 038, updated in 041, recreated in 044)
CREATE VIEW IF NOT EXISTS v_test_data_cleanup_candidates AS
SELECT
    'transaction' as record_type,
    t.id as record_id,
    julianday('now') - julianday(t.created_at) as age_days,
    t.amount_cents,
    CASE
        WHEN julianday('now') - julianday(t.created_at) > 90 THEN 'immediate'
        WHEN julianday('now') - julianday(t.created_at) > 30 THEN 'priority'
        WHEN julianday('now') - julianday(t.created_at) > 7 THEN 'scheduled'
        ELSE 'retain'
    END as cleanup_priority,
    t.status,
    t.created_at
FROM transactions t
WHERE t.is_test = 1
UNION ALL
SELECT
    'ticket' as record_type,
    t.id as record_id,
    julianday('now') - julianday(t.created_at) as age_days,
    t.price_cents as amount_cents,
    CASE
        WHEN julianday('now') - julianday(t.created_at) > 90 THEN 'immediate'
        WHEN julianday('now') - julianday(t.created_at) > 30 THEN 'priority'
        WHEN julianday('now') - julianday(t.created_at) > 7 THEN 'scheduled'
        ELSE 'retain'
    END as cleanup_priority,
    t.status,
    t.created_at
FROM tickets t
WHERE t.is_test = 1
UNION ALL
SELECT
    'transaction_item' as record_type,
    ti.id as record_id,
    julianday('now') - julianday(ti.created_at) as age_days,
    ti.total_price_cents as amount_cents,
    CASE
        WHEN julianday('now') - julianday(ti.created_at) > 90 THEN 'immediate'
        WHEN julianday('now') - julianday(ti.created_at) > 30 THEN 'priority'
        WHEN julianday('now') - julianday(ti.created_at) > 7 THEN 'scheduled'
        ELSE 'retain'
    END as cleanup_priority,
    'active' as status,
    ti.created_at
FROM transaction_items ti
WHERE ti.is_test = 1;

-- test_ticket_sales_view (from migration 043, dropped in 044, recreated in 058)
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
LEFT JOIN tickets t ON t.ticket_type_id = tt.id
LEFT JOIN events e ON tt.event_id = e.id
WHERE (tt.test_sold_count > 0 OR t.id IS NOT NULL)
  AND e.status = 'test'
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
--    - Fixed tickets.ticket_type_id FK that pointed to deleted "ticket_types_backup" table
--    - Now correctly points to ticket_types.id
--    - Manual ticket creation works again
--
-- 2. MISSING INDEXES ADDED:
--    - idx_tickets_validation_status (migration 032 - was missing from 044)
--    - idx_tickets_event_end_date (migration 032 - was missing from 044)
--    - idx_tickets_event_datetime (migration 039 - was missing from 044)
--    - idx_tickets_status_created_registration (migration 055 - new index after 044)
--
-- 3. ALL VIEWS RECREATED:
--    - v_data_mode_statistics (from 044)
--    - v_test_data_cleanup_candidates (from 044)
--    - test_ticket_sales_view (from 058 - was missing from 044)
--
-- SAFE PATTERN USED:
-- CREATE tickets_new → DROP tickets → RENAME tickets_new TO tickets
--   - Allows SQLite to auto-fix orphaned FK constraints during RENAME
--   - Child tables (scan_logs, ticket_transfers) FKs auto-reconnect
--
-- UNSAFE PATTERN (caused the bug):
-- RENAME tickets TO tickets_backup → DROP tickets_backup
--   - SQLite auto-updates child FKs to "tickets_backup" during RENAME
--   - DROP orphans those FKs permanently
--
-- APPLICATION IMPACT:
-- - Manual ticket creation restored
-- - All ticket queries now use proper indexes
-- - Analytics views functional again
--
-- VERIFICATION QUERY:
-- SELECT * FROM sqlite_master
-- WHERE type='table' AND name LIKE '%backup%';
-- -- Should return 0 rows (no orphaned backup tables)
--
-- PRAGMA foreign_key_list(tickets);
-- -- tickets.ticket_type_id should reference "ticket_types", not "ticket_types_backup"

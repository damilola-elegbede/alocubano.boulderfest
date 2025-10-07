-- Migration: 044 - Critical Foreign Key and Data Integrity Constraints
-- Purpose: Add missing FK constraints, fix data type mismatches, and add validation triggers
-- Dependencies: 005_tickets.sql, 006_registrations.sql, 008_transaction_items.sql
-- Issues:
--   1. tickets.ticket_type_id has no FK constraint (orphan tickets possible)
--   2. transaction_items.event_id is TEXT but should be INTEGER (type mismatch with events.id)
--   3. registrations.transaction_id is TEXT but should be INTEGER (type mismatch with transactions.id)
--   4. Manual payment methods (cash/card_terminal/venmo/comp) lack validation for manual_entry_id
--   5. No validation that scan_count <= max_scan_count

-- ============================================================================
-- STEP 1: Fix tickets table - Add ticket_type_id FK constraint
-- ============================================================================
-- SQLite requires table recreation to add FK constraints to existing columns

PRAGMA foreign_keys = OFF;

-- Drop views that depend on tickets table
DROP VIEW IF EXISTS v_data_mode_statistics;
DROP VIEW IF EXISTS v_test_data_cleanup_candidates;

-- Create new tickets table with FK constraint
CREATE TABLE tickets_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT UNIQUE NOT NULL,
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
    ticket_type TEXT NOT NULL,
    ticket_type_id TEXT REFERENCES ticket_types(id) ON DELETE SET NULL,
    event_id INTEGER NOT NULL REFERENCES events(id),
    event_date DATE,
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

-- Drop old table
DROP TABLE tickets;

-- Rename new table
ALTER TABLE tickets_new RENAME TO tickets;

-- Recreate all indexes
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

-- Recreate tickets update trigger
CREATE TRIGGER IF NOT EXISTS update_tickets_timestamp
AFTER UPDATE ON tickets
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ============================================================================
-- STEP 2: Fix transaction_items table - Change event_id from TEXT to INTEGER
-- ============================================================================

-- Create new transaction_items table with INTEGER event_id
CREATE TABLE transaction_items_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL CHECK (item_type IN ('ticket', 'donation', 'merchandise')),
    item_name TEXT NOT NULL,
    item_description TEXT,
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0),
    quantity INTEGER DEFAULT 1 CHECK (quantity > 0),
    total_price_cents INTEGER NOT NULL CHECK (total_price_cents > 0),
    ticket_type TEXT,
    event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
    donation_category TEXT,
    sku TEXT,
    product_metadata TEXT,
    fulfillment_status TEXT DEFAULT 'pending' CHECK (
        fulfillment_status IN ('pending', 'fulfilled', 'cancelled', 'refunded')
    ),
    fulfilled_at TIMESTAMP,
    is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1)),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Copy data, converting TEXT event_id to INTEGER (NULL if invalid)
INSERT INTO transaction_items_new
SELECT
    id, transaction_id, item_type, item_name, item_description,
    unit_price_cents, quantity, total_price_cents, ticket_type,
    CAST(event_id AS INTEGER) as event_id,
    donation_category, sku, product_metadata, fulfillment_status,
    fulfilled_at, is_test, created_at
FROM transaction_items;

-- Drop old table
DROP TABLE transaction_items;

-- Rename new table
ALTER TABLE transaction_items_new RENAME TO transaction_items;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction_id ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_type ON transaction_items(item_type);
CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction_type ON transaction_items(transaction_id, item_type);
CREATE INDEX IF NOT EXISTS idx_transaction_items_test_mode ON transaction_items(is_test, item_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transaction_items_event_id ON transaction_items(event_id) WHERE event_id IS NOT NULL;

-- ============================================================================
-- STEP 3: Fix registrations table - Change transaction_id from TEXT to INTEGER
-- ============================================================================

-- Create new registrations table with INTEGER transaction_id
CREATE TABLE registrations_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL,
    email TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    ticket_type TEXT NOT NULL,
    dietary_restrictions TEXT,
    accessibility_needs TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    phone_number TEXT,
    marketing_consent INTEGER DEFAULT 0,
    registration_completed INTEGER DEFAULT 0,
    registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_primary_purchaser BOOLEAN DEFAULT FALSE,
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'registered' CHECK (status IN ('registered', 'checked_in', 'cancelled')),
    checked_in_at TIMESTAMP,
    notes TEXT
);

-- Copy data, converting TEXT transaction_id to INTEGER (NULL if invalid)
INSERT INTO registrations_new
SELECT
    id, ticket_id, email, first_name, last_name, ticket_type,
    dietary_restrictions, accessibility_needs, emergency_contact_name,
    emergency_contact_phone, phone_number, marketing_consent,
    registration_completed, registration_date, is_primary_purchaser,
    CAST(transaction_id AS INTEGER) as transaction_id,
    status, checked_in_at, notes
FROM registrations;

-- Drop old table
DROP TABLE registrations;

-- Rename new table
ALTER TABLE registrations_new RENAME TO registrations;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_registrations_ticket ON registrations(ticket_id);
CREATE INDEX IF NOT EXISTS idx_registrations_email ON registrations(email);
CREATE INDEX IF NOT EXISTS idx_registrations_transaction ON registrations(transaction_id);

-- ============================================================================
-- STEP 4: Add validation trigger for scan_count <= max_scan_count
-- ============================================================================

CREATE TRIGGER IF NOT EXISTS trg_tickets_scan_count_validation
BEFORE UPDATE ON tickets
FOR EACH ROW
WHEN NEW.scan_count > NEW.max_scan_count
BEGIN
    SELECT RAISE(ABORT, 'scan_count cannot exceed max_scan_count');
END;

-- ============================================================================
-- STEP 5: Add validation trigger for manual payment methods
-- ============================================================================

-- Manual payment methods (cash, card_terminal, venmo, comp) MUST have manual_entry_id
CREATE TRIGGER IF NOT EXISTS trg_transactions_manual_payment_validation
BEFORE INSERT ON transactions
FOR EACH ROW
WHEN NEW.payment_processor IN ('cash', 'card_terminal', 'venmo', 'comp')
  AND (NEW.manual_entry_id IS NULL OR NEW.manual_entry_id = '')
BEGIN
    SELECT RAISE(ABORT, 'Manual payment methods (cash/card_terminal/venmo/comp) require manual_entry_id');
END;

CREATE TRIGGER IF NOT EXISTS trg_transactions_manual_payment_validation_update
BEFORE UPDATE ON transactions
FOR EACH ROW
WHEN NEW.payment_processor IN ('cash', 'card_terminal', 'venmo', 'comp')
  AND (NEW.manual_entry_id IS NULL OR NEW.manual_entry_id = '')
BEGIN
    SELECT RAISE(ABORT, 'Manual payment methods (cash/card_terminal/venmo/comp) require manual_entry_id');
END;

-- ============================================================================
-- STEP 6: Recreate views that depend on tickets and transaction_items
-- ============================================================================

-- Recreate v_data_mode_statistics (from migration 028, updated in 041)
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

-- Recreate v_test_data_cleanup_candidates (from migration 038, updated in 041)
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

-- Re-enable foreign key constraints
PRAGMA foreign_keys = ON;

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================
-- CHANGES SUMMARY:
--
-- 1. TICKETS TABLE:
--    - Added FK constraint: ticket_type_id → ticket_types(id) ON DELETE SET NULL
--    - Added trigger: scan_count must be <= max_scan_count
--    - Prevents orphaned tickets and invalid scan counts
--
-- 2. TRANSACTION_ITEMS TABLE:
--    - Fixed event_id data type: TEXT → INTEGER
--    - Added FK constraint: event_id → events(id) ON DELETE SET NULL
--    - Enables proper joins with events table
--
-- 3. REGISTRATIONS TABLE:
--    - Fixed transaction_id data type: TEXT → INTEGER
--    - Added FK constraint: transaction_id → transactions(id) ON DELETE SET NULL
--    - Enables proper joins with transactions table
--
-- 4. TRANSACTIONS TABLE:
--    - Added trigger: manual payment methods require manual_entry_id
--    - Prevents invalid manual payment records (cash/card_terminal/venmo/comp)
--
-- DATA INTEGRITY:
-- - All FK constraints use ON DELETE SET NULL to prevent orphaned records
-- - All data type conversions use CAST() to handle existing TEXT values
-- - Views recreated to reflect schema changes
--
-- APPLICATION IMPACT:
-- - Manual payment endpoints MUST provide manual_entry_id (UUID recommended)
-- - Scan operations will fail if scan_count would exceed max_scan_count
-- - event_id and transaction_id must be INTEGERs in new records
--
-- ROLLBACK INSTRUCTIONS (if needed):
-- To rollback this migration, recreate original tables without FK constraints:
/*
PRAGMA foreign_keys = OFF;

-- Rollback tickets table (no FK on ticket_type_id)
CREATE TABLE tickets_rollback (...); -- Original schema from migration 005
INSERT INTO tickets_rollback SELECT * FROM tickets;
DROP TABLE tickets;
ALTER TABLE tickets_rollback RENAME TO tickets;

-- Rollback transaction_items (event_id as TEXT)
CREATE TABLE transaction_items_rollback (...); -- Original schema from migration 008
INSERT INTO transaction_items_rollback SELECT * FROM transaction_items;
DROP TABLE transaction_items;
ALTER TABLE transaction_items_rollback RENAME TO transaction_items;

-- Rollback registrations (transaction_id as TEXT)
CREATE TABLE registrations_rollback (...); -- Original schema from migration 006
INSERT INTO registrations_rollback SELECT * FROM registrations;
DROP TABLE registrations;
ALTER TABLE registrations_rollback RENAME TO registrations;

-- Drop new triggers
DROP TRIGGER IF EXISTS trg_tickets_scan_count_validation;
DROP TRIGGER IF EXISTS trg_transactions_manual_payment_validation;
DROP TRIGGER IF EXISTS trg_transactions_manual_payment_validation_update;

PRAGMA foreign_keys = ON;
*/

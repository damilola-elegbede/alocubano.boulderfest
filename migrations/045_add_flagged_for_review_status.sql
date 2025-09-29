-- Migration: 045 - Add flagged_for_review status to tickets
-- Purpose: Support security validation failures in webhook ticket creation
-- Dependencies: 007_tickets.sql, 037_scan_tracking_enhancements.sql

-- SQLite doesn't support ALTER TABLE ... MODIFY CHECK constraint
-- We need to recreate the table with the new constraint

-- Step 0: Drop views that depend on tickets table
DROP VIEW IF EXISTS v_data_mode_statistics;
DROP VIEW IF EXISTS v_ticket_analytics;
DROP VIEW IF EXISTS v_ticket_summary;
DROP VIEW IF EXISTS v_active_test_data;
DROP VIEW IF EXISTS v_test_data_summary;

-- Step 1: Create new tickets table with updated status CHECK constraint
CREATE TABLE IF NOT EXISTS tickets_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT UNIQUE NOT NULL,
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
    ticket_type TEXT NOT NULL,
    event_id TEXT NOT NULL,
    event_date DATE,
    price_cents INTEGER NOT NULL,
    attendee_first_name TEXT,
    attendee_last_name TEXT,
    attendee_email TEXT,
    attendee_phone TEXT,
    status TEXT DEFAULT 'valid' CHECK (
        status IN ('valid', 'used', 'cancelled', 'refunded', 'transferred', 'flagged_for_review')
    ),
    validation_code TEXT UNIQUE,
    cancellation_reason TEXT,
    qr_token TEXT,
    qr_code_generated_at TIMESTAMP,
    scan_count INTEGER DEFAULT 0 CHECK (scan_count >= 0),
    max_scan_count INTEGER DEFAULT 10 CHECK (max_scan_count >= 0),
    first_scanned_at TIMESTAMP,
    last_scanned_at TIMESTAMP,
    qr_access_method TEXT,
    wallet_source TEXT CHECK (wallet_source IN ('apple_wallet', 'google_wallet') OR wallet_source IS NULL),
    registration_status TEXT NOT NULL DEFAULT 'pending' CHECK (registration_status IN ('pending', 'completed', 'expired')),
    registered_at DATETIME,
    registration_deadline DATETIME,
    validation_signature TEXT,
    qr_code_data TEXT,
    apple_pass_serial TEXT,
    google_pass_id TEXT,
    wallet_pass_generated_at TIMESTAMP,
    wallet_pass_updated_at TIMESTAMP,
    wallet_pass_revoked_at TIMESTAMP,
    wallet_pass_revoked_reason TEXT,
    checked_in_at TIMESTAMP,
    checked_in_by TEXT,
    check_in_location TEXT,
    ticket_metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    validation_status TEXT DEFAULT 'active' CHECK (
        validation_status IN ('active', 'invalidated', 'suspicious', 'expired')
    ),
    event_end_date DATETIME,
    is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1)),
    ticket_type_id TEXT REFERENCES ticket_types(id)
);

-- Step 2: Copy all data from old table to new table
-- Handle potential validation_status values that don't match constraint
-- Normalize any invalid validation_status to 'active' (safe default)
INSERT INTO tickets_new
SELECT
    id, ticket_id, transaction_id, ticket_type, event_id, event_date,
    price_cents, attendee_first_name, attendee_last_name, attendee_email,
    attendee_phone, status, validation_code, cancellation_reason, qr_token,
    qr_code_generated_at, scan_count, max_scan_count, first_scanned_at,
    last_scanned_at, qr_access_method, wallet_source, registration_status,
    registered_at, registration_deadline, validation_signature, qr_code_data,
    apple_pass_serial, google_pass_id, wallet_pass_generated_at,
    wallet_pass_updated_at, wallet_pass_revoked_at, wallet_pass_revoked_reason,
    checked_in_at, checked_in_by, check_in_location, ticket_metadata,
    created_at, updated_at,
    -- Normalize validation_status: only keep valid values, default to 'active'
    CASE
        WHEN validation_status IN ('active', 'invalidated', 'suspicious', 'expired')
        THEN validation_status
        ELSE 'active'
    END as validation_status,
    event_end_date, is_test, ticket_type_id
FROM tickets;

-- Step 3: Drop old table
DROP TABLE tickets;

-- Step 4: Rename new table to tickets
ALTER TABLE tickets_new RENAME TO tickets;

-- Step 5: Recreate all indexes (from 007_tickets.sql)
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

-- Step 6: Create index for flagged tickets (for admin review queries)
CREATE INDEX IF NOT EXISTS idx_tickets_flagged_review ON tickets(status, created_at DESC) WHERE status = 'flagged_for_review';

-- Step 7: Recreate triggers (from 007_tickets.sql if any exist)
CREATE TRIGGER IF NOT EXISTS update_tickets_timestamp
AFTER UPDATE ON tickets
FOR EACH ROW
BEGIN
    UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Step 8: Recreate views that depend on tickets table
CREATE VIEW IF NOT EXISTS v_data_mode_statistics AS
SELECT
  'Transactions' as entity_type,
  COUNT(*) as total_count,
  SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) as test_count,
  SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END) as production_count,
  ROUND(CAST(SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100, 2) as test_percentage
FROM transactions
UNION ALL
SELECT
  'Tickets' as entity_type,
  COUNT(*) as total_count,
  SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) as test_count,
  SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END) as production_count,
  ROUND(CAST(SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100, 2) as test_percentage
FROM tickets;

-- Verification queries (commented out for production)
-- SELECT COUNT(*) as flagged_tickets FROM tickets WHERE status = 'flagged_for_review';
-- SELECT status, COUNT(*) as count FROM tickets GROUP BY status ORDER BY count DESC;

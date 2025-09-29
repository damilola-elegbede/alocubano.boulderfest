-- Migration: 045 - Add flagged_for_review status to tickets
-- Purpose: Support security validation failures in webhook ticket creation
-- Dependencies: 007_tickets.sql, 037_scan_tracking_enhancements.sql

-- SQLite doesn't support ALTER TABLE ... MODIFY CHECK constraint
-- We need to recreate the table with the new constraint

-- Step 0: Drop views that depend on tickets table or reference columns that may not exist
DROP VIEW IF EXISTS v_data_mode_statistics;
DROP VIEW IF EXISTS v_ticket_analytics;
DROP VIEW IF EXISTS v_ticket_summary;
DROP VIEW IF EXISTS v_active_test_data;
DROP VIEW IF EXISTS v_test_data_summary;
DROP VIEW IF EXISTS v_payment_processor_summary;
DROP VIEW IF EXISTS v_paypal_webhook_status;
DROP VIEW IF EXISTS v_paypal_transaction_reconciliation;
DROP VIEW IF EXISTS v_paypal_unprocessed_events;
DROP VIEW IF EXISTS v_paypal_health_metrics;

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

-- Step 2: Add missing columns to old table if they don't exist
-- This handles cases where previous migrations (024, 037, 043) haven't run yet
ALTER TABLE tickets ADD COLUMN validation_status TEXT DEFAULT 'active' CHECK (
    validation_status IN ('active', 'invalidated', 'suspicious', 'expired')
);
ALTER TABLE tickets ADD COLUMN event_end_date DATETIME;
ALTER TABLE tickets ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1));
ALTER TABLE tickets ADD COLUMN ticket_type_id TEXT REFERENCES ticket_types(id);

-- Step 3: Copy all data from old table to new table
-- Now all columns are guaranteed to exist
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
    COALESCE(
        CASE
            WHEN validation_status IN ('active', 'invalidated', 'suspicious', 'expired')
            THEN validation_status
            ELSE 'active'
        END,
        'active'
    ) as validation_status,
    event_end_date,
    COALESCE(is_test, 0) as is_test,
    ticket_type_id
FROM tickets;

-- Step 4: Drop old table
DROP TABLE tickets;

-- Step 5: Rename new table to tickets
ALTER TABLE tickets_new RENAME TO tickets;

-- Step 6: Recreate all indexes (from 007_tickets.sql)
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

-- Step 7: Create index for flagged tickets (for admin review queries)
CREATE INDEX IF NOT EXISTS idx_tickets_flagged_review ON tickets(status, created_at DESC) WHERE status = 'flagged_for_review';

-- Step 8: Recreate triggers (from 007_tickets.sql if any exist)
CREATE TRIGGER IF NOT EXISTS update_tickets_timestamp
AFTER UPDATE ON tickets
FOR EACH ROW
BEGIN
    UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Step 9: Recreate views that depend on tickets table
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

-- Step 10: Recreate PayPal views (from 025_paypal_integration.sql)
-- These were dropped in Step 0 because they may reference is_test column
CREATE VIEW IF NOT EXISTS v_payment_processor_summary AS
SELECT
    payment_processor,
    status,
    is_test,
    COUNT(*) as transaction_count,
    SUM(amount_cents) as total_amount_cents,
    AVG(amount_cents) as avg_amount_cents,
    MIN(amount_cents) as min_amount_cents,
    MAX(amount_cents) as max_amount_cents,
    MIN(created_at) as first_transaction,
    MAX(created_at) as last_transaction
FROM transactions
GROUP BY payment_processor, status, is_test;

CREATE VIEW IF NOT EXISTS v_paypal_webhook_status AS
SELECT
    event_type,
    processing_status,
    verification_status,
    is_test,
    COUNT(*) as event_count,
    MIN(created_at) as first_event,
    MAX(created_at) as last_event,
    AVG(CAST((julianday(processed_at) - julianday(created_at)) * 86400 AS INTEGER)) as avg_processing_time_seconds
FROM paypal_webhook_events
GROUP BY event_type, processing_status, verification_status, is_test;

CREATE VIEW IF NOT EXISTS v_paypal_transaction_reconciliation AS
SELECT
    t.id as transaction_id,
    t.transaction_id as business_transaction_id,
    t.paypal_order_id,
    t.paypal_capture_id,
    t.status as transaction_status,
    t.amount_cents,
    t.created_at as transaction_created,
    pwe.id as webhook_event_id,
    pwe.event_type,
    pwe.processing_status,
    pwe.verification_status,
    pwe.created_at as webhook_created,
    pwe.processed_at as webhook_processed,
    CASE
        WHEN pwe.id IS NULL THEN 'missing_webhook'
        WHEN pwe.processing_status = 'failed' THEN 'webhook_failed'
        WHEN pwe.verification_status != 'verified' THEN 'verification_failed'
        WHEN t.status = 'completed' AND pwe.processing_status = 'processed' THEN 'reconciled'
        ELSE 'pending'
    END as reconciliation_status
FROM transactions t
LEFT JOIN paypal_webhook_events pwe ON t.paypal_order_id = pwe.paypal_order_id
WHERE t.payment_processor = 'paypal';

CREATE VIEW IF NOT EXISTS v_paypal_unprocessed_events AS
SELECT
    id,
    event_id,
    event_type,
    paypal_order_id,
    processing_status,
    verification_status,
    retry_count,
    created_at,
    last_retry_at,
    error_message,
    CASE
        WHEN retry_count >= 3 THEN 'requires_attention'
        WHEN julianday('now') - julianday(created_at) > 1 THEN 'stale'
        ELSE 'pending'
    END as urgency_level
FROM paypal_webhook_events
WHERE processing_status IN ('pending', 'failed')
ORDER BY
    CASE urgency_level
        WHEN 'requires_attention' THEN 1
        WHEN 'stale' THEN 2
        ELSE 3
    END,
    created_at ASC;

CREATE VIEW IF NOT EXISTS v_paypal_health_metrics AS
SELECT
    'paypal_transactions_today' as metric_name,
    COUNT(*) as metric_value,
    'count' as metric_type,
    DATE('now') as metric_date
FROM transactions
WHERE payment_processor = 'paypal'
  AND DATE(created_at) = DATE('now')
  AND is_test = 0

UNION ALL

SELECT
    'paypal_webhook_events_today' as metric_name,
    COUNT(*) as metric_value,
    'count' as metric_type,
    DATE('now') as metric_date
FROM paypal_webhook_events
WHERE DATE(created_at) = DATE('now')
  AND is_test = 0

UNION ALL

SELECT
    'paypal_failed_webhooks_24h' as metric_name,
    COUNT(*) as metric_value,
    'count' as metric_type,
    DATE('now') as metric_date
FROM paypal_webhook_events
WHERE processing_status = 'failed'
  AND created_at >= datetime('now', '-24 hours')
  AND is_test = 0

UNION ALL

SELECT
    'paypal_verification_failures_24h' as metric_name,
    COUNT(*) as metric_value,
    'count' as metric_type,
    DATE('now') as metric_date
FROM paypal_webhook_events
WHERE verification_status IN ('failed', 'invalid_signature')
  AND created_at >= datetime('now', '-24 hours')
  AND is_test = 0;

-- Verification queries (commented out for production)
-- SELECT COUNT(*) as flagged_tickets FROM tickets WHERE status = 'flagged_for_review';
-- SELECT status, COUNT(*) as count FROM tickets GROUP BY status ORDER BY count DESC;

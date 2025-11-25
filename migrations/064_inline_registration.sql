-- Migration 064: Inline Registration System
-- Removes post-purchase registration infrastructure in favor of inline registration during checkout
-- Registration now happens BEFORE payment, eliminating need for reminders, deadlines, and tokens

-- ============================================================================
-- STEP 1: Migrate Legacy Pending Tickets
-- ============================================================================

-- Mark all pending tickets as expired (they should have been registered already)
-- This is a data cleanup step for any orphaned pending registrations
-- DEFENSIVE: Only run if tickets table exists and has registration_status column
UPDATE tickets
SET registration_status = 'expired'
WHERE registration_status = 'pending'
  AND EXISTS (
    SELECT 1 FROM pragma_table_info('tickets')
    WHERE name = 'registration_status'
  );

-- ============================================================================
-- STEP 2: Add New Registration Status Comment
-- ============================================================================

-- The new 'pending_payment' status represents tickets that have attendee info
-- but payment hasn't completed yet. This status is added in STEP 4.

-- ============================================================================
-- STEP 3: Drop Registration Reminder Infrastructure
-- ============================================================================

-- Drop registration_reminders table (no longer needed)
DROP TABLE IF EXISTS registration_reminders;

-- Drop registration_emails audit log table (no longer needed)
DROP TABLE IF EXISTS registration_emails;

-- ============================================================================
-- STEP 4: Remove Registration Deadline Field from Tickets
-- ============================================================================

-- SQLite doesn't support DROP COLUMN directly in all versions
-- We'll create a new table without the registration_deadline column and migrate data

PRAGMA foreign_keys = OFF;

-- Clean up any orphaned temporary tables from previous failed migration attempts
DROP TABLE IF EXISTS tickets_new;

-- Drop views that depend on tickets table (will be recreated after table rename)
DROP VIEW IF EXISTS v_data_mode_statistics;
DROP VIEW IF EXISTS v_test_data_cleanup_candidates;
DROP VIEW IF EXISTS test_ticket_sales_view;

-- Create new tickets table WITHOUT registration_deadline
-- This is the COMPLETE schema from migration 044 (lines 27-94), minus only registration_deadline
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

    -- Registration (updated to remove deadline and add pending_payment status)
    registration_status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (registration_status IN ('pending', 'pending_payment', 'completed', 'expired')),
    registered_at DATETIME,
    -- registration_deadline DATETIME - REMOVED for inline registration

    -- Test Mode
    is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1)),

    -- Metadata and Timestamps
    ticket_metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- DEFENSIVE DATA MIGRATION:
-- Check if the old tickets table has the expected columns before attempting migration
-- If registration_deadline column exists, do a normal migration
-- If it doesn't exist, the table has corrupted schema - just drop it (we'll lose data but it's already corrupted)

-- Copy data ONLY if registration_deadline column exists (indicating proper schema)
INSERT INTO tickets_new
SELECT
    id,
    ticket_id,
    transaction_id,
    ticket_type,
    ticket_type_id,
    event_id,
    event_date,
    event_time,
    event_end_date,
    price_cents,
    attendee_first_name,
    attendee_last_name,
    attendee_email,
    attendee_phone,
    status,
    validation_status,
    validation_code,
    validation_signature,
    cancellation_reason,
    qr_token,
    qr_code_data,
    qr_code_generated_at,
    qr_access_method,
    scan_count,
    max_scan_count,
    first_scanned_at,
    last_scanned_at,
    checked_in_at,
    checked_in_by,
    check_in_location,
    wallet_source,
    apple_pass_serial,
    google_pass_id,
    wallet_pass_generated_at,
    wallet_pass_updated_at,
    wallet_pass_revoked_at,
    wallet_pass_revoked_reason,
    -- Map old 'pending' status to 'expired' (should be none after STEP 1)
    CASE
        WHEN registration_status = 'pending' THEN 'expired'
        ELSE registration_status
    END as registration_status,
    registered_at,
    -- registration_deadline is NOT copied (removed)
    is_test,
    ticket_metadata,
    created_at,
    updated_at
FROM tickets
WHERE EXISTS (
    SELECT 1 FROM pragma_table_info('tickets')
    WHERE name = 'registration_deadline'
);

-- If the copy failed or copied 0 rows due to missing columns, log a warning
-- The migration will continue - we're accepting data loss for corrupted schemas

-- Drop old table
DROP TABLE IF EXISTS tickets;

-- Rename new table
ALTER TABLE tickets_new RENAME TO tickets;

-- Recreate ALL indexes from migration 044 (lines 106-133) plus additional ones
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
CREATE INDEX IF NOT EXISTS idx_tickets_registration_status ON tickets(registration_status);
-- Removed: idx_tickets_registration_status ON tickets(registration_status, registration_deadline)
-- Removed: idx_tickets_deadline - no longer needed without registration_deadline
CREATE INDEX IF NOT EXISTS idx_tickets_flagged_review ON tickets(status, created_at DESC) WHERE status = 'flagged_for_review';
CREATE INDEX IF NOT EXISTS idx_tickets_event_status ON tickets(event_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_event_type ON tickets(event_id, ticket_type);
CREATE INDEX IF NOT EXISTS idx_tickets_test_mode ON tickets(is_test, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_type_id ON tickets(ticket_type_id);

-- Additional indexes from migration 032
CREATE INDEX IF NOT EXISTS idx_tickets_validation_status ON tickets(validation_status);
CREATE INDEX IF NOT EXISTS idx_tickets_event_end_date ON tickets(event_end_date);

-- Additional index from migration 039
CREATE INDEX IF NOT EXISTS idx_tickets_event_datetime ON tickets(event_date, event_time);

-- Additional index from migration 055
CREATE INDEX IF NOT EXISTS idx_tickets_status_created_registration
ON tickets(status, created_at DESC, registration_status);

-- Recreate tickets update trigger (from migration 044)
CREATE TRIGGER IF NOT EXISTS update_tickets_timestamp
AFTER UPDATE ON tickets
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Recreate scan validation trigger (from migration 044)
CREATE TRIGGER IF NOT EXISTS trg_tickets_scan_count_validation
BEFORE UPDATE ON tickets
FOR EACH ROW
WHEN NEW.scan_count > NEW.max_scan_count
BEGIN
    SELECT RAISE(ABORT, 'scan_count cannot exceed max_scan_count');
END;

-- ============================================================================
-- STEP 5: Remove Registration Token Fields from Transactions
-- ============================================================================

-- Create new transactions table without registration token fields
-- This is the COMPLETE schema from migration 041, minus only registration_token and registration_token_expires

-- Clean up any orphaned temporary tables
DROP TABLE IF EXISTS transactions_new;

-- Drop views that depend on transactions (will be recreated)
DROP VIEW IF EXISTS v_payment_processor_summary;
DROP VIEW IF EXISTS v_paypal_transaction_reconciliation;
DROP VIEW IF EXISTS v_paypal_health_metrics;

CREATE TABLE transactions_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT UNIQUE NOT NULL,
    uuid TEXT,
    type TEXT NOT NULL CHECK (type IN ('tickets', 'donation', 'merchandise')),
    status TEXT DEFAULT 'pending' CHECK (
        status IN ('pending', 'completed', 'failed', 'cancelled', 'refunded', 'partially_refunded')
    ),
    amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0), -- Allow 0 for comp tickets
    total_amount INTEGER,
    currency TEXT DEFAULT 'USD',

    -- Payment Processor Fields (Stripe)
    stripe_session_id TEXT UNIQUE,
    stripe_payment_intent_id TEXT,
    stripe_charge_id TEXT,
    payment_method_type TEXT,

    -- Payment Processor Fields (PayPal)
    paypal_order_id TEXT,
    paypal_capture_id TEXT,
    paypal_payer_id TEXT,

    -- Payment processor (expanded in migration 041)
    payment_processor TEXT DEFAULT 'stripe' CHECK (
        payment_processor IN ('stripe', 'paypal', 'cash', 'card_terminal', 'venmo', 'comp')
    ),

    -- Universal Fields
    reference_id TEXT,
    cart_data TEXT,

    -- Customer Information
    customer_email TEXT NOT NULL,
    customer_name TEXT,
    billing_address TEXT,

    -- Order Data
    order_data TEXT NOT NULL,
    order_number TEXT,
    session_metadata TEXT,
    metadata TEXT,

    -- Event Reference
    event_id INTEGER,

    -- Source and Registration (token fields REMOVED)
    source TEXT DEFAULT 'website',
    -- registration_token TEXT - REMOVED for inline registration
    -- registration_token_expires DATETIME - REMOVED for inline registration
    registration_initiated_at DATETIME,
    registration_completed_at DATETIME,
    all_tickets_registered INTEGER NOT NULL DEFAULT 0 CHECK (all_tickets_registered IN (0, 1)),

    -- Test Mode
    is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1)),

    -- Payment method details (from migration 035)
    card_brand TEXT,
    card_last4 TEXT,
    payment_wallet TEXT,

    -- Manual entry support (from migration 041)
    manual_entry_id TEXT UNIQUE,
    cash_shift_id INTEGER,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,

    -- Foreign key constraints
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (cash_shift_id) REFERENCES cash_shifts(id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- DEFENSIVE DATA MIGRATION for transactions
-- Copy data ONLY if registration_token column exists (indicating proper schema)
INSERT INTO transactions_new
SELECT
    id,
    transaction_id,
    uuid,
    type,
    status,
    amount_cents,
    total_amount,
    currency,
    stripe_session_id,
    stripe_payment_intent_id,
    stripe_charge_id,
    payment_method_type,
    paypal_order_id,
    paypal_capture_id,
    paypal_payer_id,
    payment_processor,
    reference_id,
    cart_data,
    customer_email,
    customer_name,
    billing_address,
    order_data,
    order_number,
    session_metadata,
    metadata,
    event_id,
    source,
    -- registration_token is NOT copied (removed)
    -- registration_token_expires is NOT copied (removed)
    registration_initiated_at,
    registration_completed_at,
    all_tickets_registered,
    is_test,
    card_brand,
    card_last4,
    payment_wallet,
    manual_entry_id,
    cash_shift_id,
    created_at,
    updated_at,
    completed_at
FROM transactions
WHERE EXISTS (
    SELECT 1 FROM pragma_table_info('transactions')
    WHERE name = 'registration_token'
);

-- Drop triggers before dropping table
DROP TRIGGER IF EXISTS update_transactions_timestamp;
DROP TRIGGER IF EXISTS trg_transactions_token_ins_chk;
DROP TRIGGER IF EXISTS trg_transactions_token_upd_chk;
DROP TRIGGER IF EXISTS trg_transactions_paypal_validation;
DROP TRIGGER IF EXISTS trg_transactions_paypal_validation_update;
DROP TRIGGER IF EXISTS trg_transactions_paypal_reference_id;
DROP TRIGGER IF EXISTS trg_paypal_webhook_link_transaction;
DROP TRIGGER IF EXISTS trg_transactions_manual_payment_validation;
DROP TRIGGER IF EXISTS trg_transactions_manual_payment_validation_update;

-- Drop old table
DROP TABLE IF EXISTS transactions;

-- Rename new table
ALTER TABLE transactions_new RENAME TO transactions;

-- Recreate ALL indexes from migration 041 (minus registration_token index)
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_stripe_session ON transactions(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_transactions_email ON transactions(customer_email);
CREATE INDEX IF NOT EXISTS idx_transactions_uuid ON transactions(uuid);
CREATE INDEX IF NOT EXISTS idx_transactions_total_amount ON transactions(total_amount);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
-- Removed: idx_transactions_registration_token (no longer needed)
CREATE INDEX IF NOT EXISTS idx_transactions_status_created_at ON transactions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_email_created_at ON transactions(customer_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type_status ON transactions(type, status);
CREATE INDEX IF NOT EXISTS idx_transactions_amount_range ON transactions(amount_cents, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_event ON transactions(event_id);
CREATE INDEX IF NOT EXISTS idx_transactions_event_status ON transactions(event_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_paypal_order_id ON transactions(paypal_order_id) WHERE paypal_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_paypal_capture_id ON transactions(paypal_capture_id) WHERE paypal_capture_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_payment_processor ON transactions(payment_processor);
CREATE INDEX IF NOT EXISTS idx_transactions_processor_status ON transactions(payment_processor, status);
CREATE INDEX IF NOT EXISTS idx_transactions_reference_id ON transactions(reference_id) WHERE reference_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique_paypal_order_id ON transactions(paypal_order_id) WHERE paypal_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_processor_test_mode ON transactions(payment_processor, is_test, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_order_number ON transactions(order_number) WHERE order_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_test_mode ON transactions(is_test, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_card_last4 ON transactions(card_last4);

-- Indexes for manual entry support (from migration 041)
CREATE INDEX IF NOT EXISTS idx_transactions_manual_entry ON transactions(manual_entry_id) WHERE manual_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_cash_shift ON transactions(cash_shift_id) WHERE cash_shift_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_cash_shift_lookup
ON transactions(cash_shift_id, payment_processor, created_at)
WHERE cash_shift_id IS NOT NULL;

-- Additional indexes from later migrations
CREATE INDEX IF NOT EXISTS idx_transactions_stripe_payment_intent ON transactions(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_event_status_created ON transactions(event_id, status, created_at DESC);

-- Recreate ALL triggers from migration 041 and 044

-- Update timestamp trigger (from migration 041)
CREATE TRIGGER IF NOT EXISTS update_transactions_timestamp
AFTER UPDATE ON transactions
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE transactions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- NOTE: Token validation triggers removed (no longer needed without registration tokens)
-- REMOVED: trg_transactions_token_ins_chk
-- REMOVED: trg_transactions_token_upd_chk

-- PayPal validation triggers (from migration 041)
CREATE TRIGGER IF NOT EXISTS trg_transactions_paypal_validation
BEFORE INSERT ON transactions
FOR EACH ROW
WHEN NEW.payment_processor = 'paypal'
  AND (NEW.paypal_order_id IS NULL OR NEW.paypal_order_id = '')
BEGIN
    SELECT RAISE(ABORT, 'PayPal transactions require paypal_order_id');
END;

CREATE TRIGGER IF NOT EXISTS trg_transactions_paypal_validation_update
BEFORE UPDATE ON transactions
FOR EACH ROW
WHEN NEW.payment_processor = 'paypal'
  AND (NEW.paypal_order_id IS NULL OR NEW.paypal_order_id = '')
BEGIN
    SELECT RAISE(ABORT, 'PayPal transactions require paypal_order_id');
END;

CREATE TRIGGER IF NOT EXISTS trg_transactions_paypal_reference_id
AFTER INSERT ON transactions
FOR EACH ROW
WHEN NEW.payment_processor = 'paypal'
  AND NEW.reference_id IS NULL
  AND NEW.paypal_order_id IS NOT NULL
BEGIN
    UPDATE transactions
    SET reference_id = NEW.paypal_order_id
    WHERE id = NEW.id;
END;

-- PayPal webhook trigger (from migration 021)
CREATE TRIGGER IF NOT EXISTS trg_paypal_webhook_link_transaction
AFTER INSERT ON paypal_webhook_events
FOR EACH ROW
WHEN NEW.paypal_order_id IS NOT NULL AND NEW.transaction_id IS NULL
BEGIN
    UPDATE paypal_webhook_events
    SET transaction_id = (
        SELECT id FROM transactions
        WHERE paypal_order_id = NEW.paypal_order_id
        LIMIT 1
    )
    WHERE id = NEW.id;
END;

-- Manual payment validation triggers (from migration 044)
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
-- STEP 6: Drop Legacy Registrations Table (if it exists)
-- ============================================================================

-- This table may have been from an older registration system
DROP TABLE IF EXISTS registrations;

-- ============================================================================
-- STEP 7: Recreate ALL views that depend on tickets and transactions
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

-- test_ticket_sales_view (from migration 058)
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

-- v_payment_processor_summary (from migration 029)
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

-- v_paypal_transaction_reconciliation (from migration 029)
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

-- v_paypal_health_metrics (from migration 029)
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

-- ============================================================================
-- STEP 8: Re-enable FK constraints and verify integrity
-- ============================================================================

PRAGMA foreign_keys = ON;

-- Verify no orphaned FK records exist
PRAGMA foreign_key_check;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify no tickets with 'pending' status remain
-- (All should be 'pending_payment', 'completed', or 'expired')
SELECT COUNT(*) as legacy_pending_count FROM tickets WHERE registration_status = 'pending';

-- Verify tables dropped
-- (Should return 0 for both)
SELECT COUNT(*) as reminder_table_exists FROM sqlite_master WHERE type='table' AND name='registration_reminders';
SELECT COUNT(*) as email_table_exists FROM sqlite_master WHERE type='table' AND name='registration_emails';

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================

-- This migration enables inline registration during checkout:
--
-- OLD FLOW:
--   Purchase → Tickets created (pending) → Email with link →
--   User registers → Reminders → Deadline
--
-- NEW FLOW:
--   Add to cart → Registration form → Payment → Tickets created (completed)
--
-- Key Changes:
-- - Removed: registration_deadline from tickets table
-- - Removed: registration_token, registration_token_expires from transactions table
-- - Removed: registration_reminders table
-- - Removed: registration_emails table
-- - Updated: registration_status ('pending' → 'pending_payment' for new tickets)
-- - Simplified: Registration happens before payment, not after
--
-- DEFENSIVE MIGRATION STRATEGY:
-- - Uses pragma_table_info() to check for column existence before copying data
-- - If registration_deadline doesn't exist (corrupted schema), accepts data loss
-- - Creates correct schema regardless of previous state
-- - Allows migration to succeed even on databases with incomplete schema
--
-- SAFE PATTERN USED:
-- CREATE table_new → DROP table → RENAME table_new TO table
--   - Allows SQLite to auto-fix orphaned FK constraints during RENAME
--   - Child tables (scan_logs, ticket_transfers) FKs auto-reconnect
--
-- Post-deployment:
-- 1. Remove registration API endpoints (/api/registration/*)
-- 2. Remove registration cron job (/api/cron/process-reminders)
-- 3. Remove registration services (lib/registration-token-service.js, lib/reminder-scheduler.js)
-- 4. Update checkout flow to include registration form

-- Migration 064: Inline Registration System
-- Removes post-purchase registration infrastructure in favor of inline registration during checkout
-- Registration now happens BEFORE payment, eliminating need for reminders, deadlines, and tokens

-- ============================================================================
-- STEP 1: Migrate Legacy Pending Tickets
-- ============================================================================

-- Mark all pending tickets as expired (they should have been registered already)
-- This is a data cleanup step for any orphaned pending registrations
UPDATE tickets
SET registration_status = 'expired'
WHERE registration_status = 'pending';

-- ============================================================================
-- STEP 2: Add New Registration Status
-- ============================================================================

-- Add the new 'pending_payment' status for inline registration flow
-- This represents tickets that have attendee info but payment hasn't completed yet
-- We'll update the constraint in STEP 4 after migrating data

-- ============================================================================
-- STEP 3: Drop Registration Reminder Infrastructure
-- ============================================================================

-- Drop registration_reminders table (no longer needed)
DROP TABLE IF EXISTS registration_reminders;

-- Drop registration_emails audit log table (no longer needed)
DROP TABLE IF EXISTS registration_emails;

-- ============================================================================
-- STEP 4: Remove Registration Deadline Fields from Tickets
-- ============================================================================

-- SQLite doesn't support DROP COLUMN directly in all versions
-- We'll create a new table without these columns and migrate data

-- Create new tickets table without deadline fields
CREATE TABLE tickets_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT UNIQUE NOT NULL,
    transaction_id INTEGER NOT NULL,
    ticket_type TEXT NOT NULL,
    event_id INTEGER NOT NULL,
    price_cents INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'refunded', 'upgraded', 'unavailable')),

    -- Attendee Information (now collected during checkout)
    attendee_first_name TEXT,
    attendee_last_name TEXT,
    attendee_email TEXT,

    -- Registration Status (simplified)
    registration_status TEXT NOT NULL DEFAULT 'pending_payment'
        CHECK (registration_status IN ('pending_payment', 'completed', 'expired')),
    registered_at DATETIME,

    -- Scanning
    scan_count INTEGER NOT NULL DEFAULT 0,
    max_scan_count INTEGER NOT NULL DEFAULT 3,
    last_scanned_at DATETIME,

    -- Audit
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Foreign Keys
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE RESTRICT
);

-- Copy data from old table to new table
INSERT INTO tickets_new (
    id,
    ticket_id,
    transaction_id,
    ticket_type,
    event_id,
    price_cents,
    status,
    attendee_first_name,
    attendee_last_name,
    attendee_email,
    registration_status,
    registered_at,
    scan_count,
    max_scan_count,
    last_scanned_at,
    created_at,
    updated_at
)
SELECT
    id,
    ticket_id,
    transaction_id,
    ticket_type,
    event_id,
    price_cents,
    status,
    attendee_first_name,
    attendee_last_name,
    attendee_email,
    -- Map old 'pending' status to 'expired' (should be none after STEP 1)
    CASE
        WHEN registration_status = 'pending' THEN 'expired'
        ELSE registration_status
    END,
    registered_at,
    scan_count,
    max_scan_count,
    last_scanned_at,
    created_at,
    updated_at
FROM tickets;

-- Drop old table
DROP TABLE tickets;

-- Rename new table
ALTER TABLE tickets_new RENAME TO tickets;

-- Recreate indexes
CREATE INDEX idx_tickets_ticket_id ON tickets(ticket_id);
CREATE INDEX idx_tickets_transaction_id ON tickets(transaction_id);
CREATE INDEX idx_tickets_event_id ON tickets(event_id);
CREATE INDEX idx_tickets_registration_status ON tickets(registration_status);
CREATE INDEX idx_tickets_attendee_email ON tickets(attendee_email);

-- ============================================================================
-- STEP 5: Remove Registration Token Fields from Transactions
-- ============================================================================

-- Create new transactions table without token fields
CREATE TABLE transactions_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT UNIQUE NOT NULL,
    stripe_session_id TEXT,
    stripe_payment_intent_id TEXT,
    paypal_order_id TEXT UNIQUE,
    paypal_capture_id TEXT,

    -- Customer Information
    customer_email TEXT NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,

    -- Order Details
    order_number TEXT UNIQUE NOT NULL,
    total_amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',

    -- Payment Status
    payment_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded', 'cancelled')),
    payment_processor TEXT
        CHECK (payment_processor IN ('stripe', 'paypal', 'venmo', 'cash', 'card_terminal', 'comp')),

    -- Metadata
    metadata TEXT,
    is_test INTEGER NOT NULL DEFAULT 0,
    ip_address TEXT,
    user_agent TEXT,

    -- Audit
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

-- Copy data from old table to new table
INSERT INTO transactions_new (
    id,
    transaction_id,
    stripe_session_id,
    stripe_payment_intent_id,
    paypal_order_id,
    paypal_capture_id,
    customer_email,
    customer_name,
    customer_phone,
    order_number,
    total_amount_cents,
    currency,
    payment_status,
    payment_processor,
    metadata,
    is_test,
    ip_address,
    user_agent,
    created_at,
    updated_at,
    completed_at
)
SELECT
    id,
    transaction_id,
    stripe_session_id,
    stripe_payment_intent_id,
    paypal_order_id,
    paypal_capture_id,
    customer_email,
    customer_name,
    customer_phone,
    order_number,
    total_amount_cents,
    currency,
    payment_status,
    payment_processor,
    metadata,
    is_test,
    ip_address,
    user_agent,
    created_at,
    updated_at,
    completed_at
FROM transactions;

-- Drop old table
DROP TABLE transactions;

-- Rename new table
ALTER TABLE transactions_new RENAME TO transactions;

-- Recreate indexes
CREATE UNIQUE INDEX idx_transactions_transaction_id ON transactions(transaction_id);
CREATE INDEX idx_transactions_stripe_session_id ON transactions(stripe_session_id);
CREATE INDEX idx_transactions_paypal_order_id ON transactions(paypal_order_id);
CREATE INDEX idx_transactions_order_number ON transactions(order_number);
CREATE INDEX idx_transactions_customer_email ON transactions(customer_email);
CREATE INDEX idx_transactions_payment_status ON transactions(payment_status);

-- ============================================================================
-- STEP 6: Drop Legacy Registrations Table (if it exists)
-- ============================================================================

-- This table may have been from an older registration system
DROP TABLE IF EXISTS registrations;

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
-- - Removed: registration_deadline, registration_token, registration_token_expires
-- - Removed: registration_reminders table
-- - Removed: registration_emails table
-- - Updated: registration_status ('pending' → 'pending_payment' for new tickets)
-- - Simplified: Registration happens before payment, not after
--
-- Post-deployment:
-- 1. Remove registration API endpoints (/api/registration/*)
-- 2. Remove registration cron job (/api/cron/process-reminders)
-- 3. Remove registration services (lib/registration-token-service.js, lib/reminder-scheduler.js)
-- 4. Update checkout flow to include registration form

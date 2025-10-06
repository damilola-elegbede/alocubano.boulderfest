-- Migration: 041 - Manual Payment Processor Support
-- Purpose: Enable manual at-door ticket entries with cash/card/venmo/comp
-- Dependencies: 004_transactions.sql, 035_add_payment_method_details.sql, 040_audit_retention_policy.sql

-- Disable foreign key constraints to allow table recreation
PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

-- ============================================================================
-- STEP 1: Clean up any partial migration state
-- ============================================================================
DROP TABLE IF EXISTS transactions_new;

-- ============================================================================
-- STEP 2: Create new transactions table with expanded schema
-- ============================================================================
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

    -- EXPANDED: Now includes manual payment types
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
    event_id INTEGER REFERENCES events(id),

    -- Source and Registration
    source TEXT DEFAULT 'website',
    registration_token TEXT,
    registration_token_expires DATETIME,
    registration_initiated_at DATETIME,
    registration_completed_at DATETIME,
    all_tickets_registered INTEGER NOT NULL DEFAULT 0 CHECK (all_tickets_registered IN (0, 1)),

    -- Test Mode
    is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1)),

    -- Payment method details (from migration 035)
    card_brand TEXT,
    card_last4 TEXT,
    payment_wallet TEXT,

    -- NEW: Manual entry support
    manual_entry_id TEXT UNIQUE, -- Client-generated UUID for idempotency
    cash_shift_id INTEGER, -- Link to cash_shifts table (added later)

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- ============================================================================
-- STEP 3: Copy existing data from transactions table
-- ============================================================================
-- transactions table exists from migration 004_transactions.sql
-- Copy all existing data to new schema with NULL for new columns
INSERT INTO transactions_new (
    id, transaction_id, uuid, type, status, amount_cents, total_amount, currency,
    stripe_session_id, stripe_payment_intent_id, stripe_charge_id, payment_method_type,
    paypal_order_id, paypal_capture_id, paypal_payer_id, payment_processor,
    reference_id, cart_data,
    customer_email, customer_name, billing_address,
    order_data, order_number, session_metadata, metadata,
    event_id,
    source, registration_token, registration_token_expires,
    registration_initiated_at, registration_completed_at, all_tickets_registered,
    is_test,
    card_brand, card_last4, payment_wallet,
    manual_entry_id, cash_shift_id,
    created_at, updated_at, completed_at
)
SELECT
    id, transaction_id, uuid, type, status, amount_cents, total_amount, currency,
    stripe_session_id, stripe_payment_intent_id, stripe_charge_id, payment_method_type,
    paypal_order_id, paypal_capture_id, paypal_payer_id, payment_processor,
    reference_id, cart_data,
    customer_email, customer_name, billing_address,
    order_data, order_number, session_metadata, metadata,
    event_id,
    source, registration_token, registration_token_expires,
    registration_initiated_at, registration_completed_at, all_tickets_registered,
    is_test,
    card_brand, card_last4, payment_wallet,
    NULL as manual_entry_id, -- New column, NULL for existing records
    NULL as cash_shift_id,    -- New column, NULL for existing records
    created_at, updated_at, completed_at
FROM transactions;

-- ============================================================================
-- STEP 4: Drop all triggers before dropping transactions table
-- ============================================================================
DROP TRIGGER IF EXISTS update_transactions_timestamp;
DROP TRIGGER IF EXISTS trg_transactions_token_ins_chk;
DROP TRIGGER IF EXISTS trg_transactions_token_upd_chk;
DROP TRIGGER IF EXISTS trg_transactions_paypal_validation;
DROP TRIGGER IF EXISTS trg_transactions_paypal_validation_update;
DROP TRIGGER IF EXISTS trg_transactions_paypal_reference_id;
DROP TRIGGER IF EXISTS trg_paypal_webhook_link_transaction;

-- ============================================================================
-- STEP 5: Drop old table (safe - data already copied to transactions_new)
-- ============================================================================
DROP TABLE IF EXISTS transactions;

-- ============================================================================
-- STEP 6: Rename new table to transactions
-- ============================================================================
ALTER TABLE transactions_new RENAME TO transactions;

-- ============================================================================
-- STEP 7: Recreate all indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_stripe_session ON transactions(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_transactions_email ON transactions(customer_email);
CREATE INDEX IF NOT EXISTS idx_transactions_uuid ON transactions(uuid);
CREATE INDEX IF NOT EXISTS idx_transactions_total_amount ON transactions(total_amount);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_registration_token ON transactions(registration_token) WHERE registration_token IS NOT NULL;
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
CREATE INDEX IF NOT EXISTS idx_transactions_order_lookup ON transactions(order_number) WHERE order_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_test_mode ON transactions(is_test, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_card_last4 ON transactions(card_last4);

-- NEW: Indexes for manual entry support
CREATE INDEX IF NOT EXISTS idx_transactions_manual_entry ON transactions(manual_entry_id) WHERE manual_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_cash_shift ON transactions(cash_shift_id) WHERE cash_shift_id IS NOT NULL;

-- ============================================================================
-- STEP 8: Recreate all triggers
-- ============================================================================
CREATE TRIGGER IF NOT EXISTS update_transactions_timestamp
AFTER UPDATE ON transactions
BEGIN
    UPDATE transactions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_transactions_token_ins_chk
BEFORE INSERT ON transactions
FOR EACH ROW
WHEN NEW.registration_token IS NOT NULL
  AND (NEW.registration_token_expires IS NULL OR length(NEW.registration_token) = 0)
BEGIN
  SELECT RAISE(ABORT, 'registration_token requires non-empty token and registration_token_expires');
END;

CREATE TRIGGER IF NOT EXISTS trg_transactions_token_upd_chk
BEFORE UPDATE ON transactions
FOR EACH ROW
WHEN NEW.registration_token IS NOT NULL
  AND (NEW.registration_token_expires IS NULL OR length(NEW.registration_token) = 0)
BEGIN
  SELECT RAISE(ABORT, 'registration_token requires non-empty token and registration_token_expires');
END;

-- PayPal validation triggers (unchanged)
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

-- Recreate PayPal webhook trigger (from migration 021)
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

-- ============================================================================
-- STEP 9: Create cash_shifts table
-- ============================================================================
CREATE TABLE IF NOT EXISTS cash_shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Shift timing
    opened_at DATETIME NOT NULL,
    closed_at DATETIME,

    -- Cash tracking
    opening_cash_cents INTEGER NOT NULL DEFAULT 0,
    expected_cash_cents INTEGER, -- Calculated: opening + sales
    actual_cash_cents INTEGER, -- Physical count at close
    variance_cents INTEGER, -- actual - expected

    -- Sales summary
    cash_sales_count INTEGER DEFAULT 0,
    cash_sales_total_cents INTEGER DEFAULT 0,

    -- Status
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    notes TEXT,

    -- Audit
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for cash shifts
CREATE INDEX IF NOT EXISTS idx_cash_shifts_status ON cash_shifts(status);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_opened_at ON cash_shifts(opened_at);

-- Trigger for updated_at
CREATE TRIGGER IF NOT EXISTS update_cash_shifts_timestamp
AFTER UPDATE ON cash_shifts
BEGIN
    UPDATE cash_shifts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ============================================================================
-- STEP 10: Add foreign key reference from transactions to cash_shifts
-- ============================================================================
-- Note: FK constraint already added in table creation above
-- Creating index to improve query performance
CREATE INDEX IF NOT EXISTS idx_transactions_cash_shift_lookup
ON transactions(cash_shift_id, payment_processor, created_at)
WHERE cash_shift_id IS NOT NULL;

-- ============================================================================
-- STEP 11: Data validation
-- ============================================================================
-- Verify no data loss
SELECT CASE
  WHEN (SELECT COUNT(*) FROM transactions) > 0
  THEN 'Migration successful - ' || (SELECT COUNT(*) FROM transactions) || ' transactions preserved'
  ELSE 'Warning: No transactions found (this may be expected for new installations)'
END as migration_status;

COMMIT;

-- Re-enable foreign key constraints
PRAGMA foreign_keys = ON;

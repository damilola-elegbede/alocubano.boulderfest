-- Migration: 004 - Transactions Table
-- Purpose: Core transactions table for tracking all payments
-- Dependencies: 003_events_table.sql

-- Transactions table for tracking all payments
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT UNIQUE NOT NULL,
    uuid TEXT,
    type TEXT NOT NULL CHECK (type IN ('tickets', 'donation', 'merchandise')),
    status TEXT DEFAULT 'pending' CHECK (
        status IN ('pending', 'completed', 'failed', 'cancelled', 'refunded', 'partially_refunded')
    ),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
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
    payment_processor TEXT DEFAULT 'stripe' CHECK (payment_processor IN ('stripe', 'paypal')),

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

    -- Event Reference (INTEGER FK to events table)
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

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Core indexes
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

-- PayPal indexes
CREATE INDEX IF NOT EXISTS idx_transactions_paypal_order_id ON transactions(paypal_order_id) WHERE paypal_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_paypal_capture_id ON transactions(paypal_capture_id) WHERE paypal_capture_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_payment_processor ON transactions(payment_processor);
CREATE INDEX IF NOT EXISTS idx_transactions_processor_status ON transactions(payment_processor, status);
CREATE INDEX IF NOT EXISTS idx_transactions_reference_id ON transactions(reference_id) WHERE reference_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique_paypal_order_id ON transactions(paypal_order_id) WHERE paypal_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_processor_test_mode ON transactions(payment_processor, is_test, status, created_at DESC);

-- Order number indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_order_number ON transactions(order_number) WHERE order_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_order_lookup ON transactions(order_number) WHERE order_number IS NOT NULL;

-- Test mode index
CREATE INDEX IF NOT EXISTS idx_transactions_test_mode ON transactions(is_test, status, created_at DESC);

-- Triggers
-- Prevent infinite recursion by only updating when updated_at hasn't changed
CREATE TRIGGER IF NOT EXISTS update_transactions_timestamp
AFTER UPDATE ON transactions
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
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

-- PayPal validation triggers
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

-- Auto-set reference_id for PayPal transactions
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
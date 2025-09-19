-- Migration: 003 - Transactions Table
-- Purpose: Core transactions table for tracking all payments
-- Dependencies: 002_schema_migrations.sql

-- Transactions table for tracking all payments (EXACT schema from 001_core_tables.sql)
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
    stripe_session_id TEXT UNIQUE,
    stripe_payment_intent_id TEXT,
    stripe_charge_id TEXT,
    payment_method_type TEXT,
    customer_email TEXT NOT NULL,
    customer_name TEXT,
    billing_address TEXT,
    order_data TEXT NOT NULL,
    session_metadata TEXT,
    metadata TEXT,
    event_id TEXT,
    source TEXT DEFAULT 'website',
    registration_token TEXT,
    registration_token_expires DATETIME,
    registration_initiated_at DATETIME,
    registration_completed_at DATETIME,
    all_tickets_registered INTEGER NOT NULL DEFAULT 0 CHECK (all_tickets_registered IN (0, 1)),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Core indexes (EXACT from existing migrations)
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

-- Triggers (EXACT from existing migrations)
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
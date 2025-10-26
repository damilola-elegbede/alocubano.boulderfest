-- Migration 060: Remove transactions.event_id Column
-- Date: 2025-10-25
-- Purpose: Remove redundant event_id from transactions table
--
-- RATIONALE:
-- - transactions.event_id is unused in application code (verified via codebase search)
-- - The only usage was in migration 056 (one-time operation, already completed)
-- - Relationship between transactions and events is properly modeled via tickets:
--   * Transaction → Tickets (1:many)
--   * Event → Tickets (1:many)
--   * Transaction's events = SELECT DISTINCT event_id FROM tickets WHERE transaction_id = X
-- - Column breaks for multi-event transactions (13 found in production)
-- - Removing it simplifies data model with zero code impact
--
-- IMPACT:
-- - No application code changes needed (column is not referenced)
-- - Improves data integrity for multi-event transactions
-- - Reduces table size and index overhead
-- - Prevents future confusion about which event_id to use

-- Drop indexes that depend on event_id column
DROP INDEX IF EXISTS idx_transactions_event;
DROP INDEX IF EXISTS idx_transactions_event_status;

-- SQLite doesn't support DROP COLUMN directly in older versions
-- We need to recreate the table without the event_id column
-- This is the safe approach for production SQLite databases

-- Step 1: Create new transactions table without event_id
CREATE TABLE transactions_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    stripe_payment_intent_id TEXT UNIQUE,
    stripe_session_id TEXT,

    -- Transaction Details
    total_amount INTEGER NOT NULL,
    currency TEXT DEFAULT 'USD',
    status TEXT DEFAULT 'pending' CHECK (
        status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded')
    ),

    -- Payment Method Details
    payment_method TEXT CHECK (
        payment_method IN ('stripe', 'paypal', 'cash', 'check', 'bank_transfer', 'other') OR payment_method IS NULL
    ),
    card_brand TEXT,
    card_last4 TEXT,
    payment_wallet TEXT,
    payment_processor TEXT DEFAULT 'stripe',
    payment_processor_fee INTEGER DEFAULT 0,

    -- Registration Token
    registration_token TEXT,
    registration_token_expires DATETIME,

    -- Customer Information
    customer_email TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    billing_address_line1 TEXT,
    billing_address_line2 TEXT,
    billing_address_city TEXT,
    billing_address_state TEXT,
    billing_address_zip TEXT,
    billing_address_country TEXT DEFAULT 'US',

    -- Metadata
    metadata TEXT,
    notes TEXT,

    -- Tracking
    ip_address TEXT,
    user_agent TEXT,
    referrer TEXT,

    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,

    -- Test Data Flag
    is_test BOOLEAN DEFAULT FALSE
);

-- Step 2: Copy all data from old table to new table (excluding event_id)
INSERT INTO transactions_new (
    id, uuid, stripe_payment_intent_id, stripe_session_id,
    total_amount, currency, status,
    payment_method, card_brand, card_last4, payment_wallet, payment_processor, payment_processor_fee,
    registration_token, registration_token_expires,
    customer_email, customer_name, customer_phone,
    billing_address_line1, billing_address_line2, billing_address_city,
    billing_address_state, billing_address_zip, billing_address_country,
    metadata, notes,
    ip_address, user_agent, referrer,
    created_at, updated_at, completed_at,
    is_test
)
SELECT
    id, uuid, stripe_payment_intent_id, stripe_session_id,
    total_amount, currency, status,
    payment_method, card_brand, card_last4, payment_wallet, payment_processor, payment_processor_fee,
    registration_token, registration_token_expires,
    customer_email, customer_name, customer_phone,
    billing_address_line1, billing_address_line2, billing_address_city,
    billing_address_state, billing_address_zip, billing_address_country,
    metadata, notes,
    ip_address, user_agent, referrer,
    created_at, updated_at, completed_at,
    is_test
FROM transactions;

-- Step 3: Drop old table
DROP TABLE transactions;

-- Step 4: Rename new table to original name
ALTER TABLE transactions_new RENAME TO transactions;

-- Step 5: Recreate indexes (excluding event_id indexes)
CREATE INDEX IF NOT EXISTS idx_transactions_stripe_payment_intent
    ON transactions(stripe_payment_intent_id);

CREATE INDEX IF NOT EXISTS idx_transactions_stripe_session
    ON transactions(stripe_session_id);

CREATE INDEX IF NOT EXISTS idx_transactions_status
    ON transactions(status);

CREATE INDEX IF NOT EXISTS idx_transactions_email
    ON transactions(customer_email);

CREATE INDEX IF NOT EXISTS idx_transactions_created
    ON transactions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_status_created
    ON transactions(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_registration_token
    ON transactions(registration_token);

CREATE INDEX IF NOT EXISTS idx_transactions_uuid
    ON transactions(uuid);

-- Step 6: Recreate foreign key constraints via triggers
-- (SQLite doesn't enforce FK constraints in the same way, but tickets table already has the constraint)

-- Verification query (commented out, but documents expected result)
-- SELECT
--     COUNT(*) as total_transactions,
--     COUNT(DISTINCT t.id) as transactions_with_tickets,
--     (SELECT COUNT(DISTINCT tk.event_id) FROM tickets tk) as events_referenced_via_tickets
-- FROM transactions t
-- LEFT JOIN tickets tk ON tk.transaction_id = t.id;

-- Migration complete
SELECT 'transactions.event_id column removed successfully' AS status;

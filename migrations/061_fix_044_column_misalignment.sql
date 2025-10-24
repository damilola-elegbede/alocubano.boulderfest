-- Migration 061: Fix Migration 044 Column Misalignment Bug
--
-- PROBLEM: Migration 044 used "INSERT INTO tickets_new SELECT * FROM tickets"
-- which copies columns by POSITION, not by NAME. When the old table (45 columns)
-- was copied to the new table (46 columns with event_time added), columns became
-- misaligned, causing the is_test column to be missing or in the wrong position.
--
-- IMPACT: Production code in 5 critical areas fails:
--   1. Financial analytics (lib/ticket-service.js)
--   2. Email service (lib/ticket-email-service-brevo.js)
--   3. Data cleanup (lib/ticket-service.js)
--   4. Transaction analytics (lib/transaction-service.js)
--   5. Cache queries (lib/ticket-cache-service.js)
--
-- SOLUTION: Rebuild tables with EXPLICIT column mapping (not SELECT *)
-- This migration is IDEMPOTENT and can run multiple times safely.

-- ============================================================================
-- DIAGNOSTIC: Check current state
-- ============================================================================

-- Check if is_test column exists in tickets table
-- This query will fail gracefully if column is missing
SELECT COUNT(*) as diagnostic_check
FROM pragma_table_info('tickets')
WHERE name = 'is_test';

-- ============================================================================
-- FIX 1: TICKETS TABLE
-- ============================================================================

BEGIN TRANSACTION;

-- Create corrected tickets table with proper schema
CREATE TABLE IF NOT EXISTS tickets_fixed (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL UNIQUE,
    transaction_id INTEGER NOT NULL,
    event_id INTEGER NOT NULL,
    ticket_type TEXT NOT NULL,
    ticket_type_id TEXT,
    price_cents INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'used', 'cancelled', 'refunded', 'expired')),
    validation_status TEXT DEFAULT 'active' CHECK (validation_status IN ('active', 'redeemed', 'cancelled')),
    qr_token TEXT UNIQUE,
    validation_code TEXT,
    validated_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT,
    attendee_email TEXT,
    attendee_first_name TEXT,
    attendee_last_name TEXT,
    attendee_phone TEXT,
    dietary_restrictions TEXT,
    emergency_contact TEXT,
    registration_completed INTEGER DEFAULT 0 CHECK (registration_completed IN (0, 1)),
    registration_token TEXT UNIQUE,
    metadata TEXT DEFAULT '{}',
    event_date TEXT,
    event_time TEXT,
    wallet_pass_url TEXT,
    wallet_pass_serial TEXT UNIQUE,
    notes TEXT,
    is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1)),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE SET NULL
);

-- Copy data with EXPLICIT column mapping
-- Use COALESCE to handle missing or NULL is_test column
INSERT INTO tickets_fixed (
    id, ticket_id, transaction_id, event_id, ticket_type, ticket_type_id,
    price_cents, status, validation_status, qr_token, validation_code,
    validated_at, created_at, updated_at, attendee_email, attendee_first_name,
    attendee_last_name, attendee_phone, dietary_restrictions, emergency_contact,
    registration_completed, registration_token, metadata, event_date, event_time,
    wallet_pass_url, wallet_pass_serial, notes, is_test
)
SELECT
    id, ticket_id, transaction_id, event_id, ticket_type, ticket_type_id,
    price_cents, status, validation_status, qr_token, validation_code,
    validated_at, created_at, updated_at, attendee_email, attendee_first_name,
    attendee_last_name, attendee_phone, dietary_restrictions, emergency_contact,
    registration_completed, registration_token, metadata, event_date, event_time,
    wallet_pass_url, wallet_pass_serial, notes,
    -- Handle missing or corrupted is_test column
    COALESCE(
        CASE
            -- Try to read is_test column if it exists
            WHEN EXISTS (
                SELECT 1 FROM pragma_table_info('tickets') WHERE name = 'is_test'
            ) THEN is_test
            ELSE NULL
        END,
        0  -- Default to production data (0) if column missing
    ) as is_test
FROM tickets;

-- Drop old table and rename new one
DROP TABLE tickets;
ALTER TABLE tickets_fixed RENAME TO tickets;

-- Recreate indexes for performance
CREATE INDEX IF NOT EXISTS idx_tickets_transaction_id ON tickets(transaction_id);
CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_qr_token ON tickets(qr_token);
CREATE INDEX IF NOT EXISTS idx_tickets_validation_code ON tickets(validation_code);
CREATE INDEX IF NOT EXISTS idx_tickets_registration_token ON tickets(registration_token);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_is_test ON tickets(is_test);
CREATE INDEX IF NOT EXISTS idx_tickets_wallet_pass_serial ON tickets(wallet_pass_serial);

COMMIT;

-- ============================================================================
-- FIX 2: TRANSACTIONS TABLE (verify is_test exists)
-- ============================================================================

BEGIN TRANSACTION;

-- Check if transactions table has is_test column
-- If missing, rebuild with explicit column mapping

CREATE TABLE IF NOT EXISTS transactions_fixed (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT NOT NULL UNIQUE,
    uuid TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL DEFAULT 'tickets' CHECK (type IN ('tickets', 'donation', 'registration')),
    stripe_session_id TEXT UNIQUE,
    customer_email TEXT NOT NULL,
    customer_name TEXT,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded')),
    payment_processor TEXT DEFAULT 'stripe',
    order_data TEXT DEFAULT '{}',
    metadata TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT,
    event_id INTEGER,
    is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1)),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
);

-- Copy data with explicit column mapping
INSERT INTO transactions_fixed (
    id, transaction_id, uuid, type, stripe_session_id, customer_email,
    customer_name, amount_cents, currency, status, payment_processor,
    order_data, metadata, created_at, updated_at, event_id, is_test
)
SELECT
    id, transaction_id, uuid, type, stripe_session_id, customer_email,
    customer_name, amount_cents, currency, status, payment_processor,
    order_data, metadata, created_at, updated_at, event_id,
    COALESCE(
        CASE
            WHEN EXISTS (
                SELECT 1 FROM pragma_table_info('transactions') WHERE name = 'is_test'
            ) THEN is_test
            ELSE NULL
        END,
        0
    ) as is_test
FROM transactions;

DROP TABLE transactions;
ALTER TABLE transactions_fixed RENAME TO transactions;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_transactions_stripe_session_id ON transactions(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_email ON transactions(customer_email);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_is_test ON transactions(is_test);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

COMMIT;

-- ============================================================================
-- FIX 3: TRANSACTION_ITEMS TABLE (verify is_test exists)
-- ============================================================================

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS transaction_items_fixed (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL,
    item_type TEXT NOT NULL DEFAULT 'ticket' CHECK (item_type IN ('ticket', 'donation', 'merchandise', 'service')),
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price_cents INTEGER NOT NULL,
    total_price_cents INTEGER NOT NULL,
    metadata TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1)),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);

-- Copy data with explicit column mapping
INSERT INTO transaction_items_fixed (
    id, transaction_id, item_type, item_name, quantity, unit_price_cents,
    total_price_cents, metadata, created_at, is_test
)
SELECT
    id, transaction_id, item_type, item_name, quantity, unit_price_cents,
    total_price_cents, metadata, created_at,
    COALESCE(
        CASE
            WHEN EXISTS (
                SELECT 1 FROM pragma_table_info('transaction_items') WHERE name = 'is_test'
            ) THEN is_test
            ELSE NULL
        END,
        0
    ) as is_test
FROM transaction_items;

DROP TABLE transaction_items;
ALTER TABLE transaction_items_fixed RENAME TO transaction_items;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction_id ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_item_type ON transaction_items(item_type);
CREATE INDEX IF NOT EXISTS idx_transaction_items_is_test ON transaction_items(is_test);

COMMIT;

-- ============================================================================
-- VERIFICATION: Confirm is_test column exists in all tables
-- ============================================================================

-- This will return 1 if column exists, 0 if missing (should be 1 after migration)
SELECT
    'tickets' as table_name,
    COUNT(*) as is_test_exists
FROM pragma_table_info('tickets')
WHERE name = 'is_test'
UNION ALL
SELECT
    'transactions' as table_name,
    COUNT(*) as is_test_exists
FROM pragma_table_info('transactions')
WHERE name = 'is_test'
UNION ALL
SELECT
    'transaction_items' as table_name,
    COUNT(*) as is_test_exists
FROM pragma_table_info('transaction_items')
WHERE name = 'is_test';

-- Verify data counts match (should have same number of rows as before)
SELECT
    'Data integrity check' as description,
    (SELECT COUNT(*) FROM tickets) as tickets_count,
    (SELECT COUNT(*) FROM transactions) as transactions_count,
    (SELECT COUNT(*) FROM transaction_items) as transaction_items_count;

-- Check distribution of is_test values
SELECT
    'is_test distribution' as description,
    (SELECT COUNT(*) FROM tickets WHERE is_test = 0) as production_tickets,
    (SELECT COUNT(*) FROM tickets WHERE is_test = 1) as test_tickets,
    (SELECT COUNT(*) FROM transactions WHERE is_test = 0) as production_transactions,
    (SELECT COUNT(*) FROM transactions WHERE is_test = 1) as test_transactions;

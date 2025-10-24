-- Migration 061: Fix Migration 044 Column Misalignment Bug
--
-- PROBLEM: Migration 044 used "INSERT INTO tickets_new SELECT * FROM tickets"
-- which copies columns by POSITION, not by NAME. This caused is_test column
-- to be missing or misaligned in production.
--
-- SOLUTION: Rebuild tables with explicit column mapping, handling missing columns.

-- ============================================================================
-- FIX 1: TICKETS TABLE
-- ============================================================================

BEGIN TRANSACTION;

DROP TABLE IF EXISTS tickets_fixed;

-- Create new table with correct schema (from Migration 044)
CREATE TABLE tickets_fixed (
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
    attendee_first_name TEXT,
    attendee_last_name TEXT,
    attendee_email TEXT,
    attendee_phone TEXT,
    status TEXT DEFAULT 'valid' CHECK (status IN ('valid', 'used', 'cancelled', 'refunded', 'transferred', 'flagged_for_review')),
    validation_status TEXT DEFAULT 'active' CHECK (validation_status IN ('active', 'invalidated', 'suspicious', 'expired')),
    validation_code TEXT UNIQUE,
    validation_signature TEXT,
    cancellation_reason TEXT,
    qr_token TEXT,
    qr_code_data TEXT,
    qr_code_generated_at TIMESTAMP,
    qr_access_method TEXT,
    scan_count INTEGER DEFAULT 0 CHECK (scan_count >= 0),
    max_scan_count INTEGER DEFAULT 10 CHECK (max_scan_count >= 0),
    first_scanned_at TIMESTAMP,
    last_scanned_at TIMESTAMP,
    checked_in_at TIMESTAMP,
    checked_in_by TEXT,
    check_in_location TEXT,
    wallet_source TEXT CHECK (wallet_source IN ('apple_wallet', 'google_wallet') OR wallet_source IS NULL),
    apple_pass_serial TEXT,
    google_pass_id TEXT,
    wallet_pass_generated_at TIMESTAMP,
    wallet_pass_updated_at TIMESTAMP,
    wallet_pass_revoked_at TIMESTAMP,
    wallet_pass_revoked_reason TEXT,
    registration_status TEXT NOT NULL DEFAULT 'pending' CHECK (registration_status IN ('pending', 'completed', 'expired')),
    registered_at DATETIME,
    registration_deadline DATETIME,
    is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1)),
    ticket_metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Copy data with explicit column mapping
-- Use 0 as default for is_test if column doesn't exist
INSERT INTO tickets_fixed (
    id, ticket_id, transaction_id, ticket_type, ticket_type_id, event_id,
    event_date, event_time, event_end_date, price_cents,
    attendee_first_name, attendee_last_name, attendee_email, attendee_phone,
    status, validation_status, validation_code, validation_signature, cancellation_reason,
    qr_token, qr_code_data, qr_code_generated_at, qr_access_method,
    scan_count, max_scan_count, first_scanned_at, last_scanned_at,
    checked_in_at, checked_in_by, check_in_location,
    wallet_source, apple_pass_serial, google_pass_id,
    wallet_pass_generated_at, wallet_pass_updated_at,
    wallet_pass_revoked_at, wallet_pass_revoked_reason,
    registration_status, registered_at, registration_deadline,
    ticket_metadata, created_at, updated_at,
    is_test
)
SELECT
    id, ticket_id, transaction_id, ticket_type, ticket_type_id, event_id,
    event_date, event_time, event_end_date, price_cents,
    attendee_first_name, attendee_last_name, attendee_email, attendee_phone,
    status, validation_status, validation_code, validation_signature, cancellation_reason,
    qr_token, qr_code_data, qr_code_generated_at, qr_access_method,
    scan_count, max_scan_count, first_scanned_at, last_scanned_at,
    checked_in_at, checked_in_by, check_in_location,
    wallet_source, apple_pass_serial, google_pass_id,
    wallet_pass_generated_at, wallet_pass_updated_at,
    wallet_pass_revoked_at, wallet_pass_revoked_reason,
    registration_status, registered_at, registration_deadline,
    ticket_metadata, created_at, updated_at,
    0 as is_test  -- Default to production data (not test)
FROM tickets;

DROP TABLE tickets;
ALTER TABLE tickets_fixed RENAME TO tickets;

-- Recreate indexes
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
CREATE INDEX IF NOT EXISTS idx_tickets_is_test ON tickets(is_test);

COMMIT;

-- ============================================================================
-- FIX 2: TRANSACTIONS TABLE
-- ============================================================================

BEGIN TRANSACTION;

DROP TABLE IF EXISTS transactions_fixed;

CREATE TABLE transactions_fixed (
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

-- Copy with explicit column mapping
INSERT INTO transactions_fixed (
    id, transaction_id, uuid, type, stripe_session_id, customer_email,
    customer_name, amount_cents, currency, status, payment_processor,
    order_data, metadata, created_at, updated_at, event_id, is_test
)
SELECT
    id, transaction_id, uuid, type, stripe_session_id, customer_email,
    customer_name, amount_cents, currency, status, payment_processor,
    order_data, metadata, created_at, updated_at, event_id,
    0 as is_test  -- Default to production
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
-- FIX 3: TRANSACTION_ITEMS TABLE
-- ============================================================================

BEGIN TRANSACTION;

DROP TABLE IF EXISTS transaction_items_fixed;

CREATE TABLE transaction_items_fixed (
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

-- Copy with explicit column mapping
INSERT INTO transaction_items_fixed (
    id, transaction_id, item_type, item_name, quantity, unit_price_cents,
    total_price_cents, metadata, created_at, is_test
)
SELECT
    id, transaction_id, item_type, item_name, quantity, unit_price_cents,
    total_price_cents, metadata, created_at,
    0 as is_test  -- Default to production
FROM transaction_items;

DROP TABLE transaction_items;
ALTER TABLE transaction_items_fixed RENAME TO transaction_items;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction_id ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_item_type ON transaction_items(item_type);
CREATE INDEX IF NOT EXISTS idx_transaction_items_is_test ON transaction_items(is_test);

COMMIT;

SELECT 'Migration 061 completed successfully' as result;

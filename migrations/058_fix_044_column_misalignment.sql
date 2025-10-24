-- Migration 058: Fix Migration 044 Column Misalignment Bug
--
-- PROBLEM: Migration 044 used "INSERT INTO tickets_new SELECT * FROM tickets"
-- which copies columns by POSITION, not by NAME. This caused is_test column
-- to be missing or misaligned in production.
--
-- SOLUTION: Rebuild tables with explicit column mapping to ensure correct alignment.
--
-- NOTE: Transaction control is handled automatically by the migration system.
-- Do not include BEGIN TRANSACTION or COMMIT statements.
--
-- IMPORTANT: We must disable foreign key checks during table recreation because
-- tickets, transactions, and transaction_items all have FK relationships.
-- This follows the same pattern as Migration 044.

-- Disable foreign key checks during table recreation
PRAGMA foreign_keys = OFF;

-- ============================================================================
-- FIX 1: TICKETS TABLE
-- ============================================================================

-- Drop views that depend on tickets table (from Migration 044)
DROP VIEW IF EXISTS v_data_mode_statistics;
DROP VIEW IF EXISTS v_test_data_cleanup_candidates;
DROP VIEW IF EXISTS test_ticket_sales_view;

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
-- This ensures is_test column is correctly aligned regardless of source table column order
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
    COALESCE(is_test, 0) as is_test  -- Handle missing or NULL is_test column
FROM tickets;

-- Only drop if tickets exists
DROP TABLE IF EXISTS tickets;
-- Rename tickets_fixed to tickets
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

-- ============================================================================
-- FIX 2: TRANSACTIONS TABLE
-- ============================================================================

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
    COALESCE(is_test, 0) as is_test  -- Handle missing or NULL is_test column
FROM transactions;

DROP TABLE IF EXISTS transactions;
ALTER TABLE transactions_fixed RENAME TO transactions;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_transactions_stripe_session_id ON transactions(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_email ON transactions(customer_email);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_is_test ON transactions(is_test);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

-- ============================================================================
-- FIX 3: TRANSACTION_ITEMS TABLE
-- ============================================================================

DROP TABLE IF EXISTS transaction_items_fixed;

CREATE TABLE transaction_items_fixed (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL CHECK (item_type IN ('ticket', 'donation', 'merchandise')),
    item_name TEXT NOT NULL,
    item_description TEXT,
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    quantity INTEGER DEFAULT 1 CHECK (quantity > 0),
    total_price_cents INTEGER NOT NULL CHECK (total_price_cents >= 0),
    ticket_type TEXT,
    event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
    donation_category TEXT,
    sku TEXT,
    product_metadata TEXT,
    fulfillment_status TEXT DEFAULT 'pending' CHECK (
        fulfillment_status IN ('pending', 'fulfilled', 'cancelled', 'refunded')
    ),
    fulfilled_at TIMESTAMP,
    is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1)),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Copy with explicit column mapping (matching Migration 044 schema)
INSERT INTO transaction_items_fixed (
    id, transaction_id, item_type, item_name, item_description,
    unit_price_cents, quantity, total_price_cents,
    ticket_type, event_id, donation_category, sku, product_metadata,
    fulfillment_status, fulfilled_at,
    created_at, is_test
)
SELECT
    id, transaction_id, item_type, item_name, item_description,
    unit_price_cents, quantity, total_price_cents,
    ticket_type, event_id, donation_category, sku, product_metadata,
    fulfillment_status, fulfilled_at,
    created_at,
    COALESCE(is_test, 0) as is_test  -- Handle missing or NULL is_test column
FROM transaction_items;

DROP TABLE IF EXISTS transaction_items;
ALTER TABLE transaction_items_fixed RENAME TO transaction_items;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction_id ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_item_type ON transaction_items(item_type);
CREATE INDEX IF NOT EXISTS idx_transaction_items_is_test ON transaction_items(is_test);

-- Re-enable foreign key checks
PRAGMA foreign_keys = ON;

SELECT 'Migration 058 completed successfully' as result;

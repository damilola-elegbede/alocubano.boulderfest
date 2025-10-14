-- Migration: 005 - Tickets Table
-- Purpose: Core tickets table with comprehensive schema
-- Dependencies: 003_events_table.sql, 004_transactions.sql

-- Tickets table
CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT UNIQUE NOT NULL,
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
    ticket_type TEXT NOT NULL,
    ticket_type_id TEXT,  -- FK added later in migration 022
    event_id INTEGER NOT NULL REFERENCES events(id),
    event_date DATE,
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
    max_scan_count INTEGER DEFAULT 3 CHECK (max_scan_count >= 0),
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

    -- Registration
    registration_status TEXT NOT NULL DEFAULT 'pending' CHECK (registration_status IN ('pending', 'completed', 'expired')),
    registered_at DATETIME,
    registration_deadline DATETIME,

    -- Test Mode
    is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1)),

    -- Metadata and Timestamps
    ticket_metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ALL indexes
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
CREATE INDEX IF NOT EXISTS idx_tickets_flagged_review ON tickets(status, created_at DESC) WHERE status = 'flagged_for_review';
CREATE INDEX IF NOT EXISTS idx_tickets_event_status ON tickets(event_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_event_type ON tickets(event_id, ticket_type);
CREATE INDEX IF NOT EXISTS idx_tickets_test_mode ON tickets(is_test, status, created_at DESC);

-- Trigger
-- Prevent infinite recursion by only updating when updated_at hasn't changed
CREATE TRIGGER IF NOT EXISTS update_tickets_timestamp
AFTER UPDATE ON tickets
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
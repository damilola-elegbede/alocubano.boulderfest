-- Migration: 007 - Tickets Table
-- Purpose: Core tickets table with comprehensive schema
-- Dependencies: 003_transactions.sql

-- Tickets table (EXACT schema from 019_tickets_table.sql)
CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT UNIQUE NOT NULL,
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
    ticket_type TEXT NOT NULL,
    event_id TEXT NOT NULL,
    event_date DATE,
    price_cents INTEGER NOT NULL,
    attendee_first_name TEXT,
    attendee_last_name TEXT,
    attendee_email TEXT,
    attendee_phone TEXT,
    status TEXT DEFAULT 'valid' CHECK (
        status IN ('valid', 'used', 'cancelled', 'refunded', 'transferred')
    ),
    validation_code TEXT UNIQUE,
    cancellation_reason TEXT,
    qr_token TEXT,
    qr_code_generated_at TIMESTAMP,
    scan_count INTEGER DEFAULT 0 CHECK (scan_count >= 0),
    max_scan_count INTEGER DEFAULT 10 CHECK (max_scan_count >= 0),
    first_scanned_at TIMESTAMP,
    last_scanned_at TIMESTAMP,
    qr_access_method TEXT,
    wallet_source TEXT CHECK (wallet_source IN ('apple_wallet', 'google_wallet') OR wallet_source IS NULL),
    registration_status TEXT NOT NULL DEFAULT 'pending' CHECK (registration_status IN ('pending', 'completed', 'expired')),
    registered_at DATETIME,
    registration_deadline DATETIME,
    validation_signature TEXT,
    qr_code_data TEXT,
    apple_pass_serial TEXT,
    google_pass_id TEXT,
    wallet_pass_generated_at TIMESTAMP,
    wallet_pass_updated_at TIMESTAMP,
    wallet_pass_revoked_at TIMESTAMP,
    wallet_pass_revoked_reason TEXT,
    checked_in_at TIMESTAMP,
    checked_in_by TEXT,
    check_in_location TEXT,
    ticket_metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ALL indexes from 019_tickets_table.sql (EXACT)
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
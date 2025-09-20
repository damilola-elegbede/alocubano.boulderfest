-- Migration: 009 - Wallet Passes Table
-- Purpose: Wallet pass integration for Apple/Google wallets
-- Dependencies: 007_tickets.sql

-- Wallet passes table (EXACT schema from 001_core_tables.sql)
CREATE TABLE IF NOT EXISTS wallet_passes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL,
    pass_type TEXT NOT NULL CHECK (pass_type IN ('apple', 'google')),
    serial_number TEXT UNIQUE NOT NULL,
    auth_token TEXT NOT NULL,
    device_id TEXT,
    push_token TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMP
);

-- Indexes for wallet passes
CREATE INDEX IF NOT EXISTS idx_wallet_passes_ticket ON wallet_passes(ticket_id);

-- Triggers (EXACT from 001_core_tables.sql)
CREATE TRIGGER IF NOT EXISTS update_wallet_passes_timestamp
AFTER UPDATE ON wallet_passes
BEGIN
    UPDATE wallet_passes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
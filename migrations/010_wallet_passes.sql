-- Migration: 010 - Wallet Passes Table
-- Purpose: Apple/Google Wallet pass tracking
-- Dependencies: 005_tickets.sql

-- Wallet passes table
CREATE TABLE IF NOT EXISTS wallet_passes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL,
    pass_type TEXT CHECK (pass_type IN ('apple', 'google')),
    pass_serial TEXT UNIQUE,
    pass_url TEXT,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
    metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wallet_passes_ticket ON wallet_passes(ticket_id);
CREATE INDEX IF NOT EXISTS idx_wallet_passes_serial ON wallet_passes(pass_serial);
CREATE INDEX IF NOT EXISTS idx_wallet_passes_type ON wallet_passes(pass_type);
-- Migration: 010 - Wallet Pass Events Table
-- Purpose: Wallet pass events tracking for Apple/Google wallet interactions
-- Dependencies: 007_tickets.sql

-- Wallet pass events table (EXACT schema from 019_tickets_table.sql)
CREATE TABLE IF NOT EXISTS wallet_pass_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
    pass_type TEXT CHECK (pass_type IN ('apple', 'google')),
    event_type TEXT CHECK (event_type IN ('created', 'updated', 'downloaded', 'installed', 'removed', 'revoked')),
    event_data TEXT, -- JSON
    device_info TEXT,
    ip_address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for wallet pass events
CREATE INDEX IF NOT EXISTS idx_wallet_pass_events_ticket_id ON wallet_pass_events(ticket_id);
CREATE INDEX IF NOT EXISTS idx_wallet_pass_events_type ON wallet_pass_events(pass_type, event_type);
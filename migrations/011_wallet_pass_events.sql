-- Migration: 011 - Wallet Pass Events Table
-- Purpose: Track wallet pass lifecycle events
-- Dependencies: 010_wallet_passes.sql

-- Wallet pass events table
CREATE TABLE IF NOT EXISTS wallet_pass_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pass_serial TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_data TEXT,
    device_library_id TEXT,
    push_token TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wallet_pass_events_serial ON wallet_pass_events(pass_serial);
CREATE INDEX IF NOT EXISTS idx_wallet_pass_events_type ON wallet_pass_events(event_type);
CREATE INDEX IF NOT EXISTS idx_wallet_pass_events_created_at ON wallet_pass_events(created_at);
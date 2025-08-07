-- Migration: Add wallet pass tracking fields to tickets table
-- Date: 2025-01-07
-- Description: Add support for Apple Wallet and Google Wallet pass generation

-- Add wallet pass tracking fields to tickets table
ALTER TABLE tickets ADD COLUMN apple_pass_serial TEXT;
ALTER TABLE tickets ADD COLUMN google_pass_id TEXT;
ALTER TABLE tickets ADD COLUMN wallet_pass_generated_at TIMESTAMP;
ALTER TABLE tickets ADD COLUMN wallet_pass_updated_at TIMESTAMP;
ALTER TABLE tickets ADD COLUMN wallet_pass_revoked_at TIMESTAMP;
ALTER TABLE tickets ADD COLUMN wallet_pass_revoked_reason TEXT;

-- Create wallet pass events table for tracking updates
CREATE TABLE IF NOT EXISTS wallet_pass_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
    pass_type TEXT CHECK (pass_type IN ('apple', 'google')),
    event_type TEXT CHECK (event_type IN ('created', 'updated', 'downloaded', 'installed', 'removed', 'revoked')),
    event_data TEXT, -- JSON
    device_info TEXT,
    ip_address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (ticket_id) REFERENCES tickets(id)
);

-- Create indexes for performance (including uniqueness)
CREATE UNIQUE INDEX idx_tickets_apple_pass_serial ON tickets(apple_pass_serial);
CREATE UNIQUE INDEX idx_tickets_google_pass_id ON tickets(google_pass_id);
CREATE INDEX idx_wallet_pass_events_ticket_id ON wallet_pass_events(ticket_id);
CREATE INDEX idx_wallet_pass_events_type ON wallet_pass_events(pass_type, event_type);
-- Migration: 036 - Update Wallet Pass Events Schema
-- Purpose: Add ticket_id and pass_type columns for enhanced pass tracking
-- Dependencies: 011_wallet_pass_events.sql

-- Add ticket_id column (references tickets.id)
ALTER TABLE wallet_pass_events ADD COLUMN ticket_id INTEGER;

-- Add pass_type column to distinguish between apple/google passes
ALTER TABLE wallet_pass_events ADD COLUMN pass_type TEXT;

-- Add index on ticket_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_wallet_pass_events_ticket_id ON wallet_pass_events(ticket_id);

-- Add index on pass_type for filtering
CREATE INDEX IF NOT EXISTS idx_wallet_pass_events_pass_type ON wallet_pass_events(pass_type);

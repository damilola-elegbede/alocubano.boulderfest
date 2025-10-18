-- Migration 052: Create QR Tokens Table
-- Purpose: Enable ticket viewing via QR code tokens from confirmation emails
-- Date: 2025-10-18
-- Author: Fix for missing qr_tokens table causing "no such table" errors
-- Dependencies: 005_tickets.sql

-- ============================================================================
-- STEP 1: Create qr_tokens table
-- ============================================================================
-- This table stores temporary QR code tokens that allow users to view their
-- tickets by clicking links in confirmation emails without authentication.
--
-- Security considerations:
-- - Tokens expire after a set period (expires_at)
-- - Tokens are single-use or time-limited
-- - Each token is tied to a specific ticket_id

CREATE TABLE IF NOT EXISTS qr_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Unique token string (used in URL query parameter)
    token TEXT NOT NULL UNIQUE,

    -- Reference to ticket
    ticket_id TEXT NOT NULL,

    -- Lifecycle tracking
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME, -- NULL means no expiration
    used_at DATETIME,     -- Track when token was first used

    -- Foreign key to tickets table
    FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id) ON DELETE CASCADE
);

-- ============================================================================
-- STEP 2: Create indexes for performance
-- ============================================================================
-- Index for token lookups (most common operation)
CREATE INDEX IF NOT EXISTS idx_qr_tokens_token ON qr_tokens(token);

-- Index for ticket_id lookups (find all tokens for a ticket)
CREATE INDEX IF NOT EXISTS idx_qr_tokens_ticket_id ON qr_tokens(ticket_id);

-- Index for expiration cleanup queries
CREATE INDEX IF NOT EXISTS idx_qr_tokens_expires_at ON qr_tokens(expires_at);

-- ============================================================================
-- STEP 3: Data validation
-- ============================================================================
SELECT CASE
  WHEN EXISTS (
    SELECT 1 FROM sqlite_master
    WHERE type='table' AND name='qr_tokens'
  )
  THEN 'Migration successful - qr_tokens table created'
  ELSE 'Warning: qr_tokens table was not created'
END as migration_status;

-- Migration: 012 - Action Tokens Table
-- Purpose: Single-use security tokens for critical operations
-- Dependencies: 003_transactions.sql

-- Action tokens for single-use security-critical operations (EXACT schema from 007_token_system.sql)
CREATE TABLE IF NOT EXISTS action_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT UNIQUE NOT NULL,
    action_type TEXT NOT NULL CHECK (
        action_type IN ('transfer', 'cancel', 'refund', 'modify')
    ),
    target_id TEXT NOT NULL, -- ticket_id or transaction_id
    email TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for action tokens
CREATE INDEX IF NOT EXISTS idx_action_tokens_hash ON action_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_action_tokens_target ON action_tokens(target_id);
CREATE INDEX IF NOT EXISTS idx_action_tokens_email ON action_tokens(email);
CREATE INDEX IF NOT EXISTS idx_action_tokens_expires ON action_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_action_tokens_action_target ON action_tokens(action_type, target_id);

-- Trigger to clean up related tokens when transactions are deleted (EXACT from 007_token_system.sql)
CREATE TRIGGER IF NOT EXISTS cleanup_tokens_on_transaction_delete
    AFTER DELETE ON transactions
BEGIN
    DELETE FROM access_tokens WHERE transaction_id = OLD.id;
    DELETE FROM action_tokens WHERE target_id = CAST(OLD.id AS TEXT);
END;
-- Three-tier token system for secure ticket access
-- Phase 1: Access tokens for multi-use ticket viewing

CREATE TABLE IF NOT EXISTS access_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT UNIQUE NOT NULL,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP,
    use_count INTEGER DEFAULT 0
);

-- Phase 2: Action tokens for single-use security-critical operations
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

-- Phase 3: Add validation fields to existing tickets table for QR codes
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS validation_signature TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS qr_code_data TEXT;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_access_tokens_hash ON access_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_access_tokens_transaction ON access_tokens(transaction_id);
CREATE INDEX IF NOT EXISTS idx_access_tokens_email ON access_tokens(email);
CREATE INDEX IF NOT EXISTS idx_access_tokens_expires ON access_tokens(expires_at);

CREATE INDEX IF NOT EXISTS idx_action_tokens_hash ON action_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_action_tokens_target ON action_tokens(target_id);
CREATE INDEX IF NOT EXISTS idx_action_tokens_email ON action_tokens(email);
CREATE INDEX IF NOT EXISTS idx_action_tokens_expires ON action_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_action_tokens_action_target ON action_tokens(action_type, target_id);

-- Add indexes for validation fields
CREATE INDEX IF NOT EXISTS idx_tickets_validation_signature ON tickets(validation_signature);
CREATE INDEX IF NOT EXISTS idx_tickets_qr_code ON tickets(qr_code_data);

-- Trigger to clean up related tokens when transactions are deleted
CREATE TRIGGER IF NOT EXISTS cleanup_tokens_on_transaction_delete
    AFTER DELETE ON transactions
BEGIN
    DELETE FROM access_tokens WHERE transaction_id = OLD.id;
    DELETE FROM action_tokens WHERE target_id = CAST(OLD.id AS TEXT);
END;
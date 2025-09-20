-- Migration: 011 - Access Tokens Table
-- Purpose: Multi-use access tokens for secure ticket viewing
-- Dependencies: 003_transactions.sql

-- Access tokens for multi-use ticket viewing (EXACT schema from 007_token_system.sql)
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

-- Indexes for access tokens
CREATE INDEX IF NOT EXISTS idx_access_tokens_hash ON access_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_access_tokens_transaction ON access_tokens(transaction_id);
CREATE INDEX IF NOT EXISTS idx_access_tokens_email ON access_tokens(email);
CREATE INDEX IF NOT EXISTS idx_access_tokens_expires ON access_tokens(expires_at);
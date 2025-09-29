-- Migration: 013 - Action Tokens Table
-- Purpose: One-time action tokens (password reset, email verification)
-- Dependencies: 002_schema_migrations.sql

-- Action tokens table
CREATE TABLE IF NOT EXISTS action_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    action_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    payload TEXT,
    expires_at DATETIME NOT NULL,
    used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_action_tokens_token ON action_tokens(token);
CREATE INDEX IF NOT EXISTS idx_action_tokens_entity ON action_tokens(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_action_tokens_action_type ON action_tokens(action_type);
CREATE INDEX IF NOT EXISTS idx_action_tokens_expires_at ON action_tokens(expires_at);
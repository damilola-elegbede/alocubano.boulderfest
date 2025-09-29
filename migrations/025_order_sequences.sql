-- Migration: 025 - Order Sequences
-- Purpose: Human-friendly order numbers (ALCBF-YYYY-XXXXX / TEST-YYYY-XXXXX)
-- Dependencies: 004_transactions.sql

-- Table to track auto-increment sequences for order numbers
CREATE TABLE IF NOT EXISTS order_sequences (
    sequence_key TEXT PRIMARY KEY,             -- Format: PREFIX-YEAR (e.g., 'ALCBF-2024', 'TEST-2024')
    last_number INTEGER NOT NULL DEFAULT 0,    -- Last used sequence number
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_order_sequences_key ON order_sequences(sequence_key);

-- Initialize sequences for current and upcoming years
INSERT OR IGNORE INTO order_sequences (sequence_key, last_number) VALUES ('ALCBF-2024', 0);
INSERT OR IGNORE INTO order_sequences (sequence_key, last_number) VALUES ('TEST-2024', 89999);
INSERT OR IGNORE INTO order_sequences (sequence_key, last_number) VALUES ('ALCBF-2025', 0);
INSERT OR IGNORE INTO order_sequences (sequence_key, last_number) VALUES ('TEST-2025', 89999);
INSERT OR IGNORE INTO order_sequences (sequence_key, last_number) VALUES ('ALCBF-2026', 0);
INSERT OR IGNORE INTO order_sequences (sequence_key, last_number) VALUES ('TEST-2026', 89999);
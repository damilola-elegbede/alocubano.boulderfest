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

-- Unique index for additional safety (redundant with PRIMARY KEY but explicit)
-- Provides extra protection against duplicate sequence keys
CREATE UNIQUE INDEX IF NOT EXISTS order_sequences_sequence_key_uidx
    ON order_sequences(sequence_key);

-- Initialize sequences for current and upcoming years
-- Using NOT EXISTS pattern for maximum SQL portability (SQLite, PostgreSQL, MySQL compatibility)
INSERT INTO order_sequences (sequence_key, last_number)
SELECT 'ALCBF-2024', 0
WHERE NOT EXISTS (
  SELECT 1 FROM order_sequences WHERE sequence_key = 'ALCBF-2024'
);

INSERT INTO order_sequences (sequence_key, last_number)
SELECT 'TEST-2024', 89999
WHERE NOT EXISTS (
  SELECT 1 FROM order_sequences WHERE sequence_key = 'TEST-2024'
);

INSERT INTO order_sequences (sequence_key, last_number)
SELECT 'ALCBF-2025', 0
WHERE NOT EXISTS (
  SELECT 1 FROM order_sequences WHERE sequence_key = 'ALCBF-2025'
);

INSERT INTO order_sequences (sequence_key, last_number)
SELECT 'TEST-2025', 89999
WHERE NOT EXISTS (
  SELECT 1 FROM order_sequences WHERE sequence_key = 'TEST-2025'
);

INSERT INTO order_sequences (sequence_key, last_number)
SELECT 'ALCBF-2026', 0
WHERE NOT EXISTS (
  SELECT 1 FROM order_sequences WHERE sequence_key = 'ALCBF-2026'
);

INSERT INTO order_sequences (sequence_key, last_number)
SELECT 'TEST-2026', 89999
WHERE NOT EXISTS (
  SELECT 1 FROM order_sequences WHERE sequence_key = 'TEST-2026'
);

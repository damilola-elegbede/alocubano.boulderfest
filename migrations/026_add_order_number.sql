-- Migration: Add Order Number System
-- Adds human-friendly order IDs in format ALCBF-YYYY-XXXXX (production) or TEST-YYYY-XXXXX (test)
-- Author: A Lo Cubano Development Team
-- Date: 2024

-- ================================================================================
-- 1. CREATE ORDER SEQUENCES TABLE
-- ================================================================================

-- Table to track auto-increment sequences for order numbers
-- Separate sequences for test vs production to avoid overlap
CREATE TABLE IF NOT EXISTS order_sequences (
    sequence_key TEXT PRIMARY KEY,             -- Format: PREFIX-YEAR (e.g., 'ALCBF-2024', 'TEST-2024')
    last_number INTEGER NOT NULL DEFAULT 0,    -- Last used sequence number
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_order_sequences_key ON order_sequences(sequence_key);

-- ================================================================================
-- 2. ADD ORDER NUMBER TO TRANSACTIONS TABLE
-- ================================================================================

-- Add order_number column to transactions table
ALTER TABLE transactions ADD COLUMN order_number TEXT;

-- Add unique constraint to ensure no duplicate order numbers
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_order_number ON transactions(order_number) WHERE order_number IS NOT NULL;

-- Add index for fast order number lookups
CREATE INDEX IF NOT EXISTS idx_transactions_order_lookup ON transactions(order_number) WHERE order_number IS NOT NULL;

-- ================================================================================
-- 3. BACKFILL EXISTING TRANSACTIONS
-- ================================================================================

-- For existing transactions, use their UUID as the order number for backward compatibility
-- This ensures existing customers can still reference their orders
UPDATE transactions
SET order_number = uuid
WHERE order_number IS NULL;

-- ================================================================================
-- 4. INITIALIZE SEQUENCES FOR CURRENT YEAR
-- ================================================================================

-- Initialize production sequence for current year
INSERT OR IGNORE INTO order_sequences (sequence_key, last_number)
VALUES ('ALCBF-2024', 0);

-- Initialize test sequence for current year (starts at 90000)
INSERT OR IGNORE INTO order_sequences (sequence_key, last_number)
VALUES ('TEST-2024', 89999);

-- Initialize sequences for 2025 (upcoming year)
INSERT OR IGNORE INTO order_sequences (sequence_key, last_number)
VALUES ('ALCBF-2025', 0);

INSERT OR IGNORE INTO order_sequences (sequence_key, last_number)
VALUES ('TEST-2025', 89999);

-- Initialize sequences for 2026 (event year)
INSERT OR IGNORE INTO order_sequences (sequence_key, last_number)
VALUES ('ALCBF-2026', 0);

INSERT OR IGNORE INTO order_sequences (sequence_key, last_number)
VALUES ('TEST-2026', 89999);

-- ================================================================================
-- 5. UPDATE TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- ================================================================================

-- Trigger to update the updated_at timestamp when sequence is incremented
CREATE TRIGGER IF NOT EXISTS update_order_sequences_timestamp
AFTER UPDATE ON order_sequences
FOR EACH ROW
WHEN NEW.last_number != OLD.last_number
BEGIN
    UPDATE order_sequences
    SET updated_at = CURRENT_TIMESTAMP
    WHERE sequence_key = NEW.sequence_key;
END;

-- ================================================================================
-- 6. CREATE VIEW FOR ORDER ANALYTICS
-- ================================================================================

-- Create a view for easy order number analytics
CREATE VIEW IF NOT EXISTS order_number_analytics AS
SELECT
    t.order_number,
    t.uuid,
    t.status,
    t.amount_cents,
    t.customer_email,
    t.payment_processor,
    t.is_test,
    t.created_at,
    CASE
        WHEN t.order_number LIKE 'ALCBF-%' THEN 'production'
        WHEN t.order_number LIKE 'TEST-%' THEN 'test'
        ELSE 'legacy'
    END as order_type,
    CASE
        WHEN t.order_number LIKE 'ALCBF-____-%' THEN SUBSTR(t.order_number, 7, 4)
        WHEN t.order_number LIKE 'TEST-____-%' THEN SUBSTR(t.order_number, 6, 4)
        ELSE NULL
    END as order_year,
    CASE
        WHEN t.order_number LIKE 'ALCBF-____-%' THEN CAST(SUBSTR(t.order_number, 12) AS INTEGER)
        WHEN t.order_number LIKE 'TEST-____-%' THEN CAST(SUBSTR(t.order_number, 11) AS INTEGER)
        ELSE NULL
    END as order_sequence
FROM transactions t
WHERE t.order_number IS NOT NULL;

-- ================================================================================
-- 7. DATA INTEGRITY CONSTRAINTS
-- ================================================================================

-- Ensure order_number is set for all new transactions going forward
-- This will be enforced at the application level, but we add a check for safety
CREATE TRIGGER IF NOT EXISTS require_order_number_on_insert
BEFORE INSERT ON transactions
FOR EACH ROW
WHEN NEW.order_number IS NULL OR NEW.order_number = ''
BEGIN
    SELECT RAISE(ABORT, 'Order number is required for all new transactions');
END;

-- ================================================================================
-- Migration Complete
-- ================================================================================
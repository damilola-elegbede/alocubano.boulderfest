-- Migration 012: Fix database schema column mismatches

-- Add uuid column to transactions table
ALTER TABLE transactions ADD COLUMN uuid TEXT;

-- Add metadata column to transactions table
ALTER TABLE transactions ADD COLUMN metadata TEXT;

-- Add total_amount column to transactions table
ALTER TABLE transactions ADD COLUMN total_amount INTEGER;

-- Add cancellation_reason column to tickets table
ALTER TABLE tickets ADD COLUMN cancellation_reason TEXT;

-- Create indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_transactions_uuid ON transactions(uuid);
CREATE INDEX IF NOT EXISTS idx_transactions_total_amount ON transactions(total_amount);

-- Populate uuid with transaction_id for existing records
UPDATE transactions 
SET uuid = transaction_id 
WHERE uuid IS NULL AND transaction_id IS NOT NULL;

-- Populate metadata with session_metadata for existing records
UPDATE transactions 
SET metadata = session_metadata 
WHERE metadata IS NULL AND session_metadata IS NOT NULL;

-- Populate total_amount with amount_cents for existing records
UPDATE transactions 
SET total_amount = amount_cents 
WHERE total_amount IS NULL AND amount_cents IS NOT NULL;
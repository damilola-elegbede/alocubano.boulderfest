-- Migration 012: Fix database schema column mismatches (IDEMPOTENT)
-- Note: These columns are now defined in core tables (001_core_tables.sql and 018_tickets_table.sql)
-- This migration only handles data population for existing records

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
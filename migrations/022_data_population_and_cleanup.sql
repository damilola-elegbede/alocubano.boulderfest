-- Migration: 022 - Data Population and Cleanup
-- Purpose: Handle data migration tasks and column population from old migrations
-- Dependencies: 021_audit_framework.sql

-- Data population for existing records (EXACT from 013_fix_column_mismatches.sql)
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

-- Insert migration record for schema tracking (EXACT from 010_add_wallet_tracking.sql)
INSERT OR REPLACE INTO schema_migrations (version, applied_at, description)
VALUES ('009', datetime('now'), 'Add wallet_source column and improve qr_access_method tracking');
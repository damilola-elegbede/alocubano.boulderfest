-- Migration: 009_add_wallet_tracking.sql
-- Description: Add wallet tracking columns for analytics and access method tracking
-- Date: 2025-01-09
-- Purpose: Track wallet adoption metrics and ticket access methods for analytics dashboard
-- Rollback: See bottom of file for rollback statements

-- Note: Migration runner already handles transactions
-- BEGIN TRANSACTION; -- Removed: causes nested transaction error

-- Add wallet_source column for tracking wallet adoption
-- This column tracks which wallet service was used to add the ticket
-- Note: SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN
-- Migration runner should handle duplicate column errors gracefully
ALTER TABLE tickets ADD COLUMN wallet_source TEXT 
  CHECK (wallet_source IN ('apple_wallet', 'google_wallet') OR wallet_source IS NULL);

-- Note: qr_access_method already exists from migration 002_qr_code_system.sql
-- We need to add constraints and default value to the existing column
-- First, update any NULL values to default 'qr_code'
UPDATE tickets 
SET qr_access_method = 'qr_code' 
WHERE qr_access_method IS NULL;

-- Create performance indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_tickets_wallet_source 
  ON tickets(wallet_source) 
  WHERE wallet_source IS NOT NULL;

-- Recreate index for qr_access_method if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_tickets_qr_access_method 
  ON tickets(qr_access_method);

-- Create composite index for wallet analytics queries
CREATE INDEX IF NOT EXISTS idx_tickets_wallet_analytics 
  ON tickets(wallet_source, qr_access_method, created_at)
  WHERE wallet_source IS NOT NULL;

-- Create schema_migrations table if it doesn't exist
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  description TEXT
);

-- Insert migration record
INSERT OR REPLACE INTO schema_migrations (version, applied_at, description) 
VALUES ('009', datetime('now'), 'Add wallet_source column and improve qr_access_method tracking');

-- Verify migration by checking column existence
-- This is a safety check that will log if columns are missing
-- Note: RAISE() only works in triggers, so we'll just select and let the migration runner handle validation
SELECT 
  COUNT(*) as column_count,
  CASE 
    WHEN COUNT(*) = 2 THEN 'Migration successful'
    ELSE 'Migration verification failed: Expected 2 columns, found ' || COUNT(*)
  END as status
FROM pragma_table_info('tickets')
WHERE name IN ('wallet_source', 'qr_access_method');

-- COMMIT; -- Removed: migration runner handles transaction commit

-- ============================================================================
-- ROLLBACK PROCEDURE (Execute these statements to revert this migration)
-- ============================================================================
-- To rollback this migration, execute the following statements:
/*
BEGIN TRANSACTION;

-- Drop the indexes created by this migration
DROP INDEX IF EXISTS idx_tickets_wallet_source;
DROP INDEX IF EXISTS idx_tickets_qr_access_method;
DROP INDEX IF EXISTS idx_tickets_wallet_analytics;

-- Remove the wallet_source column
-- Note: SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
-- This is a complex operation that should be done carefully with a backup

-- Alternative approach: Just mark the migration as rolled back
DELETE FROM schema_migrations WHERE version = '009';

-- Note: We don't remove qr_access_method as it was created in migration 002

COMMIT;

-- For a complete rollback with column removal, you would need to:
-- 1. Create a backup of the tickets table
-- 2. Create a new table without wallet_source
-- 3. Copy data from old table to new table
-- 4. Drop old table and rename new table
-- This is intentionally left as a manual process for safety
*/
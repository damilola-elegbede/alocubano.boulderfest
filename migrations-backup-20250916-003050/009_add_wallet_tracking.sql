-- Migration: 009_add_wallet_tracking.sql (IDEMPOTENT)
-- Description: Wallet tracking fields and indexes are now defined in 018_tickets_table.sql
-- Date: 2025-01-09
-- Purpose: This migration now handles schema tracking and data updates only

-- Create schema_migrations table if it doesn't exist
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  description TEXT
);

-- Insert migration record
INSERT OR REPLACE INTO schema_migrations (version, applied_at, description) 
VALUES ('009', datetime('now'), 'Add wallet_source column and improve qr_access_method tracking');

-- Note: Column verification skipped as wallet_source and qr_access_method
-- are now part of the core tickets table schema in 018_tickets_table.sql

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
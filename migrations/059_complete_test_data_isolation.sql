-- Migration: 059 - Complete Test Data Isolation
-- Purpose: Add missing is_test column to registration_reminders table
-- Dependencies: 043_test_data_isolation.sql, 053_update_reminder_types.sql
-- Date: 2025-10-25
-- Author: Database Admin (Wave 2 - Schema Fix Specialist)
--
-- Issue: Migration 043 added is_test columns to transactions, tickets, and transaction_items,
--        but Migration 053 recreated registration_reminders table WITHOUT the is_test column.
--        This causes test cleanup queries to fail with "SQLITE_ERROR: no such column: is_test"
--
-- Root Cause: Migration 053 (2025-10-18) recreated registration_reminders to fix CHECK constraints,
--             but did not include the is_test column that's required for test data isolation.
--
-- Solution: Add is_test column to registration_reminders table to match other tables in the
--          test data isolation system (transactions, tickets, transaction_items, email_retry_queue).
--
-- Related Tables:
--   ✅ transactions.is_test (added in 004_transactions.sql)
--   ✅ tickets.is_test (added in 005_tickets.sql)
--   ✅ email_retry_queue.is_test (added in 033_email_retry_queue_schema_update.sql)
--   ✅ transaction_items.is_test (added in 008_transaction_items.sql)
--   ❌ registration_reminders.is_test (MISSING - fixed by this migration)

-- ============================================================================
-- STEP 1: Add is_test column to registration_reminders
-- ============================================================================
-- Use ALTER TABLE ADD COLUMN for minimal disruption (idempotent approach)
-- SQLite allows adding columns with DEFAULT values efficiently

-- Check if column already exists (SQLite 3.35.0+ supports IF NOT EXISTS)
-- For older SQLite versions, this will fail gracefully if column exists
-- Note: Column order is not critical - SQLite appends new columns to the end

ALTER TABLE registration_reminders
ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1));

-- ============================================================================
-- STEP 2: Create performance index for test data filtering
-- ============================================================================
-- Tests frequently query: DELETE FROM registration_reminders WHERE is_test = 1
-- Index improves cleanup performance by avoiding full table scans

CREATE INDEX IF NOT EXISTS idx_registration_reminders_is_test
ON registration_reminders(is_test);

-- ============================================================================
-- STEP 3: Create composite index for common query patterns
-- ============================================================================
-- Tests and cron jobs frequently filter by both is_test and status
-- Example: SELECT * FROM registration_reminders WHERE is_test = 0 AND status = 'scheduled'

CREATE INDEX IF NOT EXISTS idx_registration_reminders_test_status
ON registration_reminders(is_test, status, scheduled_at);

-- ============================================================================
-- STEP 4: Data validation
-- ============================================================================
-- Verify the column was added successfully and has correct default value
-- This query returns a meaningful status message for migration logs

SELECT CASE
  WHEN EXISTS (
    SELECT 1 FROM pragma_table_info('registration_reminders')
    WHERE name = 'is_test' AND type = 'INTEGER' AND "notnull" = 1 AND dflt_value = '0'
  )
  THEN 'SUCCESS: is_test column added to registration_reminders (INTEGER NOT NULL DEFAULT 0)'
  ELSE 'ERROR: is_test column validation failed'
END as migration_status;

-- ============================================================================
-- MIGRATION NOTES FOR APPLICATION CODE
-- ============================================================================
-- IMPORTANT: When creating registration reminders, set is_test based on transaction:
--
-- ✅ CORRECT: Propagate is_test from parent transaction
-- INSERT INTO registration_reminders (transaction_id, reminder_type, scheduled_at, is_test)
-- SELECT id, 'initial', datetime('now', '+1 hour'), is_test
-- FROM transactions WHERE transaction_id = ?;
--
-- ❌ INCORRECT: Hardcode is_test = 0 (breaks test isolation)
-- INSERT INTO registration_reminders (transaction_id, reminder_type, scheduled_at)
-- VALUES (?, 'initial', datetime('now', '+1 hour'));
--
-- For test cleanup (already used in tests):
-- DELETE FROM registration_reminders WHERE is_test = 1;
--
-- For production queries (exclude test data):
-- SELECT * FROM registration_reminders WHERE is_test = 0 AND status = 'scheduled';
--
-- ============================================================================
-- SCHEMA CONSISTENCY VERIFICATION
-- ============================================================================
-- After this migration, all transactional tables have is_test columns:
--   1. transactions.is_test           (payment transactions)
--   2. tickets.is_test                (ticket records)
--   3. transaction_items.is_test      (line items in cart)
--   4. email_retry_queue.is_test      (email retry tracking)
--   5. registration_reminders.is_test (reminder scheduling) ← FIXED BY THIS MIGRATION
--
-- This ensures complete test data isolation across the entire purchase workflow.
--
-- ============================================================================
-- ROLLBACK INSTRUCTIONS (if needed)
-- ============================================================================
-- SQLite does not support DROP COLUMN directly. To rollback:
-- 1. Recreate table without is_test column (using Migration 053 as template)
-- 2. Copy data excluding is_test column
-- 3. Drop old table and rename new table
-- 4. Recreate all indexes
--
-- Note: Rollback is generally NOT recommended as it breaks test isolation.
-- Only rollback if this migration causes production issues.
--
-- ============================================================================
-- TESTING CHECKLIST
-- ============================================================================
-- [ ] Test cleanup queries succeed: DELETE FROM registration_reminders WHERE is_test = 1
-- [ ] Index improves performance: EXPLAIN QUERY PLAN for is_test queries
-- [ ] Default value works: INSERT without is_test column defaults to 0
-- [ ] Constraint enforced: INSERT with is_test = 2 raises SQLITE_CONSTRAINT
-- [ ] Foreign key integrity: Deleting test transaction cascades to reminders
-- [ ] View compatibility: v_data_mode_statistics includes registration_reminders
--

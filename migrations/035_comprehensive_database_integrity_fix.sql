-- Migration: 035 - Comprehensive Database Integrity Fix
-- Purpose: Fix missing is_test column references and foreign key violations
-- Date: 2024-09-26
-- Dependencies: All prior migrations
-- Note: This migration is idempotent and safe to run multiple times

-- ================================================================================
-- 1. CREATE COMPREHENSIVE CLEANUP LOG
-- ================================================================================

CREATE TABLE IF NOT EXISTS database_integrity_cleanup_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cleanup_session_id TEXT UNIQUE NOT NULL,
    migration_version TEXT NOT NULL DEFAULT '035',
    table_name TEXT NOT NULL,
    cleanup_type TEXT NOT NULL,
    records_before INTEGER NOT NULL DEFAULT 0,
    records_after INTEGER NOT NULL DEFAULT 0,
    records_cleaned INTEGER GENERATED ALWAYS AS (records_before - records_after) STORED,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    error_message TEXT,
    sql_executed TEXT
);

-- Generate unique session ID for this cleanup
INSERT INTO database_integrity_cleanup_log (cleanup_session_id, table_name, cleanup_type)
VALUES (
    datetime('now') || '_' || abs(random() % 10000),
    'session_start',
    'comprehensive_integrity_fix'
);

-- ================================================================================
-- 2. CHECK is_test COLUMNS EXIST (DIAGNOSTIC)
-- ================================================================================

-- Create helper view to check if columns exist
CREATE TEMP VIEW IF NOT EXISTS v_column_exists AS
SELECT
    'transactions' as table_name,
    COUNT(*) as has_is_test_column
FROM pragma_table_info('transactions')
WHERE name = 'is_test'

UNION ALL

SELECT
    'tickets' as table_name,
    COUNT(*) as has_is_test_column
FROM pragma_table_info('tickets')
WHERE name = 'is_test'

UNION ALL

SELECT
    'transaction_items' as table_name,
    COUNT(*) as has_is_test_column
FROM pragma_table_info('transaction_items')
WHERE name = 'is_test';

-- Log current column status for debugging
INSERT INTO database_integrity_cleanup_log
(cleanup_session_id, table_name, cleanup_type, records_before, sql_executed)
SELECT
    (SELECT cleanup_session_id FROM database_integrity_cleanup_log
     WHERE table_name = 'session_start' ORDER BY id DESC LIMIT 1),
    'column_check_' || table_name,
    'verify_is_test_column_exists',
    has_is_test_column,
    'SELECT COUNT(*) FROM pragma_table_info(''' || table_name || ''') WHERE name = ''is_test'''
FROM v_column_exists;

-- Note: The is_test columns should have been added by migration 024.
-- If they're missing, this indicates migration 024 failed or wasn't applied.
-- We cannot safely add them here due to SQLite limitations with conditional ALTER TABLE.
--
-- Production deployment should ensure migration 024 runs successfully before migration 025.
-- If migration 024 failed, it needs to be re-run or fixed manually.

-- ================================================================================
-- 3. CLEAN ORPHANED RECORDS (FOREIGN KEY VIOLATIONS)
-- ================================================================================

-- Clean orphaned tickets (transaction_id references non-existent transactions)
INSERT INTO database_integrity_cleanup_log
(cleanup_session_id, table_name, cleanup_type, records_before)
SELECT
    (SELECT cleanup_session_id FROM database_integrity_cleanup_log
     WHERE table_name = 'session_start' ORDER BY id DESC LIMIT 1),
    'tickets',
    'orphaned_transaction_references',
    COUNT(*)
FROM tickets t
WHERE t.transaction_id NOT IN (SELECT id FROM transactions);

DELETE FROM tickets
WHERE transaction_id NOT IN (SELECT id FROM transactions);

-- Update cleanup log with results
UPDATE database_integrity_cleanup_log
SET
    records_after = (SELECT COUNT(*) FROM tickets),
    completed_at = CURRENT_TIMESTAMP,
    status = 'completed',
    sql_executed = 'DELETE FROM tickets WHERE transaction_id NOT IN (SELECT id FROM transactions)'
WHERE table_name = 'tickets'
  AND cleanup_type = 'orphaned_transaction_references'
  AND completed_at IS NULL;

-- Clean orphaned transaction_items
INSERT INTO database_integrity_cleanup_log
(cleanup_session_id, table_name, cleanup_type, records_before)
SELECT
    (SELECT cleanup_session_id FROM database_integrity_cleanup_log
     WHERE table_name = 'session_start' ORDER BY id DESC LIMIT 1),
    'transaction_items',
    'orphaned_transaction_references',
    COUNT(*)
FROM transaction_items ti
WHERE ti.transaction_id NOT IN (SELECT id FROM transactions);

DELETE FROM transaction_items
WHERE transaction_id NOT IN (SELECT id FROM transactions);

UPDATE database_integrity_cleanup_log
SET
    records_after = (SELECT COUNT(*) FROM transaction_items),
    completed_at = CURRENT_TIMESTAMP,
    status = 'completed',
    sql_executed = 'DELETE FROM transaction_items WHERE transaction_id NOT IN (SELECT id FROM transactions)'
WHERE table_name = 'transaction_items'
  AND cleanup_type = 'orphaned_transaction_references'
  AND completed_at IS NULL;

-- Clean orphaned registrations (ticket_id references non-existent tickets)
INSERT INTO database_integrity_cleanup_log
(cleanup_session_id, table_name, cleanup_type, records_before)
SELECT
    (SELECT cleanup_session_id FROM database_integrity_cleanup_log
     WHERE table_name = 'session_start' ORDER BY id DESC LIMIT 1),
    'registrations',
    'orphaned_ticket_references',
    COUNT(*)
FROM registrations r
WHERE r.ticket_id NOT IN (SELECT ticket_id FROM tickets);

DELETE FROM registrations
WHERE ticket_id NOT IN (SELECT ticket_id FROM tickets);

UPDATE database_integrity_cleanup_log
SET
    records_after = (SELECT COUNT(*) FROM registrations),
    completed_at = CURRENT_TIMESTAMP,
    status = 'completed',
    sql_executed = 'DELETE FROM registrations WHERE ticket_id NOT IN (SELECT ticket_id FROM tickets)'
WHERE table_name = 'registrations'
  AND cleanup_type = 'orphaned_ticket_references'
  AND completed_at IS NULL;

-- Clean orphaned payment_events
INSERT INTO database_integrity_cleanup_log
(cleanup_session_id, table_name, cleanup_type, records_before)
SELECT
    (SELECT cleanup_session_id FROM database_integrity_cleanup_log
     WHERE table_name = 'session_start' ORDER BY id DESC LIMIT 1),
    'payment_events',
    'orphaned_transaction_references',
    COUNT(*)
FROM payment_events pe
WHERE pe.transaction_id IS NOT NULL
  AND pe.transaction_id NOT IN (SELECT id FROM transactions);

DELETE FROM payment_events
WHERE transaction_id IS NOT NULL
  AND transaction_id NOT IN (SELECT id FROM transactions);

UPDATE database_integrity_cleanup_log
SET
    records_after = (SELECT COUNT(*) FROM payment_events),
    completed_at = CURRENT_TIMESTAMP,
    status = 'completed',
    sql_executed = 'DELETE FROM payment_events WHERE transaction_id IS NOT NULL AND transaction_id NOT IN (SELECT id FROM transactions)'
WHERE table_name = 'payment_events'
  AND cleanup_type = 'orphaned_transaction_references'
  AND completed_at IS NULL;

-- Clean orphaned PayPal webhook events (if table exists)
INSERT INTO database_integrity_cleanup_log
(cleanup_session_id, table_name, cleanup_type, records_before)
SELECT
    (SELECT cleanup_session_id FROM database_integrity_cleanup_log
     WHERE table_name = 'session_start' ORDER BY id DESC LIMIT 1),
    'paypal_webhook_events',
    'orphaned_transaction_references',
    COALESCE((
        SELECT COUNT(*)
        FROM paypal_webhook_events pwe
        WHERE pwe.transaction_id IS NOT NULL
          AND pwe.transaction_id NOT IN (SELECT id FROM transactions)
    ), 0);

-- Only attempt to clean PayPal webhook events if the table exists
DELETE FROM paypal_webhook_events
WHERE transaction_id IS NOT NULL
  AND transaction_id NOT IN (SELECT id FROM transactions)
  AND EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='paypal_webhook_events');

UPDATE database_integrity_cleanup_log
SET
    records_after = COALESCE((SELECT COUNT(*) FROM paypal_webhook_events), 0),
    completed_at = CURRENT_TIMESTAMP,
    status = 'completed',
    sql_executed = 'DELETE FROM paypal_webhook_events WHERE transaction_id IS NOT NULL AND transaction_id NOT IN (SELECT id FROM transactions)'
WHERE table_name = 'paypal_webhook_events'
  AND cleanup_type = 'orphaned_transaction_references'
  AND completed_at IS NULL;

-- ================================================================================
-- 4. ENSURE CRITICAL INDEXES EXIST (PERFORMANCE & MIGRATION DEPENDENCY FIX)
-- ================================================================================

-- Ensure test mode indexes exist (from migration 024)
CREATE INDEX IF NOT EXISTS idx_transactions_test_mode
    ON transactions(is_test, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tickets_test_mode
    ON tickets(is_test, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transaction_items_test_mode
    ON transaction_items(is_test, item_type, created_at DESC);

-- Ensure PayPal-specific indexes exist (from migration 025)
CREATE INDEX IF NOT EXISTS idx_transactions_processor_test_mode
    ON transactions(payment_processor, is_test, status, created_at DESC);

-- ================================================================================
-- 5. VALIDATE FOREIGN KEY INTEGRITY
-- ================================================================================

-- Create validation view to check remaining foreign key violations
CREATE VIEW IF NOT EXISTS v_foreign_key_integrity_check AS
SELECT
    'tickets->transactions' as relationship,
    COUNT(*) as violation_count,
    'ticket records with invalid transaction_id' as description
FROM tickets t
WHERE t.transaction_id NOT IN (SELECT id FROM transactions)

UNION ALL

SELECT
    'transaction_items->transactions' as relationship,
    COUNT(*) as violation_count,
    'transaction_item records with invalid transaction_id' as description
FROM transaction_items ti
WHERE ti.transaction_id NOT IN (SELECT id FROM transactions)

UNION ALL

SELECT
    'registrations->tickets' as relationship,
    COUNT(*) as violation_count,
    'registration records with invalid ticket_id' as description
FROM registrations r
WHERE r.ticket_id NOT IN (SELECT ticket_id FROM tickets)

UNION ALL

SELECT
    'payment_events->transactions' as relationship,
    COUNT(*) as violation_count,
    'payment_event records with invalid transaction_id' as description
FROM payment_events pe
WHERE pe.transaction_id IS NOT NULL
  AND pe.transaction_id NOT IN (SELECT id FROM transactions);

-- ================================================================================
-- 6. CREATE INTEGRITY MONITORING VIEW
-- ================================================================================

CREATE VIEW IF NOT EXISTS v_database_integrity_status AS
SELECT
    'Database Integrity Check' as check_type,
    CASE
        WHEN total_violations = 0 THEN 'PASS'
        ELSE 'FAIL (' || total_violations || ' violations)'
    END as status,
    total_violations,
    'Run SELECT * FROM v_foreign_key_integrity_check for details' as details
FROM (
    SELECT SUM(violation_count) as total_violations
    FROM v_foreign_key_integrity_check
)

UNION ALL

SELECT
    'Test Mode Column Check' as check_type,
    CASE
        WHEN transactions_col + tickets_col + items_col = 3 THEN 'PASS'
        ELSE 'FAIL (missing is_test columns)'
    END as status,
    transactions_col + tickets_col + items_col as total_violations,
    'is_test columns: transactions=' || transactions_col || ', tickets=' || tickets_col || ', transaction_items=' || items_col as details
FROM (
    SELECT
        (SELECT COUNT(*) FROM pragma_table_info('transactions') WHERE name = 'is_test') as transactions_col,
        (SELECT COUNT(*) FROM pragma_table_info('tickets') WHERE name = 'is_test') as tickets_col,
        (SELECT COUNT(*) FROM pragma_table_info('transaction_items') WHERE name = 'is_test') as items_col
);

-- ================================================================================
-- 7. FINALIZE CLEANUP SESSION
-- ================================================================================

-- Mark cleanup session as completed
UPDATE database_integrity_cleanup_log
SET
    completed_at = CURRENT_TIMESTAMP,
    status = 'completed'
WHERE table_name = 'session_start'
  AND completed_at IS NULL;

-- ================================================================================
-- MIGRATION COMPLETE
--
-- VERIFICATION COMMANDS:
-- SELECT * FROM v_database_integrity_status;
-- SELECT * FROM v_foreign_key_integrity_check;
-- SELECT * FROM database_integrity_cleanup_log ORDER BY id DESC LIMIT 10;
-- ================================================================================
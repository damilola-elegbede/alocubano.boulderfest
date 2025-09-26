-- Migration: Fix Foreign Key Violations
-- Cleans up orphaned records causing integrity check failures
-- Date: 2024-09-25

-- ================================================================================
-- 1. IDENTIFY AND LOG ORPHANED RECORDS
-- ================================================================================

-- Create temporary table to log what we're cleaning
CREATE TEMP TABLE IF NOT EXISTS cleanup_log (
    table_name TEXT,
    record_count INTEGER,
    cleanup_type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ================================================================================
-- 2. CLEAN ORPHANED TICKETS
-- ================================================================================

-- Log orphaned tickets
INSERT INTO cleanup_log (table_name, record_count, cleanup_type)
SELECT 'tickets', COUNT(*), 'orphaned_transaction'
FROM tickets t
WHERE t.transaction_id NOT IN (SELECT id FROM transactions);

-- Remove tickets with non-existent transactions
DELETE FROM tickets
WHERE transaction_id NOT IN (SELECT id FROM transactions);

-- ================================================================================
-- 3. CLEAN ORPHANED TRANSACTION ITEMS
-- ================================================================================

-- Log orphaned transaction items
INSERT INTO cleanup_log (table_name, record_count, cleanup_type)
SELECT 'transaction_items', COUNT(*), 'orphaned_transaction'
FROM transaction_items ti
WHERE ti.transaction_id NOT IN (SELECT id FROM transactions);

-- Remove transaction items with non-existent transactions
DELETE FROM transaction_items
WHERE transaction_id NOT IN (SELECT id FROM transactions);

-- ================================================================================
-- 4. CLEAN ORPHANED REGISTRATIONS
-- ================================================================================

-- Log orphaned registrations
INSERT INTO cleanup_log (table_name, record_count, cleanup_type)
SELECT 'registrations', COUNT(*), 'orphaned_ticket'
FROM registrations r
WHERE r.ticket_id NOT IN (SELECT ticket_id FROM tickets);

-- Remove registrations with non-existent tickets
DELETE FROM registrations
WHERE ticket_id NOT IN (SELECT ticket_id FROM tickets);

-- ================================================================================
-- 5. CLEAN ORPHANED QR TOKENS (if table exists)
-- ================================================================================

-- Note: qr_tokens table may not exist in all environments
-- This section is skipped if the table doesn't exist

-- ================================================================================
-- 6. CLEAN ORPHANED PAYMENT EVENTS
-- ================================================================================

-- Log orphaned payment events
INSERT INTO cleanup_log (table_name, record_count, cleanup_type)
SELECT 'payment_events', COUNT(*), 'orphaned_transaction'
FROM payment_events pe
WHERE pe.transaction_id IS NOT NULL
  AND pe.transaction_id NOT IN (SELECT id FROM transactions);

-- Remove payment events with non-existent transactions
DELETE FROM payment_events
WHERE transaction_id IS NOT NULL
  AND transaction_id NOT IN (SELECT id FROM transactions);

-- ================================================================================
-- 7. CLEAN TEST DATA CLEANUP LOG ENTRIES (if table exists)
-- ================================================================================

-- Note: test_data_cleanup_log table may not exist in all environments
-- This section is skipped if the table doesn't exist

-- ================================================================================
-- 8. DISPLAY CLEANUP SUMMARY
-- ================================================================================

-- Note: This won't show in migration but helps during manual verification
SELECT
    table_name,
    SUM(record_count) as total_cleaned,
    GROUP_CONCAT(cleanup_type) as cleanup_types
FROM cleanup_log
GROUP BY table_name;

-- ================================================================================
-- Migration Complete
-- ================================================================================
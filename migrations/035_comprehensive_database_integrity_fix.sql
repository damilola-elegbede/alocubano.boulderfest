-- Migration: 035 - Database Foreign Key Cleanup
-- Purpose: Clean up orphaned records causing foreign key violations
-- Date: 2024-09-26
-- Dependencies: 024_test_mode_support.sql (for is_test columns)
-- Note: This migration is idempotent and safe to run multiple times

-- Create cleanup log table
CREATE TABLE IF NOT EXISTS database_integrity_cleanup_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cleanup_session_id TEXT NOT NULL,
    migration_version TEXT NOT NULL DEFAULT '035',
    table_name TEXT NOT NULL,
    cleanup_type TEXT NOT NULL,
    records_before INTEGER NOT NULL DEFAULT 0,
    records_after INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    sql_executed TEXT
);

-- Generate session ID for this cleanup
INSERT INTO database_integrity_cleanup_log (cleanup_session_id, table_name, cleanup_type)
VALUES (
    datetime('now') || '_' || abs(random() % 10000),
    'session_start',
    'foreign_key_cleanup'
);

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

-- Ensure critical indexes exist for performance
CREATE INDEX IF NOT EXISTS idx_transactions_test_mode
    ON transactions(is_test, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tickets_test_mode
    ON tickets(is_test, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transaction_items_test_mode
    ON transaction_items(is_test, item_type, created_at DESC);

-- Mark cleanup session as completed
UPDATE database_integrity_cleanup_log
SET
    completed_at = CURRENT_TIMESTAMP,
    status = 'completed'
WHERE table_name = 'session_start'
  AND completed_at IS NULL;

-- Migration complete
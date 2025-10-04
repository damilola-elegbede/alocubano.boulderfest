-- Migration: 036 - Test Data Cleanup Enhancements
-- Purpose: Add missing columns and view for test data cleanup functionality
-- Dependencies: 028_test_data_tracking.sql

-- Add missing columns to test_data_cleanup_log table
ALTER TABLE test_data_cleanup_log ADD COLUMN duration_seconds REAL;
ALTER TABLE test_data_cleanup_log ADD COLUMN transactions_deleted INTEGER DEFAULT 0;
ALTER TABLE test_data_cleanup_log ADD COLUMN tickets_deleted INTEGER DEFAULT 0;
ALTER TABLE test_data_cleanup_log ADD COLUMN transaction_items_deleted INTEGER DEFAULT 0;
ALTER TABLE test_data_cleanup_log ADD COLUMN related_records_deleted INTEGER DEFAULT 0;
ALTER TABLE test_data_cleanup_log ADD COLUMN verification_checksum TEXT;
ALTER TABLE test_data_cleanup_log ADD COLUMN metadata TEXT;

-- Create view for test data cleanup candidates
-- This view identifies test records that are candidates for cleanup based on age
CREATE VIEW IF NOT EXISTS v_test_data_cleanup_candidates AS
-- Transactions
SELECT
    'transaction' as record_type,
    t.id as record_id,
    EXTRACT(EPOCH FROM (NOW() - t.created_at)) / 86400.0 AS age_days,
    t.amount_cents,
    CASE
        WHEN EXTRACT(EPOCH FROM (NOW() - t.created_at)) / 86400.0 > 90 THEN 'immediate'
        WHEN EXTRACT(EPOCH FROM (NOW() - t.created_at)) / 86400.0 > 30 THEN 'priority'
        WHEN EXTRACT(EPOCH FROM (NOW() - t.created_at)) / 86400.0 > 7 THEN 'scheduled'
        ELSE 'retain'
    END as cleanup_priority,
    t.status,
    t.created_at
FROM transactions t
WHERE t.is_test = 1

UNION ALL

-- Tickets
SELECT
    'ticket' as record_type,
    t.id as record_id,
    EXTRACT(EPOCH FROM (NOW() - t.created_at)) / 86400.0 AS age_days,
    t.price_cents as amount_cents,
    CASE
        WHEN EXTRACT(EPOCH FROM (NOW() - t.created_at)) / 86400.0 > 90 THEN 'immediate'
        WHEN EXTRACT(EPOCH FROM (NOW() - t.created_at)) / 86400.0 > 30 THEN 'priority'
        WHEN EXTRACT(EPOCH FROM (NOW() - t.created_at)) / 86400.0 > 7 THEN 'scheduled'
        ELSE 'retain'
    END as cleanup_priority,
    t.status,
    t.created_at
FROM tickets t
WHERE t.is_test = 1

UNION ALL

-- Transaction Items
SELECT
    'transaction_item' as record_type,
    ti.id as record_id,
    EXTRACT(EPOCH FROM (NOW() - ti.created_at)) / 86400.0 AS age_days,
    ti.total_price_cents as amount_cents,
    CASE
        WHEN EXTRACT(EPOCH FROM (NOW() - ti.created_at)) / 86400.0 > 90 THEN 'immediate'
        WHEN EXTRACT(EPOCH FROM (NOW() - ti.created_at)) / 86400.0 > 30 THEN 'priority'
        WHEN EXTRACT(EPOCH FROM (NOW() - ti.created_at)) / 86400.0 > 7 THEN 'scheduled'
        ELSE 'retain'
    END as cleanup_priority,
    'active' as status,
    ti.created_at
FROM transaction_items ti
WHERE ti.is_test = 1;

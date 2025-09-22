-- Migration 024 - Test Mode Support - Verification Queries
-- Purpose: Comprehensive verification and rollback procedures for test mode migration
-- Usage: Run these queries after migration to verify successful deployment

-- =================================================================
-- 1. SCHEMA VERIFICATION QUERIES
-- =================================================================

-- Verify is_test columns were added successfully
SELECT
    'transactions' as table_name,
    CASE WHEN COUNT(*) > 0 THEN 'COLUMN EXISTS' ELSE 'COLUMN MISSING' END as is_test_column_status
FROM pragma_table_info('transactions')
WHERE name = 'is_test'

UNION ALL

SELECT
    'tickets' as table_name,
    CASE WHEN COUNT(*) > 0 THEN 'COLUMN EXISTS' ELSE 'COLUMN MISSING' END as is_test_column_status
FROM pragma_table_info('tickets')
WHERE name = 'is_test'

UNION ALL

SELECT
    'transaction_items' as table_name,
    CASE WHEN COUNT(*) > 0 THEN 'COLUMN EXISTS' ELSE 'COLUMN MISSING' END as is_test_column_status
FROM pragma_table_info('transaction_items')
WHERE name = 'is_test';

-- Verify default values are set correctly (should all be 0)
SELECT
    'transactions_default_values' as check_type,
    COUNT(*) as total_rows,
    SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END) as default_production_rows,
    SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) as test_rows,
    CASE WHEN COUNT(*) = SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END)
         THEN 'PASS' ELSE 'FAIL' END as default_check_result
FROM transactions

UNION ALL

SELECT
    'tickets_default_values' as check_type,
    COUNT(*) as total_rows,
    SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END) as default_production_rows,
    SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) as test_rows,
    CASE WHEN COUNT(*) = SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END)
         THEN 'PASS' ELSE 'FAIL' END as default_check_result
FROM tickets

UNION ALL

SELECT
    'transaction_items_default_values' as check_type,
    COUNT(*) as total_rows,
    SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END) as default_production_rows,
    SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) as test_rows,
    CASE WHEN COUNT(*) = SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END)
         THEN 'PASS' ELSE 'FAIL' END as default_check_result
FROM transaction_items;

-- =================================================================
-- 2. INDEX VERIFICATION QUERIES
-- =================================================================

-- Verify all test mode indexes were created
SELECT
    name as index_name,
    tbl_name as table_name,
    CASE WHEN name IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END as status
FROM sqlite_master
WHERE type = 'index'
AND name IN (
    'idx_transactions_test_mode',
    'idx_transactions_test_mode_lookup',
    'idx_transactions_production_active',
    'idx_tickets_test_mode',
    'idx_tickets_test_mode_lookup',
    'idx_tickets_production_active',
    'idx_tickets_test_transaction',
    'idx_transaction_items_test_mode',
    'idx_transaction_items_test_transaction',
    'idx_transactions_test_email_date',
    'idx_tickets_test_email_date'
)
ORDER BY table_name, index_name;

-- Check for any missing indexes
WITH expected_indexes AS (
    SELECT 'idx_transactions_test_mode' as index_name
    UNION ALL SELECT 'idx_transactions_test_mode_lookup'
    UNION ALL SELECT 'idx_transactions_production_active'
    UNION ALL SELECT 'idx_tickets_test_mode'
    UNION ALL SELECT 'idx_tickets_test_mode_lookup'
    UNION ALL SELECT 'idx_tickets_production_active'
    UNION ALL SELECT 'idx_tickets_test_transaction'
    UNION ALL SELECT 'idx_transaction_items_test_mode'
    UNION ALL SELECT 'idx_transaction_items_test_transaction'
    UNION ALL SELECT 'idx_transactions_test_email_date'
    UNION ALL SELECT 'idx_tickets_test_email_date'
)
SELECT
    'Missing Indexes Check' as verification_type,
    COUNT(*) as expected_count,
    (SELECT COUNT(*) FROM sqlite_master sm WHERE sm.type = 'index' AND sm.name IN (SELECT index_name FROM expected_indexes)) as actual_count,
    CASE WHEN COUNT(*) = (SELECT COUNT(*) FROM sqlite_master sm WHERE sm.type = 'index' AND sm.name IN (SELECT index_name FROM expected_indexes))
         THEN 'PASS - All indexes created'
         ELSE 'FAIL - Missing indexes'
    END as result
FROM expected_indexes;

-- =================================================================
-- 3. TABLE AND VIEW VERIFICATION
-- =================================================================

-- Verify test_data_cleanup_log table was created
SELECT
    'test_data_cleanup_log' as table_name,
    COUNT(*) as column_count,
    CASE WHEN COUNT(*) >= 20 THEN 'PASS' ELSE 'FAIL' END as structure_check
FROM pragma_table_info('test_data_cleanup_log');

-- Verify views were created successfully
SELECT
    name as view_name,
    type,
    CASE WHEN name IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END as status
FROM sqlite_master
WHERE type = 'view'
AND name IN (
    'v_data_mode_statistics',
    'v_test_cleanup_history',
    'v_active_test_data',
    'v_test_data_cleanup_candidates'
)
ORDER BY name;

-- =================================================================
-- 4. TRIGGER VERIFICATION
-- =================================================================

-- Verify data integrity triggers were created
SELECT
    name as trigger_name,
    tbl_name as table_name,
    CASE WHEN name IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END as status
FROM sqlite_master
WHERE type = 'trigger'
AND name IN (
    'trg_test_mode_consistency_transactions',
    'trg_test_mode_consistency_transaction_items',
    'trg_test_cleanup_audit_log'
)
ORDER BY name;

-- Verify updated audit triggers
SELECT
    'audit_triggers' as check_type,
    COUNT(*) as trigger_count,
    CASE WHEN COUNT(*) = 2 THEN 'PASS' ELSE 'FAIL' END as status
FROM sqlite_master
WHERE type = 'trigger'
AND name IN ('audit_tickets_insert', 'audit_transactions_insert');

-- =================================================================
-- 5. FUNCTIONAL VERIFICATION TESTS
-- =================================================================

-- Test view functionality - should return results without errors
SELECT 'v_data_mode_statistics' as view_test, COUNT(*) as row_count FROM v_data_mode_statistics;
SELECT 'v_test_cleanup_history' as view_test, COUNT(*) as row_count FROM v_test_cleanup_history;
SELECT 'v_active_test_data' as view_test, COUNT(*) as row_count FROM v_active_test_data;
SELECT 'v_test_data_cleanup_candidates' as view_test, COUNT(*) as row_count FROM v_test_data_cleanup_candidates;

-- Test constraint functionality (should not insert invalid data)
-- Note: These are sample tests - actual execution would result in errors for invalid data

-- =================================================================
-- 6. PERFORMANCE VERIFICATION
-- =================================================================

-- Check query plan for production data queries (should use new indexes)
EXPLAIN QUERY PLAN
SELECT * FROM transactions WHERE is_test = 0 AND status = 'completed' ORDER BY created_at DESC LIMIT 10;

EXPLAIN QUERY PLAN
SELECT * FROM tickets WHERE is_test = 0 AND status = 'valid' ORDER BY created_at DESC LIMIT 10;

-- Check query plan for test data cleanup queries
EXPLAIN QUERY PLAN
SELECT COUNT(*) FROM transactions WHERE is_test = 1 AND created_at < datetime('now', '-30 days');

-- =================================================================
-- 7. DATA INTEGRITY VERIFICATION
-- =================================================================

-- Verify referential integrity between tables
SELECT
    'referential_integrity' as check_type,
    COUNT(*) as total_tickets,
    COUNT(CASE WHEN t.is_test = tk.is_test THEN 1 END) as matching_test_mode,
    CASE WHEN COUNT(*) = COUNT(CASE WHEN t.is_test = tk.is_test THEN 1 END)
         THEN 'PASS' ELSE 'FAIL' END as integrity_check
FROM tickets tk
JOIN transactions t ON t.id = tk.transaction_id;

-- Verify transaction_items integrity
SELECT
    'transaction_items_integrity' as check_type,
    COUNT(*) as total_items,
    COUNT(CASE WHEN t.is_test = ti.is_test THEN 1 END) as matching_test_mode,
    CASE WHEN COUNT(*) = COUNT(CASE WHEN t.is_test = ti.is_test THEN 1 END)
         THEN 'PASS' ELSE 'FAIL' END as integrity_check
FROM transaction_items ti
JOIN transactions t ON t.id = ti.transaction_id;

-- =================================================================
-- 8. ROLLBACK PREPARATION QUERIES
-- =================================================================

-- Count affected records before rollback (for verification)
SELECT
    'pre_rollback_counts' as check_type,
    (SELECT COUNT(*) FROM transactions) as total_transactions,
    (SELECT COUNT(*) FROM tickets) as total_tickets,
    (SELECT COUNT(*) FROM transaction_items) as total_transaction_items,
    (SELECT COUNT(*) FROM test_data_cleanup_log) as cleanup_log_entries;

-- Backup critical constraint information
SELECT
    'constraint_backup' as info_type,
    sql
FROM sqlite_master
WHERE type = 'table'
AND name IN ('transactions', 'tickets', 'transaction_items')
AND sql LIKE '%CHECK%';

-- =================================================================
-- 9. MIGRATION SUCCESS SUMMARY
-- =================================================================

-- Final verification summary
WITH verification_results AS (
    SELECT
        'Schema Changes' as category,
        CASE WHEN (
            SELECT COUNT(*) FROM pragma_table_info('transactions') WHERE name = 'is_test'
        ) + (
            SELECT COUNT(*) FROM pragma_table_info('tickets') WHERE name = 'is_test'
        ) + (
            SELECT COUNT(*) FROM pragma_table_info('transaction_items') WHERE name = 'is_test'
        ) = 3 THEN 'PASS' ELSE 'FAIL' END as status

    UNION ALL

    SELECT
        'Indexes Created' as category,
        CASE WHEN (
            SELECT COUNT(*) FROM sqlite_master
            WHERE type = 'index'
            AND name LIKE '%test_mode%' OR name LIKE '%test_%'
        ) >= 11 THEN 'PASS' ELSE 'FAIL' END as status

    UNION ALL

    SELECT
        'Views Created' as category,
        CASE WHEN (
            SELECT COUNT(*) FROM sqlite_master
            WHERE type = 'view'
            AND name LIKE 'v_%test%' OR name LIKE 'v_%mode%'
        ) >= 4 THEN 'PASS' ELSE 'FAIL' END as status

    UNION ALL

    SELECT
        'Triggers Created' as category,
        CASE WHEN (
            SELECT COUNT(*) FROM sqlite_master
            WHERE type = 'trigger'
            AND (name LIKE '%test_mode%' OR name LIKE '%cleanup%')
        ) >= 3 THEN 'PASS' ELSE 'FAIL' END as status
)
SELECT
    'MIGRATION_024_VERIFICATION' as summary,
    GROUP_CONCAT(category || ': ' || status, ' | ') as results,
    CASE WHEN MIN(status) = 'PASS' THEN 'MIGRATION_SUCCESS' ELSE 'MIGRATION_ISSUES' END as overall_status
FROM verification_results;
-- Migration 025 - Test Mode Support Verification
-- Purpose: Basic verification that test mode migration completed successfully
-- Dependencies: 024_test_mode_support.sql

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

-- =================================================================
-- 2. TABLE VERIFICATION
-- =================================================================

-- Verify test_data_cleanup_log table was created
SELECT
    'test_data_cleanup_log' as table_name,
    COUNT(*) as column_count,
    CASE WHEN COUNT(*) >= 15 THEN 'PASS' ELSE 'FAIL' END as structure_check
FROM pragma_table_info('test_data_cleanup_log');

-- =================================================================
-- 3. VIEW VERIFICATION
-- =================================================================

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
-- 4. FUNCTIONAL VERIFICATION TESTS
-- =================================================================

-- Test view functionality - should return results without errors
SELECT 'v_data_mode_statistics' as view_test, COUNT(*) as row_count FROM v_data_mode_statistics;
SELECT 'v_test_cleanup_history' as view_test, COUNT(*) as row_count FROM v_test_cleanup_history;
SELECT 'v_active_test_data' as view_test, COUNT(*) as row_count FROM v_active_test_data;
SELECT 'v_test_data_cleanup_candidates' as view_test, COUNT(*) as row_count FROM v_test_data_cleanup_candidates;

-- =================================================================
-- 5. MIGRATION SUCCESS SUMMARY
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
        'Views Created' as category,
        CASE WHEN (
            SELECT COUNT(*) FROM sqlite_master
            WHERE type = 'view'
            AND name IN ('v_data_mode_statistics', 'v_test_cleanup_history', 'v_active_test_data', 'v_test_data_cleanup_candidates')
        ) = 4 THEN 'PASS' ELSE 'FAIL' END as status
)
SELECT
    'MIGRATION_024_VERIFICATION' as summary,
    GROUP_CONCAT(category || ': ' || status, ' | ') as results,
    CASE WHEN MIN(status) = 'PASS' THEN 'MIGRATION_SUCCESS' ELSE 'MIGRATION_ISSUES' END as overall_status
FROM verification_results;
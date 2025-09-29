-- Migration: 028 - Test Data Tracking
-- Purpose: Track test data cleanup operations
-- Dependencies: 004_transactions.sql, 005_tickets.sql

-- Test data cleanup log
CREATE TABLE IF NOT EXISTS test_data_cleanup_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cleanup_id TEXT UNIQUE NOT NULL,
    operation_type TEXT NOT NULL CHECK (operation_type IN ('scheduled_cleanup', 'manual_cleanup', 'emergency_cleanup')),
    initiated_by TEXT NOT NULL,
    cleanup_criteria TEXT NOT NULL,
    records_identified INTEGER NOT NULL DEFAULT 0,
    records_deleted INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'partial', 'cancelled')),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_test_cleanup_log_status ON test_data_cleanup_log(status);
CREATE INDEX IF NOT EXISTS idx_test_cleanup_log_started_at ON test_data_cleanup_log(started_at DESC);

-- Views for test data tracking
CREATE VIEW IF NOT EXISTS v_data_mode_statistics AS
SELECT
    'transactions' as table_name,
    SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END) as production_count,
    SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) as test_count,
    COUNT(*) as total_count,
    ROUND(SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as test_percentage,
    SUM(CASE WHEN is_test = 0 THEN amount_cents ELSE 0 END) as production_amount_cents,
    SUM(CASE WHEN is_test = 1 THEN amount_cents ELSE 0 END) as test_amount_cents
FROM transactions
UNION ALL
SELECT
    'tickets' as table_name,
    SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END) as production_count,
    SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) as test_count,
    COUNT(*) as total_count,
    ROUND(SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as test_percentage,
    SUM(CASE WHEN is_test = 0 THEN price_cents ELSE 0 END) as production_amount_cents,
    SUM(CASE WHEN is_test = 1 THEN price_cents ELSE 0 END) as test_amount_cents
FROM tickets;
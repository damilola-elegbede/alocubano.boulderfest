-- Migration: 025 - Test Mode Support (Simplified)
-- Purpose: Add basic test mode support columns for integration testing
-- Dependencies: 023_service_monitoring_tables.sql

-- =================================================================
-- 1. CORE TABLE MODIFICATIONS - Add is_test columns
-- =================================================================

-- Add is_test column to transactions table
ALTER TABLE transactions ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1));

-- Add is_test column to tickets table
ALTER TABLE tickets ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1));

-- Add is_test column to transaction_items table
ALTER TABLE transaction_items ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1));

-- =================================================================
-- 2. PERFORMANCE INDEXES - Basic test data filtering
-- =================================================================

-- High-performance indexes for test mode queries
CREATE INDEX IF NOT EXISTS idx_transactions_test_mode ON transactions(is_test, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_test_mode_lookup ON transactions(is_test, transaction_id) WHERE is_test = 1;
CREATE INDEX IF NOT EXISTS idx_transactions_production_active ON transactions(is_test, status) WHERE is_test = 0;

CREATE INDEX IF NOT EXISTS idx_tickets_test_mode ON tickets(is_test, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_test_mode_lookup ON tickets(is_test, ticket_id) WHERE is_test = 1;
CREATE INDEX IF NOT EXISTS idx_tickets_production_active ON tickets(is_test, status) WHERE is_test = 0;
CREATE INDEX IF NOT EXISTS idx_tickets_test_transaction ON tickets(is_test, transaction_id);

CREATE INDEX IF NOT EXISTS idx_transaction_items_test_mode ON transaction_items(is_test, item_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transaction_items_test_transaction ON transaction_items(is_test, transaction_id);

-- Additional performance indexes for test mode queries
CREATE INDEX IF NOT EXISTS idx_transactions_test_email_date ON transactions(is_test, customer_email, created_at DESC) WHERE is_test = 1;
CREATE INDEX IF NOT EXISTS idx_tickets_test_email_date ON tickets(is_test, attendee_email, created_at DESC) WHERE is_test = 1;

-- =================================================================
-- 3. BASIC TEST DATA AUDIT TABLE
-- =================================================================

-- Table to track test data cleanup operations
CREATE TABLE IF NOT EXISTS test_data_cleanup_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cleanup_id TEXT UNIQUE NOT NULL,
    operation_type TEXT NOT NULL CHECK (operation_type IN ('scheduled_cleanup', 'manual_cleanup', 'emergency_cleanup')),
    initiated_by TEXT NOT NULL,
    cleanup_criteria TEXT NOT NULL,
    records_identified INTEGER NOT NULL DEFAULT 0,
    records_deleted INTEGER NOT NULL DEFAULT 0,
    transactions_deleted INTEGER NOT NULL DEFAULT 0,
    tickets_deleted INTEGER NOT NULL DEFAULT 0,
    transaction_items_deleted INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'partial', 'cancelled')),
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =================================================================
-- 4. BASIC STATISTICS VIEW
-- =================================================================

-- Production vs Test data statistics view
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

-- =================================================================
-- 5. ADDITIONAL VIEWS FOR TEST MODE MANAGEMENT
-- =================================================================

-- Test cleanup history view
CREATE VIEW IF NOT EXISTS v_test_cleanup_history AS
SELECT * FROM test_data_cleanup_log ORDER BY started_at DESC;

-- Active test data summary view
CREATE VIEW IF NOT EXISTS v_active_test_data AS
SELECT
    DATE(t.created_at) as test_date,
    COUNT(DISTINCT t.id) as test_transactions,
    COUNT(DISTINCT tk.id) as test_tickets,
    COUNT(DISTINCT ti.id) as test_transaction_items,
    SUM(t.amount_cents) as test_amount_cents,
    COUNT(DISTINCT t.customer_email) as unique_test_customers
FROM transactions t
LEFT JOIN tickets tk ON tk.transaction_id = t.id AND tk.is_test = 1
LEFT JOIN transaction_items ti ON ti.transaction_id = t.id AND ti.is_test = 1
WHERE t.is_test = 1
GROUP BY DATE(t.created_at)
ORDER BY test_date DESC;

-- Test data cleanup candidates view
CREATE VIEW IF NOT EXISTS v_test_data_cleanup_candidates AS
SELECT
    'transaction' as record_type,
    t.id as record_id,
    t.transaction_id as business_id,
    t.created_at,
    julianday('now') - julianday(t.created_at) as age_days,
    t.status,
    'scheduled' as cleanup_priority
FROM transactions t
WHERE t.is_test = 1;

-- =================================================================
-- 6. DATA INTEGRITY TRIGGERS
-- =================================================================

-- Ensure tickets have the same is_test value as their parent transaction
CREATE TRIGGER IF NOT EXISTS trg_test_mode_consistency_transactions
BEFORE INSERT ON tickets
FOR EACH ROW
WHEN NEW.transaction_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM transactions
      WHERE id = NEW.transaction_id
      AND is_test != NEW.is_test
    ) THEN RAISE(ABORT, 'Ticket test mode must match parent transaction test mode')
  END;
END;

-- Ensure transaction_items have the same is_test value as their parent transaction
CREATE TRIGGER IF NOT EXISTS trg_test_mode_consistency_transaction_items
BEFORE INSERT ON transaction_items
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM transactions
      WHERE id = NEW.transaction_id
      AND is_test != NEW.is_test
    ) THEN RAISE(ABORT, 'Transaction item test mode must match parent transaction test mode')
  END;
END;

-- Audit trigger for test data cleanup operations
CREATE TRIGGER IF NOT EXISTS trg_test_cleanup_audit_log
AFTER INSERT ON test_data_cleanup_log
FOR EACH ROW
BEGIN
  INSERT INTO audit_logs (
    request_id,
    event_type,
    action,
    target_type,
    target_id,
    admin_user,
    after_value,
    metadata,
    severity,
    source_service
  ) VALUES (
    'cleanup_' || NEW.cleanup_id,
    'data_cleanup',
    'test_data_cleanup_initiated',
    'test_data',
    NEW.cleanup_id,
    NEW.initiated_by,
    json_object(
      'operation_type', NEW.operation_type,
      'cleanup_criteria', NEW.cleanup_criteria,
      'records_identified', NEW.records_identified,
      'status', NEW.status
    ),
    json_object(
      'table_name', 'test_data_cleanup_log',
      'operation', 'CLEANUP_INITIATED',
      'business_process', 'test_data_management'
    ),
    'info',
    'test_cleanup_system'
  );
END;
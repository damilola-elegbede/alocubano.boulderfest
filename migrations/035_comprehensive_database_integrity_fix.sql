-- Migration: 035 - Database Integrity Indexes
-- Purpose: Ensure critical performance indexes exist
-- Date: 2024-09-26
-- Dependencies: 024_test_mode_support.sql, 028_fix_foreign_key_violations.sql
-- Note: Migration 028 already cleaned foreign keys, this just adds indexes

-- Ensure critical indexes exist for performance (only if columns exist)
-- These indexes may fail if is_test columns don't exist yet, which is fine
CREATE INDEX IF NOT EXISTS idx_transactions_test_mode
    ON transactions(is_test, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tickets_test_mode
    ON tickets(is_test, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transaction_items_test_mode
    ON transaction_items(is_test, item_type, created_at DESC);

-- Migration complete
-- Note: Foreign key cleanup was already handled by migration 028
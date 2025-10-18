-- Migration 050: Optimize qr_validations cleanup performance
-- Purpose: Add DESC index for efficient time-based filtering in cleanup cron
-- Date: 2025-10-17
-- Author: Code Review - Issue #20

-- Drop old index without DESC ordering
DROP INDEX IF EXISTS idx_qr_validations_time;

-- Create optimized index with DESC ordering for cleanup queries
-- Optimizes: DELETE FROM qr_validations WHERE validation_time < datetime('now', '-90 days')
CREATE INDEX IF NOT EXISTS idx_qr_validations_validation_time
    ON qr_validations(validation_time DESC);

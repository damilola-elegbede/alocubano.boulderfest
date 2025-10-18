-- Migration 049: Optimize scan_logs query performance with composite indexes
-- Purpose: Add composite indexes for common query patterns in scanner statistics
-- Date: 2025-10-18
-- Author: System

-- Composite index for alreadyScanned filter queries
-- Optimizes: SELECT * FROM scan_logs WHERE ticket_id = ? AND scan_status IN (...) ORDER BY scanned_at DESC
CREATE INDEX IF NOT EXISTS idx_scan_logs_ticket_status_time
    ON scan_logs(ticket_id, scan_status, scanned_at DESC);

-- Composite index for session queries by scan log IDs
-- Optimizes: SELECT * FROM scan_logs WHERE id IN (...) ORDER BY scanned_at DESC
CREATE INDEX IF NOT EXISTS idx_scan_logs_id_timestamp
    ON scan_logs(id, scanned_at DESC);

-- Composite index for today/time-based filtering
-- Optimizes: SELECT * FROM scan_logs WHERE scanned_at >= datetime('now', '-1 day')
CREATE INDEX IF NOT EXISTS idx_scan_logs_time_status
    ON scan_logs(scanned_at DESC, scan_status);

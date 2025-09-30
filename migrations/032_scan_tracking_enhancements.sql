-- Migration: 037 - Enhanced Scan Tracking System
-- Purpose: Add comprehensive scan tracking table and validation status field
-- Dependencies: 007_tickets.sql, 008_qr_validations.sql
--
-- DEPLOYMENT NOTES:
-- 1. Requires PRAGMA foreign_keys=ON at connection initialization
-- 2. PII retention policy: ip_address and user_agent stored for security monitoring
--    - Recommended retention: 90 days (implement scheduled purge job)
--    - Consider: Store truncated IP (/24 or /64) or salted hash for privacy
--    - Document in privacy policy and provide deletion mechanism
-- 3. Breaking changes: scan_logs.ticket_id now enforces referential integrity

-- PII NOTICE: This table stores personal data for security purposes
-- ip_address and user_agent: Collected for fraud detection and security monitoring
-- Retention: 90 days recommended. Implement scheduled purge job.
-- Privacy: Must be documented in privacy policy with deletion mechanism.
-- Alternative: Consider storing truncated IP (/24 or /64) or salted hash.

-- Create scan_logs table for detailed scan tracking
CREATE TABLE IF NOT EXISTS scan_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL REFERENCES tickets(ticket_id) ON DELETE CASCADE,
    scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    scan_status TEXT NOT NULL CHECK (scan_status IN ('valid', 'already_scanned', 'expired', 'invalid', 'rate_limited', 'suspicious')),
    scan_location TEXT,
    device_info TEXT,
    ip_address TEXT,
    user_agent TEXT,
    validation_source TEXT DEFAULT 'web' CHECK (validation_source IN ('web', 'apple_wallet', 'google_wallet', 'samsung_wallet', 'email')),
    token_type TEXT CHECK (token_type IN ('JWT', 'direct')),
    failure_reason TEXT,
    request_id TEXT,
    scan_duration_ms INTEGER,
    security_flags TEXT CHECK (security_flags IS NULL OR json_valid(security_flags)),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for scan_logs table for efficient querying
-- Single-column indexes for basic lookups
CREATE INDEX IF NOT EXISTS idx_scan_logs_ticket_id ON scan_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_scanned_at ON scan_logs(scanned_at);
CREATE INDEX IF NOT EXISTS idx_scan_logs_scan_status ON scan_logs(scan_status);
CREATE INDEX IF NOT EXISTS idx_scan_logs_ip_address ON scan_logs(ip_address);
CREATE INDEX IF NOT EXISTS idx_scan_logs_validation_source ON scan_logs(validation_source);
CREATE INDEX IF NOT EXISTS idx_scan_logs_request_id ON scan_logs(request_id) WHERE request_id IS NOT NULL;

-- Composite indexes for hot-path queries (per-ticket/hour checks, latest scan)
-- Optimizes: "Get scans for ticket ordered by time" (per-ticket rate limiting)
CREATE INDEX IF NOT EXISTS idx_scan_logs_ticket_scanned_at
    ON scan_logs(ticket_id, scanned_at DESC);

-- Optimizes: "Latest scan status per ticket"
CREATE INDEX IF NOT EXISTS idx_scan_logs_ticket_status
    ON scan_logs(ticket_id, scan_status, scanned_at DESC);

-- Optimizes: "Security analysis by IP and time"
CREATE INDEX IF NOT EXISTS idx_scan_logs_security_analysis
    ON scan_logs(ip_address, scanned_at DESC, scan_status);

-- Partial index for suspicious scans (fraud detection queries)
-- Optimizes: "Find recent suspicious scans"
CREATE INDEX IF NOT EXISTS idx_scan_logs_suspicious
    ON scan_logs(scan_status, scanned_at DESC)
    WHERE scan_status = 'suspicious';

-- Note: validation_status and event_end_date columns already exist in migration 005_tickets.sql
-- Index for tickets validation_status (if not already created)
CREATE INDEX IF NOT EXISTS idx_tickets_validation_status ON tickets(validation_status);

-- Set default event end date for existing tickets (Boulder Fest 2026: May 17, 2026 23:59:59)
-- This ensures all existing tickets have a valid expiry date
UPDATE tickets
SET event_end_date = '2026-05-17 23:59:59'
WHERE event_end_date IS NULL;

-- Index for event end date queries (expiry checks, if not already created)
CREATE INDEX IF NOT EXISTS idx_tickets_event_end_date ON tickets(event_end_date);
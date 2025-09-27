-- Migration: 037 - Enhanced Scan Tracking System
-- Purpose: Add comprehensive scan tracking table and validation status field
-- Dependencies: 007_tickets.sql, 008_qr_validations.sql

-- Create scan_logs table for detailed scan tracking
CREATE TABLE IF NOT EXISTS scan_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL,
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
    security_flags TEXT, -- JSON string containing security-related flags
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add validation_status field to tickets table if not exists
-- This tracks the current validation state of the ticket
ALTER TABLE tickets ADD COLUMN validation_status TEXT DEFAULT 'active' CHECK (
    validation_status IN ('active', 'expired', 'suspended', 'revoked')
);

-- Indexes for scan_logs table for efficient querying
CREATE INDEX IF NOT EXISTS idx_scan_logs_ticket_id ON scan_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_scanned_at ON scan_logs(scanned_at);
CREATE INDEX IF NOT EXISTS idx_scan_logs_scan_status ON scan_logs(scan_status);
CREATE INDEX IF NOT EXISTS idx_scan_logs_ip_address ON scan_logs(ip_address);
CREATE INDEX IF NOT EXISTS idx_scan_logs_validation_source ON scan_logs(validation_source);
CREATE INDEX IF NOT EXISTS idx_scan_logs_ticket_status ON scan_logs(ticket_id, scan_status);
CREATE INDEX IF NOT EXISTS idx_scan_logs_security_analysis ON scan_logs(ip_address, scanned_at, scan_status);
CREATE INDEX IF NOT EXISTS idx_scan_logs_request_id ON scan_logs(request_id) WHERE request_id IS NOT NULL;

-- Index for tickets validation_status
CREATE INDEX IF NOT EXISTS idx_tickets_validation_status ON tickets(validation_status);

-- Add event_end_date to tickets table for event expiry validation
ALTER TABLE tickets ADD COLUMN event_end_date DATETIME;

-- Set default event end date for existing tickets (Boulder Fest 2026: May 17, 2026 23:59:59)
UPDATE tickets
SET event_end_date = '2026-05-17 23:59:59'
WHERE event_end_date IS NULL;

-- Index for event end date queries
CREATE INDEX IF NOT EXISTS idx_tickets_event_end_date ON tickets(event_end_date);
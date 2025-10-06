-- Migration: 040 - Audit Retention Policy
-- Purpose: Add retention lifecycle management to audit logs
-- Dependencies: 014_admin_security_system.sql

-- Add retention metadata columns to audit_logs table
ALTER TABLE audit_logs ADD COLUMN retention_period TEXT DEFAULT '1_year';
ALTER TABLE audit_logs ADD COLUMN archived_at DATETIME NULL;
ALTER TABLE audit_logs ADD COLUMN delete_after DATETIME NULL;

-- Create audit logs archive table for warm storage (archived but queryable)
CREATE TABLE IF NOT EXISTS audit_logs_archive (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_id INTEGER NOT NULL,
    archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- All columns from audit_logs (replicated for full archive)
    request_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    action TEXT NOT NULL,

    -- Target information
    target_type TEXT,
    target_id TEXT,

    -- Admin/user information
    admin_user TEXT,
    session_id TEXT,
    ip_address TEXT,
    user_agent TEXT,

    -- Data change tracking
    before_value TEXT,
    after_value TEXT,
    changed_fields TEXT,

    -- Admin access tracking
    request_method TEXT,
    request_url TEXT,
    request_body TEXT,
    response_status INTEGER,
    response_time_ms INTEGER,
    error_message TEXT,

    -- Data processing tracking (GDPR compliance)
    data_subject_id TEXT,
    data_type TEXT,
    processing_purpose TEXT,
    legal_basis TEXT,
    retention_period TEXT,

    -- Financial event tracking
    amount_cents INTEGER,
    currency TEXT,
    transaction_reference TEXT,
    payment_status TEXT,

    -- Configuration change tracking
    config_key TEXT,
    config_environment TEXT,

    -- General metadata
    metadata TEXT,
    severity TEXT DEFAULT 'info',
    created_at DATETIME
);

-- Indexes for audit_logs_archive table
CREATE INDEX IF NOT EXISTS idx_audit_archive_created ON audit_logs_archive(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_archive_original ON audit_logs_archive(original_id);
CREATE INDEX IF NOT EXISTS idx_audit_archive_event_type ON audit_logs_archive(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_archive_admin_user ON audit_logs_archive(admin_user);
CREATE INDEX IF NOT EXISTS idx_audit_archive_severity ON audit_logs_archive(severity);
CREATE INDEX IF NOT EXISTS idx_audit_archive_archived_at ON audit_logs_archive(archived_at);

-- Add index for retention queries on main audit_logs table
CREATE INDEX IF NOT EXISTS idx_audit_logs_retention ON audit_logs(created_at, archived_at, retention_period);
CREATE INDEX IF NOT EXISTS idx_audit_logs_delete_after ON audit_logs(delete_after);

-- Set initial retention periods based on event type
-- Financial events: 7 years (IRS compliance)
UPDATE audit_logs
SET retention_period = '7_years'
WHERE event_type = 'financial_event' AND retention_period = '1_year';

-- Data changes: 7 years (align with financial records)
UPDATE audit_logs
SET retention_period = '7_years'
WHERE event_type = 'data_change' AND retention_period = '1_year';

-- Admin access: 3 years (security monitoring)
UPDATE audit_logs
SET retention_period = '3_years'
WHERE event_type = 'admin_access' AND retention_period = '1_year';

-- Data processing (GDPR): 3 years
UPDATE audit_logs
SET retention_period = '3_years'
WHERE event_type = 'data_processing' AND retention_period = '1_year';

-- Config changes: 10 years (long-term system tracking)
UPDATE audit_logs
SET retention_period = '10_years'
WHERE event_type = 'config_change' AND retention_period = '1_year';

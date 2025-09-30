-- Migration: 014 - Admin Security System
-- Purpose: Admin authentication and session management
-- Dependencies: 002_schema_migrations.sql

-- Login attempts tracking table (from backup 013_admin_security_system.sql)
CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT NOT NULL UNIQUE,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    locked_until DATETIME NULL,
    first_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Admin sessions table
CREATE TABLE IF NOT EXISTS admin_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_token TEXT UNIQUE NOT NULL,
    admin_email TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_activity_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    revoked_at DATETIME,
    revoke_reason TEXT
);

-- Admin activity log table (from backup 013_admin_security_system.sql)
CREATE TABLE IF NOT EXISTS admin_activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_token TEXT,
    action TEXT NOT NULL,
    resource TEXT,
    ip_address TEXT NOT NULL,
    user_agent TEXT,
    request_details TEXT,
    success BOOLEAN NOT NULL DEFAULT TRUE,
    error_message TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Admin audit log
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_email TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    request_data TEXT,
    response_status INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT
);

-- Admin session analytics table
-- Tracks detailed session information and security metrics
CREATE TABLE IF NOT EXISTS admin_session_analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_token TEXT NOT NULL,
    admin_id TEXT NOT NULL,
    login_time DATETIME NOT NULL,
    logout_time DATETIME,
    duration_seconds INTEGER,
    ip_address TEXT,
    user_agent TEXT,
    security_score INTEGER DEFAULT 50,
    mfa_used BOOLEAN DEFAULT FALSE,
    device_fingerprint TEXT,
    browser_fingerprint TEXT,
    risk_level TEXT DEFAULT 'low',
    page_views INTEGER DEFAULT 0,
    api_calls INTEGER DEFAULT 0,
    failed_operations INTEGER DEFAULT 0,
    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Admin session events table
-- Records all session-related events for forensics
CREATE TABLE IF NOT EXISTS admin_session_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_token TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_data TEXT,
    ip_address TEXT,
    user_agent TEXT,
    previous_ip TEXT,
    ip_changed BOOLEAN DEFAULT FALSE,
    user_agent_changed BOOLEAN DEFAULT FALSE,
    severity TEXT DEFAULT 'info',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Admin security incidents table
-- Tracks detected security incidents and anomalies
CREATE TABLE IF NOT EXISTS admin_security_incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    incident_id TEXT UNIQUE NOT NULL,
    incident_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    session_token TEXT,
    admin_id TEXT,
    ip_address TEXT,
    title TEXT NOT NULL,
    description TEXT,
    indicators TEXT,
    status TEXT DEFAULT 'open',
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    resolution_notes TEXT
);

-- Admin MFA configuration table (from backup 014_admin_mfa_system.sql)
CREATE TABLE IF NOT EXISTS admin_mfa_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id TEXT NOT NULL UNIQUE DEFAULT 'admin',
    totp_secret TEXT NOT NULL,
    secret_created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    enabled_at DATETIME NULL,
    last_used_at DATETIME NULL,
    device_name TEXT DEFAULT 'Authenticator App',
    issuer TEXT DEFAULT 'A Lo Cubano Boulder Fest Admin',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Backup codes table for recovery (from backup 014_admin_mfa_system.sql)
CREATE TABLE IF NOT EXISTS admin_mfa_backup_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id TEXT NOT NULL DEFAULT 'admin',
    code_hash TEXT NOT NULL UNIQUE,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at DATETIME NULL,
    used_from_ip TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES admin_mfa_config(admin_id) ON DELETE CASCADE
);

-- MFA authentication attempts log (from backup 014_admin_mfa_system.sql)
CREATE TABLE IF NOT EXISTS admin_mfa_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id TEXT NOT NULL DEFAULT 'admin',
    attempt_type TEXT NOT NULL CHECK (attempt_type IN ('totp', 'backup_code')),
    success BOOLEAN NOT NULL DEFAULT FALSE,
    ip_address TEXT NOT NULL,
    user_agent TEXT,
    error_reason TEXT NULL,
    session_token TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- MFA rate limiting table (from backup 014_admin_mfa_system.sql)
CREATE TABLE IF NOT EXISTS admin_mfa_rate_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id TEXT NOT NULL DEFAULT 'admin',
    ip_address TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    locked_until DATETIME NULL,
    first_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(admin_id, ip_address)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_email ON admin_sessions(admin_email);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_email ON admin_audit_log(admin_email);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_analytics_token ON admin_session_analytics(session_token);
CREATE INDEX IF NOT EXISTS idx_session_analytics_admin ON admin_session_analytics(admin_id);
CREATE INDEX IF NOT EXISTS idx_session_analytics_login_time ON admin_session_analytics(login_time DESC);
CREATE INDEX IF NOT EXISTS idx_session_analytics_logout_time ON admin_session_analytics(logout_time);
CREATE INDEX IF NOT EXISTS idx_session_analytics_risk ON admin_session_analytics(risk_level);

CREATE INDEX IF NOT EXISTS idx_session_events_token ON admin_session_events(session_token);
CREATE INDEX IF NOT EXISTS idx_session_events_type ON admin_session_events(event_type);
CREATE INDEX IF NOT EXISTS idx_session_events_timestamp ON admin_session_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_session_events_severity ON admin_session_events(severity);

CREATE INDEX IF NOT EXISTS idx_security_incidents_id ON admin_security_incidents(incident_id);
CREATE INDEX IF NOT EXISTS idx_security_incidents_type ON admin_security_incidents(incident_type);
CREATE INDEX IF NOT EXISTS idx_security_incidents_severity ON admin_security_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_security_incidents_status ON admin_security_incidents(status);
CREATE INDEX IF NOT EXISTS idx_security_incidents_detected ON admin_security_incidents(detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_attempts_locked_until ON login_attempts(locked_until);
CREATE INDEX IF NOT EXISTS idx_login_attempts_updated_at ON login_attempts(updated_at);

CREATE INDEX IF NOT EXISTS idx_admin_activity_session ON admin_activity_log(session_token);
CREATE INDEX IF NOT EXISTS idx_admin_activity_action ON admin_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_admin_activity_created_at ON admin_activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_activity_ip ON admin_activity_log(ip_address);

CREATE INDEX IF NOT EXISTS idx_admin_mfa_config_admin_id ON admin_mfa_config(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_mfa_config_enabled ON admin_mfa_config(is_enabled);

CREATE INDEX IF NOT EXISTS idx_admin_mfa_backup_codes_admin_id ON admin_mfa_backup_codes(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_mfa_backup_codes_hash ON admin_mfa_backup_codes(code_hash);
CREATE INDEX IF NOT EXISTS idx_admin_mfa_backup_codes_unused ON admin_mfa_backup_codes(admin_id, is_used);

CREATE INDEX IF NOT EXISTS idx_admin_mfa_attempts_admin_id ON admin_mfa_attempts(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_mfa_attempts_ip ON admin_mfa_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_admin_mfa_attempts_created_at ON admin_mfa_attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_mfa_attempts_success ON admin_mfa_attempts(success);
CREATE INDEX IF NOT EXISTS idx_admin_mfa_attempts_type_success ON admin_mfa_attempts(attempt_type, success, created_at);

CREATE INDEX IF NOT EXISTS idx_admin_mfa_rate_limits_admin_ip ON admin_mfa_rate_limits(admin_id, ip_address);
CREATE INDEX IF NOT EXISTS idx_admin_mfa_rate_limits_locked_until ON admin_mfa_rate_limits(locked_until);
CREATE INDEX IF NOT EXISTS idx_admin_mfa_rate_limits_updated_at ON admin_mfa_rate_limits(updated_at);

-- System-wide audit logs table
-- Comprehensive audit logging for all system activities (data changes, admin access, financial events, etc.)
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    action TEXT NOT NULL,

    -- Target information (for data_change events)
    target_type TEXT,
    target_id TEXT,

    -- Admin/user information
    admin_user TEXT,
    session_id TEXT,
    ip_address TEXT,
    user_agent TEXT,

    -- Data change tracking (for data_change events)
    before_value TEXT,
    after_value TEXT,
    changed_fields TEXT,

    -- Admin access tracking (for admin_access events)
    request_method TEXT,
    request_url TEXT,
    request_body TEXT,
    response_status INTEGER,
    response_time_ms INTEGER,
    error_message TEXT,

    -- Data processing tracking (for data_processing events - GDPR compliance)
    data_subject_id TEXT,
    data_type TEXT,
    processing_purpose TEXT,
    legal_basis TEXT,
    retention_period TEXT,

    -- Financial event tracking (for financial_event events)
    amount_cents INTEGER,
    currency TEXT,
    transaction_reference TEXT,
    payment_status TEXT,

    -- Configuration change tracking (for config_change events)
    config_key TEXT,
    config_environment TEXT,

    -- General metadata
    metadata TEXT,
    severity TEXT DEFAULT 'info',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_user ON audit_logs(admin_user);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_session ON audit_logs(session_id);
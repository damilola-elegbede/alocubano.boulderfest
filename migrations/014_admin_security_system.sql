-- Migration: 014 - Admin Security System
-- Purpose: Admin authentication and session management
-- Dependencies: 002_schema_migrations.sql

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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_email ON admin_sessions(admin_email);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_email ON admin_audit_log(admin_email);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at DESC);
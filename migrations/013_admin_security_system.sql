-- Migration: 013 - Admin Security System
-- Purpose: Admin login attempts, sessions, and activity tracking
-- Dependencies: 012_action_tokens.sql

-- Login attempts tracking table (EXACT schema from 009_admin_rate_limiting.sql)
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

-- Admin session tracking table (EXACT schema from 011_admin_mfa_system.sql)
CREATE TABLE IF NOT EXISTS admin_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_token TEXT NOT NULL UNIQUE,
    ip_address TEXT NOT NULL,
    user_agent TEXT,
    mfa_verified BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_verified_at DATETIME NULL,
    requires_mfa_setup BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    last_accessed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Admin activity log table (EXACT schema from 009_admin_rate_limiting.sql)
CREATE TABLE IF NOT EXISTS admin_activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_token TEXT,
    action TEXT NOT NULL,
    resource TEXT,
    ip_address TEXT NOT NULL,
    user_agent TEXT,
    request_details TEXT, -- JSON string
    success BOOLEAN NOT NULL DEFAULT TRUE,
    error_message TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance (EXACT from 009_admin_rate_limiting.sql)
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_attempts_locked_until ON login_attempts(locked_until);
CREATE INDEX IF NOT EXISTS idx_login_attempts_updated_at ON login_attempts(updated_at);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_is_active ON admin_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_mfa_verified ON admin_sessions(mfa_verified);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_requires_setup ON admin_sessions(requires_mfa_setup);

CREATE INDEX IF NOT EXISTS idx_admin_activity_session ON admin_activity_log(session_token);
CREATE INDEX IF NOT EXISTS idx_admin_activity_action ON admin_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_admin_activity_created_at ON admin_activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_activity_ip ON admin_activity_log(ip_address);
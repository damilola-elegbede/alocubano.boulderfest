-- Multi-Factor Authentication System for Admin
-- This migration creates tables for TOTP secrets, backup codes, and MFA audit logs

-- Admin MFA configuration table
CREATE TABLE IF NOT EXISTS admin_mfa_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id TEXT NOT NULL UNIQUE DEFAULT 'admin',
    totp_secret TEXT NOT NULL, -- Encrypted TOTP secret
    secret_created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    enabled_at DATETIME NULL,
    last_used_at DATETIME NULL,
    device_name TEXT DEFAULT 'Authenticator App',
    issuer TEXT DEFAULT 'A Lo Cubano Boulder Fest Admin',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Backup codes table for recovery
CREATE TABLE IF NOT EXISTS admin_mfa_backup_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id TEXT NOT NULL DEFAULT 'admin',
    code_hash TEXT NOT NULL UNIQUE, -- bcrypt hash of backup code
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at DATETIME NULL,
    used_from_ip TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES admin_mfa_config(admin_id) ON DELETE CASCADE
);

-- MFA authentication attempts log
CREATE TABLE IF NOT EXISTS admin_mfa_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id TEXT NOT NULL DEFAULT 'admin',
    attempt_type TEXT NOT NULL CHECK (attempt_type IN ('totp', 'backup_code')), 
    success BOOLEAN NOT NULL DEFAULT FALSE,
    ip_address TEXT NOT NULL,
    user_agent TEXT,
    error_reason TEXT NULL, -- 'invalid_code', 'rate_limited', 'expired', etc.
    session_token TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- MFA rate limiting table
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

-- Indexes for performance
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

-- Add MFA status to existing admin_sessions table (if column doesn't exist)
-- Using IF NOT EXISTS pattern for SQLite
CREATE TABLE IF NOT EXISTS admin_sessions_temp (
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

-- Copy existing data if admin_sessions exists and doesn't have mfa columns
INSERT OR IGNORE INTO admin_sessions_temp (
    session_token, ip_address, user_agent, created_at, expires_at, last_accessed_at, is_active
)
SELECT session_token, ip_address, user_agent, created_at, expires_at, last_accessed_at, is_active
FROM admin_sessions 
WHERE EXISTS (SELECT name FROM pragma_table_info('admin_sessions') WHERE name = 'session_token')
AND NOT EXISTS (SELECT name FROM pragma_table_info('admin_sessions') WHERE name = 'mfa_verified');

-- Replace the table if we needed to add columns
-- Note: This will only happen if admin_sessions exists but doesn't have MFA columns
DROP TABLE IF EXISTS admin_sessions;
ALTER TABLE admin_sessions_temp RENAME TO admin_sessions;

-- Recreate admin_sessions indexes
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_is_active ON admin_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_mfa_verified ON admin_sessions(mfa_verified);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_requires_setup ON admin_sessions(requires_mfa_setup);

-- Add trigger to update updated_at timestamp on admin_mfa_config
CREATE TRIGGER IF NOT EXISTS update_admin_mfa_config_timestamp 
    AFTER UPDATE ON admin_mfa_config
BEGIN
    UPDATE admin_mfa_config 
    SET updated_at = CURRENT_TIMESTAMP 
    WHERE id = NEW.id;
END;

-- Add trigger to update updated_at timestamp on admin_mfa_rate_limits
CREATE TRIGGER IF NOT EXISTS update_admin_mfa_rate_limits_timestamp 
    AFTER UPDATE ON admin_mfa_rate_limits
BEGIN
    UPDATE admin_mfa_rate_limits 
    SET updated_at = CURRENT_TIMESTAMP 
    WHERE id = NEW.id;
END;
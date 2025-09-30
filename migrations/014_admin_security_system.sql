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
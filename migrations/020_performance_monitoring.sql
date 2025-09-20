-- Migration: 020 - Performance Monitoring System
-- Purpose: Health checks, error logs, performance metrics, and admin tools
-- Dependencies: 019_multi_event_architecture.sql

-- Performance metrics table for web vitals tracking (EXACT from 001_core_tables.sql)
CREATE TABLE IF NOT EXISTS performance_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    metric_value REAL NOT NULL,
    page_url TEXT NOT NULL,
    device_type TEXT,
    connection_type TEXT,
    browser_info TEXT,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admin audit log for tracking administrative actions (EXACT from 001_core_tables.sql)
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_user TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    old_value TEXT,
    new_value TEXT,
    ip_address TEXT,
    user_agent TEXT,
    performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Check-in sessions for event management (EXACT from 001_core_tables.sql)
CREATE TABLE IF NOT EXISTS checkin_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    staff_name TEXT,
    device_info TEXT,
    total_checkins INTEGER DEFAULT 0,
    location TEXT
);

-- Health check status tracking (EXACT from 001_core_tables.sql)
CREATE TABLE IF NOT EXISTS health_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'unhealthy')),
    response_time_ms INTEGER,
    error_message TEXT,
    metadata TEXT,
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Error tracking for system monitoring (EXACT from 001_core_tables.sql)
CREATE TABLE IF NOT EXISTS error_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    error_id TEXT UNIQUE NOT NULL,
    error_type TEXT NOT NULL,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    request_url TEXT,
    request_method TEXT,
    user_agent TEXT,
    ip_address TEXT,
    session_id TEXT,
    severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    resolved BOOLEAN DEFAULT FALSE,
    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Basic indexes for performance monitoring tables
CREATE INDEX IF NOT EXISTS idx_performance_session ON performance_metrics(session_id);
CREATE INDEX IF NOT EXISTS idx_performance_page ON performance_metrics(page_url);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs(resolved);
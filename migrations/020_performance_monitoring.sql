-- Migration: 020 - Performance Monitoring
-- Purpose: Performance metrics and health monitoring
-- Dependencies: 002_schema_migrations.sql

-- Performance metrics
CREATE TABLE IF NOT EXISTS performance_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_name TEXT NOT NULL,
    metric_value REAL NOT NULL,
    metric_type TEXT NOT NULL,
    endpoint TEXT,
    request_id TEXT,
    user_agent TEXT,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT
);

-- Health checks
CREATE TABLE IF NOT EXISTS health_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    check_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'unhealthy')),
    response_time_ms INTEGER,
    error_message TEXT,
    checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_performance_metrics_name ON performance_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_recorded_at ON performance_metrics(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_checks_name ON health_checks(check_name);
CREATE INDEX IF NOT EXISTS idx_health_checks_checked_at ON health_checks(checked_at DESC);
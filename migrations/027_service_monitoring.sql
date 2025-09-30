-- Migration: 027 - Service Monitoring Tables
-- Purpose: Service health monitoring and circuit breaker tracking
-- Dependencies: 002_schema_migrations.sql

-- Service health monitoring
CREATE TABLE IF NOT EXISTS service_health (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'unknown')),
    response_time_ms INTEGER,
    error_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    last_check_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT
);

-- Circuit breaker state
CREATE TABLE IF NOT EXISTS circuit_breaker_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_name TEXT UNIQUE NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('closed', 'open', 'half_open')),
    failure_count INTEGER DEFAULT 0,
    last_failure_at DATETIME,
    last_success_at DATETIME,
    next_retry_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Security Alerts table (from security-alert-service.js)
CREATE TABLE IF NOT EXISTS security_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id TEXT NOT NULL UNIQUE,
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    admin_id TEXT,
    session_token TEXT,
    ip_address TEXT,
    title TEXT NOT NULL,
    description TEXT,
    evidence TEXT,
    indicators TEXT,
    trigger_conditions TEXT,
    affected_resources TEXT,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'suppressed')),
    response_actions TEXT,
    escalated BOOLEAN DEFAULT FALSE,
    auto_resolved BOOLEAN DEFAULT FALSE,
    triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at DATETIME,
    resolved_at DATETIME,
    source_service TEXT DEFAULT 'admin-security',
    correlation_id TEXT,
    parent_alert_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Security Alert Metrics table (from security-alert-service.js)
CREATE TABLE IF NOT EXISTS security_alert_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_type TEXT NOT NULL,
    metric_value INTEGER NOT NULL,
    timeframe TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    ip_address TEXT,
    measured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    window_start DATETIME,
    window_end DATETIME,
    metadata TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_service_health_name ON service_health(service_name);
CREATE INDEX IF NOT EXISTS idx_service_health_status ON service_health(status);
CREATE INDEX IF NOT EXISTS idx_service_health_last_check ON service_health(last_check_at DESC);
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_name ON circuit_breaker_state(service_name);
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_state ON circuit_breaker_state(state);
CREATE INDEX IF NOT EXISTS idx_security_alerts_type_severity ON security_alerts(alert_type, severity, triggered_at);
CREATE INDEX IF NOT EXISTS idx_security_alerts_status ON security_alerts(status, triggered_at);
CREATE INDEX IF NOT EXISTS idx_security_alerts_admin ON security_alerts(admin_id, triggered_at);
CREATE INDEX IF NOT EXISTS idx_security_alerts_ip ON security_alerts(ip_address, triggered_at);
CREATE INDEX IF NOT EXISTS idx_security_metrics_type_entity ON security_alert_metrics(metric_type, entity_id, measured_at);
CREATE INDEX IF NOT EXISTS idx_security_metrics_entity ON security_alert_metrics(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_security_metrics_time ON security_alert_metrics(measured_at);
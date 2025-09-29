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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_service_health_name ON service_health(service_name);
CREATE INDEX IF NOT EXISTS idx_service_health_status ON service_health(status);
CREATE INDEX IF NOT EXISTS idx_service_health_last_check ON service_health(last_check_at DESC);
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_name ON circuit_breaker_state(service_name);
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_state ON circuit_breaker_state(state);
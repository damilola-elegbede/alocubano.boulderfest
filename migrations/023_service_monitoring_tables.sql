-- Migration: 023 - Service Monitoring Tables
-- Purpose: Create monitoring tables required by admin-session-monitor.js and security-alert-service.js
-- Dependencies: 022_data_population_and_cleanup.sql

-- Admin Session Analytics table (from admin-session-monitor.js lines 104-137)
CREATE TABLE IF NOT EXISTS admin_session_analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_token TEXT NOT NULL,
  admin_id TEXT NOT NULL,
  login_time DATETIME NOT NULL,
  logout_time DATETIME,
  duration_seconds INTEGER,
  ip_address TEXT NOT NULL,
  user_agent TEXT,

  -- Activity metrics
  page_views INTEGER DEFAULT 0,
  api_calls INTEGER DEFAULT 0,
  failed_operations INTEGER DEFAULT 0,

  -- Security metrics
  security_score INTEGER DEFAULT 50,
  anomaly_indicators TEXT, -- JSON array of detected anomalies
  mfa_used BOOLEAN DEFAULT FALSE,
  mfa_verified_at DATETIME,

  -- Geographical and device info
  country_code TEXT,
  device_fingerprint TEXT,
  browser_fingerprint TEXT,

  -- Risk assessment
  risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Admin Session Events table (from admin-session-monitor.js lines 140-159)
CREATE TABLE IF NOT EXISTS admin_session_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_token TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT, -- JSON
  ip_address TEXT,
  user_agent TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,

  -- Security context
  previous_ip TEXT,
  ip_changed BOOLEAN DEFAULT FALSE,
  user_agent_changed BOOLEAN DEFAULT FALSE,

  -- Event classification
  severity TEXT DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
  requires_investigation BOOLEAN DEFAULT FALSE
);

-- Admin Security Incidents table (from admin-session-monitor.js lines 168-199)
CREATE TABLE IF NOT EXISTS admin_security_incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id TEXT NOT NULL UNIQUE,
  incident_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),

  -- Associated entities
  session_token TEXT,
  admin_id TEXT,
  ip_address TEXT,

  -- Incident details
  title TEXT NOT NULL,
  description TEXT,
  indicators TEXT, -- JSON array
  evidence TEXT, -- JSON object

  -- Response tracking
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'false_positive')),
  assigned_to TEXT,
  resolution_notes TEXT,

  -- Timestamps
  detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,

  -- Automation
  auto_resolved BOOLEAN DEFAULT FALSE,
  escalated BOOLEAN DEFAULT FALSE
);

-- Security Alerts table (from security-alert-service.js lines 176-216)
CREATE TABLE IF NOT EXISTS security_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id TEXT NOT NULL UNIQUE,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),

  -- Associated entities
  admin_id TEXT,
  session_token TEXT,
  ip_address TEXT,

  -- Alert details
  title TEXT NOT NULL,
  description TEXT,
  evidence TEXT, -- JSON object
  indicators TEXT, -- JSON array

  -- Context
  trigger_conditions TEXT, -- JSON object
  affected_resources TEXT, -- JSON array

  -- Response tracking
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'suppressed')),
  response_actions TEXT, -- JSON array of actions taken
  escalated BOOLEAN DEFAULT FALSE,
  auto_resolved BOOLEAN DEFAULT FALSE,

  -- Timing
  triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at DATETIME,
  resolved_at DATETIME,

  -- Metadata
  source_service TEXT DEFAULT 'admin-security',
  correlation_id TEXT,
  parent_alert_id TEXT,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Security Alert Metrics table (from security-alert-service.js lines 219-239)
CREATE TABLE IF NOT EXISTS security_alert_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric_type TEXT NOT NULL,
  metric_value INTEGER NOT NULL,
  timeframe TEXT NOT NULL,

  -- Context
  entity_type TEXT,
  entity_id TEXT,
  ip_address TEXT,

  -- Timing
  measured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  window_start DATETIME,
  window_end DATETIME,

  -- Metadata
  metadata TEXT -- JSON object
);

-- Create performance indexes for admin_session_analytics (from admin-session-monitor.js lines 162-165)
CREATE INDEX IF NOT EXISTS idx_session_analytics_token ON admin_session_analytics(session_token);
CREATE INDEX IF NOT EXISTS idx_session_analytics_admin ON admin_session_analytics(admin_id, login_time);

-- Create performance indexes for admin_session_events (from admin-session-monitor.js lines 164-165)
CREATE INDEX IF NOT EXISTS idx_session_events_token ON admin_session_events(session_token, timestamp);
CREATE INDEX IF NOT EXISTS idx_session_events_type ON admin_session_events(event_type, timestamp);

-- Create performance indexes for admin_security_incidents (from admin-session-monitor.js lines 202-203)
CREATE INDEX IF NOT EXISTS idx_security_incidents_type ON admin_security_incidents(incident_type, severity);
CREATE INDEX IF NOT EXISTS idx_security_incidents_status ON admin_security_incidents(status, detected_at);

-- Create performance indexes for security_alerts (from security-alert-service.js lines 242-245)
CREATE INDEX IF NOT EXISTS idx_security_alerts_type_severity ON security_alerts(alert_type, severity, triggered_at);
CREATE INDEX IF NOT EXISTS idx_security_alerts_status ON security_alerts(status, triggered_at);
CREATE INDEX IF NOT EXISTS idx_security_alerts_admin ON security_alerts(admin_id, triggered_at);
CREATE INDEX IF NOT EXISTS idx_security_alerts_ip ON security_alerts(ip_address, triggered_at);

-- Create performance indexes for security_alert_metrics (from security-alert-service.js lines 248-250)
CREATE INDEX IF NOT EXISTS idx_security_metrics_type_entity ON security_alert_metrics(metric_type, entity_id, measured_at);
CREATE INDEX IF NOT EXISTS idx_security_metrics_entity ON security_alert_metrics(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_security_metrics_time ON security_alert_metrics(measured_at);
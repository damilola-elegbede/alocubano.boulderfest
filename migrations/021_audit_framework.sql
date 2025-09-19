-- Migration: 021 - Comprehensive Audit Framework
-- Purpose: Complete audit system with financial reconciliation
-- Dependencies: 020_performance_monitoring.sql

-- Create audit_logs table for centralized audit logging (EXACT schema from 024_audit_service_framework.sql + 025_financial_reconciliation_system.sql + 026_fix_audit_logs_unique_constraint.sql)
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    admin_user TEXT,
    session_id TEXT,

    -- Request context
    ip_address TEXT,
    user_agent TEXT,
    request_method TEXT,
    request_url TEXT,
    request_body TEXT,
    response_status INTEGER,
    response_time_ms INTEGER,

    -- Data changes
    before_value TEXT,
    after_value TEXT,
    changed_fields TEXT,

    -- Financial events
    amount_cents INTEGER,
    currency TEXT DEFAULT 'USD',
    transaction_reference TEXT,
    payment_status TEXT,

    -- GDPR compliance
    data_subject_id TEXT,
    data_type TEXT,
    processing_purpose TEXT,
    legal_basis TEXT,
    retention_period TEXT,

    -- System configuration
    config_key TEXT,
    config_environment TEXT,

    -- Metadata and timing
    metadata TEXT,
    error_message TEXT,
    severity TEXT DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
    source_service TEXT DEFAULT 'festival-platform',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Financial reconciliation fields (EXACT from migration 025)
    reconciliation_status TEXT DEFAULT 'pending' CHECK (
        reconciliation_status IN ('pending', 'reconciled', 'discrepancy', 'resolved', 'investigating')
    ),
    reconciliation_date TIMESTAMP NULL,
    reconciliation_notes TEXT NULL,
    settlement_id TEXT NULL,
    settlement_date TIMESTAMP NULL,
    fees_cents INTEGER DEFAULT 0,
    net_amount_cents INTEGER NULL,
    external_reference TEXT NULL,
    dispute_status TEXT NULL CHECK (
        dispute_status IS NULL OR dispute_status IN ('none', 'pending', 'warning_needs_response', 'under_review', 'charge_refunded', 'won', 'lost')
    )
);

-- Financial reconciliation tables (EXACT from migration 025)
CREATE TABLE IF NOT EXISTS financial_reconciliation_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id TEXT UNIQUE NOT NULL,
    report_type TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT DEFAULT 'pending',
    total_transactions INTEGER DEFAULT 0,
    total_amount_cents INTEGER DEFAULT 0,
    reconciled_amount_cents INTEGER DEFAULT 0,
    discrepancy_count INTEGER DEFAULT 0,
    report_data TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS financial_discrepancies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_reference TEXT NOT NULL,
    discrepancy_type TEXT NOT NULL,
    severity TEXT DEFAULT 'medium',
    expected_amount_cents INTEGER,
    actual_amount_cents INTEGER,
    difference_cents INTEGER,
    description TEXT,
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,
    resolution_notes TEXT,
    status TEXT DEFAULT 'pending'
);

-- ALL indexes from migrations 024, 025, 026 (EXACT)
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_user ON audit_logs(admin_user, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON audit_logs(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_data_subject ON audit_logs(data_subject_id, data_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_session_id ON audit_logs(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_transaction_ref ON audit_logs(transaction_reference, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_financial ON audit_logs(event_type, amount_cents, currency) WHERE event_type = 'financial_event';
CREATE INDEX IF NOT EXISTS idx_audit_logs_gdpr ON audit_logs(data_subject_id, processing_purpose, created_at DESC) WHERE data_subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_config ON audit_logs(config_key, config_environment, created_at DESC) WHERE event_type = 'config_change';
CREATE INDEX IF NOT EXISTS idx_audit_logs_reconciliation_status ON audit_logs(reconciliation_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_settlement ON audit_logs(settlement_id, settlement_date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_financial_reconciliation ON audit_logs(event_type, reconciliation_status, amount_cents) WHERE event_type = 'financial_event';

-- Cleanup trigger to prevent unbounded growth (EXACT from migration 024)
CREATE TRIGGER IF NOT EXISTS audit_logs_cleanup
AFTER INSERT ON audit_logs
FOR EACH ROW
WHEN (SELECT COUNT(*) FROM audit_logs) > 100000  -- Only run cleanup when we have significant data
BEGIN
  DELETE FROM audit_logs
  WHERE created_at < datetime('now', '-90 days')
    AND severity NOT IN ('error', 'critical');  -- Always preserve error/critical logs
END;

-- ALL triggers from migration 026 (EXACT)
CREATE TRIGGER IF NOT EXISTS audit_tickets_insert
AFTER INSERT ON tickets
BEGIN
  INSERT INTO audit_logs (
    request_id,
    event_type,
    action,
    target_type,
    target_id,
    data_subject_id,
    data_type,
    processing_purpose,
    legal_basis,
    before_value,
    after_value,
    changed_fields,
    metadata,
    severity,
    source_service
  ) VALUES (
    'trig_' || hex(randomblob(8)),
    'data_change',
    'ticket_created',
    'ticket',
    NEW.id,
    NEW.attendee_email,
    'ticket_data',
    'ticket_management',
    'contract',
    NULL,
    json_object(
      'ticket_id', NEW.ticket_id,
      'transaction_id', NEW.transaction_id,
      'ticket_type', NEW.ticket_type,
      'event_id', NEW.event_id,
      'price_cents', NEW.price_cents,
      'attendee_email', NEW.attendee_email,
      'attendee_first_name', NEW.attendee_first_name,
      'attendee_last_name', NEW.attendee_last_name,
      'status', NEW.status,
      'registration_status', NEW.registration_status
    ),
    json_array('ticket_id', 'transaction_id', 'ticket_type', 'event_id', 'price_cents', 'attendee_email', 'attendee_first_name', 'attendee_last_name', 'status', 'registration_status'),
    json_object(
      'table_name', 'tickets',
      'operation', 'INSERT',
      'event_id', NEW.event_id,
      'business_process', 'ticket_creation',
      'risk_assessment', 'low'
    ),
    'info',
    'audit_trigger'
  );
END;

CREATE TRIGGER IF NOT EXISTS audit_transactions_insert
AFTER INSERT ON transactions
BEGIN
  INSERT INTO audit_logs (
    request_id,
    event_type,
    action,
    target_type,
    target_id,
    data_subject_id,
    data_type,
    processing_purpose,
    legal_basis,
    amount_cents,
    currency,
    transaction_reference,
    payment_status,
    before_value,
    after_value,
    changed_fields,
    metadata,
    severity,
    source_service
  ) VALUES (
    'trig_' || hex(randomblob(8)),
    'financial_event',
    'transaction_created',
    'transaction',
    NEW.id,
    NEW.customer_email,
    'financial_data',
    'payment_processing',
    'contract',
    NEW.amount_cents,
    NEW.currency,
    NEW.transaction_id,
    NEW.status,
    NULL,
    json_object(
      'transaction_id', NEW.transaction_id,
      'type', NEW.type,
      'status', NEW.status,
      'amount_cents', NEW.amount_cents,
      'currency', NEW.currency,
      'customer_email', NEW.customer_email,
      'customer_name', NEW.customer_name,
      'stripe_session_id', NEW.stripe_session_id,
      'event_id', NEW.event_id
    ),
    json_array('transaction_id', 'type', 'status', 'amount_cents', 'currency', 'customer_email', 'customer_name', 'stripe_session_id', 'event_id'),
    json_object(
      'table_name', 'transactions',
      'operation', 'INSERT',
      'business_process', 'payment_processing',
      'risk_assessment', CASE
        WHEN NEW.amount_cents > 100000 THEN 'high'
        WHEN NEW.amount_cents > 50000 THEN 'medium'
        ELSE 'low'
      END,
      'payment_method_type', NEW.payment_method_type
    ),
    CASE
      WHEN NEW.amount_cents > 100000 THEN 'warning'
      ELSE 'info'
    END,
    'audit_trigger'
  );
END;

-- ALL views from migration 026 (EXACT)
CREATE VIEW IF NOT EXISTS v_daily_financial_summary AS
SELECT
  DATE(al.created_at) as transaction_date,
  al.currency,
  COUNT(*) as transaction_count,
  SUM(al.amount_cents) as gross_amount_cents,
  SUM(al.fees_cents) as total_fees_cents,
  SUM(al.net_amount_cents) as net_amount_cents,
  COUNT(CASE WHEN al.reconciliation_status = 'reconciled' THEN 1 END) as reconciled_count,
  COUNT(CASE WHEN al.reconciliation_status = 'discrepancy' THEN 1 END) as discrepancy_count,
  COUNT(CASE WHEN al.payment_status = 'refunded' THEN 1 END) as refund_count,
  SUM(CASE WHEN al.payment_status = 'refunded' THEN al.amount_cents ELSE 0 END) as refund_amount_cents
FROM audit_logs al
WHERE al.event_type = 'financial_event'
  AND al.amount_cents IS NOT NULL
GROUP BY DATE(al.created_at), al.currency;

CREATE VIEW IF NOT EXISTS v_unreconciled_transactions AS
SELECT
  al.id,
  al.request_id,
  al.transaction_reference,
  al.amount_cents,
  al.currency,
  al.payment_status,
  al.reconciliation_status,
  al.created_at,
  al.settlement_id,
  al.error_message
FROM audit_logs al
WHERE al.event_type = 'financial_event'
  AND al.reconciliation_status IN ('pending', 'discrepancy', 'investigating');

CREATE VIEW IF NOT EXISTS v_financial_compliance_report AS
SELECT
  DATE(al.created_at) as report_date,
  al.currency,
  COUNT(DISTINCT al.transaction_reference) as unique_transactions,
  SUM(al.amount_cents) as total_volume_cents,
  COUNT(CASE WHEN al.reconciliation_status = 'reconciled' THEN 1 END) as reconciled_transactions,
  COUNT(CASE WHEN al.reconciliation_status != 'reconciled' THEN 1 END) as pending_reconciliation,
  ROUND(
    COUNT(CASE WHEN al.reconciliation_status = 'reconciled' THEN 1 END) * 100.0 / COUNT(*),
    2
  ) as reconciliation_percentage,
  COUNT(CASE WHEN fd.id IS NOT NULL THEN 1 END) as discrepancy_count,
  MAX(al.created_at) as last_transaction_time
FROM audit_logs al
LEFT JOIN financial_discrepancies fd ON al.transaction_reference = fd.transaction_reference
WHERE al.event_type = 'financial_event'
  AND al.amount_cents IS NOT NULL
GROUP BY DATE(al.created_at), al.currency;
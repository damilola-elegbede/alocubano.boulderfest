-- Financial Reconciliation System Migration
-- Enhances audit_logs table and creates financial reconciliation infrastructure
-- Purpose: Enable comprehensive financial reconciliation and compliance reporting

-- Add reconciliation status fields to audit_logs table for financial events
ALTER TABLE audit_logs ADD COLUMN reconciliation_status TEXT DEFAULT 'pending' CHECK (
  reconciliation_status IN ('pending', 'reconciled', 'discrepancy', 'resolved', 'investigating')
);

ALTER TABLE audit_logs ADD COLUMN reconciliation_date TIMESTAMP NULL;
ALTER TABLE audit_logs ADD COLUMN reconciliation_notes TEXT NULL;
ALTER TABLE audit_logs ADD COLUMN settlement_id TEXT NULL;
ALTER TABLE audit_logs ADD COLUMN settlement_date TIMESTAMP NULL;
ALTER TABLE audit_logs ADD COLUMN fees_cents INTEGER DEFAULT 0;
ALTER TABLE audit_logs ADD COLUMN net_amount_cents INTEGER NULL;
ALTER TABLE audit_logs ADD COLUMN external_reference TEXT NULL;
ALTER TABLE audit_logs ADD COLUMN dispute_status TEXT NULL CHECK (
  dispute_status IS NULL OR dispute_status IN ('none', 'pending', 'warning_needs_response', 'under_review', 'charge_refunded', 'won', 'lost')
);

-- Create financial_reconciliation_reports table for daily reconciliation tracking
CREATE TABLE IF NOT EXISTS financial_reconciliation_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_date DATE NOT NULL UNIQUE,
  report_type TEXT NOT NULL DEFAULT 'daily' CHECK (report_type IN ('daily', 'weekly', 'monthly', 'settlement')),

  -- Stripe vs Database comparison
  stripe_gross_amount_cents INTEGER NOT NULL DEFAULT 0,
  database_gross_amount_cents INTEGER NOT NULL DEFAULT 0,
  amount_variance_cents INTEGER NOT NULL DEFAULT 0,

  -- Transaction counts
  stripe_transaction_count INTEGER NOT NULL DEFAULT 0,
  database_transaction_count INTEGER NOT NULL DEFAULT 0,
  transaction_count_variance INTEGER NOT NULL DEFAULT 0,

  -- Fee analysis
  stripe_fees_cents INTEGER NOT NULL DEFAULT 0,
  calculated_fees_cents INTEGER NOT NULL DEFAULT 0,
  fee_variance_cents INTEGER NOT NULL DEFAULT 0,

  -- Net amounts
  stripe_net_amount_cents INTEGER NOT NULL DEFAULT 0,
  database_net_amount_cents INTEGER NOT NULL DEFAULT 0,
  net_variance_cents INTEGER NOT NULL DEFAULT 0,

  -- Refund tracking
  refunds_amount_cents INTEGER NOT NULL DEFAULT 0,
  refunds_count INTEGER NOT NULL DEFAULT 0,

  -- Settlement tracking
  settlement_id TEXT NULL,
  settlement_amount_cents INTEGER NULL,
  settlement_status TEXT DEFAULT 'pending' CHECK (
    settlement_status IN ('pending', 'paid', 'failed', 'canceled')
  ),

  -- Reconciliation status
  reconciliation_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    reconciliation_status IN ('pending', 'in_progress', 'reconciled', 'discrepancies_found', 'resolved')
  ),
  discrepancy_count INTEGER NOT NULL DEFAULT 0,
  manual_review_required BOOLEAN DEFAULT FALSE,

  -- Metadata
  currency TEXT NOT NULL DEFAULT 'USD',
  report_generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reconciled_at TIMESTAMP NULL,
  reconciled_by TEXT NULL,
  notes TEXT NULL,

  -- Data sources
  stripe_data_fetched_at TIMESTAMP NULL,
  database_data_fetched_at TIMESTAMP NULL,
  external_references TEXT NULL -- JSON array of external system references
);

-- Create financial_discrepancies table for tracking specific discrepancies
CREATE TABLE IF NOT EXISTS financial_discrepancies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES financial_reconciliation_reports(id) ON DELETE CASCADE,
  discrepancy_type TEXT NOT NULL CHECK (
    discrepancy_type IN ('amount_mismatch', 'missing_transaction', 'extra_transaction', 'fee_mismatch', 'settlement_mismatch', 'refund_mismatch', 'timing_difference', 'other')
  ),

  -- Transaction details
  transaction_reference TEXT NULL, -- Internal transaction ID
  external_reference TEXT NULL,   -- Stripe/external system ID

  -- Amount details
  expected_amount_cents INTEGER NULL,
  actual_amount_cents INTEGER NULL,
  variance_cents INTEGER NULL,
  currency TEXT DEFAULT 'USD',

  -- Status and resolution
  status TEXT NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'investigating', 'resolved', 'accepted_variance', 'escalated')
  ),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (
    severity IN ('low', 'medium', 'high', 'critical')
  ),

  -- Resolution tracking
  assigned_to TEXT NULL,
  resolution_notes TEXT NULL,
  resolved_at TIMESTAMP NULL,
  resolution_action TEXT NULL,

  -- Audit trail
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT DEFAULT 'system',

  -- Additional context
  related_audit_log_id INTEGER NULL REFERENCES audit_logs(id),
  metadata TEXT NULL -- JSON for additional context
);

-- Create financial_settlement_tracking table for bank settlement reconciliation
CREATE TABLE IF NOT EXISTS financial_settlement_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_id TEXT NOT NULL UNIQUE, -- Stripe settlement ID
  settlement_date DATE NOT NULL,
  settlement_type TEXT NOT NULL CHECK (settlement_type IN ('automatic', 'manual', 'express')),

  -- Settlement amounts
  gross_amount_cents INTEGER NOT NULL,
  fees_cents INTEGER NOT NULL,
  net_amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',

  -- Bank reconciliation
  bank_transaction_reference TEXT NULL,
  bank_received_date DATE NULL,
  bank_amount_cents INTEGER NULL,
  bank_reconciled BOOLEAN DEFAULT FALSE,
  bank_reconciliation_variance_cents INTEGER DEFAULT 0,

  -- Status tracking
  settlement_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    settlement_status IN ('pending', 'in_transit', 'paid', 'failed', 'canceled')
  ),
  reconciliation_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    reconciliation_status IN ('pending', 'matched', 'variance', 'missing', 'duplicate')
  ),

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reconciled_at TIMESTAMP NULL,
  notes TEXT NULL,

  -- External references
  stripe_settlement_data TEXT NULL, -- JSON dump of Stripe settlement object
  bank_statement_reference TEXT NULL
);

-- Create performance indexes for financial reconciliation queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_reconciliation_status ON audit_logs(reconciliation_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_settlement ON audit_logs(settlement_id, settlement_date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_financial_reconciliation ON audit_logs(event_type, reconciliation_status, amount_cents)
WHERE event_type = 'financial_event';

CREATE INDEX IF NOT EXISTS idx_financial_reconciliation_reports_date ON financial_reconciliation_reports(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_financial_reconciliation_reports_status ON financial_reconciliation_reports(reconciliation_status, report_date DESC);

CREATE INDEX IF NOT EXISTS idx_financial_discrepancies_report ON financial_discrepancies(report_id, status);
CREATE INDEX IF NOT EXISTS idx_financial_discrepancies_status ON financial_discrepancies(status, severity, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_discrepancies_transaction ON financial_discrepancies(transaction_reference, external_reference);

CREATE INDEX IF NOT EXISTS idx_settlement_tracking_date ON financial_settlement_tracking(settlement_date DESC);
CREATE INDEX IF NOT EXISTS idx_settlement_tracking_status ON financial_settlement_tracking(settlement_status, reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_settlement_tracking_bank ON financial_settlement_tracking(bank_received_date, bank_reconciled);

-- Create financial reporting views for common queries
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

-- Create trigger to auto-update last_updated_at in financial_discrepancies
CREATE TRIGGER IF NOT EXISTS trg_financial_discrepancies_updated_at
AFTER UPDATE ON financial_discrepancies
FOR EACH ROW
BEGIN
  UPDATE financial_discrepancies
  SET last_updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
END;

-- Create trigger to auto-update updated_at in financial_settlement_tracking
CREATE TRIGGER IF NOT EXISTS trg_settlement_tracking_updated_at
AFTER UPDATE ON financial_settlement_tracking
FOR EACH ROW
BEGIN
  UPDATE financial_settlement_tracking
  SET updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
END;

-- Insert initial audit entry for financial reconciliation system
INSERT OR IGNORE INTO audit_logs (
  request_id, event_type, action, severity, metadata, created_at
) VALUES (
  'init_' || strftime('%Y%m%d_%H%M%S', 'now') || '_financial_recon',
  'system_event',
  'financial_reconciliation_system_initialized',
  'info',
  '{"migration": "025_financial_reconciliation_system", "version": "1.0.0", "features": ["daily_reconciliation", "discrepancy_tracking", "settlement_reconciliation", "compliance_reporting"]}',
  CURRENT_TIMESTAMP
);
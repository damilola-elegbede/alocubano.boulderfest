-- Fix Audit Logs Unique Constraint
-- Remove overly restrictive UNIQUE(request_id, action) constraint that prevents
-- legitimate concurrent audit logging scenarios

-- Use a timestamped table name to avoid any naming conflicts
-- Step 1: Clean up any previous failed migration attempts
DROP TABLE IF EXISTS audit_logs_new;
DROP TABLE IF EXISTS audit_logs_v2;
DROP TABLE IF EXISTS audit_logs_fixed;

-- Step 2: Create table with unique name to avoid conflicts
CREATE TABLE audit_logs_fixed_20250918 (
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

  -- Financial reconciliation fields (added in migration 025)
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

  -- Note: Removed UNIQUE(request_id, action) constraint to allow legitimate concurrent scenarios
  -- The primary key (id) provides sufficient uniqueness for audit logs
);

-- Step 3: Copy existing data to new table
INSERT INTO audit_logs_fixed_20250918 SELECT * FROM audit_logs;

-- Step 4: Drop original table and all its indexes
DROP TABLE audit_logs;

-- Step 5: Rename new table to original name
ALTER TABLE audit_logs_fixed_20250918 RENAME TO audit_logs;

-- Step 6: Recreate indexes for performance (without the problematic unique constraint)
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_user ON audit_logs(admin_user, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON audit_logs(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_data_subject ON audit_logs(data_subject_id, data_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_session ON audit_logs(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_transaction ON audit_logs(transaction_reference, created_at DESC);
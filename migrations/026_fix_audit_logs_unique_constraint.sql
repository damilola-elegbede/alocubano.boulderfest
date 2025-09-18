-- Fix Audit Logs Unique Constraint
-- Remove overly restrictive UNIQUE(request_id, action) constraint that prevents
-- legitimate concurrent audit logging scenarios

-- SQLite doesn't support DROP CONSTRAINT, so we need to recreate the table
-- Step 1: Create new table without the problematic constraint
CREATE TABLE audit_logs_new (
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

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

  -- Note: Removed UNIQUE(request_id, action) constraint to allow legitimate concurrent scenarios
  -- The primary key (id) provides sufficient uniqueness for audit logs
);

-- Step 2: Copy existing data to new table
INSERT INTO audit_logs_new SELECT * FROM audit_logs;

-- Step 3: Drop old table
DROP TABLE audit_logs;

-- Step 4: Rename new table
ALTER TABLE audit_logs_new RENAME TO audit_logs;

-- Step 5: Recreate indexes for performance (without the problematic unique constraint)
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_user ON audit_logs(admin_user, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON audit_logs(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_data_subject ON audit_logs(data_subject_id, data_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_session ON audit_logs(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_transaction ON audit_logs(transaction_reference, created_at DESC);
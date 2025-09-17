-- Audit Service Framework Migration
-- Creates comprehensive audit logging infrastructure for security and compliance

-- Create audit_logs table for centralized audit logging
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

  -- Ensure unique request_id + action combinations to prevent duplicates
  UNIQUE(request_id, action)
);

-- Performance indexes for audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_user ON audit_logs(admin_user, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON audit_logs(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_data_subject ON audit_logs(data_subject_id, data_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_session_id ON audit_logs(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_transaction_ref ON audit_logs(transaction_reference);

-- Index for financial events
CREATE INDEX IF NOT EXISTS idx_audit_logs_financial ON audit_logs(event_type, amount_cents, currency)
WHERE event_type = 'financial_event';

-- Index for GDPR compliance queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_gdpr ON audit_logs(data_subject_id, processing_purpose, created_at DESC)
WHERE data_subject_id IS NOT NULL;

-- Index for configuration changes
CREATE INDEX IF NOT EXISTS idx_audit_logs_config ON audit_logs(config_key, config_environment, created_at DESC)
WHERE event_type = 'config_change';

-- Cleanup trigger to prevent unbounded growth (optional - keep last 90 days by default)
-- This can be enabled/disabled based on compliance requirements
CREATE TRIGGER IF NOT EXISTS audit_logs_cleanup
AFTER INSERT ON audit_logs
FOR EACH ROW
WHEN (SELECT COUNT(*) FROM audit_logs) > 100000  -- Only run cleanup when we have significant data
BEGIN
  DELETE FROM audit_logs
  WHERE created_at < datetime('now', '-90 days')
    AND severity NOT IN ('error', 'critical');  -- Always preserve error/critical logs
END;

-- ============================================================================
-- STEP 11: Install Automatic Database Triggers for Change Tracking
-- ============================================================================

-- Tickets table INSERT trigger - Track ticket creation
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

-- Tickets table UPDATE trigger - Track critical changes
CREATE TRIGGER IF NOT EXISTS audit_tickets_update
AFTER UPDATE ON tickets
WHEN OLD.attendee_first_name != NEW.attendee_first_name
  OR OLD.attendee_last_name != NEW.attendee_last_name
  OR OLD.attendee_email != NEW.attendee_email
  OR OLD.registration_status != NEW.registration_status
  OR OLD.status != NEW.status
  OR (OLD.checked_in_at IS NULL AND NEW.checked_in_at IS NOT NULL)
  OR (OLD.first_scanned_at IS NULL AND NEW.first_scanned_at IS NOT NULL)
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
    CASE
      WHEN OLD.status != NEW.status THEN 'ticket_status_changed'
      WHEN OLD.registration_status != NEW.registration_status THEN 'registration_status_changed'
      WHEN OLD.checked_in_at IS NULL AND NEW.checked_in_at IS NOT NULL THEN 'ticket_checked_in'
      WHEN OLD.first_scanned_at IS NULL AND NEW.first_scanned_at IS NOT NULL THEN 'ticket_first_scan'
      ELSE 'ticket_updated'
    END,
    'ticket',
    NEW.id,
    COALESCE(NEW.attendee_email, OLD.attendee_email),
    'ticket_data',
    'ticket_management',
    'contract',
    json_object(
      'attendee_first_name', OLD.attendee_first_name,
      'attendee_last_name', OLD.attendee_last_name,
      'attendee_email', OLD.attendee_email,
      'registration_status', OLD.registration_status,
      'status', OLD.status,
      'checked_in_at', OLD.checked_in_at,
      'first_scanned_at', OLD.first_scanned_at,
      'scan_count', OLD.scan_count
    ),
    json_object(
      'attendee_first_name', NEW.attendee_first_name,
      'attendee_last_name', NEW.attendee_last_name,
      'attendee_email', NEW.attendee_email,
      'registration_status', NEW.registration_status,
      'status', NEW.status,
      'checked_in_at', NEW.checked_in_at,
      'first_scanned_at', NEW.first_scanned_at,
      'scan_count', NEW.scan_count
    ),
    json_array(
      CASE WHEN OLD.attendee_first_name != NEW.attendee_first_name THEN 'attendee_first_name' END,
      CASE WHEN OLD.attendee_last_name != NEW.attendee_last_name THEN 'attendee_last_name' END,
      CASE WHEN OLD.attendee_email != NEW.attendee_email THEN 'attendee_email' END,
      CASE WHEN OLD.registration_status != NEW.registration_status THEN 'registration_status' END,
      CASE WHEN OLD.status != NEW.status THEN 'status' END,
      CASE WHEN OLD.checked_in_at != NEW.checked_in_at THEN 'checked_in_at' END,
      CASE WHEN OLD.first_scanned_at != NEW.first_scanned_at THEN 'first_scanned_at' END,
      CASE WHEN OLD.scan_count != NEW.scan_count THEN 'scan_count' END
    ),
    json_object(
      'table_name', 'tickets',
      'operation', 'UPDATE',
      'ticket_id', NEW.ticket_id,
      'event_id', NEW.event_id,
      'business_process', CASE
        WHEN OLD.status != NEW.status THEN 'ticket_lifecycle'
        WHEN OLD.registration_status != NEW.registration_status THEN 'registration_management'
        WHEN OLD.checked_in_at IS NULL AND NEW.checked_in_at IS NOT NULL THEN 'event_check_in'
        ELSE 'attendee_management'
      END,
      'risk_assessment', CASE
        WHEN OLD.status = 'valid' AND NEW.status = 'cancelled' THEN 'high'
        WHEN OLD.attendee_email != NEW.attendee_email THEN 'medium'
        WHEN OLD.checked_in_at IS NULL AND NEW.checked_in_at IS NOT NULL THEN 'medium'
        ELSE 'low'
      END
    ),
    CASE
      WHEN OLD.status = 'valid' AND NEW.status = 'cancelled' THEN 'warning'
      WHEN OLD.attendee_email != NEW.attendee_email THEN 'warning'
      ELSE 'info'
    END,
    'audit_trigger'
  );
END;

-- Transactions table INSERT trigger - Track transaction creation
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
        WHEN NEW.amount_cents > 100000 THEN 'high'     -- $1000+
        WHEN NEW.amount_cents > 50000 THEN 'medium'    -- $500+
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

-- Transactions table UPDATE trigger - Track critical changes
CREATE TRIGGER IF NOT EXISTS audit_transactions_update
AFTER UPDATE ON transactions
WHEN OLD.status != NEW.status
  OR OLD.amount_cents != NEW.amount_cents
  OR OLD.customer_email != NEW.customer_email
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
    CASE
      WHEN OLD.status != NEW.status THEN 'transaction_status_changed'
      WHEN OLD.amount_cents != NEW.amount_cents THEN 'transaction_amount_changed'
      WHEN OLD.customer_email != NEW.customer_email THEN 'transaction_customer_changed'
      ELSE 'transaction_updated'
    END,
    'transaction',
    NEW.id,
    COALESCE(NEW.customer_email, OLD.customer_email),
    'financial_data',
    'payment_processing',
    'contract',
    NEW.amount_cents,
    NEW.currency,
    NEW.transaction_id,
    NEW.status,
    json_object(
      'status', OLD.status,
      'amount_cents', OLD.amount_cents,
      'customer_email', OLD.customer_email,
      'stripe_payment_intent_id', OLD.stripe_payment_intent_id
    ),
    json_object(
      'status', NEW.status,
      'amount_cents', NEW.amount_cents,
      'customer_email', NEW.customer_email,
      'stripe_payment_intent_id', NEW.stripe_payment_intent_id
    ),
    json_array(
      CASE WHEN OLD.status != NEW.status THEN 'status' END,
      CASE WHEN OLD.amount_cents != NEW.amount_cents THEN 'amount_cents' END,
      CASE WHEN OLD.customer_email != NEW.customer_email THEN 'customer_email' END,
      CASE WHEN OLD.stripe_payment_intent_id != NEW.stripe_payment_intent_id THEN 'stripe_payment_intent_id' END
    ),
    json_object(
      'table_name', 'transactions',
      'operation', 'UPDATE',
      'transaction_id', NEW.transaction_id,
      'business_process', 'payment_processing',
      'risk_assessment', CASE
        WHEN OLD.status = 'completed' AND NEW.status IN ('refunded', 'cancelled') THEN 'critical'
        WHEN OLD.amount_cents != NEW.amount_cents THEN 'high'
        WHEN OLD.status != NEW.status THEN 'medium'
        ELSE 'low'
      END,
      'old_status', OLD.status,
      'new_status', NEW.status
    ),
    CASE
      WHEN OLD.status = 'completed' AND NEW.status IN ('refunded', 'cancelled') THEN 'critical'
      WHEN OLD.amount_cents != NEW.amount_cents THEN 'error'
      WHEN OLD.status != NEW.status THEN 'warning'
      ELSE 'info'
    END,
    'audit_trigger'
  );
END;

-- Admin sessions table INSERT trigger - Track admin access
CREATE TRIGGER IF NOT EXISTS audit_admin_sessions_insert
AFTER INSERT ON admin_sessions
BEGIN
  INSERT INTO audit_logs (
    request_id,
    event_type,
    action,
    target_type,
    target_id,
    admin_user,
    session_id,
    ip_address,
    user_agent,
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
    'admin_access',
    'admin_session_created',
    'admin_session',
    NEW.id,
    'admin',
    NEW.session_token,
    NEW.ip_address,
    NEW.user_agent,
    'session_data',
    'admin_authentication',
    'legitimate_interests',
    NULL,
    json_object(
      'session_token', substr(NEW.session_token, 1, 10) || '...',  -- Masked for security
      'ip_address', NEW.ip_address,
      'mfa_verified', NEW.mfa_verified,
      'expires_at', NEW.expires_at,
      'is_active', NEW.is_active
    ),
    json_array('session_token', 'ip_address', 'mfa_verified', 'expires_at', 'is_active'),
    json_object(
      'table_name', 'admin_sessions',
      'operation', 'INSERT',
      'business_process', 'admin_authentication',
      'risk_assessment', CASE
        WHEN NEW.mfa_verified = 0 THEN 'high'
        ELSE 'medium'
      END,
      'mfa_status', CASE WHEN NEW.mfa_verified = 1 THEN 'verified' ELSE 'pending' END
    ),
    CASE
      WHEN NEW.mfa_verified = 0 THEN 'warning'
      ELSE 'info'
    END,
    'audit_trigger'
  );
END;

-- Admin sessions table UPDATE trigger - Track session changes
CREATE TRIGGER IF NOT EXISTS audit_admin_sessions_update
AFTER UPDATE ON admin_sessions
WHEN OLD.mfa_verified != NEW.mfa_verified
  OR OLD.is_active != NEW.is_active
  OR OLD.expires_at != NEW.expires_at
BEGIN
  INSERT INTO audit_logs (
    request_id,
    event_type,
    action,
    target_type,
    target_id,
    admin_user,
    session_id,
    ip_address,
    user_agent,
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
    'admin_access',
    CASE
      WHEN OLD.mfa_verified != NEW.mfa_verified THEN 'admin_mfa_status_changed'
      WHEN OLD.is_active != NEW.is_active THEN 'admin_session_status_changed'
      WHEN OLD.expires_at != NEW.expires_at THEN 'admin_session_extended'
      ELSE 'admin_session_updated'
    END,
    'admin_session',
    NEW.id,
    'admin',
    NEW.session_token,
    NEW.ip_address,
    NEW.user_agent,
    'session_data',
    'admin_authentication',
    'legitimate_interests',
    json_object(
      'mfa_verified', OLD.mfa_verified,
      'is_active', OLD.is_active,
      'expires_at', OLD.expires_at
    ),
    json_object(
      'mfa_verified', NEW.mfa_verified,
      'is_active', NEW.is_active,
      'expires_at', NEW.expires_at
    ),
    json_array(
      CASE WHEN OLD.mfa_verified != NEW.mfa_verified THEN 'mfa_verified' END,
      CASE WHEN OLD.is_active != NEW.is_active THEN 'is_active' END,
      CASE WHEN OLD.expires_at != NEW.expires_at THEN 'expires_at' END
    ),
    json_object(
      'table_name', 'admin_sessions',
      'operation', 'UPDATE',
      'business_process', 'admin_session_management',
      'risk_assessment', CASE
        WHEN OLD.mfa_verified = 1 AND NEW.mfa_verified = 0 THEN 'critical'
        WHEN OLD.is_active = 1 AND NEW.is_active = 0 THEN 'medium'
        ELSE 'low'
      END,
      'session_change_reason', CASE
        WHEN OLD.mfa_verified != NEW.mfa_verified THEN 'mfa_verification_change'
        WHEN OLD.is_active != NEW.is_active THEN 'session_activation_change'
        WHEN OLD.expires_at != NEW.expires_at THEN 'session_extension'
        ELSE 'unknown'
      END
    ),
    CASE
      WHEN OLD.mfa_verified = 1 AND NEW.mfa_verified = 0 THEN 'critical'
      WHEN OLD.is_active = 1 AND NEW.is_active = 0 THEN 'warning'
      ELSE 'info'
    END,
    'audit_trigger'
  );
END;

-- Payment events table INSERT trigger - Track payment processing
CREATE TRIGGER IF NOT EXISTS audit_payment_events_insert
AFTER INSERT ON payment_events
BEGIN
  INSERT INTO audit_logs (
    request_id,
    event_type,
    action,
    target_type,
    target_id,
    transaction_reference,
    payment_status,
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
    'payment_processing',
    'payment_event_received',
    'payment_event',
    NEW.id,
    COALESCE(NEW.stripe_session_id, NEW.stripe_payment_intent_id, NEW.event_id),
    NEW.processing_status,
    'payment_event_data',
    'payment_processing',
    'contract',
    NULL,
    json_object(
      'event_id', NEW.event_id,
      'event_type', NEW.event_type,
      'event_source', NEW.event_source,
      'transaction_id', NEW.transaction_id,
      'processing_status', NEW.processing_status,
      'retry_count', NEW.retry_count
    ),
    json_array('event_id', 'event_type', 'event_source', 'transaction_id', 'processing_status', 'retry_count'),
    json_object(
      'table_name', 'payment_events',
      'operation', 'INSERT',
      'business_process', 'payment_webhook_processing',
      'risk_assessment', CASE
        WHEN NEW.event_type LIKE '%failed%' THEN 'high'
        WHEN NEW.event_type LIKE '%disputed%' THEN 'critical'
        WHEN NEW.event_type LIKE '%refund%' THEN 'medium'
        ELSE 'low'
      END,
      'webhook_source', NEW.event_source,
      'event_classification', NEW.event_type
    ),
    CASE
      WHEN NEW.event_type LIKE '%failed%' THEN 'error'
      WHEN NEW.event_type LIKE '%disputed%' THEN 'critical'
      WHEN NEW.event_type LIKE '%refund%' THEN 'warning'
      ELSE 'info'
    END,
    'audit_trigger'
  );
END;

-- Payment events table UPDATE trigger - Track processing changes
CREATE TRIGGER IF NOT EXISTS audit_payment_events_update
AFTER UPDATE ON payment_events
WHEN OLD.processing_status != NEW.processing_status
  OR OLD.retry_count != NEW.retry_count
  OR OLD.error_message != NEW.error_message
BEGIN
  INSERT INTO audit_logs (
    request_id,
    event_type,
    action,
    target_type,
    target_id,
    transaction_reference,
    payment_status,
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
    'payment_processing',
    CASE
      WHEN OLD.processing_status != NEW.processing_status THEN 'payment_processing_status_changed'
      WHEN OLD.retry_count != NEW.retry_count THEN 'payment_event_retried'
      WHEN OLD.error_message != NEW.error_message THEN 'payment_error_updated'
      ELSE 'payment_event_updated'
    END,
    'payment_event',
    NEW.id,
    COALESCE(NEW.stripe_session_id, NEW.stripe_payment_intent_id, NEW.event_id),
    NEW.processing_status,
    'payment_event_data',
    'payment_processing',
    'contract',
    json_object(
      'processing_status', OLD.processing_status,
      'retry_count', OLD.retry_count,
      'error_message', OLD.error_message,
      'processed_at', OLD.processed_at
    ),
    json_object(
      'processing_status', NEW.processing_status,
      'retry_count', NEW.retry_count,
      'error_message', NEW.error_message,
      'processed_at', NEW.processed_at
    ),
    json_array(
      CASE WHEN OLD.processing_status != NEW.processing_status THEN 'processing_status' END,
      CASE WHEN OLD.retry_count != NEW.retry_count THEN 'retry_count' END,
      CASE WHEN OLD.error_message != NEW.error_message THEN 'error_message' END,
      CASE WHEN OLD.processed_at != NEW.processed_at THEN 'processed_at' END
    ),
    json_object(
      'table_name', 'payment_events',
      'operation', 'UPDATE',
      'event_id', NEW.event_id,
      'event_type', NEW.event_type,
      'business_process', 'payment_webhook_processing',
      'risk_assessment', CASE
        WHEN OLD.processing_status = 'pending' AND NEW.processing_status = 'failed' THEN 'high'
        WHEN NEW.retry_count > 3 THEN 'medium'
        ELSE 'low'
      END,
      'status_transition', OLD.processing_status || ' -> ' || NEW.processing_status
    ),
    CASE
      WHEN OLD.processing_status = 'pending' AND NEW.processing_status = 'failed' THEN 'error'
      WHEN NEW.retry_count > 3 THEN 'warning'
      ELSE 'info'
    END,
    'audit_trigger'
  );
END;

-- ============================================================================
-- STEP 12: Insert Initial Audit Entry
-- ============================================================================

-- Insert initial audit entry to mark system start
INSERT OR IGNORE INTO audit_logs (
  request_id, event_type, action, severity, metadata, created_at
) VALUES (
  'init_' || strftime('%Y%m%d_%H%M%S', 'now'),
  'system_event',
  'audit_framework_initialized',
  'info',
  '{"migration": "024_audit_service_framework_with_triggers", "version": "2.0.0", "triggers_installed": true}',
  CURRENT_TIMESTAMP
);
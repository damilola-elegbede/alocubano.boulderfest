-- Migration: 021 - PayPal Integration
-- Purpose: PayPal webhook events and audit logging
-- Dependencies: 004_transactions.sql

-- PayPal webhook events table
CREATE TABLE IF NOT EXISTS paypal_webhook_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- PayPal Event Identification
    event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    webhook_id TEXT,

    -- Transaction Linking
    paypal_order_id TEXT,
    paypal_capture_id TEXT,
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,

    -- Event Data and Processing
    event_data TEXT NOT NULL,
    verification_status TEXT DEFAULT 'pending' CHECK (
        verification_status IN ('pending', 'verified', 'failed', 'invalid_signature')
    ),
    processing_status TEXT DEFAULT 'pending' CHECK (
        processing_status IN ('pending', 'processed', 'failed', 'skipped', 'duplicate')
    ),

    -- Error Handling and Retry Logic
    error_message TEXT,
    retry_count INTEGER DEFAULT 0 CHECK (retry_count >= 0),
    max_retries INTEGER DEFAULT 3 CHECK (max_retries >= 0),
    last_retry_at TIMESTAMP,

    -- Audit Trail
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- PayPal-specific metadata
    resource_version TEXT,
    summary TEXT,
    resource_type TEXT,

    -- Test mode support
    is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1))
);

-- PayPal audit log
CREATE TABLE IF NOT EXISTS paypal_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_type TEXT NOT NULL CHECK (
        operation_type IN ('webhook_received', 'order_created', 'payment_captured',
                          'refund_issued', 'verification_failed', 'duplicate_detected')
    ),
    paypal_order_id TEXT,
    paypal_capture_id TEXT,
    transaction_id INTEGER REFERENCES transactions(id),
    webhook_event_id INTEGER REFERENCES paypal_webhook_events(id),
    user_agent TEXT,
    ip_address TEXT,
    request_data TEXT,
    response_data TEXT,
    security_context TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_event_id ON paypal_webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_paypal_order_id ON paypal_webhook_events(paypal_order_id) WHERE paypal_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_transaction_id ON paypal_webhook_events(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_processing_status ON paypal_webhook_events(processing_status);
CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_test_mode ON paypal_webhook_events(is_test, processing_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paypal_audit_log_operation_type ON paypal_audit_log(operation_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paypal_audit_log_paypal_order_id ON paypal_audit_log(paypal_order_id) WHERE paypal_order_id IS NOT NULL;

-- Trigger
CREATE TRIGGER IF NOT EXISTS update_paypal_webhook_events_timestamp
AFTER UPDATE ON paypal_webhook_events
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE paypal_webhook_events
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

-- Auto-link PayPal webhook events to transactions
CREATE TRIGGER IF NOT EXISTS trg_paypal_webhook_link_transaction
AFTER INSERT ON paypal_webhook_events
FOR EACH ROW
WHEN NEW.paypal_order_id IS NOT NULL AND NEW.transaction_id IS NULL
BEGIN
    UPDATE paypal_webhook_events
    SET transaction_id = (
        SELECT id FROM transactions
        WHERE paypal_order_id = NEW.paypal_order_id
        LIMIT 1
    )
    WHERE id = NEW.id;
END;
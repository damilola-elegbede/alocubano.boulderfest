-- Migration: 029 - PayPal Reporting Views
-- Purpose: PayPal reconciliation and health monitoring views
-- Dependencies: 004_transactions.sql, 021_paypal_integration.sql

-- View for unified payment processor reporting
CREATE VIEW IF NOT EXISTS v_payment_processor_summary AS
SELECT
    payment_processor,
    status,
    is_test,
    COUNT(*) as transaction_count,
    SUM(amount_cents) as total_amount_cents,
    AVG(amount_cents) as avg_amount_cents,
    MIN(amount_cents) as min_amount_cents,
    MAX(amount_cents) as max_amount_cents,
    MIN(created_at) as first_transaction,
    MAX(created_at) as last_transaction
FROM transactions
GROUP BY payment_processor, status, is_test;

-- View for PayPal webhook event monitoring
CREATE VIEW IF NOT EXISTS v_paypal_webhook_status AS
SELECT
    event_type,
    processing_status,
    verification_status,
    is_test,
    COUNT(*) as event_count,
    MIN(created_at) as first_event,
    MAX(created_at) as last_event,
    AVG(CAST((julianday(processed_at) - julianday(created_at)) * 86400 AS INTEGER)) as avg_processing_time_seconds
FROM paypal_webhook_events
GROUP BY event_type, processing_status, verification_status, is_test;

-- View for PayPal transaction reconciliation
CREATE VIEW IF NOT EXISTS v_paypal_transaction_reconciliation AS
SELECT
    t.id as transaction_id,
    t.transaction_id as business_transaction_id,
    t.paypal_order_id,
    t.paypal_capture_id,
    t.status as transaction_status,
    t.amount_cents,
    t.created_at as transaction_created,
    pwe.id as webhook_event_id,
    pwe.event_type,
    pwe.processing_status,
    pwe.verification_status,
    pwe.created_at as webhook_created,
    pwe.processed_at as webhook_processed,
    CASE
        WHEN pwe.id IS NULL THEN 'missing_webhook'
        WHEN pwe.processing_status = 'failed' THEN 'webhook_failed'
        WHEN pwe.verification_status != 'verified' THEN 'verification_failed'
        WHEN t.status = 'completed' AND pwe.processing_status = 'processed' THEN 'reconciled'
        ELSE 'pending'
    END as reconciliation_status
FROM transactions t
LEFT JOIN paypal_webhook_events pwe ON t.paypal_order_id = pwe.paypal_order_id
WHERE t.payment_processor = 'paypal';

-- View for unprocessed PayPal events
CREATE VIEW IF NOT EXISTS v_paypal_unprocessed_events AS
SELECT
    id,
    event_id,
    event_type,
    paypal_order_id,
    processing_status,
    verification_status,
    retry_count,
    created_at,
    last_retry_at,
    error_message,
    CASE
        WHEN retry_count >= 3 THEN 'requires_attention'
        WHEN julianday('now') - julianday(created_at) > 1 THEN 'stale'
        ELSE 'pending'
    END as urgency_level
FROM paypal_webhook_events
WHERE processing_status IN ('pending', 'failed')
ORDER BY
    CASE urgency_level
        WHEN 'requires_attention' THEN 1
        WHEN 'stale' THEN 2
        ELSE 3
    END,
    created_at ASC;

-- View for PayPal system health monitoring
CREATE VIEW IF NOT EXISTS v_paypal_health_metrics AS
SELECT
    'paypal_transactions_today' as metric_name,
    COUNT(*) as metric_value,
    'count' as metric_type,
    DATE('now') as metric_date
FROM transactions
WHERE payment_processor = 'paypal'
  AND DATE(created_at) = DATE('now')
  AND is_test = 0

UNION ALL

SELECT
    'paypal_webhook_events_today' as metric_name,
    COUNT(*) as metric_value,
    'count' as metric_type,
    DATE('now') as metric_date
FROM paypal_webhook_events
WHERE DATE(created_at) = DATE('now')
  AND is_test = 0

UNION ALL

SELECT
    'paypal_failed_webhooks_24h' as metric_name,
    COUNT(*) as metric_value,
    'count' as metric_type,
    DATE('now') as metric_date
FROM paypal_webhook_events
WHERE processing_status = 'failed'
  AND created_at >= datetime('now', '-24 hours')
  AND is_test = 0

UNION ALL

SELECT
    'paypal_verification_failures_24h' as metric_name,
    COUNT(*) as metric_value,
    'count' as metric_type,
    DATE('now') as metric_date
FROM paypal_webhook_events
WHERE verification_status IN ('failed', 'invalid_signature')
  AND created_at >= datetime('now', '-24 hours')
  AND is_test = 0;
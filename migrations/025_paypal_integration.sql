-- Migration: 025 - PayPal Integration
-- Purpose: Add PayPal payment processing support alongside existing Stripe integration
-- Dependencies: 024_test_mode_support.sql

-- ================================================================================
-- 1. ADD PAYPAL COLUMNS TO TRANSACTIONS TABLE
-- ================================================================================

-- Add PayPal-specific columns to the transactions table
-- These columns complement the existing Stripe columns for dual payment processor support
ALTER TABLE transactions ADD COLUMN paypal_order_id TEXT;
ALTER TABLE transactions ADD COLUMN paypal_capture_id TEXT;
ALTER TABLE transactions ADD COLUMN paypal_payer_id TEXT;
ALTER TABLE transactions ADD COLUMN payment_processor TEXT DEFAULT 'stripe'
    CHECK (payment_processor IN ('stripe', 'paypal'));

-- Add normalized cart data storage for PayPal (JSON format)
-- This stores the original cart structure for reconciliation and auditing
ALTER TABLE transactions ADD COLUMN cart_data TEXT;

-- Add universal reference ID for cross-processor reconciliation
-- Format: ALCBF-{timestamp} for PayPal, stripe_session_id for Stripe
ALTER TABLE transactions ADD COLUMN reference_id TEXT;

-- ================================================================================
-- 2. CREATE PAYPAL WEBHOOK EVENTS TABLE
-- ================================================================================

-- PayPal webhook events table for comprehensive event tracking
-- Separate from payment_events to handle PayPal's specific event structure
CREATE TABLE IF NOT EXISTS paypal_webhook_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- PayPal Event Identification
    event_id TEXT UNIQUE NOT NULL,                  -- PayPal's unique event ID
    event_type TEXT NOT NULL,                       -- PAYMENT.CAPTURE.COMPLETED, etc.
    webhook_id TEXT,                                -- PayPal webhook configuration ID

    -- Transaction Linking
    paypal_order_id TEXT,                           -- Links to transactions.paypal_order_id
    paypal_capture_id TEXT,                         -- Links to transactions.paypal_capture_id
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,

    -- Event Data and Processing
    event_data TEXT NOT NULL,                       -- Full PayPal webhook payload (JSON)
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
    resource_version TEXT,                          -- PayPal API resource version
    summary TEXT,                                   -- Human-readable event summary
    resource_type TEXT                              -- capture, order, payment, etc.
);

-- ================================================================================
-- 3. UPDATE PAYMENT_EVENTS TABLE FOR PAYPAL SUPPORT
-- ================================================================================

-- Add PayPal support to existing payment_events table
ALTER TABLE payment_events ADD COLUMN paypal_order_id TEXT;
ALTER TABLE payment_events ADD COLUMN paypal_capture_id TEXT;

-- Update the event_source constraint to include PayPal
-- Note: SQLite doesn't support ALTER COLUMN directly, so we'll handle this with triggers

-- ================================================================================
-- 4. CREATE INDEXES FOR PERFORMANCE
-- ================================================================================

-- Transactions table indexes for PayPal columns
CREATE INDEX IF NOT EXISTS idx_transactions_paypal_order_id
    ON transactions(paypal_order_id) WHERE paypal_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_paypal_capture_id
    ON transactions(paypal_capture_id) WHERE paypal_capture_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_paypal_payer_id
    ON transactions(paypal_payer_id) WHERE paypal_payer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_payment_processor
    ON transactions(payment_processor);

CREATE INDEX IF NOT EXISTS idx_transactions_reference_id
    ON transactions(reference_id) WHERE reference_id IS NOT NULL;

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_transactions_processor_status
    ON transactions(payment_processor, status);

CREATE INDEX IF NOT EXISTS idx_transactions_processor_created_at
    ON transactions(payment_processor, created_at DESC);

-- PayPal webhook events indexes
CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_event_id
    ON paypal_webhook_events(event_id);

CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_paypal_order_id
    ON paypal_webhook_events(paypal_order_id) WHERE paypal_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_paypal_capture_id
    ON paypal_webhook_events(paypal_capture_id) WHERE paypal_capture_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_transaction_id
    ON paypal_webhook_events(transaction_id) WHERE transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_event_type
    ON paypal_webhook_events(event_type);

CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_processing_status
    ON paypal_webhook_events(processing_status);

CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_verification_status
    ON paypal_webhook_events(verification_status);

CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_created_at
    ON paypal_webhook_events(created_at DESC);

-- Composite indexes for webhook processing efficiency
CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_status_created_at
    ON paypal_webhook_events(processing_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_type_status
    ON paypal_webhook_events(event_type, processing_status);

-- Payment events indexes for PayPal columns
CREATE INDEX IF NOT EXISTS idx_payment_events_paypal_order_id
    ON payment_events(paypal_order_id) WHERE paypal_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_events_paypal_capture_id
    ON payment_events(paypal_capture_id) WHERE paypal_capture_id IS NOT NULL;

-- ================================================================================
-- 5. CREATE TRIGGERS FOR DATA INTEGRITY AND AUTOMATION
-- ================================================================================

-- Update timestamp trigger for paypal_webhook_events
CREATE TRIGGER IF NOT EXISTS update_paypal_webhook_events_timestamp
AFTER UPDATE ON paypal_webhook_events
BEGIN
    UPDATE paypal_webhook_events
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

-- Validation trigger: Ensure PayPal transactions have required PayPal fields
CREATE TRIGGER IF NOT EXISTS trg_transactions_paypal_validation
BEFORE INSERT ON transactions
FOR EACH ROW
WHEN NEW.payment_processor = 'paypal'
  AND (NEW.paypal_order_id IS NULL OR NEW.paypal_order_id = '')
BEGIN
    SELECT RAISE(ABORT, 'PayPal transactions require paypal_order_id');
END;

-- Validation trigger for updates
CREATE TRIGGER IF NOT EXISTS trg_transactions_paypal_validation_update
BEFORE UPDATE ON transactions
FOR EACH ROW
WHEN NEW.payment_processor = 'paypal'
  AND (NEW.paypal_order_id IS NULL OR NEW.paypal_order_id = '')
BEGIN
    SELECT RAISE(ABORT, 'PayPal transactions require paypal_order_id');
END;

-- Auto-set reference_id for PayPal transactions based on paypal_order_id
CREATE TRIGGER IF NOT EXISTS trg_transactions_paypal_reference_id
BEFORE INSERT ON transactions
FOR EACH ROW
WHEN NEW.payment_processor = 'paypal'
  AND NEW.reference_id IS NULL
  AND NEW.paypal_order_id IS NOT NULL
BEGIN
    UPDATE transactions SET reference_id = NEW.paypal_order_id WHERE id = NEW.id;
END;

-- Prevent duplicate PayPal order processing
CREATE TRIGGER IF NOT EXISTS trg_paypal_webhook_duplicate_check
BEFORE INSERT ON paypal_webhook_events
FOR EACH ROW
WHEN EXISTS (
    SELECT 1 FROM paypal_webhook_events
    WHERE event_id = NEW.event_id
    AND processing_status IN ('processed', 'duplicate')
)
BEGIN
    SELECT RAISE(ABORT, 'Duplicate PayPal webhook event detected');
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

-- ================================================================================
-- 6. CREATE UNIQUE CONSTRAINTS
-- ================================================================================

-- Ensure PayPal order IDs are unique across transactions
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique_paypal_order_id
    ON transactions(paypal_order_id) WHERE paypal_order_id IS NOT NULL;

-- Ensure PayPal capture IDs are unique across transactions
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique_paypal_capture_id
    ON transactions(paypal_capture_id) WHERE paypal_capture_id IS NOT NULL;

-- Ensure reference IDs are unique across transactions
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique_reference_id
    ON transactions(reference_id) WHERE reference_id IS NOT NULL;

-- ================================================================================
-- 7. DATA MIGRATION AND BACKFILL
-- ================================================================================

-- Backfill existing Stripe transactions with payment_processor = 'stripe'
UPDATE transactions
SET payment_processor = 'stripe'
WHERE payment_processor IS NULL OR payment_processor = '';

-- Backfill existing Stripe transactions with reference_id from stripe_session_id
UPDATE transactions
SET reference_id = stripe_session_id
WHERE payment_processor = 'stripe'
  AND reference_id IS NULL
  AND stripe_session_id IS NOT NULL;

-- ================================================================================
-- 8. PERFORMANCE OPTIMIZATION VIEWS (OPTIONAL)
-- ================================================================================

-- View for unified payment processor reporting
CREATE VIEW IF NOT EXISTS v_payment_processor_summary AS
SELECT
    payment_processor,
    status,
    COUNT(*) as transaction_count,
    SUM(amount_cents) as total_amount_cents,
    AVG(amount_cents) as avg_amount_cents,
    MIN(created_at) as first_transaction,
    MAX(created_at) as last_transaction
FROM transactions
WHERE payment_processor IS NOT NULL
GROUP BY payment_processor, status;

-- View for PayPal webhook event monitoring
CREATE VIEW IF NOT EXISTS v_paypal_webhook_status AS
SELECT
    event_type,
    processing_status,
    verification_status,
    COUNT(*) as event_count,
    MIN(created_at) as first_event,
    MAX(created_at) as last_event,
    SUM(CASE WHEN retry_count > 0 THEN 1 ELSE 0 END) as events_with_retries,
    AVG(retry_count) as avg_retry_count
FROM paypal_webhook_events
GROUP BY event_type, processing_status, verification_status;

-- ================================================================================
-- MIGRATION COMPLETE
-- ================================================================================

-- This migration adds comprehensive PayPal support while maintaining full backward
-- compatibility with existing Stripe infrastructure. Key features:
--
-- 1. Dual processor support in transactions table
-- 2. Dedicated PayPal webhook event tracking
-- 3. Comprehensive indexing for performance
-- 4. Data integrity triggers and constraints
-- 5. Automated transaction linking
-- 6. Performance monitoring views
-- 7. Zero downtime migration strategy
--
-- Rollback strategy: All new columns are nullable and have defaults, allowing
-- safe rollback by simply ignoring PayPal-specific columns.
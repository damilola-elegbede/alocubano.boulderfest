-- Migration: 007 - Payment Events Table
-- Purpose: Payment events for audit trail tracking
-- Dependencies: 004_transactions.sql

-- Payment events for audit trail
CREATE TABLE IF NOT EXISTS payment_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    event_source TEXT DEFAULT 'stripe',
    source TEXT DEFAULT 'stripe',           -- Payment processor source (matches code usage)
    source_id TEXT,                         -- External event ID from payment processor
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
    stripe_session_id TEXT,
    stripe_payment_intent_id TEXT,
    paypal_order_id TEXT,
    paypal_capture_id TEXT,
    event_data TEXT NOT NULL,
    processed_at TIMESTAMP,
    processing_status TEXT DEFAULT 'pending' CHECK (
        processing_status IN ('pending', 'processed', 'failed', 'skipped')
    ),
    previous_status TEXT,                   -- Status before event (for audit trail)
    new_status TEXT,                        -- Status after event (for audit trail)
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for payment events
CREATE INDEX IF NOT EXISTS idx_payment_events_transaction_id ON payment_events(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_type ON payment_events(event_type);
CREATE INDEX IF NOT EXISTS idx_payment_events_created_at ON payment_events(created_at);
CREATE INDEX IF NOT EXISTS idx_payment_events_event_type_created_at ON payment_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_events_processing_status ON payment_events(processing_status);
CREATE INDEX IF NOT EXISTS idx_payment_events_source_id ON payment_events(source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_events_paypal_order_id ON payment_events(paypal_order_id) WHERE paypal_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_events_paypal_capture_id ON payment_events(paypal_capture_id) WHERE paypal_capture_id IS NOT NULL;
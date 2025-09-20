-- Migration: 005 - Payment Events Table
-- Purpose: Payment events for audit trail tracking
-- Dependencies: 003_transactions.sql

-- Payment events for audit trail (EXACT schema from 005_payment_events.sql)
CREATE TABLE IF NOT EXISTS payment_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    event_source TEXT DEFAULT 'stripe',
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
    stripe_session_id TEXT,
    stripe_payment_intent_id TEXT,
    event_data TEXT NOT NULL,
    processed_at TIMESTAMP,
    processing_status TEXT DEFAULT 'pending' CHECK (
        processing_status IN ('pending', 'processed', 'failed', 'skipped')
    ),
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
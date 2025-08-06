-- Payment events for audit trail
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
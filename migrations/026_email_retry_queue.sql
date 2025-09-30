-- Migration: 026 - Email Retry Queue
-- Purpose: Queue for failed email delivery retries
-- Dependencies: 004_transactions.sql, 015_email_management_system.sql

-- Email retry queue for failed email delivery with exponential backoff
CREATE TABLE IF NOT EXISTS email_retry_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT NOT NULL,
    email_address TEXT NOT NULL,
    email_type TEXT NOT NULL CHECK (email_type IN ('ticket_confirmation', 'registration_confirmation', 'registration_reminder')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    attempt_count INTEGER DEFAULT 0,
    next_retry_at DATETIME NOT NULL,
    sent_at DATETIME,
    last_error TEXT,
    metadata TEXT,
    is_test INTEGER DEFAULT 0 CHECK (is_test IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient retry processing
CREATE INDEX IF NOT EXISTS idx_email_retry_queue_status_retry ON email_retry_queue(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_email_retry_queue_transaction ON email_retry_queue(transaction_id);
CREATE INDEX IF NOT EXISTS idx_email_retry_queue_email_address ON email_retry_queue(email_address);
CREATE INDEX IF NOT EXISTS idx_email_retry_queue_email_type ON email_retry_queue(email_type);

-- Trigger to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_email_retry_queue_timestamp
AFTER UPDATE ON email_retry_queue
FOR EACH ROW
BEGIN
    UPDATE email_retry_queue SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
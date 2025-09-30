-- Migration: 033 - Email Retry Queue Schema Update
-- Purpose: Update email_retry_queue table schema to match current implementation
-- Dependencies: 026_email_retry_queue.sql, 004_transactions.sql
--
-- BREAKING CHANGE: This migration drops and recreates the email_retry_queue table
-- Any pending retry queue entries will be lost. This is acceptable since:
-- 1. The retry queue is a temporary buffer for failed emails
-- 2. Failed emails can be resent manually if needed
-- 3. The old schema is incompatible with current code

-- Drop old email_retry_queue table
DROP TABLE IF EXISTS email_retry_queue;

-- Recreate with updated schema matching current implementation
CREATE TABLE email_retry_queue (
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
CREATE INDEX idx_email_retry_queue_status_retry ON email_retry_queue(status, next_retry_at);
CREATE INDEX idx_email_retry_queue_transaction ON email_retry_queue(transaction_id);
CREATE INDEX idx_email_retry_queue_email_address ON email_retry_queue(email_address);
CREATE INDEX idx_email_retry_queue_email_type ON email_retry_queue(email_type);

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_email_retry_queue_timestamp
AFTER UPDATE ON email_retry_queue
FOR EACH ROW
BEGIN
    UPDATE email_retry_queue SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

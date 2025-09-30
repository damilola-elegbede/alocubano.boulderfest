-- Migration: 026 - Email Retry Queue
-- Purpose: Queue for failed email delivery retries
-- Dependencies: 015_email_management_system.sql

-- Email retry queue
CREATE TABLE IF NOT EXISTS email_retry_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_email TEXT NOT NULL,
    template_id TEXT NOT NULL,
    template_data TEXT NOT NULL,
    priority INTEGER DEFAULT 5,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at DATETIME NOT NULL,
    last_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_retry_queue_next_retry ON email_retry_queue(next_retry_at, retry_count);
CREATE INDEX IF NOT EXISTS idx_email_retry_queue_priority ON email_retry_queue(priority DESC, next_retry_at);
-- Migration: Add email retry queue table
-- Description: Store failed email attempts for retry
-- Created: 2025-01-26

-- Create table for failed email retry queue
CREATE TABLE IF NOT EXISTS email_retry_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT NOT NULL,
  email_address TEXT NOT NULL,
  email_type TEXT NOT NULL DEFAULT 'ticket_confirmation',
  attempt_count INTEGER DEFAULT 0,
  last_error TEXT,
  metadata TEXT, -- JSON string for additional data
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  next_retry_at DATETIME NOT NULL,
  completed_at DATETIME,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  is_test INTEGER DEFAULT 0
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_email_retry_status ON email_retry_queue(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_email_retry_transaction ON email_retry_queue(transaction_id);
CREATE INDEX IF NOT EXISTS idx_email_retry_test ON email_retry_queue(is_test);
-- Add bounce_count column to email_subscribers table
-- Migration 013: Add bounce tracking for email subscribers

-- Add bounce_count column with default value of 0
ALTER TABLE email_subscribers ADD COLUMN bounce_count INTEGER DEFAULT 0;

-- Add index for bounce_count for performance queries
CREATE INDEX IF NOT EXISTS idx_email_subscribers_bounce_count ON email_subscribers(bounce_count);
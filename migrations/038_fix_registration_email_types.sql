-- Migration: 038 - Fix Registration Email Types
-- Purpose: Add missing email types to registration_emails table constraint
-- Issue: Email logging failing due to missing types in CHECK constraint
-- Dependencies: 017_registration_emails.sql

-- Drop the old table and recreate with expanded email types
-- SQLite doesn't support ALTER CONSTRAINT, so we need to recreate
DROP TABLE IF EXISTS registration_emails_old;

-- Rename existing table
ALTER TABLE registration_emails RENAME TO registration_emails_old;

-- Create new table with expanded email types
CREATE TABLE registration_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL,
    transaction_id TEXT,
    email_type TEXT NOT NULL CHECK (email_type IN (
        -- Original types
        'registration_invitation',
        'reminder_72hr',
        'reminder_48hr',
        'reminder_24hr',
        'reminder_final',
        'attendee_confirmation',
        'purchaser_completion',
        -- New types for batch registration
        'confirmation',
        'batch_summary',
        'batch_summary_plaintext',
        'individual_confirmation',
        -- Additional types for future use
        'registration_complete',
        'ticket_update',
        'event_reminder'
    )),
    recipient_email TEXT NOT NULL,
    recipient_name TEXT,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    brevo_message_id TEXT,
    opened_at DATETIME,
    clicked_at DATETIME,
    bounced_at DATETIME,
    FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id) ON DELETE CASCADE
);

-- Copy data from old table
INSERT INTO registration_emails
SELECT * FROM registration_emails_old;

-- Drop old table
DROP TABLE registration_emails_old;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_registration_emails_ticket
  ON registration_emails(ticket_id);

CREATE INDEX IF NOT EXISTS idx_registration_emails_type
  ON registration_emails(email_type, sent_at);

CREATE INDEX IF NOT EXISTS idx_registration_emails_brevo
  ON registration_emails(brevo_message_id);

-- Add index for transaction tracking
CREATE INDEX IF NOT EXISTS idx_registration_emails_transaction
  ON registration_emails(transaction_id);
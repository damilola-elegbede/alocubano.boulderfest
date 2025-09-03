-- Migration: Create registration emails audit table
-- Purpose: Track all registration-related emails for audit and analytics
-- Requirements: REQ-DB-003, REQ-EMAIL-003
-- Created: 2025-01-23

-- Up Migration
CREATE TABLE IF NOT EXISTS registration_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL,
  transaction_id TEXT,
  email_type TEXT NOT NULL CHECK (email_type IN (
    'registration_invitation',
    'reminder_72hr',
    'reminder_48hr', 
    'reminder_24hr',
    'reminder_final',
    'attendee_confirmation',
    'purchaser_completion'
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

-- Index for ticket-based queries
CREATE INDEX IF NOT EXISTS idx_registration_emails_ticket 
  ON registration_emails(ticket_id);

-- Index for email analytics by type and time
CREATE INDEX IF NOT EXISTS idx_registration_emails_type 
  ON registration_emails(email_type, sent_at);

-- Index for Brevo webhook correlation
CREATE INDEX IF NOT EXISTS idx_registration_emails_brevo 
  ON registration_emails(brevo_message_id);

-- Down Migration (Rollback)
-- DROP TABLE IF EXISTS registration_emails;
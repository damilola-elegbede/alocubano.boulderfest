-- Migration: 017 - Registration Emails
-- Purpose: Track ticket registration confirmation emails
-- Dependencies: 004_transactions.sql, 005_tickets.sql

-- Registration emails
CREATE TABLE IF NOT EXISTS registration_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id),
    email_type TEXT NOT NULL CHECK (email_type IN ('confirmation', 'reminder', 'update')),
    recipient_email TEXT NOT NULL,
    brevo_message_id TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
    sent_at DATETIME,
    delivered_at DATETIME,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_registration_emails_ticket ON registration_emails(ticket_id);
CREATE INDEX IF NOT EXISTS idx_registration_emails_transaction ON registration_emails(transaction_id);
CREATE INDEX IF NOT EXISTS idx_registration_emails_status ON registration_emails(status);
CREATE INDEX IF NOT EXISTS idx_registration_emails_created_at ON registration_emails(created_at DESC);
-- Migration: 030 - Expand Email Types
-- Purpose: Add attendee_confirmation and purchaser_completion to registration_emails email_type constraint
-- Dependencies: 017_registration_emails.sql

-- SQLite doesn't support ALTER TABLE for CHECK constraints
-- So we need to recreate the table with the new constraint

-- Step 1: Create new table with expanded constraint
CREATE TABLE IF NOT EXISTS registration_emails_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id),
    email_type TEXT NOT NULL CHECK (email_type IN ('confirmation', 'reminder', 'update', 'attendee_confirmation', 'purchaser_completion')),
    recipient_email TEXT NOT NULL,
    brevo_message_id TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
    sent_at DATETIME,
    delivered_at DATETIME,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT
);

-- Step 2: Copy existing data
INSERT INTO registration_emails_new
SELECT * FROM registration_emails;

-- Step 3: Drop old table
DROP TABLE registration_emails;

-- Step 4: Rename new table
ALTER TABLE registration_emails_new RENAME TO registration_emails;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_registration_emails_ticket ON registration_emails(ticket_id);
CREATE INDEX IF NOT EXISTS idx_registration_emails_transaction ON registration_emails(transaction_id);
CREATE INDEX IF NOT EXISTS idx_registration_emails_status ON registration_emails(status);
CREATE INDEX IF NOT EXISTS idx_registration_emails_created_at ON registration_emails(created_at DESC);
-- Migration: 016 - Registration Reminders
-- Purpose: Track registration reminder emails
-- Dependencies: 004_transactions.sql

-- Registration reminders
CREATE TABLE IF NOT EXISTS registration_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    reminder_type TEXT NOT NULL CHECK (reminder_type IN ('initial', 'followup_1', 'followup_2', 'final')),
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed')),
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_registration_reminders_transaction ON registration_reminders(transaction_id);
CREATE INDEX IF NOT EXISTS idx_registration_reminders_type ON registration_reminders(reminder_type);
CREATE INDEX IF NOT EXISTS idx_registration_reminders_sent_at ON registration_reminders(sent_at);
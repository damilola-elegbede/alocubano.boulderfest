-- Migration: 016 - Registration Reminders Table
-- Purpose: Scheduled registration reminder system
-- Dependencies: 007_tickets.sql

-- Registration reminders table (EXACT schema from 016_create_registration_reminders.sql)
CREATE TABLE IF NOT EXISTS registration_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL,
    reminder_type TEXT NOT NULL CHECK (
        reminder_type IN ('72hr', '48hr', '24hr', 'final')
    ),
    scheduled_at DATETIME NOT NULL,
    sent_at DATETIME,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (
        status IN ('scheduled', 'sent', 'failed', 'cancelled')
    ),
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id) ON DELETE CASCADE,
    UNIQUE(ticket_id, reminder_type)
);

-- Indexes for efficient queries (EXACT from 016_create_registration_reminders.sql)
CREATE INDEX IF NOT EXISTS idx_reminders_scheduled
  ON registration_reminders(scheduled_at, status)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_reminders_ticket
  ON registration_reminders(ticket_id);
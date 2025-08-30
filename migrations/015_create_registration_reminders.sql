-- Migration: Create registration reminders table
-- Purpose: Track scheduled and sent registration reminder emails
-- Requirements: REQ-DB-002
-- Created: 2025-01-23

-- Up Migration
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

-- Index for efficient queries of scheduled reminders
CREATE INDEX IF NOT EXISTS idx_reminders_scheduled 
  ON registration_reminders(scheduled_at, status) 
  WHERE status = 'scheduled';

-- Index for ticket-based queries
CREATE INDEX IF NOT EXISTS idx_reminders_ticket 
  ON registration_reminders(ticket_id);

-- Down Migration (Rollback)
-- DROP TABLE IF EXISTS registration_reminders;
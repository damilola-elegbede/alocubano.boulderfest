-- Add indexes for performance optimization on frequently queried columns
-- These queries are used heavily during registration and ticket lookup

-- Index for ticket lookups by transaction_id (used in registration)
CREATE INDEX IF NOT EXISTS idx_tickets_transaction_lookup
ON tickets(transaction_id, registration_status);

-- Index for ticket batch lookups (WHERE ticket_id IN queries)
CREATE INDEX IF NOT EXISTS idx_tickets_id_status
ON tickets(ticket_id, registration_status);

-- Index for reminder scheduling queries
CREATE INDEX IF NOT EXISTS idx_reminders_ticket_status
ON registration_reminders(ticket_id, status);

-- Index for email retry queue processing
CREATE INDEX IF NOT EXISTS idx_email_retry_status_time
ON email_retry_queue(status, next_retry_at);

-- Index for transaction lookups by session_id (most common query)
CREATE INDEX IF NOT EXISTS idx_transactions_session
ON transactions(stripe_session_id);

-- Index for registration emails history
CREATE INDEX IF NOT EXISTS idx_registration_emails_ticket
ON registration_emails(ticket_id, email_type);

-- Composite index for the common JOIN pattern
CREATE INDEX IF NOT EXISTS idx_tickets_registration_composite
ON tickets(ticket_id, transaction_id, registration_status, attendee_email);
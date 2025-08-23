-- Migration: Add registration tracking to tickets table
-- Purpose: Track ticket registration status, timestamps, and deadlines
-- Requirements: REQ-DB-001
-- Created: 2025-01-23

-- Up Migration
ALTER TABLE tickets ADD COLUMN registration_status TEXT NOT NULL DEFAULT 'pending' 
  CHECK (registration_status IN ('pending', 'completed', 'expired'));

ALTER TABLE tickets ADD COLUMN registered_at DATETIME;

ALTER TABLE tickets ADD COLUMN registration_deadline DATETIME;

-- Create composite index for efficient status queries
CREATE INDEX idx_tickets_registration_status 
  ON tickets(registration_status, registration_deadline);

-- Create partial index for pending tickets approaching deadline
CREATE INDEX idx_tickets_deadline 
  ON tickets(registration_deadline) 
  WHERE registration_status = 'pending';

-- Down Migration (Rollback)
-- DROP INDEX IF EXISTS idx_tickets_deadline;
-- DROP INDEX IF EXISTS idx_tickets_registration_status;
-- ALTER TABLE tickets DROP COLUMN registration_deadline;
-- ALTER TABLE tickets DROP COLUMN registered_at;
-- ALTER TABLE tickets DROP COLUMN registration_status;
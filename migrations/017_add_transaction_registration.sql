-- Migration: Add registration tracking fields to transactions table
-- Purpose: Track registration tokens and completion status at transaction level
-- Requirements: REQ-DB-001, REQ-SEC-001
-- Created: 2025-01-23

-- Up Migration
ALTER TABLE transactions ADD COLUMN registration_token TEXT;

ALTER TABLE transactions ADD COLUMN registration_token_expires DATETIME;

ALTER TABLE transactions ADD COLUMN registration_initiated_at DATETIME;

ALTER TABLE transactions ADD COLUMN registration_completed_at DATETIME;

ALTER TABLE transactions ADD COLUMN all_tickets_registered BOOLEAN DEFAULT FALSE;

-- Create unique index for secure token lookups
CREATE UNIQUE INDEX idx_transactions_registration_token 
  ON transactions(registration_token) 
  WHERE registration_token IS NOT NULL;

-- Down Migration (Rollback)
-- DROP INDEX IF EXISTS idx_transactions_registration_token;
-- ALTER TABLE transactions DROP COLUMN all_tickets_registered;
-- ALTER TABLE transactions DROP COLUMN registration_completed_at;
-- ALTER TABLE transactions DROP COLUMN registration_initiated_at;
-- ALTER TABLE transactions DROP COLUMN registration_token_expires;
-- ALTER TABLE transactions DROP COLUMN registration_token;
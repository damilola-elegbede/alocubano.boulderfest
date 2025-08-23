-- Migration: Add registration tracking fields to transactions table
-- Purpose: Track registration tokens and completion status at transaction level
-- Requirements: REQ-DB-001, REQ-SEC-001
-- Created: 2025-01-23

-- Up Migration
ALTER TABLE transactions ADD COLUMN registration_token TEXT;

ALTER TABLE transactions ADD COLUMN registration_token_expires DATETIME;

ALTER TABLE transactions ADD COLUMN registration_initiated_at DATETIME;

ALTER TABLE transactions ADD COLUMN registration_completed_at DATETIME;

ALTER TABLE transactions ADD COLUMN all_tickets_registered INTEGER NOT NULL DEFAULT 0
  CHECK (all_tickets_registered IN (0, 1));

-- Create unique index for secure token lookups
CREATE UNIQUE INDEX idx_transactions_registration_token 
  ON transactions(registration_token) 
  WHERE registration_token IS NOT NULL;

-- Enforce that if a token exists, an expiry exists, and token is not empty
CREATE TRIGGER trg_transactions_token_ins_chk
BEFORE INSERT ON transactions
FOR EACH ROW
WHEN NEW.registration_token IS NOT NULL
  AND (NEW.registration_token_expires IS NULL OR length(NEW.registration_token) = 0)
BEGIN
  SELECT RAISE(ABORT, 'registration_token requires non-empty token and registration_token_expires');
END;

CREATE TRIGGER trg_transactions_token_upd_chk
BEFORE UPDATE ON transactions
FOR EACH ROW
WHEN NEW.registration_token IS NOT NULL
  AND (NEW.registration_token_expires IS NULL OR length(NEW.registration_token) = 0)
BEGIN
  SELECT RAISE(ABORT, 'registration_token requires non-empty token and registration_token_expires');
END;

-- Down Migration (Rollback)
-- DROP TRIGGER IF EXISTS trg_transactions_token_upd_chk;
-- DROP TRIGGER IF EXISTS trg_transactions_token_ins_chk;
-- DROP INDEX IF EXISTS idx_transactions_registration_token;
-- ALTER TABLE transactions DROP COLUMN all_tickets_registered;
-- ALTER TABLE transactions DROP COLUMN registration_completed_at;
-- ALTER TABLE transactions DROP COLUMN registration_initiated_at;
-- ALTER TABLE transactions DROP COLUMN registration_token_expires;
-- ALTER TABLE transactions DROP COLUMN registration_token;
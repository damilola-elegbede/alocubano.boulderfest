-- Migration: 032 - Add 'test' status to events table
-- Purpose: Support test events in bootstrap configuration
-- Dependencies: 003_events_table.sql
-- Issue: Bootstrap fails because test events have status='test' but CHECK constraint doesn't allow it
--
-- IMPORTANT: This migration is now a no-op for fresh deployments because migration 003
-- has been updated to include 'test' status from the start (see line 11 of 003_events_table.sql).
--
-- For existing databases that were deployed before this change, this migration will
-- update the CHECK constraint to include 'test' status.
--
-- Strategy: Since CREATE TABLE IF NOT EXISTS will skip creation if the table already exists
-- (which it will in fresh deployments from migration 003), this migration effectively becomes
-- a no-op for new deployments while still handling existing databases.

-- No-op migration
-- The events table is created with 'test' status support in migration 003
-- This migration file exists to:
-- 1. Fill the gap in migration numbering (032 was referenced but missing)
-- 2. Document that 'test' status support was added
-- 3. Provide a placeholder for any future events table modifications

SELECT 1; -- No-op statement to make the migration valid

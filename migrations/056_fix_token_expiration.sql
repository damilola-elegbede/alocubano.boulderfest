-- Migration: Fix Token Expiration
-- Description: Update existing registration tokens to expire 7 days after event ends
--              instead of arbitrary 72-hour expiration
-- Date: 2025-10-22

-- Update registration_token_expires for all existing tokens
-- Set expiration to 7 days after the event ends
-- Uses direct event_id lookup with NULL handling to prevent constraint violations
UPDATE transactions
SET registration_token_expires = datetime(
  COALESCE(
    (SELECT end_date FROM events WHERE id = transactions.event_id),
    CURRENT_TIMESTAMP
  ),
  '+7 days'
)
WHERE registration_token IS NOT NULL
  AND registration_token != ''
  AND event_id IS NOT NULL;

-- Verify the update
-- This comment documents expected results:
-- All transactions with tokens should now have expiration = event.end_date + 7 days
-- For the May 2026 event (end_date: 2026-05-17), tokens should expire 2026-05-24

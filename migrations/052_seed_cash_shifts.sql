-- Migration 052: Seed Cash Shifts for Active/Test Events
-- Purpose: Create default cash shifts for all active and test events
-- Date: 2025-10-18
-- Author: Enable immediate cash payment processing for active events
-- Dependencies: 051_cash_shifts_event_support.sql

-- ============================================================================
-- STEP 1: Create default cash shifts for all active/test events
-- ============================================================================
-- This migration creates open cash shifts for events that need them.
-- Opening cash is always $0.00 as requested.
--
-- Idempotency: INSERT OR IGNORE ensures this can run multiple times safely.
-- The NOT EXISTS clause prevents duplicate shifts for the same event.

INSERT OR IGNORE INTO cash_shifts (
  event_id,
  opened_at,
  status,
  opening_cash_cents,
  notes
)
SELECT
  e.id,
  CURRENT_TIMESTAMP,
  'open',
  0,
  'Auto-created default shift for ' || e.name
FROM events e
WHERE e.status IN ('active', 'test')
  AND NOT EXISTS (
    SELECT 1 FROM cash_shifts cs
    WHERE cs.event_id = e.id AND cs.status = 'open'
  );

-- ============================================================================
-- STEP 2: Data validation
-- ============================================================================
SELECT CASE
  WHEN (SELECT COUNT(*) FROM cash_shifts WHERE status = 'open') > 0
  THEN 'Migration successful - ' || (SELECT COUNT(*) FROM cash_shifts WHERE status = 'open') || ' open cash shift(s) available'
  ELSE 'Warning: No open cash shifts created (may already exist or no active/test events found)'
END as migration_status;

-- Migration: 048 - Update Existing Tickets to 3-Scan Limit
-- Purpose: Retroactively apply the 3-scan limit to all existing tickets
-- Dependencies: 047_reduce_scan_limit.sql
--
-- RATIONALE:
-- Migration 047 changed the default max_scan_count from 10 to 3 but intentionally
-- preserved existing tickets at their higher limits. This migration completes the
-- policy change by updating ALL tickets to the new 3-scan limit for consistency.
--
-- The event uses wristband-based access control where:
-- 1. First scan → Attendee receives physical wristband
-- 2. Wristband → Provides all subsequent venue access (no more scans needed)
-- 3. Additional scans (2-3) → Error recovery only (QR read failures, network issues)
--
-- SCOPE:
-- Updates all tickets where max_scan_count > 3 to max_scan_count = 3
-- Preserves scan_count values (no impact on already-scanned tickets)
-- Tickets with max_scan_count <= 3 are unchanged
--
-- IMPACT:
-- - Existing tickets with max_scan_count of 5, 10, etc. → Reduced to 3
-- - No breaking changes to API contracts or ticket functionality
-- - Consistent scan limit policy across all tickets (new and existing)
-- - Scan counts remain unchanged (only the limit is updated)

BEGIN TRANSACTION;

-- Update existing tickets to new scan limit
-- Only affects tickets with max_scan_count > 3
UPDATE tickets
SET max_scan_count = 3,
    updated_at = CURRENT_TIMESTAMP
WHERE max_scan_count > 3;

-- Verify the update
-- This should return 0 if all tickets now have max_scan_count <= 3
SELECT COUNT(*) as remaining_tickets_over_limit
FROM tickets
WHERE max_scan_count > 3;

COMMIT;

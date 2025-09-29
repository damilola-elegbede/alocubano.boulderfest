-- Migration: 044 - Backfill ticket_type_id and Recalculate sold_count
-- Purpose: Populate ticket_type_id for existing tickets and sync sold_count
-- Dependencies: 043_add_ticket_type_id_fk.sql
-- Context: Existing tickets have NULL ticket_type_id, causing triggers to not fire
--          and sold_count to be incorrect. This migration fixes historical data.

-- =============================================================================
-- PROBLEM STATEMENT
-- =============================================================================
-- Prior to migration 043, tickets used the ticket_type column (TEXT) directly.
-- Migration 043 added ticket_type_id (FK to ticket_types.id) but didn't backfill.
-- Result:
--   1. Existing tickets have ticket_type_id = NULL
--   2. Triggers (increment/decrement) don't fire for NULL values
--   3. ticket_types.sold_count is 0 or incorrect for all types
--
-- This migration:
--   1. Backfills ticket_type_id from ticket_type column
--   2. Recalculates sold_count for all ticket types based on actual tickets

-- =============================================================================
-- STEP 1: Backfill ticket_type_id for existing tickets
-- =============================================================================
-- Strategy: UPDATE tickets WHERE ticket_type matches ticket_types.id
-- Safety: Only updates where ticket_type is valid and ticket_type_id is NULL

UPDATE tickets
SET ticket_type_id = ticket_type
WHERE ticket_type_id IS NULL
  AND ticket_type IS NOT NULL
  AND ticket_type IN (SELECT id FROM ticket_types);

-- Expected Result: All tickets with valid ticket_type now have ticket_type_id populated

-- =============================================================================
-- STEP 2: Recalculate sold_count for all ticket types
-- =============================================================================
-- Strategy: Count valid tickets per ticket_type_id and update ticket_types
-- Safety: Uses subquery to ensure accurate count, handles missing data gracefully

UPDATE ticket_types
SET sold_count = (
  SELECT COUNT(*)
  FROM tickets
  WHERE tickets.ticket_type_id = ticket_types.id
    AND tickets.status = 'valid'
)
WHERE id IN (SELECT DISTINCT ticket_type_id FROM tickets WHERE ticket_type_id IS NOT NULL);

-- Expected Result: ticket_types.sold_count matches actual count of valid tickets

-- =============================================================================
-- STEP 3: Handle edge cases - Set sold_count to 0 for unused types
-- =============================================================================
-- Strategy: Reset sold_count to 0 for ticket types with no tickets
-- Safety: Ensures consistency for ticket types that have never been sold

UPDATE ticket_types
SET sold_count = 0
WHERE id NOT IN (SELECT DISTINCT ticket_type_id FROM tickets WHERE ticket_type_id IS NOT NULL);

-- Expected Result: Unused ticket types have sold_count = 0

-- =============================================================================
-- VERIFICATION QUERIES (Comments for debugging)
-- =============================================================================

-- 1. Check tickets with NULL ticket_type_id (should be 0 after migration)
-- SELECT COUNT(*) as null_ticket_type_id_count
-- FROM tickets
-- WHERE ticket_type_id IS NULL AND ticket_type IS NOT NULL;

-- 2. Verify ticket_type_id backfill matches ticket_type
-- SELECT ticket_type, ticket_type_id, COUNT(*) as count
-- FROM tickets
-- GROUP BY ticket_type, ticket_type_id
-- ORDER BY ticket_type;

-- 3. Verify sold_count matches actual ticket counts
-- SELECT
--   tt.id,
--   tt.name,
--   tt.sold_count as recorded_count,
--   (SELECT COUNT(*) FROM tickets WHERE ticket_type_id = tt.id AND status = 'valid') as actual_count,
--   tt.sold_count - (SELECT COUNT(*) FROM tickets WHERE ticket_type_id = tt.id AND status = 'valid') as difference
-- FROM ticket_types tt
-- ORDER BY tt.id;

-- 4. Check for orphaned tickets (ticket_type not in ticket_types)
-- SELECT COUNT(*) as orphaned_tickets
-- FROM tickets
-- WHERE ticket_type NOT IN (SELECT id FROM ticket_types)
--   AND ticket_type IS NOT NULL;

-- 5. Overall summary stats
-- SELECT
--   (SELECT COUNT(*) FROM tickets) as total_tickets,
--   (SELECT COUNT(*) FROM tickets WHERE ticket_type_id IS NOT NULL) as tickets_with_type_id,
--   (SELECT SUM(sold_count) FROM ticket_types) as total_sold_count,
--   (SELECT COUNT(*) FROM tickets WHERE status = 'valid') as valid_tickets;

-- =============================================================================
-- POST-MIGRATION VALIDATION
-- =============================================================================
-- After running this migration:
-- 1. All existing tickets should have ticket_type_id populated
-- 2. ticket_types.sold_count should match COUNT(*) FROM tickets WHERE status='valid'
-- 3. Future ticket inserts/deletes will automatically update sold_count via triggers
-- 4. No manual sold_count management required going forward
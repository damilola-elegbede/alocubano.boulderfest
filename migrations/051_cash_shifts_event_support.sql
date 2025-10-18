-- Migration 051: Add Event Support to Cash Shifts
-- Purpose: Enable per-event cash shift management
-- Date: 2025-10-18
-- Author: Feature Request - Cash shifts should be per event

-- ============================================================================
-- STEP 1: Add event_id column to cash_shifts table
-- ============================================================================
-- Add column with NULL allowed initially (existing shifts won't have event_id)
ALTER TABLE cash_shifts ADD COLUMN event_id INTEGER;

-- ============================================================================
-- STEP 2: Create foreign key index for performance
-- ============================================================================
-- Index for event_id lookups and JOIN operations
CREATE INDEX IF NOT EXISTS idx_cash_shifts_event ON cash_shifts(event_id);

-- Composite index for filtering by event and status
CREATE INDEX IF NOT EXISTS idx_cash_shifts_event_status ON cash_shifts(event_id, status);

-- ============================================================================
-- STEP 3: Create trigger to auto-create default cash shift per event
-- ============================================================================
-- When an event is activated, automatically create an open cash shift for it
-- This ensures each event has a default cash shift ready for use
CREATE TRIGGER IF NOT EXISTS trg_create_default_cash_shift
AFTER UPDATE ON events
FOR EACH ROW
WHEN NEW.status = 'active'
  AND OLD.status != 'active'
  AND NOT EXISTS (SELECT 1 FROM cash_shifts WHERE event_id = NEW.id AND status = 'open')
BEGIN
  INSERT INTO cash_shifts (
    event_id,
    opened_at,
    status,
    opening_cash_cents,
    notes
  ) VALUES (
    NEW.id,
    CURRENT_TIMESTAMP,
    'open',
    0,
    'Auto-created default shift for ' || NEW.name
  );
END;

-- ============================================================================
-- STEP 4: Add notes about foreign key constraint
-- ============================================================================
-- Note: We don't add a formal FOREIGN KEY constraint here because:
-- 1. SQLite requires table recreation to add FK constraints to existing tables
-- 2. The index and application logic provide sufficient referential integrity
-- 3. ON DELETE behavior can be handled in application code or future migration
--
-- If formal FK is needed later, use this pattern:
-- ALTER TABLE cash_shifts ADD CONSTRAINT fk_cash_shifts_event
--   FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
--
-- However, this requires recreating the table in SQLite.

-- ============================================================================
-- STEP 5: Data validation
-- ============================================================================
SELECT CASE
  WHEN EXISTS (
    SELECT 1 FROM pragma_table_info('cash_shifts')
    WHERE name = 'event_id'
  )
  THEN 'Migration successful - event_id column added to cash_shifts'
  ELSE 'Warning: event_id column was not added'
END as migration_status;

-- Migration 053: Add Missing Reminder Types
-- Purpose: Add reminder types used by adaptive reminder scheduler
-- Date: 2025-10-18
-- Author: Fix for SQLITE_CONSTRAINT error on reminder scheduling
-- Dependencies: 031_update_registration_reminders_schema.sql
--
-- Issue: Code uses '12hr-post-purchase', '12hr-before-deadline', '6hr-before-deadline'
--        but database CHECK constraint only allows '24hr-post-purchase', etc.
--
-- Solution: Expand allowed reminder types to include all variants used by code

-- ============================================================================
-- STEP 1: Create new table with expanded reminder types
-- ============================================================================
CREATE TABLE IF NOT EXISTS registration_reminders_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    reminder_type TEXT NOT NULL CHECK (reminder_type IN (
        -- Legacy types (for backward compatibility)
        'initial', 'followup_1', 'followup_2', 'final',
        -- Production reminder types (EXPANDED to include all variants)
        '24hr-post-purchase', '1-week-before', '72hr-before', '24hr-before',
        '12hr-post-purchase', '12hr-before-deadline', '6hr-before-deadline',
        -- Test reminder types
        'test-5min-1', 'test-5min-2', 'test-5min-3', 'test-5min-4', 'test-5min-5', 'test-5min-6'
    )),
    scheduled_at DATETIME,
    sent_at DATETIME,
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'delivered', 'failed', 'cancelled')),
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- Ensure we don't create duplicate reminders for the same transaction and type
    UNIQUE(transaction_id, reminder_type)
);

-- ============================================================================
-- STEP 2: Migrate existing data
-- ============================================================================
INSERT INTO registration_reminders_new (
    id,
    transaction_id,
    reminder_type,
    scheduled_at,
    sent_at,
    status,
    error_message,
    created_at
)
SELECT
    id,
    transaction_id,
    reminder_type,
    scheduled_at,
    sent_at,
    status,
    error_message,
    created_at
FROM registration_reminders;

-- ============================================================================
-- STEP 3: Swap tables
-- ============================================================================
DROP TABLE registration_reminders;
ALTER TABLE registration_reminders_new RENAME TO registration_reminders;

-- ============================================================================
-- STEP 4: Recreate indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_registration_reminders_transaction ON registration_reminders(transaction_id);
CREATE INDEX IF NOT EXISTS idx_registration_reminders_type ON registration_reminders(reminder_type);
CREATE INDEX IF NOT EXISTS idx_registration_reminders_status ON registration_reminders(status);
CREATE INDEX IF NOT EXISTS idx_registration_reminders_scheduled_at ON registration_reminders(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_registration_reminders_sent_at ON registration_reminders(sent_at);

-- ============================================================================
-- STEP 5: Data validation
-- ============================================================================
SELECT CASE
  WHEN EXISTS (
    SELECT 1 FROM sqlite_master
    WHERE type='table' AND name='registration_reminders'
  )
  THEN 'Migration successful - registration_reminders table updated with new reminder types'
  ELSE 'Warning: registration_reminders table not found'
END as migration_status;

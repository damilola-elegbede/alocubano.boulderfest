-- Migration: 031 - Update Registration Reminders Schema
-- Purpose: Modernize registration_reminders table to support scheduled reminders
-- Dependencies: 016_registration_reminders.sql
--
-- Changes:
-- 1. Add scheduled_at field for cron-based scheduling
-- 2. Expand reminder_type to support new types (24hr-post-purchase, 1-week-before, etc.)
-- 3. Expand status to support 'scheduled', 'cancelled' states
-- 4. Add unique constraint for transaction_id + reminder_type
--
-- NOTE: Reminders are per TRANSACTION (one email to purchaser about all their tickets)
--       NOT per ticket (which would spam the purchaser with multiple emails)

-- SQLite doesn't support ALTER TABLE for CHECK constraints
-- So we need to recreate the table with the new schema

-- Step 1: Create new table with updated schema
CREATE TABLE IF NOT EXISTS registration_reminders_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    reminder_type TEXT NOT NULL CHECK (reminder_type IN (
        -- Legacy types (for backward compatibility)
        'initial', 'followup_1', 'followup_2', 'final',
        -- Production reminder types
        '24hr-post-purchase', '1-week-before', '72hr-before', '24hr-before',
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

-- Step 2: Migrate existing data
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
    sent_at as scheduled_at, -- Use sent_at as scheduled_at for legacy records
    sent_at,
    status,
    error_message,
    created_at
FROM registration_reminders;

-- Step 3: Drop old table
DROP TABLE registration_reminders;

-- Step 4: Rename new table
ALTER TABLE registration_reminders_new RENAME TO registration_reminders;

-- Step 5: Recreate indexes with updated schema
CREATE INDEX IF NOT EXISTS idx_registration_reminders_transaction ON registration_reminders(transaction_id);
CREATE INDEX IF NOT EXISTS idx_registration_reminders_type ON registration_reminders(reminder_type);
CREATE INDEX IF NOT EXISTS idx_registration_reminders_status ON registration_reminders(status);
CREATE INDEX IF NOT EXISTS idx_registration_reminders_scheduled_at ON registration_reminders(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_registration_reminders_sent_at ON registration_reminders(sent_at);
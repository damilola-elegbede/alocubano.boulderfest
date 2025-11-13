-- Migration: 063 - Ticket Edit Audit Log Table
-- Purpose: Enable self-service attendee information editing with full audit trail
-- Dependencies: None
--
-- Background:
--   Users cannot edit attendee information after registration
--   Typos in names/emails require admin intervention or ticket cancellation
--   No self-service correction flow exists
--
-- Solution:
--   Allow users to edit attendee information with restrictions:
--   - Only before event starts
--   - Only if ticket hasn't been scanned (scan_count = 0)
--   - Full audit trail of all changes
--   - Email notifications on changes
--
-- Security Features:
--   - Complete audit trail (who, what, when)
--   - Immutable log records (no updates/deletes)
--   - Change notifications to both old and new email addresses
--   - IP address logging for forensics

-- ============================================================================
-- STEP 1: Create ticket_edit_audit_log table
-- ============================================================================

CREATE TABLE IF NOT EXISTS ticket_edit_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Reference to edited ticket
    ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    ticket_external_id TEXT NOT NULL, -- tickets.ticket_id for easy lookup

    -- Change Details
    field_name TEXT NOT NULL CHECK(field_name IN ('attendee_first_name', 'attendee_last_name', 'attendee_email')),
    old_value TEXT,
    new_value TEXT,

    -- Audit Information
    edited_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    edited_by_email TEXT NOT NULL, -- Email of user who made the change (verified via JWT)
    ip_address TEXT,
    user_agent TEXT,

    -- Session Context
    session_token_id TEXT, -- JWT token ID for traceability

    -- Change Reason (optional, user-provided)
    reason TEXT,

    -- Notification Status
    notification_sent BOOLEAN NOT NULL DEFAULT 0,
    notification_sent_at DATETIME
);

-- ============================================================================
-- STEP 2: Create indexes for efficient lookups
-- ============================================================================

-- Fast lookup by ticket (view edit history for a ticket)
CREATE INDEX IF NOT EXISTS idx_audit_ticket_id
    ON ticket_edit_audit_log(ticket_id, edited_at DESC);

-- Fast lookup by external ticket ID
CREATE INDEX IF NOT EXISTS idx_audit_ticket_external_id
    ON ticket_edit_audit_log(ticket_external_id, edited_at DESC);

-- Fast lookup by editor email (who made changes)
CREATE INDEX IF NOT EXISTS idx_audit_editor_email
    ON ticket_edit_audit_log(edited_by_email, edited_at DESC);

-- Fast lookup for pending notifications
CREATE INDEX IF NOT EXISTS idx_audit_notification_pending
    ON ticket_edit_audit_log(notification_sent, notification_sent_at)
    WHERE notification_sent = 0;

-- ============================================================================
-- STEP 3: Create view for easy audit trail access
-- ============================================================================

CREATE VIEW IF NOT EXISTS v_ticket_edit_history AS
SELECT
    t.ticket_id,
    t.ticket_type,
    t.attendee_first_name AS current_first_name,
    t.attendee_last_name AS current_last_name,
    t.attendee_email AS current_email,
    a.field_name,
    a.old_value,
    a.new_value,
    a.edited_at,
    a.edited_by_email,
    a.ip_address,
    a.reason
FROM ticket_edit_audit_log a
JOIN tickets t ON a.ticket_id = t.id
ORDER BY a.edited_at DESC;

-- ============================================================================
-- STEP 4: Create statistics view for admin dashboard
-- ============================================================================

CREATE VIEW IF NOT EXISTS v_ticket_edit_statistics AS
SELECT
    DATE(edited_at) as edit_date,
    COUNT(*) as total_edits,
    COUNT(DISTINCT ticket_id) as unique_tickets_edited,
    COUNT(DISTINCT edited_by_email) as unique_editors,
    SUM(CASE WHEN field_name = 'attendee_first_name' THEN 1 ELSE 0 END) as first_name_edits,
    SUM(CASE WHEN field_name = 'attendee_last_name' THEN 1 ELSE 0 END) as last_name_edits,
    SUM(CASE WHEN field_name = 'attendee_email' THEN 1 ELSE 0 END) as email_edits
FROM ticket_edit_audit_log
GROUP BY DATE(edited_at)
ORDER BY edit_date DESC;

-- ============================================================================
-- STEP 5: Add trigger to prevent log tampering
-- ============================================================================

-- Prevent updates to audit log (immutable records)
CREATE TRIGGER IF NOT EXISTS prevent_audit_log_updates
BEFORE UPDATE ON ticket_edit_audit_log
BEGIN
    SELECT RAISE(ABORT, 'Audit log records are immutable - updates not allowed');
END;

-- Prevent deletes of audit log records (except via CASCADE from ticket deletion)
-- This trigger fires on explicit DELETE statements, not on CASCADE deletes
CREATE TRIGGER IF NOT EXISTS prevent_audit_log_deletes
BEFORE DELETE ON ticket_edit_audit_log
WHEN OLD.ticket_id IN (SELECT id FROM tickets)
BEGIN
    SELECT RAISE(ABORT, 'Audit log records are immutable - manual deletion not allowed');
END;

-- ============================================================================
-- STEP 6: Verification complete
-- ============================================================================

-- No data migration needed - this is a new table
-- Table will be populated by /api/tickets/:ticketId/attendee endpoint

PRAGMA foreign_keys = ON;

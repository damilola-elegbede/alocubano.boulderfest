-- Migration: Add check-in fields for admin functionality
-- Date: 2025-01-10
-- Description: Adds fields to support admin check-in functionality

-- Add check-in fields to tickets table
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMP;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS checked_in_by VARCHAR(255);

-- Create index for check-in queries
CREATE INDEX IF NOT EXISTS idx_tickets_checked_in ON tickets(checked_in_at);
CREATE INDEX IF NOT EXISTS idx_tickets_status_checkin ON tickets(status, checked_in_at);

-- Admin activity logging (using existing payment_events table)
-- Event types for admin actions:
-- - admin_login: Admin login event
-- - admin_checkin: Manual check-in by admin
-- - admin_undo_checkin: Undo check-in by admin
-- - admin_update_ticket: Ticket update by admin
-- - admin_cancel_ticket: Ticket cancellation by admin
-- - admin_export: Data export by admin

-- Example query to track admin actions:
-- SELECT * FROM payment_events 
-- WHERE event_type LIKE 'admin_%' 
-- ORDER BY created_at DESC;
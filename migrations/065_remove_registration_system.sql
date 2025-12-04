-- Migration: 065 - Remove Registration System
-- Purpose: Clean up registration-related data and set all tickets to completed status
-- Safe to run: Yes (idempotent, no destructive operations on schema)
--
-- This migration prepares the database for inline checkout registration where
-- attendee info is captured during checkout instead of in a separate step.

-- Step 1: Update all pending tickets to completed status
-- Uses purchaser info already in attendee fields, sets registered_at to created_at
-- This handles any existing tickets that haven't been registered yet
UPDATE tickets
SET registration_status = 'completed',
    registered_at = COALESCE(registered_at, created_at)
WHERE registration_status = 'pending';

-- Step 2: Cancel all pending/scheduled registration reminders
-- Preserves data for audit trail, just marks as cancelled
-- These reminders are no longer needed since registration happens at checkout
UPDATE registration_reminders
SET status = 'cancelled',
    updated_at = CURRENT_TIMESTAMP
WHERE status IN ('scheduled', 'pending');

-- Note: NOT dropping tables to preserve historical data
-- registration_reminders table kept for audit trail
-- registration_emails table kept for delivery records

-- Add comment to track migration purpose
-- This can be queried for documentation purposes

-- Migration 058: Remove Unused Event Support Tables
-- Purpose: Remove redundant and never-implemented support tables
-- Date: 2025-10-25
--
-- IMPORTANT: This removes ONLY unused infrastructure tables that were created
-- for advanced features that were never built. Your working multi-event features
-- (event selector, multiple events, filtering) remain fully functional.
--
-- What is removed:
-- - event_access: Never implemented (role-based access control feature)
-- - event_settings: Redundant (events.config JSON column already handles this)
-- - event_audit_log: Never implemented (using main audit_logs table instead)
-- - schema_migrations: Duplicate of migrations table
--
-- What is KEPT (remains fully functional):
-- - events table: Stores all event information (name, dates, venue)
-- - event_id foreign keys: Tickets/transactions reference their events
-- - JOINs to events: Get event details for wallet passes, emails, admin dashboard
-- - Event selector UI: Filter admin views by event (Boulder Fest 2026, Weekenders, etc.)
-- - Multi-event capability: Continue managing multiple events as normal

-- Drop never-implemented feature tables
DROP TABLE IF EXISTS event_audit_log;
DROP TABLE IF EXISTS event_access;
DROP TABLE IF EXISTS event_settings;

-- Drop duplicate migrations tracking table
DROP TABLE IF EXISTS schema_migrations;

-- KEEP events table - stores all event information
-- KEEP event_id columns - tickets/transactions reference events
-- KEEP JOIN queries - get event name, dates, venue info
-- KEEP event selector UI - filter by event in admin panel
-- KEEP multi-event capability - continue managing multiple events

-- Migration complete
SELECT 'Unused support tables removed (all working features preserved)' AS status;

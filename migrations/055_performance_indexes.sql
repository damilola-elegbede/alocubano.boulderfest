-- Migration: 055 - Performance Optimization Indexes
-- Purpose: Add composite indexes to optimize dashboard queries and achieve 10-50ms improvement
-- Dependencies: 044_critical_constraints.sql, 041_manual_payment_support.sql, 024_ticket_reservations.sql
-- Expected improvement: 10-50ms per query execution time

-- ============================================================================
-- PERFORMANCE INDEXES FOR DASHBOARD QUERIES
-- ============================================================================

-- NOTE: idx_tickets_status_created_at already exists from migration 044, covering (status, created_at DESC)
-- We create a more specific 3-column index for queries that also filter by registration_status
CREATE INDEX IF NOT EXISTS idx_tickets_status_created_registration
ON tickets(status, created_at DESC, registration_status);

-- Index for transaction queries filtered by event and status
-- NOTE: idx_transactions_event_status already exists from migration 041
-- We extend it with created_at DESC for better ORDER BY performance
CREATE INDEX IF NOT EXISTS idx_transactions_event_status_created
ON transactions(event_id, status, created_at DESC);

-- Index for ticket reservation lookups during checkout
-- Optimizes queries like: SELECT * FROM ticket_reservations
--   WHERE ticket_type_id = ? AND status = 'active' AND expires_at > datetime('now')
-- Critical for preventing overselling and race conditions
CREATE INDEX IF NOT EXISTS idx_ticket_reservations_lookup
ON ticket_reservations(ticket_type_id, status, expires_at);

-- Index for ticket type validation queries with all filter columns
-- Optimizes queries like: SELECT * FROM ticket_types WHERE id = ? AND event_id = ? AND status = 'available'
-- Benefits ticket availability checks and price lookups
CREATE INDEX IF NOT EXISTS idx_ticket_types_id_event_status
ON ticket_types(id, event_id, status);

-- Index for pending registration reminders (cron job)
-- Optimizes queries like: SELECT * FROM registration_reminders
--   WHERE status = 'scheduled' AND scheduled_at <= datetime('now')
-- Critical for /api/cron/process-reminders performance
CREATE INDEX IF NOT EXISTS idx_reminders_status_scheduled
ON registration_reminders(status, scheduled_at);

-- ============================================================================
-- ROLLBACK SCRIPT
-- ============================================================================
-- To rollback this migration, run the following commands:
--
-- DROP INDEX IF EXISTS idx_tickets_status_created_registration;
-- DROP INDEX IF EXISTS idx_transactions_event_status_created;
-- DROP INDEX IF EXISTS idx_ticket_reservations_lookup;
-- DROP INDEX IF EXISTS idx_ticket_types_id_event_status;
-- DROP INDEX IF EXISTS idx_reminders_status_scheduled;

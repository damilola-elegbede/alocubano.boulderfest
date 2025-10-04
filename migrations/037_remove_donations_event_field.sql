-- Migration: 037 - Remove event_id from transaction_items
-- Purpose: Donations are transaction-level, not event-specific
-- Dependencies: 008_transaction_items.sql

-- Remove event_id column from transaction_items
-- Donations are associated with transactions, not events
-- Only tickets are event-specific (via transactions.event_id)
ALTER TABLE transaction_items DROP COLUMN event_id;

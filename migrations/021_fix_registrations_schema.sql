-- Migration: Fix registrations table schema conflicts
-- Purpose: Handle migration conflicts between old setup-database.js and new migration system
-- Created: 2025-08-29

-- This migration creates the index that was moved from 001_core_tables.sql to handle schema conflicts
-- It will only succeed if the registrations table exists with the transaction_id column
CREATE INDEX IF NOT EXISTS idx_registrations_transaction ON registrations(transaction_id);
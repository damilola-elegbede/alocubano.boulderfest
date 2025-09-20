-- Migration: 004 - Registrations Table
-- Purpose: User registrations table for tracking ticket holder information
-- Dependencies: 003_transactions.sql

-- Registrations table (EXACT schema from 001_core_tables.sql)
CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL,
    email TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    ticket_type TEXT NOT NULL,
    dietary_restrictions TEXT,
    accessibility_needs TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    phone_number TEXT,
    marketing_consent INTEGER DEFAULT 0,
    registration_completed INTEGER DEFAULT 0,
    registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_primary_purchaser BOOLEAN DEFAULT FALSE,
    transaction_id TEXT,
    status TEXT DEFAULT 'registered' CHECK (status IN ('registered', 'checked_in', 'cancelled')),
    checked_in_at TIMESTAMP,
    notes TEXT
);

-- Indexes for registrations table
CREATE INDEX IF NOT EXISTS idx_registrations_ticket ON registrations(ticket_id);
CREATE INDEX IF NOT EXISTS idx_registrations_email ON registrations(email);
CREATE INDEX IF NOT EXISTS idx_registrations_transaction ON registrations(transaction_id);
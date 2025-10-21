-- Migration: 054 - Remove Unnecessary PII Fields from Registrations
-- Purpose: Remove dietary_restrictions and emergency contact fields (not applicable for dance festival)
-- Dependencies: 044_critical_constraints.sql
-- Security: Reduces PII collection surface area and improves GDPR compliance

-- ============================================================================
-- Remove dietary_restrictions, emergency_contact_name, emergency_contact_phone
-- ============================================================================
-- Rationale: These fields are not applicable for a dance festival and represent
-- unnecessary PII collection. Removing them:
-- 1. Reduces attack surface for data breaches
-- 2. Simplifies GDPR compliance (less PII to manage)
-- 3. Improves data minimization (GDPR Article 5.1.c)

PRAGMA foreign_keys = OFF;

-- Create new registrations table without unnecessary PII fields
CREATE TABLE registrations_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL,
    email TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    ticket_type TEXT NOT NULL,
    -- REMOVED: dietary_restrictions TEXT,
    accessibility_needs TEXT,
    -- REMOVED: emergency_contact_name TEXT,
    -- REMOVED: emergency_contact_phone TEXT,
    phone_number TEXT,
    marketing_consent INTEGER DEFAULT 0,
    registration_completed INTEGER DEFAULT 0,
    registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_primary_purchaser BOOLEAN DEFAULT FALSE,
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'registered' CHECK (status IN ('registered', 'checked_in', 'cancelled')),
    checked_in_at TIMESTAMP,
    notes TEXT
);

-- Copy data (excluding removed columns)
INSERT INTO registrations_new (
    id, ticket_id, email, first_name, last_name, ticket_type,
    accessibility_needs, phone_number, marketing_consent,
    registration_completed, registration_date, is_primary_purchaser,
    transaction_id, status, checked_in_at, notes
)
SELECT
    id, ticket_id, email, first_name, last_name, ticket_type,
    accessibility_needs, phone_number, marketing_consent,
    registration_completed, registration_date, is_primary_purchaser,
    transaction_id, status, checked_in_at, notes
FROM registrations;

-- Drop old table
DROP TABLE registrations;

-- Rename new table
ALTER TABLE registrations_new RENAME TO registrations;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_registrations_ticket ON registrations(ticket_id);
CREATE INDEX IF NOT EXISTS idx_registrations_email ON registrations(email);
CREATE INDEX IF NOT EXISTS idx_registrations_transaction ON registrations(transaction_id);

-- Re-enable foreign key constraints
PRAGMA foreign_keys = ON;

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================
-- REMOVED FIELDS:
-- 1. dietary_restrictions - Not applicable for dance festival
-- 2. emergency_contact_name - Unnecessary PII collection
-- 3. emergency_contact_phone - Unnecessary PII collection
--
-- GDPR COMPLIANCE IMPROVEMENTS:
-- - Data minimization: Only collect PII necessary for service delivery
-- - Reduced breach risk: Fewer sensitive fields to protect
-- - Simplified retention: Less PII to manage and delete
--
-- APPLICATION IMPACT:
-- - No API endpoints or frontend forms use these fields (verified)
-- - Only affects test helpers and GDPR service listings
-- - Existing data in removed columns is discarded (one-way migration)
--
-- ROLLBACK INSTRUCTIONS:
-- Cannot rollback without data loss. If fields are needed again:
-- 1. Create new migration adding columns back (will be NULL for existing records)
-- 2. Update application code to collect this data going forward
-- 3. Existing records will not have historical data for these fields

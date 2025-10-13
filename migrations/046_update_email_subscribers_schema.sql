-- Migration: 046 - Update Email Subscribers Schema
-- Purpose: Fix schema mismatch - add missing columns to email_subscribers table
-- Dependencies: 015_email_management_system.sql
-- Issue: Code expects 17 columns but table only has 9 columns from migration 015

-- SQLite doesn't support ALTER TABLE ADD COLUMN with constraints easily,
-- so we use the standard SQLite table recreation pattern:
-- 1. Create new table with complete schema
-- 2. Copy data from old table (mapping columns)
-- 3. Drop old table
-- 4. Rename new table

-- Create temporary table with complete schema
CREATE TABLE IF NOT EXISTS email_subscribers_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'unsubscribed', 'bounced', 'complained')),
    brevo_contact_id INTEGER,
    list_ids TEXT DEFAULT '[]',
    attributes TEXT DEFAULT '{}',
    consent_date TIMESTAMP,
    consent_source TEXT DEFAULT 'website',
    consent_ip TEXT,
    verification_token TEXT,
    verified_at TIMESTAMP,
    unsubscribed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Copy existing data from old table to new table
-- Map old columns to new columns where possible
INSERT INTO email_subscribers_new (
    id,
    email,
    first_name,
    last_name,
    phone,
    status,
    brevo_contact_id,
    list_ids,
    attributes,
    consent_date,
    consent_source,
    consent_ip,
    verification_token,
    verified_at,
    unsubscribed_at,
    created_at,
    updated_at
)
SELECT
    id,
    email,
    NULL as first_name,
    NULL as last_name,
    NULL as phone,
    -- Map old status values to new status values
    CASE
        WHEN status = 'active' THEN 'active'
        WHEN status = 'unsubscribed' THEN 'unsubscribed'
        WHEN status = 'bounced' THEN 'bounced'
        WHEN status = 'complained' THEN 'complained'
        ELSE 'pending'
    END as status,
    NULL as brevo_contact_id,
    '[]' as list_ids,
    COALESCE(metadata, '{}') as attributes,
    subscribed_at as consent_date,
    COALESCE(source, 'website') as consent_source,
    NULL as consent_ip,
    NULL as verification_token,
    NULL as verified_at,
    unsubscribed_at,
    COALESCE(subscribed_at, CURRENT_TIMESTAMP) as created_at,
    CURRENT_TIMESTAMP as updated_at
FROM email_subscribers;

-- Drop old table
DROP TABLE email_subscribers;

-- Rename new table to original name
ALTER TABLE email_subscribers_new RENAME TO email_subscribers;

-- Recreate indexes for the new schema
CREATE INDEX IF NOT EXISTS idx_email_subscribers_email ON email_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_status ON email_subscribers(status);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_brevo_contact_id ON email_subscribers(brevo_contact_id);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_consent_date ON email_subscribers(consent_date);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_created_at ON email_subscribers(created_at DESC);

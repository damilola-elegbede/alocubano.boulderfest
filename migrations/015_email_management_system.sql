-- Migration: 015 - Email Management System
-- Purpose: Advanced email subscribers system (email_subscribers used by application)
-- Dependencies: 014_admin_mfa_system.sql

-- Main email subscribers table (EXACT schema from 012_email_subscriber_system.sql)
CREATE TABLE IF NOT EXISTS email_subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    status TEXT DEFAULT 'pending' CHECK (
        status IN ('pending', 'active', 'unsubscribed', 'bounced')
    ),
    brevo_contact_id TEXT,
    list_ids TEXT DEFAULT '[]', -- JSON array of list IDs
    attributes TEXT DEFAULT '{}', -- JSON object for custom attributes
    consent_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    consent_source TEXT DEFAULT 'website',
    consent_ip TEXT,
    verification_token TEXT,
    verified_at TIMESTAMP,
    unsubscribed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email events table for tracking email interactions (EXACT schema from 012_email_subscriber_system.sql)
CREATE TABLE IF NOT EXISTS email_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscriber_id INTEGER NOT NULL,
    event_type TEXT NOT NULL, -- subscribed, unsubscribed, opened, clicked, bounced, etc.
    event_data TEXT DEFAULT '{}', -- JSON data specific to the event
    brevo_event_id TEXT, -- ID from Brevo webhook if applicable
    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscriber_id) REFERENCES email_subscribers(id) ON DELETE CASCADE
);

-- Audit log for email subscriber operations (EXACT schema from 012_email_subscriber_system.sql)
CREATE TABLE IF NOT EXISTS email_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL, -- email_subscribers, email_events, etc.
    entity_id INTEGER NOT NULL,
    action TEXT NOT NULL, -- create, update, delete
    actor_type TEXT NOT NULL, -- system, user, webhook
    actor_id TEXT, -- user ID or system identifier
    changes TEXT NOT NULL, -- JSON object with changed fields
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance (EXACT from 012_email_subscriber_system.sql)
CREATE INDEX IF NOT EXISTS idx_email_subscribers_email ON email_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_status ON email_subscribers(status);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_brevo_contact_id ON email_subscribers(brevo_contact_id);
CREATE INDEX IF NOT EXISTS idx_email_events_subscriber_id ON email_events(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_email_events_event_type ON email_events(event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_occurred_at ON email_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_email_audit_log_entity ON email_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_email_audit_log_created_at ON email_audit_log(created_at);
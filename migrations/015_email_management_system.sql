-- Migration: 015 - Email Management System
-- Purpose: Email subscribers, campaigns, and tracking
-- Dependencies: 002_schema_migrations.sql

-- Email subscribers
CREATE TABLE IF NOT EXISTS email_subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed', 'bounced', 'complained')),
    source TEXT DEFAULT 'website',
    unsubscribe_token TEXT UNIQUE,
    subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    unsubscribed_at DATETIME,
    unsubscribe_reason TEXT,
    metadata TEXT
);

-- Email campaigns
CREATE TABLE IF NOT EXISTS email_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id TEXT UNIQUE NOT NULL,
    campaign_name TEXT NOT NULL,
    subject TEXT NOT NULL,
    template_id TEXT,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'cancelled')),
    scheduled_at DATETIME,
    sent_at DATETIME,
    recipient_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT
);

-- Email send log
CREATE TABLE IF NOT EXISTS email_send_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_email TEXT NOT NULL,
    campaign_id TEXT,
    template_id TEXT,
    message_id TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced', 'complained')),
    sent_at DATETIME,
    delivered_at DATETIME,
    failed_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_subscribers_email ON email_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_status ON email_subscribers(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient ON email_send_log(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_send_log_status ON email_send_log(status);
CREATE INDEX IF NOT EXISTS idx_email_send_log_created_at ON email_send_log(created_at DESC);
-- Migration: 018 - Cache and Webhook Systems
-- Purpose: Gallery cache and webhook events tables
-- Dependencies: 017_registration_emails.sql

-- Gallery cache table (EXACT schema from 002_add_features.sql)
CREATE TABLE IF NOT EXISTS gallery_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key TEXT NOT NULL UNIQUE,
    data TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Webhook events table (EXACT schema from 002_add_features.sql)
CREATE TABLE IF NOT EXISTS webhook_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    processed_at DATETIME,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for gallery cache (EXACT from 002_add_features.sql)
CREATE INDEX IF NOT EXISTS idx_gallery_cache_key
ON gallery_cache(cache_key);

CREATE INDEX IF NOT EXISTS idx_gallery_cache_expires
ON gallery_cache(expires_at);

-- Index for webhook events (EXACT from 002_add_features.sql)
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_provider_event
ON webhook_events(provider, event_id);
-- Additional feature tables for A Lo Cubano Boulder Fest

-- Gallery cache table
CREATE TABLE IF NOT EXISTS gallery_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cache_key TEXT NOT NULL UNIQUE,
  data TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create index for cache key lookups
CREATE INDEX IF NOT EXISTS idx_gallery_cache_key 
ON gallery_cache(cache_key);

-- Create index for expiry cleanup
CREATE INDEX IF NOT EXISTS idx_gallery_cache_expires 
ON gallery_cache(expires_at);

-- Webhook events table
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

-- Create unique index for provider event_id combo
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_provider_event 
ON webhook_events(provider, event_id);

-- Add missing columns to existing tables (idempotent)
-- These will be skipped if columns already exist

-- Add dietary_restrictions to registrations
ALTER TABLE registrations ADD COLUMN dietary_restrictions TEXT;

-- Add emergency_contact to registrations  
ALTER TABLE registrations ADD COLUMN emergency_contact TEXT;

-- Add phone_number to registrations
ALTER TABLE registrations ADD COLUMN phone_number TEXT;

-- Add marketing_consent to registrations
ALTER TABLE registrations ADD COLUMN marketing_consent INTEGER DEFAULT 0;

-- Add registration_completed to registrations
ALTER TABLE registrations ADD COLUMN registration_completed INTEGER DEFAULT 0;
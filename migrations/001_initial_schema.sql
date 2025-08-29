-- A Lo Cubano Boulder Fest Database Schema
-- Complete initial migration for base database structure
-- This consolidates all core tables needed for the application

-- =============================================================================
-- CORE TRANSACTION AND PAYMENT TABLES
-- =============================================================================

-- Transactions table for tracking all payments and orders
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('tickets', 'donation', 'merchandise')),
  status TEXT DEFAULT 'pending' CHECK (
    status IN ('pending', 'completed', 'failed', 'cancelled', 'refunded', 'partially_refunded')
  ),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT DEFAULT 'USD',
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  payment_method_type TEXT,
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  billing_address TEXT,
  order_data TEXT NOT NULL,
  session_metadata TEXT,
  event_id TEXT,
  source TEXT DEFAULT 'website',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

-- Create indexes for transactions table
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_id 
ON transactions(transaction_id);

CREATE INDEX IF NOT EXISTS idx_transactions_stripe_session 
ON transactions(stripe_session_id);

CREATE INDEX IF NOT EXISTS idx_transactions_status 
ON transactions(status);

CREATE INDEX IF NOT EXISTS idx_transactions_customer_email 
ON transactions(customer_email);

-- =============================================================================
-- REGISTRATION AND TICKET MANAGEMENT TABLES
-- =============================================================================

-- Registrations table for tracking ticket holder information
CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  ticket_type TEXT NOT NULL,
  purchase_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  stripe_session_id TEXT,
  qr_code TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'registered', 'checked_in', 'cancelled')),
  dietary_restrictions TEXT,
  accessibility_needs TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact TEXT,
  phone_number TEXT,
  marketing_consent INTEGER DEFAULT 0,
  registration_completed INTEGER DEFAULT 0,
  registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_primary_purchaser BOOLEAN DEFAULT FALSE,
  transaction_id TEXT,
  checked_in_at TIMESTAMP,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE SET NULL
);

-- Create indexes for registrations table
CREATE INDEX IF NOT EXISTS idx_registrations_email 
ON registrations(email);

CREATE INDEX IF NOT EXISTS idx_registrations_ticket_id 
ON registrations(ticket_id);

CREATE INDEX IF NOT EXISTS idx_registrations_status 
ON registrations(status);

CREATE INDEX IF NOT EXISTS idx_registrations_transaction_id 
ON registrations(transaction_id);

CREATE INDEX IF NOT EXISTS idx_registrations_qr_code 
ON registrations(qr_code);

-- =============================================================================
-- EMAIL AND COMMUNICATION SYSTEM TABLES
-- =============================================================================

-- Email subscribers table for newsletter and marketing
CREATE TABLE IF NOT EXISTS email_subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  status TEXT DEFAULT 'pending' CHECK (
    status IN ('pending', 'active', 'unsubscribed', 'bounced')
  ),
  brevo_contact_id TEXT,
  list_ids TEXT DEFAULT '[]',
  attributes TEXT DEFAULT '{}',
  bounce_count INTEGER DEFAULT 0,
  consent_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  consent_source TEXT DEFAULT 'website',
  consent_ip TEXT,
  verification_token TEXT,
  verified_at TIMESTAMP,
  unsubscribed_at TIMESTAMP,
  source TEXT DEFAULT 'website',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for email_subscribers table
CREATE INDEX IF NOT EXISTS idx_email_subscribers_email 
ON email_subscribers(email);

CREATE INDEX IF NOT EXISTS idx_email_subscribers_status 
ON email_subscribers(status);

CREATE INDEX IF NOT EXISTS idx_email_subscribers_brevo_contact_id 
ON email_subscribers(brevo_contact_id);

-- Email events tracking table
CREATE TABLE IF NOT EXISTS email_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT DEFAULT '{}',
  brevo_event_id TEXT,
  occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subscriber_id) REFERENCES email_subscribers(id) ON DELETE CASCADE
);

-- Create index for email_events table
CREATE INDEX IF NOT EXISTS idx_email_events_subscriber_id 
ON email_events(subscriber_id);

CREATE INDEX IF NOT EXISTS idx_email_events_event_type 
ON email_events(event_type);

-- Email audit log table
CREATE TABLE IF NOT EXISTS email_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  changes TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for email_audit_log table
CREATE INDEX IF NOT EXISTS idx_email_audit_log_entity 
ON email_audit_log(entity_type, entity_id);

-- =============================================================================
-- ADMIN AND SECURITY TABLES
-- =============================================================================

-- Admin sessions table
CREATE TABLE IF NOT EXISTS admin_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  user_agent TEXT
);

-- Create indexes for admin_sessions table
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token 
ON admin_sessions(token);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires 
ON admin_sessions(expires_at);

-- =============================================================================
-- SYSTEM AND PERFORMANCE TABLES
-- =============================================================================

-- Performance metrics table
CREATE TABLE IF NOT EXISTS performance_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_path TEXT NOT NULL,
  metric_type TEXT NOT NULL,
  value REAL NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  session_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance_metrics table
CREATE INDEX IF NOT EXISTS idx_performance_metrics_page_metric 
ON performance_metrics(page_path, metric_type);

CREATE INDEX IF NOT EXISTS idx_performance_metrics_created_at 
ON performance_metrics(created_at);

-- Gallery cache table
CREATE TABLE IF NOT EXISTS gallery_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cache_key TEXT NOT NULL UNIQUE,
  data TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for gallery_cache table
CREATE INDEX IF NOT EXISTS idx_gallery_cache_key 
ON gallery_cache(cache_key);

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

-- Create indexes for webhook_events table
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_provider_event 
ON webhook_events(provider, event_id);

CREATE INDEX IF NOT EXISTS idx_webhook_events_status 
ON webhook_events(status);

-- =============================================================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- =============================================================================

-- Trigger to update updated_at timestamp on transactions
CREATE TRIGGER IF NOT EXISTS update_transactions_timestamp
AFTER UPDATE ON transactions
BEGIN
  UPDATE transactions SET updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
END;

-- Trigger to update updated_at timestamp on registrations
CREATE TRIGGER IF NOT EXISTS update_registrations_timestamp
AFTER UPDATE ON registrations
BEGIN
  UPDATE registrations SET updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
END;

-- Trigger to update updated_at timestamp on email_subscribers
CREATE TRIGGER IF NOT EXISTS update_email_subscribers_timestamp
AFTER UPDATE ON email_subscribers
BEGIN
  UPDATE email_subscribers SET updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
END;
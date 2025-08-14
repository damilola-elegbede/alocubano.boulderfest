-- Consolidated schema from all migrations
-- Single source of truth for test database structure
-- This file replaces complex migration runners in tests

-- Core tables
CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  tickets INTEGER DEFAULT 1,
  amount_paid REAL DEFAULT 0,
  payment_status TEXT DEFAULT 'pending',
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  ticket_id TEXT UNIQUE,
  registration_id INTEGER,
  transaction_id INTEGER,
  email TEXT NOT NULL,
  name TEXT,
  ticket_type TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  qr_code TEXT,
  qr_token TEXT UNIQUE,
  validation_signature TEXT,
  scan_count INTEGER DEFAULT 0,
  max_scan_count INTEGER DEFAULT 10,
  first_scanned_at DATETIME,
  last_scanned_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  used_at DATETIME,
  FOREIGN KEY (registration_id) REFERENCES registrations(id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'USD',
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  order_data TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'active',
  brevo_contact_id TEXT,
  bounce_count INTEGER DEFAULT 0,
  subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  status TEXT DEFAULT 'active',
  brevo_contact_id TEXT,
  list_ids TEXT,
  attributes TEXT,
  consent_date DATETIME,
  consent_source TEXT,
  consent_ip TEXT,
  verification_token TEXT,
  verified_at DATETIME,
  bounce_count INTEGER DEFAULT 0,
  last_bounce_at DATETIME,
  unsubscribed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  event_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  message_id TEXT,
  brevo_event_id TEXT,
  event_data TEXT,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subscriber_id) REFERENCES email_subscribers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS email_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  actor_type TEXT,
  actor_id TEXT,
  changes TEXT,
  details TEXT,
  user_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Token tables
CREATE TABLE IF NOT EXISTS access_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT UNIQUE NOT NULL,
  transaction_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP,
  use_count INTEGER DEFAULT 0,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS action_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT UNIQUE NOT NULL,
  action_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  email TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- QR validation tracking
CREATE TABLE IF NOT EXISTS qr_validations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT,
  validation_token TEXT NOT NULL,
  validation_result TEXT NOT NULL,
  failure_reason TEXT,
  validation_source TEXT DEFAULT 'web',
  ip_address TEXT,
  device_info TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

-- Wallet passes
CREATE TABLE IF NOT EXISTS wallet_passes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL,
  pass_type TEXT NOT NULL,
  serial_number TEXT UNIQUE NOT NULL,
  auth_token TEXT UNIQUE NOT NULL,
  device_id TEXT,
  push_token TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  registered_at TIMESTAMP,
  last_accessed_at TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

-- Admin tables
CREATE TABLE IF NOT EXISTS admin_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS admin_mfa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  secret TEXT NOT NULL,
  backup_codes TEXT,
  enabled BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identifier TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  count INTEGER DEFAULT 1,
  window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_request TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_registrations_email ON registrations(email);
CREATE INDEX idx_tickets_email ON tickets(email);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_qr_token ON tickets(qr_token);
CREATE INDEX idx_transactions_email ON transactions(customer_email);
CREATE INDEX idx_transactions_stripe_session ON transactions(stripe_session_id);
CREATE INDEX idx_access_tokens_hash ON access_tokens(token_hash);
CREATE INDEX idx_access_tokens_email ON access_tokens(email);
CREATE INDEX idx_wallet_passes_ticket ON wallet_passes(ticket_id);
CREATE INDEX idx_wallet_passes_serial ON wallet_passes(serial_number);
CREATE INDEX idx_admin_sessions_token ON admin_sessions(token_hash);
CREATE INDEX idx_email_subscribers_email ON email_subscribers(email);
CREATE INDEX idx_email_subscribers_status ON email_subscribers(status);
CREATE INDEX idx_email_events_subscriber ON email_events(subscriber_id);
CREATE INDEX idx_email_events_type ON email_events(event_type);
CREATE INDEX idx_email_audit_log_entity ON email_audit_log(entity_type, entity_id);
CREATE INDEX idx_email_audit_log_created ON email_audit_log(created_at);
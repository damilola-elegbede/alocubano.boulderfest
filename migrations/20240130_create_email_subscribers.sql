-- Email subscribers table (SQLite version)
CREATE TABLE IF NOT EXISTS email_subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  status TEXT DEFAULT 'pending', -- pending, active, unsubscribed, bounced
  brevo_contact_id TEXT,
  list_ids TEXT, -- Store as JSON array
  attributes TEXT DEFAULT '{}', -- Store as JSON
  consent_date TEXT,
  consent_source TEXT, -- website, checkout, event
  consent_ip TEXT,
  verification_token TEXT,
  verified_at TEXT,
  unsubscribed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Email events tracking
CREATE TABLE IF NOT EXISTS email_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id INTEGER REFERENCES email_subscribers(id),
  event_type TEXT, -- subscribed, unsubscribed, opened, clicked, bounced
  event_data TEXT, -- Store as JSON
  brevo_event_id TEXT,
  occurred_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Email audit log
CREATE TABLE IF NOT EXISTS email_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT,
  entity_id INTEGER,
  action TEXT,
  actor_type TEXT,
  actor_id TEXT,
  changes TEXT, -- Store as JSON
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for performance
CREATE INDEX idx_email_subscribers_email ON email_subscribers(email);
CREATE INDEX idx_email_subscribers_status ON email_subscribers(status);
CREATE INDEX idx_email_subscribers_brevo_id ON email_subscribers(brevo_contact_id);
CREATE INDEX idx_email_events_subscriber ON email_events(subscriber_id);
CREATE INDEX idx_email_events_type ON email_events(event_type);
CREATE INDEX idx_email_audit_entity ON email_audit_log(entity_type, entity_id);

-- SQLite trigger for updated_at
CREATE TRIGGER IF NOT EXISTS update_email_subscribers_updated_at 
    AFTER UPDATE ON email_subscribers
    FOR EACH ROW
BEGIN
    UPDATE email_subscribers 
    SET updated_at = datetime('now') 
    WHERE id = NEW.id;
END;
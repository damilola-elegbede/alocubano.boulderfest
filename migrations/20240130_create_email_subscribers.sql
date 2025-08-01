-- Email subscribers table
CREATE TABLE IF NOT EXISTS email_subscribers (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(50),
  status VARCHAR(50) DEFAULT 'pending', -- pending, active, unsubscribed, bounced
  brevo_contact_id VARCHAR(100),
  list_ids INTEGER[],
  attributes JSONB DEFAULT '{}',
  consent_date TIMESTAMP WITH TIME ZONE,
  consent_source VARCHAR(100), -- website, checkout, event
  consent_ip VARCHAR(45),
  verification_token VARCHAR(255),
  verified_at TIMESTAMP WITH TIME ZONE,
  unsubscribed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Email events tracking
CREATE TABLE IF NOT EXISTS email_events (
  id SERIAL PRIMARY KEY,
  subscriber_id INTEGER REFERENCES email_subscribers(id),
  event_type VARCHAR(50), -- subscribed, unsubscribed, opened, clicked, bounced
  event_data JSONB,
  brevo_event_id VARCHAR(100),
  occurred_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Email audit log
CREATE TABLE IF NOT EXISTS email_audit_log (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(50),
  entity_id INTEGER,
  action VARCHAR(100),
  actor_type VARCHAR(50),
  actor_id VARCHAR(255),
  changes JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_email_subscribers_email ON email_subscribers(email);
CREATE INDEX idx_email_subscribers_status ON email_subscribers(status);
CREATE INDEX idx_email_subscribers_brevo_id ON email_subscribers(brevo_contact_id);
CREATE INDEX idx_email_events_subscriber ON email_events(subscriber_id);
CREATE INDEX idx_email_events_type ON email_events(event_type);
CREATE INDEX idx_email_audit_entity ON email_audit_log(entity_type, entity_id);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_email_subscribers_updated_at BEFORE UPDATE
    ON email_subscribers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
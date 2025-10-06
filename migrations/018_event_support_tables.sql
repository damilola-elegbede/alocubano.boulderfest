-- Migration: 018 - Event Support Tables
-- Purpose: Event settings, access control, and audit log
-- Dependencies: 003_events_table.sql

-- Event Settings Table
CREATE TABLE IF NOT EXISTS event_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, key)
);

-- Event Access Control Table
CREATE TABLE IF NOT EXISTS event_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    role TEXT DEFAULT 'viewer' CHECK(role IN ('viewer', 'manager', 'admin')),
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    granted_by TEXT,
    UNIQUE(event_id, user_email)
);

-- Event Audit Log Table
CREATE TABLE IF NOT EXISTS event_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER REFERENCES events(id),
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    user_email TEXT,
    ip_address TEXT,
    user_agent TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_event_settings_lookup ON event_settings(event_id, key);
CREATE INDEX IF NOT EXISTS idx_event_access_user ON event_access(user_email);
CREATE INDEX IF NOT EXISTS idx_event_access_event ON event_access(event_id);
CREATE INDEX IF NOT EXISTS idx_audit_event ON event_audit_log(event_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON event_audit_log(user_email);
CREATE INDEX IF NOT EXISTS idx_audit_created ON event_audit_log(created_at);

-- Trigger for event_settings updated timestamp
-- Prevent infinite recursion by only updating when updated_at hasn't changed
CREATE TRIGGER IF NOT EXISTS update_event_settings_timestamp
AFTER UPDATE ON event_settings
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE event_settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
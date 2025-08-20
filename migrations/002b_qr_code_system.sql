-- Add QR code fields to tickets table
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS qr_token TEXT NOT NULL UNIQUE;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS qr_code_generated_at TIMESTAMP;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS scan_count INTEGER DEFAULT 0 CHECK (scan_count >= 0);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS max_scan_count INTEGER DEFAULT 10 CHECK (max_scan_count >= 0);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS first_scanned_at TIMESTAMP;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS last_scanned_at TIMESTAMP;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS qr_access_method TEXT;

-- Create QR code validation tracking table
CREATE TABLE IF NOT EXISTS qr_validations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
  validation_token TEXT NOT NULL,
  validation_result TEXT NOT NULL CHECK (validation_result IN ('success', 'failed')),
  failure_reason TEXT,
  validation_source TEXT DEFAULT 'web' CHECK (validation_source IN ('web', 'apple_wallet', 'google_wallet', 'email')),
  ip_address TEXT,
  device_info TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Performance indexes for QR validation queries
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_id_status ON tickets(ticket_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_scan_validation ON tickets(id, scan_count, max_scan_count, status);
CREATE INDEX IF NOT EXISTS idx_qr_validations_ticket_id ON qr_validations(ticket_id);
CREATE INDEX IF NOT EXISTS idx_qr_validations_created_at ON qr_validations(created_at);
CREATE INDEX IF NOT EXISTS idx_qr_validations_source ON qr_validations(validation_source);

-- Composite index for efficient validation queries
CREATE INDEX IF NOT EXISTS idx_tickets_validation_composite ON tickets(id, status, scan_count, max_scan_count);
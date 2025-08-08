-- Add QR code fields to tickets table
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS qr_token TEXT UNIQUE;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS qr_generated_at TIMESTAMP;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS qr_access_method TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS scan_count INTEGER DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS max_scan_count INTEGER DEFAULT 10;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS first_scanned_at TIMESTAMP;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS last_scanned_at TIMESTAMP;

-- Create QR validation tracking table
CREATE TABLE IF NOT EXISTS qr_validations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
    validation_token TEXT NOT NULL,
    validated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    validated_by TEXT,
    validation_location TEXT,
    device_info TEXT,
    validation_result TEXT CHECK (validation_result IN ('success', 'failed', 'expired', 'max_scans')),
    validation_source TEXT CHECK (validation_source IN ('web', 'apple_wallet', 'google_wallet', 'email', 'print')),
    failure_reason TEXT,
    ip_address TEXT,
    
    FOREIGN KEY (ticket_id) REFERENCES tickets(id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tickets_qr_token ON tickets(qr_token);
CREATE INDEX IF NOT EXISTS idx_qr_validations_ticket_id ON qr_validations(ticket_id);
CREATE INDEX IF NOT EXISTS idx_qr_validations_source ON qr_validations(validation_source);
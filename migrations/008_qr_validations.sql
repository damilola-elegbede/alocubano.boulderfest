-- Migration: 008 - QR Validations Table
-- Purpose: QR code validation tracking table
-- Dependencies: 007_tickets.sql

-- QR code validation tracking table (EXACT schema from 019_tickets_table.sql)
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

-- Indexes for QR validations
CREATE INDEX IF NOT EXISTS idx_qr_validations_ticket_id ON qr_validations(ticket_id);
CREATE INDEX IF NOT EXISTS idx_qr_validations_created_at ON qr_validations(created_at);
CREATE INDEX IF NOT EXISTS idx_qr_validations_source ON qr_validations(validation_source);
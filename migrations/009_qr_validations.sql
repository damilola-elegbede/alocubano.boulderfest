-- Migration: 009 - QR Validations Table
-- Purpose: QR code validation tracking
-- Dependencies: 005_tickets.sql

-- QR validations table
CREATE TABLE IF NOT EXISTS qr_validations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL,
    validation_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    validation_location TEXT,
    validator_id TEXT,
    validation_result TEXT CHECK (validation_result IN ('success', 'already_used', 'invalid', 'expired')),
    validation_metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_qr_validations_ticket ON qr_validations(ticket_id);
CREATE INDEX IF NOT EXISTS idx_qr_validations_time ON qr_validations(validation_time);
CREATE INDEX IF NOT EXISTS idx_qr_validations_result ON qr_validations(validation_result);
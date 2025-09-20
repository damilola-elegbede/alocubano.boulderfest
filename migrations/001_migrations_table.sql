-- Migration: 001 - Migrations Table
-- Purpose: Create the migrations tracking table for schema versioning
-- Dependencies: None (foundation table)

-- Migrations tracking table for schema version control
-- Schema aligned with scripts/migrate.js to prevent column mismatch warnings
CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL UNIQUE,
    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    checksum TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Basic index for migration lookups
CREATE INDEX IF NOT EXISTS idx_migrations_filename ON migrations(filename);
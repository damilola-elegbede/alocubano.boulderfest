-- Migration: 002 - Schema Migrations Table
-- Purpose: Create schema version tracking table for migration compatibility
-- Dependencies: 001_migrations_table.sql

-- Schema migrations table for tracking schema versions
CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

-- Basic index for schema migration lookups
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at ON schema_migrations(applied_at DESC);
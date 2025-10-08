-- Migration: 045 - Move Ticket Type Colors to Bootstrap System
-- Purpose: Clear ticket_type_colors seed data to be managed via bootstrap.json instead
-- Dependencies: Migration 034 (ticket_type_colors table structure)
-- Note: Table structure remains unchanged; data now managed via config/bootstrap.json

-- Clear existing color pattern data
-- The bootstrap service will now populate this table from bootstrap.json
DELETE FROM ticket_type_colors;

-- Note: Color patterns are now managed in config/bootstrap.json under "ticket_type_colors"
-- This allows color changes without requiring new migrations
-- The bootstrap service loads colors during build process

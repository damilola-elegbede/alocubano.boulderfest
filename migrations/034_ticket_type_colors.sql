-- Migration: 034 - Ticket Type Colors
-- Purpose: Create ticket_type_colors lookup table for color-coded ticket indicators
-- Dependencies: None
-- Note: Supports pattern-based color mapping for wallet passes and admin UI

-- Create ticket_type_colors lookup table
CREATE TABLE IF NOT EXISTS ticket_type_colors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL UNIQUE,
    color_name TEXT NOT NULL,
    color_rgb TEXT NOT NULL,
    circle_emoji TEXT NOT NULL DEFAULT '⬤',
    display_order INTEGER NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed color mappings (priority order matters - lower display_order = higher priority)
INSERT INTO ticket_type_colors (pattern, color_name, color_rgb, circle_emoji, display_order, description) VALUES
    ('test-', 'Test', 'rgb(255, 20, 147)', '⬤', 1, 'Deep pink for test tickets'),
    ('test_', 'Test', 'rgb(255, 20, 147)', '⬤', 2, 'Deep pink for test tickets (underscore variant)'),
    ('full', 'Full Pass', 'rgb(169, 169, 169)', '⬤', 3, 'Silver for full festival passes'),
    ('early-bird', 'Full Pass', 'rgb(169, 169, 169)', '⬤', 4, 'Silver for early bird full passes'),
    ('friday', 'Friday', 'rgb(255, 140, 0)', '⬤', 5, 'Orange for Friday passes'),
    ('saturday', 'Saturday', 'rgb(255, 215, 0)', '⬤', 6, 'Gold for Saturday passes'),
    ('sunday', 'Sunday', 'rgb(30, 144, 255)', '⬤', 7, 'Dodger blue for Sunday passes'),
    ('weekender', 'Weekender', 'rgb(255, 255, 255)', '⬤', 8, 'White for weekender passes'),
    ('weekend', 'Weekend', 'rgb(255, 255, 255)', '⬤', 9, 'White for weekend passes');

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ticket_type_colors_pattern ON ticket_type_colors(pattern);
CREATE INDEX IF NOT EXISTS idx_ticket_type_colors_display_order ON ticket_type_colors(display_order);

-- Trigger for updated_at timestamp
-- Prevent infinite recursion by only updating when updated_at hasn't changed
CREATE TRIGGER IF NOT EXISTS update_ticket_type_colors_timestamp
AFTER UPDATE ON ticket_type_colors
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE ticket_type_colors SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

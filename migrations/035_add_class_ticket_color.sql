-- Migration: 035 - Add Class Ticket Color
-- Purpose: Add forest green (#228B22) color mapping for single class tickets
-- Safety: Uses INSERT OR IGNORE to prevent duplicate key errors
-- Dependencies: 034_ticket_type_colors.sql

-- Add forest green color for single class tickets
-- Pattern priority: 10 (after specific patterns, before defaults)
-- Color: #228B22 = rgb(34, 139, 34) - Forest Green
INSERT OR IGNORE INTO ticket_type_colors (pattern, color_name, color_rgb, circle_emoji, display_order, description)
VALUES ('class', 'Single Class', 'rgb(34, 139, 34)', '⬤', 10, 'Forest green (#228B22) for single class tickets');

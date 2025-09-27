-- Migration: Add ALO Order Number Sequences
-- Initializes sequences for the new ALO-YYYY-NNNN order number format
-- Author: A Lo Cubano Development Team
-- Date: 2025

-- ================================================================================
-- INITIALIZE ALO SEQUENCES FOR CURRENT AND UPCOMING YEARS
-- ================================================================================

-- Initialize ALO sequence for 2025
INSERT OR IGNORE INTO order_sequences (sequence_key, last_number)
VALUES ('ALO-2025', 0);

-- Initialize ALO sequence for 2026 (main event year)
INSERT OR IGNORE INTO order_sequences (sequence_key, last_number)
VALUES ('ALO-2026', 0);

-- Initialize ALO sequence for 2027 (future events)
INSERT OR IGNORE INTO order_sequences (sequence_key, last_number)
VALUES ('ALO-2027', 0);

-- ================================================================================
-- Migration Complete
-- ================================================================================

-- Note: The ALO prefix is for the new user-friendly order numbers
-- Format: ALO-YYYY-NNNN (e.g., ALO-2026-0001, ALO-2026-0002, etc.)
-- Each year gets its own sequence starting from 1
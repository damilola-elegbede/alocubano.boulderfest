-- Migration: 039 - Clean up confusing and duplicate test events
-- Purpose: Remove invalid events that cause confusion and duplicates in production/preview environments
-- Dependencies: 034_november_2025_weekender.sql

-- Remove event settings for invalid events first (foreign key dependency)
DELETE FROM event_settings
WHERE event_id IN (
    SELECT id FROM events
    WHERE slug IN ('test-weekender-2025', 'test-festival-2025', '2025-11-weekender')
);

-- Remove the invalid/duplicate events
DELETE FROM events
WHERE slug IN ('test-weekender-2025', 'test-festival-2025', '2025-11-weekender');

-- Note: This migration removes INVALID events:
-- 1. test-weekender-2025 - Dated test event (conflicts with clean test-weekender)
-- 2. test-festival-2025 - Dated test event (conflicts with clean test-festival)
-- 3. 2025-11-weekender - Duplicate November weekender (migration 034 error)
--
-- PRESERVES VALID events:
-- ✅ boulderfest-2026 (main production event)
-- ✅ weekender-2025-11 (valid November weekender from bootstrap/production.json)
-- ✅ test-weekender (clean test event)
-- ✅ test-festival (clean test event)
--
-- This resolves naming convention conflicts where weekender-2025-11 is the
-- authoritative slug defined in bootstrap configuration, and 2025-11-weekender
-- was an unintended duplicate created by migration 034.
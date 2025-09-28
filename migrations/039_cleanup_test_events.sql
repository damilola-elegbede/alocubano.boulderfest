-- Migration: 039 - Clean up confusing test events
-- Purpose: Remove test events that cause confusion in production/preview environments
-- Dependencies: 034_november_2025_weekender.sql

-- Remove November 2025 weekender event settings first (foreign key dependency)
DELETE FROM event_settings
WHERE event_id IN (
    SELECT id FROM events
    WHERE slug IN ('test-weekender-2025', 'test-festival-2025', '2025-11-weekender')
);

-- Remove the confusing test events
DELETE FROM events
WHERE slug IN ('test-weekender-2025', 'test-festival-2025', '2025-11-weekender');

-- Note: This migration removes:
-- 1. Test Salsa Weekender 2025 (test-weekender-2025)
-- 2. Test Festival 2025 (test-festival-2025)
-- 3. A Lo Cubano Weekender November 2025 (2025-11-weekender)
--
-- These events were causing confusion by appearing in bootstrap logs
-- and creating unclear test scenarios. The clean test events in
-- bootstrap/preview.json and bootstrap/development.json provide
-- better isolated testing environments.
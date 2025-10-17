-- ============================================================================
-- Flagged Tickets Monitoring Queries
-- ============================================================================
-- Purpose: Manual queries for investigating false positives in flagged tickets
-- Usage: Run these queries in your database client (Turso CLI, SQLite, etc.)
-- ============================================================================

-- ============================================================================
-- QUERY 1: Current Flagged Tickets Summary
-- ============================================================================
-- Shows total count, value, and date range of flagged tickets
SELECT
  COUNT(*) as total_flagged,
  COUNT(DISTINCT ticket_type) as unique_ticket_types,
  MIN(created_at) as first_flagged,
  MAX(created_at) as last_flagged,
  SUM(price_cents) / 100.0 as total_value_dollars,
  AVG(price_cents) / 100.0 as avg_value_dollars
FROM tickets
WHERE status = 'flagged_for_review';

-- ============================================================================
-- QUERY 2: Validation Error Analysis (Last 30 Days)
-- ============================================================================
-- Parse validation errors from ticket_metadata JSON
-- Note: JSON parsing may vary by database (this is for SQLite/Turso)
SELECT
  ticket_id,
  ticket_type,
  created_at,
  price_cents / 100.0 as price_dollars,
  json_extract(ticket_metadata, '$.validation.errors') as errors,
  json_extract(ticket_metadata, '$.validation.warnings') as warnings,
  json_extract(ticket_metadata, '$.validation.webhook_timing.delay_seconds') as webhook_delay_seconds,
  json_extract(ticket_metadata, '$.validation.webhook_timing.is_delayed') as is_delayed_webhook
FROM tickets
WHERE status = 'flagged_for_review'
  AND created_at >= datetime('now', '-30 days')
ORDER BY created_at DESC
LIMIT 50;

-- ============================================================================
-- QUERY 3: Webhook Delay Correlation
-- ============================================================================
-- Check if delayed webhooks correlate with false positives
SELECT
  CASE
    WHEN CAST(json_extract(ticket_metadata, '$.validation.webhook_timing.delay_seconds') AS INTEGER) < 60 THEN '< 1 minute'
    WHEN CAST(json_extract(ticket_metadata, '$.validation.webhook_timing.delay_seconds') AS INTEGER) < 300 THEN '1-5 minutes'
    WHEN CAST(json_extract(ticket_metadata, '$.validation.webhook_timing.delay_seconds') AS INTEGER) < 900 THEN '5-15 minutes'
    WHEN CAST(json_extract(ticket_metadata, '$.validation.webhook_timing.delay_seconds') AS INTEGER) >= 900 THEN '> 15 minutes'
    ELSE 'Unknown'
  END as delay_bucket,
  COUNT(*) as count,
  AVG(price_cents) / 100.0 as avg_price_dollars,
  MIN(created_at) as first_occurrence,
  MAX(created_at) as last_occurrence
FROM tickets
WHERE status = 'flagged_for_review'
  AND created_at >= datetime('now', '-30 days')
  AND ticket_metadata IS NOT NULL
GROUP BY delay_bucket
ORDER BY count DESC;

-- ============================================================================
-- QUERY 4: Most Common Ticket Types Flagged
-- ============================================================================
SELECT
  ticket_type,
  COUNT(*) as flagged_count,
  AVG(price_cents) / 100.0 as avg_price_dollars,
  MIN(created_at) as first_flagged,
  MAX(created_at) as last_flagged
FROM tickets
WHERE status = 'flagged_for_review'
  AND created_at >= datetime('now', '-30 days')
GROUP BY ticket_type
ORDER BY flagged_count DESC
LIMIT 20;

-- ============================================================================
-- QUERY 5: Daily Flagged Ticket Trend
-- ============================================================================
-- Shows how many tickets were flagged each day
SELECT
  DATE(created_at) as date,
  COUNT(*) as flagged_count,
  COUNT(DISTINCT ticket_type) as unique_types,
  SUM(price_cents) / 100.0 as total_value_dollars
FROM tickets
WHERE status = 'flagged_for_review'
  AND created_at >= datetime('now', '-30 days')
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- ============================================================================
-- QUERY 6: Validation Pass/Fail Rate from Audit Logs
-- ============================================================================
-- Shows overall validation health
SELECT
  action,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM audit_logs
WHERE action IN ('WEBHOOK_METADATA_VALIDATION_PASSED', 'WEBHOOK_METADATA_VALIDATION_FAILED')
  AND created_at >= datetime('now', '-30 days')
GROUP BY action;

-- ============================================================================
-- QUERY 7: Recent Validation Failures with Details
-- ============================================================================
-- Shows detailed information from audit logs
SELECT
  created_at,
  target_id as stripe_session_id,
  json_extract(metadata, '$.ticket_type') as ticket_type,
  json_extract(metadata, '$.validation_errors') as validation_errors,
  json_extract(metadata, '$.webhook_timing.delay_seconds') as delay_seconds,
  json_extract(metadata, '$.webhook_timing.is_delayed') as is_delayed
FROM audit_logs
WHERE action = 'WEBHOOK_METADATA_VALIDATION_FAILED'
  AND created_at >= datetime('now', '-7 days')
ORDER BY created_at DESC
LIMIT 20;

-- ============================================================================
-- QUERY 8: Event ID Mismatch Analysis (Specific Error Type)
-- ============================================================================
-- Check if empty/invalid event IDs are causing flags
SELECT
  ticket_id,
  ticket_type,
  created_at,
  json_extract(ticket_metadata, '$.validation.errors') as errors,
  json_extract(ticket_metadata, '$.validation.warnings') as warnings
FROM tickets
WHERE status = 'flagged_for_review'
  AND created_at >= datetime('now', '-30 days')
  AND (
    json_extract(ticket_metadata, '$.validation.errors') LIKE '%Event ID mismatch%'
    OR json_extract(ticket_metadata, '$.validation.warnings') LIKE '%Event ID%'
  )
ORDER BY created_at DESC;

-- ============================================================================
-- QUERY 9: Price Mismatch Analysis
-- ============================================================================
-- Check price variance patterns
SELECT
  ticket_id,
  ticket_type,
  created_at,
  price_cents / 100.0 as price_dollars,
  json_extract(ticket_metadata, '$.validation.errors') as errors
FROM tickets
WHERE status = 'flagged_for_review'
  AND created_at >= datetime('now', '-30 days')
  AND json_extract(ticket_metadata, '$.validation.errors') LIKE '%Price mismatch%'
ORDER BY created_at DESC;

-- ============================================================================
-- QUERY 10: Before/After Comparison
-- ============================================================================
-- Compare false positive rate before and after fix deployment
-- Replace 'YYYY-MM-DD HH:MM:SS' with your deployment timestamp
WITH deployment_date AS (
  SELECT '2025-01-17 00:00:00' as deploy_time  -- UPDATE THIS
),
before_after AS (
  SELECT
    CASE
      WHEN created_at < (SELECT deploy_time FROM deployment_date) THEN 'Before Fix'
      ELSE 'After Fix'
    END as period,
    COUNT(*) as flagged_count,
    AVG(price_cents) / 100.0 as avg_price
  FROM tickets
  WHERE status = 'flagged_for_review'
    AND created_at >= datetime((SELECT deploy_time FROM deployment_date), '-30 days')
  GROUP BY period
)
SELECT
  period,
  flagged_count,
  ROUND(avg_price, 2) as avg_price_dollars,
  ROUND(flagged_count * 100.0 / SUM(flagged_count) OVER (), 2) as percentage
FROM before_after
ORDER BY period;

-- ============================================================================
-- QUERY 11: Tickets Flagged But Likely False Positives
-- ============================================================================
-- Identify tickets flagged despite lenient validation being applied
SELECT
  ticket_id,
  ticket_type,
  created_at,
  json_extract(ticket_metadata, '$.validation.webhook_timing.delay_seconds') as delay_seconds,
  json_extract(ticket_metadata, '$.validation.webhook_timing.lenient_validation_applied') as lenient_applied,
  json_extract(ticket_metadata, '$.validation.errors') as errors
FROM tickets
WHERE status = 'flagged_for_review'
  AND created_at >= datetime('now', '-30 days')
  AND json_extract(ticket_metadata, '$.validation.webhook_timing.lenient_validation_applied') = 1
ORDER BY created_at DESC;

-- ============================================================================
-- QUERY 12: Admin Actions on Flagged Tickets
-- ============================================================================
-- See how admins are resolving flagged tickets (mark safe vs cancel)
SELECT
  DATE(created_at) as date,
  action,
  COUNT(*) as count
FROM audit_logs
WHERE action IN ('ADMIN_MARKED_TICKET_SAFE', 'ADMIN_CANCELLED_FLAGGED_TICKET')
  AND created_at >= datetime('now', '-30 days')
GROUP BY DATE(created_at), action
ORDER BY date DESC, action;

-- ============================================================================
-- HELPFUL TIPS
-- ============================================================================
-- 1. Run QUERY 1 first to get overall metrics
-- 2. Run QUERY 3 to see if delays are correlated with flags
-- 3. Run QUERY 6 to see overall pass/fail rate
-- 4. Use QUERY 10 to measure effectiveness of the fix
-- 5. Export results to CSV for tracking over time
--
-- To export results in Turso CLI:
--   turso db shell your-db-name < flagged-tickets-queries.sql > results.txt
--
-- To run a specific query:
--   turso db shell your-db-name
--   .mode csv
--   .output results.csv
--   [paste query here]
--   .quit
-- ============================================================================

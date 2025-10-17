# Flagged Tickets Monitoring Guide

This guide explains how to monitor and track false positives in the flagged ticket validation system after implementing the false positive mitigation fixes.

## Table of Contents

1. [Overview](#overview)
2. [Admin Dashboard Analytics](#admin-dashboard-analytics)
3. [API Endpoint](#api-endpoint)
4. [Manual SQL Queries](#manual-sql-queries)
5. [Interpreting Results](#interpreting-results)
6. [Measuring Fix Effectiveness](#measuring-fix-effectiveness)
7. [Alerting & Thresholds](#alerting--thresholds)

---

## Overview

The flagged tickets monitoring system provides multiple ways to track validation false positives:

- **Admin Dashboard**: Visual analytics with charts and key insights
- **REST API**: Programmatic access to analytics data
- **SQL Queries**: Manual investigation and custom reporting

### Key Metrics Tracked

| Metric | Description | Target |
|--------|-------------|--------|
| **Total Flagged** | Number of tickets flagged for review | Trending down |
| **Pass Rate** | % of validations that pass | >95% |
| **False Positive Rate** | % of validations that fail (estimated) | <5% |
| **Avg Per Day** | Average flagged tickets per day | <10 |
| **Webhook Delay** | Time between checkout and validation | <5 min average |

---

## Admin Dashboard Analytics

### Accessing the Dashboard

1. Navigate to the admin dashboard: `/pages/admin/dashboard.html`
2. Login with admin credentials
3. Scroll to the **"📊 Flagged Tickets Analytics"** section

### Dashboard Features

#### Summary Cards

Four key metrics at a glance:
- **Total Flagged**: Count + total value of flagged tickets
- **Pass Rate**: Validation success rate
- **False Positive Rate**: Estimated false positive percentage
- **Avg Per Day**: Daily average with days active

#### Key Insights

Automatic analysis that highlights:
- **Most Common Error**: Which validation error occurs most frequently
- **High Webhook Delay Correlation**: If delayed webhooks correlate with flags
- **7-Day Trend**: Whether flagged tickets are increasing/decreasing

#### Validation Error Breakdown

Horizontal bar chart showing distribution of error types:
- Event ID mismatch
- Price mismatch
- Quantity exceeded
- Invalid ticket/event status
- Ticket not found
- Validation system errors

#### Webhook Delay Analysis

Shows how webhook processing delays correlate with flagged tickets:
- **< 1 minute**: Immediate processing (strict validation)
- **1-5 minutes**: Normal processing (strict validation)
- **5-15 minutes**: Delayed (lenient validation applied)
- **> 15 minutes**: Very delayed (lenient validation applied)

Green bars indicate lenient validation was applied (expected to reduce false positives).

#### Daily Trend

Time series chart showing flagged ticket count over time (last 30 days).

### Controls

- **Time Period Selector**: Toggle between 7d / 30d / 90d / All Time
- **Refresh Button**: Manually refresh analytics data

---

## API Endpoint

### Endpoint Details

**URL**: `GET /api/admin/flagged-tickets-analytics`

**Authentication**: Requires admin JWT token

**Query Parameters**:
- `period`: Time period for analysis
  - `7d` - Last 7 days
  - `30d` - Last 30 days (default)
  - `90d` - Last 90 days
  - `all` - All time
- `report_type`: Type of report
  - `summary` - Overview metrics (default)
  - `detailed` - Includes detailed error list (up to 100)

### Example Request

```bash
curl -X GET "https://yourdomain.com/api/admin/flagged-tickets-analytics?period=30d&report_type=summary" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

### Example Response

```json
{
  "period": "30d",
  "start_date": "2025-01-01T00:00:00.000Z",
  "end_date": "2025-01-31T23:59:59.999Z",
  "generated_at": "2025-01-31T23:59:59.999Z",

  "summary": {
    "total_flagged": 45,
    "total_validations": 1250,
    "validation_pass_rate": "96.40%",
    "false_positive_rate": "3.60%",
    "days_with_flags": 18,
    "avg_flagged_per_day": "2.50",
    "total_flagged_value": "2250.00",
    "first_flagged": "2025-01-05T10:23:15.000Z",
    "last_flagged": "2025-01-30T18:45:32.000Z"
  },

  "error_breakdown": {
    "event_id_mismatch": 12,
    "price_mismatch": 5,
    "quantity_exceeded": 8,
    "invalid_ticket_status": 3,
    "invalid_event_status": 2,
    "ticket_not_found": 1,
    "validation_system_error": 0,
    "unknown": 14
  },

  "webhook_delay_analysis": {
    "immediate": 15,
    "normal": 18,
    "delayed": 8,
    "very_delayed": 4,
    "unknown": 0,
    "delayed_webhook_percentage": "26.67%"
  },

  "insights": {
    "most_common_error": "event_id_mismatch",
    "high_delay_correlation": true,
    "trending": {
      "recent_7d": 8,
      "previous_7d": 15,
      "change_percent": "-46.7",
      "direction": "decreasing"
    }
  }
}
```

### Integration Example

```javascript
async function monitorFalsePositives() {
  const token = localStorage.getItem('adminToken');

  const response = await fetch('/api/admin/flagged-tickets-analytics?period=7d', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  const data = await response.json();

  // Alert if false positive rate exceeds threshold
  const falsePositiveRate = parseFloat(data.summary.false_positive_rate);
  if (falsePositiveRate > 5.0) {
    console.warn(`🚨 False positive rate exceeds 5%: ${falsePositiveRate}%`);
    // Send alert notification
  }

  return data;
}
```

---

## Manual SQL Queries

For ad-hoc investigation and custom reporting, use the SQL queries in:
**`docs/monitoring/flagged-tickets-queries.sql`**

### Quick Reference

#### 1. Current Status
```sql
-- Overall flagged ticket count and value
SELECT COUNT(*) as total, SUM(price_cents)/100.0 as value_dollars
FROM tickets WHERE status = 'flagged_for_review';
```

#### 2. Most Common Errors (Last 30 Days)
```sql
SELECT ticket_id, created_at,
  json_extract(ticket_metadata, '$.validation.errors') as errors
FROM tickets
WHERE status = 'flagged_for_review'
  AND created_at >= datetime('now', '-30 days')
LIMIT 20;
```

#### 3. Webhook Delay Analysis
```sql
SELECT
  CASE
    WHEN CAST(json_extract(ticket_metadata, '$.validation.webhook_timing.delay_seconds') AS INTEGER) < 60 THEN '< 1 min'
    WHEN CAST(json_extract(ticket_metadata, '$.validation.webhook_timing.delay_seconds') AS INTEGER) < 300 THEN '1-5 min'
    WHEN CAST(json_extract(ticket_metadata, '$.validation.webhook_timing.delay_seconds') AS INTEGER) < 900 THEN '5-15 min'
    ELSE '> 15 min'
  END as delay_bucket,
  COUNT(*) as count
FROM tickets
WHERE status = 'flagged_for_review'
  AND created_at >= datetime('now', '-30 days')
GROUP BY delay_bucket;
```

#### 4. Before/After Comparison
```sql
-- Replace '2025-01-17 00:00:00' with your deployment timestamp
WITH deployment_date AS (
  SELECT '2025-01-17 00:00:00' as deploy_time
)
SELECT
  CASE
    WHEN created_at < (SELECT deploy_time FROM deployment_date) THEN 'Before Fix'
    ELSE 'After Fix'
  END as period,
  COUNT(*) as flagged_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM tickets
WHERE status = 'flagged_for_review'
  AND created_at >= datetime((SELECT deploy_time FROM deployment_date), '-30 days')
GROUP BY period;
```

### Running Queries

**Using Turso CLI**:
```bash
# Interactive mode
turso db shell your-db-name

# Run specific query
turso db shell your-db-name < docs/monitoring/flagged-tickets-queries.sql

# Export to CSV
turso db shell your-db-name
.mode csv
.output results.csv
[paste query]
.quit
```

---

## Interpreting Results

### Healthy System Indicators

✅ **False positive rate <5%**
- Most validations pass successfully
- Flagged tickets are actual security concerns

✅ **Webhook delays distributed normally**
- Most webhooks process within 1-5 minutes
- Few delayed webhooks (>5min)

✅ **Event ID mismatch decreasing**
- Type-safe validation fix is working
- Empty eventId values handled gracefully

✅ **Trending downward**
- Recent 7 days < Previous 7 days
- System improving over time

### Warning Signs

⚠️ **False positive rate >5%**
- Investigate most common error type
- Check if validation rules are too strict

⚠️ **High webhook delay correlation**
- Many flagged tickets have delayed webhooks
- Consider increasing delay threshold from 5min to 10min

⚠️ **Event ID mismatch still high**
- Check if frontend is properly setting eventId in metadata
- Verify cart data includes event information

⚠️ **Trending upward**
- System degrading over time
- Investigate recent changes or traffic patterns

---

## Measuring Fix Effectiveness

### Baseline Measurement (Before Deployment)

1. Record metrics for 7 days before deploying fixes:
   ```sql
   -- Run this query BEFORE deploying fixes
   SELECT
     COUNT(*) as flagged_count,
     ROUND(AVG(price_cents)/100.0, 2) as avg_value
   FROM tickets
   WHERE status = 'flagged_for_review'
     AND created_at >= datetime('now', '-7 days');
   ```

2. Note the false positive rate from admin dashboard

3. Export detailed errors for pattern analysis

### Post-Deployment Monitoring

1. **Day 1-3**: Watch for immediate issues
   - Check webhook delay patterns
   - Monitor error breakdown changes
   - Look for new error types

2. **Week 1**: Initial effectiveness assessment
   - Compare 7-day metrics before/after
   - Calculate % reduction in false positives
   - Review event ID mismatch count

3. **Week 2-4**: Stability validation
   - Confirm sustained improvement
   - Monitor for regressions
   - Fine-tune thresholds if needed

### Success Criteria

| Metric | Target | Timeframe |
|--------|--------|-----------|
| False Positive Rate | <5% | By Week 2 |
| Event ID Mismatch | 50% reduction | By Week 1 |
| Webhook Delay Flags | No increase | Immediately |
| Overall Flagged Count | 30% reduction | By Week 4 |

### Example Before/After Report

```
BEFORE FIX (Jan 1-7):
- Total Flagged: 52
- False Positive Rate: 8.5%
- Event ID Mismatch: 25 (48%)
- Webhook Delay >5min: 8 (15%)

AFTER FIX (Jan 17-24):
- Total Flagged: 18 ⬇️ 65% reduction
- False Positive Rate: 3.2% ⬇️ 62% reduction
- Event ID Mismatch: 3 ⬇️ 88% reduction
- Webhook Delay >5min: 7 (39%) ✅ Lenient validation applied

CONCLUSION: Fix highly effective
- Event ID mismatch nearly eliminated
- False positive rate well below 5% target
- Delayed webhooks now handled gracefully
```

---

## Alerting & Thresholds

### Recommended Alert Thresholds

Configure alerts when these thresholds are exceeded:

| Alert Level | Condition | Action |
|-------------|-----------|--------|
| **Critical** | False positive rate >10% | Immediate investigation |
| **Warning** | False positive rate >5% | Review within 24 hours |
| **Info** | Flagged count >20/day | Monitor trend |
| **Info** | Most common error changes | Review validation logic |

### Sample Alert Script

```javascript
// Run this hourly via cron or monitoring service
async function checkFlaggedTicketsHealth() {
  const response = await fetch('/api/admin/flagged-tickets-analytics?period=7d');
  const data = await response.json();

  const falsePositiveRate = parseFloat(data.summary.false_positive_rate);
  const avgPerDay = parseFloat(data.summary.avg_flagged_per_day);

  // Critical alert
  if (falsePositiveRate > 10) {
    await sendAlert({
      level: 'critical',
      message: `False positive rate: ${falsePositiveRate}% (threshold: 10%)`,
      data: data
    });
  }

  // Warning alert
  if (falsePositiveRate > 5 && falsePositiveRate <= 10) {
    await sendAlert({
      level: 'warning',
      message: `False positive rate: ${falsePositiveRate}% (threshold: 5%)`,
      data: data
    });
  }

  // Info alert
  if (avgPerDay > 20) {
    await sendAlert({
      level: 'info',
      message: `High volume: ${avgPerDay} flagged tickets per day`,
      data: data
    });
  }
}
```

### Integration with External Monitoring

**Datadog / New Relic / Grafana**:
- Query API endpoint every 15 minutes
- Create custom dashboards with time series graphs
- Set up anomaly detection on flagged count

**Slack / PagerDuty**:
- Send critical alerts immediately
- Daily summary reports of metrics
- Weekly trend analysis

**Email Reports**:
- Daily digest of key metrics
- Weekly before/after comparison
- Monthly effectiveness review

---

## Troubleshooting

### High False Positive Rate

**Symptoms**: False positive rate >5% persists after fixes

**Investigation**:
1. Check error breakdown - which validation is failing most?
2. Review webhook delay distribution - are delays >5min?
3. Query detailed errors for patterns:
   ```sql
   SELECT json_extract(ticket_metadata, '$.validation.errors')
   FROM tickets
   WHERE status = 'flagged_for_review'
   ORDER BY created_at DESC LIMIT 20;
   ```

**Solutions**:
- If event_id_mismatch high: Check frontend cart metadata
- If price_mismatch high: Increase tolerance from 2% to 3%
- If quantity_exceeded high: Increase delay threshold to 10min
- If webhook delays frequent: Investigate Stripe webhook delivery

### Event ID Still Mismatching

**Symptoms**: Event ID mismatch errors persist after fix

**Investigation**:
1. Check if eventId is being set in checkout session:
   ```javascript
   // In create-checkout-session.js
   console.log('EventId metadata:', item.eventId);
   ```

2. Query flagged tickets to see actual values:
   ```sql
   SELECT ticket_metadata->'$.validation.webhook_timing.raw_values'
   FROM tickets
   WHERE json_extract(ticket_metadata, '$.validation.errors') LIKE '%Event ID%';
   ```

**Solutions**:
- Ensure cart items include eventId field
- Verify event selector populates eventId
- Check if default fallback is being used

### Delayed Webhooks Increasing

**Symptoms**: More webhooks delayed >5min than before

**Investigation**:
- Check Stripe dashboard for webhook delivery times
- Monitor server response times
- Review Vercel function logs for errors

**Solutions**:
- Optimize webhook handler performance
- Increase Vercel function timeout
- Add webhook retry logic
- Consider increasing delay threshold to 10min

---

## Best Practices

1. **Monitor Daily**: Check admin dashboard analytics daily for first 2 weeks after deployment

2. **Weekly Review**: Review SQL queries weekly to identify patterns

3. **Monthly Report**: Generate before/after comparison monthly to track long-term trends

4. **Alert Fatigue**: Only alert on actionable thresholds (>5% false positive rate)

5. **Document Changes**: Log any threshold adjustments with rationale

6. **Continuous Improvement**: Use insights to refine validation logic over time

---

## Support

If false positive rate remains >5% after 2 weeks:

1. Export detailed analytics: `?report_type=detailed`
2. Run SQL query #11 (false positives with lenient validation)
3. Review security alert evidence for patterns
4. Consider relaxing specific validation rules

For questions or issues, refer to:
- [Flagged Tickets System Documentation](../DONATIONS_SYSTEM.md)
- [Validation Logic Source](../../lib/ticket-creation-service.js)
- [Admin Dashboard Code](../../pages/admin/dashboard.html)

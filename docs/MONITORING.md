# Production Monitoring & Alerting System

## Overview

The A Lo Cubano Boulder Fest application includes a comprehensive production monitoring and alerting system designed to ensure high availability, performance, and reliability.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                     │
├─────────────────────────────────────────────────────────┤
│                  Monitoring Service                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │ Metrics  │  │  Health  │  │  Alert   │             │
│  │Collector │  │ Checker  │  │ Manager  │             │
│  └──────────┘  └──────────┘  └──────────┘             │
├─────────────────────────────────────────────────────────┤
│                    Integration Layer                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │  Sentry  │  │ Webhooks │  │ External │             │
│  │   (APM)  │  │  (Slack) │  │   APIs   │             │
│  └──────────┘  └──────────┘  └──────────┘             │
└─────────────────────────────────────────────────────────┘
```

## Key Features

### 1. Health Monitoring
- **Endpoint**: `/api/health/check`
- Real-time health checks for all critical services
- Circuit breaker pattern for dependency failures
- Automatic recovery detection

### 2. Uptime Monitoring
- **Endpoint**: `/api/monitoring/uptime`
- SLA compliance tracking (99.9% target)
- Availability zone status
- Incident history and MTBF/MTTR metrics

### 3. Performance Monitoring
- **Endpoint**: `/api/monitoring/metrics`
- Response time percentiles (p50, p95, p99)
- Request throughput tracking
- Resource utilization metrics

### 4. Business Metrics
- Payment success/failure rates
- Revenue tracking
- User activity monitoring
- Ticket operation metrics

### 5. Error Tracking
- Automatic error capture with Sentry
- PII sanitization before logging
- Error rate alerting
- Stack trace collection

### 6. Alerting System
- **Endpoint**: `/api/monitoring/alerts`
- Multi-channel notifications (Sentry, Webhooks)
- Alert severity levels (Critical, High, Medium, Low)
- Automatic escalation for unacknowledged alerts
- Maintenance window support

## Monitoring Endpoints

### Health Check
```bash
GET /api/health/check

# Response
{
  "status": "healthy",
  "health_score": 100,
  "services": {
    "database": { "status": "healthy", "responseTime": 45 },
    "stripe": { "status": "healthy", "responseTime": 230 },
    "brevo": { "status": "healthy", "responseTime": 180 }
  }
}
```

### Uptime Status
```bash
GET /api/monitoring/uptime

# Response
{
  "status": "healthy",
  "uptime": {
    "formatted": "5d 14h 23m 45s",
    "percentage": 99.95
  },
  "sla": {
    "compliance": {
      "overall": true,
      "uptime": true,
      "errorRate": true
    }
  }
}
```

### Metrics Export
```bash
# JSON format (default)
GET /api/monitoring/metrics?api_key=YOUR_KEY

# Prometheus format
GET /api/monitoring/metrics?format=prometheus&api_key=YOUR_KEY

# Datadog format
GET /api/monitoring/metrics?format=datadog&api_key=YOUR_KEY

# Specific category
GET /api/monitoring/metrics?category=business&api_key=YOUR_KEY
```

### Dashboard
```bash
# JSON dashboard data
GET /api/monitoring/dashboard

# HTML dashboard
GET /api/monitoring/dashboard?format=html

# Platform-specific config
GET /api/monitoring/dashboard?platform=grafana
```

### Alert Management
```bash
# Get active alerts
GET /api/monitoring/alerts?action=active

# Test alert configuration
POST /api/monitoring/alerts
{
  "action": "test",
  "channel": "webhook"
}

# Trigger manual alert
POST /api/monitoring/alerts
{
  "action": "trigger",
  "severity": "info",
  "description": "Manual test alert"
}
```

## Configuration

### Environment Variables

```bash
# Sentry Configuration
SENTRY_DSN=your-sentry-dsn
SENTRY_ENVIRONMENT=production

# Alert Webhooks
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK
ESCALATION_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/ESCALATION

# Monitoring API Keys
METRICS_API_KEY=your-metrics-api-key
ADMIN_API_KEY=your-admin-api-key

# Alert Thresholds
PAYMENT_FAILURE_THRESHOLD=0.01
DB_RESPONSE_THRESHOLD=1000
API_RESPONSE_THRESHOLD=2000
MEMORY_USAGE_THRESHOLD=80
ERROR_RATE_THRESHOLD=0.05
```

### Alert Rules

Default alert rules are configured for:

1. **Payment Failures** (Critical)
   - Triggers when failure rate > 1%
   - Immediate escalation

2. **High Error Rate** (High)
   - Triggers when error rate > 5%
   - 5-minute aggregation window

3. **Slow API Response** (Medium)
   - Triggers when p95 > 2 seconds
   - 3-minute evaluation period

4. **Database Unavailable** (Critical)
   - Triggers on connection failure
   - Circuit breaker activation

5. **High Memory Usage** (Medium)
   - Triggers when usage > 80%
   - 10-minute evaluation period

## Integration Guides

### Grafana Integration

1. Add data source:
```
URL: https://your-domain.com/api/monitoring/metrics
Headers:
  - X-API-Key: YOUR_METRICS_API_KEY
```

2. Import dashboard:
```bash
GET /api/monitoring/dashboard?platform=grafana
```

### Datadog Integration

1. Configure API endpoint:
```bash
curl -X POST "https://api.datadoghq.com/api/v1/series" \
  -H "DD-API-KEY: YOUR_DD_API_KEY" \
  -d @<(curl https://your-domain.com/api/monitoring/metrics?format=datadog)
```

### Slack Alerts

1. Create incoming webhook in Slack
2. Set environment variable:
```bash
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK
```

### PagerDuty Escalation

1. Create PagerDuty integration
2. Set escalation webhook:
```bash
ESCALATION_WEBHOOK_URL=https://events.pagerduty.com/v2/enqueue
```

## Monitoring Best Practices

### 1. Alert Fatigue Prevention
- Set appropriate thresholds
- Use aggregation windows
- Implement suppression rules
- Group related alerts

### 2. Meaningful Metrics
- Focus on business impact
- Monitor user experience
- Track error budgets
- Measure SLA compliance

### 3. Incident Response
- Clear escalation paths
- Runbook documentation
- Post-mortem process
- Continuous improvement

### 4. Data Retention
- Metrics: 30 days
- Alerts: 90 days
- Incidents: 1 year
- Audit logs: 2 years

## Troubleshooting

### High Memory Usage
```bash
# Check memory metrics
curl /api/monitoring/metrics?category=system

# Look for memory leaks
# Check for unclosed connections
# Review large data processing
```

### Alert Not Firing
```bash
# Test alert configuration
curl -X POST /api/monitoring/alerts \
  -H "X-Admin-Key: YOUR_KEY" \
  -d '{"action": "test"}'

# Check thresholds
curl /api/monitoring/alerts?action=configuration
```

### Metrics Not Updating
```bash
# Check health status
curl /api/health/check

# Verify metrics collector
curl /api/monitoring/metrics?category=system
```

## Security Considerations

### PII Protection
- Automatic email sanitization
- Credit card masking
- API key redaction
- IP address anonymization

### Access Control
- API key authentication for metrics
- Admin key for configuration changes
- Rate limiting on all endpoints
- CORS configuration

### Audit Logging
- All configuration changes logged
- Alert actions tracked
- Access attempts recorded
- Compliance reporting

## Performance Impact

The monitoring system is designed for minimal overhead:

- **CPU**: < 2% average usage
- **Memory**: < 50MB allocated
- **Latency**: < 5ms added per request
- **Storage**: < 100MB for 30-day retention

## Maintenance

### Regular Tasks

**Daily**:
- Review active alerts
- Check SLA compliance
- Monitor error rates

**Weekly**:
- Analyze performance trends
- Review alert effectiveness
- Update thresholds if needed

**Monthly**:
- Capacity planning review
- Incident post-mortems
- Dashboard optimization

### Upgrade Process

1. Test in staging environment
2. Review configuration changes
3. Update during maintenance window
4. Verify all integrations
5. Monitor for regressions

## Support

For monitoring issues or questions:

1. Check dashboard: `/api/monitoring/dashboard?format=html`
2. Review logs in Sentry
3. Contact: alocubanoboulderfest@gmail.com
4. Emergency escalation: Use PagerDuty integration

## Appendix

### Metric Definitions

| Metric | Description | Unit | Target |
|--------|-------------|------|--------|
| api.response_time.p95 | 95th percentile response time | ms | < 2000 |
| payments.success_rate | Payment success percentage | % | > 99 |
| errors.rate | Errors per minute | count/min | < 3 |
| system.memory.usage | Memory utilization | % | < 80 |
| uptime.percentage | System availability | % | > 99.9 |

### Alert Severity Matrix

| Severity | Response Time | Escalation | Examples |
|----------|--------------|------------|----------|
| Critical | < 5 min | Immediate | Payment system down |
| High | < 15 min | 30 min | High error rate |
| Medium | < 1 hour | 2 hours | Performance degradation |
| Low | < 4 hours | Next day | Capacity warnings |
| Info | Best effort | None | Scheduled maintenance |

### Monitoring Checklist

- [ ] Sentry DSN configured
- [ ] Alert webhooks set up
- [ ] Metrics API key generated
- [ ] Health checks passing
- [ ] Dashboard accessible
- [ ] Alerts tested
- [ ] Escalation verified
- [ ] Documentation reviewed

---

Last updated: 2024
Version: 1.0.0
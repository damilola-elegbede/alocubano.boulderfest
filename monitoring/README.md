# Payment System Monitoring & Analytics

Comprehensive monitoring and analytics system for the A Lo Cubano Boulder Fest payment infrastructure, providing real-time visibility into payment performance, business metrics, and system health.

## 🎯 Overview

This monitoring system provides:

- **Error Tracking**: Sentry integration with payment-specific error contexts
- **Analytics**: Google Analytics 4 enhanced ecommerce tracking
- **Performance Monitoring**: API response times, database queries, payment processing
- **Business Intelligence**: Real-time revenue, conversion, and customer analytics
- **Alerting**: Multi-channel notifications for critical issues
- **Dashboard**: Real-time KPI monitoring and system health visualization

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install @sentry/node @sentry/profiling-node
```

### 2. Environment Variables

Copy the example configuration and set your environment variables:

```bash
# Sentry
SENTRY_DSN=your_sentry_dsn_here

# Google Analytics
GA4_MEASUREMENT_ID=G-XXXXXXXXXX

# Alerting
SLACK_WEBHOOK_URL=your_slack_webhook_url
PAGERDUTY_INTEGRATION_KEY=your_pagerduty_key
ALERT_EMAIL_RECIPIENTS=ops@alocubanoboulderfest.com

# Business Intelligence
DAILY_REVENUE_TARGET=50000
MONTHLY_REVENUE_TARGET=1500000
```

### 3. Initialize Monitoring

```javascript
import { initializeMonitoring } from './monitoring/index.js';
import { finalConfig } from './monitoring/config/monitoring-config.js';

// Initialize all monitoring systems
await initializeMonitoring(finalConfig);
```

### 4. Add Middleware (Express.js)

```javascript
import { monitoringMiddleware } from './monitoring/index.js';

app.use(monitoringMiddleware());
```

## 📊 Core Components

### Error Monitoring (Sentry)

Tracks payment-specific errors with enhanced context:

```javascript
import { trackPaymentError } from './monitoring/sentry-config.js';

try {
  // Payment processing code
} catch (error) {
  trackPaymentError(error, {
    orderId: 'ord_123',
    amount: 125.50,
    paymentMethod: 'card',
    errorType: 'payment_failed'
  });
}
```

### Analytics Integration (GA4)

Enhanced ecommerce tracking for payment flow:

```javascript
import { trackPurchase, trackPaymentFailed } from './monitoring/analytics-integration.js';

// Track successful purchase
trackPurchase({
  orderNumber: 'ORD12345',
  totalAmount: 250.00,
  items: [...],
  paymentMethod: 'card'
});

// Track payment failure
trackPaymentFailed({
  amount: 250.00,
  errorType: 'card_declined',
  paymentMethod: 'card'
});
```

### Performance Monitoring

Automatic performance tracking with configurable thresholds:

```javascript
import { withPaymentPerformanceMonitoring } from './monitoring/performance-monitor.js';

const processPayment = withPaymentPerformanceMonitoring('stripe_checkout', async (data) => {
  // Your payment processing logic
  return await stripe.paymentIntents.create(data);
});
```

### Business Intelligence

Track revenue, conversions, and customer behavior:

```javascript
import { trackBusinessMetric } from './monitoring/index.js';

// Track revenue
trackBusinessMetric('revenue', {
  amount: 125.50,
  currency: 'USD',
  orderId: 'ord_123',
  items: [...]
});

// Track conversion funnel
trackBusinessMetric('conversion', {
  step: 'purchase_completed',
  sessionId: 'sess_abc123',
  data: { amount: 125.50 }
});
```

### Alerting System

Multi-channel alerts for critical issues:

```javascript
import { sendAlert } from './monitoring/index.js';

// Payment failure alert
sendAlert('payment_failed', {
  error: new Error('Card declined'),
  context: {
    orderId: 'ord_123',
    amount: 125.50,
    paymentMethod: 'card'
  }
});

// Performance degradation alert
sendAlert('performance_degradation', {
  metric: 'api_response_time',
  value: 3500,
  threshold: 2000
});
```

## 📈 Dashboard & Metrics

### Real-time Dashboard

Access comprehensive system health and business metrics:

```javascript
import { getDashboardData, getExecutiveSummary } from './monitoring/index.js';

// Get complete dashboard data
const dashboard = getDashboardData();

// Get executive summary
const summary = getExecutiveSummary();
```

### Key Performance Indicators

The system tracks essential KPIs:

- **Revenue Metrics**: Daily/monthly revenue, growth rates, targets
- **Payment Performance**: Success rates, processing times, error rates
- **Conversion Metrics**: Funnel analysis, abandonment rates, optimization
- **System Health**: API response times, database performance, error rates
- **Customer Analytics**: New vs. returning, segmentation, behavior

### Health Check Endpoint

```javascript
import { getHealthCheck } from './monitoring/index.js';

app.get('/health', (req, res) => {
  res.json(getHealthCheck());
});
```

## ⚠️ Alert Configuration

### Alert Channels

Configure multiple notification channels:

- **Email**: Operations, development, business, security teams
- **Slack**: Real-time notifications with rich formatting
- **SMS**: Critical alerts for on-call personnel
- **PagerDuty**: Incident management integration
- **Discord**: Team communication platform
- **Webhooks**: Custom integrations

### Alert Rules

Pre-configured alert rules for common scenarios:

- **Critical Payment Failures**: Immediate notification with escalation
- **High Error Rates**: Threshold-based alerts with cooldown
- **Performance Degradation**: Response time and query performance
- **Security Incidents**: Immediate critical alerts
- **Low Inventory**: Business continuity warnings
- **Revenue Anomalies**: Business intelligence alerts

### Escalation Policies

Automatic escalation for unacknowledged critical alerts:

1. **Level 1**: Operations team via Slack + Email
2. **Level 2**: On-call engineer via SMS + PagerDuty  
3. **Level 3**: Executive team notification

## 🔧 Configuration

### Environment-Specific Settings

Different configurations for development, staging, and production:

```javascript
// Development: High sampling, local alerts
// Staging: Medium sampling, staging-specific alerts  
// Production: Optimized sampling, full alert channels
```

### Customizable Thresholds

Adjust performance and alert thresholds:

```javascript
performance: {
  thresholds: {
    api_response_time: 2000,    // 2 seconds
    db_query_time: 1000,        // 1 second
    payment_processing: 5000,   // 5 seconds
    email_delivery: 3000,       // 3 seconds
    inventory_check: 500        // 500ms
  }
}
```

## 🔒 Privacy & Security

### Data Protection

- **PII Sanitization**: Automatic removal of sensitive data from logs
- **Email Masking**: Customer emails are hashed for identification
- **IP Address Masking**: Partial IP masking for privacy
- **Payment Data Exclusion**: No payment details stored in monitoring

### Compliance

- **GDPR Compliant**: Privacy-first analytics configuration
- **PCI DSS Aligned**: No payment card data in monitoring systems
- **Audit Trails**: Security event logging and tracking

## 📱 Integration Examples

### Express.js Integration

```javascript
import express from 'express';
import { initializeMonitoring, monitoringMiddleware } from './monitoring/index.js';

const app = express();

// Initialize monitoring
await initializeMonitoring();

// Add monitoring middleware
app.use(monitoringMiddleware());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json(getHealthCheck());
});
```

### API Endpoint Monitoring

```javascript
import { withMonitoring, trackEcommerceEvent } from './monitoring/index.js';

const createCheckoutSession = withMonitoring('create_checkout_session', async (req, res) => {
  try {
    // Track checkout start
    trackEcommerceEvent('begin_checkout', {
      items: req.body.items,
      totalValue: req.body.totalAmount
    });

    // Process checkout
    const session = await stripe.checkout.sessions.create(data);

    // Track success
    trackEcommerceEvent('checkout_session_created', {
      sessionId: session.id,
      amount: session.amount_total / 100
    });

    res.json({ sessionId: session.id });

  } catch (error) {
    // Automatic error tracking via withMonitoring wrapper
    res.status(500).json({ error: 'Checkout failed' });
  }
});
```

### Frontend Integration

```javascript
// Initialize GA4 tracking
import { initializeGA4, trackAddToCart } from './monitoring/analytics-integration.js';

// Initialize on page load
initializeGA4();

// Track user actions
document.getElementById('add-to-cart').addEventListener('click', () => {
  trackAddToCart({
    id: 'full_weekend_pass',
    name: 'Full Weekend Pass',
    price: 125.00,
    category: 'festival_ticket'
  });
});
```

## 📊 Business Intelligence Features

### Revenue Analytics

- Real-time revenue tracking and trends
- Daily/monthly targets and progress
- Payment method breakdown
- Customer segment analysis

### Conversion Analytics

- Purchase funnel visualization
- Drop-off point identification
- A/B testing support
- Optimization recommendations

### Customer Analytics

- New vs. returning customer metrics
- Customer lifetime value tracking
- Behavior pattern analysis
- Segmentation and targeting

### Inventory Analytics

- Real-time stock levels
- Low inventory alerts
- Demand forecasting
- Reservation management

## 🚨 Troubleshooting

### Common Issues

1. **Sentry Not Initializing**
   - Check SENTRY_DSN environment variable
   - Verify network connectivity to Sentry

2. **GA4 Events Not Tracking**
   - Verify GA4_MEASUREMENT_ID is correct
   - Check browser console for errors
   - Ensure gtag script is loaded

3. **Alerts Not Sending**
   - Verify alert channel configuration
   - Check webhook URLs and API keys
   - Review alert cooldown settings

4. **Dashboard Not Updating**
   - Check real-time update interval
   - Verify data source connections
   - Review performance monitoring setup

### Debug Mode

Enable debug logging:

```bash
DEBUG_PERFORMANCE=true npm start
```

### Health Monitoring

Monitor the monitoring system itself:

```javascript
// Check monitoring system health
const health = getHealthCheck();
console.log('Monitoring system status:', health.status);
```

## 🔮 Future Enhancements

- **Machine Learning**: Anomaly detection and predictive analytics
- **Advanced Dashboards**: Custom visualization and reporting
- **Mobile App**: iOS/Android monitoring dashboard
- **API Integrations**: Additional third-party service monitoring
- **Cost Optimization**: Monitoring spend analysis and optimization

## 📞 Support

For monitoring system support:

- **Technical Issues**: dev@alocubanoboulderfest.com
- **Business Metrics**: business@alocubanoboulderfest.com  
- **Security Alerts**: security@alocubanoboulderfest.com
- **General Questions**: ops@alocubanoboulderfest.com

## 📄 License

This monitoring system is part of the A Lo Cubano Boulder Fest platform and is proprietary software.

---

*Built with ❤️ for the A Lo Cubano Boulder Fest community*
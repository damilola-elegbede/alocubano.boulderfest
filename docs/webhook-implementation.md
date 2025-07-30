# Stripe Webhook Implementation - A Lo Cubano Boulder Fest

## Overview

This document describes the comprehensive Stripe webhook implementation for the A Lo Cubano Boulder Fest payment system. The webhook handler provides secure, reliable processing of payment events with proper error handling, idempotency protection, and integration with email notifications and analytics.

## Architecture

### Core Components

1. **Webhook Handler** (`/api/webhooks/stripe.js`)
   - Main webhook endpoint processing Stripe events
   - Signature verification for security
   - Event idempotency protection
   - Comprehensive error handling and logging

2. **Security Middleware** (`/api/middleware/webhook-security.js`)
   - Rate limiting per IP address
   - Request validation and sanitization
   - IP allowlisting for known providers
   - DDOS protection measures

3. **Database Service** (`/api/lib/database.js`)
   - Order and payment management
   - Event tracking for idempotency
   - Audit logging for compliance
   - Customer data handling

4. **Email Service** (`/api/lib/email-service.js`)
   - Order confirmation emails
   - Payment failure notifications
   - Refund confirmations
   - Template-based email generation

5. **Analytics Service** (`/api/lib/analytics-service.js`)
   - Conversion tracking
   - Payment failure analysis
   - Customer behavior insights
   - Google Analytics 4 integration

## Supported Events

### Primary Events

#### `checkout.session.completed`
Triggered when a customer successfully completes a Stripe Checkout session.

**Processing Steps:**
1. Verify event authenticity and check for duplicates
2. Confirm ticket reservation in inventory system
3. Update order status to 'completed'
4. Send order confirmation email to customer
5. Track conversion in analytics system
6. Log audit event for compliance

**Example Event Data:**
```json
{
  "id": "evt_1234567890",
  "type": "checkout.session.completed",
  "data": {
    "object": {
      "id": "cs_test_abc123",
      "payment_intent": "pi_test_xyz789",
      "amount_total": 30000,
      "currency": "usd",
      "customer_email": "customer@example.com",
      "metadata": {
        "reservationId": "res_abc123",
        "customerName": "John Doe"
      }
    }
  }
}
```

#### `payment_intent.succeeded`
Triggered when a payment is successfully processed.

**Processing Steps:**
1. Update payment status in database
2. Record payment details and charges
3. Log audit event

#### `payment_intent.payment_failed`
Triggered when a payment attempt fails.

**Processing Steps:**
1. Release any reserved inventory
2. Update order status to 'payment_failed'
3. Send payment failure notification email
4. Track payment failure in analytics
5. Log failure details for analysis

**Common Failure Codes:**
- `card_declined`: Card was declined by the issuer
- `insufficient_funds`: Insufficient funds in account
- `expired_card`: Card has expired
- `incorrect_cvc`: Invalid security code
- `authentication_required`: 3D Secure authentication needed

#### `charge.refunded`
Triggered when a charge is refunded (full or partial).

**Processing Steps:**
1. Record refund details in database
2. Update order status appropriately
3. Send refund confirmation email
4. Track refund in analytics system
5. Log refund audit event

### Secondary Events

#### `checkout.session.expired`
Triggered when a checkout session expires without payment.

**Processing Steps:**
1. Release reserved inventory
2. Update order status to 'expired'
3. Log session expiration

## Security Features

### Webhook Signature Verification

All incoming webhooks are verified using Stripe's signature verification:

```javascript
function verifyWebhookSignature(rawBody, signature, secret) {
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (error) {
    throw new Error(`Webhook signature verification failed: ${error.message}`);
  }
}
```

**Security Headers Applied:**
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Referrer-Policy: strict-origin-when-cross-origin`

### Rate Limiting

Built-in rate limiting prevents abuse:
- Maximum 100 requests per minute per IP
- 5-minute block duration for violators
- Automatic cleanup of old rate limit records

### IP Allowlisting

Optional IP filtering for production environments:
- Configurable allowed IP ranges
- Support for Stripe's webhook IP ranges
- Bypass for development environments

### Request Validation

Comprehensive request validation:
- Content-Type header verification
- User-Agent presence check
- Body size limits (1MB maximum)
- Timeout protection (10 seconds)

## Idempotency Protection

### Event Deduplication

Each webhook event is processed exactly once:

```javascript
const alreadyProcessed = await databaseService.isEventProcessed(event.id);
if (alreadyProcessed) {
  return res.status(200).json({ 
    received: true, 
    duplicate: true,
    eventId: event.id 
  });
}
```

### Database Implementation

Events are tracked in the `webhook_events` table:
- `provider_event_id`: Unique event identifier from Stripe
- `event_type`: Type of event processed
- `payload`: Full event data for debugging
- `processed_at`: Timestamp of processing

## Error Handling

### Retry Strategy

Exponential backoff with jitter for transient failures:

```javascript
async function retryWithBackoff(fn, maxRetries = 3, initialDelay = 1000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      
      const delay = initialDelay * Math.pow(2, attempt) + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

### Error Classification

**Retryable Errors (Return 500):**
- `DatabaseConnectionError`
- `InventoryLockError`
- `EmailServiceTimeout`
- `AnalyticsServiceTimeout`
- Network timeouts

**Non-Retryable Errors (Return 200):**
- Invalid event data
- Business logic violations
- Customer-specific errors

### Timeout Protection

Processing timeout prevents hanging requests:
- 30-second maximum processing time
- Automatic timeout detection
- Graceful error response

## Integration Points

### Database Integration

```javascript
// Order status update
await databaseService.updateOrderStatus(paymentIntentId, {
  status: 'completed',
  payment_method: 'stripe',
  customer_email: customerEmail,
  total: amount,
  completed_at: new Date().toISOString()
});
```

### Email Service Integration

```javascript
// Order confirmation
await emailService.sendOrderConfirmation({
  customer_email: order.customer_email,
  order_number: order.order_number,
  total: order.total,
  items: order.items,
  event_name: 'A Lo Cubano Boulder Fest 2026'
});
```

### Analytics Integration

```javascript
// Conversion tracking
await analyticsService.trackConversion({
  orderId: order.id,
  value: order.total,
  currency: order.currency,
  paymentMethod: 'stripe',
  sessionId: session.id
});
```

### Inventory Management

```javascript
// Confirm reservation
await inventoryManager.confirmReservation(reservationId);

// Release reservation on failure
await inventoryManager.releaseReservation(reservationId);
```

## Configuration

### Environment Variables

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Database
POSTGRES_URL=postgres://...

# Email Service
SENDGRID_API_KEY=SG....
SENDGRID_FROM_EMAIL=noreply@alocubanoboulderfest.com

# Analytics
GA_MEASUREMENT_ID=G-XXXXXXXXXX
GA_API_SECRET=...

# Application
NODE_ENV=production
```

### Webhook Configuration in Stripe

1. **Create Webhook Endpoint** in Stripe Dashboard
   - URL: `https://alocubanoboulderfest.com/api/webhooks/stripe`
   - Events to send: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `checkout.session.expired`

2. **Configure Webhook Settings**
   - Enable webhook signature verification
   - Set API version to `2023-10-16`
   - Configure retry settings (default is acceptable)

## Monitoring and Logging

### Structured Logging

All webhook events are logged with structured data:

```javascript
console.log(`🔐 Webhook signature verified: ${event.type} (${event.id}) from IP ${clientIP}`);
console.log(`✅ Webhook processed successfully: ${event.type} (${event.id}) in ${processingTime}ms`);
```

### Performance Monitoring

- Processing time tracking
- Slow operation warnings (>5 seconds)
- Success/failure rate monitoring
- Memory usage tracking

### Audit Trail

Complete audit trail for compliance:
- All webhook events logged with timestamps
- Order status changes tracked
- Payment state transitions recorded
- Error details preserved

## Testing

### Unit Tests

Test individual components in isolation:

```javascript
describe('Webhook Security', () => {
  test('should reject requests without Stripe signature', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      headers: { 'content-type': 'application/json' }
    });

    await webhookHandler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });
});
```

### Integration Tests

Test complete webhook processing flow:

```javascript
describe('Event Processing', () => {
  test('should process checkout.session.completed event', async () => {
    const mockEvent = {
      id: 'evt_test_checkout_completed',
      type: 'checkout.session.completed',
      data: { object: { /* checkout session data */ } }
    };

    const response = await processWebhook(mockEvent);
    expect(response.status).toBe(200);
  });
});
```

### End-to-End Tests

Test entire payment flow from checkout to webhook processing.

## Deployment

### Vercel Configuration

```json
{
  "functions": {
    "api/webhooks/*.js": {
      "maxDuration": 30
    }
  },
  "headers": [
    {
      "source": "/api/webhooks/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" }
      ]
    }
  ]
}
```

### Health Checks

Webhook endpoint includes health monitoring:
- Processing time measurement
- Error rate tracking
- Memory usage monitoring
- Database connection health

## Troubleshooting

### Common Issues

1. **Signature Verification Failures**
   - Verify `STRIPE_WEBHOOK_SECRET` is correct
   - Check raw body parsing configuration
   - Ensure webhook endpoint URL matches Stripe configuration

2. **Duplicate Event Processing**
   - Check database idempotency implementation
   - Verify event ID uniqueness
   - Review cleanup processes for old events

3. **Email Delivery Failures**
   - Verify SendGrid API key and configuration
   - Check email template IDs
   - Review rate limiting settings

4. **Slow Processing Warnings**
   - Review database query performance
   - Check external service response times
   - Optimize retry mechanisms

### Debug Mode

Enable debug logging in development:

```env
NODE_ENV=development
DEBUG=webhook:*
```

## Security Considerations

### Sensitive Data Handling

- Never log payment method details
- Hash customer emails in analytics
- Sanitize error messages in production
- Implement proper data retention policies

### Compliance

- PCI DSS compliance through Stripe
- GDPR data protection measures
- SOC 2 audit trail requirements
- Regular security assessments

## Performance Optimization

### Caching Strategy

- Event idempotency caching
- Database connection pooling
- Email template caching
- Analytics batching

### Scalability

- Horizontal scaling support
- Database sharding considerations
- CDN integration for static assets
- Load balancing configuration

## Future Enhancements

### Planned Features

1. **Advanced Analytics**
   - Customer lifetime value tracking
   - Cohort analysis
   - Revenue forecasting

2. **Enhanced Security**
   - API rate limiting by user
   - Advanced fraud detection
   - Security incident response

3. **Operational Improvements**
   - Automated monitoring alerts
   - Performance optimization
   - Enhanced error recovery

### Integration Roadmap

- PayPal webhook support
- Apple Pay integration
- Google Pay support
- Cryptocurrency payments

## Conclusion

This webhook implementation provides a robust, secure, and scalable foundation for processing Stripe payment events. The comprehensive error handling, security measures, and monitoring capabilities ensure reliable operation in production environments while maintaining compliance with industry standards.

For questions or support, contact: support@alocubanoboulderfest.com
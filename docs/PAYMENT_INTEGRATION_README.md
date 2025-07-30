# Payment Integration - Implementation Guide

## Overview

This document provides a comprehensive guide to the Stripe payment integration implemented for A Lo Cubano Boulder Fest. The system provides secure, PCI-compliant payment processing with modern security practices.

## Architecture

### Core Components

```
Frontend (Stripe Elements) → API Endpoints → Stripe Checkout → Webhooks
                          ↓                    ↓             ↓
                    Inventory Management → Order Management → Email Receipts
```

### File Structure

```
/api/
├── payment/
│   ├── create-checkout-session.js  # Main checkout endpoint
│   └── calculate-total.js          # Server-side price calculation
├── inventory/
│   └── check-availability.js      # Real-time inventory check
└── webhooks/
    └── stripe.js                   # Payment event processing

/lib/
├── payment/
│   ├── config.js                  # Payment configuration
│   ├── validation.js              # Input validation utilities
│   └── calculator.js              # Price calculation logic
├── inventory/
│   └── manager.js                 # Inventory management system
├── middleware/
│   └── rateLimiter.js             # Rate limiting protection
└── utils/
    └── errorHandler.js            # Comprehensive error handling
```

## Key Features

### Security Features
- ✅ **Rate Limiting**: Protection against abuse
- ✅ **Input Validation**: Comprehensive data validation
- ✅ **Error Handling**: Secure error messages without data leakage
- ✅ **Webhook Verification**: Stripe signature validation
- ✅ **Inventory Locking**: Prevents overselling with distributed locks
- ✅ **Idempotency**: Prevents duplicate processing
- ✅ **Security Headers**: XSS and clickjacking protection

### Business Features
- ✅ **Multiple Ticket Types**: Full pass, single day, VIP, donations
- ✅ **Real-time Inventory**: Live availability checking
- ✅ **Temporary Reservations**: 15-minute hold on tickets during checkout
- ✅ **Server-side Validation**: Price tampering protection
- ✅ **Automatic Cleanup**: Expired reservations and locks cleanup
- ✅ **Comprehensive Logging**: Structured logging without sensitive data

## API Endpoints

### POST /api/payment/create-checkout-session

Creates a secure Stripe checkout session.

**Request Body:**
```json
{
  "items": [
    {
      "id": "full-pass",
      "quantity": 2,
      "price": 150
    }
  ],
  "customerInfo": {
    "email": "customer@example.com",
    "name": "John Doe",
    "phone": "+1234567890"
  }
}
```

**Response:**
```json
{
  "sessionId": "cs_test_...",
  "orderId": "ord_...",
  "orderNumber": "ORD12345",
  "expiresAt": 1640995200,
  "totalAmount": 300.00,
  "reservationId": "res_..."
}
```

### POST /api/payment/calculate-total

Server-side price calculation for validation.

**Request Body:**
```json
{
  "items": [
    {
      "id": "full-pass",
      "quantity": 2,
      "price": 150
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "total": 30000,
  "totalDollars": 300.00,
  "breakdown": {
    "subtotal": 300.00,
    "fees": 0,
    "tax": 0,
    "total": 300.00,
    "items": [...]
  }
}
```

### GET /api/inventory/check-availability

Returns current inventory levels.

**Response:**
```json
{
  "success": true,
  "inventory": {
    "full-pass": {
      "available": 485,
      "reserved": 15,
      "sold": 0,
      "total": 500
    }
  }
}
```

### POST /api/webhooks/stripe

Handles Stripe webhook events (requires webhook signature).

## Configuration

### Environment Variables

Copy `.env.template` to `.env.local` and configure:

```bash
# Required for payment processing
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Application settings
NODE_ENV=development
VERCEL_URL=http://localhost:3000
```

### Ticket Configuration

Edit `/lib/payment/config.js` to configure available tickets:

```javascript
tickets: {
  'full-pass': {
    id: 'full-pass',
    name: 'Full Festival Pass',
    price: 150,
    maxQuantity: 10,
    available: 500,
  }
}
```

## Error Handling

### Error Types

The system handles various error scenarios:

1. **Validation Errors** (400): Invalid input data
2. **Inventory Errors** (409): Insufficient ticket availability
3. **Payment Errors** (400-500): Stripe-related issues
4. **Rate Limiting** (429): Too many requests
5. **Security Errors** (403): Suspicious activity

### Error Response Format

```json
{
  "error": "User-friendly error message",
  "code": "ERROR_CODE",
  "type": "ErrorType",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Logging

All errors are logged with structured data:
- **INFO**: Normal operations, successful payments
- **WARN**: Failed payments, inventory issues
- **ERROR**: System errors, Stripe API failures
- **CRITICAL**: Security events, configuration errors

## Security Considerations

### PCI Compliance

- Payment data never touches your servers
- Stripe Elements handles card collection
- Webhook verification prevents tampering
- No sensitive data stored locally

### Rate Limiting

Different limits for different operations:
- **Payment attempts**: 10 per 15 minutes per IP+email
- **API calls**: 60 per minute per IP
- **Webhooks**: 100 per minute per IP

### Input Validation

All inputs are validated and sanitized:
- Email format validation
- Price tampering detection
- Quantity limits enforcement
- SQL injection prevention

## Inventory Management

### Reservation System

1. **Check Availability**: Verify tickets are available
2. **Create Reservation**: Hold tickets for 15 minutes
3. **Process Payment**: Stripe handles payment collection
4. **Confirm/Release**: Webhook confirms or releases reservation

### Concurrency Control

- Distributed locking prevents race conditions
- Atomic operations ensure data consistency
- Automatic cleanup of expired reservations

## Testing

### Test Cards

Use Stripe test cards for development:

```bash
# Successful payment
4242424242424242

# Card declined
4000000000000002

# Authentication required
4000002500003155
```

### Test Webhooks

Use Stripe CLI to forward webhooks locally:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

## Monitoring

### Health Checks

Monitor these key metrics:

1. **Payment Success Rate**: Should be > 95%
2. **API Response Time**: Should be < 200ms (p95)
3. **Inventory Accuracy**: Should be 100%
4. **Error Rate**: Should be < 0.1%

### Alerts

Set up alerts for:
- Payment failures > 5% in 5 minutes
- API response time > 1s (p95)
- Low inventory (< 10% remaining)
- Security events

## Deployment

### Vercel Configuration

The system is optimized for Vercel serverless functions:

```json
{
  "functions": {
    "api/payment/*.js": {
      "maxDuration": 30
    },
    "api/webhooks/*.js": {
      "maxDuration": 30
    }
  }
}
```

### Environment Setup

1. **Development**: Use test mode with Stripe test keys
2. **Staging**: Mirror production but with test keys
3. **Production**: Live keys with monitoring enabled

## Troubleshooting

### Common Issues

**"Payment failed" errors:**
- Check Stripe dashboard for decline reasons
- Verify webhook endpoint is accessible
- Check environment variables

**"Insufficient inventory" errors:**
- Check inventory levels in logs
- Verify reservation cleanup is working
- Look for distributed lock issues

**Webhook failures:**
- Verify webhook signature validation
- Check endpoint URL configuration
- Monitor webhook retry attempts

### Debug Mode

Enable debug logging by setting:
```bash
NODE_ENV=development
```

## Support

For technical issues:
1. Check the error logs for detailed error information
2. Verify Stripe dashboard for payment status
3. Review webhook delivery attempts
4. Check inventory levels and reservations

## Next Steps

### Production Checklist

- [ ] Configure production Stripe keys
- [ ] Set up webhook endpoints
- [ ] Configure monitoring and alerts
- [ ] Test payment flows end-to-end
- [ ] Set up backup and recovery procedures
- [ ] Configure email receipt system
- [ ] Test with real payment methods

### Future Enhancements

- [ ] PayPal integration
- [ ] Apple Pay/Google Pay support
- [ ] Subscription-based tickets
- [ ] Multi-currency support
- [ ] Advanced analytics integration
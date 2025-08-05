# Stripe Payment Integration Documentation

## Overview

This document describes the Stripe payment integration implemented for A Lo Cubano Boulder Fest. The integration enables secure payment processing for both ticket purchases and donations.

## Architecture

### Backend Components

1. **Database Schema** (`/migrations/20250105_add_orders_table.sql`)
   - SQLite table for order tracking
   - Stores order details, customer info, and fulfillment status
   - Does NOT store sensitive payment data (handled by Stripe)

2. **API Endpoints**
   - `/api/payments/create-payment-intent.js` - Creates Stripe payment intents
   - `/api/payments/stripe-webhook.js` - Handles Stripe webhook events

3. **Database Utility** (`/api/lib/database.js`)
   - SQLite connection management
   - Automatic migration running
   - PostgreSQL to SQLite syntax conversion

### Frontend Components

1. **Payment Integration Library** (`/js/lib/stripe-integration.js`)
   - Stripe Elements initialization
   - Payment form handling
   - Customer data validation

2. **Updated Components**
   - `/js/ticket-selection.js` - Ticket purchase flow with payment modal
   - `/js/donation-selection.js` - Donation flow with payment processing

3. **Styling** (`/css/payment-modal.css`)
   - Payment modal design
   - Responsive layout
   - Dark mode support

## Setup Instructions

### 1. Environment Variables

Create a `.env.local` file based on `.env.example`:

```bash
# Test Keys
STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Production Keys (when ready)
STRIPE_PUBLISHABLE_KEY=pk_live_your_key_here
STRIPE_SECRET_KEY=sk_live_your_key_here
```

### 2. Stripe Dashboard Configuration

1. **Create Webhook Endpoint**
   - URL: `https://yourdomain.com/api/payments/stripe-webhook`
   - Events to listen for:
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
     - `payment_intent.canceled`
     - `charge.refunded`

2. **Copy Webhook Secret**
   - Find in Stripe Dashboard > Webhooks > Your endpoint
   - Add to `STRIPE_WEBHOOK_SECRET` environment variable

### 3. Frontend Key Loading

The Stripe publishable key is securely loaded from environment variables via the `/api/config/stripe-public` endpoint. This ensures:
- No hardcoded keys in source files
- Keys can be rotated without code changes
- Different keys for different environments (dev/staging/prod)

The key is automatically fetched when the payment pages load.

### 4. Database Setup

The SQLite database will be automatically created on first API call. Migrations run automatically.

## Testing

### Test Cards

Use these Stripe test cards:

- **Success**: `4242 4242 4242 4242`
- **Decline**: `4000 0000 0000 0002`
- **Authentication Required**: `4000 0025 0000 3155`

### Running Tests

```bash
npm run test:unit -- tests/unit/stripe-payment.test.js
```

## Payment Flow

### Ticket Purchase

1. User selects tickets on `/tickets` page
2. Clicks checkout in floating cart
3. Payment modal appears with order summary
4. User enters customer info and card details
5. Payment processed via Stripe
6. Order saved to database
7. Confirmation email sent via Brevo
8. Success message displayed

### Donation

1. User selects donation amount on `/donations` page
2. Adds to cart
3. Clicks checkout in floating cart
4. Same payment flow as tickets

## Security Considerations

1. **PCI Compliance**
   - Card details never touch our servers
   - Stripe Elements handles all sensitive data
   - Only payment intent IDs stored locally

2. **Webhook Verification**
   - All webhooks verified using Stripe signature
   - Raw body verification prevents tampering

3. **Input Validation**
   - Email format validation
   - Amount validation (positive numbers only)
   - XSS prevention through proper escaping

## Error Handling

1. **Payment Failures**
   - Clear error messages shown to users
   - Order status updated to 'failed'
   - No charge attempted

2. **Network Errors**
   - Graceful fallback messages
   - Payment intent automatically canceled on server errors

3. **Webhook Failures**
   - Non-blocking - returns 200 to prevent retries
   - Errors logged for investigation

## Monitoring

### Key Metrics to Track

1. **Payment Success Rate**
   - Monitor `payment_intent.succeeded` vs `payment_intent.failed`

2. **Order Fulfillment**
   - Track orders by `fulfillment_status`

3. **Webhook Processing**
   - Monitor webhook response times
   - Check for signature verification failures

### Logs to Review

- Payment intent creation failures
- Webhook processing errors
- Database connection issues

## Future Enhancements

1. **PayPal Integration**
   - Add as alternative payment method
   - Same order tracking system

2. **Recurring Donations**
   - Stripe subscription support
   - Monthly giving options

3. **Admin Dashboard**
   - Order management interface
   - Refund processing
   - Sales reports

## Troubleshooting

### Common Issues

1. **"Stripe not initialized" error**
   - Check publishable key is set correctly
   - Verify Stripe script loaded

2. **Payment intent creation fails**
   - Check API keys in environment
   - Verify server has database access

3. **Webhooks not received**
   - Check webhook endpoint URL
   - Verify webhook secret matches

### Debug Mode

Enable debug logging:

```javascript
// In browser console
localStorage.setItem('stripe_debug', 'true');
```

## Support

For Stripe-specific issues:
- Stripe Documentation: https://stripe.com/docs
- Stripe Support: https://support.stripe.com

For implementation questions:
- Review this documentation
- Check test files for examples
- Contact: alocubanoboulderfest@gmail.com
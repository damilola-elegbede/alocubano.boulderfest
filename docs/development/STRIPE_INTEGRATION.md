# Stripe Payment Integration Documentation

## Overview

This document describes the Stripe Checkout Sessions payment integration implemented for A Lo Cubano Boulder Fest. The integration enables secure payment processing for both ticket purchases and donations using Stripe's hosted checkout flow.

## Key Changes from Previous Implementation

- Migrated from Payment Intents with custom modal to Stripe Checkout Sessions
- Stripe now handles the entire payment collection flow
- Improved conversion rates and simplified PCI compliance
- Redirect-based checkout experience
- Built-in email collection and validation

## Architecture

### Backend Components

1. **Database Schema** (`/migrations/20250105_add_orders_table.sql`)
   - SQLite table for order tracking
   - Stores order details, customer info, and fulfillment status
   - Does NOT store sensitive payment data (handled by Stripe)

2. **API Endpoints**
   - `/api/payments/create-checkout-session.js` - Creates Stripe Checkout Sessions
   - `/api/payments/stripe-webhook.js` - Handles Stripe webhook events
   - `/api/payments/handle-payment-success.js` - Processes successful payments

3. **Database Utility** (`/api/lib/database.js`)
   - SQLite connection management
   - Automatic migration running

### Frontend Components

1. **Checkout Integration** (`/js/lib/stripe-integration.js`)
   - Creates Checkout Sessions via API
   - Handles redirection to Stripe Checkout
   - Email collection before checkout

2. **Updated Components**
   - `/js/floating-cart.js` - Email collection modal and checkout trigger
   - `/js/ticket-selection.js` - Simplified ticket selection without payment modal
   - `/js/donation-selection.js` - Simplified donation flow without payment modal

3. **Success/Failure Pages**
   - `/pages/success.html` - Order confirmation page
     - Displays order details and amount
     - Shows "Next step is registration" for ticket purchases
     - Automatically clears cart
     - Auto-redirects to home after 5 seconds
   - `/pages/failure.html` - Payment failure/cancellation page
     - Apologetic messaging
     - Preserves cart for retry
     - Contact information for support
     - Auto-redirects to tickets page after 3 seconds

## Setup Instructions

### 1. Environment Variables

Update your `.env.local` file with the following variables:

```bash
# Existing Stripe Keys
STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Optional: Configure default settings
STRIPE_DEFAULT_CURRENCY=usd
STRIPE_PAYMENT_METHOD_TYPES=card,us_bank_account
```

### 2. Stripe Dashboard Configuration

1. **Create Webhook Endpoint**
   - URL: `https://yourdomain.com/api/payments/stripe-webhook`
   - Events to listen for:
     - `checkout.session.completed`
     - `checkout.session.async_payment_succeeded`
     - `checkout.session.async_payment_failed`
     - `charge.refunded`

2. **Return URLs**
   - Success and cancel pages are automatically handled by the application
   - Success: `/success.html` - Displays order confirmation and next steps
   - Cancel: `/failure.html` - Shows error message with retry options
   - URLs are dynamically generated based on the request origin

### 3. Checkout Session Flow

1. Client requests Checkout Session via `/api/payments/create-checkout-session`
2. Server creates Stripe Checkout Session with:
   - Order details
   - Supported payment methods
   - Return URLs
3. Client redirected to Stripe-hosted checkout
4. After payment, redirected back to success/cancel URL
5. Webhook processes final payment confirmation

## Testing

### Test Cards and Scenarios

- **Successful Payment**: `4242 4242 4242 4242`
- **Authentication Required**: `4000 0025 0000 3155`
- **Declined**: `4000 0000 0000 0002`

### Running Tests

```bash
npm run test:unit -- tests/unit/stripe-checkout.test.js
```

## Payment Flow

### Ticket Purchase

1. User selects tickets on `/tickets` page
2. Clicks checkout in floating cart
3. Email collection modal appears
4. API creates Stripe Checkout Session
5. Redirected to Stripe-hosted payment page
6. Completes payment
7. Redirected to `/success.html` with order details
8. Success page shows "Next step is registration" message
9. Cart automatically cleared
10. Webhook processes order fulfillment
11. Confirmation email sent via Brevo

### Donation Flow

1. User selects donation amount on `/donations` page
2. Clicks checkout in floating cart
3. Email collection modal appears
4. API creates Stripe Checkout Session
5. Redirected to Stripe-hosted payment page
6. Completes payment
7. Redirected to `/success.html` with order details
8. Success page shows "Transaction successful" message
9. Cart automatically cleared

### Failed/Cancelled Payment Flow

1. User cancels payment or payment fails
2. Redirected to `/failure.html`
3. Apologetic message displayed with retry options
4. Cart preserved for retry
5. Contact information provided for support

## Security Considerations

1. **PCI Compliance**
   - Entire payment flow hosted by Stripe
   - No card details touch our servers
   - Built-in fraud protection

2. **Webhook Verification**
   - All webhooks verified using Stripe signature
   - Raw body verification prevents tampering

3. **Input Validation**
   - Stripe handles email and payment validation
   - Server-side amount and order validation

## Error Handling

1. **Payment Failures**
   - Clear error messages on return
   - Order status updated to 'failed'
   - No charge attempted if payment incomplete

2. **Redirect Scenarios**
   - Success URL: Payment completed
   - Cancel URL: User abandoned checkout
   - Webhook confirms final payment status

## Monitoring and Metrics

### Key Metrics

1. **Checkout Conversion Rate**
   - Monitor `checkout.session.completed` events
   - Track abandonment rates

2. **Payment Success Rate**
   - Compare completed vs. initiated sessions

3. **Webhook Processing**
   - Monitor webhook response times
   - Check signature verification

## Troubleshooting

### Common Issues

1. **Checkout Session Creation Fails**
   - Verify Stripe API keys
   - Check server environment
   - Validate order details

2. **Webhook Not Received**
   - Check webhook endpoint URL
   - Verify webhook secret
   - Ensure network accessibility

### Debug Mode

```javascript
// In browser console
localStorage.setItem("stripe_debug", "true");
```

## Support and Resources

- Stripe Checkout Documentation: https://stripe.com/docs/checkout
- Implementation Questions: alocubanoboulderfest@gmail.com

## Future Enhancements

1. **Payment Method Expansion**
   - Apple Pay
   - Google Pay
   - International payment methods

2. **Recurring Donations**
   - Stripe Checkout for subscriptions
   - Monthly giving options

3. **Advanced Reporting**
   - Detailed checkout analytics
   - Conversion optimization tools

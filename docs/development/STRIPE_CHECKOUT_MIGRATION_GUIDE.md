# Stripe Integration: Payment Intents to Checkout Sessions Migration Guide

## Overview

This guide provides a comprehensive walkthrough for migrating from Stripe Payment Intents with a custom modal to Stripe Checkout Sessions.

## Pre-Migration Checklist

### Technical Requirements

- Node.js 16+
- Stripe API version 2023-10-16 or later
- Updated Stripe library (`stripe@latest`)

### Preparation Steps

1. Backup current production database
2. Update Stripe library in `package.json`
3. Review and update environment configurations
4. Prepare test environment for migration validation

## Migration Steps

### 1. Backend Changes

#### API Endpoint Updates

- Replace `/api/payments/create-payment-intent.js` with `/api/payments/create-checkout-session.js`
- Modify `/api/payments/stripe-webhook.js` to handle new Checkout Session events

```javascript
// Example Checkout Session Creation
const session = await stripe.checkout.sessions.create({
  payment_method_types: ["card"],
  mode: "payment",
  success_url: process.env.STRIPE_SUCCESS_URL,
  cancel_url: process.env.STRIPE_CANCEL_URL,
  line_items: [
    {
      price_data: {
        currency: "usd",
        product_data: {
          name: "Event Ticket",
        },
        unit_amount: orderTotal * 100, // Amount in cents
      },
      quantity: 1,
    },
  ],
  metadata: {
    orderId: order.id,
    customerEmail: order.email,
  },
});
```

#### Webhook Handler Changes

```javascript
// Updated webhook handler
switch (event.type) {
  case "checkout.session.completed":
    const session = event.data.object;
    await processSuccessfulPayment(session.metadata.orderId);
    break;
  case "checkout.session.async_payment_succeeded":
    // Handle delayed payment confirmations
    break;
}
```

### 2. Frontend Changes

#### Update Checkout Flow

- Remove custom payment modal logic
- Replace with Stripe Checkout redirection

```javascript
// New checkout method
async function initiateCheckout(orderDetails) {
  try {
    const response = await fetch("/api/payments/create-checkout-session", {
      method: "POST",
      body: JSON.stringify(orderDetails),
    });
    const { sessionUrl } = await response.json();

    // Redirect to Stripe Checkout
    window.location.href = sessionUrl;
  } catch (error) {
    // Handle checkout initiation errors
  }
}
```

### 3. Database Migration

#### Update Order Schema

```sql
-- Migration script
ALTER TABLE orders ADD COLUMN stripe_checkout_session_id TEXT;
ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'pending';
```

### 4. Environment Configuration

Update `.env.example` and `.env` files:

```bash
# New variables
STRIPE_SUCCESS_URL=https://yourdomain.com/payment/success
STRIPE_CANCEL_URL=https://yourdomain.com/payment/cancel
STRIPE_DEFAULT_CURRENCY=usd
STRIPE_PAYMENT_METHOD_TYPES=card,us_bank_account
```

## Testing Strategies

### Unit Tests

- Test Checkout Session creation
- Validate webhook event processing
- Check order status updates

### Integration Tests

- Complete full purchase flow
- Test success and cancellation scenarios
- Verify email confirmations

### Manual Testing Scenarios

1. Successful ticket purchase
2. Donation with different amounts
3. Payment cancellation
4. Failed payment scenarios

## Common Migration Challenges

### 1. Payment State Management

- Update order status tracking
- Handle async payment confirmations
- Manage checkout session lifecycles

### 2. Error Handling

- Implement robust error catching
- Provide clear user feedback
- Log detailed error information

## Rollback Procedure

If migration causes issues:

1. Revert Stripe library to previous version
2. Restore previous API endpoint implementations
3. Rollback database schema changes
4. Revert environment configurations

## Performance Considerations

- Checkout Sessions reduce frontend complexity
- Slightly increased initial page load time
- Improved conversion rates expected
- Better fraud protection

## Security Enhancements

- Built-in Stripe fraud detection
- Reduced PCI compliance scope
- Secure, hosted payment page
- Automatic email validation

## Post-Migration Checklist

- [ ] Verify all payment flows work
- [ ] Check webhook event processing
- [ ] Test error scenarios
- [ ] Monitor conversion rates
- [ ] Review server logs
- [ ] Update documentation

## Support and Resources

- Stripe Checkout Documentation: https://stripe.com/docs/checkout
- Migration Support: alocubanoboulderfest@gmail.com

## Version Compatibility

- Minimum Stripe Library: `stripe@14.0.0`
- Recommended Node.js: `16.x` or later

## Future Improvements

1. Add more payment methods
2. Implement subscription support
3. Enhanced reporting and analytics

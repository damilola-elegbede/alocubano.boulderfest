# Stripe Checkout Sessions Migration Guide

## Overview

This guide outlines the database evolution strategy for migrating from Stripe Payment Intents to Checkout Sessions while maintaining zero-downtime and backward compatibility.

## Database Changes

### New Fields Added

1. **stripe_checkout_session_id** (TEXT)
   - Stores the Checkout Session ID from Stripe
   - Indexed for efficient lookups
   - Can coexist with payment_intent_id

2. **payment_method** (TEXT)
   - Values: `payment_intent` or `checkout_session`
   - Defaults to `payment_intent` for backward compatibility
   - Allows tracking which payment flow was used

3. **checkout_session_url** (TEXT)
   - Stores the hosted checkout URL
   - Used for recovery if customer abandons checkout

4. **checkout_session_expires_at** (TEXT)
   - Stores expiration timestamp
   - Enables automatic cleanup of expired sessions

5. **stripe_customer_id** (TEXT)
   - Links orders to Stripe Customer objects
   - Enables better customer experience and reporting

### New Fulfillment States

- **awaiting_payment**: Order created, checkout session active
- **expired**: Checkout session expired without payment

### Migration Strategy

#### Phase 1: Blue-Green Database Evolution

1. Apply schema changes that support both payment methods
2. Update application code to handle both flows
3. Gradually migrate traffic to Checkout Sessions
4. Monitor both flows in parallel

#### Phase 2: API Endpoint Updates

```javascript
// Existing endpoint (keep for compatibility)
POST /api/payments/create-payment-intent

// New endpoint
POST /api/payments/create-checkout-session
{
  "orderType": "tickets",
  "orderDetails": {...},
  "customerInfo": {...},
  "successUrl": "https://example.com/success",
  "cancelUrl": "https://example.com/cancel"
}
```

#### Phase 3: Webhook Handler Updates

```javascript
// Add new event handlers
switch (event.type) {
  case "checkout.session.completed":
    // Update order status to 'paid'
    break;
  case "checkout.session.expired":
    // Update order status to 'expired'
    break;
  case "checkout.session.async_payment_succeeded":
    // Handle delayed payment methods
    break;
}
```

### Zero-Downtime Deployment Steps

1. **Deploy Database Migration**

   ```bash
   # Apply forward migration
   sqlite3 orders.db < migrations/20250206_add_checkout_session_support.sql
   ```

2. **Deploy Dual-Mode Application**
   - Both Payment Intent and Checkout Session endpoints active
   - Webhook handler processes both event types
   - Frontend can use either flow based on feature flag

3. **Gradual Migration**
   - Start with 10% of traffic to Checkout Sessions
   - Monitor error rates and conversion metrics
   - Increase traffic percentage gradually

4. **Data Consistency Checks**

   ```sql
   -- Monitor migration progress
   SELECT * FROM migration_stats;

   -- Find any inconsistencies
   SELECT * FROM orders
   WHERE stripe_payment_intent_id IS NULL
     AND stripe_checkout_session_id IS NULL;
   ```

### Rollback Plan

If issues arise:

```bash
# Apply rollback migration
sqlite3 orders.db < migrations/20250206_rollback_checkout_session.sql
```

### Performance Considerations

1. **New Indexes**
   - `idx_orders_checkout_session`: O(log n) lookups by session ID
   - `idx_orders_payment_method`: Efficient filtering by payment type
   - `idx_orders_payment_lookup`: Composite index for migration queries

2. **Query Optimization**
   ```sql
   -- Use unified view for cross-method queries
   SELECT * FROM orders_unified
   WHERE effective_status = 'paid'
     AND created_at > datetime('now', '-7 days');
   ```

### Monitoring During Migration

1. **Key Metrics**
   - Payment success rate by method
   - Average checkout completion time
   - Session expiration rate
   - Customer drop-off points

2. **Alerts**
   - Checkout session creation failures
   - Webhook processing delays
   - Database query performance degradation

### Benefits of Checkout Sessions

1. **Reduced PCI Compliance Scope**
   - No card details touch your servers
   - Stripe handles all sensitive data

2. **Better Conversion**
   - Mobile-optimized checkout
   - Saved payment methods
   - Multiple payment options (Apple Pay, Google Pay, etc.)

3. **Simplified Frontend**
   - Remove Stripe Elements integration
   - Redirect-based flow
   - Less JavaScript complexity

### Fields That Become Obsolete

With full Checkout Sessions adoption:

- Frontend Stripe Elements code
- Client-side payment confirmation logic
- Some webhook complexity for payment retries

However, these are removed at the application layer, not the database layer, maintaining backward compatibility.

## Testing Strategy

1. **Unit Tests**
   - Test both payment flows independently
   - Verify data migration logic
   - Test rollback scenarios

2. **Integration Tests**
   - End-to-end checkout flow
   - Webhook processing for all event types
   - Database state transitions

3. **Load Tests**
   - Concurrent session creation
   - Database query performance under load
   - Webhook processing throughput

## Conclusion

This migration strategy ensures:

- Zero downtime during transition
- Full backward compatibility
- Data integrity throughout
- Clear rollback path
- Performance optimization

The phased approach allows careful monitoring and gradual rollout, minimizing risk while modernizing the payment infrastructure.

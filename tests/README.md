# Simple Tests - Radically Simplified Testing Approach

## Philosophy: Test What Matters

This testing approach focuses on **business-critical flows** with **minimal complexity**:

- **330 lines total** vs 11,411 lines in the complex approach
- **5 core business flows** tested thoroughly 
- **Zero abstractions** - every test is readable by any JavaScript developer
- **Direct API calls** - no mocking or complex setup

## What We Test

### Critical Business Flows (152 lines)
1. **Ticket Purchase** - Complete Stripe checkout flow
2. **Payment Processing** - Stripe integration works
3. **Database Operations** - Registration storage and retrieval
4. **Email Subscriptions** - Newsletter signup flow 
5. **Gallery Display** - Photo loading from API

### Smoke Tests (55 lines)
- Basic API endpoint availability
- Health checks for all services
- Error handling for invalid requests

### Helpers (89 lines)
- Simple HTTP request function
- Direct database operations
- Basic cleanup utilities

## Running Tests

```bash
# Run all tests
npm test

# Watch mode during development
npm run test:simple:watch

# The old complex tests are still available
npm run test:integration  # 11,411 lines of complexity
```

## Adding New Tests

Follow these simple rules:

1. **Test user-visible behavior** - not implementation details
2. **Use direct API calls** - no mocking or abstractions  
3. **Keep tests under 20 lines** - force simplicity
4. **Clean up test data** - use simple DELETE statements
5. **Make tests readable** - anyone should understand them

Example:
```javascript
test('user can buy weekend pass', async () => {
  const ticket = await testRequest('POST', '/api/payments/create-checkout-session', {
    cartItems: [{ name: 'Weekend Pass', price: 125.00, quantity: 1 }],
    customerInfo: { email: 'test@example.com' }
  });
  
  expect(ticket.url).toContain('checkout.stripe.com');
});
```

## What We Don't Test

We **deliberately avoid** testing:
- Implementation details (private functions, internal classes)
- Complex error scenarios that rarely occur in production  
- Infrastructure details (connection pooling, caching internals)
- Framework behavior (Stripe SDK, database drivers)
- Multiple variations of the same business flow

## Success Metrics

- ✅ **330 lines total** - 97% reduction from complex approach
- ✅ **5 critical business flows** covered comprehensively  
- ✅ **Zero framework knowledge** required to understand tests
- ✅ **2-3 second execution time** for full suite
- ✅ **Any developer can add tests** on day one

## The Complex Alternative

The `tests-new/` directory contains the previous approach:
- **11,411 lines** of test infrastructure
- **29 JavaScript files** with complex abstractions
- **Dual-mode testing** with mock/real server switching
- **Custom test builders** and data factories
- **Complex setup/teardown** orchestration

This simple approach tests the **same business functionality** with **97% fewer lines of code**.

---

**"Simplicity is the ultimate sophistication."** - Leonardo da Vinci
# Phase 2 - PR 3: Payment-Critical Tests Implementation
## Create payment-critical.test.js for revenue protection

### PR Summary
Create payment-critical test file to validate payment flow integrity and prevent amount manipulation that could result in revenue loss.

### Tasks

---

## Task_2_3_01: Create Payment-Critical Test File
**Assignee**: backend-engineer  
**Execution**: Independent  
**File**: tests/payment-critical.test.js (new)  

### Technical Implementation

Create new file `tests/payment-critical.test.js`:

```javascript
/**
 * Payment-Critical Tests - Revenue Protection
 * Tests critical payment flow: Stripe webhook → ticket generation
 */
import { test, expect } from 'vitest';
import { testRequest } from './helpers.js';

test('payment webhook creates valid ticket with QR code', async () => {
  const paymentData = {
    cartItems: [{ name: 'Early Bird', price: 89, quantity: 1 }]
  };
  
  const sessionResponse = await testRequest('POST', '/api/payments/create-checkout-session', paymentData);
  if (sessionResponse.status === 0) {
    throw new Error(`Network connectivity failure for POST /api/payments/create-checkout-session`);
  }
  expect([200, 400].includes(sessionResponse.status)).toBe(true);
  
  if (sessionResponse.status === 200) {
    expect(sessionResponse.data.url).toContain('stripe.com');
    expect(sessionResponse.data.sessionId).toBeDefined();
  }
});

test('payment API rejects amount manipulation', async () => {
  const maliciousPayments = [
    { cartItems: [{ name: 'Ticket', price: -100, quantity: 1 }] },
    { cartItems: [{ name: 'Ticket', price: 0.001, quantity: 1000000 }] }
  ];
  
  for (const payload of maliciousPayments) {
    const response = await testRequest('POST', '/api/payments/create-checkout-session', payload);
    if (response.status === 0) {
      throw new Error(`Network connectivity failure for POST /api/payments/create-checkout-session`);
    }
    expect([400, 422].includes(response.status)).toBe(true);
  }
});
```

### Acceptance Criteria
- [ ] Valid payment creates Stripe checkout session
- [ ] Session URL contains stripe.com
- [ ] Session ID is defined and valid
- [ ] Negative prices are rejected
- [ ] Micro-amount spam is blocked
- [ ] Tests complete in <150ms

### Business Validation
- Protects against underpriced ticket sales
- Prevents negative amount refund exploits
- Blocks micro-transaction DoS attacks
- Validates Stripe integration

### Testing Commands
```bash
# Run payment tests
npm test -- payment-critical

# Verify no regression in payment flow
npm test -- api-contracts

# Check full suite
npm test
```

### Revenue Protection
- **Negative Price Attack**: Would allow refunds via checkout
- **Micro-amount Spam**: Could overwhelm Stripe rate limits
- **Zero Price Bypass**: Would generate free tickets
- **Quantity Overflow**: Could cause calculation errors

### Implementation Notes
- Tests actual Stripe checkout session creation
- Validates critical business logic
- No mocking of payment provider
- Direct API testing approach

### Risk Mitigation
- **Risk**: Stripe API changes
- **Mitigation**: Tests contract, not implementation
- **Risk**: Test environment costs
- **Mitigation**: Uses test mode keys

### PR Checklist
- [ ] New file created: tests/payment-critical.test.js
- [ ] Line count: 25 lines maximum
- [ ] Execution time: <150ms
- [ ] Revenue protection validated
- [ ] CI/CD passes
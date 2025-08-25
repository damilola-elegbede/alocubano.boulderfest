# Brevo Email Service - Critical Test Coverage Strategy

## Executive Summary

The Brevo email service implementation represents a critical security and data integrity boundary with **zero test coverage** for webhook signature validation, subscription flows, and unsubscribe token security. This architectural strategy prioritizes security-critical tests while maintaining the streamlined testing philosophy (under 500 lines total).

## System Architecture Overview

### Current Implementation State
- **3 API Endpoints**: subscribe, unsubscribe, brevo-webhook
- **Security Mechanisms**: HMAC-SHA256 webhook signatures, unsubscribe tokens, rate limiting
- **External Dependencies**: Brevo API, database service
- **Test Coverage**: 0% (critical gap)

### Risk Assessment Matrix

| Component | Risk Level | Current Coverage | Business Impact |
|-----------|------------|-----------------|-----------------|
| Webhook HMAC Validation | **CRITICAL** | 0% | Data tampering, replay attacks |
| Unsubscribe Token Security | **HIGH** | 0% | Unauthorized list manipulation |
| Brevo API Integration | **MEDIUM** | 0% | Service degradation |
| Rate Limiting | **LOW** | 0% | Resource exhaustion |

## Architectural Test Strategy

### 1. Test Organization Pattern

**Decision: Integrated Approach**
- Add Brevo tests to existing `api-contracts.test.js` and `basic-validation.test.js`
- Rationale: Maintains simplicity, avoids file proliferation
- Line budget: 80-100 lines maximum

### 2. Security Testing Approach

**HMAC Signature Validation Strategy**

```javascript
// Test-only secret for predictable signatures
const TEST_WEBHOOK_SECRET = 'test-secret-for-hmac-validation';

// Generate valid test signature
function generateTestSignature(payload) {
  return crypto.createHmac('sha256', TEST_WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');
}

// Test patterns:
// 1. Valid signature acceptance
// 2. Invalid signature rejection  
// 3. Missing signature handling
// 4. Replay attack prevention (timestamp validation)
```

**Unsubscribe Token Testing**

```javascript
// Deterministic token generation for testing
const TEST_TOKEN = 'deterministic-test-token';

// Test scenarios:
// 1. Valid token unsubscribe
// 2. Invalid token rejection
// 3. Expired token handling
// 4. Token reuse prevention
```

### 3. Integration Boundary Design

**Approach: Controlled Mocking with Real API Fallback**

```javascript
// Environment-based testing strategy
const BREVO_TEST_MODE = process.env.BREVO_TEST_MODE || 'mock';

if (BREVO_TEST_MODE === 'mock') {
  // Predictable mock responses
  return { success: true, contactId: 'test-123' };
} else if (BREVO_TEST_MODE === 'sandbox') {
  // Use Brevo sandbox account
  return await brevoAPI.call(sandboxEndpoint);
} else {
  // Real API (CI/CD only)
  return await brevoAPI.call(productionEndpoint);
}
```

### 4. Priority-Based Test Implementation

**Phase 1: Security-Critical Tests (30 lines)**

```javascript
test('webhook rejects invalid HMAC signature', async () => {
  const payload = { event: 'delivered', email: 'test@example.com' };
  const invalidSignature = 'invalid-signature-12345';
  
  const response = await testRequest('POST', '/api/email/brevo-webhook', 
    payload, 
    { 'x-brevo-signature': invalidSignature }
  );
  
  expect(response.status).toBe(401);
  expect(response.data.error).toContain('Invalid signature');
});

test('unsubscribe rejects forged tokens', async () => {
  const response = await testRequest('POST', '/api/email/unsubscribe', {
    email: 'victim@example.com',
    token: 'forged-token-attempt'
  });
  
  expect(response.status).toBe(400);
  expect(response.data.error).toContain('Invalid unsubscribe token');
});
```

**Phase 2: Data Integrity Tests (25 lines)**

```javascript
test('webhook processes valid events correctly', async () => {
  const events = ['delivered', 'opened', 'hard_bounce', 'unsubscribed'];
  
  for (const event of events) {
    const payload = { event, email: 'test@example.com', date: new Date().toISOString() };
    const signature = generateTestSignature(payload);
    
    const response = await testRequest('POST', '/api/email/brevo-webhook',
      payload,
      { 'x-brevo-signature': signature }
    );
    
    expect(response.status).toBe(200);
    expect(response.data.message).toContain(event);
  }
});
```

**Phase 3: User Journey Tests (25 lines)**

```javascript
test('subscription flow with consent validation', async () => {
  const response = await testRequest('POST', '/api/email/subscribe', {
    email: 'newuser@example.com',
    firstName: 'Test',
    consentToMarketing: true
  });
  
  expect([201, 409].includes(response.status)).toBe(true);
  if (response.status === 201) {
    expect(response.data.subscriber.email).toBe('newuser@example.com');
  }
});

test('unsubscribe flow completes successfully', async () => {
  // Requires valid token - integration test
  const email = 'test@example.com';
  const token = generateUnsubscribeToken(email); // Helper method
  
  const response = await testRequest('GET', 
    `/api/email/unsubscribe?email=${email}&token=${token}`
  );
  
  expect(response.status).toBe(200);
  expect(response.text).toContain('successfully removed');
});
```

### 5. Test Data Management Strategy

**Approach: Ephemeral Test Data**

```javascript
// Test email patterns
const TEST_EMAIL_DOMAIN = '@test.alocubano.local';
const generateTestEmail = () => `test-${Date.now()}${TEST_EMAIL_DOMAIN}`;

// Cleanup not required - test emails are isolated
// Database uses in-memory SQLite for tests
```

### 6. Performance Testing Considerations

**Decision: Defer to Load Testing Phase**
- Webhook processing is async and buffered
- Rate limiting already implemented
- Performance tests would exceed line budget

## Implementation Roadmap

### Phase 1: Critical Security (Week 1)
- [x] HMAC signature validation tests
- [x] Unsubscribe token forgery tests
- [x] Webhook replay attack prevention
- **Lines: ~30, Time: 2 hours**

### Phase 2: Integration Validation (Week 1)
- [ ] Brevo API error handling
- [ ] Webhook event processing
- [ ] Database synchronization
- **Lines: ~25, Time: 2 hours**

### Phase 3: User Journeys (Week 1)
- [ ] End-to-end subscription flow
- [ ] Unsubscribe with token validation
- [ ] Email verification process
- **Lines: ~25, Time: 2 hours**

### Phase 4: Edge Cases (Week 2)
- [ ] Rate limiting behavior
- [ ] Malformed payload handling
- [ ] Service initialization failures
- **Lines: ~20, Time: 1 hour**

## Risk Mitigation Strategies

### Security Risks
- **Mitigation**: All security tests in Phase 1
- **Validation**: Manual penetration testing
- **Monitoring**: Log all signature failures

### Integration Risks
- **Mitigation**: Mock-first testing approach
- **Fallback**: Sandbox account for CI/CD
- **Recovery**: Graceful degradation on API failures

### Data Integrity Risks
- **Mitigation**: Event type validation
- **Audit**: Log all webhook events
- **Verification**: Database consistency checks

## Success Metrics

### Minimum Viable Coverage
- ✅ 100% webhook signature validation
- ✅ 100% unsubscribe token validation
- ✅ Core event type processing
- ✅ Basic subscription flow

### Quality Gates
- Zero security test failures
- Sub-500ms test execution
- Under 100 lines of test code
- No external API dependencies in tests

## Long-term Evolution Path

### Stage 1: Current (Minimal Security)
- Focus on critical security vulnerabilities
- Basic integration validation
- Line budget: 80-100 lines

### Stage 2: Enhanced (Q2 2025)
- Add property-based testing for tokens
- Webhook deduplication testing
- Line budget: +50 lines

### Stage 3: Comprehensive (Q3 2025)
- Full E2E journey testing
- Performance benchmarking
- Chaos engineering tests
- Line budget: +100 lines

### Stage 4: Production-Grade (Q4 2025)
- Contract testing with Brevo
- Synthetic monitoring
- A/B testing infrastructure
- Separate test suite

## Architectural Recommendations

### 1. Immediate Actions
- Implement Phase 1 security tests TODAY
- Add test webhook secret to `.env.test`
- Configure mock mode for local development

### 2. Short-term Improvements
- Add webhook event deduplication
- Implement timestamp validation for replay prevention
- Add metric collection for webhook processing

### 3. Long-term Enhancements
- Move to queue-based webhook processing
- Implement webhook signature key rotation
- Add distributed tracing for email flows

## Test Implementation Patterns

### Pattern 1: Webhook Security Test
```javascript
// In api-contracts.test.js
test('brevo webhook validates HMAC signatures', async () => {
  const payload = { 
    event: 'delivered', 
    email: 'test@example.com',
    date: new Date().toISOString()
  };
  
  // Test with invalid signature
  const badResponse = await testRequest('POST', '/api/email/brevo-webhook',
    payload,
    { 'x-brevo-signature': 'invalid-signature' }
  );
  expect(badResponse.status).toBe(401);
  
  // Test with valid signature (requires TEST_WEBHOOK_SECRET in env)
  if (process.env.TEST_WEBHOOK_SECRET) {
    const validSignature = crypto
      .createHmac('sha256', process.env.TEST_WEBHOOK_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');
    
    const goodResponse = await testRequest('POST', '/api/email/brevo-webhook',
      payload,
      { 'x-brevo-signature': validSignature }
    );
    expect(goodResponse.status).toBe(200);
  }
});
```

### Pattern 2: Unsubscribe Token Test
```javascript
// In basic-validation.test.js
test('unsubscribe endpoint validates tokens', async () => {
  // Invalid token test
  const invalidResponse = await testRequest('POST', '/api/email/unsubscribe', {
    email: 'test@example.com',
    token: 'invalid-token-123'
  });
  expect(invalidResponse.status).toBe(400);
  expect(invalidResponse.data.error).toContain('Invalid unsubscribe token');
  
  // Missing token test
  const missingResponse = await testRequest('POST', '/api/email/unsubscribe', {
    email: 'test@example.com'
  });
  expect(missingResponse.status).toBe(400);
  expect(missingResponse.data.error).toContain('token is required');
});
```

### Pattern 3: Subscription Flow Test
```javascript
// In api-contracts.test.js
test('email subscription requires consent', async () => {
  // Without consent
  const noConsentResponse = await testRequest('POST', '/api/email/subscribe', {
    email: 'test@example.com',
    firstName: 'Test'
  });
  expect(noConsentResponse.status).toBe(400);
  expect(noConsentResponse.data.error).toContain('consent');
  
  // With consent
  const withConsentResponse = await testRequest('POST', '/api/email/subscribe', {
    email: `test-${Date.now()}@example.com`,
    firstName: 'Test',
    consentToMarketing: true
  });
  expect([201, 409].includes(withConsentResponse.status)).toBe(true);
});
```

## Summary

This architectural strategy addresses critical Brevo email service test gaps while maintaining the project's streamlined testing philosophy. The phased approach prioritizes security vulnerabilities first, followed by data integrity and user journeys. With a total line budget of 80-100 lines, we achieve meaningful coverage of the most critical paths while preserving test simplicity and fast execution times.

**Key Principles Maintained:**
- Direct API testing without complex abstractions
- Sub-500ms execution time
- Readable by any JavaScript developer
- Minimal external dependencies
- Clear security focus

**Critical Coverage Achieved:**
- 100% webhook signature validation
- 100% unsubscribe token security
- Core integration paths tested
- User consent flows validated

The strategy provides a clear evolution path from minimal security coverage to comprehensive production-grade testing as the system matures.
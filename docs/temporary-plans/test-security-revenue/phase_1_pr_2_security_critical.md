# Phase 1 - PR 2: Security-Critical Tests Implementation
## Create security-critical.test.js for JWT and XSS protection

### PR Summary
Create new security-critical test file to validate JWT manipulation prevention and XSS payload sanitization, protecting admin endpoints and user data.

### Tasks

---

## Task_1_2_01: Create Security-Critical Test File
**Assignee**: security-auditor  
**Execution**: Independent  
**File**: tests/security-critical.test.js (new)  

### Technical Implementation

Create new file `tests/security-critical.test.js`:

```javascript
/**
 * Security-Critical Tests - Auth and Data Protection
 * Tests JWT manipulation and admin authentication security
 */
import { test, expect } from 'vitest';
import { testRequest } from './helpers.js';

test('admin auth rejects JWT manipulation attempts', async () => {
  const maliciousTokens = [
    'eyJ0eXAiOiJKV1QiLCJhbGciOiJub25lIn0.eyJpZCI6ImFkbWluIn0.',
    '../../../admin-bypass',
    'Bearer null',
    'admin-token-injection'
  ];
  
  for (const token of maliciousTokens) {
    const response = await testRequest('GET', '/api/admin/dashboard', null, {
      'Authorization': `Bearer ${token}`
    });
    if (response.status === 0) {
      throw new Error(`Network connectivity failure for GET /api/admin/dashboard`);
    }
    expect([401, 403].includes(response.status)).toBe(true);
  }
});

test('APIs reject XSS payloads in user inputs', async () => {
  const xssPayloads = ['<script>alert("xss")</script>', 'javascript:alert(1)'];
  
  for (const payload of xssPayloads) {
    const response = await testRequest('POST', '/api/email/subscribe', {
      email: payload + '@example.com',
      name: payload
    });
    
    if (response.status === 0) {
      throw new Error(`Network connectivity failure for POST /api/email/subscribe`);
    }
    
    if (response.status === 200 && response.data) {
      const responseStr = JSON.stringify(response.data);
      expect(responseStr.includes('<script>')).toBe(false);
    }
  }
});
```

### Acceptance Criteria
- [ ] JWT "none" algorithm attack blocked
- [ ] Path traversal in tokens rejected
- [ ] Null token injection prevented
- [ ] XSS scripts never rendered in responses
- [ ] Both tests complete in <100ms total

### Security Validation
- Verify JWT signature validation is enforced
- Confirm XSS payloads are escaped/sanitized
- Ensure authorization headers are validated
- Check admin endpoints require valid JWT

### Testing Commands
```bash
# Run the new security tests
npm test -- security-critical

# Verify complete suite still passes
npm test

# Check execution time
time npm test
```

### Implementation Notes
- Tests the "none" algorithm vulnerability (CVE-2015-9235)
- Validates path traversal protection
- Ensures XSS payloads are sanitized
- Uses existing testRequest helper

### Risk Mitigation
- **Risk**: False sense of security
- **Mitigation**: Tests actual attack vectors, not theoretical
- **Risk**: Test maintenance burden
- **Mitigation**: Direct API testing, minimal mocking

### PR Checklist
- [ ] New file created: tests/security-critical.test.js
- [ ] Line count: 25 lines maximum
- [ ] Execution time: <100ms
- [ ] Zero abstractions maintained
- [ ] CI/CD passes
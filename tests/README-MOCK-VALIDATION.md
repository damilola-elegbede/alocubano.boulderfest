# Mock Validation Test Suite

## Overview

The mock validation test suite (`tests/mock-validation.test.js`) provides comprehensive validation of mock server endpoints to ensure accuracy, proper response structures, error handling, and performance. This ensures that the mock server accurately represents the real API for CI/CD testing.

## Features

### Test Categories

1. **API Contract Validation**
   - Validates all mock server endpoints return expected response structures
   - Tests health check, database health, gallery, payments, email, tickets, admin, and registration APIs
   - Ensures response schemas match real API specifications

2. **Error Scenario Validation**
   - Tests proper 404 responses for invalid endpoints
   - Validates 400 errors for malformed request bodies
   - Tests rate limiting behavior
   - Verifies server error handling

3. **Edge Case Validation**
   - Empty request body handling
   - Large payload rejection
   - Special character handling
   - Concurrent request processing

4. **Performance Validation**
   - Response time validation (under 100ms for health checks)
   - Load testing with multiple rapid requests
   - Performance consistency under concurrent load

5. **Mock-Specific Behavior Validation**
   - Mock environment detection
   - Data consistency across requests
   - Reproducible error scenarios
   - HTTP method handling

## Usage

### Running Tests

```bash
# Run with mock server (recommended)
npm run test:ci -- tests/mock-validation.test.js

# Run standalone (will skip tests if no mock server detected)
npm test -- tests/mock-validation.test.js
```

### Test Results

When running with a mock server:
- ✅ **All 25 tests pass** when mock server is properly configured
- ⚠️ **Tests are skipped** when no mock server is detected (graceful degradation)
- 🔧 **Automatic detection** of mock server environment via health check

### Key Validations

#### API Response Structure
```javascript
// Health Check
expect(response.data).toHaveProperty('status', 'ok');
expect(response.data).toHaveProperty('environment', 'ci-mock');
expect(response.data).toHaveProperty('services');

// Gallery API
expect(response.data).toHaveProperty('items');
expect(response.data).toHaveProperty('total');
expect(response.data).toHaveProperty('hasMore');

// Payment API
expect(response.data.checkoutUrl).toContain('checkout.stripe.com');
expect(response.data.sessionId).toMatch(/^cs_test_mock_/);
```

#### Performance Benchmarks
- Health checks: < 100ms
- Gallery API: < 200ms
- Payment API: < 500ms
- Concurrent requests maintain performance

#### Error Handling
- 400 errors for malformed requests
- 404 errors for non-existent endpoints
- 401 errors for unauthorized access
- Proper error message structure

## Integration

### Mock Server Detection

The test suite automatically detects if it's running against a mock server:

```javascript
// Checks /api/health/check for environment: 'ci-mock'
const mockServerDetected = data.environment === 'ci-mock';
```

### Graceful Degradation

When no mock server is detected, tests are skipped with informative messages:

```
⚠️ Skipping mock validation tests - not running against mock server
```

### CI/CD Integration

- Runs as part of the CI test suite
- Validates mock server accuracy before other tests
- Ensures mock server matches real API behavior
- Provides confidence in CI test results

## Benefits

1. **Mock Accuracy**: Ensures mock server responses match real API
2. **Test Confidence**: Validates that CI tests run against accurate mocks
3. **Performance Assurance**: Confirms mock server meets performance requirements
4. **Error Coverage**: Tests all error scenarios and edge cases
5. **Continuous Validation**: Runs automatically in CI to catch mock drift

## Maintenance

- Update tests when API contracts change
- Adjust performance thresholds as needed
- Add new test cases for new endpoints
- Review and update mock server validation logic

The mock validation suite ensures that the mock server provides accurate, performant, and comprehensive API simulation for reliable CI/CD testing.
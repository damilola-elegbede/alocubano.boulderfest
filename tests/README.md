# Payment System Test Suite - A Lo Cubano Boulder Fest

This comprehensive test suite ensures the reliability, security, and performance of the A Lo Cubano Boulder Fest payment system. The test suite includes unit tests, integration tests, end-to-end tests, performance tests, and security tests with 80%+ code coverage and production-ready quality gates.

## Test Structure

```
tests/
├── unit/                     # Unit tests for payment logic
│   ├── payment-calculator.test.js
│   ├── payment-validator.test.js
│   └── inventory-manager.test.js
├── integration/              # API integration tests
│   ├── payment-api.test.js
│   └── webhook-integration.test.js
├── e2e/                      # End-to-end tests
│   ├── payment-checkout.e2e.js
│   └── mobile-checkout.e2e.js
├── security/                 # Security tests
│   ├── payment-security.test.js
│   └── pci-compliance.test.js
├── performance/              # Load and performance tests
│   ├── payment-load.test.js
│   └── checkout-performance.test.js
├── accessibility/            # Accessibility tests
│   ├── payment-a11y.test.js
│   └── wcag-compliance.test.js
├── config/                   # Test configurations
│   ├── jest.unit.config.cjs
│   ├── playwright.config.js
│   └── k6-load-test.js
└── mocks/                    # Mock implementations
    ├── stripe-mock.js
    └── email-mock.js
```

## Running Tests

### Unit Tests
```bash
# Run all unit tests
npm run test:unit

# Run specific test file
npm run test:unit -- payment-calculator.test.js

# Run with coverage
npm run test:unit -- --coverage

# Run in watch mode
npm run test:unit -- --watch
```

### Integration Tests
```bash
# Run all integration tests
npm run test:integration

# Run with specific environment
NODE_ENV=staging npm run test:integration
```

### End-to-End Tests
```bash
# Run E2E tests (headless)
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui

# Run specific browser
npm run test:e2e -- --project=chromium

# Run mobile tests only
npm run test:e2e -- --grep mobile
```

### Security Tests
```bash
# Run security tests
npm run test:security

# Run OWASP tests only
npm run test:security -- --grep OWASP

# Run PCI compliance tests
npm run test:security -- --grep PCI
```

### Performance Tests
```bash
# Run load tests with k6
k6 run tests/config/k6-load-test.js

# Run with specific VUs (virtual users)
k6 run -u 100 -d 30s tests/config/k6-load-test.js

# Run performance benchmarks
npm run test:performance
```

### Accessibility Tests
```bash
# Run accessibility tests
npm run test:a11y

# Generate accessibility report
npm run test:a11y -- --reporter=html
```

## Test Data

### Test Credit Cards
```javascript
// Success cards
'4242424242424242' // Visa
'5555555555554444' // Mastercard
'378282246310005'  // Amex

// Failure cards
'4000000000000002' // Declined
'4000000000009995' // Insufficient funds
'4000000000000069' // Expired

// 3D Secure
'4000002500003155' // 3DS required
'4000002760003184' // 3DS optional
```

### Test Promo Codes
- `DANCE2026` - 15% off
- `EARLYBIRD` - 20% off
- `GROUP10` - 10% group discount
- `TEST50` - $50 off (test only)

### Test Users
```javascript
{
  US: { email: 'test.us@example.com', country: 'US', state: 'CO' },
  CA: { email: 'test.ca@example.com', country: 'CA', province: 'ON' },
  MX: { email: 'test.mx@example.com', country: 'MX', state: 'CDMX' }
}
```

## CI/CD Integration

### GitHub Actions Workflow
```yaml
name: Payment Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npm run test:security
      - run: npm run test:e2e
```

### Pre-commit Hooks
```bash
# .husky/pre-commit
npm run test:unit -- --testPathPattern=payment --passWithNoTests
npm run lint
```

### Pre-push Hooks
```bash
# .husky/pre-push
npm run test:all
npm run test:security
```

## Test Reports

### Coverage Reports
- HTML: `coverage/lcov-report/index.html`
- JSON: `coverage/coverage-final.json`
- Console: Run with `--coverage`

### E2E Reports
- HTML: `test-results/e2e-report.html`
- Videos: `test-results/videos/`
- Screenshots: `test-results/screenshots/`

### Performance Reports
- k6 HTML: `k6-report.html`
- JSON metrics: `k6-metrics.json`

## Debugging Tests

### Unit/Integration Tests
```bash
# Run with Node debugger
node --inspect-brk node_modules/.bin/jest payment-calculator.test.js

# VS Code debugging
# Use "Jest: Debug" launch configuration
```

### E2E Tests
```bash
# Run with Playwright Inspector
PWDEBUG=1 npm run test:e2e

# Run with slow motion
npm run test:e2e -- --slow-mo=1000

# Save trace for debugging
npm run test:e2e -- --trace=on
```

### Performance Tests
```bash
# Run k6 with debug output
k6 run --http-debug tests/config/k6-load-test.js

# Output detailed metrics
k6 run --out json=metrics.json tests/config/k6-load-test.js
```

## Best Practices

### Writing Tests
1. **Descriptive Names**: Use clear, descriptive test names
2. **Arrange-Act-Assert**: Follow AAA pattern
3. **Independent Tests**: Each test should run independently
4. **Mock External Services**: Use mocks for Stripe, email, etc.
5. **Test Data Builders**: Use factories for complex test data

### Test Maintenance
1. **Regular Updates**: Update tests with feature changes
2. **Flaky Test Detection**: Monitor and fix flaky tests
3. **Performance Monitoring**: Track test suite execution time
4. **Coverage Goals**: Maintain minimum 80% coverage

### Security Testing
1. **Regular Scans**: Run security tests weekly
2. **Dependency Updates**: Check for vulnerabilities
3. **Penetration Testing**: Annual third-party testing
4. **Compliance Audits**: Quarterly PCI compliance checks

## Troubleshooting

### Common Issues

#### Tests Failing Locally
```bash
# Clear Jest cache
npm run test:unit -- --clearCache

# Reset test database
npm run db:test:reset

# Check environment variables
npm run test:env:check
```

#### E2E Tests Timing Out
```bash
# Increase timeout
npm run test:e2e -- --timeout=60000

# Check if dev server is running
npm run dev:check
```

#### Performance Tests OOM
```bash
# Increase Node memory
NODE_OPTIONS="--max-old-space-size=4096" k6 run tests/config/k6-load-test.js
```

## Contributing

### Adding New Tests
1. Create test file in appropriate directory
2. Follow existing naming conventions
3. Include test in CI pipeline
4. Update this README if needed

### Test Review Checklist
- [ ] Tests pass locally
- [ ] No hardcoded values
- [ ] Proper cleanup/teardown
- [ ] Follows coding standards
- [ ] Adequate test coverage
- [ ] No flaky tests

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [k6 Documentation](https://k6.io/docs/)
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [PCI DSS Requirements](https://www.pcisecuritystandards.org/)
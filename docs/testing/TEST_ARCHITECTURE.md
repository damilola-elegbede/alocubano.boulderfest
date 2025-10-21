# Test Architecture

Comprehensive testing architecture documentation for the A Lo Cubano Boulder Fest project.

## Table of Contents

- [Overview](#overview)
- [Test Types and Structure](#test-types-and-structure)
- [Test Organization](#test-organization)
- [Testing Strategies](#testing-strategies)
- [Key Testing Patterns](#key-testing-patterns)
- [Running Tests](#running-tests)
- [Performance Targets](#performance-targets)

## Overview

The A Lo Cubano Boulder Fest project employs a comprehensive three-layer test pyramid strategy:

```text
         /\
        /E2E\         21 E2E tests (User Flows)
       /------\
      /  Intg  \      ~30-50 Integration tests (API/Services)
     /----------\
    /    Unit    \    1126+ Unit tests (Components/Functions)
   /--------------\
```

**Total Test Coverage**: 1,200+ tests across all layers
**Test Strategy**: Fast feedback loop with unit tests, comprehensive integration coverage, and critical E2E validation

### Testing Philosophy

1. **Speed First**: Unit tests complete in <2 seconds for rapid feedback
2. **Isolation**: Each test layer uses appropriate isolation strategies
3. **Real-World Validation**: E2E tests use Vercel Preview Deployments for production-like environments
4. **No Mocking Overhead**: Direct API testing with minimal abstractions

## Test Types and Structure

### Unit Tests (`tests/unit/`)

**Purpose**: Fast, isolated testing of individual components and functions

**Characteristics**:

- In-memory SQLite database (`:memory:`)
- No external service dependencies
- Maximum speed optimization (<2 second execution target)
- 1126+ tests covering critical functionality

**Key Areas**:

```text
tests/unit/
├── api/                    # API endpoint logic
│   ├── csrf-service.test.js
│   ├── manual-ticket-entry-validation.test.js
│   ├── fraud-detection.test.js
│   └── qr-security.test.js
├── email/                  # Email service logic
│   ├── brevo-service.test.js
│   ├── batch-registration-email.test.js
│   └── donation-emails.test.js
├── registration/           # Registration system
│   ├── registration-api.test.js
│   └── registration-flow.test.js
├── donations/              # Donation system
│   ├── donations-service.test.js
│   └── donations-admin.test.js
├── cron/                   # Scheduled tasks
│   ├── cleanup-expired-reservations.test.js
│   └── process-reminders.test.js
├── resilience/             # Error handling patterns
│   ├── exponential-backoff.test.js
│   ├── circuit-breaker.test.js
│   └── service-wrappers.test.js
└── admin/                  # Admin functionality
    ├── cash-shift-management.test.js
    └── database-integrity.test.js
```

**Configuration**: `tests/config/vitest.unit.config.js`

**Execution**:

```bash
npm test                    # Fast unit test execution (<2s target)
npm run test:coverage       # With coverage reports
```

### Integration Tests (`tests/integration/`)

**Purpose**: Validate API endpoints and service integration with real database connections

**Characteristics**:

- In-memory SQLite databases (perfect isolation)
- Parallel test execution enabled (no lock contention)
- Limited external service integration (mocked when necessary)
- ~30-50 tests with comprehensive API testing

**Key Areas**:

```text
tests/integration/
├── api/                    # API endpoint integration
│   ├── csrf-protection.test.js
│   ├── registration-batch.test.js
│   └── donations-api.test.js
├── services/               # Service integration
│   ├── email-service-integration.test.js
│   ├── payment-service-integration.test.js
│   └── database-service-integration.test.js
└── database/               # Database operations
    ├── migration-testing.test.js
    └── transaction-handling.test.js
```

**Configuration**: `tests/config/vitest.integration.config.js`

**Execution**:

```bash
npm run test:integration   # Integration test suite
```

### E2E Tests (`tests/e2e/flows/`)

**Purpose**: End-to-end user workflow validation with production-like environments

**Characteristics**:

- Uses Vercel Preview Deployments (production database)
- Real browser testing with Playwright
- Multi-browser coverage (Chrome, Firefox, Safari, Mobile)
- 21 comprehensive tests (2-5 minute execution with parallel workers)

**Key Areas**:

```text
tests/e2e/flows/
├── accessibility-compliance.test.js        # WCAG compliance
├── admin-auth.test.js                      # Admin authentication
├── admin-dashboard.test.js                 # Admin panel
├── basic-navigation.test.js                # Page navigation
├── brevo-cleanup-integration.test.js       # Email service
├── cart-functionality.test.js              # Shopping cart
├── dark-mode-admin.test.js                 # Theme system
├── database-integrity.test.js              # Database operations
├── email-transactional.test.js             # Transactional emails
├── gallery-basic.test.js                   # Gallery browsing
├── gallery-browsing.test.js                # Gallery performance
├── mobile-registration-experience.test.js  # Mobile registration
├── network-resilience.test.js              # Network failures
├── payment-flow.test.js                    # Payment processing
├── performance-load.test.js                # Performance testing
├── registration-flow.test.js               # Registration process
├── stripe-webhook-security.test.js         # Webhook security
├── ticket-validation.test.js               # QR code validation
├── user-engagement.test.js                 # User tracking
├── wallet-pass-apple.test.js               # Apple Wallet
└── wallet-pass-google.test.js              # Google Wallet
```

**Configuration**: `tests/config/playwright-e2e-optimized.config.js`

**Execution**:

```bash
npm run test:e2e           # E2E test suite (Vercel Preview)
npm run test:e2e:ci        # CI-optimized execution
```

## Test Organization

### Directory Structure

```text
/
├── tests/
│   ├── unit/              # Unit tests (1126+ tests)
│   ├── integration/       # Integration tests (~30-50 tests)
│   ├── e2e/               # E2E tests (21 tests)
│   │   ├── flows/         # Test flow implementations
│   │   ├── global-setup.js
│   │   ├── global-teardown.js
│   │   ├── global-setup-preview.js
│   │   └── global-teardown-preview.js
│   ├── config/            # Test configurations
│   │   ├── vitest.unit.config.js
│   │   └── vitest.integration.config.js
│   ├── setup-unit.js      # Unit test setup
│   ├── setup-integration.js
│   └── vitest.config.js   # Main Vitest config (delegates to unit)
└── docs/testing/          # Testing documentation
    ├── TEST_ARCHITECTURE.md
    ├── PHASE_COMPLETION_REPORT.md
    └── TEST_MAINTENANCE_GUIDE.md
```

### Naming Conventions

**Test Files**:

- Pattern: `[feature-name].test.js`
- Example: `csrf-protection.test.js`, `registration-flow.test.js`

**Test Suites**:

```javascript
test.describe('Feature Name', () => {
  test('should perform specific action', () => {
    // Test implementation
  });
});
```

**Helper Files**:

- Located in `tests/helpers/` (excluded from test runs)
- Pattern: `[purpose]-helper.js`
- Examples: `handler-test-helper.js`, `test-isolation.js`

## Testing Strategies

### Database Strategies

#### Unit Tests: In-Memory SQLite

```javascript
// Environment variable in vitest.unit.config.js
env: {
  DATABASE_URL: 'file::memory:?cache=shared'
}
```

**Benefits**:

- Extremely fast (no disk I/O)
- Perfect isolation between tests
- No cleanup required
- Supports parallel execution

#### Integration Tests: In-Memory SQLite with Isolation

```javascript
// Each test gets its own database instance
import { getDatabaseClient } from '../../lib/database.js';

test('should perform database operation', async () => {
  const db = await getDatabaseClient();
  // Test with isolated database
});
```

**Benefits**:

- Parallel test execution enabled
- No database lock contention
- Real database operations without file system overhead

#### E2E Tests: Vercel Preview Deployments

**Approach**: Use production Turso database via Vercel Preview Deployments

**Benefits**:

- Production-like environment
- Real database performance characteristics
- Validates actual deployment configuration

**Environment**:

```bash
TURSO_DATABASE_URL=libsql://[preview-db].turso.io
TURSO_AUTH_TOKEN=[auth-token]
```

### Authentication Testing

#### CSRF Token Testing

```javascript
// Unit test example
import { generateCsrfToken, validateCsrfToken } from '../../lib/csrf-service.js';

test('should generate and validate CSRF token', () => {
  const token = generateCsrfToken();
  const isValid = validateCsrfToken(token);
  expect(isValid).toBe(true);
});
```

#### Admin JWT Testing

```javascript
// Integration test example
import { testRequest } from '../handler-test-helper.js';

test('should authenticate admin with JWT', async () => {
  const loginResponse = await testRequest('POST', '/api/admin/login', {
    body: { password: 'test-password' }
  });

  const token = loginResponse.body.token;

  const dashboardResponse = await testRequest('GET', '/api/admin/dashboard', {
    headers: { Authorization: `Bearer ${token}` }
  });

  expect(dashboardResponse.status).toBe(200);
});
```

### Time Zone Testing (Mountain Time)

All user-facing times MUST be displayed in Mountain Time (America/Denver).

```javascript
import timeUtils from '../../lib/time-utils.js';

test('should format date in Mountain Time', () => {
  const utcDate = new Date('2026-05-15T10:00:00Z');
  const formatted = timeUtils.formatDateTime(utcDate);

  // Expected format: "May 15, 2026, 3:00 AM MDT"
  expect(formatted).toContain('MDT'); // or MST depending on DST
});
```

### Security Testing

#### XSS Prevention

```javascript
test('should sanitize user input to prevent XSS', () => {
  const maliciousInput = '<script>alert("XSS")</script>';
  const sanitized = sanitizeInput(maliciousInput);

  expect(sanitized).not.toContain('<script>');
});
```

#### SQL Injection Prevention

```javascript
test('should prevent SQL injection in database queries', async () => {
  const maliciousInput = "1' OR '1'='1";

  const result = await db.execute({
    sql: 'SELECT * FROM tickets WHERE id = ?',
    args: [maliciousInput]
  });

  expect(result.rows.length).toBe(0);
});
```

#### CSRF Protection

```javascript
test('should reject requests without valid CSRF token', async () => {
  const response = await testRequest('POST', '/api/tickets/register', {
    body: { ticketId: '123' }
    // No CSRF token
  });

  expect(response.status).toBe(403);
  expect(response.body.error).toContain('CSRF');
});
```

### Resilience Testing

#### Exponential Backoff

```javascript
import { ExponentialBackoff } from '../../lib/resilience/exponential-backoff.js';

test('should retry with exponential backoff', async () => {
  const backoff = new ExponentialBackoff({
    maxRetries: 3,
    initialDelay: 100
  });

  let attempts = 0;
  const result = await backoff.execute(async () => {
    attempts++;
    if (attempts < 3) throw new Error('Temporary failure');
    return 'success';
  });

  expect(attempts).toBe(3);
  expect(result).toBe('success');
});
```

#### Circuit Breaker

```javascript
import { CircuitBreaker } from '../../lib/resilience/circuit-breaker.js';

test('should open circuit after threshold failures', async () => {
  const breaker = new CircuitBreaker({
    failureThreshold: 3,
    resetTimeout: 1000
  });

  // Cause 3 failures
  for (let i = 0; i < 3; i++) {
    await breaker.execute(async () => {
      throw new Error('Service unavailable');
    }).catch(() => {});
  }

  expect(breaker.state).toBe('OPEN');
});
```

## Key Testing Patterns

### Test Isolation Pattern

Every test must be independent and leave no side effects.

```javascript
import { beforeEach, afterEach, test } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';

let db;

beforeEach(async () => {
  // Fresh database for each test
  db = await getDatabaseClient();

  // Run migrations
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

afterEach(async () => {
  // Cleanup (automatic with in-memory databases)
  if (db) {
    await db.close();
  }
});

test('should create ticket', async () => {
  await db.execute({
    sql: 'INSERT INTO tickets (id, email) VALUES (?, ?)',
    args: ['ticket-1', 'test@example.com']
  });

  const result = await db.execute('SELECT * FROM tickets WHERE id = ?', ['ticket-1']);
  expect(result.rows.length).toBe(1);
});
```

### Mocking External Services

#### Brevo Email Service

```javascript
import { vi, test, expect } from 'vitest';

vi.mock('../../lib/brevo-service.js', () => ({
  sendEmail: vi.fn().mockResolvedValue({ messageId: 'mock-123' }),
  addToList: vi.fn().mockResolvedValue({ id: 'contact-456' })
}));

test('should send email via Brevo', async () => {
  const brevoService = await import('../../lib/brevo-service.js');

  const result = await brevoService.sendEmail({
    to: 'test@example.com',
    subject: 'Test Email',
    html: '<p>Test</p>'
  });

  expect(result.messageId).toBe('mock-123');
  expect(brevoService.sendEmail).toHaveBeenCalledTimes(1);
});
```

#### Stripe Payment Service

```javascript
vi.mock('stripe', () => ({
  default: vi.fn(() => ({
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          id: 'cs_mock_123',
          url: 'https://checkout.stripe.com/mock'
        })
      }
    }
  }))
}));

test('should create Stripe checkout session', async () => {
  const stripe = new (await import('stripe')).default('sk_test_mock');

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: 'price_123', quantity: 1 }],
    success_url: 'https://example.com/success'
  });

  expect(session.id).toBe('cs_mock_123');
  expect(session.url).toContain('checkout.stripe.com');
});
```

### Database Migration Testing

```javascript
import { runMigrations, getMigrationStatus } from '../../lib/migrations.js';

test('should run migrations in order', async () => {
  const db = await getDatabaseClient();

  await runMigrations(db);

  const status = await getMigrationStatus(db);
  expect(status.applied).toContain('001_initial_schema.sql');
  expect(status.applied).toContain('042_add_cash_shifts.sql');
});

test('should handle migration rollback', async () => {
  const db = await getDatabaseClient();

  await runMigrations(db);

  // Verify rollback detection
  const canRollback = await db.execute(
    'SELECT COUNT(*) as count FROM migrations WHERE version = ?',
    ['042']
  );

  expect(canRollback.rows[0].count).toBeGreaterThan(0);
});
```

### Concurrent Request Testing

```javascript
test('should handle concurrent ticket purchases', async () => {
  const promises = [];

  for (let i = 0; i < 10; i++) {
    promises.push(
      testRequest('POST', '/api/tickets/purchase', {
        body: { ticketType: 'full-pass', quantity: 1 }
      })
    );
  }

  const results = await Promise.all(promises);

  const successful = results.filter(r => r.status === 200);
  const failed = results.filter(r => r.status !== 200);

  expect(successful.length).toBeGreaterThan(0);
  expect(successful.length + failed.length).toBe(10);
});
```

### Error Scenario Testing

```javascript
test('should handle database connection failure gracefully', async () => {
  // Simulate database unavailability
  vi.mock('../../lib/database.js', () => ({
    getDatabaseClient: vi.fn().mockRejectedValue(
      new Error('Database connection failed')
    )
  }));

  const response = await testRequest('GET', '/api/tickets/list');

  expect(response.status).toBe(503);
  expect(response.body.error).toContain('temporarily unavailable');
});
```

## Running Tests

### Quick Reference

```bash
# Unit tests (fast - <2 seconds)
npm test

# Integration tests
npm run test:integration

# E2E tests (2-5 minutes with Vercel Preview)
npm run test:e2e

# All tests with coverage
npm run test:all

# Coverage reports
npm run test:coverage
```

### Detailed Execution

#### Unit Tests Only

```bash
# Run all unit tests
npm test

# Run specific test file
npx vitest run tests/unit/csrf-service.test.js

# Run tests matching pattern
npx vitest run tests/unit/email/

# Watch mode for development
npx vitest watch tests/unit/
```

#### Integration Tests

```bash
# Run all integration tests
npm run test:integration

# Run specific integration test
npx vitest run tests/integration/api/registration-batch.test.js --config tests/config/vitest.integration.config.js
```

#### E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run specific E2E test
npx playwright test tests/e2e/flows/payment-flow.test.js

# Run E2E tests in specific browser
npx playwright test --project=chromium

# Debug E2E test
npx playwright test --debug tests/e2e/flows/registration-flow.test.js

# View E2E test report
npx playwright show-report
```

#### Coverage Reports

```bash
# Generate coverage report
npm run test:coverage

# View coverage report
open coverage/unit-only/index.html
```

### CI/CD Execution

GitHub Actions automatically runs tests on every push and pull request:

```yaml
# .github/workflows/test-suite.yml
- name: Run unit tests
  run: npm test

- name: Run integration tests
  run: npm run test:integration

- name: Run E2E tests
  run: npm run test:e2e:ci
```

## Performance Targets

### Unit Tests

**Target**: <2 seconds for 1126+ tests

**Current Performance**:

- Execution time: ~5 seconds (optimization ongoing)
- Memory usage: <1GB
- Parallel workers: 1 fork (single fork for stability)

**Optimization Strategies**:

- In-memory SQLite (zero disk I/O)
- Minimal test isolation overhead
- Aggressive timeout reduction
- Optimized database migration handling

### Integration Tests

**Target**: 30-50 seconds for ~30-50 tests

**Current Performance**:

- Execution time: ~45 seconds
- Memory usage: <2GB
- Parallel workers: 2-4 threads

**Optimization Strategies**:

- In-memory SQLite with perfect isolation
- Parallel test execution enabled
- Reduced external service calls
- Efficient database connection pooling

### E2E Tests

**Target**: 2-5 minutes for 21 tests

**Current Performance**:

- Execution time: ~3-4 minutes
- Multi-browser testing: Chrome, Firefox, Safari, Mobile
- Parallel workers: 2 (CI) / 4 (local)

**Optimization Strategies**:

- Vercel Preview Deployments (no local server startup)
- Parallel browser execution
- Optimized timeout configurations
- Minimal video recording (only on failure)

### Coverage Targets

**Unit Test Coverage**:

- Branches: 80%
- Functions: 85%
- Lines: 85%
- Statements: 85%

**Integration Test Coverage**:

- API endpoints: 90%+
- Service integration: 85%+
- Database operations: 90%+

**E2E Test Coverage**:

- Critical user flows: 100%
- Payment flows: 100%
- Authentication flows: 100%
- Registration flows: 100%

## Best Practices

1. **Write Fast Tests**: Keep unit tests under 100ms each
2. **Isolate Tests**: No shared state between tests
3. **Clear Names**: Describe what the test validates, not how
4. **Arrange-Act-Assert**: Follow standard test structure
5. **One Assertion Focus**: Prefer focused tests over multi-assertion tests
6. **Clean Up**: Always clean up resources in `afterEach`
7. **Mock Wisely**: Mock external services, not internal logic
8. **Test Edge Cases**: Include error scenarios and boundary conditions

## Troubleshooting

### Common Issues

**Slow Unit Tests**:

- Check for synchronous database operations
- Verify in-memory database configuration
- Review test isolation overhead

**Integration Test Failures**:

- Verify database migrations are running
- Check for shared state between tests
- Review parallel execution conflicts

**E2E Test Timeouts**:

- Verify Vercel Preview Deployment is accessible
- Check network connectivity
- Review timeout configurations in `tests/config/playwright-e2e-optimized.config.js`

**Memory Issues**:

- Reduce parallel workers
- Increase Node.js memory limit: `NODE_OPTIONS='--max-old-space-size=2048'`
- Review test cleanup procedures

## Next Steps

For detailed information on test maintenance and extension, see:

- [Phase Completion Report](./PHASE_COMPLETION_REPORT.md) - Detailed breakdown of all testing phases
- [Test Maintenance Guide](./TEST_MAINTENANCE_GUIDE.md) - Practical guide for maintaining tests

For project-wide testing information, see:

- [CLAUDE.md](/CLAUDE.md) - Project configuration and testing commands
- [CI/CD Documentation](../ci-cd/README.md) - GitHub Actions configuration

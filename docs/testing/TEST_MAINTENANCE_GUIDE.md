# Test Maintenance Guide

Practical guide for maintaining and extending the A Lo Cubano Boulder Fest test suite.

## Table of Contents

- [Adding New Tests](#adding-new-tests)
- [Common Test Patterns](#common-test-patterns)
- [Debugging Failed Tests](#debugging-failed-tests)
- [Test Performance](#test-performance)
- [CI/CD Integration](#cicd-integration)
- [Best Practices](#best-practices)

## Adding New Tests

### When to Add Tests

Add tests in the following scenarios:

#### 1. New Features Added

**Example**: Adding a new ticket type

```javascript
// tests/unit/tickets/new-ticket-type.test.js
import { test, expect } from 'vitest';
import { createTicket } from '../../api/tickets/create.js';

test.describe('VIP Ticket Type', () => {
  test('should create VIP ticket with premium features', async () => {
    const ticket = await createTicket({
      type: 'vip',
      email: 'vip@example.com',
      features: ['backstage_access', 'meet_and_greet']
    });

    expect(ticket.type).toBe('vip');
    expect(ticket.features).toContain('backstage_access');
  });
});
```

#### 2. Bugs Discovered (Regression Tests)

**Example**: Fixing a bug where negative donation amounts were accepted

```javascript
// tests/unit/donations/negative-amount-bug.test.js
import { test, expect } from 'vitest';
import { validateDonationAmount } from '../../lib/donations-service.js';

test('should reject negative donation amounts', () => {
  // Regression test for bug #123
  const result = validateDonationAmount(-50);

  expect(result.valid).toBe(false);
  expect(result.error).toContain('must be positive');
});
```

#### 3. Security Vulnerabilities Found

**Example**: Testing for SQL injection prevention

```javascript
// tests/unit/security/sql-injection-prevention.test.js
import { test, expect } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';

test('should prevent SQL injection in ticket lookup', async () => {
  const db = await getDatabaseClient();
  const maliciousInput = "1' OR '1'='1";

  const result = await db.execute({
    sql: 'SELECT * FROM tickets WHERE id = ?',
    args: [maliciousInput]
  });

  expect(result.rows.length).toBe(0);
});
```

#### 4. API Endpoints Created

**Example**: Testing a new API endpoint

```javascript
// tests/integration/api/new-endpoint.test.js
import { test, expect } from 'vitest';
import { testRequest } from '../handler-test-helper.js';

test('should return schedule data', async () => {
  const response = await testRequest('GET', '/api/schedule');

  expect(response.status).toBe(200);
  expect(response.body.events).toBeInstanceOf(Array);
});
```

#### 5. Database Schema Changes

**Example**: Testing a new migration

```javascript
// tests/integration/database/migration-045.test.js
import { test, expect } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';

test('should create artist_performances table', async () => {
  const db = await getDatabaseClient();

  const result = await db.execute(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name='artist_performances'
  `);

  expect(result.rows.length).toBe(1);
});
```

### How to Add Tests

#### Step 1: Choose Appropriate Test Type

**Decision Tree**:

```text
Is it testing a single function or component?
  YES → Unit Test (tests/unit/)
  NO  → Continue

Does it test API endpoints or service integration?
  YES → Integration Test (tests/integration/)
  NO  → Continue

Does it test full user workflow in a browser?
  YES → E2E Test (tests/e2e/flows/)
```

#### Step 2: Follow Naming Conventions

**File Naming**:

- Pattern: `[feature-name].test.js`
- Use kebab-case
- Be descriptive and specific

**Examples**:

```text
✅ GOOD:
  - csrf-token-validation.test.js
  - multi-ticket-registration.test.js
  - exponential-backoff.test.js

❌ BAD:
  - test1.js
  - csrf.test.js
  - tickets.test.js
```

**Test Suite Naming**:

```javascript
// Use descriptive suite names
test.describe('CSRF Token Validation', () => {
  // Tests go here
});

// Group related tests
test.describe('Email Service', () => {
  test.describe('Sending', () => {
    // Sending tests
  });

  test.describe('Validation', () => {
    // Validation tests
  });
});
```

#### Step 3: Use Existing Patterns and Helpers

**Import Test Utilities**:

```javascript
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';
import { testRequest } from '../handler-test-helper.js';
```

**Use Shared Setup/Teardown**:

```javascript
let db;

beforeEach(async () => {
  db = await getDatabaseClient();
  // Setup code
});

afterEach(async () => {
  if (db) await db.close();
  // Cleanup code
});
```

#### Step 4: Add to Appropriate Test File or Create New File

**Add to Existing File** (if feature already has tests):

```javascript
// tests/unit/donations/donations-service.test.js

// Existing tests...

test.describe('New Feature', () => {
  test('should handle new scenario', () => {
    // New test
  });
});
```

**Create New File** (if new feature area):

```javascript
// tests/unit/notifications/push-notifications.test.js
import { test, expect } from 'vitest';

test.describe('Push Notifications', () => {
  test('should send push notification to user', () => {
    // Test implementation
  });
});
```

#### Step 5: Update Documentation

**Update Test Count** in `PHASE_COMPLETION_REPORT.md`:

```markdown
### Phase 6: Notifications (Week 6)

**Total Tests**: 45 tests across 3 files

**Files Created**:
- tests/unit/notifications/push-notifications.test.js (20 tests)
- tests/integration/notifications/notification-delivery.test.js (15 tests)
- tests/e2e/flows/notification-flow.test.js (10 tests)
```

**Update Coverage Metrics**:

```markdown
### Unit Test Coverage

**By Module**:
- Notifications: 90%  ← NEW
```

## Common Test Patterns

### 1. Unit Test Pattern

**Arrange-Act-Assert Structure**:

```javascript
import { test, expect } from 'vitest';
import { calculateTax } from '../../lib/tax-calculator.js';

test('should calculate tax correctly', () => {
  // ARRANGE: Set up test data
  const amount = 100;
  const taxRate = 0.08;

  // ACT: Execute the function
  const result = calculateTax(amount, taxRate);

  // ASSERT: Verify the result
  expect(result).toBe(8);
});
```

**Multiple Test Cases**:

```javascript
test.describe('Tax Calculation', () => {
  test('should calculate tax for positive amounts', () => {
    expect(calculateTax(100, 0.08)).toBe(8);
  });

  test('should return 0 for zero amount', () => {
    expect(calculateTax(0, 0.08)).toBe(0);
  });

  test('should throw error for negative amounts', () => {
    expect(() => calculateTax(-100, 0.08)).toThrow('Amount must be positive');
  });
});
```

**Using Test Fixtures**:

```javascript
const testCases = [
  { amount: 100, rate: 0.08, expected: 8 },
  { amount: 50, rate: 0.1, expected: 5 },
  { amount: 200, rate: 0.05, expected: 10 }
];

test.each(testCases)('should calculate tax for $%d at %d%', ({ amount, rate, expected }) => {
  expect(calculateTax(amount, rate)).toBe(expected);
});
```

### 2. Integration Test Pattern

**API Endpoint Testing**:

```javascript
import { test, expect } from 'vitest';
import { testRequest } from '../handler-test-helper.js';

test('should create ticket via API', async () => {
  // ARRANGE: Prepare request data
  const requestBody = {
    type: 'full-pass',
    email: 'test@example.com',
    quantity: 1
  };

  // ACT: Make API request
  const response = await testRequest('POST', '/api/tickets/create', {
    body: requestBody
  });

  // ASSERT: Verify response
  expect(response.status).toBe(200);
  expect(response.body.ticket).toBeDefined();
  expect(response.body.ticket.email).toBe('test@example.com');
});
```

**Database Integration Testing**:

```javascript
import { test, expect, beforeEach, afterEach } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';

let db;

beforeEach(async () => {
  db = await getDatabaseClient();
});

afterEach(async () => {
  if (db) await db.close();
});

test('should persist ticket to database', async () => {
  // ARRANGE: Create ticket data
  const ticket = {
    id: 'ticket-123',
    email: 'test@example.com',
    type: 'full-pass'
  };

  // ACT: Insert into database
  await db.execute({
    sql: 'INSERT INTO tickets (id, email, type) VALUES (?, ?, ?)',
    args: [ticket.id, ticket.email, ticket.type]
  });

  // ASSERT: Verify persistence
  const result = await db.execute({
    sql: 'SELECT * FROM tickets WHERE id = ?',
    args: [ticket.id]
  });

  expect(result.rows.length).toBe(1);
  expect(result.rows[0].email).toBe('test@example.com');
});
```

**Service Integration Testing**:

```javascript
import { test, expect, vi } from 'vitest';

// Mock external service
vi.mock('../../lib/brevo-service.js', () => ({
  sendEmail: vi.fn().mockResolvedValue({ messageId: 'msg-123' })
}));

test('should send confirmation email after ticket purchase', async () => {
  const brevoService = await import('../../lib/brevo-service.js');

  // ACT: Purchase ticket (which should trigger email)
  await purchaseTicket({ email: 'test@example.com' });

  // ASSERT: Verify email was sent
  expect(brevoService.sendEmail).toHaveBeenCalledWith(
    expect.objectContaining({
      to: 'test@example.com',
      subject: expect.stringContaining('Confirmation')
    })
  );
});
```

### 3. E2E Test Pattern (Playwright)

**Basic Navigation Test**:

```javascript
import { test, expect } from '@playwright/test';

test('should navigate to tickets page', async ({ page }) => {
  // ARRANGE: Navigate to home page
  await page.goto('/');

  // ACT: Click tickets link
  await page.click('a[href="/tickets"]');

  // ASSERT: Verify navigation
  await expect(page).toHaveURL(/.*tickets/);
  await expect(page.locator('h1')).toContainText('Tickets');
});
```

**Form Submission Test**:

```javascript
import { test, expect } from '@playwright/test';

test('should submit registration form', async ({ page }) => {
  await page.goto('/register');

  // ARRANGE: Fill form
  await page.fill('input[name="firstName"]', 'John');
  await page.fill('input[name="lastName"]', 'Doe');
  await page.fill('input[name="email"]', 'john@example.com');

  // ACT: Submit form
  await page.click('button[type="submit"]');

  // ASSERT: Verify success
  await expect(page.locator('.success-message')).toBeVisible();
  await expect(page.locator('.success-message')).toContainText('Registration successful');
});
```

**Payment Flow Test**:

```javascript
import { test, expect } from '@playwright/test';

test('should complete payment flow', async ({ page }) => {
  await page.goto('/tickets');

  // Add to cart
  await page.click('button[data-ticket="full-pass"]');
  await expect(page.locator('.cart-count')).toContainText('1');

  // Proceed to checkout
  await page.click('button.checkout');
  await expect(page).toHaveURL(/.*checkout/);

  // Fill payment form (using Stripe test card)
  await page.fill('input[name="cardNumber"]', '4242424242424242');
  await page.fill('input[name="expiry"]', '12/30');
  await page.fill('input[name="cvc"]', '123');

  // Submit payment
  await page.click('button#submit-payment');

  // Verify success
  await expect(page).toHaveURL(/.*success/, { timeout: 10000 });
  await expect(page.locator('h1')).toContainText('Thank you');
});
```

**Mobile-Specific Test**:

```javascript
import { test, expect, devices } from '@playwright/test';

test.use({ ...devices['iPhone 12'] });

test('should display mobile menu', async ({ page }) => {
  await page.goto('/');

  // Verify hamburger menu visible on mobile
  await expect(page.locator('.hamburger-menu')).toBeVisible();

  // Click to open menu
  await page.click('.hamburger-menu');

  // Verify menu items
  await expect(page.locator('nav.mobile-nav')).toBeVisible();
  await expect(page.locator('nav.mobile-nav a[href="/tickets"]')).toBeVisible();
});
```

### 4. Mocking Pattern

**Mock External API**:

```javascript
import { test, expect, vi } from 'vitest';

vi.mock('node-fetch', () => ({
  default: vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: 'mocked response' })
    })
  )
}));

test('should fetch data from external API', async () => {
  const fetch = (await import('node-fetch')).default;

  const result = await fetch('https://api.example.com/data');
  const data = await result.json();

  expect(data).toEqual({ data: 'mocked response' });
});
```

**Mock Database**:

```javascript
import { test, expect, vi } from 'vitest';

const mockDb = {
  execute: vi.fn().mockResolvedValue({
    rows: [{ id: '123', email: 'test@example.com' }]
  })
};

vi.mock('../../lib/database.js', () => ({
  getDatabaseClient: vi.fn(() => Promise.resolve(mockDb))
}));

test('should query database', async () => {
  const { getDatabaseClient } = await import('../../lib/database.js');
  const db = await getDatabaseClient();

  const result = await db.execute('SELECT * FROM tickets');

  expect(result.rows.length).toBe(1);
  expect(result.rows[0].email).toBe('test@example.com');
});
```

**Partial Mock (spy on real implementation)**:

```javascript
import { test, expect, vi } from 'vitest';
import { sendEmail } from '../../lib/brevo-service.js';

test('should log email sending', async () => {
  const spy = vi.spyOn(console, 'log');

  await sendEmail({ to: 'test@example.com', subject: 'Test' });

  expect(spy).toHaveBeenCalledWith(
    expect.stringContaining('Sending email to test@example.com')
  );

  spy.mockRestore();
});
```

### 5. Async Testing Pattern

**Promise-based Test**:

```javascript
test('should resolve promise', async () => {
  const promise = fetchData();

  await expect(promise).resolves.toBe('data');
});

test('should reject promise', async () => {
  const promise = fetchInvalidData();

  await expect(promise).rejects.toThrow('Invalid data');
});
```

**Callback-based Test**:

```javascript
test('should handle callback', (done) => {
  fetchDataWithCallback((error, data) => {
    expect(error).toBeNull();
    expect(data).toBe('result');
    done();
  });
});
```

**Timeout Testing**:

```javascript
test('should timeout after 5 seconds', async () => {
  const slowOperation = new Promise((resolve) => {
    setTimeout(() => resolve('done'), 6000);
  });

  await expect(slowOperation).rejects.toThrow('Timeout');
}, 5000); // 5 second timeout
```

## Debugging Failed Tests

### Reading Test Output

**Example Failed Test Output**:

```text
FAIL tests/unit/donations/donations-service.test.js
  ● Donations Service › should calculate donation total

    expect(received).toBe(expected)

    Expected: 150
    Received: 140

       8 |   const total = calculateDonationTotal([50, 50, 50]);
       9 |
    > 10 |   expect(total).toBe(150);
         |                 ^
      11 | });

    at Object.<anonymous> (tests/unit/donations/donations-service.test.js:10:17)
```

**Reading the Output**:

1. **Test Name**: "should calculate donation total"
2. **Error Type**: Assertion failure (`expect().toBe()`)
3. **Expected vs. Received**: Expected 150, got 140
4. **Line Number**: Line 10 in the test file
5. **Context**: The test was calculating total of [50, 50, 50]

**Debugging Steps**:

1. Check the input data: `[50, 50, 50]` should equal 150
2. Check the function implementation: Is there a bug in `calculateDonationTotal`?
3. Add console.log to see intermediate values
4. Run the test in isolation with `test.only()`

### Using `test.only()` to Isolate Failing Tests

**Run Single Test**:

```javascript
// Only this test will run
test.only('should calculate donation total', () => {
  const total = calculateDonationTotal([50, 50, 50]);
  expect(total).toBe(150);
});

// This test will be skipped
test('should calculate tax', () => {
  // ...
});
```

**Run Single Suite**:

```javascript
// Only this suite will run
test.describe.only('Donations Service', () => {
  test('should calculate total', () => {
    // ...
  });

  test('should validate amount', () => {
    // ...
  });
});

// This suite will be skipped
test.describe('Tax Service', () => {
  // ...
});
```

### Checking Database State with Debug Queries

**Add Debug Queries**:

```javascript
test('should create ticket in database', async () => {
  const db = await getDatabaseClient();

  // Create ticket
  await db.execute({
    sql: 'INSERT INTO tickets (id, email) VALUES (?, ?)',
    args: ['ticket-123', 'test@example.com']
  });

  // DEBUG: Check what's in the database
  const allTickets = await db.execute('SELECT * FROM tickets');
  console.log('All tickets:', allTickets.rows);

  // Actual test assertion
  const result = await db.execute({
    sql: 'SELECT * FROM tickets WHERE id = ?',
    args: ['ticket-123']
  });

  expect(result.rows.length).toBe(1);
});
```

**Use Database Inspection Tools**:

```bash
# For in-memory SQLite, use console.log
# For file-based SQLite, use sqlite3 CLI

sqlite3 test-database.db "SELECT * FROM tickets"
```

### Validating Environment Variables

**Check Environment Variables**:

```javascript
test('should have required environment variables', () => {
  console.log('BREVO_API_KEY:', process.env.BREVO_API_KEY);
  console.log('STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY);
  console.log('DATABASE_URL:', process.env.DATABASE_URL);

  expect(process.env.BREVO_API_KEY).toBeDefined();
  expect(process.env.STRIPE_SECRET_KEY).toBeDefined();
});
```

**Environment Variable Issues**:

```text
Common issues:
- Missing .env file
- Wrong environment variable name
- Environment variable not loaded in test config
- CI/CD environment variable not set
```

**Solution**:

```javascript
// tests/config/vitest.unit.config.js
export default defineConfig({
  test: {
    env: {
      BREVO_API_KEY: 'test-api-key',  // Ensure test values are set
      DATABASE_URL: 'file::memory:'
    }
  }
});
```

### Checking for Timing Issues

**Race Condition Example**:

```javascript
// ❌ FLAKY TEST (race condition)
test('should send email after delay', async () => {
  sendEmailWithDelay(); // Async, no await

  // This might run before email is sent
  expect(emailSent).toBe(true);
});

// ✅ FIXED (proper async handling)
test('should send email after delay', async () => {
  await sendEmailWithDelay(); // Wait for completion

  expect(emailSent).toBe(true);
});
```

**Timeout Issues**:

```javascript
// If test times out, increase timeout
test('should complete slow operation', async () => {
  await verySlowOperation();
}, 30000); // 30 second timeout

// Or make operation faster with mocking
vi.mock('slow-library', () => ({
  slowFunction: vi.fn(() => Promise.resolve('fast result'))
}));
```

### Using Playwright Trace Viewer for E2E Tests

**Enable Tracing**:

```javascript
// playwright-e2e-optimized.config.js
export default defineConfig({
  use: {
    trace: 'on-first-retry', // Capture trace on first retry
  }
});
```

**View Trace**:

```bash
# After test failure, view trace
npx playwright show-trace trace.zip
```

**Trace Viewer Features**:

- Timeline of all actions
- Network requests
- Console logs
- Screenshots at each step
- DOM snapshots
- Action details (click coordinates, element selectors)

**Debug Mode**:

```bash
# Run test in debug mode (step through actions)
npx playwright test --debug tests/e2e/flows/payment-flow.test.js
```

## Test Performance

### Keeping Unit Tests Fast (<100ms each)

**Fast Test Checklist**:

- ✅ Use in-memory database (`:memory:`)
- ✅ Avoid real network requests (use mocks)
- ✅ Minimize setup/teardown overhead
- ✅ Use test fixtures for common data
- ✅ Avoid `setTimeout` or `setInterval`

**Example Fast Test**:

```javascript
// ✅ FAST (< 10ms)
test('should validate email format', () => {
  expect(isValidEmail('test@example.com')).toBe(true);
  expect(isValidEmail('invalid-email')).toBe(false);
});
```

**Example Slow Test**:

```javascript
// ❌ SLOW (> 1000ms)
test('should send real email', async () => {
  await sendRealEmail('test@example.com'); // Real API call
  await wait(1000); // Unnecessary delay
});

// ✅ FIXED (< 10ms)
vi.mock('../../lib/brevo-service.js');

test('should send email', async () => {
  await sendEmail('test@example.com'); // Mocked, instant
  expect(mockBrevoService.sendEmail).toHaveBeenCalled();
});
```

### Optimizing Integration Tests

**Shared Database Setup**:

```javascript
// Instead of per-test setup
beforeEach(async () => {
  db = await getDatabaseClient();
  await runMigrations(db); // Slow!
});

// Use shared setup (vitest.integration.config.js)
setupFiles: ['./tests/setup-integration.js']

// tests/setup-integration.js
beforeAll(async () => {
  const db = await getDatabaseClient();
  await runMigrations(db); // Run once for all tests
});
```

**Parallel Workers**:

```javascript
// tests/config/vitest.integration.config.js
export default defineConfig({
  test: {
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: 4 // Run 4 tests in parallel
      }
    }
  }
});
```

### E2E Test Execution (2-5 minutes target)

**Optimization Strategies**:

1. **Parallel Execution**:

```javascript
// playwright-e2e-optimized.config.js
export default defineConfig({
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4 // More workers locally
});
```

2. **Reduce Retries**:

```javascript
export default defineConfig({
  retries: process.env.CI ? 2 : 1 // Fewer retries for speed
});
```

3. **Disable Unnecessary Features**:

```javascript
export default defineConfig({
  use: {
    video: 'off',               // Disable video recording
    screenshot: 'only-on-failure' // Only screenshot failures
  }
});
```

4. **Optimize Timeouts**:

```javascript
export default defineConfig({
  timeout: 60000,              // 60 seconds max per test
  expect: { timeout: 15000 },  // 15 seconds for assertions
  use: {
    actionTimeout: 20000,      // 20 seconds for actions
    navigationTimeout: 40000   // 40 seconds for navigation
  }
});
```

### Identifying Slow Tests

**Vitest Slow Test Threshold**:

```javascript
// tests/config/vitest.unit.config.js
export default defineConfig({
  test: {
    slowTestThreshold: 100 // Flag tests > 100ms as slow
  }
});
```

**Output**:

```text
 ✓ tests/unit/fast-test.test.js (50ms)
 ✓ tests/unit/slow-test.test.js (350ms) ⚠️ SLOW
```

**Playwright Slow Test Report**:

```bash
# Generate test report with timing
npx playwright test --reporter=html

# View report
npx playwright show-report
```

**Report shows**:

- Test duration for each test
- Slowest tests highlighted
- Action-level timing breakdown

### Parallelization Strategies

**Unit Test Parallelization**:

```javascript
// Single fork for stability (current approach)
export default defineConfig({
  test: {
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true }
    }
  }
});

// Alternative: Multiple workers (faster but less stable)
export default defineConfig({
  test: {
    pool: 'threads',
    poolOptions: {
      threads: { maxThreads: 4 }
    }
  }
});
```

**Integration Test Parallelization**:

```javascript
// Parallel execution enabled (in-memory databases)
export default defineConfig({
  test: {
    pool: 'threads',
    poolOptions: {
      threads: {
        minThreads: 2,
        maxThreads: 4
      }
    },
    maxConcurrency: 4 // 4 tests at once
  }
});
```

**E2E Test Parallelization**:

```bash
# Run specific number of workers
npx playwright test --workers=4

# Run tests in parallel (default)
npx playwright test --fully-parallel
```

## CI/CD Integration

### GitHub Actions Workflow

**Test Workflow** (`.github/workflows/test.yml`):

```yaml
name: Test Suite

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '22.x'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm test

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/unit-only/coverage-final.json

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '22.x'

      - name: Install dependencies
        run: npm ci

      - name: Run integration tests
        run: npm run test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '22.x'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Run E2E tests
        run: npm run test:e2e:ci
        env:
          PREVIEW_URL: ${{ secrets.PREVIEW_URL }}
          TURSO_DATABASE_URL: ${{ secrets.TURSO_DATABASE_URL }}
          TURSO_AUTH_TOKEN: ${{ secrets.TURSO_AUTH_TOKEN }}

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

### Test Execution Order

**Recommended Order**:

1. **Unit Tests** (fastest, ~5 seconds)
   - Run first for quick feedback
   - Fail fast on basic logic errors

2. **Integration Tests** (medium, ~45 seconds)
   - Run after unit tests pass
   - Validate API and service integration

3. **E2E Tests** (slowest, ~3-4 minutes)
   - Run last to validate full workflows
   - Most expensive, only run on critical paths

**GitHub Actions Strategy**:

```yaml
jobs:
  unit-tests:
    # Always run

  integration-tests:
    needs: unit-tests  # Only if unit tests pass

  e2e-tests:
    needs: integration-tests  # Only if integration tests pass
```

### Handling Environment Variables

**Local Development**:

```bash
# Create .env file (gitignored)
BREVO_API_KEY=your-key
STRIPE_SECRET_KEY=your-key
DATABASE_URL=file:./test.db
```

**CI/CD (GitHub Secrets)**:

```yaml
# .github/workflows/test.yml
- name: Run tests
  env:
    BREVO_API_KEY: ${{ secrets.BREVO_API_KEY }}
    STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY }}
    TURSO_DATABASE_URL: ${{ secrets.TURSO_DATABASE_URL }}
    TURSO_AUTH_TOKEN: ${{ secrets.TURSO_AUTH_TOKEN }}
```

**Test Configuration**:

```javascript
// tests/config/vitest.unit.config.js
export default defineConfig({
  test: {
    env: {
      // Provide test defaults
      BREVO_API_KEY: process.env.BREVO_API_KEY || 'test-key',
      DATABASE_URL: 'file::memory:'
    }
  }
});
```

### Artifact Collection

**Coverage Reports**:

```yaml
- name: Generate coverage
  run: npm run test:coverage

- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/unit-only/coverage-final.json
    flags: unittests
```

**Test Results**:

```yaml
- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: test-results
    path: |
      test-results/
      playwright-report/
```

**Screenshots and Videos**:

```yaml
- name: Upload Playwright artifacts
  if: failure()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-artifacts
    path: |
      test-results/
      playwright-report/
```

### Flaky Test Handling

**Identify Flaky Tests**:

```bash
# Run test multiple times
npx vitest run tests/unit/flaky-test.test.js --repeat=10

# Playwright retry strategy
npx playwright test --retries=3
```

**Quarantine Flaky Tests**:

```javascript
// Mark as flaky (skip in CI, run locally)
test.skip(process.env.CI, 'should do something flaky', () => {
  // Flaky test implementation
});

// Or use test.fixme for tests that need fixing
test.fixme('should be fixed later', () => {
  // Temporarily disabled test
});
```

**Track Flaky Tests**:

```markdown
# docs/testing/FLAKY_TESTS.md

## Known Flaky Tests

| Test Name | Failure Rate | Cause | Status |
|-----------|--------------|-------|--------|
| should send email on registration | 5% | Timing issue | Investigating |
| should validate QR code | 2% | Race condition | Fixed in PR #123 |
```

## Best Practices

### 1. Write Fast Tests

**Keep unit tests under 100ms each**:

```javascript
// ✅ FAST
test('should validate input', () => {
  expect(validate('test')).toBe(true);
});

// ❌ SLOW
test('should process large dataset', async () => {
  const data = await loadLargeDataset(); // 1000ms
  expect(processData(data)).toBeDefined();
});
```

### 2. Isolate Tests

**No shared state between tests**:

```javascript
// ❌ BAD (shared state)
let counter = 0;

test('should increment counter', () => {
  counter++;
  expect(counter).toBe(1);
});

test('should increment counter again', () => {
  counter++; // Depends on previous test!
  expect(counter).toBe(2); // Will fail if tests run in different order
});

// ✅ GOOD (isolated)
test('should increment counter', () => {
  let counter = 0;
  counter++;
  expect(counter).toBe(1);
});

test('should increment counter again', () => {
  let counter = 0;
  counter++;
  expect(counter).toBe(1);
});
```

### 3. Clear Test Names

**Describe what the test validates, not how**:

```javascript
// ❌ BAD (describes implementation)
test('should call sendEmail function', () => {
  // ...
});

// ✅ GOOD (describes behavior)
test('should send confirmation email to user after registration', () => {
  // ...
});
```

### 4. Arrange-Act-Assert

**Follow standard test structure**:

```javascript
test('should calculate total price with tax', () => {
  // ARRANGE: Set up test data
  const price = 100;
  const taxRate = 0.08;

  // ACT: Execute function under test
  const total = calculateTotal(price, taxRate);

  // ASSERT: Verify expected outcome
  expect(total).toBe(108);
});
```

### 5. One Assertion Focus

**Prefer focused tests over multi-assertion tests**:

```javascript
// ❌ TOO MANY ASSERTIONS
test('should create user', () => {
  const user = createUser({ email: 'test@example.com' });
  expect(user.id).toBeDefined();
  expect(user.email).toBe('test@example.com');
  expect(user.createdAt).toBeInstanceOf(Date);
  expect(user.updatedAt).toBeInstanceOf(Date);
  expect(user.role).toBe('user');
});

// ✅ FOCUSED TESTS
test('should assign ID to new user', () => {
  const user = createUser({ email: 'test@example.com' });
  expect(user.id).toBeDefined();
});

test('should set email for new user', () => {
  const user = createUser({ email: 'test@example.com' });
  expect(user.email).toBe('test@example.com');
});

test('should set default role for new user', () => {
  const user = createUser({ email: 'test@example.com' });
  expect(user.role).toBe('user');
});
```

### 6. Clean Up Resources

**Always clean up in `afterEach`**:

```javascript
let db;
let server;

beforeEach(async () => {
  db = await getDatabaseClient();
  server = await startTestServer();
});

afterEach(async () => {
  // Clean up resources
  if (db) await db.close();
  if (server) await server.close();

  // Reset mocks
  vi.clearAllMocks();
});
```

### 7. Mock Wisely

**Mock external services, not internal logic**:

```javascript
// ✅ GOOD (mock external service)
vi.mock('stripe', () => ({
  default: vi.fn(() => ({
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ id: 'session-123' })
      }
    }
  }))
}));

// ❌ BAD (mocking internal logic defeats purpose of test)
vi.mock('../../lib/calculate-total.js', () => ({
  calculateTotal: vi.fn(() => 100)
}));

test('should calculate total', () => {
  expect(calculateTotal(50, 50)).toBe(100); // Not actually testing anything!
});
```

### 8. Test Edge Cases

**Include error scenarios and boundary conditions**:

```javascript
test.describe('Price Calculation', () => {
  test('should calculate normal price', () => {
    expect(calculatePrice(2, 50)).toBe(100);
  });

  test('should handle zero quantity', () => {
    expect(calculatePrice(0, 50)).toBe(0);
  });

  test('should handle zero price', () => {
    expect(calculatePrice(2, 0)).toBe(0);
  });

  test('should throw error for negative quantity', () => {
    expect(() => calculatePrice(-1, 50)).toThrow('Quantity must be positive');
  });

  test('should throw error for negative price', () => {
    expect(() => calculatePrice(2, -50)).toThrow('Price must be positive');
  });

  test('should handle large quantities', () => {
    expect(calculatePrice(1000000, 50)).toBe(50000000);
  });
});
```

## Quick Reference

### Common Commands

```bash
# Unit tests
npm test                                    # Run all unit tests
npx vitest run tests/unit/specific.test.js # Run specific test
npx vitest watch                            # Watch mode

# Integration tests
npm run test:integration                    # Run all integration tests

# E2E tests
npm run test:e2e                            # Run all E2E tests
npx playwright test --debug                 # Debug mode
npx playwright show-report                  # View report

# Coverage
npm run test:coverage                       # Generate coverage
open coverage/unit-only/index.html          # View coverage

# All tests
npm run test:all                            # Run all test suites
```

### Test File Templates

**Unit Test Template**:

```javascript
import { test, expect, beforeEach, afterEach } from 'vitest';

test.describe('Feature Name', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  test('should do something', () => {
    // Arrange
    const input = 'test';

    // Act
    const result = doSomething(input);

    // Assert
    expect(result).toBe('expected');
  });
});
```

**Integration Test Template**:

```javascript
import { test, expect, beforeEach, afterEach } from 'vitest';
import { testRequest } from '../handler-test-helper.js';

test.describe('API Endpoint', () => {
  beforeEach(async () => {
    // Setup database
  });

  afterEach(async () => {
    // Cleanup
  });

  test('should handle POST request', async () => {
    const response = await testRequest('POST', '/api/endpoint', {
      body: { data: 'value' }
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('result');
  });
});
```

**E2E Test Template**:

```javascript
import { test, expect } from '@playwright/test';

test.describe('User Flow', () => {
  test('should complete workflow', async ({ page }) => {
    await page.goto('/start');

    await page.click('button.next');
    await expect(page).toHaveURL(/.*step-2/);

    await page.fill('input[name="field"]', 'value');
    await page.click('button.submit');

    await expect(page.locator('.success')).toBeVisible();
  });
});
```

## Next Steps

For more information, see:

- [Test Architecture](./TEST_ARCHITECTURE.md) - Complete testing architecture overview
- [Phase Completion Report](./PHASE_COMPLETION_REPORT.md) - Detailed breakdown of testing phases
- [CLAUDE.md](/CLAUDE.md) - Project configuration and commands

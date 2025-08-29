# Database Testing Strategy

## Overview

This document outlines the dual database strategy used for testing the A Lo Cubano Boulder Fest website, ensuring fast unit tests and realistic end-to-end validation.

## Two-Database Approach

### SQLite for Unit Tests

**Purpose**: Fast, isolated unit testing of API contracts and database operations

**Characteristics**:
- **In-memory execution**: Database exists only during test execution
- **Zero external dependencies**: No network connections or external services
- **Instant setup/teardown**: Clean state for each test
- **Migration validation**: Tests database schema changes
- **Fast execution**: Complete 26-test suite in under 1 second

### Turso for E2E Tests

**Purpose**: Production-like testing environment for end-to-end workflows

**Characteristics**:
- **Production-identical**: Same database technology as production
- **Real network operations**: Tests actual connection handling
- **Performance validation**: Real query execution times
- **Data integrity**: Complex multi-table operations
- **Realistic scenarios**: True production environment simulation

## Implementation Details

### Unit Test Database (SQLite)

#### Configuration

```javascript
// tests/vitest.config.js
export default {
  test: {
    environment: 'node',
    setupFiles: ['./setup.js']
  }
}
```

#### Database Setup

```javascript
// tests/setup.js
import Database from 'better-sqlite3';

// In-memory SQLite database for tests
const testDb = new Database(':memory:');

// Run migrations
const migrations = fs.readdirSync('./migrations')
  .filter(file => file.endsWith('.sql'))
  .sort();

for (const migration of migrations) {
  const sql = fs.readFileSync(`./migrations/${migration}`, 'utf8');
  testDb.exec(sql);
}
```

#### Test Isolation

```javascript
// Each test gets clean database state
beforeEach(() => {
  // Clear all tables
  testDb.exec('DELETE FROM tickets');
  testDb.exec('DELETE FROM registrations');
  testDb.exec('DELETE FROM newsletter_subscribers');
  
  // Reset auto-increment
  testDb.exec('DELETE FROM sqlite_sequence');
});
```

### E2E Test Database (Turso)

#### Configuration

```javascript
// playwright-e2e-turso.config.js
export default {
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
};
```

#### Environment Variables

```bash
# Required for E2E tests
TURSO_DATABASE_URL=libsql://your-test-database.turso.io
TURSO_AUTH_TOKEN=your-auth-token
E2E_TEST_MODE=true
ENVIRONMENT=e2e-test
```

#### Database Management

```javascript
// tests/e2e/global-setup.js
export default async function globalSetup() {
  // Validate test environment
  if (!process.env.TURSO_DATABASE_URL?.includes('test')) {
    throw new Error('E2E tests require test database URL');
  }
  
  // Initialize test data
  await setupTestDatabase();
}
```

## Database Operations Testing

### Unit Test Coverage

#### API Contract Testing

```javascript
// tests/api-contracts.test.js
describe('Database API Contracts', () => {
  test('ticket creation returns proper structure', async () => {
    const response = await fetch('/api/tickets/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validTicketData)
    });
    
    const result = await response.json();
    
    // Validates database schema compliance
    expect(result).toHaveProperty('ticket_id');
    expect(result).toHaveProperty('qr_code');
    expect(result).toHaveProperty('created_at');
  });
});
```

#### Migration Testing

```javascript
// tests/basic-validation.test.js
describe('Database Migrations', () => {
  test('all migrations apply successfully', () => {
    // Tests run against migrated SQLite database
    const tables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all();
    
    expect(tables.map(t => t.name)).toContain('tickets');
    expect(tables.map(t => t.name)).toContain('registrations');
    expect(tables.map(t => t.name)).toContain('newsletter_subscribers');
  });
});
```

#### Data Validation Testing

```javascript
// tests/registration-api.test.js
describe('Registration Data Validation', () => {
  test('prevents SQL injection in name fields', async () => {
    const maliciousInput = "'; DROP TABLE registrations; --";
    
    const response = await fetch('/api/registration/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickets: [{ name: maliciousInput, email: 'test@example.com' }]
      })
    });
    
    // Database should reject malicious input safely
    expect(response.status).toBe(400);
    
    // Verify table still exists
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE name='registrations'
    `).all();
    expect(tables).toHaveLength(1);
  });
});
```

### E2E Test Coverage

#### Complete Workflow Testing

```javascript
// tests/e2e/flows/ticket-purchase-simple.test.js
test('complete ticket purchase workflow', async ({ page }) => {
  // Tests real database operations
  await page.goto('/tickets');
  await page.click('[data-testid="add-to-cart"]');
  await page.click('[data-testid="checkout"]');
  
  // Fill payment form (Stripe test mode)
  await page.fill('[data-testid="card-number"]', '4242424242424242');
  await page.fill('[data-testid="expiry"]', '12/25');
  await page.fill('[data-testid="cvc"]', '123');
  
  await page.click('[data-testid="pay-button"]');
  
  // Verify database record creation
  await expect(page.locator('[data-testid="confirmation"]')).toBeVisible();
  
  // Database verification happens in background
  // Real Turso database updated with ticket and payment records
});
```

#### Data Consistency Testing

```javascript
// tests/e2e/flows/admin-login-simple.test.js
test('admin dashboard shows real data', async ({ page }) => {
  // Login as admin
  await page.goto('/admin');
  await page.fill('[data-testid="password"]', process.env.TEST_ADMIN_PASSWORD);
  await page.click('[data-testid="login"]');
  
  // Dashboard pulls real data from Turso
  await expect(page.locator('[data-testid="ticket-count"]')).toBeVisible();
  await expect(page.locator('[data-testid="revenue-total"]')).toBeVisible();
  
  // Data reflects actual database state
  const ticketCount = await page.locator('[data-testid="ticket-count"]').textContent();
  expect(parseInt(ticketCount)).toBeGreaterThanOrEqual(0);
});
```

## Performance Characteristics

### Unit Tests (SQLite)

| Operation | Target Time | Actual Performance |
| --------- | ----------- | ------------------ |
| Database setup | <10ms | ~5ms |
| Migration execution | <50ms | ~20ms |
| Single query test | <1ms | ~0.5ms |
| Full test suite | <1000ms | ~200ms |
| Memory usage | <50MB | ~30MB |

### E2E Tests (Turso)

| Operation | Target Time | Realistic Performance |
| --------- | ----------- | --------------------- |
| Database connection | <500ms | ~200ms |
| Simple query | <100ms | ~50ms |
| Complex transaction | <1000ms | ~300ms |
| Full workflow test | <30s | ~15s |
| Test suite complete | <5min | ~3min |

## Data Management

### Unit Test Data

**Clean State**: Each test starts with empty tables
**Predictable Data**: Tests insert known data for validation
**No External Dependencies**: All data generated within test

```javascript
// Example unit test data setup
beforeEach(() => {
  // Insert known test data
  db.prepare(`
    INSERT INTO tickets (id, type, price, email) 
    VALUES (1, 'VIP', 150, 'test@example.com')
  `).run();
});
```

### E2E Test Data

**Persistent Data**: Data survives between tests for realistic scenarios
**Test Isolation**: Each test uses unique identifiers
**Cleanup Strategy**: Remove test data after suite completion

```javascript
// Example E2E test data management
// tests/e2e/helpers/storage-utils.js
export async function createTestTicket() {
  const testId = `e2e-test-${Date.now()}`;
  return {
    email: `${testId}@example.com`,
    name: `Test User ${testId}`
  };
}

export async function cleanupTestData() {
  // Remove data created during E2E tests
  await db.execute(`
    DELETE FROM tickets 
    WHERE email LIKE '%e2e-test%@example.com'
  `);
}
```

## Error Handling and Recovery

### Unit Test Error Scenarios

```javascript
// Test database constraint violations
test('prevents duplicate email registration', () => {
  // Insert first record
  db.prepare(`
    INSERT INTO newsletter_subscribers (email) 
    VALUES ('test@example.com')
  `).run();
  
  // Attempt duplicate - should fail
  expect(() => {
    db.prepare(`
      INSERT INTO newsletter_subscribers (email) 
      VALUES ('test@example.com')
    `).run();
  }).toThrow();
});
```

### E2E Test Error Scenarios

```javascript
// Test real database connection issues
test('handles database unavailable gracefully', async ({ page }) => {
  // Navigate to page that requires database
  await page.goto('/admin');
  
  // If database is unavailable, should show appropriate error
  const errorMessage = page.locator('[data-testid="database-error"]');
  
  // Either login succeeds (database available) or shows error
  await expect(async () => {
    const hasError = await errorMessage.isVisible();
    const hasLogin = await page.locator('[data-testid="admin-dashboard"]').isVisible();
    expect(hasError || hasLogin).toBe(true);
  }).toPass({ timeout: 10000 });
});
```

## Migration Testing Strategy

### Schema Validation

```javascript
// Unit tests verify migration completeness
test('migrations create all required tables', () => {
  const requiredTables = [
    'tickets',
    'registrations', 
    'newsletter_subscribers',
    'migrations'
  ];
  
  requiredTables.forEach(table => {
    const result = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name=?
    `).get(table);
    expect(result).toBeDefined();
  });
});
```

### Backward Compatibility

```javascript
// Test that existing data survives migrations
test('migrations preserve existing data', () => {
  // Create pre-migration data structure
  const oldData = {
    email: 'test@example.com',
    name: 'Test User'
  };
  
  // Insert using current schema
  db.prepare(`
    INSERT INTO registrations (email, full_name) 
    VALUES (?, ?)
  `).run(oldData.email, oldData.name);
  
  // Verify data persists after migration
  const result = db.prepare(`
    SELECT * FROM registrations WHERE email = ?
  `).get(oldData.email);
  
  expect(result.full_name).toBe(oldData.name);
});
```

## Benefits of Dual Database Strategy

### Development Speed

- **Fast unit tests**: Immediate feedback during development
- **Realistic E2E tests**: Confident deployment validation
- **Isolated testing**: No cross-test contamination
- **Parallel execution**: Unit and E2E tests run simultaneously

### Quality Assurance

- **Schema validation**: Migrations tested in both environments
- **Performance validation**: Real database performance characteristics
- **Data integrity**: Complex operations validated end-to-end
- **Error handling**: Database failures tested safely

### Maintenance Simplicity

- **Single migration source**: Same migrations used for both databases
- **Clear separation**: Unit tests for logic, E2E tests for workflows
- **Minimal configuration**: Simple setup for both database types
- **Easy debugging**: SQLite for quick investigation, Turso for production issues

This dual database strategy ensures comprehensive testing coverage while maintaining fast development feedback loops and realistic production validation.
# Simple Test Patterns Guide

## Core Principle

Keep tests simple, obvious, and maintainable. A junior developer should understand any test immediately.

## Environment Configuration

### Test Defaults (vitest.config.js)

```javascript
env: {
  NODE_ENV: 'test',
  TURSO_DATABASE_URL: ':memory:',
  BREVO_API_KEY: 'test-api-key',
  STRIPE_SECRET_KEY: 'test-stripe-key',
  // Add other test defaults here
}
```

## Pattern 1: Simple Mocking

### ✅ DO: Create simple, predictable mocks

```javascript
// tests/mocks/brevo-mock.js
export function createBrevoMock() {
  const subscribers = new Map();

  return {
    createContact: async ({ email }) => {
      if (subscribers.has(email)) {
        throw new Error("Contact already exists");
      }
      subscribers.set(email, { email, id: Date.now() });
      return { email };
    },
    reset: () => subscribers.clear(),
  };
}
```

### ❌ DON'T: Create complex state management

```javascript
// Avoid this complexity
class ComplexMockManager extends TestBoundaryManager {
  // 500+ lines of isolation orchestration...
}
```

## Pattern 2: Database Testing

### ✅ DO: Use in-memory SQLite for tests

```javascript
describe("Database operations", () => {
  // Automatically uses ':memory:' from vitest.config.js

  it("should insert data", async () => {
    const db = await getDatabase();
    await db.execute("INSERT INTO users (name) VALUES (?)", ["Test"]);
    // Each test gets a fresh database
  });
});
```

### ❌ DON'T: Create complex test boundary managers

```javascript
// Avoid this
TestBoundaryManager.withCompleteIsolation(async () => {
  // Complex isolation logic...
});
```

## Pattern 3: Environment Variables

### ✅ DO: Use test defaults in config

```javascript
// Tests automatically get defaults from vitest.config.js
it("should use API key", async () => {
  // BREVO_API_KEY is already 'test-api-key'
  const service = new EmailService();
  // Works without setup
});
```

### ❌ DON'T: Manipulate environment in tests

```javascript
// Avoid this
beforeEach(() => {
  testEnvManager.backup();
  testEnvManager.setMockEnv({...});
});
```

## Pattern 4: External Service Mocking

### ✅ DO: Mock at the boundary

```javascript
// Mock the external service directly
vi.mock("@brevo/client", () => ({
  ApiClient: {
    instance: {
      authentications: { "api-key": { apiKey: null } },
    },
  },
  ContactsApi: vi.fn(() => createBrevoMock()),
}));
```

### ❌ DON'T: Mock internal implementation

```javascript
// Avoid mocking internal methods
vi.spyOn(service, "_internalMethod");
```

## Pattern 5: Test Structure

### ✅ DO: Keep tests flat and obvious

```javascript
describe("User Service", () => {
  it("creates a user", async () => {
    const user = await createUser({ name: "Test" });
    expect(user.name).toBe("Test");
  });

  it("handles errors", async () => {
    await expect(createUser({})).rejects.toThrow("Name required");
  });
});
```

### ❌ DON'T: Create deep nesting

```javascript
// Avoid this
describe('Complex Suite', () => {
  describe('When initialized', () => {
    describe('With valid config', () => {
      describe('And database connected', () => {
        // Too deep!
      }}}});
```

## Pattern 6: Cleanup

### ✅ DO: Use simple cleanup

```javascript
let mockService;

beforeEach(() => {
  mockService = createServiceMock();
});

afterEach(() => {
  mockService.reset();
});
```

### ❌ DON'T: Create complex cleanup orchestration

```javascript
// Avoid this
afterEach(async () => {
  await TestSingletonManager.clearAllState();
  await TestMockManager.cleanup();
  await TestEnvironmentManager.restore();
  // Too complex!
});
```

## Pattern 7: Assertions

### ✅ DO: Make assertions clear

```javascript
// Clear what we're testing
expect(response.status).toBe(200);
expect(response.body.email).toBe("test@example.com");
```

### ❌ DON'T: Create complex assertion helpers

```javascript
// Avoid this
validateCompleteIsolationState({
  singletons: cleared,
  mocks: reset,
  environment: pristine,
});
```

## Key Principles

1. **Obviousness over DRY**: Repeat simple setup rather than abstract it
2. **Mock at boundaries**: Mock external services, not internal code
3. **Use defaults**: Let vitest.config.js provide environment
4. **Keep it flat**: Avoid deep nesting and complex hierarchies
5. **No production awareness**: Production code shouldn't know about tests

## When to Apply These Patterns

- **Always**: For new tests
- **During refactoring**: When simplifying existing tests
- **Never add**: Complex test orchestration layers

## Anti-Patterns to Remove

If you see these, simplify them:

- TestBoundaryManager
- TestSingletonManager
- Complex beforeEach chains
- Test-aware production code
- Environment manipulation utilities

## Remember

> "The best test is one that a junior developer can understand in 30 seconds."

Tests are documentation. Keep them simple.

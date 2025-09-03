# E2E Test Helpers - Test Isolation System & Network Simulation

This directory contains a comprehensive test isolation system for E2E tests that ensures each test runs in a clean environment without conflicts during parallel execution, plus robust network simulation capabilities for testing network resilience scenarios.

## 🧪 Test Isolation System

The test isolation system provides unique test data generation and cleanup mechanisms to prevent test conflicts and ensure reliable parallel test execution.

### Key Components

1. **test-isolation.js** - Core isolation manager and utilities
2. **test-fixtures.js** - Pre-configured test data fixtures
3. **storage-utils.js** - Browser storage management with isolation

## 🚀 Quick Start

### Basic Test Setup

```javascript
import { test, expect } from '@playwright/test';
import {
  initializeTestIsolation,
  cleanupTestIsolation,
  withTestTransaction,
  generateTestEmail
} from '../helpers/test-isolation.js';
import { createStorageUtils } from '../helpers/storage-utils.js';

// Initialize isolation for the test suite
test.beforeAll(async () => {
  await initializeTestIsolation();
});

test.afterAll(async () => {
  await cleanupTestIsolation();
});

test.describe('My Test Suite', () => {
  let storageUtils;

  test.beforeEach(async ({ page }) => {
    storageUtils = createStorageUtils(test.info().title);
    await storageUtils.setupCleanState(page);
  });

  test.afterEach(async ({ page }) => {
    await storageUtils.clearAll(page);
  });

  test('my test', async ({ page }) => {
    await withTestTransaction(test.info().title, async (namespace) => {
      // Your test code here with isolated data
      const email = generateTestEmail(test.info().title);
      // Test logic...
      return { success: true, namespace };
    });
  });
});
```

### Using Test Fixtures

```javascript
import { NewsletterFixtures, RegistrationFixtures } from '../helpers/test-fixtures.js';

test('newsletter subscription', async ({ page }) => {
  const subscription = NewsletterFixtures.validSubscription(test.info().title);
  
  // Use subscription.email, subscription.consent, etc.
  await page.fill('#email', subscription.email);
});
```

### Storage Management

```javascript
import { createStorageUtils } from '../helpers/storage-utils.js';

test('cart functionality', async ({ page }) => {
  const storage = createStorageUtils(test.info().title);
  
  // Add item to isolated cart
  await storage.cart.addToCart(page, { 
    id: 'item-1', 
    name: 'Test Item' 
  });
  
  // Verify cart state
  const cart = await storage.cart.getCart(page);
  expect(cart).toHaveLength(1);
});
```

## 📦 Core Functions

### Test Isolation Functions

| Function | Purpose | Usage |
|----------|---------|-------|
| `initializeTestIsolation()` | Initialize test session | Call in `beforeAll` |
| `cleanupTestIsolation()` | Cleanup test session | Call in `afterAll` |
| `withTestTransaction()` | Wrap test in transaction | Wrap test logic |
| `generateTestEmail()` | Generate unique email | `generateTestEmail('my-test')` |
| `generateTestUser()` | Generate user data | `generateTestUser('my-test')` |
| `generateTestTicketId()` | Generate ticket ID | `generateTestTicketId('my-test')` |
| `getTestNamespace()` | Get test namespace | `getTestNamespace('my-test')` |

### Test Data Generation

```javascript
// Generate unique test email
const email = generateTestEmail('my-test', 'newsletter');
// Result: "e2e_1640995200000_abc123_my_test_newsletter@e2etest.example.com"

// Generate complete user data
const user = generateTestUser('my-test', { 
  firstName: 'Custom',
  dietaryRestrictions: 'Vegetarian' 
});

// Generate registration data
const registration = generateRegistrationData('my-test', {
  user: { firstName: 'Maria' }
});

// Generate payment data  
const payment = generatePaymentData('my-test', {
  amount: 5000 // $50.00
});
```

## 🗂️ Test Fixtures

### Newsletter Fixtures

```javascript
import { NewsletterFixtures } from '../helpers/test-fixtures.js';

// Valid subscription
const valid = NewsletterFixtures.validSubscription('my-test');
// { email: "unique@email.com", consent: true, source: "e2e-test" }

// Invalid subscription
const invalid = NewsletterFixtures.invalidSubscription('my-test');
// { email: "invalid-email", consent: false }

// Custom domain
const custom = NewsletterFixtures.customDomainSubscription('my-test', 'company.com');
```

### Registration Fixtures

```javascript
import { RegistrationFixtures } from '../helpers/test-fixtures.js';

// Complete registration data
const registration = RegistrationFixtures.validRegistration('my-test');

// Minimal required fields only
const minimal = RegistrationFixtures.minimalRegistration('my-test');

// International user
const international = RegistrationFixtures.internationalRegistration('my-test');

// Dietary restrictions
const dietary = RegistrationFixtures.dietaryNeedsRegistration('my-test', 'Vegan');
```

### Ticket Fixtures

```javascript
import { TicketFixtures } from '../helpers/test-fixtures.js';

// Single ticket
const single = TicketFixtures.singleTicket('my-test', 'full-pass');

// Multiple tickets
const multiple = TicketFixtures.multipleTickets('my-test', 3);

// Day pass
const dayPass = TicketFixtures.dayPass('my-test', 'saturday');
```

### Admin Fixtures

```javascript
import { AdminFixtures } from '../helpers/test-fixtures.js';

// Valid admin credentials
const validAdmin = AdminFixtures.validAdmin();

// Invalid credentials
const invalidAdmin = AdminFixtures.invalidAdmin();

// Admin session data
const session = AdminFixtures.adminSession('my-test');
```

## 🗄️ Storage Management

### Basic Storage Operations

```javascript
import { createStorageUtils } from '../helpers/storage-utils.js';

const storage = createStorageUtils('my-test');

// Clear all storage
await storage.clearAll(page);

// Setup clean state
await storage.setupCleanState(page);

// Get all storage data
const allData = await storage.getAllStorageData(page);
```

### Cart Management

```javascript
// Add item to cart
await storage.cart.addToCart(page, {
  id: 'ticket-1',
  name: 'Full Pass',
  price: 75,
  quantity: 1
});

// Get cart contents
const cart = await storage.cart.getCart(page);

// Get item count
const count = await storage.cart.getCartItemCount(page);

// Clear cart
await storage.cart.clearCart(page);
```

### User Preferences

```javascript
// Set theme preference
await storage.preferences.setTheme(page, 'dark');

// Get theme
const theme = await storage.preferences.getTheme(page);

// Set custom preference
await storage.preferences.setPreference(page, 'language', 'es');

// Get preference with default
const lang = await storage.preferences.getPreference(page, 'language', 'en');
```

### Admin Session

```javascript
// Set admin session
await storage.admin.setAdminSession(page, {
  isAuthenticated: true,
  userId: 'admin',
  permissions: ['read', 'write']
});

// Check authentication
const isAuth = await storage.admin.isAdminAuthenticated(page);

// Clear session
await storage.admin.clearAdminSession(page);
```

## 🔄 Parallel Execution Safety

The isolation system ensures safe parallel execution:

### Unique Namespaces

Each test gets a unique namespace based on:
- Timestamp
- Random string
- Test title (sanitized)

Example namespace: `e2e_1640995200000_abc123_my_test_newsletter`

### Resource Tracking

All generated resources are tracked:
- Test emails
- User data
- Ticket IDs
- Storage keys

### Automatic Cleanup

Resources are automatically cleaned up:
- After each test (`withTestTransaction`)
- After test suite (`cleanupTestIsolation`)
- On process exit (signal handlers)

## 🛠️ Advanced Usage

### Custom Cleanup Tasks

```javascript
import { addCleanupTask } from '../helpers/test-isolation.js';

// Add custom cleanup
addCleanupTask(async () => {
  // Custom cleanup logic
  console.log('Custom cleanup executed');
});
```

### Transaction Wrapping

```javascript
await withTestTransaction('my-test', async (namespace) => {
  // Test logic here
  // Automatic cleanup on completion or error
  return { result: 'success' };
});
```

### Session Information

```javascript
import { getSessionInfo } from '../helpers/test-isolation.js';

// Get debugging information
const info = getSessionInfo();
console.log('Session info:', info);
// {
//   sessionId: "e2e_1640995200000_abc123",
//   testRunId: "run_def456",
//   activeTests: ["test1", "test2"],
//   createdResources: [...],
//   cleanupTasks: 3
// }
```

### Performance Fixtures

```javascript
import { PerformanceFixtures } from '../helpers/test-fixtures.js';

// Load test data
const loadTest = PerformanceFixtures.loadTestData('my-test', 50);

// Performance thresholds
const thresholds = PerformanceFixtures.performanceThresholds();
```

## 🐛 Debugging

### Enable Debug Logging

Set environment variable:
```bash
DEBUG=test-isolation npm run test:e2e
```

### Storage Debugging

```javascript
// Get all storage data
const allStorage = await storage.getAllStorageData(page);
console.log('Storage state:', allStorage);

// Monitor storage changes
await StorageHelpers.monitorStorageChanges(page);
```

### Resource Tracking

```javascript
import { getSessionInfo } from '../helpers/test-isolation.js';

const info = getSessionInfo();
console.log('Active tests:', info.activeTests);
console.log('Created resources:', info.createdResources);
```

## ✅ Best Practices

1. **Always use isolation**: Use the test isolation system for all E2E tests
2. **Unique test titles**: Ensure test titles are descriptive and unique
3. **Clean setup/teardown**: Always setup clean state and cleanup after tests
4. **Use fixtures**: Prefer fixtures over manual test data creation
5. **Transaction wrapping**: Wrap test logic in `withTestTransaction`
6. **Storage management**: Use storage utilities for browser storage operations
7. **Parallel safety**: Design tests to be safe for parallel execution

## 🚫 Anti-Patterns

1. **Don't share data**: Never share test data between tests
2. **Don't skip cleanup**: Always cleanup test resources
3. **Don't hardcode values**: Use generated test data instead of hardcoded values
4. **Don't ignore namespaces**: Always use the provided namespace system
5. **Don't mix isolation levels**: Don't mix isolated and non-isolated tests

## 🔗 Integration Examples

See the following files for complete integration examples:

- `newsletter-isolated.test.js` - Newsletter subscription with full isolation
- `ticket-purchase-isolated.test.js` - Ticket purchase flow
- `admin-dashboard-isolated.test.js` - Admin panel testing
- `registration-flow-isolated.test.js` - Registration process

## 🆘 Troubleshooting

### Common Issues

1. **Test conflicts**: Ensure unique test titles and proper cleanup
2. **Storage pollution**: Use `storage.clearAll()` in test teardown
3. **Resource leaks**: Check that `cleanupTestIsolation()` is called
4. **Namespace collisions**: Verify test titles are unique

### Error Recovery

The system includes automatic error recovery:
- Failed cleanup tasks are logged but don't stop other cleanups
- Process exit handlers ensure cleanup on interruption
- Resource tracking allows manual cleanup if needed

### Verification

```javascript
// Verify clean state
test.beforeEach(async ({ page }) => {
  const storage = await storage.getAllStorageData(page);
  expect(Object.keys(storage.localStorage)).toHaveLength(0);
});
```

## 🌐 Network Simulation Helper

The `network-simulation.js` helper provides comprehensive network simulation capabilities for testing network resilience scenarios.

### Critical Issues Fixed

This helper addresses critical CodeRabbit issues:

1. **simulateNetworkCondition is now functional** - Properly applies network conditions using Playwright's CDP API
2. **Memory leak prevention** - Comprehensive cleanup of event listeners and resources
3. **Network conditions properly applied** - Real network throttling and offline mode via Chrome DevTools Protocol

### Usage

```javascript
import { createNetworkSimulator, NETWORK_CONDITIONS } from './helpers/network-simulation.js';

// Create simulator instance
const simulator = createNetworkSimulator(page);

// Simulate offline mode
await simulator.simulateNetworkCondition(NETWORK_CONDITIONS.OFFLINE);

// Simulate slow 3G
await simulator.simulateNetworkCondition(NETWORK_CONDITIONS.SLOW_3G);

// Custom network conditions
await simulator.simulateNetworkCondition({
  offline: false,
  downloadThroughput: 100 * 1024, // 100 KB/s
  uploadThroughput: 50 * 1024,    // 50 KB/s
  latency: 1000 // 1s
});

// Add request interception with delays
const handler = await simulator.addRequestInterception('/api/**', {
  delayMs: 500,
  failureRate: 0.3
});

// Simulate API timeouts
await simulator.simulateAPITimeout('/api/gallery', {
  timeoutMs: 2000,
  maxRetries: 2
});

// Simulate intermittent connectivity
await simulator.simulateIntermittentConnectivity({
  intervalMs: 2000,
  duration: 10000,
  startOnline: true
});

// CRITICAL: Always cleanup to prevent memory leaks
await simulator.cleanup();
```

### Network Conditions

Available predefined network conditions:

- `NETWORK_CONDITIONS.OFFLINE` - No network connection
- `NETWORK_CONDITIONS.SLOW_3G` - 50 KB/s, 2s latency
- `NETWORK_CONDITIONS.FAST_3G` - 150 KB/s, 562.5ms latency  
- `NETWORK_CONDITIONS.FOUR_G` - 1.6 MB/s, 150ms latency
- `NETWORK_CONDITIONS.WIFI` - 10 MB/s, 10ms latency

### Best Practices

1. **Always use cleanup**: Call `await simulator.cleanup()` in test teardown
2. **Use try/finally blocks**: Ensure cleanup happens even if tests fail
3. **Test realistic scenarios**: Use predefined conditions that match real networks
4. **Validate resilience**: Test both success and failure paths
5. **Monitor resources**: Use `getNetworkStatus()` to verify state

### Example Test

```javascript
import { test, expect } from '@playwright/test';
import { createNetworkSimulator, NETWORK_CONDITIONS } from './helpers/network-simulation.js';

test('should handle slow network gracefully', async ({ page }) => {
  const simulator = createNetworkSimulator(page);
  
  try {
    // Apply slow network conditions
    await simulator.simulateNetworkCondition(NETWORK_CONDITIONS.SLOW_3G);
    
    // Test application behavior under slow conditions
    await page.goto('/pages/gallery.html');
    await expect(page.locator('h1')).toBeVisible({ timeout: 15000 });
    
    // Verify loading states are shown
    const loadingIndicator = page.locator('.loading');
    if (await loadingIndicator.isVisible()) {
      await expect(loadingIndicator).toBeHidden({ timeout: 20000 });
    }
  } finally {
    await simulator.cleanup();
  }
});
```

### Memory Leak Prevention

The helper includes comprehensive cleanup mechanisms:

- Removes all route handlers
- Clears event listeners
- Restores network conditions
- Closes CDP sessions
- Prevents operations after cleanup

### Error Handling

The helper gracefully handles:

- CDP session initialization failures
- Network condition application errors
- Cleanup errors (logs warnings)
- Operations after cleanup (throws errors)
- Unknown network conditions (throws errors)

This ensures robust testing even when network simulation encounters issues.
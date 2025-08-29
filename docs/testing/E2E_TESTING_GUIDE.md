# E2E Testing Guide

## Overview

This guide covers the end-to-end testing approach for A Lo Cubano Boulder Fest website, focusing on comprehensive user flow validation with simplified, maintainable tests.

## Testing Philosophy

### Core Principles

- **User-focused**: Tests mirror real user journeys
- **Production-like**: Tests use Turso database and real APIs
- **Comprehensive coverage**: 12 focused tests cover all critical flows
- **Simple implementation**: No abstractions, readable by any developer
- **Fast execution**: Complete suite runs in 2-5 minutes

## Test Suite Structure

### 12 Comprehensive E2E Tests

| Test File | Purpose | Key Scenarios |
|-----------|---------|---------------|
| admin-auth.test.js | Admin authentication | Login, session management, security |
| admin-dashboard.test.js | Admin panel & security | Dashboard access, data display, permissions |
| basic-navigation.test.js | Basic navigation | Page routing, menu functionality |
| cart-functionality.test.js | Cart operations | Add/remove items, persistence, checkout |
| gallery-basic.test.js | Gallery browsing | Image loading, navigation, performance |
| gallery-browsing.test.js | Gallery performance & API | Google Drive integration, lazy loading |
| mobile-registration-experience.test.js | Mobile registration flow | Touch interactions, responsive design |
| newsletter-simple.test.js | Newsletter subscription | Email validation, Brevo integration |
| payment-flow.test.js | Payment processing | Stripe integration, success handling |
| registration-flow.test.js | Registration process | Ticket registration, validation |
| ticket-validation.test.js | QR code validation | Ticket scanning, admin validation |
| user-engagement.test.js | User engagement metrics | Analytics, user interactions |

## Test Execution

### Commands

```bash
# Run all E2E tests
npm run test:e2e

# Run with UI (headed mode)
npm run test:e2e:ui

# Run specific test
npm run test:e2e -- tests/e2e/flows/payment-flow.test.js

# Debug mode
npm run test:e2e:debug
```

### Configuration

```javascript
// playwright-e2e-turso.config.js
export default {
  testDir: './tests/e2e/flows',
  timeout: 60000,
  retries: 1,
  workers: 3,
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 12'] }
    }
  ]
};
```

## Test Implementation Patterns

### Basic Test Structure

```javascript
// tests/e2e/flows/example.test.js
import { test, expect } from '@playwright/test';

test.describe('Example Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Setup: Navigate to starting page
    await page.goto('/');
  });

  test('should complete user journey', async ({ page }) => {
    // Act: Perform user actions
    await page.click('[data-testid="button"]');
    await page.fill('[name="email"]', 'test@example.com');
    
    // Assert: Verify expected outcomes
    await expect(page.locator('[data-testid="success"]')).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    // Cleanup: Remove test data if needed
    await cleanupTestData(page);
  });
});
```

### API Testing Pattern

```javascript
test('should process API request correctly', async ({ page }) => {
  // Listen for API calls
  const apiPromise = page.waitForResponse('/api/tickets/create');
  
  // Trigger API call through UI
  await page.click('[data-testid="purchase-ticket"]');
  
  // Verify API response
  const response = await apiPromise;
  expect(response.ok()).toBe(true);
  
  const data = await response.json();
  expect(data.success).toBe(true);
  expect(data.ticketId).toBeDefined();
});
```

### Mobile Testing Pattern

```javascript
test('should work on mobile devices', async ({ page }) => {
  // Set mobile viewport
  await page.setViewportSize({ width: 375, height: 667 });
  
  // Test mobile-specific interactions
  await page.tap('[data-testid="mobile-menu"]');
  await expect(page.locator('[data-testid="nav-menu"]')).toBeVisible();
  
  // Test touch gestures
  await page.locator('.gallery-container').swipe('left');
});
```

## Test Flow Details

### Admin Authentication (admin-auth.test.js)

**Purpose**: Validate admin login and session management

```javascript
test('admin can login with correct credentials', async ({ page }) => {
  await page.goto('/admin');
  
  await page.fill('[name="password"]', process.env.TEST_ADMIN_PASSWORD);
  await page.click('[type="submit"]');
  
  await expect(page).toHaveURL('/admin/dashboard');
  await expect(page.locator('[data-testid="admin-welcome"]')).toBeVisible();
});
```

### Payment Flow (payment-flow.test.js)

**Purpose**: Test complete ticket purchase journey

```javascript
test('complete ticket purchase flow', async ({ page }) => {
  await page.goto('/tickets');
  
  // Add ticket to cart
  await page.click('[data-testid="full-pass-add"]');
  
  // Verify cart
  await expect(page.locator('[data-testid="cart-count"]')).toHaveText('1');
  
  // Start checkout
  await page.click('[data-testid="checkout-btn"]');
  
  // Wait for Stripe redirect
  const stripePromise = page.waitForResponse('/api/payments/create-checkout-session');
  const response = await stripePromise;
  
  expect(response.ok()).toBe(true);
});
```

### Mobile Registration (mobile-registration-experience.test.js)

**Purpose**: Validate mobile-optimized registration process

```javascript
test('mobile registration flow works correctly', async ({ page }) => {
  // Use mobile viewport
  await page.setViewportSize({ width: 375, height: 667 });
  
  await page.goto('/registration/abc123');
  
  // Test mobile form interactions
  await page.tap('[name="name"]');
  await page.fill('[name="name"]', 'Test User');
  
  // Test mobile keyboard behavior
  await page.tap('[name="email"]');
  await expect(page.locator('[name="email"]')).toHaveAttribute('inputmode', 'email');
  
  await page.fill('[name="email"]', 'test@example.com');
  await page.tap('[type="submit"]');
  
  await expect(page.locator('[data-testid="success"]')).toBeVisible();
});
```

### Gallery Performance (gallery-browsing.test.js)

**Purpose**: Test gallery functionality and performance

```javascript
test('gallery loads images efficiently', async ({ page }) => {
  await page.goto('/gallery');
  
  // Wait for initial load
  await expect(page.locator('[data-testid="gallery-container"]')).toBeVisible();
  
  // Test lazy loading
  const imagePromise = page.waitForResponse(response =>
    response.url().includes('drive.google.com') && response.ok()
  );
  
  // Scroll to trigger lazy loading
  await page.evaluate(() => {
    window.scrollTo(0, 1000);
  });
  
  await imagePromise;
  
  // Verify images are loaded
  const images = page.locator('[data-testid="gallery-image"]');
  await expect(images.first()).toBeVisible();
});
```

## Database Testing Strategy

### Test Database Setup

E2E tests use the production Turso database with test data cleanup:

```javascript
// Global setup
export default async function globalSetup() {
  // Ensure test database is properly configured
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  });
  
  // Verify connection
  await client.execute('SELECT 1');
  
  console.log('E2E database setup complete');
}
```

### Test Data Management

```javascript
// Helper for test data cleanup
export async function cleanupTestData() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  });
  
  // Clean up test records
  await client.execute(`
    DELETE FROM registrations 
    WHERE email LIKE '%@test.example' OR email LIKE '%@playwright.test'
  `);
  
  await client.execute(`
    DELETE FROM tickets 
    WHERE id LIKE 'test-%' OR id LIKE 'playwright-%'
  `);
  
  await client.execute(`
    DELETE FROM purchases 
    WHERE email LIKE '%@test.example' OR email LIKE '%@playwright.test'
  `);
}
```

## Environment Setup

### Prerequisites

```bash
# Required environment variables
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-token
TEST_ADMIN_PASSWORD=plain-text-password-for-testing
```

### Test Environment Validation

```bash
# Verify E2E setup
npm run test:e2e:validate
```

## Debugging E2E Tests

### Visual Debugging

```bash
# Run tests in headed mode with UI
npm run test:e2e:ui

# Run specific test with debugging
npx playwright test tests/e2e/flows/payment-flow.test.js --debug
```

### Debug Information

```javascript
test('debug example', async ({ page }) => {
  // Enable console logging
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
  // Take screenshot on failure
  await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });
  
  // Get page state
  const content = await page.content();
  console.log('Page HTML length:', content.length);
});
```

### Common Debugging Techniques

1. **Screenshots**: Capture page state at failure points
2. **Console logs**: Monitor browser console output
3. **Network logs**: Track API requests and responses
4. **Page content**: Dump HTML for inspection
5. **Trace viewer**: Use Playwright trace viewer for detailed analysis

## Performance Testing

### Performance Metrics

```javascript
test('page load performance', async ({ page }) => {
  const startTime = Date.now();
  
  await page.goto('/tickets');
  await page.waitForLoadState('networkidle');
  
  const loadTime = Date.now() - startTime;
  
  // Assert performance threshold
  expect(loadTime).toBeLessThan(3000); // 3 second threshold
});
```

### Resource Monitoring

```javascript
test('monitor resource usage', async ({ page }) => {
  const resources = [];
  
  page.on('response', response => {
    resources.push({
      url: response.url(),
      status: response.status(),
      size: response.headers()['content-length']
    });
  });
  
  await page.goto('/gallery');
  
  // Verify no broken resources
  const failedResources = resources.filter(r => r.status >= 400);
  expect(failedResources).toHaveLength(0);
});
```

## Cross-Browser Testing

### Browser Configuration

Tests run on multiple browsers:

- **Chromium**: Primary development browser
- **Firefox**: Gecko engine compatibility
- **WebKit**: Safari compatibility
- **Mobile Chrome**: Mobile experience validation

### Browser-Specific Tests

```javascript
test('browser compatibility', async ({ page, browserName }) => {
  await page.goto('/tickets');
  
  if (browserName === 'webkit') {
    // Safari-specific validations
    await expect(page.locator('[data-testid="apple-pay"]')).toBeVisible();
  }
  
  if (browserName === 'chromium') {
    // Chrome-specific features
    await expect(page.locator('[data-testid="google-pay"]')).toBeVisible();
  }
});
```

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/e2e-tests.yml
- name: Run E2E tests
  run: npm run test:e2e
  env:
    TURSO_DATABASE_URL: ${{ secrets.TURSO_DATABASE_URL }}
    TURSO_AUTH_TOKEN: ${{ secrets.TURSO_AUTH_TOKEN }}
    TEST_ADMIN_PASSWORD: ${{ secrets.TEST_ADMIN_PASSWORD }}
```

### Quality Gates

E2E tests are required to pass before:

- **Merging PRs**: All tests must pass
- **Production deployment**: Full E2E validation
- **Release creation**: Comprehensive test coverage

## Troubleshooting

### Common Issues

#### Test Timeouts

```javascript
// Increase timeout for slow operations
test('slow operation', async ({ page }) => {
  test.setTimeout(120000); // 2 minutes
  
  await page.goto('/slow-page');
  await page.waitForSelector('[data-testid="loaded"]', { timeout: 60000 });
});
```

#### Flaky Tests

```javascript
// Add retry logic for flaky operations
test('potentially flaky test', async ({ page }) => {
  await page.goto('/');
  
  // Retry mechanism
  for (let i = 0; i < 3; i++) {
    try {
      await page.click('[data-testid="button"]', { timeout: 5000 });
      break;
    } catch (error) {
      if (i === 2) throw error;
      await page.waitForTimeout(1000);
    }
  }
});
```

#### Database Connection Issues

```javascript
// Test database connectivity
test.beforeAll(async () => {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  });
  
  try {
    await client.execute('SELECT 1');
  } catch (error) {
    throw new Error(`Database connection failed: ${error.message}`);
  }
});
```

## Best Practices

### Test Organization

1. **One flow per file**: Each test file covers one user journey
2. **Clear naming**: Test names describe user actions and expected outcomes
3. **Logical grouping**: Related tests grouped with `describe` blocks
4. **Proper cleanup**: Remove test data after each test

### Assertions

1. **User-visible elements**: Test what users actually see
2. **Meaningful waits**: Wait for specific conditions, not arbitrary timeouts
3. **Error states**: Test both success and failure scenarios
4. **Accessibility**: Include accessibility checks in tests

### Maintenance

1. **Regular updates**: Keep tests aligned with feature changes
2. **Performance monitoring**: Track test execution times
3. **Failure analysis**: Investigate and fix flaky tests quickly
4. **Documentation**: Keep this guide updated with changes

## Conclusion

The E2E testing strategy provides comprehensive coverage of user journeys while maintaining simplicity and reliability. The 12 focused tests cover all critical functionality with minimal maintenance overhead, ensuring high confidence in production deployments.
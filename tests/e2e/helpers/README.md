# E2E Test Helpers

This directory contains reusable helper utilities for end-to-end testing with Playwright.

## Google Drive Mock (`google-drive-mock.js`)

Provides comprehensive mocking for gallery and Google Drive API interactions.

### Basic Usage

```javascript
import { test } from '@playwright/test';
import createGalleryMock, { GoogleDriveMockGenerator } from './helpers/google-drive-mock.js';

test('gallery loads with mock data', async ({ page }) => {
  const galleryMock = createGalleryMock(page);
  
  // Mock successful gallery response
  await galleryMock.mockGalleryAPI('success', {
    year: 2025,
    imageCount: 50,
    videoCount: 10
  });
  
  await page.goto('/gallery');
  // Test gallery functionality...
});
```

### Features

- **Realistic test data generation** with configurable parameters
- **Multiple API response scenarios** (success, error, slow network, rate limiting)
- **Image and video metadata** with EXIF data simulation
- **Performance testing utilities** for large galleries
- **Featured photos selection** with category prioritization
- **Paginated response support** for testing infinite scroll

### Available Scenarios

- `success` - Normal successful response
- `slow` - Simulates slow network (5s delay by default)
- `error` - Server error response
- `rate-limited` - Rate limiting response
- `empty` - Empty gallery response
- `partial-failure` - Some categories load, others fail

### Classes

- `GoogleDriveMockGenerator` - Generates mock gallery data
- `APIResponseScenarios` - Predefined response patterns
- `GalleryMockHelper` - Page-level mocking utilities
- `GalleryPerformanceMock` - Performance testing utilities

## Admin Authentication (`admin-auth.js`)

Provides comprehensive admin authentication and security testing utilities.

### Basic Usage

```javascript
import { test } from '@playwright/test';
import createAdminAuth, { SecurityTestHelper } from './helpers/admin-auth.js';

test('admin can login successfully', async ({ page }) => {
  const adminAuth = createAdminAuth(page);
  
  // Login with default credentials
  await adminAuth.login();
  
  // Verify access to admin dashboard
  await page.goto('/admin/dashboard');
  // Test admin functionality...
});

test('admin login with MFA', async ({ page }) => {
  const adminAuth = createAdminAuth(page);
  
  // Login with MFA code
  await adminAuth.login({
    password: 'admin-password',
    mfaCode: '123456',
    expectMfa: true
  });
});
```

### Features

- **Full login flow support** including MFA (Multi-Factor Authentication)
- **Session management** with JWT token handling
- **Security testing utilities** for rate limiting, brute force protection
- **Mock authentication states** for testing without real login
- **Session persistence testing** across page reloads
- **CSRF and origin protection testing**

### Security Tests

```javascript
import { SecurityTestHelper } from './helpers/admin-auth.js';

test('rate limiting protects against brute force', async ({ page }) => {
  const security = new SecurityTestHelper(page);
  
  const result = await security.testRateLimiting(5);
  expect(result.wasRateLimited).toBe(true);
  expect(result.rateLimitTriggeredAt).toBeLessThanOrEqual(5);
});

test('session security is properly enforced', async ({ page }) => {
  const security = new SecurityTestHelper(page);
  
  const result = await security.testSessionSecurity();
  expect(result.validSession.isValid).toBe(true);
  expect(result.expiredSession.redirectedToLogin).toBe(true);
});
```

### Classes

- `AdminAuthHelper` - Main authentication utilities
- `SecurityTestHelper` - Security testing utilities
- `JWTTestHelper` - JWT token manipulation
- `SessionTestHelper` - Session management testing

## Integration with Existing Tests

These helpers are designed to integrate seamlessly with the existing test infrastructure:

```javascript
// Example: Using both helpers together
test('admin can manage gallery with proper authentication', async ({ page }) => {
  const adminAuth = createAdminAuth(page);
  const galleryMock = createGalleryMock(page);
  
  // Setup authentication
  await adminAuth.login();
  
  // Setup gallery mock data
  await galleryMock.mockGalleryAPI('success', { imageCount: 100 });
  
  // Navigate to admin gallery management
  await page.goto('/admin/gallery');
  
  // Test admin gallery functionality
  // ...
});
```

## Environment Variables

Both helpers respect these environment variables:

```bash
# Admin Authentication
TEST_ADMIN_PASSWORD=your-test-admin-password
ADMIN_SECRET=your-32-character-admin-secret-key

# Testing Configuration
E2E_TEST_MODE=true
ENVIRONMENT=e2e-test
```

## Error Handling

Both helpers include comprehensive error handling:

- Network timeouts and failures
- Authentication failures with detailed error messages
- Mock data generation errors
- Session management edge cases

## Best Practices

1. **Use realistic test data** - The helpers generate realistic metadata and file structures
2. **Test error scenarios** - Don't just test happy paths
3. **Clean up after tests** - Both helpers include cleanup methods
4. **Isolate tests** - Each test should use fresh mock data and authentication
5. **Test security features** - Use the security testing utilities regularly

## Performance Considerations

- Gallery mocks can generate large datasets - use appropriate limits for your tests
- Authentication helpers cache session tokens to reduce overhead
- Mock responses support configurable delays for network simulation
- Large gallery tests should use the performance testing utilities
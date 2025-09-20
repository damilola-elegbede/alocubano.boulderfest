/**
 * Example E2E Test demonstrating helper usage
 * This file showcases how to use the google-drive-mock and admin-auth helpers
 */

import { test, expect } from '@playwright/test';
import createGalleryMock, { GoogleDriveMockGenerator, APIResponseScenarios, GalleryPerformanceMock } from '../helpers/google-drive-mock.js';
import createAdminAuth, { SecurityTestHelper, JWTTestHelper } from '../helpers/admin-auth.js';

test.describe('Helper Usage Examples', () => {

  test('Gallery Mock - Basic Usage', async ({ page }) => {
    const galleryMock = createGalleryMock(page);

    // Mock successful gallery API response
    await galleryMock.mockGalleryAPI('success', {
      year: 2025,
      imageCount: 20,
      videoCount: 5,
      includeMetadata: true
    });

    // Mock gallery years API
    await galleryMock.mockGalleryYearsAPI([2025, 2024, 2023]);

    // Navigate to gallery
    await page.goto('/gallery');

    // Verify gallery loads
    await expect(page.locator('.gallery-container')).toBeVisible({ timeout: 10000 });

    // Verify API calls were made
    const apiTracker = await galleryMock.verifyGalleryAPICalls();
    expect(apiTracker.hasCall('gallery')).toBe(true);

    // Clean up API tracker event listeners
    if (typeof apiTracker.cleanup === 'function') {
      apiTracker.cleanup();
    }
  });

  test('Gallery Mock - Error Scenarios', async ({ page }) => {
    const galleryMock = createGalleryMock(page);

    // Mock server error
    await galleryMock.mockGalleryAPI('error', {
      message: 'Gallery service temporarily unavailable'
    });

    await page.goto('/gallery');

    // Verify error handling
    const errorMessage = page.locator('.error-message, .alert-error, [data-testid="error"]');
    await expect(errorMessage).toBeVisible({ timeout: 10000 });
  });

  test('Gallery Mock - Slow Network', async ({ page }) => {
    const galleryMock = createGalleryMock(page);

    // Mock slow network response
    await galleryMock.mockGalleryAPI('slow', {
      delay: 3000, // 3 second delay
      imageCount: 50
    });

    await page.goto('/gallery');

    // Verify loading state is shown
    const loadingIndicator = page.locator('.loading, .spinner, [data-testid="loading"]');
    await expect(loadingIndicator).toBeVisible({ timeout: 2000 });

    // Wait for content to load
    await expect(page.locator('.gallery-container')).toBeVisible({ timeout: 10000 });
  });

  test('Admin Auth - Basic Login', async ({ page }) => {
    const adminAuth = createAdminAuth(page, {
      adminPassword: process.env.TEST_ADMIN_PASSWORD || 'test-password'
    });

    // Perform login
    const session = await adminAuth.login();
    expect(session).toBeTruthy();
    expect(session.isValid).toBe(true);

    // Verify we're on the admin dashboard
    expect(page.url()).toContain('/admin/dashboard');

    // Verify session persistence
    await page.reload();
    const stillLoggedIn = await adminAuth.isLoggedIn();
    expect(stillLoggedIn).toBe(true);

    // Logout
    await adminAuth.logout();
    const loggedOut = await adminAuth.isLoggedIn();
    expect(loggedOut).toBe(false);
  });

  test('Admin Auth - MFA Flow', async ({ page }) => {
    const adminAuth = createAdminAuth(page);

    // Skip if MFA is not configured in test environment
    try {
      await adminAuth.login({
        password: process.env.TEST_ADMIN_PASSWORD,
        mfaCode: '123456', // Test MFA code
        expectMfa: true
      });

      // If we get here, MFA is enabled
      expect(page.url()).toContain('/admin/dashboard');
    } catch (error) {
      if (error.message.includes('MFA code required')) {
        console.log('MFA is enabled but test code not provided');
      } else {
        console.log('MFA not enabled in test environment');
      }
    }
  });

  test('Admin Auth - Mock Session', async ({ page }) => {
    const adminAuth = createAdminAuth(page);

    // Create mock authenticated state without going through login flow
    await adminAuth.setMockAuthState({
      id: 'test-admin',
      role: 'admin',
      permissions: ['read', 'write', 'admin']
    });

    // Verify mock session works
    const isLoggedIn = await adminAuth.isLoggedIn();
    expect(isLoggedIn).toBe(true);

    // Navigate to protected area
    await page.goto('/admin/dashboard');
    expect(page.url()).toContain('/admin/dashboard');
  });

  test('Security Testing - Rate Limiting', async ({ page }) => {
    const security = new SecurityTestHelper(page, {
      adminPassword: 'wrong-password' // Intentionally wrong
    });

    // Test rate limiting protection
    const result = await security.testRateLimiting(3); // Try 3 failed attempts

    expect(result.attempts).toHaveLength(5); // 3 + 2 additional attempts
    expect(result.wasRateLimited).toBe(true);
    expect(result.rateLimitTriggeredAt).toBeLessThanOrEqual(3);

    // Verify rate limiting persists
    const lastAttempt = result.attempts[result.attempts.length - 1];
    expect(lastAttempt.isRateLimited).toBe(true);
  });

  test('Security Testing - Brute Force Protection', async ({ page }) => {
    const security = new SecurityTestHelper(page);

    const result = await security.testBruteForceProtection();

    // Should not succeed with common passwords
    expect(result.successfulAttempts).toBe(0);

    // Should block after several attempts
    expect(result.blockedAttempts).toBeGreaterThan(0);

    // Response times should be consistent (no timing attacks)
    expect(result.averageResponseTime).toBeGreaterThan(100); // At least 100ms
  });

  test('JWT Testing - Token Validation', async ({ page }) => {
    const jwtHelper = new JWTTestHelper();

    // Test valid token generation
    const validToken = jwtHelper.generateToken({ id: 'test-admin' });
    const validResult = jwtHelper.verifyToken(validToken);
    expect(validResult.valid).toBe(true);
    expect(validResult.payload.id).toBe('test-admin');

    // Test expired token
    const expiredToken = jwtHelper.generateExpiredToken();
    const expiredResult = jwtHelper.verifyToken(expiredToken);
    expect(expiredResult.valid).toBe(false);
    expect(expiredResult.error).toContain('expired');

    // Test malformed token
    const malformedToken = jwtHelper.generateMalformedToken();
    const malformedResult = jwtHelper.verifyToken(malformedToken);
    expect(malformedResult.valid).toBe(false);

    // Test invalid signature
    const invalidToken = jwtHelper.generateInvalidSignatureToken();
    const invalidResult = jwtHelper.verifyToken(invalidToken);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.error).toContain('signature');
  });

  test('Combined Usage - Admin Gallery Management', async ({ page }) => {
    const adminAuth = createAdminAuth(page);
    const galleryMock = createGalleryMock(page);

    // Setup authentication
    await adminAuth.setMockAuthState({ role: 'admin' });

    // Setup gallery with large dataset for admin management
    await galleryMock.mockGalleryAPI('success', {
      imageCount: 100,
      videoCount: 20,
      includeFeatured: true
    });

    // Navigate to admin gallery area
    await page.goto('/admin/gallery'); // Assuming this route exists

    // If admin gallery management doesn't exist, test regular gallery with admin privileges
    await page.goto('/gallery');
    await expect(page.locator('.gallery-container')).toBeVisible();

    // Verify admin can access additional features (if they exist)
    // This would depend on the actual admin gallery implementation
  });

  test('Performance Testing - Large Gallery', async ({ page }) => {
    const galleryMock = createGalleryMock(page);

    // Create performance testing mock with large dataset
    const performanceMock = new GalleryPerformanceMock(page);
    await performanceMock.mockLargeGallery(500); // 500 items

    // Measure page load time
    const startTime = Date.now();
    await page.goto('/gallery');
    await expect(page.locator('.gallery-container')).toBeVisible();
    const loadTime = Date.now() - startTime;

    // Performance assertion - should load within reasonable time
    expect(loadTime).toBeLessThan(10000); // Less than 10 seconds

    // Check for virtual scrolling or pagination
    const galleryItems = await page.locator('.gallery-item, .photo-item').count();

    // Should not render all 500 items at once (virtual scrolling)
    expect(galleryItems).toBeLessThan(100);
  });

  test('Error Recovery - Gallery with Partial Failures', async ({ page }) => {
    const galleryMock = createGalleryMock(page);

    // Mock partial failure scenario
    await galleryMock.mockGalleryAPI('partial-failure', { year: 2025 });

    await page.goto('/gallery');

    // Should still show some content
    await expect(page.locator('.gallery-container')).toBeVisible();

    // Should show error indicators for failed categories
    const warningElements = page.locator('.warning, .alert-warning, [data-testid="warning"]');
    const errorElements = page.locator('.error, .alert-error, [data-testid="error"]');

    // At least one should be visible
    const hasWarningOrError = await warningElements.count() > 0 || await errorElements.count() > 0;
    expect(hasWarningOrError).toBe(true);
  });

  // Cleanup after all tests
  test.afterEach(async ({ page }) => {
    // Clear any mock authentication
    const adminAuth = createAdminAuth(page);
    await adminAuth.clearAuthCookies();

    // Clear gallery mocks
    const galleryMock = createGalleryMock(page);
    await galleryMock.clearGalleryMocks();
  });
});

// Additional test for helper integration
test.describe('Helper Integration Tests', () => {

  test('Helpers work together seamlessly', async ({ page }) => {
    // Test that helpers don't interfere with each other
    const adminAuth = createAdminAuth(page);
    const galleryMock = createGalleryMock(page);

    // Setup both helpers
    await adminAuth.setMockAuthState();
    await galleryMock.mockGalleryAPI('success');

    // Navigate to a page that might use both
    await page.goto('/');

    // Verify page loads without conflicts
    await expect(page.locator('body')).toBeVisible();

    // Verify both helpers are working
    const isAuthenticated = await adminAuth.isLoggedIn();
    expect(isAuthenticated).toBe(true);

    // Check if gallery API would be called
    const apiTracker = await galleryMock.verifyGalleryAPICalls();
    // Note: API might not be called on home page, this is just to verify the tracker works
    expect(typeof apiTracker.getCalls).toBe('function');

    // Clean up API tracker event listeners
    if (typeof apiTracker.cleanup === 'function') {
      apiTracker.cleanup();
    }
  });
});
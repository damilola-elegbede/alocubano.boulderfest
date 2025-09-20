/**
 * Service Detection Demo - Example usage of service detection helper
 *
 * This demonstrates how to use the service detection helper for graceful
 * degradation in E2E tests when services are unavailable.
 */

import { test, expect } from '@playwright/test';
import { detectAvailableServices, shouldRunTest } from '../helpers/service-detection.js';

test.describe('Service Detection Demo', () => {
  let availableServices = {};

  test.beforeAll(async ({ page }) => {
    console.log('🔍 Demo: Detecting available services...');
    availableServices = await detectAvailableServices(page);
    console.log('📊 Demo: Available services detected:', availableServices);
  });

  test('should detect Google Drive API availability', async ({ page }) => {
    console.log('🧪 Testing Google Drive service detection...');

    if (availableServices.googleDrive) {
      console.log('✅ Google Drive API is available - running full Google Drive tests');

      // When Google Drive is available, we can test real functionality
      const response = await page.request.get('/api/gallery?eventId=boulder-fest-2025');
      expect(response.ok()).toBe(true);

      const data = await response.json();
      console.log('📊 Gallery API returned:', {
        hasItems: !!data.items,
        itemCount: data.items?.length || 0
      });
    } else {
      console.log('📍 Google Drive API not available - using fallback behavior');

      // When Google Drive is not available, we test graceful degradation
      console.log('✅ Test passes with graceful degradation');
    }
  });

  test('should detect admin auth availability', async ({ page }) => {
    console.log('🧪 Testing admin auth service detection...');

    if (availableServices.adminAuth) {
      console.log('✅ Admin auth is available - can test admin functionality');

      // Test that admin endpoint is reachable
      const response = await page.request.post('/api/admin/login', {
        data: { password: 'test' }
      });
      // Should get a response (even if unauthorized)
      expect([200, 401, 400]).toContain(response.status());
    } else {
      console.log('📍 Admin auth not available - skipping admin tests');
    }
  });

  test('should detect database health', async ({ page }) => {
    console.log('🧪 Testing database health detection...');

    if (availableServices.database) {
      console.log('✅ Database is healthy - can run database tests');

      // Test database health endpoint
      const response = await page.request.get('/api/health/database');
      expect(response.ok()).toBe(true);
    } else {
      console.log('📍 Database not healthy - would skip database tests');
    }
  });

  test('should conditionally run tests based on service availability', async ({ page }) => {
    console.log('🧪 Demo: Conditional test execution...');

    // Example: Test that requires Google Drive AND admin auth
    const requiredServices = {
      googleDrive: true,
      adminAuth: true
    };

    const canRunTest = shouldRunTest(requiredServices, availableServices);

    if (canRunTest) {
      console.log('✅ All required services available - running full test');
      // Run full test logic here
    } else {
      console.log('📍 Some required services unavailable - test would be skipped');

      // Use test.skip() in real scenarios:
      // test.skip(!canRunTest, 'Required services not available');
    }

    // Example: Test that requires NO Google Drive (negative test)
    const negativeRequiredServices = {
      googleDrive: false  // Test runs only when Google Drive is NOT available
    };

    const canRunNegativeTest = shouldRunTest(negativeRequiredServices, availableServices);
    console.log('📊 Negative test (no Google Drive required):', {
      canRun: canRunNegativeTest,
      googleDriveAvailable: availableServices.googleDrive
    });
  });

  test('should demonstrate service detection caching', async ({ page }) => {
    console.log('🧪 Demo: Testing service detection caching...');

    // First call - should detect services
    const startTime = Date.now();
    const services1 = await detectAvailableServices(page);
    const firstCallTime = Date.now() - startTime;

    // Second call - should use cache
    const cacheStartTime = Date.now();
    const services2 = await detectAvailableServices(page);
    const secondCallTime = Date.now() - cacheStartTime;

    console.log('📊 Performance comparison:', {
      firstCall: `${firstCallTime}ms`,
      secondCall: `${secondCallTime}ms`,
      cacheWorking: secondCallTime < firstCallTime
    });

    // Results should be identical
    expect(services1).toEqual(services2);

    // Second call should be much faster (cached)
    expect(secondCallTime).toBeLessThan(firstCallTime);
  });
});
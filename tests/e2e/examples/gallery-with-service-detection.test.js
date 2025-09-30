/**
 * Gallery with Service Detection - Example integration
 *
 * This shows how to integrate the service detection helper into gallery tests
 * for graceful degradation when Google Drive API is not available.
 */

import { test, expect } from '@playwright/test';
import { detectAvailableServices, shouldRunTest } from '../helpers/service-detection.js';

test.describe('Gallery with Service Detection', () => {
  let availableServices = {};

  test.beforeAll(async ({ page }) => {
    console.log('🔍 Detecting available services for gallery tests...');
    availableServices = await detectAvailableServices(page);
    console.log('📊 Available services:', availableServices);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/boulder-fest-2025/gallery');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should load gallery page with appropriate content based on available services', async ({ page }) => {
    console.log('🔍 Testing gallery page with service-aware content loading...');

    // Wait for content to load
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Check for dynamic gallery content
    const dynamicGallery = page.locator('.gallery-detail-grid, .gallery-item');
    const dynamicCount = await dynamicGallery.count();

    console.log('📊 Gallery content analysis:', {
      dynamicCount,
      googleDriveAvailable: availableServices.googleDrive
    });

    // Always expect some dynamic content
    expect(dynamicCount).toBeGreaterThan(0);

    if (availableServices.googleDrive) {
      console.log('✅ Google Drive available - testing real Google Drive integration');

      // When Google Drive is available, expect Google Drive images
      const googleImages = page.locator('img[src*="googleusercontent.com"], img[src*="drive.google.com"]');
      const googleImageCount = await googleImages.count();

      if (googleImageCount > 0) {
        console.log('✅ Found Google Drive images:', googleImageCount);

        // Verify first Google Drive image
        const firstGoogleImage = googleImages.first();
        await expect(firstGoogleImage).toBeVisible();

        const imageSrc = await firstGoogleImage.getAttribute('src');
        expect(imageSrc).toMatch(/googleusercontent\.com|drive\.google\.com/);
      } else {
        console.log('📍 Google Drive available but images may still be loading');
      }
    } else {
      console.log('📍 Google Drive not available - testing fallback behavior');

      // When Google Drive is not available, we still expect content
      // but we're more lenient about the source
      expect(dynamicCount).toBeGreaterThan(0);
    }
  });

  test('should validate Google Drive API integration only when available', async ({ page }) => {
    // This test only runs when Google Drive is available
    test.skip(!availableServices.googleDrive, 'Skipping: Google Drive API not available in this environment');

    console.log('🔍 Testing Google Drive API integration (service available)...');

    // Monitor network requests for Google Drive API calls
    const apiRequests = [];
    page.on('request', request => {
      if (request.url().includes('/api/gallery') || request.url().includes('googleapis.com')) {
        apiRequests.push({
          url: request.url(),
          method: request.method()
        });
      }
    });

    await page.reload();
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Verify API calls were made
    const galleryApiCalls = apiRequests.filter(req => req.url.includes('/api/gallery'));
    expect(galleryApiCalls.length).toBeGreaterThan(0);

    // Verify Google Drive content is loaded
    const googleImages = page.locator('img[src*="googleusercontent.com"], img[src*="drive.google.com"]');
    const googleImageCount = await googleImages.count();
    expect(googleImageCount).toBeGreaterThan(0);

    console.log('✅ Google Drive API integration validated:', {
      galleryApiCalls: galleryApiCalls.length,
      googleImages: googleImageCount
    });
  });

  test('should handle graceful degradation when Google Drive unavailable', async ({ page }) => {
    // This test only runs when Google Drive is NOT available
    test.skip(availableServices.googleDrive, 'Skipping: Google Drive is available (testing degradation)');

    console.log('🔍 Testing graceful degradation (Google Drive unavailable)...');

    await page.reload();
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Even without Google Drive, the page should work
    const dynamicContent = await page.locator('.gallery-detail-grid, .gallery-item').count();
    expect(dynamicContent).toBeGreaterThan(0);

    // Page should not show error messages
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('Error');
    expect(bodyText).not.toContain('Failed');
    expect(bodyText.length).toBeGreaterThan(100);

    console.log('✅ Graceful degradation working:', {
      dynamicContent,
      pageLength: bodyText.length
    });
  });

  test('should handle image lazy loading with service awareness', async ({ page }) => {
    console.log('🔍 Testing lazy loading with service awareness...');

    // Scroll to trigger lazy loading
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(1000);

    const images = page.locator('img[src], .gallery-item img');
    const imageCount = await images.count();

    if (imageCount > 0) {
      await expect(images.first()).toBeVisible();

      if (availableServices.googleDrive) {
        console.log('✅ Lazy loading with Google Drive images');

        // With Google Drive, we might see Google Drive URLs
        const googleImages = page.locator('img[src*="googleusercontent.com"], img[src*="drive.google.com"]');
        const googleImageCount = await googleImages.count();

        console.log('📊 Google Drive images after lazy loading:', googleImageCount);
      } else {
        console.log('✅ Lazy loading with fallback content');
      }
    }

    console.log('📊 Lazy loading result:', {
      totalImages: imageCount,
      googleDriveAvailable: availableServices.googleDrive
    });
  });

  test('should provide appropriate mobile experience based on services', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    const dynamicContent = await page.locator('.gallery-detail-grid, .gallery-item').count();
    expect(dynamicContent).toBeGreaterThan(0);

    if (availableServices.googleDrive) {
      console.log('✅ Mobile experience with Google Drive integration');

      // With Google Drive, expect responsive Google Drive images
      const googleImages = page.locator('img[src*="googleusercontent.com"], img[src*="drive.google.com"]');
      const googleImageCount = await googleImages.count();

      console.log('📊 Mobile Google Drive images:', googleImageCount);
    } else {
      console.log('✅ Mobile experience with fallback content');

      // Ensure basic gallery structure exists
      const galleryContainers = page.locator('#workshops-section, #socials-section');
      const containerCount = await galleryContainers.count();

      if (containerCount > 0) {
        const bodyText = await page.locator('body').textContent();
        expect(bodyText.includes('WORKSHOPS') || bodyText.includes('SOCIALS')).toBeTruthy();
      }
    }

    console.log('📊 Mobile experience result:', {
      dynamicContent,
      googleDriveAvailable: availableServices.googleDrive
    });
  });

  test('should run comprehensive tests only when all services available', async ({ page }) => {
    // This test runs only when multiple services are available
    const requiredServices = {
      googleDrive: true,
      database: true,
      debugEndpoints: true
    };

    const canRunTest = shouldRunTest(requiredServices, availableServices);
    test.skip(!canRunTest, 'Skipping: Required services not available for comprehensive test');

    console.log('🔍 Running comprehensive test (all services available)...');

    // Comprehensive test logic here
    await page.reload();
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Test multiple aspects when all services are available
    const dynamicContent = await page.locator('.gallery-detail-grid, .gallery-item').count();
    expect(dynamicContent).toBeGreaterThan(0);

    const googleImages = page.locator('img[src*="googleusercontent.com"], img[src*="drive.google.com"]');
    const googleImageCount = await googleImages.count();
    expect(googleImageCount).toBeGreaterThan(0);

    // Test database health
    const dbResponse = await page.request.get('/api/health/database');
    expect(dbResponse.ok()).toBe(true);

    console.log('✅ Comprehensive test completed:', {
      dynamicContent,
      googleImages: googleImageCount,
      databaseHealthy: true
    });
  });
});
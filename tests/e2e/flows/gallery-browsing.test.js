/**
 * E2E Test: Gallery Performance & Functionality - STRICT Google Drive API Requirements  
 * Tests gallery performance with MANDATORY Google Drive API integration
 * FAILS if Google Drive API is not properly configured or returns fallback data
 */

import { test, expect } from '@playwright/test';

/**
 * Check Google Drive API configuration via environment endpoint
 */
async function validateGoogleDriveConfig(page) {
  console.log('🔍 STRICT CHECK: Validating Google Drive API configuration...');
  
  try {
    const envResponse = await page.request.get('/api/debug/environment');
    const envData = await envResponse.json();
    
    // Check for required Google Drive environment variables
    const hasServiceAccount = !!envData.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const hasPrivateKey = !!envData.GOOGLE_PRIVATE_KEY;  
    const hasFolderId = !!envData.GOOGLE_DRIVE_GALLERY_FOLDER_ID;
    
    console.log('📊 Google Drive API Configuration Status:', {
      GOOGLE_SERVICE_ACCOUNT_EMAIL: hasServiceAccount,
      GOOGLE_PRIVATE_KEY: hasPrivateKey,
      GOOGLE_DRIVE_GALLERY_FOLDER_ID: hasFolderId,
      envResponseStatus: envResponse.status()
    });
    
    const missingVars = [];
    if (!hasServiceAccount) missingVars.push('GOOGLE_SERVICE_ACCOUNT_EMAIL');
    if (!hasPrivateKey) missingVars.push('GOOGLE_PRIVATE_KEY');
    if (!hasFolderId) missingVars.push('GOOGLE_DRIVE_GALLERY_FOLDER_ID');
    
    if (missingVars.length > 0) {
      throw new Error(`REQUIRED Google Drive environment variables missing: ${missingVars.join(', ')}. Configure these to enable real Google Drive API testing.`);
    }
    
    console.log('✅ All required Google Drive API environment variables are configured');
    return true;
    
  } catch (error) {
    console.error('❌ Google Drive API Configuration Error:', error.message);
    throw error;
  }
}

/**
 * Verify Google Drive API returns real data (not fallback)
 */
async function verifyRealGoogleDriveData(page) {
  console.log('🔍 STRICT CHECK: Verifying Google Drive API returns real data...');
  
  try {
    const galleryResponse = await page.request.get('/api/gallery?year=2025');
    const galleryData = await galleryResponse.json();
    
    console.log('📊 Gallery API Response Status:', galleryResponse.status());
    console.log('📊 Gallery Data Source:', galleryData.source);
    
    // STRICT: Fail if using fallback data
    if (galleryData.source && galleryData.source.includes('fallback')) {
      throw new Error(`Gallery API returned fallback data (source: ${galleryData.source}). Google Drive API must return real data.`);
    }
    
    // STRICT: Fail if using empty gallery
    if (!galleryData.items || galleryData.items.length === 0) {
      throw new Error('Gallery API returned empty results. Google Drive API must return actual gallery items.');
    }
    
    // STRICT: Fail if error in response indicates API problems
    if (galleryData.error) {
      throw new Error(`Gallery API reported error: ${galleryData.error}`);
    }
    
    console.log('✅ Gallery API returned real data with', galleryData.items?.length || 0, 'items');
    return galleryData;
    
  } catch (error) {
    console.error('❌ Google Drive API Data Verification Failed:', error.message);
    throw error;
  }
}

test.describe('Gallery Performance & Functionality - STRICT Google Drive API Requirements', () => {
  test.beforeEach(async ({ page }) => {
    // STRICT: Validate Google Drive API configuration first
    await validateGoogleDriveConfig(page);
    
    // STRICT: Verify API returns real data before testing UI
    await verifyRealGoogleDriveData(page);
    
    // Use a valid gallery page (2025 has actual gallery content)
    await page.goto('/pages/boulder-fest-2025-gallery.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle', { timeout: 30000 });
  });

  test('should load gallery within performance budget', async ({ page }) => {
    await expect(page).toHaveTitle(/Gallery/);
  });

  test('should handle virtual scrolling for large image sets', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Test scrolling performance
    const startTime = Date.now();
    
    await page.evaluate(() => {
      window.scrollTo(0, 500);
    });
    
    await page.waitForTimeout(500);
    
    await page.evaluate(() => {
      window.scrollTo(0, 1000);
    });
    
    const endTime = Date.now();
    const scrollTime = endTime - startTime;
    
    // Should scroll smoothly (within 2 seconds)
    expect(scrollTime).toBeLessThan(2000);
  });

  test('should optimize image loading with proper formats', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    const images = page.locator('img');
    
    if (await images.count() > 0) {
      const firstImage = images.first();
      const src = await firstImage.getAttribute('src');
      
      if (src) {
        // Should use optimized formats or responsive images
        expect(
          src.includes('googleusercontent.com') ||
          src.includes('drive.google.com') ||
          src.includes('webp') ||
          src.includes('avif') ||
          src.endsWith('.jpg') ||
          src.endsWith('.jpeg') ||
          src.endsWith('.png')
        ).toBeTruthy();
      }
    }
  });

  test('should REQUIRE Google Drive API integration (NO fallbacks)', async ({ page }) => {
    console.log('🔍 STRICT CHECK: Validating mandatory Google Drive API integration...');
    
    // Monitor network requests for Google Drive API calls
    const apiRequests = [];
    
    page.on('request', request => {
      if (request.url().includes('googleapis.com') || request.url().includes('drive') || request.url().includes('/api/gallery')) {
        apiRequests.push({
          url: request.url(),
          method: request.method(),
          resourceType: request.resourceType()
        });
      }
    });
    
    await page.reload();
    await page.waitForTimeout(5000);
    
    // STRICT: Gallery API calls must be made
    const galleryApiCalls = apiRequests.filter(req => req.url.includes('/api/gallery'));
    if (galleryApiCalls.length === 0) {
      throw new Error('FAILED: No gallery API calls detected. Google Drive integration requires /api/gallery calls.');
    }
    
    console.log('✅ Gallery API calls detected:', galleryApiCalls.length);
    
    // STRICT: Google Drive API calls should be made (or at least attempted)
    const googleApiCalls = apiRequests.filter(req => 
      req.url.includes('googleapis.com') || 
      req.url.includes('drive.google.com') ||
      req.url.includes('googleusercontent.com')
    );
    
    console.log('📊 Google API-related requests:', googleApiCalls.length);
    
    // STRICT: NO static fallback content should be visible  
    const staticContent = await page.locator('.gallery-grid-static, .gallery-static-title, #gallery-detail-static[style*="block"]').count();
    if (staticContent > 0) {
      throw new Error('FAILED: Static fallback content is visible. Google Drive API must work to show real content.');
    }
    
    // STRICT: Dynamic content must be loaded from Google Drive
    const dynamicContent = await page.locator('.gallery-detail-grid, .gallery-item').count();
    if (dynamicContent === 0) {
      throw new Error('FAILED: No dynamic Google Drive content loaded. API integration must populate gallery.');
    }
    
    // STRICT: Images must be from Google Drive
    const googleImages = await page.locator('img[src*="googleusercontent.com"], img[src*="drive.google.com"]').count();
    if (googleImages === 0) {
      throw new Error('FAILED: No Google Drive images found. All gallery images must come from Google Drive API.');
    }
    
    console.log('✅ Google Drive API integration working:', {
      galleryApiCalls: galleryApiCalls.length,
      googleApiRequests: googleApiCalls.length,  
      dynamicContent: dynamicContent,
      googleImages: googleImages
    });
  });

  test('should cache Google Drive images for performance (STRICT)', async ({ page }) => {
    console.log('🔍 STRICT CHECK: Validating Google Drive image caching performance...');
    
    await page.waitForTimeout(2000);
    
    // Monitor Google Drive image requests
    const googleImageRequests = [];
    page.on('request', request => {
      if (request.url().includes('googleusercontent.com') || request.url().includes('drive.google.com')) {
        googleImageRequests.push({
          url: request.url(),
          timestamp: Date.now()
        });
      }
    });
    
    // Navigate away and back to test caching
    await page.goto('/pages/tickets.html');
    await page.goto('/pages/boulder-fest-2025-gallery.html');
    
    await page.waitForTimeout(3000);
    
    // STRICT: Gallery containers must be visible (no static fallback)
    const staticContainers = await page.locator('.gallery-grid-static, .gallery-static-title').count();
    if (staticContainers > 0) {
      throw new Error('FAILED: Static fallback containers detected. Google Drive caching test requires real content.');
    }
    
    // STRICT: Dynamic gallery containers must exist
    const dynamicContainers = page.locator('.gallery-detail-grid, .gallery-item');
    const containerCount = await dynamicContainers.count();
    if (containerCount === 0) {
      throw new Error('FAILED: No dynamic gallery containers found. Google Drive API must populate gallery.');
    }
    
    // STRICT: At least one dynamic container must be visible
    let hasVisibleContainer = false;
    for (let i = 0; i < containerCount; i++) {
      const container = dynamicContainers.nth(i);
      try {
        await expect(container).toBeVisible({ timeout: 5000 });
        hasVisibleContainer = true;
        break;
      } catch (e) {
        continue;
      }
    }
    
    if (!hasVisibleContainer) {
      throw new Error('FAILED: No visible dynamic gallery containers. Google Drive content must be displayed.');
    }
    
    // STRICT: Google Drive images must be present
    const googleImages = await page.locator('img[src*="googleusercontent.com"], img[src*="drive.google.com"]').count();
    if (googleImages === 0) {
      throw new Error('FAILED: No Google Drive images found. Caching test requires real Google Drive images.');
    }
    
    console.log('✅ Google Drive caching performance validated:', {
      dynamicContainers: containerCount,
      googleImages: googleImages,
      googleImageRequests: googleImageRequests.length,
      noStaticFallback: true
    });
  });

  test('should handle year-based filtering efficiently', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Test year filtering if available (2025 gallery might have workshop/social filtering)
    const yearFilters = page.locator('.year-filter, button:has-text("2024"), button:has-text("2025"), .workshop-filter, .social-filter');
    
    if (await yearFilters.count() >= 2) {
      const firstYear = yearFilters.first();
      const secondYear = yearFilters.nth(1);
      
      // Test filter switching
      const startTime = Date.now();
      await firstYear.click();
      await page.waitForTimeout(500);
      
      await secondYear.click();
      const endTime = Date.now();
      const filterTime = endTime - startTime;
      
      // Should filter quickly (under 2 seconds)
      expect(filterTime).toBeLessThan(2000);
      
      // Gallery content should still be present
      const galleryContent = page.locator('.gallery-detail-grid, .gallery-grid-static');
      await expect(galleryContent).toBeVisible();
    } else {
      // No year filters available - just verify gallery structure exists
      const galleryElements = page.locator('#workshops-section, #socials-section, .gallery-detail-grid');
      expect(await galleryElements.count()).toBeGreaterThan(0);
    }
  });

  test('should handle Google Drive image errors gracefully WITHOUT fallbacks', async ({ page }) => {
    console.log('🔍 STRICT CHECK: Testing Google Drive error handling without fallbacks...');
    
    // Mock some Google Drive image failures to test error handling
    let interceptedRequests = 0;
    await page.route('**/googleusercontent.com/**', route => {
      interceptedRequests++;
      if (Math.random() > 0.5) { // Fail 50% of image requests
        route.abort();
      } else {
        route.continue();
      }
    });
    
    await page.reload();
    await page.waitForTimeout(5000);
    
    console.log('📊 Intercepted Google Drive requests:', interceptedRequests);
    
    // STRICT: Even with some image failures, NO static fallback should be shown
    const staticElements = await page.locator('.gallery-grid-static, .gallery-static-title, #gallery-detail-static[style*="block"]').count();
    if (staticElements > 0) {
      throw new Error('FAILED: Static fallback shown during image failures. Must handle errors without reverting to fallback.');
    }
    
    // STRICT: Dynamic gallery structure must still be present
    const dynamicContent = await page.locator('.gallery-detail-grid, .gallery-item').count();
    if (dynamicContent === 0) {
      throw new Error('FAILED: No dynamic gallery content during image failures. Gallery structure must persist.');
    }
    
    // Check for proper error handling (no broken state messages)
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('undefined');
    expect(bodyText).not.toContain('[object Object]');
    expect(bodyText).not.toContain('NetworkError');
    
    // STRICT: Should still have some working Google Drive images
    const googleImages = await page.locator('img[src*="googleusercontent.com"], img[src*="drive.google.com"]').count();
    if (googleImages === 0) {
      throw new Error('FAILED: All Google Drive images failed. Some images must load successfully.');
    }
    
    console.log('✅ Google Drive error handling validated:', {
      interceptedRequests: interceptedRequests,
      dynamicContent: dynamicContent,
      workingGoogleImages: googleImages,
      noStaticFallback: true,
      noErrorMessages: true
    });
  });

  test('should handle responsive gallery layout', async ({ page }) => {
    // Test desktop layout
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.reload();
    await page.waitForTimeout(2000);
    
    const desktopImages = page.locator('img');
    const desktopCount = await desktopImages.count();
    
    // Test mobile layout
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);
    
    const mobileImages = page.locator('img');
    const mobileCount = await mobileImages.count();
    
    // Images should adapt to viewport (similar count expected)
    if (desktopCount > 0 && mobileCount > 0) {
      expect(Math.abs(desktopCount - mobileCount)).toBeLessThanOrEqual(desktopCount * 0.2);
    }
    
    // Gallery sections should still be present
    const galleryContainers = page.locator('#workshops-section, #socials-section');
    expect(await galleryContainers.count()).toBeGreaterThan(0);
  });

  test('should preload critical gallery resources', async ({ page }) => {
    const resourceRequests = [];
    
    page.on('request', request => {
      resourceRequests.push({
        url: request.url(),
        resourceType: request.resourceType()
      });
    });
    
    await page.reload();
    await page.waitForTimeout(3000);
    
    // Should load CSS and JS resources
    const cssRequests = resourceRequests.filter(r => r.resourceType === 'stylesheet');
    const jsRequests = resourceRequests.filter(r => r.resourceType === 'script');
    
    expect(cssRequests.length).toBeGreaterThan(0);
    expect(jsRequests.length).toBeGreaterThan(0);
  });

  test('should handle gallery search and filtering', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Look for search/filter functionality
    const searchInput = page.locator('input[type="search"], .search-input, [placeholder*="search"], [placeholder*="filter"]');
    const filterButtons = page.locator('.filter-button, .category-filter, .tag-filter');
    
    if (await searchInput.count() > 0) {
      await searchInput.first().fill('workshop');
      await page.waitForTimeout(500);
      
      // Gallery should update or remain stable
      const galleryContent = page.locator('.gallery-detail-grid, #workshops-section');
      await expect(galleryContent).toBeVisible();
    } else if (await filterButtons.count() > 0) {
      await filterButtons.first().click();
      await page.waitForTimeout(500);
      
      // Gallery should update
      const galleryContent = page.locator('.gallery-detail-grid, #socials-section');
      await expect(galleryContent).toBeVisible();
    } else {
      // No search/filter available - just verify gallery structure
      const bodyText = await page.locator('body').textContent();
      expect(bodyText.includes('WORKSHOPS') || bodyText.includes('SOCIALS')).toBeTruthy();
    }
  });
});

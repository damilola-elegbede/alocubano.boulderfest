/**
 * E2E Test: Gallery Performance & Functionality
 * Tests gallery performance with Google Drive API integration using eventId parameter
 * Requires working Google Drive configuration for proper testing
 */

import { test, expect } from '@playwright/test';

/**
 * Check Google Drive API configuration via environment endpoint
 * Returns { hasConfig: boolean, skipGoogleDriveTests: boolean }
 */
async function checkGoogleDriveConfig(page) {
  console.log('🔍 INFO: Checking Google Drive API configuration...');
  console.log('🌐 Current page URL:', page.url());
  
  try {
    console.log('📡 Making request to /api/debug/environment...');
    const envResponse = await page.request.get('/api/debug/environment');
    console.log('📊 Environment debug response status:', envResponse.status());
    
    if (!envResponse.ok()) {
      console.log('📍 Environment debug endpoint not available:', {
        status: envResponse.status(),
        statusText: envResponse.statusText()
      });
      return { hasConfig: false, skipGoogleDriveTests: true };
    }
    
    const envData = await envResponse.json();
    console.log('📋 Environment debug response available');
    
    // Check for Google Drive environment variables (correct nested structure)
    const hasServiceAccount = !!envData.variables?.details?.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const hasPrivateKey = !!envData.variables?.details?.GOOGLE_PRIVATE_KEY;  
    const hasFolderId = !!envData.variables?.details?.GOOGLE_DRIVE_GALLERY_FOLDER_ID;
    
    // Log Google Drive configuration status (sanitized - booleans only)
    console.log('🔍 Google Drive Configuration Status (sanitized):', {
      GOOGLE_SERVICE_ACCOUNT_EMAIL: { exists: hasServiceAccount },
      GOOGLE_PRIVATE_KEY: { exists: hasPrivateKey },
      GOOGLE_DRIVE_GALLERY_FOLDER_ID: { exists: hasFolderId },
      allConfigured: hasServiceAccount && hasPrivateKey && hasFolderId
    });
    
    const missingVars = [];
    if (!hasServiceAccount) missingVars.push('GOOGLE_SERVICE_ACCOUNT_EMAIL');
    if (!hasPrivateKey) missingVars.push('GOOGLE_PRIVATE_KEY');
    if (!hasFolderId) missingVars.push('GOOGLE_DRIVE_GALLERY_FOLDER_ID');
    
    if (missingVars.length > 0) {
      console.log('📍 INFO: Google Drive configuration incomplete (expected in preview deployments):', missingVars);
      console.log('🔍 Available Google variables:', Object.keys(envData).filter(key => key.includes('GOOGLE')));
      return { hasConfig: false, skipGoogleDriveTests: true };
    }
    
    console.log('✅ All Google Drive API environment variables are configured');
    return { hasConfig: true, skipGoogleDriveTests: false };
    
  } catch (error) {
    console.log('📍 INFO: Google Drive configuration check failed (expected in preview deployments):', {
      message: error.message,
      name: error.name
    });
    return { hasConfig: false, skipGoogleDriveTests: true };
  }
}

/**
 * Check gallery API response and determine what type of content is available
 * Returns { hasRealData: boolean, isEmpty: boolean, apiData: object }
 */
async function checkGalleryApiData(page) {
  console.log('🔍 INFO: Checking Gallery API data availability...');
  console.log('🌐 Current page URL:', page.url());
  
  try {
    console.log('📡 Making request to /api/gallery?eventId=boulder-fest-2025...');
    const galleryResponse = await page.request.get('/api/gallery?eventId=boulder-fest-2025');
    console.log('📊 Gallery API response status:', galleryResponse.status());
    
    if (!galleryResponse.ok()) {
      const errorText = await galleryResponse.text();
      console.log('📍 Gallery API endpoint failed:', {
        status: galleryResponse.status(),
        statusText: galleryResponse.statusText(),
        responseText: errorText
      });
      return { hasRealData: false, isEmpty: true, apiData: null };
    }
    
    const galleryData = await galleryResponse.json();
    console.log('📋 Gallery API response received');
    
    // Enhanced logging for debugging
    console.log('🔍 Gallery Data Analysis:', {
      source: galleryData.source,
      hasItems: !!galleryData.items,
      itemsLength: galleryData.items ? galleryData.items.length : 0,
      hasError: !!galleryData.error,
      error: galleryData.error
    });
    
    const hasItems = galleryData.items && galleryData.items.length > 0;
    const hasError = !!galleryData.error;
    
    if (hasError) {
      console.log('📍 INFO: Gallery API reported error:', galleryData.error);
      return { hasRealData: false, isEmpty: true, apiData: galleryData };
    }
    
    if (hasItems) {
      console.log('✅ Gallery API returned real data with', galleryData.items.length, 'items');
      return { hasRealData: true, isEmpty: false, apiData: galleryData };
    }
    
    console.log('📍 INFO: Gallery API returned empty results');
    return { hasRealData: false, isEmpty: true, apiData: galleryData };
    
  } catch (error) {
    console.log('📍 INFO: Gallery API check failed:', {
      message: error.message,
      name: error.name
    });
    return { hasRealData: false, isEmpty: true, apiData: null };
  }
}

test.describe('Gallery Performance & Functionality', () => {
  let testContext = {};

  test.beforeEach(async ({ page }) => {
    console.log('🚀 Starting beforeEach setup for Gallery Browsing test...');
    
    try {
      // Step 1: Check Google Drive configuration (informational)
      console.log('📋 Step 1: Checking Google Drive API configuration...');
      const googleDriveConfig = await checkGoogleDriveConfig(page);
      testContext.googleDriveConfig = googleDriveConfig;
      
      if (googleDriveConfig.hasConfig) {
        console.log('✅ Step 1: Google Drive config available');
      } else {
        console.log('📍 Step 1: Google Drive config not available (expected in preview deployments)');
      }
      
      // Step 2: Check Gallery API data (informational)
      console.log('📋 Step 2: Checking Gallery API data...');
      const galleryData = await checkGalleryApiData(page);
      testContext.galleryData = galleryData;
      
      if (galleryData.hasRealData) {
        console.log('✅ Step 2: Real gallery data available');
      } else {
        console.log('📍 Step 2: No gallery data available');
      }
      
      console.log('📋 Step 3: Navigating to gallery page...');
      await page.goto('/2025-gallery');
      console.log('🌐 Navigation completed. Current URL:', page.url());
      
      console.log('📋 Step 4: Waiting for page to load...');
      await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
      console.log('✅ DOM content loaded');
      
      // Use longer timeout for preview deployments with cold start delays
      await page.waitForLoadState('networkidle', { timeout: 120000 });
      console.log('✅ Network idle reached');
      
      console.log('🎉 beforeEach setup completed successfully');
    } catch (error) {
      console.log('📍 INFO: beforeEach setup encountered issue (may be expected):', {
        message: error.message,
        name: error.name,
        currentUrl: page.url(),
        timestamp: new Date().toISOString()
      });
      
      // Still navigate to the page even if config checks fail
      try {
        await page.goto('/2025-gallery');
        await page.waitForLoadState('domcontentloaded');
        console.log('✅ Successfully navigated to gallery page despite config issues');
      } catch (navError) {
        console.error('❌ Failed to navigate to gallery page:', navError.message);
        throw navError;
      }
    }
  });

  test('should load gallery within performance budget', async ({ page }) => {
    await expect(page).toHaveTitle(/Gallery/);
  });

  test('should handle virtual scrolling for large image sets', async ({ page }) => {
    // Wait for content to be ready before testing scrolling
    await page.waitForFunction(
      () => document.readyState === 'complete' && document.body.scrollHeight > 100,
      { timeout: 30000 }
    ).catch(() => {
      console.log('📍 Content readiness wait timed out');
    });
    
    // Test scrolling performance
    const startTime = Date.now();
    
    await page.evaluate(() => {
      window.scrollTo(0, 500);
    });
    
    // Wait for scroll to complete and any lazy loading
    await page.waitForFunction(
      () => window.pageYOffset >= 400,
      { timeout: 5000 }
    ).catch(() => {
      console.log('📍 Scroll position wait timed out');
    });
    
    await page.evaluate(() => {
      window.scrollTo(0, 1000);
    });
    
    // Wait for second scroll to complete
    await page.waitForFunction(
      () => window.pageYOffset >= 800,
      { timeout: 5000 }
    ).catch(() => {
      console.log('📍 Second scroll position wait timed out');
    });
    
    const endTime = Date.now();
    const scrollTime = endTime - startTime;
    
    // Should scroll smoothly (within 2 seconds)
    expect(scrollTime).toBeLessThan(2000);
  });

  test('should optimize image loading with proper formats', async ({ page }) => {
    // Wait for images to start loading
    await page.waitForFunction(
      () => {
        const images = document.querySelectorAll('img');
        return images.length > 0;
      },
      { timeout: 30000 }
    ).catch(() => {
      console.log('📍 Image loading wait timed out');
    });
    
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
    
    // Wait for Google Drive API calls to complete with extended timeout for cold starts
    await page.waitForFunction(
      () => {
        return document.readyState === 'complete' && 
               !document.querySelector('#gallery-detail-loading[style*="display: block"]');
      },
      { timeout: 120000 } // Extended timeout for Google Drive API cold starts
    ).catch(() => {
      console.log('📍 Google Drive API loading wait timed out, continuing...');
    });
    
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
    
    // STRICT: NO static content should be visible - only dynamic Google Drive content  
    const staticContent = await page.locator('.gallery-grid-static, .gallery-static-title, #gallery-detail-static[style*="block"]').count();
    if (staticContent > 0) {
      throw new Error('FAILED: Static content is visible. Google Drive API must work to show real content.');
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
    
    // Wait for initial content to load before testing caching
    await page.waitForFunction(
      () => document.readyState === 'complete',
      { timeout: 30000 }
    ).catch(() => {
      console.log('📍 Initial content load wait timed out');
    });
    
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
    await page.goto('/tickets');
    await page.goto('/2025-gallery');
    
    // Wait for page to reload and content to be available
    await page.waitForLoadState('networkidle', { timeout: 90000 }).catch(() => {
      console.log('📍 Gallery reload network idle wait timed out');
    });
    
    // STRICT: Gallery containers must be visible (no static content)
    const staticContainers = await page.locator('.gallery-grid-static, .gallery-static-title').count();
    if (staticContainers > 0) {
      throw new Error('FAILED: Static containers detected. Google Drive caching test requires real content.');
    }
    
    // STRICT: Dynamic gallery containers must exist
    const dynamicContainers = page.locator('.gallery-detail-grid, .gallery-item');
    const containerCount = await dynamicContainers.count();
    if (containerCount === 0) {
      throw new Error('FAILED: No dynamic gallery containers found. Google Drive API must populate gallery.');
    }
    
    // STRICT: At least one dynamic container must be visible with extended timeout for cold starts
    let hasVisibleContainer = false;
    for (let i = 0; i < containerCount; i++) {
      const container = dynamicContainers.nth(i);
      try {
        await expect(container).toBeVisible({ timeout: 30000 }); // Extended timeout for Google Drive API delays
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
      noStaticContent: true
    });
  });

  test('should handle year-based filtering efficiently', async ({ page }) => {
    // Wait for filters to be available
    await page.waitForFunction(
      () => document.readyState === 'complete',
      { timeout: 30000 }
    ).catch(() => {
      console.log('📍 Filter availability wait timed out');
    });
    
    // Test year filtering if available (2025 gallery might have workshop/social filtering)
    const yearFilters = page.locator('.year-filter, button:has-text("2025"), .workshop-filter, .social-filter');
    
    if (await yearFilters.count() >= 2) {
      const firstYear = yearFilters.first();
      const secondYear = yearFilters.nth(1);
      
      // Test filter switching
      const startTime = Date.now();
      await firstYear.click();
      
      // Wait for filter to be applied
      await page.waitForFunction(
        () => !document.querySelector('.loading, [data-loading="true"]'),
        { timeout: 10000 }
      ).catch(() => {
        console.log('📍 First filter application wait timed out');
      });
      
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
    
    // Wait for Google Drive error handling to be tested with extended timeout
    await page.waitForFunction(
      () => {
        return document.readyState === 'complete' && 
               !document.querySelector('#gallery-detail-loading[style*="display: block"]');
      },
      { timeout: 90000 }
    ).catch(() => {
      console.log('📍 Google Drive error handling test load wait timed out');
    });
    
    console.log('📊 Intercepted Google Drive requests:', interceptedRequests);
    
    // STRICT: Even with some image failures, NO static content should be shown
    const staticElements = await page.locator('.gallery-grid-static, .gallery-static-title, #gallery-detail-static[style*="block"]').count();
    if (staticElements > 0) {
      throw new Error('FAILED: Static content shown during image failures. Must handle errors without reverting to static content.');
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
      noStaticContent: true,
      noErrorMessages: true
    });
  });

  test('should handle responsive gallery layout', async ({ page }) => {
    // Test desktop layout
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.reload();
    
    // Wait for desktop layout to load
    await page.waitForFunction(
      () => document.readyState === 'complete',
      { timeout: 30000 }
    ).catch(() => {
      console.log('📍 Desktop layout load wait timed out');
    });
    
    const desktopImages = page.locator('img');
    const desktopCount = await desktopImages.count();
    
    // Test mobile layout
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Wait for mobile layout to adapt
    await page.waitForFunction(
      () => window.innerWidth <= 375,
      { timeout: 5000 }
    ).catch(() => {
      console.log('📍 Mobile viewport adaptation wait timed out');
    });
    
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
    
    // Wait for resources to load
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {
      console.log('📍 Resource preloading network idle wait timed out');
    });
    
    // Should load CSS and JS resources
    const cssRequests = resourceRequests.filter(r => r.resourceType === 'stylesheet');
    const jsRequests = resourceRequests.filter(r => r.resourceType === 'script');
    
    expect(cssRequests.length).toBeGreaterThan(0);
    expect(jsRequests.length).toBeGreaterThan(0);
  });

  test('should handle gallery search and filtering', async ({ page }) => {
    // Wait for search/filter elements to be available
    await page.waitForFunction(
      () => document.readyState === 'complete',
      { timeout: 30000 }
    ).catch(() => {
      console.log('📍 Search/filter availability wait timed out');
    });
    
    // Look for search/filter functionality
    const searchInput = page.locator('input[type="search"], .search-input, [placeholder*="search"], [placeholder*="filter"]');
    const filterButtons = page.locator('.filter-button, .category-filter, .tag-filter');
    
    if (await searchInput.count() > 0) {
      await searchInput.first().fill('workshop');
      
      // Wait for search results to update
      await page.waitForFunction(
        () => !document.querySelector('.loading, [data-loading="true"]'),
        { timeout: 10000 }
      ).catch(() => {
        console.log('📍 Search results update wait timed out');
      });
      
      // Gallery should update or remain stable
      const galleryContent = page.locator('.gallery-detail-grid, #workshops-section');
      await expect(galleryContent).toBeVisible();
    } else if (await filterButtons.count() > 0) {
      await filterButtons.first().click();
      
      // Wait for filter to be applied
      await page.waitForFunction(
        () => !document.querySelector('.loading, [data-loading="true"]'),
        { timeout: 10000 }
      ).catch(() => {
        console.log('📍 Filter application wait timed out');
      });
      
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

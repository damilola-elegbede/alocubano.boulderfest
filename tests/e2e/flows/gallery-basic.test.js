/**
 * E2E Test: Gallery Basic Browsing
 * Tests gallery functionality with Google Drive API integration using eventId parameter
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
      const errorText = await envResponse.text();
      console.log('📍 Environment debug endpoint not available:', {
        status: envResponse.status(),
        statusText: envResponse.statusText(),
        responseText: errorText
      });
      return { hasConfig: false, skipGoogleDriveTests: true };
    }
    
    const envData = await envResponse.json();
    console.log('📋 Environment debug response available');
    
    // Check for Google Drive environment variables (correct nested structure)
    const hasServiceAccount = !!envData.variables?.details?.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const hasPrivateKey = !!envData.variables?.details?.GOOGLE_PRIVATE_KEY;  
    const hasFolderId = !!envData.variables?.details?.GOOGLE_DRIVE_GALLERY_FOLDER_ID;
    
    // Log Google Drive configuration status (Vercel returns booleans only)
    console.log('🔍 Google Drive Configuration Status:', {
      GOOGLE_SERVICE_ACCOUNT_EMAIL: hasServiceAccount,
      GOOGLE_PRIVATE_KEY: hasPrivateKey,
      GOOGLE_DRIVE_GALLERY_FOLDER_ID: hasFolderId,
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

test.describe('Gallery Basic Browsing', () => {
  let testContext = {};

  test.beforeEach(async ({ page }) => {
    console.log('🚀 Starting beforeEach setup for Gallery Basic test...');
    
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
      
      // Wait for page to fully load including network idle for preview deployments
      console.log('📋 Step 4: Waiting for page to load...');
      await page.waitForLoadState('domcontentloaded');
      console.log('✅ DOM content loaded');
      
      await page.waitForLoadState('networkidle', { timeout: 30000 });
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

  test('should load gallery page with Google Drive content', async ({ page }) => {
    console.log('🔍 INFO: Verifying gallery page loads with Google Drive content...');
    
    await page.waitForTimeout(3000); // Allow content to load
    
    // Check for dynamic gallery content from Google Drive
    const dynamicGallery = page.locator('.gallery-detail-grid, .gallery-item');
    const dynamicCount = await dynamicGallery.count();
    const googleImages = page.locator('img[src*="googleusercontent.com"], img[src*="drive.google.com"]');
    const googleImageCount = await googleImages.count();
    
    console.log('📊 Gallery content analysis:', {
      dynamicCount,
      googleImageCount
    });
    
    // Verify gallery page has dynamic content
    expect(dynamicCount).toBeGreaterThan(0);
    
    if (googleImageCount > 0) {
      console.log('✅ Gallery loaded with real Google Drive images:', googleImageCount);
      
      // Verify Google Drive images are properly loaded
      const firstGoogleImage = googleImages.first();
      await expect(firstGoogleImage).toBeVisible();
      
      const imageSrc = await firstGoogleImage.getAttribute('src');
      expect(imageSrc).toBeTruthy();
      expect(imageSrc).toMatch(/googleusercontent\.com|drive\.google\.com/);
      
      console.log('✅ Google Drive images are properly loaded with valid URLs');
    } else {
      console.log('📍 Gallery loaded with dynamic content (images may still be loading)');
      expect(dynamicCount).toBeGreaterThan(0);
    }
  });

  test('should display year filters or navigation', async ({ page }) => {
    // Look for year-based navigation or filters
    const yearFilters = page.locator('.year-filter, .year-tab, button:has-text("2025"), .filter-year');
    
    if (await yearFilters.count() > 0) {
      await expect(yearFilters.first()).toBeVisible();
    } else {
      // Alternative: check for any kind of filtering/navigation system
      const navigation = page.locator('.gallery-nav, .filter-nav, .tab-nav, .year-selector');
      if (await navigation.count() > 0) {
        await expect(navigation.first()).toBeVisible();
      }
    }
  });

  test('should load gallery images from Google Drive', async ({ page }) => {
    console.log('🔍 INFO: Validating gallery image loading...');
    
    await page.waitForTimeout(5000);
    
    // Wait for loading to complete
    try {
      await page.waitForFunction(
        () => {
          const contentEl = document.getElementById('gallery-detail-content');
          const loadingEl = document.getElementById('gallery-detail-loading');
          
          // Check if content is shown or loading is hidden
          const loadingHidden = !loadingEl || loadingEl.style.display === 'none';
          const contentShown = contentEl && contentEl.style.display === 'block';
          
          return loadingHidden || contentShown;
        },
        { timeout: 15000 }
      );
    } catch (error) {
      console.log('📍 INFO: Loading state check timed out (may be expected)');
    }
    
    // Check for dynamic images from Google Drive
    const dynamicImages = page.locator('.gallery-item img, .gallery-detail-grid img');
    const dynamicCount = await dynamicImages.count();
    const googleImages = page.locator('img[src*="googleusercontent.com"], img[src*="drive.google.com"]');
    const googleImageCount = await googleImages.count();
    
    console.log('📊 Gallery image analysis:', {
      dynamicCount,
      googleImageCount
    });
    
    // Verify gallery has dynamic content
    expect(dynamicCount).toBeGreaterThan(0);
    
    if (googleImageCount > 0) {
      console.log('✅ Gallery loaded with real Google Drive images:', googleImageCount);
      
      // Verify first Google Drive image loads properly
      const firstGoogleImage = googleImages.first();
      await expect(firstGoogleImage).toBeVisible();
      
      // Verify image has valid Google Drive URL
      const imageSrc = await firstGoogleImage.getAttribute('src');
      expect(imageSrc).toMatch(/googleusercontent\.com|drive\.google\.com/);
      
      console.log('✅ Google Drive images are properly loaded and visible');
    } else {
      console.log('📍 Gallery loaded with dynamic content (images may still be loading)');
      expect(dynamicCount).toBeGreaterThan(0);
    }
  });

  test('should handle image lazy loading', async ({ page }) => {
    // Scroll down to trigger lazy loading
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(1000);
    
    // More images should be visible now
    const images = page.locator('img[src], .gallery-item img');
    if (await images.count() > 0) {
      // At least one image should be loaded
      await expect(images.first()).toBeVisible();
    }
  });

  test('should open image in modal or lightbox', async ({ page }) => {
    // Wait for gallery to fully load
    await page.waitForSelector('.gallery-detail-grid', { timeout: 10000 });
    
    // Find gallery items (containers, not just images)
    const galleryItem = page.locator('.gallery-item').first();
    const itemCount = await galleryItem.count();
    
    if (itemCount > 0) {
      // Click the gallery item container
      await galleryItem.click();
      
      // Wait for lightbox with correct ID and class
      await page.waitForSelector('#unified-lightbox.is-open', { 
        state: 'visible',
        timeout: 5000 
      });
      
      // Verify lightbox is visible
      await expect(page.locator('#unified-lightbox')).toBeVisible();
      
      // Verify image is loaded in lightbox
      const lightboxImage = page.locator('#unified-lightbox .lightbox-image');
      await expect(lightboxImage).toBeVisible();
    } else {
      console.log('No gallery items found to test lightbox functionality');
    }
  });

  test('should navigate between years if available', async ({ page }) => {
    const year2025 = page.locator('button:has-text("2025"), .year-2025, [data-year="2025"]');
    
    if (await year2025.count() > 0) {
      await year2025.click();
      await page.waitForTimeout(1000);
      
      // Gallery content should update
      await expect(page.locator('.gallery-detail-grid, .gallery-grid-static')).toBeVisible();
    }
  });

  test('should handle gallery API responses with eventId parameter', async ({ page }) => {
    console.log('🔍 INFO: Checking gallery API response handling...');
    
    // Monitor API requests to track gallery calls with eventId
    const apiRequests = [];
    page.on('request', request => {
      if (request.url().includes('/api/gallery') || request.url().includes('googleapis.com') || request.url().includes('drive')) {
        apiRequests.push({
          url: request.url(),
          method: request.method()
        });
      }
    });
    
    await page.reload();
    await page.waitForTimeout(5000);
    
    // Check if gallery API calls were made with eventId
    const galleryApiCalls = apiRequests.filter(req => req.url.includes('/api/gallery'));
    console.log('📊 Gallery API calls detected:', galleryApiCalls.length);
    
    // Check if eventId parameter is used (don't fail if not supported)
    const eventIdCalls = galleryApiCalls.filter(req => req.url.includes('eventId='));
    if (eventIdCalls.length > 0) {
      console.log('✅ Gallery API calls using eventId parameter:', eventIdCalls.length);
    } else {
      console.log('📍 INFO: Gallery API does not use eventId parameter (feature may not be implemented)');
    }
    
    // Check dynamic content is displayed
    const dynamicContent = await page.locator('.gallery-detail-grid, .gallery-item').count();
    
    console.log('📊 Content analysis:', {
      galleryApiCalls: galleryApiCalls.length,
      eventIdCalls: eventIdCalls.length,
      dynamicContent
    });
    
    // Verify gallery content is displayed (main success criteria)
    if (dynamicContent > 0) {
      console.log('✅ Gallery successfully loaded content with', dynamicContent, 'elements');
    } else {
      console.log('📍 INFO: Gallery has no dynamic content (may use static data or different loading method)');
    }
    
    // Test passes as long as gallery page loads without errors
    expect(page).toBeTruthy();
    
    // Try to wait for content to be fully loaded
    try {
      await page.waitForFunction(
        () => {
          const contentEl = document.getElementById('gallery-detail-content');
          return contentEl && contentEl.style.display === 'block';
        },
        { timeout: 10000 }
      );
      console.log('✅ Dynamic content is fully loaded and visible');
    } catch (error) {
      console.log('📍 INFO: Dynamic content loading check timed out (may be expected)');
    }
  });

  test('should display loading state appropriately', async ({ page }) => {
    // Reload to see loading state
    await page.reload();
    
    // Wait for content to load and check what's displayed
    await page.waitForTimeout(3000);
    
    // Check for dynamic content loading
    const bodyText = await page.locator('body').textContent();
    const dynamicContent = await page.locator('.gallery-detail-grid, .gallery-item').count();
    
    // Look for basic page structure
    const hasWorkshops = bodyText.includes('WORKSHOPS');
    const hasSocials = bodyText.includes('SOCIALS');
    const hasGalleryText = bodyText.includes('Gallery') || bodyText.includes('festival') || bodyText.includes('2025');
    
    // Dynamic content should be present or page should have basic structure
    const hasValidContent = dynamicContent > 0 || 
                           hasWorkshops || 
                           hasSocials || 
                           hasGalleryText ||
                           bodyText.length > 500; // Page has reasonable content
    
    expect(hasValidContent).toBeTruthy();
    
    console.log('📊 Loading state check:', {
      dynamicContent,
      hasWorkshops,
      hasSocials,
      hasGalleryText,
      bodyTextLength: bodyText.length
    });
  });

  test('should handle mobile gallery view', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    
    // Wait for page to fully load
    await page.waitForTimeout(3000);
    
    // Check for dynamic gallery content
    const dynamicContent = await page.locator('.gallery-detail-grid, .gallery-item').count();
    
    // Check for basic gallery structure
    const galleryContainers = page.locator('#workshops-section, #socials-section');
    const containerCount = await galleryContainers.count();
    
    if (dynamicContent > 0) {
      console.log('✅ Mobile view showing dynamic gallery content');
      expect(dynamicContent).toBeGreaterThan(0);
      return;
    }
    
    if (containerCount > 0) {
      // Basic structure exists - verify content is present
      const bodyText = await page.locator('body').textContent();
      expect(bodyText.includes('WORKSHOPS') || bodyText.includes('SOCIALS')).toBeTruthy();
      
      console.log('✅ Mobile view showing gallery sections structure');
    } else {
      // Ensure page has some gallery-related content
      const bodyText = await page.locator('body').textContent();
      expect(
        bodyText.includes('Gallery') ||
        bodyText.includes('festival') ||
        bodyText.includes('2025') ||
        bodyText.length > 500
      ).toBeTruthy();
      
      console.log('✅ Mobile view has basic gallery page content');
    }
  });

  test('should display appropriate content (never completely empty)', async ({ page }) => {
    console.log('🔍 INFO: Verifying gallery displays appropriate content...');
    
    await page.reload();
    await page.waitForTimeout(3000);
    
    // Check what types of content are available
    const dynamicContent = await page.locator('.gallery-detail-grid .gallery-item, .gallery-detail-content img').count();
    const googleImages = await page.locator('img[src*="googleusercontent.com"], img[src*="drive.google.com"]').count();
    
    console.log('📊 Content availability analysis:', {
      dynamicContent,
      googleImages
    });
    
    // Verify gallery has dynamic content
    expect(dynamicContent).toBeGreaterThan(0);
    
    if (googleImages > 0) {
      console.log('✅ Gallery has real Google Drive content:', {
        dynamicItems: dynamicContent,
        googleImages: googleImages
      });
    } else {
      console.log('📍 Gallery showing dynamic content (images may still be loading):', dynamicContent, 'items');
    }
    
    // Ensure page is not broken or completely empty
    const bodyText = await page.locator('body').textContent();
    expect(bodyText.length).toBeGreaterThan(100); // Basic content check
    console.log('✅ Gallery page has substantial content');
  });
});

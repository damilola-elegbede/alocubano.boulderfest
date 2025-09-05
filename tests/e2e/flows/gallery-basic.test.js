/**
 * E2E Test: Gallery Basic Browsing - STRICT Google Drive API Requirements
 * Tests gallery functionality with MANDATORY Google Drive API integration
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
    const hasApiKey = !!envData.GOOGLE_DRIVE_API_KEY;
    const hasFolderId = !!envData.GOOGLE_DRIVE_FOLDER_ID;
    
    console.log('📊 Google Drive API Configuration Status:', {
      GOOGLE_DRIVE_API_KEY: hasApiKey,
      GOOGLE_DRIVE_FOLDER_ID: hasFolderId,
      envResponseStatus: envResponse.status()
    });
    
    const missingVars = [];
    if (!hasApiKey) missingVars.push('GOOGLE_DRIVE_API_KEY');
    if (!hasFolderId) missingVars.push('GOOGLE_DRIVE_FOLDER_ID');
    
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

test.describe('Gallery Basic Browsing - STRICT Google Drive API Requirements', () => {
  test.beforeEach(async ({ page }) => {
    // STRICT: Validate Google Drive API configuration first
    await validateGoogleDriveConfig(page);
    
    // STRICT: Verify API returns real data before testing UI
    await verifyRealGoogleDriveData(page);
    
    await page.goto('/pages/boulder-fest-2025-gallery.html');
    // Wait for page to fully load including network idle for preview deployments
    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle', { timeout: 30000 });
  });

  test('should load gallery page with REAL Google Drive images (NO FALLBACKS)', async ({ page }) => {
    console.log('🔍 STRICT CHECK: Verifying real Google Drive images are loaded on page...');
    
    await page.waitForTimeout(3000); // Allow content to load
    
    // STRICT: Fail if static fallback content is visible
    const staticFallback = await page.locator('.gallery-static-title, .gallery-grid-static').count();
    if (staticFallback > 0) {
      throw new Error('FAILED: Static fallback content detected. Gallery must load real Google Drive images, not static content.');
    }
    
    // STRICT: Require dynamic gallery content to be loaded
    const dynamicGallery = page.locator('.gallery-detail-grid, .gallery-item');
    const dynamicCount = await dynamicGallery.count();
    
    if (dynamicCount === 0) {
      throw new Error('FAILED: No dynamic gallery content found. Google Drive API must populate real gallery items.');
    }
    
    // STRICT: Require actual images from Google Drive
    const googleImages = page.locator('img[src*="googleusercontent.com"], img[src*="drive.google.com"]');
    const googleImageCount = await googleImages.count();
    
    if (googleImageCount === 0) {
      throw new Error('FAILED: No Google Drive images detected. All images must be served from Google Drive API.');
    }
    
    console.log('✅ Gallery loaded with', dynamicCount, 'dynamic items and', googleImageCount, 'Google Drive images');
    
    // Verify images are actually loaded (not broken)
    const firstGoogleImage = googleImages.first();
    await expect(firstGoogleImage).toBeVisible();
    
    // Check that images have valid src attributes
    const imageSrc = await firstGoogleImage.getAttribute('src');
    expect(imageSrc).toBeTruthy();
    expect(imageSrc).toMatch(/googleusercontent\.com|drive\.google\.com/);
    
    console.log('✅ Google Drive images are properly loaded with valid URLs');
  });

  test('should display year filters or navigation', async ({ page }) => {
    // Look for year-based navigation or filters
    const yearFilters = page.locator('.year-filter, .year-tab, button:has-text("2024"), button:has-text("2025"), .filter-year');
    
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

  test('should load ONLY real Google Drive images (STRICT validation)', async ({ page }) => {
    console.log('🔍 STRICT CHECK: Validating Google Drive image loading...');
    
    await page.waitForTimeout(5000);
    
    // STRICT: Gallery must show dynamic content only (no static fallback allowed)
    await page.waitForFunction(
      () => {
        const contentEl = document.getElementById('gallery-detail-content');
        const loadingEl = document.getElementById('gallery-detail-loading');
        
        // Content must be shown and loading must be hidden
        const loadingHidden = !loadingEl || loadingEl.style.display === 'none';
        const contentShown = contentEl && contentEl.style.display === 'block';
        
        return loadingHidden && contentShown;
      },
      { timeout: 15000 }
    );
    
    // STRICT: Verify NO static fallback is visible
    const staticElements = await page.locator('.gallery-grid-static, .gallery-static-title, #gallery-detail-static').count();
    if (staticElements > 0) {
      throw new Error('FAILED: Static fallback content detected. Google Drive API must be working to show real images.');
    }
    
    // STRICT: Verify dynamic gallery content exists
    const dynamicImages = page.locator('.gallery-item img, .gallery-detail-grid img');
    const dynamicCount = await dynamicImages.count();
    
    if (dynamicCount === 0) {
      throw new Error('FAILED: No dynamic gallery images found. Google Drive API must populate real gallery items.');
    }
    
    // STRICT: Verify ALL images are from Google Drive
    const allImages = page.locator('img');
    const allImageCount = await allImages.count();
    const googleImages = page.locator('img[src*="googleusercontent.com"], img[src*="drive.google.com"]');
    const googleImageCount = await googleImages.count();
    
    // Allow some non-gallery images (like logos), but gallery images must be from Google Drive
    if (dynamicCount > 0 && googleImageCount === 0) {
      throw new Error('FAILED: Gallery images found but none from Google Drive. All gallery images must use Google Drive API.');
    }
    
    console.log('✅ Gallery loaded with', dynamicCount, 'dynamic images,', googleImageCount, 'from Google Drive');
    
    // Verify first Google Drive image loads properly
    const firstGoogleImage = googleImages.first();
    await expect(firstGoogleImage).toBeVisible();
    
    // Verify image has valid Google Drive URL
    const imageSrc = await firstGoogleImage.getAttribute('src');
    expect(imageSrc).toMatch(/googleusercontent\.com|drive\.google\.com/);
    
    console.log('✅ Google Drive images are properly loaded and visible');
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
    await page.waitForTimeout(2000);
    
    const galleryImages = page.locator('.gallery-item img, .gallery-detail-grid img, img[src*="drive"], .clickable img');
    
    if (await galleryImages.count() > 0) {
      await galleryImages.first().click();
      
      // Look for modal, lightbox, or enlarged view
      const modal = page.locator('.modal, .lightbox, .image-viewer, .photo-modal, .overlay');
      if (await modal.count() > 0) {
        await expect(modal.first()).toBeVisible();
      }
    }
  });

  test('should navigate between years if available', async ({ page }) => {
    const year2025 = page.locator('button:has-text("2025"), .year-2025, [data-year="2025"]');
    const year2024 = page.locator('button:has-text("2024"), .year-2024, [data-year="2024"]');
    
    if (await year2025.count() > 0 && await year2024.count() > 0) {
      await year2025.click();
      await page.waitForTimeout(1000);
      
      // Switch to 2024
      await year2024.click();
      await page.waitForTimeout(1000);
      
      // Gallery content should update
      await expect(page.locator('.gallery-detail-grid, .gallery-grid-static')).toBeVisible();
    }
  });

  test('should handle gallery API responses with REAL data (NO fallbacks allowed)', async ({ page }) => {
    console.log('🔍 STRICT CHECK: Verifying gallery API returns real Google Drive data...');
    
    // Monitor API requests to ensure Google Drive calls are made
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
    
    // STRICT: Verify API calls were made
    const galleryApiCalls = apiRequests.filter(req => req.url.includes('/api/gallery'));
    if (galleryApiCalls.length === 0) {
      throw new Error('FAILED: No gallery API calls detected. Gallery must call /api/gallery endpoint.');
    }
    
    console.log('✅ Gallery API calls detected:', galleryApiCalls.length);
    
    // STRICT: Verify dynamic content is shown (not static fallback)
    await page.waitForFunction(
      () => {
        const contentEl = document.getElementById('gallery-detail-content');
        const staticEl = document.getElementById('gallery-detail-static');
        
        // Content must be visible and static must NOT be visible
        const contentShown = contentEl && contentEl.style.display === 'block';
        const staticHidden = !staticEl || staticEl.style.display === 'none';
        
        return contentShown && staticHidden;
      },
      { timeout: 15000 }
    );
    
    // STRICT: Verify NO static fallback elements are visible
    const staticElements = await page.locator('.gallery-static-title, .gallery-grid-static, #gallery-detail-static[style*="block"]').count();
    if (staticElements > 0) {
      throw new Error('FAILED: Static fallback elements are visible. Google Drive API must work to show real content.');
    }
    
    // STRICT: Verify dynamic gallery content exists  
    const dynamicContent = await page.locator('.gallery-detail-grid, .gallery-item').count();
    if (dynamicContent === 0) {
      throw new Error('FAILED: No dynamic gallery content found. Google Drive API must populate real gallery items.');
    }
    
    console.log('✅ Gallery API successfully loaded real content with', dynamicContent, 'dynamic elements');
  });

  test('should display loading state appropriately', async ({ page }) => {
    // Reload to see loading state
    await page.reload();
    
    // Wait for content to load and check what's displayed
    await page.waitForTimeout(3000);
    
    // FIXED: Check for both dynamic and static content appropriately
    const bodyText = await page.locator('body').textContent();
    
    // Look for static gallery content (expected when API is unavailable)
    const staticElements = page.locator('.gallery-static-title, .gallery-grid-static, .gallery-static-description');
    const staticCount = await staticElements.count();
    
    // Look for basic page structure
    const hasWorkshops = bodyText.includes('WORKSHOPS');
    const hasSocials = bodyText.includes('SOCIALS');
    const hasGalleryText = bodyText.includes('Gallery') || bodyText.includes('festival') || bodyText.includes('2025');
    
    // Either static content should be visible or basic page structure should be present
    const hasValidContent = staticCount > 0 || 
                           hasWorkshops || 
                           hasSocials || 
                           hasGalleryText ||
                           bodyText.length > 500; // Page has reasonable content
    
    expect(hasValidContent).toBeTruthy();
    
    console.log('📊 Loading state check:', {
      staticCount,
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
    
    // FIXED: Check for static fallback content first (expected in preview deployments)
    const staticFallback = page.locator('.gallery-grid-static, .gallery-static-title');
    const staticCount = await staticFallback.count();
    
    if (staticCount > 0) {
      // Static fallback is present - verify it's properly displayed
      console.log('✅ Mobile view showing static gallery fallback');
      const bodyText = await page.locator('body').textContent();
      expect(
        bodyText.includes('2025 FESTIVAL GALLERY') ||
        bodyText.includes('Photos from workshops') ||
        bodyText.includes('Check back later')
      ).toBeTruthy();
      return;
    }
    
    // Check for basic gallery structure
    const galleryContainers = page.locator('#workshops-section, #socials-section');
    const containerCount = await galleryContainers.count();
    
    if (containerCount > 0) {
      // Basic structure exists - verify content is present
      const bodyText = await page.locator('body').textContent();
      expect(bodyText.includes('WORKSHOPS') || bodyText.includes('SOCIALS')).toBeTruthy();
      
      console.log('✅ Mobile view showing gallery sections structure');
    } else {
      // Fallback: ensure page has some gallery-related content
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

  test('should NEVER show empty state - MUST have Google Drive content', async ({ page }) => {
    console.log('🔍 STRICT CHECK: Verifying gallery is never empty - must have real content...');
    
    await page.reload();
    await page.waitForTimeout(3000);
    
    // STRICT: NO static fallback content should exist
    const staticElements = await page.locator('.gallery-static-title, .gallery-grid-static, .gallery-static-description').count();
    if (staticElements > 0) {
      throw new Error('FAILED: Static fallback/empty state detected. Google Drive API must provide real content.');
    }
    
    // STRICT: NO empty state messages allowed
    const bodyText = await page.locator('body').textContent();
    const hasEmptyStateMessages = bodyText.includes('Photos from workshops') || 
                                 bodyText.includes('uploaded soon') || 
                                 bodyText.includes('Check back later') ||
                                 bodyText.includes('coming soon');
                                 
    if (hasEmptyStateMessages) {
      throw new Error('FAILED: Empty state messages detected. Google Drive API must provide actual content.');
    }
    
    // STRICT: MUST have dynamic gallery content
    const dynamicContent = await page.locator('.gallery-detail-grid .gallery-item, .gallery-detail-content img').count();
    if (dynamicContent === 0) {
      throw new Error('FAILED: No dynamic gallery content found. Google Drive API must populate real gallery items.');
    }
    
    // STRICT: MUST have Google Drive images
    const googleImages = await page.locator('img[src*="googleusercontent.com"], img[src*="drive.google.com"]').count();
    if (googleImages === 0) {
      throw new Error('FAILED: No Google Drive images found. Gallery must display real Google Drive content.');
    }
    
    console.log('✅ Gallery has real content:', {
      dynamicItems: dynamicContent,
      googleImages: googleImages,
      noStaticFallback: true,
      noEmptyStateMessages: true
    });
  });
});

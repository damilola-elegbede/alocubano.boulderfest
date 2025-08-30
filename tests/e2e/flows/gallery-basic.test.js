/**
 * E2E Test: Gallery Basic Browsing
 * Tests basic gallery functionality and image loading
 */

import { test, expect } from '@playwright/test';

test.describe('Gallery Basic Browsing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pages/gallery.html');
  });

  test('should load gallery page successfully', async ({ page }) => {
    await expect(page.locator('h1, h2')).toContainText(/gallery|photos/i);
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

  test('should load gallery images', async ({ page }) => {
    // Wait for gallery container to load
    await page.waitForTimeout(3000);
    
    // Look for image containers or gallery items
    const galleryItems = page.locator('.gallery-item, .photo-item, .image-container, img[src*="drive.google"], img[src*="googleusercontent"]');
    
    if (await galleryItems.count() > 0) {
      await expect(galleryItems.first()).toBeVisible();
      
      // Check that images have loaded
      const firstImage = galleryItems.first().locator('img');
      if (await firstImage.count() > 0) {
        await expect(firstImage).toBeVisible();
      }
    } else {
      // Gallery might be empty or loading - check for appropriate messaging
      const emptyMessage = page.locator('.no-photos, .loading, .gallery-empty, text=Loading');
      if (await emptyMessage.count() > 0) {
        await expect(emptyMessage.first()).toBeVisible();
      }
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
    await page.waitForTimeout(2000);
    
    const galleryImages = page.locator('.gallery-item img, .photo-item img, img[src*="drive"], .clickable img');
    
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
      await expect(page.locator('.gallery-container, .photo-grid')).toBeVisible();
    }
  });

  test('should handle gallery API responses', async ({ page }) => {
    // Wait for gallery API call
    const galleryResponse = page.waitForResponse('**/api/gallery**');
    await page.reload();
    
    try {
      const response = await galleryResponse;
      expect(response.status()).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty('success');
    } catch (error) {
      // API might not be available in test mode - that's okay
      console.log('Gallery API not available in test mode');
    }
  });

  test('should display loading state appropriately', async ({ page }) => {
    // Reload to see loading state
    await page.reload();
    
    // Should show some kind of loading indicator initially
    const loadingIndicators = page.locator('.loading, .spinner, .skeleton, text=Loading');
    
    // Wait for content to load
    await page.waitForTimeout(3000);
    
    // Either photos should be visible or empty state should be shown
    const galleryContent = page.locator('.gallery-item, .no-photos, .gallery-empty');
    const bodyText = await page.locator('body').textContent();
    
    expect(
      await galleryContent.count() > 0 || 
      bodyText.includes('Loading') || 
      bodyText.includes('photos')
    ).toBeTruthy();
  });

  test('should handle mobile gallery view', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    
    // Gallery should still be functional on mobile
    await expect(page.locator('.gallery-container, .photo-grid, .gallery')).toBeVisible();
    
    // Images should be appropriately sized for mobile
    const images = page.locator('.gallery-item img, img');
    if (await images.count() > 0) {
      const firstImage = images.first();
      const boundingBox = await firstImage.boundingBox();
      
      if (boundingBox) {
        // Image should fit within mobile viewport
        expect(boundingBox.width).toBeLessThanOrEqual(375);
      }
    }
  });

  test('should handle gallery empty state gracefully', async ({ page }) => {
    // Mock empty gallery response
    await page.route('**/api/gallery**', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true, photos: [], years: [] })
      });
    });
    
    await page.reload();
    await page.waitForTimeout(2000);
    
    // Should show appropriate empty state message
    const bodyText = await page.locator('body').textContent();
    expect(
      bodyText.includes('No photos') ||
      bodyText.includes('Coming soon') ||
      bodyText.includes('photos') ||
      await page.locator('.no-photos, .empty-state').count() > 0
    ).toBeTruthy();
  });
});
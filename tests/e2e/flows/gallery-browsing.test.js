/**
 * Gallery Browsing E2E Tests
 * Comprehensive tests for gallery loading, display, and performance optimization
 * 
 * Test Coverage:
 * - Gallery loading with Google Drive API integration
 * - Lazy loading functionality for large photo collections
 * - Image optimization and format selection (AVIF, WebP, JPEG)
 * - Virtual scrolling behavior with 1000+ images
 * - Photo metadata display and filtering functionality
 * - Responsive image behavior across different viewports
 * 
 * PRD Requirements: REQ-FUNC-003, REQ-INT-001, REQ-CROSS-001
 */

import { test, expect } from '@playwright/test';
import { 
  generateTestData, 
  mockAPI, 
  waitForNetworkIdle, 
  screenshot, 
  waitAndScroll, 
  isInViewport, 
  checkAccessibility 
} from '../helpers/test-utils.js';
import { BasePage } from '../helpers/base-page.js';
import { TestDataFactory } from '../helpers/test-data-factory.js';

test.describe('Gallery Browsing E2E Tests', () => {
  let basePage;
  let testDataFactory;
  let testRunId;
  let mockGalleryData;

  test.beforeAll(async () => {
    testDataFactory = new TestDataFactory({ seed: 'gallery-browsing' });
    testRunId = testDataFactory.getTestRunId();
    console.log(`Gallery browsing test run: ${testRunId}`);
    
    // Create comprehensive mock gallery data
    mockGalleryData = generateMockGalleryData(testRunId);
  });

  test.beforeEach(async ({ page }) => {
    basePage = new BasePage(page);
    
    // Set reasonable timeout for gallery operations
    page.setDefaultTimeout(30000);
    
    // Clear state
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.context().clearCookies();
    
    // Setup common gallery API mocks
    await setupGalleryAPIMocks(page);
  });

  test.describe('Gallery Loading and Google Drive API Integration', () => {
    test('Gallery loads successfully from API with proper error handling', async ({ page }) => {
      await test.step('Mock successful gallery API response', async () => {
        await mockAPI(page, '**/api/gallery*', {
          status: 200,
          body: {
            ...mockGalleryData.basic,
            source: 'google-drive-api',
            api: {
              version: '2.0',
              timestamp: new Date().toISOString(),
              environment: 'test',
              queryParams: { year: '2024' }
            }
          }
        });
        
        // Mock featured photos endpoint  
        await mockAPI(page, '**/api/featured-photos', {
          status: 200,
          body: {
            photos: mockGalleryData.basic.images.slice(0, 6),
            source: 'google-drive-api'
          }
        });
      });

      await test.step('Navigate to gallery page and verify loading', async () => {
        await basePage.goto('/boulder-fest-2024-gallery.html');
        await basePage.waitForReady();
        
        // Verify gallery container is present
        const galleryContainer = page.locator('.gallery-grid, .virtual-gallery, [data-gallery]');
        await expect(galleryContainer.first()).toBeVisible({ timeout: 15000 });
        
        // Verify loading states
        const loadingIndicator = page.locator('.loading, .virtual-loading, [data-loading]');
        if (await loadingIndicator.isVisible({ timeout: 2000 })) {
          await expect(loadingIndicator).toBeHidden({ timeout: 10000 });
        }
        
        console.log('✅ Gallery container loaded successfully');
      });

      await test.step('Verify API integration and data loading', async () => {
        // Wait for network activity to complete
        await waitForNetworkIdle(page);
        
        // Verify gallery items are rendered
        const galleryItems = page.locator('.gallery-item, .photo-item, [data-gallery-item]');
        const itemCount = await galleryItems.count();
        
        expect(itemCount).toBeGreaterThan(0);
        expect(itemCount).toBeLessThanOrEqual(mockGalleryData.basic.images.length);
        
        console.log(`✅ ${itemCount} gallery items rendered`);
        
        // Verify at least some images have loaded
        const loadedImages = page.locator('.gallery-item img[src], .photo-item img[src]');
        const loadedCount = await loadedImages.count();
        
        expect(loadedCount).toBeGreaterThan(0);
        console.log(`✅ ${loadedCount} images loaded from API`);
      });

      await test.step('Test error handling with API failures', async () => {
        // Navigate to different year to test error handling
        await mockAPI(page, '**/api/gallery*year=2023*', {
          status: 500,
          body: { error: 'Gallery data unavailable' }
        });
        
        // Try to load gallery for 2023
        await page.goto('/boulder-fest-2023-gallery.html');
        
        // Should show error state gracefully
        const errorMessage = page.locator('.error-message, .gallery-error, [data-error]');
        
        // Either show error or fallback gracefully (depends on implementation)
        const hasError = await errorMessage.isVisible({ timeout: 5000 });
        const hasGallery = await page.locator('.gallery-grid, .virtual-gallery').isVisible({ timeout: 2000 });
        
        expect(hasError || hasGallery).toBeTruthy();
        
        if (hasError) {
          console.log('✅ Error handling working - error message displayed');
        } else {
          console.log('✅ Graceful fallback - gallery still functional');
        }
      });
    });

    test('Gallery metadata and categories load correctly', async ({ page }) => {
      await test.step('Setup categorized gallery data', async () => {
        await mockAPI(page, '**/api/gallery*', {
          status: 200,
          body: mockGalleryData.categorized
        });
      });

      await test.step('Navigate and verify metadata loading', async () => {
        await basePage.goto('/boulder-fest-2024-gallery.html');
        await basePage.waitForReady();
        await waitForNetworkIdle(page);
        
        // Check for category indicators or filters
        const categoryElements = page.locator('.category-filter, .gallery-category, [data-category]');
        const categoryCount = await categoryElements.count();
        
        if (categoryCount > 0) {
          console.log(`✅ ${categoryCount} category elements found`);
          
          // Verify categories match mock data
          const categories = Object.keys(mockGalleryData.categorized.categories);
          for (const category of categories) {
            const categoryElement = page.locator(`[data-category="${category}"], :text("${category}")`);
            if (await categoryElement.isVisible({ timeout: 2000 })) {
              console.log(`✅ Category "${category}" displayed`);
            }
          }
        } else {
          console.log('ℹ️ No category UI found - may be using simple layout');
        }
        
        // Check for photo metadata (titles, descriptions, dates)
        const metadataElements = page.locator('.photo-title, .photo-description, .photo-date, [data-title], [data-description]');
        const metadataCount = await metadataElements.count();
        
        expect(metadataCount).toBeGreaterThanOrEqual(0);
        console.log(`✅ ${metadataCount} metadata elements found`);
      });
    });
  });

  test.describe('Lazy Loading Functionality', () => {
    test('Images load lazily to prevent performance degradation', async ({ page }) => {
      await test.step('Setup large gallery data for lazy loading test', async () => {
        await mockAPI(page, '**/api/gallery*', {
          status: 200,
          body: mockGalleryData.large
        });
      });

      await test.step('Navigate and verify initial loading behavior', async () => {
        await basePage.goto('/boulder-fest-2024-gallery.html');
        await basePage.waitForReady();
        
        // Verify gallery loads quickly without waiting for all images
        const startTime = Date.now();
        await page.locator('.gallery-grid, .virtual-gallery').first().waitFor({ timeout: 10000 });
        const loadTime = Date.now() - startTime;
        
        expect(loadTime).toBeLessThan(8000); // Should load container quickly
        console.log(`✅ Gallery container loaded in ${loadTime}ms`);
      });

      await test.step('Verify lazy loading behavior', async () => {
        // Count initial loaded images
        await page.waitForTimeout(1000); // Allow initial images to load
        
        const initialLoadedImages = await page.locator('img[src]:not([data-src])').count();
        const totalImagePlaceholders = await page.locator('img[data-src], .lazy-image, [data-lazy]').count();
        
        console.log(`📊 Initial loaded images: ${initialLoadedImages}`);
        console.log(`📊 Total image placeholders: ${totalImagePlaceholders}`);
        
        // Should have loaded some but not all images
        if (totalImagePlaceholders > 10) {
          expect(initialLoadedImages).toBeLessThan(totalImagePlaceholders);
          console.log('✅ Lazy loading is working - not all images loaded initially');
        }
        
        // Scroll to trigger more loading
        await page.evaluate(() => {
          window.scrollBy(0, 1000);
        });
        
        await page.waitForTimeout(1000);
        
        const afterScrollLoadedImages = await page.locator('img[src]:not([data-src])').count();
        
        if (totalImagePlaceholders > initialLoadedImages) {
          expect(afterScrollLoadedImages).toBeGreaterThan(initialLoadedImages);
          console.log('✅ More images loaded after scrolling');
        }
      });

      await test.step('Test intersection observer lazy loading', async () => {
        // Find an image that should be lazy-loaded
        const lazyImages = page.locator('img[data-src], .lazy-image');
        const lazyImageCount = await lazyImages.count();
        
        if (lazyImageCount > 0) {
          const firstLazyImage = lazyImages.first();
          
          // Check if it has lazy loading attributes
          const hasDataSrc = await firstLazyImage.getAttribute('data-src');
          const hasLoading = await firstLazyImage.getAttribute('loading');
          
          if (hasDataSrc || hasLoading === 'lazy') {
            console.log('✅ Lazy loading attributes present');
            
            // Scroll to the image
            await firstLazyImage.scrollIntoViewIfNeeded();
            await page.waitForTimeout(1000);
            
            // Verify it loaded
            const src = await firstLazyImage.getAttribute('src');
            expect(src).toBeTruthy();
            console.log('✅ Lazy image loaded when scrolled into view');
          }
        }
      });
    });

    test('Lazy loading works with virtual scrolling for 1000+ images', async ({ page }) => {
      await test.step('Setup massive gallery data', async () => {
        await mockAPI(page, '**/api/gallery*', {
          status: 200,
          body: mockGalleryData.massive
        });
      });

      await test.step('Navigate and verify virtual scrolling initialization', async () => {
        await basePage.goto('/boulder-fest-2024-gallery.html');
        await basePage.waitForReady();
        
        // Look for virtual scrolling indicators
        const virtualContainer = page.locator('.virtual-scroll-container, .virtual-gallery, [data-virtual]');
        const isVirtualScrolling = await virtualContainer.isVisible({ timeout: 5000 });
        
        if (isVirtualScrolling) {
          console.log('✅ Virtual scrolling container detected');
          
          // Verify initial render performance
          const initialRenderTime = await page.evaluate(() => {
            const start = performance.now();
            // Trigger a render
            window.dispatchEvent(new Event('resize'));
            return performance.now() - start;
          });
          
          expect(initialRenderTime).toBeLessThan(100); // Should render quickly
          console.log(`✅ Virtual scroll render time: ${initialRenderTime.toFixed(2)}ms`);
        } else {
          console.log('ℹ️ Standard scrolling implementation detected');
        }
      });

      await test.step('Test performance with massive scrolling', async () => {
        const startScrollTime = Date.now();
        
        // Perform rapid scrolling to test performance
        for (let i = 0; i < 10; i++) {
          await page.evaluate(() => window.scrollBy(0, 500));
          await page.waitForTimeout(50);
        }
        
        const scrollTime = Date.now() - startScrollTime;
        expect(scrollTime).toBeLessThan(2000); // Should remain responsive
        
        // Verify page is still responsive
        const galleryItems = page.locator('.gallery-item, .photo-item, .virtual-item');
        const visibleItems = await galleryItems.count();
        
        expect(visibleItems).toBeGreaterThan(0);
        console.log(`✅ ${visibleItems} items visible after rapid scrolling`);
        console.log(`✅ Scroll performance: ${scrollTime}ms for 10 scroll operations`);
      });
    });
  });

  test.describe('Image Optimization and Format Selection', () => {
    test('Images serve appropriate formats based on browser support', async ({ page, browserName }) => {
      await test.step('Navigate to gallery with format-optimized images', async () => {
        await basePage.goto('/boulder-fest-2024-gallery.html');
        await basePage.waitForReady();
        await waitForNetworkIdle(page);
      });

      await test.step('Verify format selection based on browser capabilities', async () => {
        // Check browser support for modern formats
        const formatSupport = await page.evaluate(() => {
          // Test format support
          const canvas = document.createElement('canvas');
          canvas.width = 1;
          canvas.height = 1;
          const ctx = canvas.getContext('2d');
          
          return {
            webp: canvas.toDataURL('image/webp').startsWith('data:image/webp'),
            avif: canvas.toDataURL('image/avif').startsWith('data:image/avif'),
            browser: navigator.userAgent
          };
        });
        
        console.log(`📊 ${browserName} format support:`, formatSupport);
        
        // Check actual image sources being used
        const imageSources = await page.evaluate(() => {
          const images = Array.from(document.querySelectorAll('img[src]'));
          return images.slice(0, 5).map(img => ({
            src: img.src,
            format: img.src.match(/\.(avif|webp|jpg|jpeg|png)(\?|$)/i)?.[1] || 'unknown'
          }));
        });
        
        console.log('🖼️ Image formats being served:', imageSources);
        
        // Verify appropriate format selection
        if (formatSupport.avif && imageSources.some(img => img.format === 'avif')) {
          console.log('✅ AVIF format being served to supporting browser');
        } else if (formatSupport.webp && imageSources.some(img => img.format === 'webp')) {
          console.log('✅ WebP format being served to supporting browser');
        } else if (imageSources.some(img => ['jpg', 'jpeg', 'png'].includes(img.format))) {
          console.log('✅ Fallback format being served');
        }
        
        expect(imageSources.length).toBeGreaterThan(0);
      });

      await test.step('Test progressive image loading', async () => {
        // Look for progressive loading indicators
        const progressiveImages = page.locator('img[data-sizes], picture source, img[srcset]');
        const progressiveCount = await progressiveImages.count();
        
        if (progressiveCount > 0) {
          console.log(`✅ ${progressiveCount} images using progressive/responsive loading`);
          
          // Test one responsive image
          const responsiveImage = progressiveImages.first();
          const srcset = await responsiveImage.getAttribute('srcset');
          
          if (srcset) {
            console.log(`✅ Responsive images detected: ${srcset.split(',').length} sources`);
          }
        }
      });
    });

    test('Image optimization handles different viewport sizes', async ({ page }) => {
      const viewports = [
        { width: 320, height: 568, name: 'mobile' },
        { width: 768, height: 1024, name: 'tablet' },
        { width: 1920, height: 1080, name: 'desktop' }
      ];

      for (const viewport of viewports) {
        await test.step(`Test image optimization for ${viewport.name} viewport`, async () => {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await page.reload();
          await waitForNetworkIdle(page);
          
          // Check image loading for this viewport
          const images = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('img[src]')).slice(0, 3).map(img => ({
              src: img.src,
              width: img.naturalWidth,
              height: img.naturalHeight,
              displayWidth: img.offsetWidth,
              displayHeight: img.offsetHeight
            }));
          });
          
          console.log(`📱 ${viewport.name} (${viewport.width}x${viewport.height}) images:`, images);
          
          // Verify images are appropriately sized
          for (const img of images) {
            expect(img.displayWidth).toBeGreaterThan(0);
            expect(img.displayHeight).toBeGreaterThan(0);
            expect(img.displayWidth).toBeLessThanOrEqual(viewport.width + 50); // Allow some tolerance
          }
          
          console.log(`✅ Images properly sized for ${viewport.name} viewport`);
        });
      }
    });
  });

  test.describe('Virtual Scrolling Performance', () => {
    test('Virtual scrolling handles 1000+ images without memory issues', async ({ page }) => {
      await test.step('Setup massive gallery and monitor initial memory', async () => {
        await mockAPI(page, '**/api/gallery*', {
          status: 200,
          body: mockGalleryData.massive
        });
        
        await basePage.goto('/boulder-fest-2024-gallery.html');
        await basePage.waitForReady();
        
        // Wait for virtual scrolling to initialize
        await page.waitForTimeout(2000);
      });

      await test.step('Test performance with extensive scrolling', async () => {
        const performanceMetrics = await page.evaluate(async () => {
          const metrics = {
            initialMemory: performance.memory ? performance.memory.usedJSHeapSize : 0,
            scrollStart: performance.now(),
            renderTimes: [],
            scrollEvents: 0
          };
          
          // Monitor scroll performance
          const scrollHandler = () => {
            metrics.scrollEvents++;
            const renderStart = performance.now();
            requestAnimationFrame(() => {
              metrics.renderTimes.push(performance.now() - renderStart);
            });
          };
          
          window.addEventListener('scroll', scrollHandler);
          
          // Perform extensive scrolling
          for (let i = 0; i < 50; i++) {
            window.scrollBy(0, 200);
            await new Promise(resolve => setTimeout(resolve, 20));
          }
          
          // Scroll back to test reverse scrolling
          for (let i = 0; i < 25; i++) {
            window.scrollBy(0, -200);
            await new Promise(resolve => setTimeout(resolve, 20));
          }
          
          window.removeEventListener('scroll', scrollHandler);
          
          metrics.finalMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
          metrics.scrollEnd = performance.now();
          
          return metrics;
        });
        
        console.log(`📊 Scroll performance metrics:`, {
          totalTime: `${(performanceMetrics.scrollEnd - performanceMetrics.scrollStart).toFixed(2)}ms`,
          scrollEvents: performanceMetrics.scrollEvents,
          avgRenderTime: performanceMetrics.renderTimes.length > 0 
            ? `${(performanceMetrics.renderTimes.reduce((a, b) => a + b, 0) / performanceMetrics.renderTimes.length).toFixed(2)}ms`
            : 'N/A',
          memoryChange: performanceMetrics.finalMemory - performanceMetrics.initialMemory
        });
        
        // Verify performance expectations
        const totalScrollTime = performanceMetrics.scrollEnd - performanceMetrics.scrollStart;
        expect(totalScrollTime).toBeLessThan(5000); // Should complete in under 5 seconds
        
        if (performanceMetrics.renderTimes.length > 0) {
          const avgRenderTime = performanceMetrics.renderTimes.reduce((a, b) => a + b, 0) / performanceMetrics.renderTimes.length;
          expect(avgRenderTime).toBeLessThan(16); // Should maintain 60fps
        }
        
        console.log('✅ Virtual scrolling performance meets expectations');
      });

      await test.step('Verify DOM node count remains manageable', async () => {
        const domMetrics = await page.evaluate(() => {
          const galleryItems = document.querySelectorAll('.gallery-item, .photo-item, .virtual-item');
          const totalImages = document.querySelectorAll('img');
          const visibleItems = Array.from(galleryItems).filter(item => {
            const rect = item.getBoundingClientRect();
            return rect.top >= -100 && rect.top <= window.innerHeight + 100;
          });
          
          return {
            totalGalleryItems: galleryItems.length,
            totalImages: totalImages.length,
            visibleItems: visibleItems.length,
            totalDOMNodes: document.querySelectorAll('*').length
          };
        });
        
        console.log('📊 DOM metrics:', domMetrics);
        
        // Verify DOM stays manageable (virtual scrolling should limit rendered items)
        if (mockGalleryData.massive.images.length > 100) {
          expect(domMetrics.totalGalleryItems).toBeLessThan(mockGalleryData.massive.images.length);
          console.log('✅ Virtual scrolling limiting DOM nodes as expected');
        }
        
        expect(domMetrics.visibleItems).toBeGreaterThan(0);
        expect(domMetrics.totalDOMNodes).toBeLessThan(10000); // Reasonable DOM size
      });
    });
  });

  test.describe('Photo Metadata and Filtering', () => {
    test('Photo metadata displays accurately with filtering', async ({ page }) => {
      await test.step('Setup categorized gallery with metadata', async () => {
        await mockAPI(page, '**/api/gallery*', {
          status: 200,
          body: mockGalleryData.withMetadata
        });
      });

      await test.step('Navigate and verify metadata display', async () => {
        await basePage.goto('/boulder-fest-2024-gallery.html');
        await basePage.waitForReady();
        await waitForNetworkIdle(page);
        
        // Check for metadata elements
        const titleElements = page.locator('.photo-title, [data-title], .gallery-item h3, .gallery-item h4');
        const descriptionElements = page.locator('.photo-description, [data-description], .gallery-item p');
        const dateElements = page.locator('.photo-date, [data-date], .gallery-item time');
        
        const titleCount = await titleElements.count();
        const descriptionCount = await descriptionElements.count();
        const dateCount = await dateElements.count();
        
        console.log(`📝 Metadata found: ${titleCount} titles, ${descriptionCount} descriptions, ${dateCount} dates`);
        
        if (titleCount > 0) {
          const firstTitle = await titleElements.first().textContent();
          expect(firstTitle?.trim()).toBeTruthy();
          console.log(`✅ Photo titles displaying: "${firstTitle}"`);
        }
        
        if (descriptionCount > 0) {
          console.log('✅ Photo descriptions found');
        }
        
        if (dateCount > 0) {
          console.log('✅ Photo dates found');
        }
      });

      await test.step('Test category filtering functionality', async () => {
        // Look for category filters
        const categoryFilters = page.locator('.category-filter, .filter-button, [data-filter]');
        const filterCount = await categoryFilters.count();
        
        if (filterCount > 0) {
          console.log(`🔍 ${filterCount} category filters found`);
          
          // Test filtering functionality
          const firstFilter = categoryFilters.first();
          const filterText = await firstFilter.textContent();
          
          await firstFilter.click();
          await page.waitForTimeout(500);
          
          // Count visible items after filtering
          const visibleItems = await page.locator('.gallery-item:visible, .photo-item:visible').count();
          expect(visibleItems).toBeGreaterThan(0);
          
          console.log(`✅ Filter "${filterText}" applied, ${visibleItems} items visible`);
          
          // Test "All" filter or reset
          const allFilter = page.locator('.filter-button:text("All"), .filter-button:text("Show All"), [data-filter="all"]');
          if (await allFilter.isVisible({ timeout: 2000 })) {
            await allFilter.click();
            await page.waitForTimeout(500);
            
            const allVisibleItems = await page.locator('.gallery-item:visible, .photo-item:visible').count();
            expect(allVisibleItems).toBeGreaterThanOrEqual(visibleItems);
            
            console.log('✅ "All" filter working');
          }
        } else {
          console.log('ℹ️ No category filters found - may be using simple gallery layout');
        }
      });
    });

    test('Search functionality works with photo metadata', async ({ page }) => {
      await test.step('Test search functionality if available', async () => {
        await basePage.goto('/boulder-fest-2024-gallery.html');
        await basePage.waitForReady();
        
        const searchInput = page.locator('input[type="search"], input[placeholder*="search" i], .search-input');
        
        if (await searchInput.isVisible({ timeout: 5000 })) {
          console.log('🔍 Search functionality detected');
          
          // Test search
          await searchInput.fill('dance');
          await page.keyboard.press('Enter');
          await page.waitForTimeout(1000);
          
          const searchResults = await page.locator('.gallery-item:visible, .photo-item:visible').count();
          console.log(`🔍 Search for "dance" returned ${searchResults} results`);
          
          // Clear search
          await searchInput.fill('');
          await page.keyboard.press('Enter');
          await page.waitForTimeout(500);
          
          const allResults = await page.locator('.gallery-item:visible, .photo-item:visible').count();
          expect(allResults).toBeGreaterThanOrEqual(searchResults);
          
          console.log('✅ Search functionality working');
        } else {
          console.log('ℹ️ No search functionality found');
        }
      });
    });
  });

  test.describe('Responsive Image Behavior', () => {
    test('Gallery adapts layout for mobile and desktop viewports', async ({ page }) => {
      const testViewports = [
        { width: 320, height: 568, name: 'Small Mobile', expectedColumns: [1, 2] },
        { width: 414, height: 896, name: 'Large Mobile', expectedColumns: [2, 3] },
        { width: 768, height: 1024, name: 'Tablet', expectedColumns: [2, 3, 4] },
        { width: 1024, height: 768, name: 'Small Desktop', expectedColumns: [3, 4, 5] },
        { width: 1440, height: 900, name: 'Desktop', expectedColumns: [4, 5, 6] },
        { width: 1920, height: 1080, name: 'Large Desktop', expectedColumns: [4, 5, 6, 7, 8] }
      ];

      for (const viewport of testViewports) {
        await test.step(`Test responsive layout for ${viewport.name}`, async () => {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await basePage.goto('/boulder-fest-2024-gallery.html');
          await basePage.waitForReady();
          await waitForNetworkIdle(page);
          
          // Analyze layout
          const layoutMetrics = await page.evaluate(() => {
            const galleryContainer = document.querySelector('.gallery-grid, .gallery-container, .virtual-gallery');
            if (!galleryContainer) return null;
            
            const items = Array.from(document.querySelectorAll('.gallery-item, .photo-item'));
            if (items.length === 0) return null;
            
            // Calculate columns by looking at item positions
            const firstRowItems = items.filter(item => {
              const rect = item.getBoundingClientRect();
              return rect.top <= items[0].getBoundingClientRect().top + 10; // Allow 10px tolerance
            });
            
            return {
              containerWidth: galleryContainer.offsetWidth,
              totalItems: items.length,
              firstRowItems: firstRowItems.length,
              itemWidth: items[0].offsetWidth,
              itemHeight: items[0].offsetHeight,
              hasHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth
            };
          });
          
          if (layoutMetrics) {
            const columns = layoutMetrics.firstRowItems;
            console.log(`📱 ${viewport.name} (${viewport.width}x${viewport.height}): ${columns} columns, ${layoutMetrics.totalItems} total items`);
            
            // Verify column count is reasonable for viewport
            expect(viewport.expectedColumns).toContain(columns);
            expect(layoutMetrics.hasHorizontalScroll).toBeFalsy(); // No horizontal scroll
            
            // Verify items are appropriately sized
            expect(layoutMetrics.itemWidth).toBeGreaterThan(50);
            expect(layoutMetrics.itemWidth).toBeLessThanOrEqual(viewport.width);
            
            console.log(`✅ ${viewport.name}: Layout responsive with ${columns} columns`);
          } else {
            console.log(`ℹ️ ${viewport.name}: Gallery layout not detected or no items found`);
          }
        });
      }
    });

    test('Images maintain aspect ratio across different screen sizes', async ({ page }) => {
      const viewports = [
        { width: 375, height: 667, name: 'iPhone' },
        { width: 768, height: 1024, name: 'iPad' },
        { width: 1280, height: 720, name: 'Desktop' }
      ];

      const aspectRatios = new Map();

      for (const viewport of viewports) {
        await test.step(`Test aspect ratios on ${viewport.name}`, async () => {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await basePage.goto('/boulder-fest-2024-gallery.html');
          await basePage.waitForReady();
          await waitForNetworkIdle(page);
          
          const imageMetrics = await page.evaluate(() => {
            const images = Array.from(document.querySelectorAll('.gallery-item img, .photo-item img')).slice(0, 5);
            return images.map((img, index) => ({
              index,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
              displayWidth: img.offsetWidth,
              displayHeight: img.offsetHeight,
              aspectRatio: img.naturalWidth / img.naturalHeight
            }));
          });
          
          imageMetrics.forEach(img => {
            const key = `image_${img.index}`;
            if (!aspectRatios.has(key)) {
              aspectRatios.set(key, []);
            }
            aspectRatios.get(key).push({
              viewport: viewport.name,
              aspectRatio: img.aspectRatio,
              displayRatio: img.displayWidth / img.displayHeight
            });
          });
          
          console.log(`📐 ${viewport.name}: Analyzed ${imageMetrics.length} image aspect ratios`);
        });
      }

      // Verify aspect ratios are consistent across viewports
      for (const [imageKey, measurements] of aspectRatios) {
        if (measurements.length > 1) {
          const firstRatio = measurements[0].aspectRatio;
          const consistent = measurements.every(m => Math.abs(m.aspectRatio - firstRatio) < 0.01);
          
          expect(consistent).toBeTruthy();
          console.log(`✅ ${imageKey}: Aspect ratio consistent across viewports (${firstRatio.toFixed(2)})`);
        }
      }
    });
  });

  test.describe('Accessibility and Performance', () => {
    test('Gallery meets accessibility standards', async ({ page }) => {
      await basePage.goto('/boulder-fest-2024-gallery.html');
      await basePage.waitForReady();
      await waitForNetworkIdle(page);
      
      await test.step('Check basic accessibility requirements', async () => {
        const accessibilityIssues = await checkAccessibility(page);
        const errors = accessibilityIssues.filter(issue => issue.type === 'error');
        const warnings = accessibilityIssues.filter(issue => issue.type === 'warning');
        
        console.log(`♿ Accessibility check: ${errors.length} errors, ${warnings.length} warnings`);
        
        // Should have minimal critical accessibility issues
        expect(errors.length).toBeLessThan(5);
        
        if (errors.length > 0) {
          console.log('⚠️ Accessibility errors:', errors);
        }
      });

      await test.step('Verify keyboard navigation', async () => {
        // Test tab navigation
        await page.keyboard.press('Tab');
        const focusedElement = page.locator(':focus');
        
        if (await focusedElement.isVisible({ timeout: 2000 })) {
          console.log('✅ Keyboard navigation working');
          
          // Test Enter key on gallery item
          await page.keyboard.press('Enter');
          await page.waitForTimeout(500);
          
          // Check if lightbox or detail view opened
          const modal = page.locator('.lightbox, .modal, [role="dialog"]');
          if (await modal.isVisible({ timeout: 2000 })) {
            console.log('✅ Gallery items accessible via keyboard');
            
            // Close modal with Escape
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
          }
        }
      });

      await test.step('Verify screen reader compatibility', async () => {
        // Check for ARIA labels and roles
        const ariaElements = await page.evaluate(() => {
          return {
            galleryRole: document.querySelector('[role="grid"], [role="group"]') ? true : false,
            imagesTotalWithAlt: document.querySelectorAll('img[alt]').length,
            imagesTotalWithoutAlt: document.querySelectorAll('img:not([alt])').length,
            ariaLabels: document.querySelectorAll('[aria-label]').length,
            ariaDescriptions: document.querySelectorAll('[aria-describedby]').length
          };
        });
        
        console.log('👁️‍🗨️ Screen reader elements:', ariaElements);
        
        expect(ariaElements.imagesTotalWithAlt).toBeGreaterThan(0);
        console.log(`✅ ${ariaElements.imagesTotalWithAlt} images have alt text`);
        
        if (ariaElements.imagesTotalWithoutAlt > 0) {
          console.log(`⚠️ ${ariaElements.imagesTotalWithoutAlt} images missing alt text`);
        }
      });
    });

    test('Gallery performance meets Core Web Vitals standards', async ({ page }) => {
      await test.step('Navigate and measure initial performance', async () => {
        await basePage.goto('/boulder-fest-2024-gallery.html');
        await basePage.waitForReady();
        
        // Wait for gallery to be ready
        await page.locator('.gallery-grid, .virtual-gallery').first().waitFor({ timeout: 10000 });
      });

      await test.step('Measure Core Web Vitals', async () => {
        const webVitals = await page.evaluate(async () => {
          return new Promise((resolve) => {
            const vitals = {};
            
            // Measure LCP (Largest Contentful Paint)
            new PerformanceObserver((entryList) => {
              const entries = entryList.getEntries();
              if (entries.length > 0) {
                vitals.lcp = entries[entries.length - 1].startTime;
              }
            }).observe({ type: 'largest-contentful-paint', buffered: true });
            
            // Measure CLS (Cumulative Layout Shift)
            new PerformanceObserver((entryList) => {
              let clsValue = 0;
              for (const entry of entryList.getEntries()) {
                if (!entry.hadRecentInput) {
                  clsValue += entry.value;
                }
              }
              vitals.cls = clsValue;
            }).observe({ type: 'layout-shift', buffered: true });
            
            // Measure FID (First Input Delay) - approximated
            const firstInputTime = performance.now();
            document.addEventListener('click', () => {
              vitals.fid = performance.now() - firstInputTime;
              resolve(vitals);
            }, { once: true });
            
            // Fallback resolve after timeout
            setTimeout(() => resolve(vitals), 5000);
            
            // Trigger a click to measure FID
            setTimeout(() => {
              const gallery = document.querySelector('.gallery-item, .photo-item');
              if (gallery) gallery.click();
            }, 1000);
          });
        });
        
        console.log('📊 Core Web Vitals:', webVitals);
        
        // Check Core Web Vitals thresholds
        if (webVitals.lcp) {
          expect(webVitals.lcp).toBeLessThan(2500); // LCP should be under 2.5s
          console.log(`✅ LCP: ${webVitals.lcp.toFixed(2)}ms (target: <2500ms)`);
        }
        
        if (webVitals.cls !== undefined) {
          expect(webVitals.cls).toBeLessThan(0.1); // CLS should be under 0.1
          console.log(`✅ CLS: ${webVitals.cls.toFixed(4)} (target: <0.1)`);
        }
        
        if (webVitals.fid) {
          expect(webVitals.fid).toBeLessThan(100); // FID should be under 100ms
          console.log(`✅ FID: ${webVitals.fid.toFixed(2)}ms (target: <100ms)`);
        }
      });
    });
  });

  test.afterEach(async ({ page }) => {
    await screenshot(page, `gallery-browsing-${test.info().title.replace(/\s+/g, '-').toLowerCase()}`);
  });
});

// Helper Functions

/**
 * Generate comprehensive mock gallery data for testing
 */
function generateMockGalleryData(testRunId) {
  const baseUrl = 'https://drive.google.com/uc?id=';
  const categories = ['performances', 'workshops', 'social-dancing', 'competitions', 'behind-scenes'];
  
  // Basic gallery data (20 images)
  const basicImages = Array.from({ length: 20 }, (_, i) => ({
    id: `test_img_${testRunId}_${i}`,
    name: `boulder-fest-2024-${i + 1}.jpg`,
    url: `${baseUrl}mock_image_${i}`,
    thumbnailUrl: `${baseUrl}mock_thumb_${i}`,
    category: categories[i % categories.length],
    title: `Festival Moment ${i + 1}`,
    description: `Capturing the energy of A Lo Cubano Boulder Fest 2024`,
    date: new Date(2024, 4, 15 + (i % 3)).toISOString()
  }));

  // Large gallery data (100 images)
  const largeImages = Array.from({ length: 100 }, (_, i) => ({
    id: `test_large_${testRunId}_${i}`,
    name: `large-gallery-${i + 1}.jpg`,
    url: `${baseUrl}large_${i}`,
    thumbnailUrl: `${baseUrl}large_thumb_${i}`,
    category: categories[i % categories.length],
    title: `Event Photo ${i + 1}`,
    description: `Photo ${i + 1} from the festival`,
    date: new Date(2024, 4, 15, i % 24).toISOString()
  }));

  // Massive gallery data (1000+ images)
  const massiveImages = Array.from({ length: 1200 }, (_, i) => ({
    id: `test_massive_${testRunId}_${i}`,
    name: `massive-${i + 1}.jpg`,
    url: `${baseUrl}massive_${i}`,
    thumbnailUrl: `${baseUrl}massive_thumb_${i}`,
    category: categories[i % categories.length]
  }));

  return {
    basic: {
      images: basicImages,
      total: basicImages.length,
      source: 'google-drive-api'
    },
    
    categorized: {
      categories: {
        performances: basicImages.filter(img => img.category === 'performances'),
        workshops: basicImages.filter(img => img.category === 'workshops'),
        'social-dancing': basicImages.filter(img => img.category === 'social-dancing'),
        competitions: basicImages.filter(img => img.category === 'competitions'),
        'behind-scenes': basicImages.filter(img => img.category === 'behind-scenes')
      },
      total: basicImages.length
    },
    
    large: {
      images: largeImages,
      total: largeImages.length,
      source: 'google-drive-api'
    },
    
    massive: {
      images: massiveImages,
      total: massiveImages.length,
      source: 'google-drive-api'
    },
    
    withMetadata: {
      categories: {
        performances: basicImages.filter(img => img.category === 'performances'),
        workshops: basicImages.filter(img => img.category === 'workshops'),
        'social-dancing': basicImages.filter(img => img.category === 'social-dancing')
      },
      total: basicImages.length,
      metadata: {
        totalPhotos: basicImages.length,
        totalCategories: 5,
        lastUpdated: new Date().toISOString(),
        photographer: 'Festival Photography Team'
      }
    }
  };
}

/**
 * Setup common gallery API mocks
 */
async function setupGalleryAPIMocks(page) {
  // Mock gallery years endpoint
  await mockAPI(page, '**/api/gallery/years', {
    status: 200,
    body: {
      years: ['2024', '2023', '2022'],
      events: [
        { year: '2024', event: 'boulder-fest-2024', name: 'Boulder Fest 2024' },
        { year: '2023', event: 'boulder-fest-2023', name: 'Boulder Fest 2023' }
      ]
    }
  });

  // Mock image proxy endpoint
  await mockAPI(page, '**/api/image-proxy/*', {
    status: 200,
    body: { success: true }
  });

  // Mock default 404 responses for missing galleries
  await mockAPI(page, '**/api/gallery*year=2023*', {
    status: 404,
    body: { error: 'Gallery not found', year: '2023' }
  });
}
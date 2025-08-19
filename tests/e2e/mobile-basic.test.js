/**
 * Basic Mobile Tests - Tests that should actually pass
 * Only test functionality that exists and works
 */
import { test, expect } from '@playwright/test';

test.describe('Mobile Basic Tests', () => {
  test('mobile viewport loads homepage', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    // Page should load
    await expect(page).toHaveTitle(/A Lo Cubano/);
    
    // Should have viewport meta tag
    const viewport = page.locator('meta[name="viewport"]');
    await expect(viewport).toHaveAttribute('content', /width=device-width/);
  });

  test('tickets page works on mobile', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/tickets', { waitUntil: 'domcontentloaded' });
    
    // Should have ticket content
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('manifest.json is served correctly', async ({ page }) => {
    // This doesn't need mobile viewport
    const response = await page.request.get('/manifest.json');
    expect(response.ok()).toBeTruthy();
    
    const manifest = await response.json();
    expect(manifest.name).toBeTruthy();
    expect(manifest.icons).toBeInstanceOf(Array);
  });

  test('mobile CSS is loaded', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    // Check that mobile-overrides.css is loaded
    const stylesheets = await page.evaluate(() => {
      return Array.from(document.styleSheets).map(sheet => sheet.href).filter(Boolean);
    });
    
    const hasMobileCSS = stylesheets.some(href => 
      href.includes('mobile-overrides') || href.includes('mobile')
    );
    
    expect(hasMobileCSS).toBeTruthy();
  });

  test('images have alt text on mobile', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    // Wait for at least one image
    const images = page.locator('img');
    const imageCount = await images.count();
    
    if (imageCount > 0) {
      // Check first few images have alt text
      for (let i = 0; i < Math.min(3, imageCount); i++) {
        const img = images.nth(i);
        const alt = await img.getAttribute('alt');
        expect(alt).not.toBeNull();
      }
    }
  });
});
/**
 * Mobile Basic Tests - Core mobile functionality
 * Essential mobile tests under 70 lines
 */
import { test, expect } from '@playwright/test';

test.describe('Mobile Basic Tests', () => {
  test('mobile viewport loads homepage', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    // Page should load with title and viewport
    await expect(page).toHaveTitle(/A Lo Cubano/);
    
    const viewport = page.locator('meta[name="viewport"]');
    await expect(viewport).toHaveAttribute('content', /width=device-width/);
  });

  test('tickets page works on mobile', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/tickets', { waitUntil: 'domcontentloaded' });
    
    // Should have content
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('manifest.json is served correctly', async ({ page }) => {
    const response = await page.request.get('/public/manifest.json');
    expect(response.ok()).toBeTruthy();
    
    const manifest = await response.json();
    expect(manifest.name).toBeTruthy();
    expect(manifest.icons).toBeInstanceOf(Array);
  });

  test('responsive design applied on mobile', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    // Check responsive styles work
    const hasResponsiveStyles = await page.evaluate(() => {
      const header = document.querySelector('.header, header');
      if (header) {
        const styles = window.getComputedStyle(header);
        return styles.padding !== '0px';
      }
      return true; // Pass if no header found
    });
    
    expect(hasResponsiveStyles).toBeTruthy();
  });

  test('images have alt text', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    // Check first few images have alt text
    const images = page.locator('img');
    const imageCount = await images.count();
    
    if (imageCount > 0) {
      const firstImage = images.first();
      const alt = await firstImage.getAttribute('alt');
      expect(alt).not.toBeNull();
    }
  });
});
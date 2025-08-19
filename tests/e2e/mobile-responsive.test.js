/**
 * Mobile Responsive Tests - Essential responsive checks
 * Minimal tests under 60 lines
 */
import { test, expect } from '@playwright/test';

test.describe('Mobile Responsive Design', () => {
  test('core pages load on mobile', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    const pages = ['/', '/tickets'];
    
    for (const path of pages) {
      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 10000 });
      
      // Page has content and viewport
      const body = await page.locator('body').textContent();
      expect(body.length).toBeGreaterThan(100);
      
      const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
      expect(viewport).toContain('width=device-width');
    }
  });

  test('images dont overflow viewport', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    const overflowCount = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      const viewport = window.innerWidth;
      return imgs.filter(img => img.getBoundingClientRect().width > viewport).length;
    });
    
    expect(overflowCount).toBe(0);
  });

  test('PWA checkin configured for mobile', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/admin/checkin', { waitUntil: 'domcontentloaded' });
    
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    const appleCapable = await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute('content');
    
    expect(viewport).toContain('user-scalable=no');
    expect(appleCapable).toBe('yes');
  });
});
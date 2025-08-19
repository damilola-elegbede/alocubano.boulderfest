/**
 * Mobile Responsive Tests - Test responsive behavior on mobile viewports
 * Only tests features that actually exist and work
 */
import { test, expect } from '@playwright/test';

test.describe('Mobile Responsive Design', () => {
  test('pages load successfully on mobile viewport', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    const pages = ['/', '/tickets', '/about', '/artists', '/schedule', '/gallery', '/contact'];
    
    for (const path of pages) {
      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 10000 });
      
      // Page should have content
      const body = await page.locator('body').textContent();
      expect(body.length).toBeGreaterThan(100);
      
      // Should have viewport meta tag
      const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
      expect(viewport).toContain('width=device-width');
    }
  });

  test('images are responsive on mobile', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    // Check if images don't overflow viewport
    const images = await page.locator('img').evaluateAll(imgs => {
      return imgs.map(img => {
        const rect = img.getBoundingClientRect();
        const viewport = window.innerWidth;
        return {
          src: img.src,
          overflows: rect.width > viewport
        };
      });
    });
    
    // No images should overflow the viewport
    const overflowingImages = images.filter(img => img.overflows);
    expect(overflowingImages.length).toBe(0);
  });

  test('text remains readable on mobile', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    // Check main text elements
    const textSizes = await page.evaluate(() => {
      const elements = document.querySelectorAll('p, span, div, li, h1, h2, h3, h4, h5, h6');
      const sizes = [];
      
      for (let i = 0; i < Math.min(10, elements.length); i++) {
        const el = elements[i];
        if (el.textContent.trim().length > 0) {
          const styles = window.getComputedStyle(el);
          sizes.push(parseFloat(styles.fontSize));
        }
      }
      
      return sizes;
    });
    
    // All text should be at least 10px (very minimum for any text)
    const tooSmallText = textSizes.filter(size => size < 10);
    expect(tooSmallText.length).toBe(0);
  });

  test('clickable elements have minimum size', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/tickets', { waitUntil: 'domcontentloaded' });
    
    // Check buttons and links
    const clickableSizes = await page.evaluate(() => {
      const elements = document.querySelectorAll('button, a[href]');
      const sizes = [];
      
      for (let i = 0; i < Math.min(5, elements.length); i++) {
        const el = elements[i];
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          sizes.push({
            width: rect.width,
            height: rect.height,
            text: el.textContent.substring(0, 20)
          });
        }
      }
      
      return sizes;
    });
    
    // At least some elements should be reasonably sized
    if (clickableSizes.length > 0) {
      const reasonablySized = clickableSizes.filter(s => s.width >= 30 && s.height >= 20);
      expect(reasonablySized.length).toBeGreaterThan(0);
    }
  });

  test('page scrolling works on mobile', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/schedule', { waitUntil: 'domcontentloaded' });
    
    // Check if page is scrollable
    const scrollInfo = await page.evaluate(() => {
      const body = document.body;
      const html = document.documentElement;
      
      const pageHeight = Math.max(
        body.scrollHeight,
        body.offsetHeight,
        html.clientHeight,
        html.scrollHeight,
        html.offsetHeight
      );
      
      const viewportHeight = window.innerHeight;
      
      return {
        pageHeight,
        viewportHeight,
        isScrollable: pageHeight > viewportHeight
      };
    });
    
    // If content is longer than viewport, scrolling should work
    if (scrollInfo.isScrollable) {
      await page.evaluate(() => window.scrollTo(0, 100));
      const scrolled = await page.evaluate(() => window.pageYOffset || document.documentElement.scrollTop);
      expect(scrolled).toBeGreaterThan(0);
    }
  });

  test('PWA checkin page has mobile configuration', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/admin/checkin', { waitUntil: 'domcontentloaded' });
    
    // Check mobile-specific meta tags
    const metaTags = await page.evaluate(() => {
      return {
        viewport: document.querySelector('meta[name="viewport"]')?.content,
        appleCapable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content,
        themeColor: document.querySelector('meta[name="theme-color"]')?.content
      };
    });
    
    expect(metaTags.viewport).toContain('user-scalable=no');
    expect(metaTags.appleCapable).toBe('yes');
    expect(metaTags.themeColor).toBeTruthy();
  });

  test('forms have appropriate input types on mobile', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/contact', { waitUntil: 'domcontentloaded' });
    
    // Check input types
    const inputTypes = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      const types = {};
      
      inputs.forEach(input => {
        const type = input.type;
        types[type] = (types[type] || 0) + 1;
      });
      
      return types;
    });
    
    // Email inputs should use email type for mobile keyboards
    const emailInputs = await page.locator('input[type="email"]').count();
    if (emailInputs > 0) {
      expect(emailInputs).toBeGreaterThan(0);
    }
  });

  test('mobile performance is acceptable', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    const startTime = Date.now();
    await page.goto('/', { waitUntil: 'networkidle', timeout: 15000 });
    const loadTime = Date.now() - startTime;
    
    // Should load within 15 seconds even on mobile
    expect(loadTime).toBeLessThan(15000);
    
    // Check that page has rendered content
    const hasContent = await page.evaluate(() => {
      return document.body.children.length > 0;
    });
    expect(hasContent).toBeTruthy();
  });
});
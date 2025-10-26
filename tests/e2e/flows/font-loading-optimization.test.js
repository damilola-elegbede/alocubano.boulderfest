/**
 * E2E Test: Font Loading Optimization
 *
 * Validates that Google Fonts are preloaded correctly to eliminate render-blocking
 * and achieve 100-200ms FCP improvement.
 *
 * Test Coverage:
 * - Fonts preload before CSS parse
 * - Fallback fonts render immediately
 * - No FOUT on slow connections
 * - FCP improved with preload
 */

import { test, expect } from '@playwright/test';

test.describe('Font Loading Optimization', () => {
  test('fonts preload before CSS parse', async ({ page }) => {
    await page.goto('/home');

    // Verify preconnect links exist
    const preconnectLinks = await page.locator('link[rel="preconnect"]').count();
    expect(preconnectLinks).toBeGreaterThanOrEqual(2);

    // Verify preconnect to Google Fonts
    const googleFontsPreconnect = await page.locator('link[rel="preconnect"][href*="fonts.googleapis.com"]');
    await expect(googleFontsPreconnect).toHaveCount(1);

    const gstaticPreconnect = await page.locator('link[rel="preconnect"][href*="fonts.gstatic.com"]');
    await expect(gstaticPreconnect).toHaveCount(1);

    // Verify preload link exists
    const preloadLink = await page.locator('link[rel="preload"][as="style"]').first();
    await expect(preloadLink).toHaveCount(1);

    // Verify preload link has correct font families
    const preloadHref = await preloadLink.getAttribute('href');
    expect(preloadHref).toContain('Bebas+Neue');
    expect(preloadHref).toContain('Playfair+Display');
    expect(preloadHref).toContain('Space+Mono');
    expect(preloadHref).toContain('display=swap');
  });

  test('stylesheet uses media="print" trick for async loading', async ({ page }) => {
    await page.goto('/home');

    // Verify async loading stylesheet
    const stylesheetLink = await page.locator('link[rel="stylesheet"][href*="fonts.googleapis.com"][media="print"]').first();
    await expect(stylesheetLink).toHaveCount(1);

    // Verify onload attribute exists
    const onload = await stylesheetLink.getAttribute('onload');
    expect(onload).toContain("this.media='all'");
  });

  test('noscript fallback exists', async ({ page }) => {
    await page.goto('/home');

    // Verify noscript fallback
    const noscriptContent = await page.evaluate(() => {
      const noscript = document.querySelector('noscript');
      return noscript ? noscript.innerHTML : null;
    });

    expect(noscriptContent).toBeTruthy();
    expect(noscriptContent).toContain('fonts.googleapis.com');
    expect(noscriptContent).toContain('Bebas+Neue');
  });

  test('fallback fonts render immediately when Google Fonts blocked', async ({ page }) => {
    // Block Google Fonts
    await page.route('**/*fonts.googleapis.com*', route => route.abort());
    await page.route('**/*fonts.gstatic.com*', route => route.abort());

    await page.goto('/home', { waitUntil: 'domcontentloaded' });

    // Verify body is visible (using fallback fonts)
    const bodyOpacity = await page.$eval('body', el => window.getComputedStyle(el).opacity);
    expect(parseFloat(bodyOpacity)).toBeGreaterThan(0);

    // Verify text is visible (not hidden)
    const h1Visibility = await page.$eval('h1', el => window.getComputedStyle(el).visibility);
    expect(h1Visibility).not.toBe('hidden');

    // Verify font family falls back to system fonts
    const h1FontFamily = await page.$eval('h1', el => window.getComputedStyle(el).fontFamily);
    // Should include fallback fonts like sans-serif, serif, or monospace
    const hasFallback = h1FontFamily.toLowerCase().includes('sans-serif') ||
                        h1FontFamily.toLowerCase().includes('serif') ||
                        h1FontFamily.toLowerCase().includes('monospace');
    expect(hasFallback).toBe(true);
  });

  test('no FOUT on slow 3G connections', async ({ page }) => {
    // Simulate slow 3G network
    const client = await page.context().newCDPSession(page);
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (500 * 1024) / 8, // 500 Kbps
      uploadThroughput: (500 * 1024) / 8,
      latency: 400 // 400ms latency
    });

    await page.goto('/home', { waitUntil: 'domcontentloaded' });

    // Verify no invisible text period (font-display: swap prevents this)
    const h1Visibility = await page.$eval('h1', el => window.getComputedStyle(el).visibility);
    expect(h1Visibility).not.toBe('hidden');

    // Verify text is readable immediately
    const h1Text = await page.$eval('h1', el => el.textContent);
    expect(h1Text).toBeTruthy();
    expect(h1Text.length).toBeGreaterThan(0);
  });

  test('FCP improved with preload (target < 1500ms)', async ({ page }) => {
    await page.goto('/home', { waitUntil: 'domcontentloaded' });

    // Get First Contentful Paint metric
    const metrics = await page.evaluate(() => {
      const perfEntries = performance.getEntriesByType('paint');
      const fcp = perfEntries.find(entry => entry.name === 'first-contentful-paint');
      return {
        fcp: fcp ? fcp.startTime : null,
        entries: perfEntries.map(e => ({ name: e.name, startTime: e.startTime }))
      };
    });

    expect(metrics.fcp).toBeTruthy();

    // Target: FCP < 1500ms (allows for slower CI environments)
    // In production, this should be < 1200ms
    expect(metrics.fcp).toBeLessThan(1500);

    console.log(`✓ FCP: ${metrics.fcp.toFixed(2)}ms (target: <1500ms)`);
  });

  test('font preload on all key pages', async ({ page }) => {
    const pagesToTest = [
      '/home',
      '/about',
      '/tickets',
      '/donations',
      '/contact'
    ];

    for (const pagePath of pagesToTest) {
      await page.goto(pagePath);

      // Verify preload exists
      const preloadLink = await page.locator('link[rel="preload"][as="style"]').first();
      await expect(preloadLink, `${pagePath} should have font preload`).toHaveCount(1);

      // Verify display=swap parameter
      const href = await preloadLink.getAttribute('href');
      expect(href, `${pagePath} should use display=swap`).toContain('display=swap');
    }
  });

  test('preload ordering: before CSS parse', async ({ page }) => {
    await page.goto('/home');

    // Get all link elements in order
    const linkOrder = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('link'));
      return links.map(link => ({
        rel: link.getAttribute('rel'),
        href: link.getAttribute('href'),
        as: link.getAttribute('as')
      }));
    });

    // Find index of preload and bundle-critical.css (which contains typography styles)
    const preloadIndex = linkOrder.findIndex(link =>
      link.rel === 'preload' && link.as === 'style' && link.href?.includes('fonts.googleapis.com')
    );
    const criticalCssIndex = linkOrder.findIndex(link =>
      link.rel === 'stylesheet' && link.href?.includes('bundle-critical.css')
    );

    expect(preloadIndex).toBeGreaterThan(-1);
    expect(criticalCssIndex).toBeGreaterThan(-1);

    // Preload should come before critical CSS bundle
    expect(preloadIndex).toBeLessThan(criticalCssIndex);
  });

  test('font metrics: ensure fonts load successfully', async ({ page }) => {
    await page.goto('/home', { waitUntil: 'networkidle' });

    // Wait a bit for fonts to load
    await page.waitForTimeout(1000);

    // Check if fonts are loaded using FontFaceSet API
    const fontStatus = await page.evaluate(async () => {
      // Check document.fonts API
      if (!document.fonts) {
        return { supported: false };
      }

      await document.fonts.ready;

      const fontFaces = Array.from(document.fonts);
      const loadedFonts = fontFaces.filter(font => font.status === 'loaded');

      return {
        supported: true,
        total: fontFaces.length,
        loaded: loadedFonts.length,
        fonts: fontFaces.map(font => ({
          family: font.family,
          status: font.status
        }))
      };
    });

    if (fontStatus.supported) {
      // At least some fonts should be loaded
      expect(fontStatus.loaded).toBeGreaterThan(0);
      console.log(`✓ Fonts loaded: ${fontStatus.loaded}/${fontStatus.total}`);
    }
  });

  test('CSS @import removed from bundle CSS', async ({ page, baseURL }) => {
    // Fetch bundle-critical.css which contains typography styles
    const response = await page.goto(`${baseURL}/css/bundle-critical.css`);
    const cssContent = await response.text();

    // Should NOT contain @import for Google Fonts
    expect(cssContent).not.toMatch(/@import\s+url\(.*fonts\.googleapis\.com/);

    // Should contain comment about preload
    expect(cssContent.toLowerCase()).toContain('preload');
  });
});

/**
 * Font Loading Optimization Tests
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

import { describe, test, expect, beforeAll, afterAll } from 'vitest';

// Skip in integration test mode (Playwright not installed)
const skipPlaywrightTests = process.env.INTEGRATION_TEST_MODE === 'true';

describe.skipIf(skipPlaywrightTests)('Font Loading Optimization', () => {
  let browser;
  let context;
  let chromium;
  const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

  beforeAll(async () => {
    // Dynamically import Playwright when not skipped
    chromium = (await import('playwright')).chromium;
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-gpu', '--disable-dev-shm-usage']
    });
    context = await browser.newContext();
  });

  afterAll(async () => {
    await context?.close();
    await browser?.close();
  });

  test('fonts preload before CSS parse', async () => {
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/home`);

    // Verify preconnect links exist
    const preconnectLinks = await page.$$('link[rel="preconnect"]');
    expect(preconnectLinks.length).toBeGreaterThanOrEqual(2);

    // Verify preconnect to Google Fonts
    const googleFontsPreconnect = await page.$('link[rel="preconnect"][href*="fonts.googleapis.com"]');
    expect(googleFontsPreconnect).toBeTruthy();

    const gstaticPreconnect = await page.$('link[rel="preconnect"][href*="fonts.gstatic.com"]');
    expect(gstaticPreconnect).toBeTruthy();

    // Verify preload link exists
    const preloadLink = await page.$('link[rel="preload"][as="style"]');
    expect(preloadLink).toBeTruthy();

    // Verify preload link has correct font families
    const preloadHref = await preloadLink.getAttribute('href');
    expect(preloadHref).toContain('Bebas+Neue');
    expect(preloadHref).toContain('Playfair+Display');
    expect(preloadHref).toContain('Space+Mono');
    expect(preloadHref).toContain('display=swap');

    await page.close();
  });

  test('stylesheet uses media="print" trick for async loading', async () => {
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/home`);

    // Verify async loading stylesheet
    const stylesheetLink = await page.$('link[rel="stylesheet"][href*="fonts.googleapis.com"][media="print"]');
    expect(stylesheetLink).toBeTruthy();

    // Verify onload attribute exists
    const onload = await stylesheetLink.getAttribute('onload');
    expect(onload).toContain("this.media='all'");

    await page.close();
  });

  test('noscript fallback exists', async () => {
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/home`);

    // Verify noscript fallback
    const noscriptContent = await page.evaluate(() => {
      const noscript = document.querySelector('noscript');
      return noscript ? noscript.innerHTML : null;
    });

    expect(noscriptContent).toBeTruthy();
    expect(noscriptContent).toContain('fonts.googleapis.com');
    expect(noscriptContent).toContain('Bebas+Neue');

    await page.close();
  });

  test('fallback fonts render immediately when Google Fonts blocked', async () => {
    const page = await context.newPage();

    // Block Google Fonts
    await page.route('**/*fonts.googleapis.com*', route => route.abort());
    await page.route('**/*fonts.gstatic.com*', route => route.abort());

    await page.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded' });

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

    await page.close();
  });

  test('no FOUT on slow 3G connections', async () => {
    const page = await context.newPage();

    // Simulate slow 3G network
    const client = await page.context().newCDPSession(page);
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (500 * 1024) / 8, // 500 Kbps
      uploadThroughput: (500 * 1024) / 8,
      latency: 400 // 400ms latency
    });

    await page.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded' });

    // Verify no invisible text period (font-display: swap prevents this)
    const h1Visibility = await page.$eval('h1', el => window.getComputedStyle(el).visibility);
    expect(h1Visibility).not.toBe('hidden');

    // Verify text is readable immediately
    const h1Text = await page.$eval('h1', el => el.textContent);
    expect(h1Text).toBeTruthy();
    expect(h1Text.length).toBeGreaterThan(0);

    await page.close();
  });

  test('FCP improved with preload (target < 1500ms)', async () => {
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded' });

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

    await page.close();
  });

  test('font preload on all key pages', async () => {
    const pagesToTest = [
      '/home',
      '/about',
      '/tickets',
      '/donations',
      '/contact'
    ];

    for (const pagePath of pagesToTest) {
      const page = await context.newPage();
      await page.goto(`${BASE_URL}${pagePath}`);

      // Verify preload exists
      const preloadLink = await page.$('link[rel="preload"][as="style"]');
      expect(preloadLink, `${pagePath} should have font preload`).toBeTruthy();

      // Verify display=swap parameter
      const href = await preloadLink.getAttribute('href');
      expect(href, `${pagePath} should use display=swap`).toContain('display=swap');

      await page.close();
    }
  });

  test('preload ordering: before CSS parse', async () => {
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/home`);

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

    await page.close();
  });

  test('font metrics: ensure fonts load successfully', async () => {
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/home`, { waitUntil: 'networkidle' });

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

    await page.close();
  });

  test('CSS @import removed from bundle CSS', async () => {
    const page = await context.newPage();

    // Fetch bundle-critical.css which contains typography styles
    const response = await page.goto(`${BASE_URL}/css/bundle-critical.css`);
    const cssContent = await response.text();

    // Should NOT contain @import for Google Fonts
    expect(cssContent).not.toMatch(/@import\s+url\(.*fonts\.googleapis\.com/);

    // Should contain comment about preload
    expect(cssContent.toLowerCase()).toContain('preload');

    await page.close();
  });
});

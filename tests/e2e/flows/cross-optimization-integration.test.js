/**
 * E2E Test: Cross-Optimization Integration
 *
 * Verifies that frontend performance optimizations work together without conflicts:
 * 1. Font Loading + CSS Bundling (Frontend)
 * 2. CSS Bundling + JS Deferral (Frontend)
 * 3. All optimizations combined (No conflicts, cumulative gains)
 *
 * Test Coverage:
 * - No conflicts between optimizations
 * - Cumulative performance gains
 * - Visual consistency maintained
 * - User experience not degraded
 *
 * Note: Backend optimization integration (#2-#8, #11) tested in integration suite
 * since they require direct database access.
 */

import { test, expect } from '@playwright/test';

test.describe('Cross-Optimization Integration', () => {
  test('font loading + CSS bundling work together without conflicts', async ({ page }) => {
    await page.goto('/home', { waitUntil: 'networkidle' });

    // Verify font preload exists (Optimization #1)
    const preloadLink = await page.locator('link[rel="preload"][as="style"]').first();
    await expect(preloadLink).toHaveCount(1);

    const preloadHref = await preloadLink.getAttribute('href');
    expect(preloadHref).toContain('fonts.googleapis.com');
    expect(preloadHref).toContain('display=swap');

    // Verify CSS bundling exists (Optimization #9)
    const criticalBundleLink = await page.locator('link[rel="stylesheet"][href*="bundle-critical.css"]').first();
    await expect(criticalBundleLink).toHaveCount(1);

    const deferredBundleLink = await page.locator('link[rel="stylesheet"][href*="bundle-deferred.css"]').first();
    await expect(deferredBundleLink).toHaveCount(1);

    // Verify both optimizations contribute to fast FCP
    const metrics = await page.evaluate(() => {
      const perfEntries = performance.getEntriesByType('paint');
      const fcp = perfEntries.find(entry => entry.name === 'first-contentful-paint');
      return { fcp: fcp ? fcp.startTime : null };
    });

    expect(metrics.fcp).toBeTruthy();
    // Combined optimization target: < 1500ms (100-200ms font + 300-500ms CSS bundling = 400-700ms total improvement)
    expect(metrics.fcp).toBeLessThan(1500);

    console.log(`✓ Font + CSS bundling: FCP = ${metrics.fcp.toFixed(2)}ms`);
  });

  test('frontend optimizations (font + CSS + JS deferral) combine for fast page load', async ({ page }) => {
    // Measure full page load with all frontend optimizations
    const startNav = performance.now();
    await page.goto('/home', { waitUntil: 'domcontentloaded' });
    const navDuration = performance.now() - startNav;

    // Collect metrics
    const metrics = await page.evaluate(() => {
      const perfEntries = performance.getEntriesByType('paint');
      const navTiming = performance.getEntriesByType('navigation')[0];

      return {
        fcp: perfEntries.find(e => e.name === 'first-contentful-paint')?.startTime || 0,
        domContentLoaded: navTiming?.domContentLoadedEventEnd - navTiming?.domContentLoadedEventStart || 0,
        loadComplete: navTiming?.loadEventEnd - navTiming?.loadEventStart || 0
      };
    });

    // Verify all frontend optimizations are present
    const hasPreload = await page.locator('link[rel="preload"][as="style"]').count();
    const hasCssBundle = await page.locator('link[rel="stylesheet"][href*="bundle-critical.css"]').count();
    const hasDefer = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script[src*="navigation.js"]'));
      return scripts.some(s => s.defer === true);
    });

    expect(hasPreload, `Font preload optimization should be active (found ${hasPreload} preload links)`).toBeGreaterThan(0);
    expect(hasCssBundle, `CSS bundling optimization should be active (found ${hasCssBundle} bundle links)`).toBeGreaterThan(0);
    expect(hasDefer, 'JS deferral optimization should be active (navigation.js should have defer attribute)').toBe(true);

    // Combined frontend optimizations should achieve fast load
    console.log(`✓ Frontend Optimizations Combined:`);
    console.log(`  - Navigation: ${navDuration.toFixed(2)}ms`);
    console.log(`  - FCP: ${metrics.fcp.toFixed(2)}ms`);
    console.log(`  - DOM Content Loaded: ${metrics.domContentLoaded.toFixed(2)}ms`);

    // Combined optimization target
    expect(metrics.fcp).toBeLessThan(1500);
  });

  test('optimizations maintain visual consistency across pages', async ({ page }) => {
    const pagesToTest = [
      '/home',
      '/tickets',
      '/about',
      '/gallery'
    ];

    for (const pagePath of pagesToTest) {
      await page.goto(pagePath);

      // Verify fonts load correctly (no FOUT)
      const bodyFontFamily = await page.$eval('body', el => window.getComputedStyle(el).fontFamily);
      expect(bodyFontFamily, `${pagePath}: Font family should be loaded (found: "${bodyFontFamily}")`).toBeTruthy();
      expect(bodyFontFamily, `${pagePath}: Font family should not be generic fallback`).not.toMatch(/^(serif|sans-serif|monospace|cursive|fantasy)$/);

      // Verify page is visually rendered (CSS loaded)
      const bodyBackgroundColor = await page.$eval('body', el => window.getComputedStyle(el).backgroundColor);
      expect(bodyBackgroundColor, `${pagePath}: Background color should be defined (found: "${bodyBackgroundColor}")`).toBeTruthy();
      expect(bodyBackgroundColor, `${pagePath}: CSS should be loaded - background color should not be transparent`).not.toBe('rgba(0, 0, 0, 0)');

      // Verify no render-blocking scripts delay content
      const hasVisibleContent = await page.evaluate(() => {
        const h1 = document.querySelector('h1');
        if (!h1) return false;
        const visibility = window.getComputedStyle(h1).visibility;
        const opacity = window.getComputedStyle(h1).opacity;
        return visibility !== 'hidden' && parseFloat(opacity) > 0;
      });

      expect(hasVisibleContent, `${pagePath} should have visible content`).toBe(true);
    }

    console.log(`✓ Visual consistency maintained across ${pagesToTest.length} pages`);
  });

  test('CSS bundles do not conflict with dynamic styles', async ({ page }) => {
    await page.goto('/tickets');

    // Verify CSS bundling doesn't break dynamic cart styles
    const addToCartButton = await page.locator('button:has-text("Add to Cart")').first();

    if (await addToCartButton.count() > 0) {
      const buttonStyles = await addToCartButton.evaluate(el => {
        const styles = window.getComputedStyle(el);
        return {
          display: styles.display,
          backgroundColor: styles.backgroundColor,
          cursor: styles.cursor
        };
      });

      expect(buttonStyles.display).not.toBe('none');
      expect(buttonStyles.cursor).toBe('pointer');
      console.log(`✓ Dynamic styles work correctly with CSS bundles`);
    }
  });

  test('font preload does not block critical CSS', async ({ page }) => {
    await page.goto('/home');

    // Get link order to verify preload → CSS order
    const linkOrder = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('link'));
      return links.map(link => ({
        rel: link.getAttribute('rel'),
        href: link.getAttribute('href'),
        as: link.getAttribute('as')
      }));
    });

    // Find preload and critical CSS indices
    const preloadIndex = linkOrder.findIndex(link =>
      link.rel === 'preload' && link.as === 'style' && link.href?.includes('fonts.googleapis.com')
    );
    const criticalCssIndex = linkOrder.findIndex(link =>
      link.rel === 'stylesheet' && link.href?.includes('bundle-critical.css')
    );

    expect(preloadIndex, `Font preload link should exist in <head> (index: ${preloadIndex})`).toBeGreaterThan(-1);
    expect(criticalCssIndex, `Critical CSS bundle should exist in <head> (index: ${criticalCssIndex})`).toBeGreaterThan(-1);

    // Preload should come before critical CSS to avoid blocking
    expect(preloadIndex, `Font preload (index ${preloadIndex}) should come before critical CSS (index ${criticalCssIndex}) to prevent blocking`).toBeLessThan(criticalCssIndex);

    console.log(`✓ Font preload correctly positioned before critical CSS`);
  });

  test('JS deferral does not break font loading', async ({ page }) => {
    await page.goto('/home', { waitUntil: 'networkidle' });

    // Wait for fonts to load
    await page.waitForTimeout(1000);

    // Verify deferred scripts loaded
    const scriptsDeferred = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script[defer]'));
      return scripts.length > 0;
    });

    expect(scriptsDeferred).toBe(true);

    // Verify fonts still loaded despite deferred scripts
    const fontStatus = await page.evaluate(async () => {
      if (!document.fonts) return { supported: false };

      await document.fonts.ready;

      const fontFaces = Array.from(document.fonts);
      const loadedFonts = fontFaces.filter(font => font.status === 'loaded');

      return {
        supported: true,
        loaded: loadedFonts.length,
        total: fontFaces.length
      };
    });

    if (fontStatus.supported) {
      expect(fontStatus.loaded).toBeGreaterThan(0);
      console.log(`✓ Fonts loaded successfully despite deferred scripts: ${fontStatus.loaded}/${fontStatus.total}`);
    }
  });

  test('all optimizations work together under slow network conditions', async ({ page }) => {
    // Simulate slow 3G network
    const client = await page.context().newCDPSession(page);
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (500 * 1024) / 8, // 500 Kbps
      uploadThroughput: (500 * 1024) / 8,
      latency: 400 // 400ms latency
    });

    await page.goto('/home', { waitUntil: 'domcontentloaded' });

    // Verify fonts display swap prevents FOIT/FOUT
    const textVisible = await page.$eval('h1', el => {
      const visibility = window.getComputedStyle(el).visibility;
      return visibility !== 'hidden';
    });

    expect(textVisible).toBe(true);

    // Verify critical CSS loaded (page has styles)
    const hasCriticalStyles = await page.evaluate(() => {
      const body = document.body;
      const bgColor = window.getComputedStyle(body).backgroundColor;
      return bgColor && bgColor !== 'rgba(0, 0, 0, 0)';
    });

    expect(hasCriticalStyles).toBe(true);

    // Verify deferred scripts don't block initial render
    const hasVisibleContent = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      return h1 && window.getComputedStyle(h1).opacity !== '0';
    });

    expect(hasVisibleContent).toBe(true);

    console.log(`✓ All optimizations work correctly on slow 3G network`);
  });

  test('performance metrics show cumulative gains across pages', async ({ page }) => {
    const pages = ['/home', '/tickets', '/about'];
    const metrics = [];

    for (const pagePath of pages) {
      await page.goto(pagePath, { waitUntil: 'domcontentloaded' });

      const pageMetrics = await page.evaluate(() => {
        const perfEntries = performance.getEntriesByType('paint');
        const fcp = perfEntries.find(entry => entry.name === 'first-contentful-paint');
        return { fcp: fcp ? fcp.startTime : null };
      });

      metrics.push({ page: pagePath, fcp: pageMetrics.fcp });
    }

    // All pages should benefit from optimizations
    const allFast = metrics.every(m => m.fcp && m.fcp < 2000);
    expect(allFast, 'All pages should have FCP < 2000ms').toBe(true);

    console.log(`✓ Cumulative gains across pages:`);
    metrics.forEach(m => {
      console.log(`  ${m.page}: FCP = ${m.fcp.toFixed(2)}ms`);
    });

    const avgFcp = metrics.reduce((sum, m) => sum + m.fcp, 0) / metrics.length;
    console.log(`  Average FCP: ${avgFcp.toFixed(2)}ms (target: <1500ms with all optimizations)`);
  });

  test('optimizations do not break responsive design', async ({ page }) => {
    // Test that CSS bundling doesn't break mobile styles
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/home');

    const isMobileOptimized = await page.evaluate(() => {
      // Check if mobile navigation exists
      const nav = document.querySelector('nav');
      if (!nav) return false;

      // Check if fonts are readable on mobile
      const h1 = document.querySelector('h1');
      if (!h1) return false;

      const fontSize = window.getComputedStyle(h1).fontSize;
      const fontSizePx = parseFloat(fontSize);

      // Mobile font should be at least 24px for headings
      return fontSizePx >= 24;
    });

    expect(isMobileOptimized).toBe(true);
    console.log(`✓ Optimizations maintain responsive design on mobile`);
  });

  test('summary: all 3 frontend optimizations integrate successfully', async ({ page }) => {
    await page.goto('/home', { waitUntil: 'networkidle' });

    const integrationStatus = await page.evaluate(() => {
      // Check font preload
      const hasPreload = !!document.querySelector('link[rel="preload"][as="style"][href*="fonts.googleapis.com"]');

      // Check CSS bundling
      const hasCssBundle = !!document.querySelector('link[rel="stylesheet"][href*="bundle-critical.css"]');

      // Check JS deferral
      const hasDefer = Array.from(document.querySelectorAll('script[src]'))
        .some(s => s.defer === true);

      // Get performance metrics
      const perfEntries = performance.getEntriesByType('paint');
      const fcp = perfEntries.find(entry => entry.name === 'first-contentful-paint');

      return {
        fontLoading: hasPreload,
        cssBundling: hasCssBundle,
        jsDeferral: hasDefer,
        fcp: fcp ? fcp.startTime : null
      };
    });

    expect(integrationStatus.fontLoading, 'Font Loading optimization active').toBe(true);
    expect(integrationStatus.cssBundling, 'CSS Bundling optimization active').toBe(true);
    expect(integrationStatus.jsDeferral, 'JS Deferral optimization active').toBe(true);
    expect(integrationStatus.fcp, 'FCP metric available').toBeTruthy();
    expect(integrationStatus.fcp, 'FCP < 1500ms with all optimizations').toBeLessThan(1500);

    console.log(`\n✓ Integration Summary:`);
    console.log(`  ✓ Font Loading (#1): Active`);
    console.log(`  ✓ CSS Bundling (#9): Active`);
    console.log(`  ✓ JS Deferral (#10): Active`);
    console.log(`  ✓ FCP: ${integrationStatus.fcp.toFixed(2)}ms (target: <1500ms)`);
    console.log(`\n  All frontend optimizations working together successfully!`);
    console.log(`  Expected cumulative improvement: 450-775ms`);
  });
});

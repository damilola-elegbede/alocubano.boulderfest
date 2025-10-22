import { describe, test, expect } from 'vitest';
import fs from 'fs';
import { glob } from 'glob';

/**
 * JavaScript Deferral Tests (File-Based)
 *
 * Validates conservative deferral approach:
 * - navigation.js and main.js deferred (safe, non-critical)
 * - theme-manager.js remains synchronous (prevents FOUC)
 * - Cart scripts remain synchronous on commerce pages
 *
 * Expected FCP improvement: 50-75ms
 */

describe('JavaScript Deferral - File Validation', () => {
  test('all HTML files have navigation.js with defer attribute', async () => {
    const htmlFiles = await glob('pages/**/*.html');

    let filesWithNavigation = 0;
    let filesWithDefer = 0;

    for (const file of htmlFiles) {
      const content = fs.readFileSync(file, 'utf8');

      if (content.includes('navigation.js')) {
        filesWithNavigation++;

        // Check for defer attribute on navigation.js
        const hasDefer = /<script\s+defer\s+src=["']\/js\/navigation\.js["']/.test(content);

        if (hasDefer) {
          filesWithDefer++;
        } else {
          console.log(`❌ Missing defer on navigation.js: ${file}`);
        }

        expect(hasDefer).toBe(true);
      }
    }

    console.log(`✅ navigation.js defer: ${filesWithDefer}/${filesWithNavigation} files`);
    expect(filesWithDefer).toBe(filesWithNavigation);
  });

  test('all HTML files have main.js with defer attribute', async () => {
    const htmlFiles = await glob('pages/**/*.html');

    let filesWithMain = 0;
    let filesWithDefer = 0;

    for (const file of htmlFiles) {
      const content = fs.readFileSync(file, 'utf8');

      if (content.includes('main.js')) {
        filesWithMain++;

        // Check for defer attribute on main.js
        const hasDefer = /<script\s+defer\s+src=["']\/js\/main\.js["']/.test(content);

        if (hasDefer) {
          filesWithDefer++;
        } else {
          console.log(`❌ Missing defer on main.js: ${file}`);
        }

        expect(hasDefer).toBe(true);
      }
    }

    console.log(`✅ main.js defer: ${filesWithDefer}/${filesWithMain} files`);
    expect(filesWithDefer).toBe(filesWithMain);
  });

  test('theme-manager.js NEVER has defer attribute (FOUC prevention)', async () => {
    const htmlFiles = await glob('pages/**/*.html');

    let filesWithThemeManager = 0;
    let filesWithoutDefer = 0;

    for (const file of htmlFiles) {
      const content = fs.readFileSync(file, 'utf8');

      if (content.includes('theme-manager.js')) {
        filesWithThemeManager++;

        // Verify NO defer attribute on theme-manager.js
        const hasDefer = /<script\s+defer\s+[^>]*theme-manager\.js/.test(content);

        if (!hasDefer) {
          filesWithoutDefer++;
        } else {
          console.log(`❌ CRITICAL: theme-manager.js has defer (FOUC risk!): ${file}`);
        }

        expect(hasDefer).toBe(false);
      }
    }

    console.log(`✅ theme-manager.js synchronous: ${filesWithoutDefer}/${filesWithThemeManager} files`);
    expect(filesWithoutDefer).toBe(filesWithThemeManager);
  });

  test('commerce pages (tickets, donations) have non-deferred cart scripts', async () => {
    const commercePages = ['pages/core/tickets.html', 'pages/core/donations.html'];

    for (const file of commercePages) {
      const content = fs.readFileSync(file, 'utf8');

      if (content.includes('global-cart.js')) {
        // Cart script should NOT have defer attribute
        const hasDefer = /<script\s+defer\s+[^>]*global-cart\.js/.test(content);
        expect(hasDefer).toBe(false);

        // It should be type="module" but not deferred
        const isModule = /<script\s+type=["']module["']\s+src=["']\/js\/global-cart\.js["']/.test(content);
        expect(isModule).toBe(true);

        console.log(`✅ ${file}: global-cart.js is module (not deferred)`);
      }
    }
  });

  test('verify script loading order patterns', async () => {
    const htmlFiles = await glob('pages/**/*.html');

    for (const file of htmlFiles) {
      const content = fs.readFileSync(file, 'utf8');

      // Extract script tags in order
      const scriptMatches = content.matchAll(/<script[^>]*src=["']([^"']+)["'][^>]*>/g);
      const scripts = Array.from(scriptMatches).map(match => ({
        src: match[1],
        fullTag: match[0]
      }));

      // Find theme-manager position
      const themeManagerIndex = scripts.findIndex(s => s.src.includes('theme-manager'));

      if (themeManagerIndex >= 0) {
        // Theme manager should be early in the document (before main content scripts)
        const navigationIndex = scripts.findIndex(s => s.src.includes('navigation.js'));
        const mainIndex = scripts.findIndex(s => s.src.includes('main.js'));

        if (navigationIndex >= 0) {
          expect(themeManagerIndex).toBeLessThan(navigationIndex);
        }
        if (mainIndex >= 0) {
          expect(themeManagerIndex).toBeLessThan(mainIndex);
        }
      }
    }
  });

  test('deferred scripts have correct syntax', async () => {
    const htmlFiles = await glob('pages/**/*.html');

    for (const file of htmlFiles) {
      const content = fs.readFileSync(file, 'utf8');

      // Check for defer on navigation.js - should be: <script defer src="...">
      const navigationMatch = content.match(/<script\s+([^>]*navigation\.js[^>]*)>/);
      if (navigationMatch) {
        const attributes = navigationMatch[1];

        // Should have 'defer' and 'src' attributes
        expect(attributes).toContain('defer');
        expect(attributes).toContain('src');

        // Should NOT have 'async' (defer and async are different)
        expect(attributes).not.toContain('async');
      }

      // Check for defer on main.js
      const mainMatch = content.match(/<script\s+([^>]*main\.js[^>]*)>/);
      if (mainMatch) {
        const attributes = mainMatch[1];

        expect(attributes).toContain('defer');
        expect(attributes).toContain('src');
        expect(attributes).not.toContain('async');
      }
    }
  });

  test('statistics: count affected files', async () => {
    const htmlFiles = await glob('pages/**/*.html');

    const stats = {
      totalFiles: htmlFiles.length,
      withNavigation: 0,
      withMain: 0,
      withThemeManager: 0,
      withGlobalCart: 0,
      navigationDeferred: 0,
      mainDeferred: 0,
      themeManagerSynchronous: 0,
      cartSynchronous: 0
    };

    for (const file of htmlFiles) {
      const content = fs.readFileSync(file, 'utf8');

      if (content.includes('navigation.js')) {
        stats.withNavigation++;
        if (/<script\s+defer\s+src=["']\/js\/navigation\.js["']/.test(content)) {
          stats.navigationDeferred++;
        }
      }

      if (content.includes('main.js')) {
        stats.withMain++;
        if (/<script\s+defer\s+src=["']\/js\/main\.js["']/.test(content)) {
          stats.mainDeferred++;
        }
      }

      if (content.includes('theme-manager.js')) {
        stats.withThemeManager++;
        if (!/<script\s+defer\s+[^>]*theme-manager\.js/.test(content)) {
          stats.themeManagerSynchronous++;
        }
      }

      if (content.includes('global-cart.js')) {
        stats.withGlobalCart++;
        if (!/<script\s+defer\s+[^>]*global-cart\.js/.test(content)) {
          stats.cartSynchronous++;
        }
      }
    }

    console.log('\n📊 JavaScript Deferral Statistics:');
    console.log(`Total HTML files: ${stats.totalFiles}`);
    console.log(`Files with navigation.js: ${stats.withNavigation} (${stats.navigationDeferred} deferred)`);
    console.log(`Files with main.js: ${stats.withMain} (${stats.mainDeferred} deferred)`);
    console.log(`Files with theme-manager.js: ${stats.withThemeManager} (${stats.themeManagerSynchronous} synchronous)`);
    console.log(`Files with global-cart.js: ${stats.withGlobalCart} (${stats.cartSynchronous} synchronous)`);

    // Validate all scripts are correctly configured
    expect(stats.navigationDeferred).toBe(stats.withNavigation);
    expect(stats.mainDeferred).toBe(stats.withMain);
    expect(stats.themeManagerSynchronous).toBe(stats.withThemeManager);
    expect(stats.cartSynchronous).toBe(stats.withGlobalCart);
  });

  test('no accidental defer on critical scripts', async () => {
    const htmlFiles = await glob('pages/**/*.html');

    const criticalScripts = [
      'theme-manager.js',
      // Add other critical scripts here
    ];

    for (const file of htmlFiles) {
      const content = fs.readFileSync(file, 'utf8');

      for (const script of criticalScripts) {
        if (content.includes(script)) {
          const hasDeferPattern = new RegExp(`<script\\s+defer\\s+[^>]*${script.replace('.', '\\.')}`);
          const hasDefer = hasDeferPattern.test(content);

          if (hasDefer) {
            console.error(`❌ CRITICAL: ${script} has defer in ${file}`);
          }

          expect(hasDefer).toBe(false);
        }
      }
    }
  });

  test('verify homepage has correct defer configuration', async () => {
    const homeContent = fs.readFileSync('pages/core/home.html', 'utf8');

    // theme-manager.js: synchronous (NO defer)
    expect(/<script\s+type=["']module["']\s+src=["']\/js\/theme-manager\.js["']/.test(homeContent)).toBe(true);
    expect(/<script\s+defer\s+[^>]*theme-manager\.js/.test(homeContent)).toBe(false);

    // navigation.js: deferred
    expect(/<script\s+defer\s+src=["']\/js\/navigation\.js["']/.test(homeContent)).toBe(true);

    // main.js: deferred
    expect(/<script\s+defer\s+src=["']\/js\/main\.js["']/.test(homeContent)).toBe(true);

    console.log('✅ Homepage has correct defer configuration');
  });

  test('verify tickets page has correct defer configuration', async () => {
    const ticketsContent = fs.readFileSync('pages/core/tickets.html', 'utf8');

    // theme-manager.js: synchronous (NO defer)
    expect(/<script\s+type=["']module["']\s+src=["']\/js\/theme-manager\.js["']/.test(ticketsContent)).toBe(true);
    expect(/<script\s+defer\s+[^>]*theme-manager\.js/.test(ticketsContent)).toBe(false);

    // navigation.js: deferred
    expect(/<script\s+defer\s+src=["']\/js\/navigation\.js["']/.test(ticketsContent)).toBe(true);

    // main.js: deferred
    expect(/<script\s+defer\s+src=["']\/js\/main\.js["']/.test(ticketsContent)).toBe(true);

    // global-cart.js: synchronous module (NO defer) - critical for commerce
    expect(/<script\s+type=["']module["']\s+src=["']\/js\/global-cart\.js["']/.test(ticketsContent)).toBe(true);
    expect(/<script\s+defer\s+[^>]*global-cart\.js/.test(ticketsContent)).toBe(false);

    console.log('✅ Tickets page (commerce) has correct defer configuration');
  });

  test('verify donations page has correct defer configuration', async () => {
    const donationsContent = fs.readFileSync('pages/core/donations.html', 'utf8');

    // theme-manager.js: synchronous (NO defer)
    expect(/<script\s+type=["']module["']\s+src=["']\/js\/theme-manager\.js["']/.test(donationsContent)).toBe(true);
    expect(/<script\s+defer\s+[^>]*theme-manager\.js/.test(donationsContent)).toBe(false);

    // navigation.js: deferred
    expect(/<script\s+defer\s+src=["']\/js\/navigation\.js["']/.test(donationsContent)).toBe(true);

    // main.js: deferred
    expect(/<script\s+defer\s+src=["']\/js\/main\.js["']/.test(donationsContent)).toBe(true);

    // global-cart.js: synchronous module (NO defer) - critical for commerce
    expect(/<script\s+type=["']module["']\s+src=["']\/js\/global-cart\.js["']/.test(donationsContent)).toBe(true);
    expect(/<script\s+defer\s+[^>]*global-cart\.js/.test(donationsContent)).toBe(false);

    console.log('✅ Donations page (commerce) has correct defer configuration');
  });
});

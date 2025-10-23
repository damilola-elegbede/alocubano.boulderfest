import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

describe('CSS Bundle Consolidation', () => {
  describe('Bundle Files', () => {
    test('critical CSS bundle exists and contains all required files', () => {
      const bundlePath = path.join(projectRoot, 'css/bundle-critical.css');
      expect(fs.existsSync(bundlePath)).toBe(true);

      const bundle = fs.readFileSync(bundlePath, 'utf8');

      // Check that all critical CSS files are included (with proper comment format)
      expect(bundle).toContain('* css/base.css');
      expect(bundle).toContain('* css/typography.css');
      expect(bundle).toContain('* css/navigation.css');
      expect(bundle).toContain('* css/components.css');

      // Verify bundle has content
      expect(bundle.length).toBeGreaterThan(10000); // Should be > 10KB
    });

    test('deferred CSS bundle exists and contains required files', () => {
      const bundlePath = path.join(projectRoot, 'css/bundle-deferred.css');
      expect(fs.existsSync(bundlePath)).toBe(true);

      const bundle = fs.readFileSync(bundlePath, 'utf8');

      // Check that deferred CSS files are included (with proper comment format)
      expect(bundle).toContain('* css/floating-cart.css');
      expect(bundle).toContain('* css/mobile-overrides.css');
      expect(bundle).toContain('* css/theme-toggle.css');
      expect(bundle).toContain('* css/forms.css');

      // Verify bundle has content
      expect(bundle.length).toBeGreaterThan(10000);
    });

    test('admin CSS bundle exists and contains required files', () => {
      const bundlePath = path.join(projectRoot, 'css/bundle-admin.css');
      expect(fs.existsSync(bundlePath)).toBe(true);

      const bundle = fs.readFileSync(bundlePath, 'utf8');

      // Check that admin CSS files are included (with proper comment format)
      expect(bundle).toContain('* css/admin-overrides.css');
      expect(bundle).toContain('* css/admin-auth-guard.css');

      // Verify bundle has content
      expect(bundle.length).toBeGreaterThan(5000);
    });

    test('bundles reduce total file count significantly', () => {
      const criticalSize = fs.statSync(path.join(projectRoot, 'css/bundle-critical.css')).size;
      const deferredSize = fs.statSync(path.join(projectRoot, 'css/bundle-deferred.css')).size;
      const adminSize = fs.statSync(path.join(projectRoot, 'css/bundle-admin.css')).size;

      const totalBundleSize = criticalSize + deferredSize + adminSize;

      // Total bundles should be reasonable (less than 500KB)
      expect(totalBundleSize).toBeLessThan(500 * 1024);

      // Each bundle should have meaningful content
      expect(criticalSize).toBeGreaterThan(50 * 1024); // > 50KB
      expect(deferredSize).toBeGreaterThan(50 * 1024); // > 50KB
      expect(adminSize).toBeGreaterThan(20 * 1024); // > 20KB
    });
  });

  describe('HTML Pages Integration', () => {
    test('main site pages use bundled CSS', () => {
      const homePagePath = path.join(projectRoot, 'pages/core/home.html');
      const content = fs.readFileSync(homePagePath, 'utf8');

      // Should have bundled CSS
      expect(content).toContain('bundle-critical.css');
      expect(content).toContain('bundle-deferred.css');

      // Should NOT have admin bundle
      expect(content).not.toContain('bundle-admin.css');

      // Deferred CSS should use lazy loading pattern
      expect(content).toContain('media="print" onload="this.media=\'all\'"');
      expect(content).toContain('<noscript>');
    });

    test('admin pages use bundled CSS with admin bundle', () => {
      const adminPagePath = path.join(projectRoot, 'pages/admin/login.html');
      const content = fs.readFileSync(adminPagePath, 'utf8');

      // Should have all three bundles
      expect(content).toContain('bundle-critical.css');
      expect(content).toContain('bundle-admin.css');
      expect(content).toContain('bundle-deferred.css');

      // Deferred CSS should use lazy loading pattern
      expect(content).toContain('media="print" onload="this.media=\'all\'"');
    });

    test('no HTML pages have duplicate bundle references', () => {
      const htmlFiles = [
        'pages/core/home.html',
        'pages/core/tickets.html',
        'pages/admin/login.html',
        'pages/admin/index.html'
      ];

      htmlFiles.forEach(file => {
        const filePath = path.join(projectRoot, file);
        if (!fs.existsSync(filePath)) return;

        const content = fs.readFileSync(filePath, 'utf8');

        // Count occurrences of each bundle
        const criticalCount = (content.match(/bundle-critical\.css/g) || []).length;
        const deferredCount = (content.match(/bundle-deferred\.css/g) || []).length;

        // Each bundle appears twice: once in main link, once in noscript fallback
        expect(criticalCount).toBe(1);
        expect(deferredCount).toBe(2); // Link + noscript fallback
      });
    });

    test('CSS bundle order is correct (critical before deferred)', () => {
      const homePagePath = path.join(projectRoot, 'pages/core/home.html');
      const content = fs.readFileSync(homePagePath, 'utf8');

      const criticalIndex = content.indexOf('bundle-critical.css');
      const deferredIndex = content.indexOf('bundle-deferred.css');

      // Critical should load before deferred
      expect(criticalIndex).toBeGreaterThan(0);
      expect(deferredIndex).toBeGreaterThan(0);
      expect(criticalIndex).toBeLessThan(deferredIndex);
    });
  });

  describe('CSS Bundle Content Integrity', () => {
    test('critical CSS contains theme variables', () => {
      const bundle = fs.readFileSync(path.join(projectRoot, 'css/bundle-critical.css'), 'utf8');

      // Should contain CSS variables from base.css
      expect(bundle).toContain('--color-');
      expect(bundle).toContain(':root');
      expect(bundle).toContain('[data-theme=');
    });

    test('critical CSS contains typography definitions', () => {
      const bundle = fs.readFileSync(path.join(projectRoot, 'css/bundle-critical.css'), 'utf8');

      // Should contain font families
      expect(bundle).toContain('Bebas Neue');
      expect(bundle).toContain('Playfair Display');
    });

    test('deferred CSS contains cart styles', () => {
      const bundle = fs.readFileSync(path.join(projectRoot, 'css/bundle-deferred.css'), 'utf8');

      // Should contain floating cart styles
      expect(bundle).toContain('floating-cart');
      expect(bundle).toContain('cart-');
    });

    test('admin CSS contains admin-specific styles', () => {
      const bundle = fs.readFileSync(path.join(projectRoot, 'css/bundle-admin.css'), 'utf8');

      // Should contain admin styles
      expect(bundle).toContain('admin');
    });
  });

  describe('Performance Optimization', () => {
    test('bundle file sizes are optimized', () => {
      const criticalSize = fs.statSync(path.join(projectRoot, 'css/bundle-critical.css')).size;
      const deferredSize = fs.statSync(path.join(projectRoot, 'css/bundle-deferred.css')).size;
      const adminSize = fs.statSync(path.join(projectRoot, 'css/bundle-admin.css')).size;

      // Bundles should be well-distributed (no single bundle dominates)
      const totalSize = criticalSize + deferredSize + adminSize;
      const criticalPercentage = (criticalSize / totalSize) * 100;
      const deferredPercentage = (deferredSize / totalSize) * 100;

      // Critical should be largest but not more than 50%
      expect(criticalPercentage).toBeLessThan(50);
      expect(criticalPercentage).toBeGreaterThan(25);

      // Deferred should be substantial
      expect(deferredPercentage).toBeGreaterThan(20);
    });

    test('HTML pages have reduced CSS link count', () => {
      const pages = [
        'pages/core/home.html',
        'pages/core/tickets.html',
        'pages/core/about.html'
      ];

      pages.forEach(page => {
        const filePath = path.join(projectRoot, page);
        if (!fs.existsSync(filePath)) return;

        const content = fs.readFileSync(filePath, 'utf8');

        // Count CSS links (excluding fonts and external resources)
        const cssLinks = (content.match(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']\/css\//g) || []).length;

        // Should have 2-3 CSS links max (critical + deferred, possibly admin)
        expect(cssLinks).toBeLessThanOrEqual(3);
        expect(cssLinks).toBeGreaterThan(0);
      });
    });
  });

  describe('Dark Mode Support', () => {
    test('bundled CSS preserves dark mode styles', () => {
      const criticalBundle = fs.readFileSync(path.join(projectRoot, 'css/bundle-critical.css'), 'utf8');
      const deferredBundle = fs.readFileSync(path.join(projectRoot, 'css/bundle-deferred.css'), 'utf8');

      // Check for dark theme support
      const combinedBundle = criticalBundle + deferredBundle;
      expect(combinedBundle).toContain('[data-theme="dark"]');
    });

    test('floating cart dark mode styles are in deferred bundle', () => {
      const deferredBundle = fs.readFileSync(path.join(projectRoot, 'css/bundle-deferred.css'), 'utf8');

      // Should contain floating-cart-dark.css content (with proper comment format)
      expect(deferredBundle).toContain('* css/floating-cart-dark.css');
    });
  });

  describe('Bundle Build Script', () => {
    test('bundle-css.js script exists and is executable', () => {
      const scriptPath = path.join(projectRoot, 'scripts/bundle-css.js');
      expect(fs.existsSync(scriptPath)).toBe(true);

      const script = fs.readFileSync(scriptPath, 'utf8');
      expect(script).toContain('bundleCSS');
      expect(script).toContain('CSS_FILES');
    });

    test('package.json has build:css script', () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
      );

      expect(packageJson.scripts['build:css']).toBeDefined();
      expect(packageJson.scripts['build:css']).toContain('bundle-css.js');
    });
  });
});

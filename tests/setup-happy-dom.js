/**
 * Happy-DOM Test Setup
 * Configures mocks and utilities for frontend DOM tests
 *
 * This file runs for tests with @vitest-environment happy-dom
 * Note: setup-jsdom.js handles jsdom-specific fixes separately
 */
import { afterEach } from 'vitest';

// Only run this setup for Happy-DOM environment tests
// Skip if running in node environment (default)
if (typeof document !== 'undefined' && typeof window !== 'undefined') {

  /**
   * Global fetch mock for CSS and static assets
   * Happy-DOM automatically tries to fetch external resources (CSS, images, etc.)
   * We need to mock these to prevent network errors in tests
   *
   * CRITICAL: This MUST be set up immediately (not in beforeAll) because Happy-DOM
   * fetches resources during test file loading, before any hooks run
   */
  const originalFetch = globalThis.fetch;

  // Mock fetch to handle CSS files and other static assets
  globalThis.fetch = async (url, options) => {
    const urlString = url.toString();

    // Mock CSS file requests
    if (urlString.endsWith('.css')) {
      return new Response('/* mocked css */', {
        status: 200,
        headers: { 'Content-Type': 'text/css' }
      });
    }

    // Mock image requests (return 1x1 transparent PNG)
    if (urlString.match(/\.(png|jpg|jpeg|gif|webp|svg|avif)$/i)) {
      // 1x1 transparent PNG as base64
      const transparentPng = atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      );
      return new Response(transparentPng, {
        status: 200,
        headers: { 'Content-Type': 'image/png' }
      });
    }

    // Mock font requests
    if (urlString.match(/\.(woff|woff2|ttf|eot)$/i)) {
      return new Response('', {
        status: 200,
        headers: { 'Content-Type': 'font/woff2' }
      });
    }

    // Mock JavaScript module requests
    if (urlString.endsWith('.js') && !urlString.includes('node_modules')) {
      return new Response('export default {};', {
        status: 200,
        headers: { 'Content-Type': 'application/javascript' }
      });
    }

    // For all other requests, use original fetch if available
    if (originalFetch) {
      return originalFetch(url, options);
    }

    // Fallback: return 404
    return new Response('Not Found', { status: 404 });
  };

  afterEach(() => {
    // Clear all timers to prevent "document is not defined" errors after teardown
    // This fixes issues where setTimeout/setInterval continue running after tests complete
    if (typeof setTimeout !== 'undefined') {
      const highestTimeoutId = setTimeout(() => {}, 0);
      for (let i = 0; i < highestTimeoutId; i++) {
        clearTimeout(i);
        clearInterval(i);
      }
    }

    // Clean up DOM between tests
    if (document.body) {
      document.body.innerHTML = '';
    }

    // Clear any inline styles
    const styleSheets = Array.from(document.styleSheets);
    styleSheets.forEach(sheet => {
      try {
        if (sheet.ownerNode && sheet.ownerNode.parentNode) {
          sheet.ownerNode.parentNode.removeChild(sheet.ownerNode);
        }
      } catch (e) {
        // Ignore errors from external stylesheets
      }
    });

    // Reset document title
    document.title = '';

    // Clear localStorage and sessionStorage (with safety check for different DOM implementations)
    if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
      localStorage.clear();
    }
    if (typeof sessionStorage !== 'undefined' && typeof sessionStorage.clear === 'function') {
      sessionStorage.clear();
    }
  });

  console.log('🎨 Happy-DOM test environment ready with mocked fetch');
}

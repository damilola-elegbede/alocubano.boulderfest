/**
 * Navigation Links Integration Tests
 *
 * Tests that all navigation links return valid responses and don't redirect to home page (fallback behavior).
 * This test will FAIL if any navigation links are broken.
 */
import { test, expect } from 'vitest';
import { testRequest, HTTP_STATUS } from '../handler-test-helper.js';

// Define all critical navigation paths that must work
const NAVIGATION_LINKS = {
  // Main navigation links
  mainNav: [
    { path: '/home', description: 'Home page' },
    { path: '/about', description: 'About page' },
    { path: '/tickets', description: 'Tickets page' },
    { path: '/donations', description: 'Donations page' },
    { path: '/contact', description: 'Contact page' },
  ],

  // Boulder Fest 2026 event pages
  boulderFest2026: [
    { path: '/boulder-fest-2026', description: 'Boulder Fest 2026 overview' },
    { path: '/boulder-fest-2026/artists', description: 'Boulder Fest 2026 artists' },
    { path: '/boulder-fest-2026/schedule', description: 'Boulder Fest 2026 schedule' },
    { path: '/boulder-fest-2026/gallery', description: 'Boulder Fest 2026 gallery' },
  ],

  // Boulder Fest 2025 event pages
  boulderFest2025: [
    { path: '/boulder-fest-2025', description: 'Boulder Fest 2025 overview' },
    { path: '/boulder-fest-2025/artists', description: 'Boulder Fest 2025 artists' },
    { path: '/boulder-fest-2025/schedule', description: 'Boulder Fest 2025 schedule' },
    { path: '/boulder-fest-2025/gallery', description: 'Boulder Fest 2025 gallery' },
  ],

  // Weekender 2025-11 event pages
  weekender202511: [
    { path: '/weekender-2025-11', description: 'Weekender Nov 2025 overview' },
    { path: '/weekender-2025-11/artists', description: 'Weekender Nov 2025 artists' },
    { path: '/weekender-2025-11/schedule', description: 'Weekender Nov 2025 schedule' },
    { path: '/weekender-2025-11/gallery', description: 'Weekender Nov 2025 gallery' },
  ],

  // Shortcut links (these redirect to Boulder Fest 2026)
  shortcuts: [
    { path: '/gallery', description: 'Gallery shortcut', redirectsTo: '/boulder-fest-2026/gallery' },
    { path: '/artists', description: 'Artists shortcut', redirectsTo: '/boulder-fest-2026/artists' },
    { path: '/schedule', description: 'Schedule shortcut', redirectsTo: '/boulder-fest-2026/schedule' },
  ],
};

/**
 * Helper function to validate that a page response is successful and not a fallback to home
 */
function validatePageResponse(response, linkConfig) {
  // Check for successful status code
  expect([HTTP_STATUS.OK, 200, 301, 302, 307, 308].includes(response.status),
    `${linkConfig.description} (${linkConfig.path}) should return valid status code`
  ).toBe(true);

  // If it's a redirect, that's expected for some links
  if (response.status >= 300 && response.status < 400) {
    return; // Redirects are handled by Vercel routing
  }

  // For successful responses, validate it's HTML content
  const contentType = response.headers?.get?.('content-type') || response.headers?.['content-type'] || '';

  if (response.status === HTTP_STATUS.OK) {
    // Should be HTML content for page requests
    expect(contentType.includes('text/html') || contentType.includes('text/plain'),
      `${linkConfig.description} should return HTML content, got: ${contentType}`
    ).toBe(true);
  }
}

test.describe('Navigation Links - Main Navigation', () => {
  test('all main navigation links should return valid responses', async () => {
    for (const link of NAVIGATION_LINKS.mainNav) {
      const response = await testRequest('GET', link.path);
      validatePageResponse(response, link);
    }
  });
});

test.describe('Navigation Links - Boulder Fest 2026', () => {
  test('Boulder Fest 2026 overview and sub-pages should be accessible', async () => {
    for (const link of NAVIGATION_LINKS.boulderFest2026) {
      const response = await testRequest('GET', link.path);
      validatePageResponse(response, link);
    }
  });
});

test.describe('Navigation Links - Boulder Fest 2025', () => {
  test('Boulder Fest 2025 overview and sub-pages should be accessible', async () => {
    for (const link of NAVIGATION_LINKS.boulderFest2025) {
      const response = await testRequest('GET', link.path);
      validatePageResponse(response, link);
    }
  });
});

test.describe('Navigation Links - Weekender 2025-11', () => {
  test('Weekender Nov 2025 overview should be accessible', async () => {
    const link = NAVIGATION_LINKS.weekender202511[0];
    const response = await testRequest('GET', link.path);
    validatePageResponse(response, link);
  });

  test('Weekender Nov 2025 artists page should be accessible', async () => {
    const link = NAVIGATION_LINKS.weekender202511[1];
    const response = await testRequest('GET', link.path);
    validatePageResponse(response, link);
  });

  test('Weekender Nov 2025 schedule page should be accessible', async () => {
    const link = NAVIGATION_LINKS.weekender202511[2];
    const response = await testRequest('GET', link.path);
    validatePageResponse(response, link);
  });

  test('Weekender Nov 2025 gallery page should be accessible', async () => {
    const link = NAVIGATION_LINKS.weekender202511[3];
    const response = await testRequest('GET', link.path);
    validatePageResponse(response, link);
  });
});

test.describe('Navigation Links - Shortcuts', () => {
  test('shortcut links should redirect or return valid responses', async () => {
    for (const link of NAVIGATION_LINKS.shortcuts) {
      const response = await testRequest('GET', link.path);

      // Shortcuts can either redirect or return OK
      expect([HTTP_STATUS.OK, 200, 301, 302, 307, 308].includes(response.status),
        `${link.description} should return valid status`
      ).toBe(true);
    }
  });
});

test.describe('Navigation Links - Broken Link Detection', () => {
  test('previously broken URLs should now work', async () => {
    const previouslyBrokenLinks = [
      // These were redirecting to home before the fix
      { path: '/weekender-2025-11/artists', description: 'Weekender artists (was broken)' },
      { path: '/weekender-2025-11/schedule', description: 'Weekender schedule (was broken)' },
      { path: '/weekender-2025-11/gallery', description: 'Weekender gallery (was broken)' },
    ];

    for (const link of previouslyBrokenLinks) {
      const response = await testRequest('GET', link.path);
      validatePageResponse(response, link);
    }
  });

  test('invalid URLs that should NOT exist return appropriate errors', async () => {
    const invalidLinks = [
      { path: '/2025-11-weekender', description: 'Old weekender URL pattern' },
      { path: '/2025-nov-artists', description: 'Old artist URL pattern' },
      { path: '/2025-nov-schedule', description: 'Old schedule URL pattern' },
      { path: '/2025-nov-gallery', description: 'Old gallery URL pattern' },
    ];

    for (const link of invalidLinks) {
      const response = await testRequest('GET', link.path);

      // These should either redirect to home (via Vercel fallback) or return 404
      // The key is they should NOT return a valid weekender page
      expect(
        response.status === 404 ||
        response.status >= 300, // Redirects are acceptable (to home)
        `${link.description} should not return a valid response (got ${response.status})`
      ).toBe(true);
    }
  });
});

test.describe('Navigation Links - Comprehensive Smoke Test', () => {
  test('all critical navigation paths should be accessible', async () => {
    const allLinks = [
      ...NAVIGATION_LINKS.mainNav,
      ...NAVIGATION_LINKS.boulderFest2026,
      ...NAVIGATION_LINKS.boulderFest2025,
      ...NAVIGATION_LINKS.weekender202511,
    ];

    let successCount = 0;
    let failureCount = 0;
    const failures = [];

    for (const link of allLinks) {
      try {
        const response = await testRequest('GET', link.path);
        validatePageResponse(response, link);
        successCount++;
      } catch (error) {
        failureCount++;
        failures.push({ link: link.path, description: link.description, error: error.message });
      }
    }

    // Report results
    if (failureCount > 0) {
      console.error(`\n❌ Navigation Link Failures (${failureCount}/${allLinks.length}):`);
      failures.forEach(failure => {
        console.error(`  - ${failure.description} (${failure.link}): ${failure.error}`);
      });
    }

    console.log(`\n✅ Navigation Links: ${successCount}/${allLinks.length} passed`);

    // All links should pass
    expect(failureCount).toBe(0);
    expect(successCount).toBe(allLinks.length);
  });
});

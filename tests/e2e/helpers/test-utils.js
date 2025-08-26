/**
 * Common test utilities for Playwright E2E tests
 */

import { expect } from '@playwright/test';

/**
 * Generate unique test data with timestamp
 */
export function generateTestData(prefix = 'test') {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  
  return {
    email: `${prefix}_${timestamp}_${random}@e2e-test.com`,
    name: `Test User ${timestamp}`,
    phone: `555-${String(timestamp).slice(-7)}`,
    timestamp,
    random,
    uniqueId: `${prefix}_${timestamp}_${random}`
  };
}

/**
 * Wait for API endpoint to be ready
 */
export async function waitForAPI(page, endpoint, maxAttempts = 30) {
  const baseUrl = page.context()._options.baseURL || 'http://localhost:3000';
  const url = `${baseUrl}${endpoint}`;
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await page.request.get(url);
      if (response.ok()) {
        return true;
      }
    } catch (error) {
      // Continue retrying
    }
    await page.waitForTimeout(1000);
  }
  
  throw new Error(`API endpoint ${endpoint} not ready after ${maxAttempts} attempts`);
}

/**
 * Login helper for authenticated tests
 */
export async function loginAsAdmin(page, password = process.env.TEST_ADMIN_PASSWORD) {
  await page.goto('/admin/login');
  await page.fill('input[type="password"]', password || 'test-password');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin/dashboard');
}

/**
 * Fill form helper with automatic field detection
 */
export async function fillForm(page, data) {
  for (const [key, value] of Object.entries(data)) {
    // Try different selector strategies
    const selectors = [
      `input[name="${key}"]`,
      `input[id="${key}"]`,
      `textarea[name="${key}"]`,
      `select[name="${key}"]`,
      `input[placeholder*="${key}" i]`,
      `input[aria-label*="${key}" i]`
    ];
    
    for (const selector of selectors) {
      const element = await page.$(selector);
      if (element) {
        const tagName = await element.evaluate(el => el.tagName);
        
        if (tagName === 'SELECT') {
          await page.selectOption(selector, value);
        } else {
          await page.fill(selector, value);
        }
        break;
      }
    }
  }
}

/**
 * Check accessibility for page or element
 */
export async function checkAccessibility(page, selector = null) {
  const results = await page.evaluate(async (sel) => {
    // Simple accessibility checks
    const checks = [];
    
    const element = sel ? document.querySelector(sel) : document;
    if (!element) return checks;
    
    // Check for images without alt text
    const images = element.querySelectorAll('img');
    images.forEach(img => {
      if (!img.alt) {
        checks.push({
          type: 'error',
          message: `Image missing alt text: ${img.src}`
        });
      }
    });
    
    // Check for form inputs without labels
    const inputs = element.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (!label && !input.ariaLabel && input.type !== 'hidden') {
        checks.push({
          type: 'error',
          message: `Form input missing label: ${input.name || input.id}`
        });
      }
    });
    
    // Check for buttons without accessible text
    const buttons = element.querySelectorAll('button');
    buttons.forEach(button => {
      if (!button.textContent.trim() && !button.ariaLabel) {
        checks.push({
          type: 'error',
          message: 'Button missing accessible text'
        });
      }
    });
    
    // Check color contrast (simplified)
    const textElements = element.querySelectorAll('p, span, div, h1, h2, h3, h4, h5, h6');
    textElements.forEach(el => {
      const style = window.getComputedStyle(el);
      const bgColor = style.backgroundColor;
      const color = style.color;
      
      // Basic check for very low contrast
      if (bgColor === color) {
        checks.push({
          type: 'warning',
          message: 'Possible contrast issue detected'
        });
      }
    });
    
    return checks;
  }, selector);
  
  return results;
}

/**
 * Take screenshot with custom name
 */
export async function screenshot(page, name) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({
    path: `test-results/screenshots/${name}-${timestamp}.png`,
    fullPage: true
  });
}

/**
 * Wait for element and scroll into view
 */
export async function waitAndScroll(page, selector, options = {}) {
  const element = await page.waitForSelector(selector, options);
  await element.scrollIntoViewIfNeeded();
  return element;
}

/**
 * Mock API responses
 */
export async function mockAPI(page, pattern, response) {
  await page.route(pattern, route => {
    route.fulfill({
      status: response.status || 200,
      contentType: 'application/json',
      body: JSON.stringify(response.body || {})
    });
  });
}

/**
 * Wait for network idle
 */
export async function waitForNetworkIdle(page, timeout = 5000) {
  await page.waitForLoadState('networkidle', { timeout });
}

/**
 * Retry helper for flaky operations
 */
export async function retry(fn, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Check if element is in viewport
 */
export async function isInViewport(page, selector) {
  return await page.evaluate(sel => {
    const element = document.querySelector(sel);
    if (!element) return false;
    
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.right <= window.innerWidth
    );
  }, selector);
}

/**
 * Get text content safely
 */
export async function getTextContent(page, selector) {
  const element = await page.$(selector);
  if (!element) return null;
  return await element.textContent();
}

/**
 * Assert element count
 */
export async function assertElementCount(page, selector, expectedCount) {
  const elements = await page.$$(selector);
  expect(elements.length).toBe(expectedCount);
}
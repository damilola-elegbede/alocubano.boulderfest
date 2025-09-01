import { test, expect } from '@playwright/test';

test.describe('Network Failures and Recovery', () => {
  test.beforeEach(async ({ page }) => {
    // Set up page with basic configuration
    await page.goto('/');
  });

  test('handles API timeout gracefully', async ({ page }) => {
    // Simulate slow network conditions
    await page.route('/api/gallery', async route => {
      await page.waitForTimeout(1000);
      await route.fulfill({
        status: 408,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Request Timeout' })
      });
    });

    await page.goto('/gallery');
    
    // Should show error message
    await expect(page.locator('[data-testid="gallery-error"]')).toBeVisible();
  });

  test('recovers from network interruption', async ({ page }) => {
    let requestCount = 0;
    
    await page.route('/api/gallery', async route => {
      requestCount++;
      if (requestCount === 1) {
        // First request fails
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Network Error' })
        });
      } else {
        // Second request succeeds
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            images: [
              { id: '1', thumbnail: 'thumb1.jpg', webViewLink: 'view1.jpg' },
              { id: '2', thumbnail: 'thumb2.jpg', webViewLink: 'view2.jpg' }
            ]
          })
        });
      }
    });

    await page.goto('/gallery');
    
    // Should eventually show gallery content after retry
    await expect(page.locator('[data-testid="gallery-container"]')).toBeVisible();
  });

  test('handles slow image loading', async ({ page }) => {
    await page.route('**/thumb*.jpg', async route => {
      await page.waitForTimeout(1000);
      await route.fulfill({
        status: 200,
        contentType: 'image/jpeg',
        body: Buffer.from('fake-image-data')
      });
    });

    await page.goto('/gallery');
    
    // Should show loading states
    await expect(page.locator('[data-testid="loading-spinner"]').first()).toBeVisible();
    
    // Wait for images to load
    await page.waitForTimeout(2000);
    
    const finalImageCount = await page.locator('img[src*="thumb"]').count();
    expect(finalImageCount).toBeGreaterThan(0);
  });

  test('payment flow resilience under network stress', async ({ page }) => {
    // Simulate intermittent network issues during payment
    let paymentAttempts = 0;
    
    await page.route('/api/payments/create-checkout-session', async route => {
      paymentAttempts++;
      if (paymentAttempts < 3) {
        await page.waitForTimeout(1000);
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Service Temporarily Unavailable' })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ sessionId: 'test-session-id' })
        });
      }
    });

    await page.goto('/tickets');
    
    // Add ticket to cart
    await page.click('[data-testid="add-weekend-pass"]');
    
    // Attempt checkout
    await page.click('[data-testid="checkout-button"]');
    
    // Should eventually succeed after retries
    await expect(page.locator('[data-testid="payment-processing"]')).toBeVisible();
  });

  test('offline behavior and recovery', async ({ page }) => {
    await page.goto('/tickets');
    
    // Go offline
    await page.context().setOffline(true);
    
    // Try to interact with the site
    await page.click('[data-testid="add-weekend-pass"]');
    
    // Should show offline message
    await expect(page.locator('[data-testid="offline-message"]')).toBeVisible();
    
    // Go back online
    await page.context().setOffline(false);
    await page.waitForTimeout(1000);
    
    // Should recover and work normally
    await page.click('[data-testid="add-weekend-pass"]');
    await expect(page.locator('[data-testid="cart-count"]')).toHaveText('1');
  });

  test('handles various network conditions', async ({ page }) => {
    const networkConditions = [
      'slow-3g',
      'fast-3g', 
      '4g'
    ];

    for (const condition of networkConditions) {
      await page.goto('/');
      
      // Emulate network condition
      const client = await page.context().newCDPSession(page);
      await client.send('Network.emulateNetworkConditions', {
        offline: false,
        downloadThroughput: condition === 'slow-3g' ? 50000 : condition === 'fast-3g' ? 150000 : 1600000,
        uploadThroughput: condition === 'slow-3g' ? 50000 : condition === 'fast-3g' ? 150000 : 750000,
        latency: condition === 'slow-3g' ? 2000 : condition === 'fast-3g' ? 562.5 : 150
      });

      // Navigate to gallery
      await page.goto('/gallery');
      
      // Should load eventually regardless of network speed
      await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
      
      // Verify gallery functionality
      const galleryImages = await page.locator('img').count();
      expect(galleryImages).toBeGreaterThan(0);
    }
  });

  test('cart persistence during network failures', async ({ page }) => {
    await page.goto('/tickets');
    
    // Add items to cart
    await page.click('[data-testid="add-weekend-pass"]');
    await page.click('[data-testid="add-friday-only"]');
    
    // Verify cart has items
    await expect(page.locator('[data-testid="cart-count"]')).toHaveText('2');
    
    // Simulate network failure
    await page.context().setOffline(true);
    await page.waitForTimeout(1000);
    
    // Cart should still show items (localStorage)
    await expect(page.locator('[data-testid="cart-count"]')).toHaveText('2');
    
    // Navigate to another page
    await page.goto('/about');
    
    // Cart should persist
    await expect(page.locator('[data-testid="cart-count"]')).toHaveText('2');
    
    // Go back online
    await page.context().setOffline(false);
    await page.waitForTimeout(1000);
    
    // Cart should still be intact
    await expect(page.locator('[data-testid="cart-count"]')).toHaveText('2');
  });

  test('registration form submission with network issues', async ({ page }) => {
    // Mock registration endpoint with intermittent failures
    let submissionAttempts = 0;
    
    await page.route('/api/registration/batch', async route => {
      submissionAttempts++;
      if (submissionAttempts < 2) {
        await page.waitForTimeout(1000);
        await route.fulfill({
          status: 502,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Bad Gateway' })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        });
      }
    });

    // Navigate to registration with a mock token
    await page.goto('/registration/test-token');
    
    // Fill out registration form
    await page.fill('[data-testid="attendee-name-0"]', 'Test User');
    await page.fill('[data-testid="attendee-email-0"]', 'test@example.com');
    
    // Submit form
    await page.click('[data-testid="submit-registration"]');
    
    // Should show success after retry
    await expect(page.locator('[data-testid="registration-success"]')).toBeVisible({ timeout: 10000 });
  });

  test('newsletter signup with network failures', async ({ page }) => {
    let newsletterAttempts = 0;
    
    await page.route('/api/email/subscribe', async route => {
      newsletterAttempts++;
      if (newsletterAttempts === 1) {
        await page.waitForTimeout(1000);
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        });
      }
    });

    await page.goto('/');
    
    // Fill newsletter form
    await page.fill('[data-testid="newsletter-email"]', 'test@example.com');
    
    // Submit
    await page.click('[data-testid="newsletter-submit"]');
    
    // Should eventually show success
    await expect(page.locator('[data-testid="newsletter-success"]')).toBeVisible({ timeout: 8000 });
  });

  test('admin dashboard network resilience', async ({ page }) => {
    // Mock login
    await page.route('/api/admin/login', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ 
          success: true, 
          token: 'test-jwt-token',
          redirectUrl: '/admin/dashboard'
        })
      });
    });

    // Mock dashboard with network issues
    let dashboardAttempts = 0;
    await page.route('/api/admin/dashboard', async route => {
      dashboardAttempts++;
      if (dashboardAttempts < 3) {
        await page.waitForTimeout(1000);
        await route.fulfill({
          status: 504,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Gateway Timeout' })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            totalTickets: 50,
            totalRevenue: 2500,
            registrations: []
          })
        });
      }
    });

    await page.goto('/admin');
    
    // Login
    await page.fill('[data-testid="admin-password"]', 'test-password');
    await page.click('[data-testid="admin-login"]');
    
    // Should eventually show dashboard
    await expect(page.locator('[data-testid="dashboard-stats"]')).toBeVisible({ timeout: 15000 });
  });

  test('concurrent user simulation with network stress', async ({ page, context }) => {
    // Create multiple tabs to simulate concurrent users
    const pages = [page];
    
    for (let i = 0; i < 3; i++) {
      const newPage = await context.newPage();
      pages.push(newPage);
    }

    // Add network delays to all requests
    for (const p of pages) {
      await p.route('**/*', async route => {
        await p.waitForTimeout(Math.random() * 500); // Random delay
        await route.continue();
      });
    }

    // Navigate all pages concurrently
    const navigationPromises = pages.map((p, index) => 
      p.goto(index % 2 === 0 ? '/tickets' : '/gallery')
    );
    
    await Promise.all(navigationPromises);

    // Add items to cart concurrently
    const cartPromises = pages.map(async (p) => {
      const url = p.url();
      if (url.includes('/tickets')) {
        await p.click('[data-testid="add-weekend-pass"]').catch(() => {});
      }
    });

    await Promise.all(cartPromises);

    // Verify all pages loaded successfully
    for (const p of pages) {
      await expect(p.locator('h1')).toBeVisible();
    }

    // Clean up additional pages
    for (let i = 1; i < pages.length; i++) {
      await pages[i].close();
    }
  });
});
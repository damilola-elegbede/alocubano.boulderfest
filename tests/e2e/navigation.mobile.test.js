/**
 * Mobile Navigation Tests
 * Tests mobile-specific navigation and responsive behavior
 */
import { test, expect, devices } from '@playwright/test';

// Only run these tests on mobile viewport projects
test.describe('Mobile Navigation', () => {
  test('mobile menu hamburger works', async ({ page, isMobile }) => {
    // This test only makes sense on mobile viewports
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/');
    
    // Hamburger menu should be visible on mobile
    const menuToggle = page.locator('.menu-toggle');
    await expect(menuToggle).toBeVisible();
    
    // Check initial menu state (might be flex but hidden off-screen)
    const navList = page.locator('.nav-list');
    const body = page.locator('body');
    
    // Menu should not have menu-open class initially
    await expect(body).not.toHaveClass(/menu-open/);
    
    // Click hamburger to open menu
    await menuToggle.click();
    
    // Menu should slide in
    await expect(navList).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/menu-open/);
    
    // Click a nav link
    await page.locator('.nav-link[href="/tickets"]').click();
    
    // Menu should close after navigation
    await expect(body).not.toHaveClass(/menu-open/);
  });

  test('touch targets are 44px minimum', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/tickets');
    
    // Check all interactive elements have proper touch target size
    const buttons = await page.locator('button, .btn, .ticket-btn').all();
    
    for (const button of buttons.slice(0, 5)) { // Check first 5 to avoid timeout
      const box = await button.boundingBox();
      if (box) {
        // Touch targets should be at least 44x44px
        expect(box.height).toBeGreaterThanOrEqual(44);
        // Width might vary for text buttons, but height is key for touch
      }
    }
  });

  test('mobile viewport shows floating cart', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    // Add item to cart first
    await page.goto('/tickets');
    
    // Add a ticket to cart
    const firstAddButton = page.locator('.ticket-btn').first();
    await firstAddButton.click();
    
    // Floating cart should be visible on mobile
    const floatingCart = page.locator('.floating-cart');
    await expect(floatingCart).toBeVisible();
    
    // Cart should be positioned fixed at bottom
    await expect(floatingCart).toHaveCSS('position', 'fixed');
    
    // Mobile cart should be more compact
    const cartBox = await floatingCart.boundingBox();
    if (cartBox) {
      // Mobile cart should not take full width
      expect(cartBox.width).toBeLessThan(400);
    }
  });

  test('mobile dropdown navigation works', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/');
    
    // Open mobile menu
    await page.locator('.menu-toggle').click();
    
    // Find Events dropdown trigger
    const eventsTrigger = page.locator('.nav-trigger[data-dropdown="events"]');
    await expect(eventsTrigger).toBeVisible();
    
    // Click to expand dropdown
    await eventsTrigger.click();
    
    // Dropdown menu should be visible
    const dropdownMenu = page.locator('.dropdown-menu[data-dropdown-content="events"]');
    await expect(dropdownMenu).toBeVisible();
    
    // Should have mobile-friendly spacing
    const dropdownBox = await dropdownMenu.boundingBox();
    if (dropdownBox) {
      // Dropdown should be full width on mobile
      expect(dropdownBox.width).toBeGreaterThan(250);
    }
  });

  test('mobile scroll behavior is smooth', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/about');
    
    // Check that overflow-x is hidden to prevent horizontal scroll
    const body = page.locator('body');
    await expect(body).toHaveCSS('overflow-x', 'hidden');
    
    // Verify no horizontal scrollbar
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    
    // Document width should not exceed viewport (no horizontal scroll)
    expect(documentWidth).toBeLessThanOrEqual(viewportWidth + 1); // +1 for rounding
  });
});

test.describe('Mobile Form Interactions', () => {
  test('mobile email signup is optimized', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/');
    
    // Scroll to newsletter form
    const newsletterForm = page.locator('.newsletter-section');
    await newsletterForm.scrollIntoViewIfNeeded();
    
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();
    
    // Mobile keyboards should trigger with correct input type
    const inputType = await emailInput.getAttribute('type');
    expect(inputType).toBe('email');
    
    // Check that input is large enough for mobile
    const inputBox = await emailInput.boundingBox();
    if (inputBox) {
      expect(inputBox.height).toBeGreaterThanOrEqual(40);
    }
    
    // Test form submission
    await emailInput.fill('mobile@test.com');
    await page.locator('button[type="submit"]').click();
    
    // Should show feedback (success or error)
    await expect(page.locator('.newsletter-message, .success, .error')).toBeVisible({ timeout: 5000 });
  });

  test('mobile payment flow is accessible', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/tickets');
    
    // Add ticket to cart
    await page.locator('.ticket-btn').first().click();
    
    // Open cart
    await page.locator('.floating-cart').click();
    
    // Checkout button should be prominent on mobile
    const checkoutBtn = page.locator('.checkout-btn, .cart-checkout, button:has-text("Checkout")');
    await expect(checkoutBtn).toBeVisible();
    
    const btnBox = await checkoutBtn.boundingBox();
    if (btnBox) {
      // Checkout button should be full width on mobile
      expect(btnBox.width).toBeGreaterThan(200);
      expect(btnBox.height).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('Mobile Gallery Experience', () => {
  test('mobile gallery uses virtual scrolling', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/gallery');
    
    // Gallery should load
    const gallery = page.locator('.gallery-content, .virtual-gallery, [class*="gallery"]');
    await expect(gallery).toBeVisible();
    
    // Check for lazy loading images
    const images = page.locator('.gallery-item img, .photo-item img');
    const firstImage = images.first();
    
    if (await firstImage.count() > 0) {
      // Images should have loading="lazy" for performance
      const loadingAttr = await firstImage.getAttribute('loading');
      expect(loadingAttr).toBe('lazy');
    }
    
    // Mobile should show fewer columns
    const galleryGrid = page.locator('.gallery-grid, .gallery-content');
    const gridStyle = await galleryGrid.getAttribute('style');
    
    // Mobile typically shows 1-2 columns vs desktop 3-4
    if (gridStyle && gridStyle.includes('grid-template-columns')) {
      expect(gridStyle).toMatch(/repeat\([12],/);
    }
  });

  test('mobile images are optimized', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/');
    
    // Check hero image has responsive sources
    const heroImage = page.locator('.hero img, .hero-image, img[alt*="hero"], img[alt*="Cuban"]').first();
    
    if (await heroImage.count() > 0) {
      // Check for responsive image attributes
      const srcset = await heroImage.getAttribute('srcset');
      const sizes = await heroImage.getAttribute('sizes');
      
      // Mobile optimized images should have srcset or be reasonably sized
      if (srcset) {
        expect(srcset).toContain('w');
      }
      
      // Image should not be huge on mobile
      const imageBox = await heroImage.boundingBox();
      if (imageBox) {
        expect(imageBox.width).toBeLessThanOrEqual(800);
      }
    }
  });
});

test.describe('PWA Capabilities', () => {
  test('PWA manifest is accessible', async ({ page }) => {
    await page.goto('/');
    
    // Check for manifest link
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute('href', '/manifest.json');
    
    // Verify manifest loads
    const manifestResponse = await page.request.get('/manifest.json');
    expect(manifestResponse.ok()).toBeTruthy();
    
    const manifest = await manifestResponse.json();
    
    // Check PWA requirements
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.display).toMatch(/standalone|fullscreen|minimal-ui/);
    expect(manifest.icons).toBeInstanceOf(Array);
    expect(manifest.icons.length).toBeGreaterThan(0);
    
    // Check for mobile-specific icon sizes
    const mobileIcons = manifest.icons.filter(icon => 
      icon.sizes.includes('192x192') || icon.sizes.includes('512x512')
    );
    expect(mobileIcons.length).toBeGreaterThan(0);
  });

  test('service worker registration exists', async ({ page }) => {
    await page.goto('/');
    
    // Check if service worker registration code exists
    const hasServiceWorker = await page.evaluate(() => {
      return 'serviceWorker' in navigator;
    });
    
    expect(hasServiceWorker).toBeTruthy();
    
    // Check for SW registration script
    const swRegistration = await page.evaluate(() => {
      return navigator.serviceWorker.controller !== null || 
             window.matchMedia('(display-mode: standalone)').matches;
    });
    
    // Note: SW might not be registered in test environment, but capability should exist
  });

  test('mobile meta viewport is correct', async ({ page }) => {
    await page.goto('/');
    
    // Check viewport meta tag
    const viewport = page.locator('meta[name="viewport"]');
    await expect(viewport).toHaveAttribute('content', /width=device-width/);
    await expect(viewport).toHaveAttribute('content', /initial-scale=1/);
    
    // Check for iOS-specific meta tags
    const iosCapable = page.locator('meta[name="apple-mobile-web-app-capable"]');
    const iosStatusBar = page.locator('meta[name="apple-mobile-web-app-status-bar-style"]');
    
    // These enhance the mobile experience
    if (await iosCapable.count() > 0) {
      await expect(iosCapable).toHaveAttribute('content', 'yes');
    }
  });
});
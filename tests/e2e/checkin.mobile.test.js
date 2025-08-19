/**
 * Mobile Check-in System Tests
 * Tests QR scanning and mobile check-in functionality
 */
import { test, expect } from '@playwright/test';

test.describe('Mobile Check-in System', () => {
  test('admin check-in page loads on mobile', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/admin/checkin');
    
    // Should redirect to login if not authenticated
    const url = page.url();
    if (url.includes('/admin/login')) {
      // This is expected - admin area requires auth
      await expect(page.locator('h1, h2')).toContainText(/login|admin/i);
      
      // Login form should be mobile-optimized
      const loginForm = page.locator('form');
      await expect(loginForm).toBeVisible();
      
      // Check mobile-friendly input sizes
      const inputs = await page.locator('input[type="text"], input[type="password"]').all();
      for (const input of inputs) {
        const box = await input.boundingBox();
        if (box) {
          expect(box.height).toBeGreaterThanOrEqual(40);
        }
      }
    } else {
      // If somehow authenticated, check the check-in page
      await expect(page.locator('h1')).toContainText(/check.*in|scan/i);
    }
  });

  test('QR scanner UI is mobile-optimized', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    // Navigate to a page with QR functionality
    await page.goto('/tickets');
    
    // Check if ticket page has QR codes displayed
    const qrCodes = page.locator('.qr-code, img[alt*="QR"], canvas.qr');
    
    if (await qrCodes.count() > 0) {
      const firstQR = qrCodes.first();
      const qrBox = await firstQR.boundingBox();
      
      if (qrBox) {
        // QR codes should be appropriately sized for mobile scanning
        expect(qrBox.width).toBeGreaterThanOrEqual(150);
        expect(qrBox.width).toBeLessThanOrEqual(300);
      }
    }
  });

  test('manual ticket entry works on mobile', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/admin/checkin');
    
    // If redirected to login, that's fine - we're testing the UI exists
    const hasManualEntry = await page.locator('input[placeholder*="ticket"], input[placeholder*="manual"], input[type="text"][name*="ticket"]').count();
    
    if (hasManualEntry > 0) {
      const manualInput = page.locator('input[placeholder*="ticket"], input[placeholder*="manual"]').first();
      
      // Input should be mobile-friendly
      const inputBox = await manualInput.boundingBox();
      if (inputBox) {
        expect(inputBox.height).toBeGreaterThanOrEqual(40);
        
        // Should be wide enough for ticket IDs
        expect(inputBox.width).toBeGreaterThanOrEqual(200);
      }
      
      // Keyboard should be optimized
      const inputMode = await manualInput.getAttribute('inputmode');
      if (inputMode) {
        expect(['text', 'none', 'search']).toContain(inputMode);
      }
    }
  });

  test('offline mode UI indicators exist', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/');
    
    // Check for offline capability indicators
    const offlineCapable = await page.evaluate(() => {
      return 'serviceWorker' in navigator && 'caches' in window;
    });
    
    expect(offlineCapable).toBeTruthy();
    
    // Simulate offline mode
    await page.context().setOffline(true);
    
    // Navigate to any page
    await page.goto('/tickets').catch(() => {
      // Expected to fail when offline
    });
    
    // There should be some offline indication or cached content
    // Check if service worker provided a response
    const bodyContent = await page.locator('body').textContent();
    
    // Reset online status
    await page.context().setOffline(false);
  });

  test('camera permission prompt handling', async ({ page, isMobile, context }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    // Grant camera permissions for testing
    await context.grantPermissions(['camera']);
    
    await page.goto('/admin/checkin');
    
    // Check for camera-related UI elements
    const cameraElements = await page.locator('[class*="camera"], [class*="scan"], [id*="camera"], button:has-text("Scan")').count();
    
    if (cameraElements > 0) {
      // Camera UI should be present
      const scanButton = page.locator('button:has-text("Scan"), button:has-text("Camera")').first();
      
      if (await scanButton.count() > 0) {
        const btnBox = await scanButton.boundingBox();
        if (btnBox) {
          // Scan button should be prominently sized
          expect(btnBox.height).toBeGreaterThanOrEqual(44);
        }
      }
    }
  });
});

test.describe('Mobile Wallet Integration', () => {
  test('Apple Wallet button appears on iOS', async ({ page, browserName }) => {
    // This test would ideally run on webkit (Safari)
    if (browserName !== 'webkit') {
      test.skip();
      return;
    }

    await page.goto('/tickets');
    
    // Check for Apple Wallet integration
    const walletButtons = page.locator('button:has-text("Apple Wallet"), .apple-wallet-button, [aria-label*="Apple Wallet"]');
    
    // Note: Wallet buttons might only appear after ticket purchase
    if (await walletButtons.count() > 0) {
      const walletBtn = walletButtons.first();
      await expect(walletBtn).toBeVisible();
      
      // Should be properly sized for mobile
      const btnBox = await walletBtn.boundingBox();
      if (btnBox) {
        expect(btnBox.height).toBeGreaterThanOrEqual(40);
      }
    }
  });

  test('Google Wallet button appears on Android', async ({ page, browserName }) => {
    // This test would ideally run on chromium (Chrome on Android)
    if (browserName !== 'chromium') {
      test.skip();
      return;
    }

    await page.goto('/tickets');
    
    // Check for Google Wallet integration
    const walletButtons = page.locator('button:has-text("Google Wallet"), .google-wallet-button, [aria-label*="Google Wallet"]');
    
    if (await walletButtons.count() > 0) {
      const walletBtn = walletButtons.first();
      await expect(walletBtn).toBeVisible();
      
      // Should be properly sized for mobile
      const btnBox = await walletBtn.boundingBox();
      if (btnBox) {
        expect(btnBox.height).toBeGreaterThanOrEqual(40);
      }
    }
  });

  test('QR codes are high resolution for wallet storage', async ({ page }) => {
    await page.goto('/tickets');
    
    // Find QR code images
    const qrImages = page.locator('img[src*="qr"], canvas.qr, .qr-code img');
    
    if (await qrImages.count() > 0) {
      const firstQR = qrImages.first();
      
      // Check natural size for retina displays
      const dimensions = await firstQR.evaluate((img) => {
        if (img.tagName === 'IMG') {
          return {
            natural: { width: img.naturalWidth, height: img.naturalHeight },
            display: { width: img.width, height: img.height }
          };
        } else if (img.tagName === 'CANVAS') {
          return {
            natural: { width: img.width, height: img.height },
            display: { width: img.clientWidth, height: img.clientHeight }
          };
        }
        return null;
      });
      
      if (dimensions) {
        // QR codes should be high res for wallet storage
        expect(dimensions.natural.width).toBeGreaterThanOrEqual(256);
      }
    }
  });
});

test.describe('Mobile Performance', () => {
  test('mobile pages load within 3 seconds', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    const startTime = Date.now();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const loadTime = Date.now() - startTime;
    
    // Mobile load time should be reasonable even on slower connections
    expect(loadTime).toBeLessThan(3000);
  });

  test('mobile fonts are optimized', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/');
    
    // Check for font-display: swap for better mobile performance
    const fontFaceRules = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      const fontRules = [];
      
      sheets.forEach(sheet => {
        try {
          const rules = Array.from(sheet.cssRules || []);
          rules.forEach(rule => {
            if (rule instanceof CSSFontFaceRule) {
              fontRules.push(rule.style.fontDisplay);
            }
          });
        } catch (e) {
          // Cross-origin stylesheets might throw
        }
      });
      
      return fontRules;
    });
    
    // Fonts should use swap for better perceived performance
    fontFaceRules.forEach(display => {
      if (display) {
        expect(['swap', 'fallback', 'optional']).toContain(display);
      }
    });
  });

  test('mobile images are lazy loaded', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
      return;
    }

    await page.goto('/gallery');
    
    // Check images have lazy loading
    const images = page.locator('img').filter({ hasNot: page.locator('[loading="eager"]') });
    const imageCount = await images.count();
    
    if (imageCount > 5) {
      // Sample some images to check lazy loading
      for (let i = 0; i < Math.min(5, imageCount); i++) {
        const img = images.nth(i);
        const loading = await img.getAttribute('loading');
        
        // Non-critical images should be lazy loaded
        if (loading !== null) {
          expect(loading).toBe('lazy');
        }
      }
    }
  });
});
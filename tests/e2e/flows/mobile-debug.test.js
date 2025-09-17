import { test, expect } from '@playwright/test';

test.describe('Mobile Debug Test', () => {
  test.beforeEach(async ({ page }) => {
    // Set mobile viewport (iPhone SE size)
    await page.setViewportSize({ width: 375, height: 667 });
  });

  test('debug mobile navigation elements', async ({ page }) => {
    console.log('=== MOBILE DEBUG TEST ===');
    await page.goto('/');
    
    // Check if homepage loads
    await expect(page.locator('body')).toBeVisible();
    console.log('✅ Page loaded');
    
    // Find navigation elements
    const navigation = page.locator('nav');
    console.log('Navigation count:', await navigation.count());
    
    const menuToggle = page.locator('.menu-toggle');
    console.log('Menu toggle count:', await menuToggle.count());
    
    if (await menuToggle.count() > 0) {
      console.log('Menu toggle found, checking visibility...');
      await expect(menuToggle).toBeVisible();
      console.log('✅ Menu toggle visible');
      
      // Get initial state
      const ariaExpanded = await menuToggle.getAttribute('aria-expanded');
      console.log('Initial aria-expanded:', ariaExpanded);
      
      // Click the toggle
      await menuToggle.click();
      console.log('✅ Menu toggle clicked');
      
      // Wait a bit for animations
      await page.waitForTimeout(500);
      
      // Check new state
      const newAriaExpanded = await menuToggle.getAttribute('aria-expanded');
      console.log('New aria-expanded:', newAriaExpanded);
      
      // Check nav-list
      const navList = page.locator('.nav-list');
      console.log('Nav list count:', await navList.count());
      
      if (await navList.count() > 0) {
        const hasIsOpenClass = await navList.evaluate(el => el.classList.contains('is-open'));
        console.log('Nav list has is-open class:', hasIsOpenClass);
        
        const isVisible = await navList.isVisible();
        console.log('Nav list is visible:', isVisible);
        
        const computedStyle = await navList.evaluate(el => {
          const style = window.getComputedStyle(el);
          return {
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            transform: style.transform,
            height: style.height
          };
        });
        console.log('Nav list computed styles:', computedStyle);
      }
    }
    
    console.log('=== END DEBUG ===');
  });

  test('check mobile viewport and touch targets', async ({ page }) => {
    await page.goto('/tickets');
    
    // Check viewport
    const viewport = page.viewportSize();
    console.log('Viewport size:', viewport);
    
    // Check if we're in mobile mode
    const isMobile = await page.evaluate(() => window.innerWidth <= 768);
    console.log('Is mobile viewport:', isMobile);
    
    // Check button sizes (should be 44px minimum for touch)
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    console.log('Button count:', buttonCount);
    
    if (buttonCount > 0) {
      const firstButtonBox = await buttons.first().boundingBox();
      console.log('First button size:', firstButtonBox);
      
      if (firstButtonBox) {
        const minSize = Math.min(firstButtonBox.width, firstButtonBox.height);
        console.log('Min dimension:', minSize, 'px (should be >= 44px for touch)');
      }
    }
    
    // Check for mobile-specific elements
    const addToCartButtons = page.locator('.add-to-cart-btn');
    console.log('Add to cart buttons:', await addToCartButtons.count());
  });
});

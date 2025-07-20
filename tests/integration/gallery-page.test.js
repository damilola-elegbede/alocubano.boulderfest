/**
 * Integration tests for gallery page
 */

const puppeteer = require('puppeteer');

describe('Gallery Page Integration', () => {
  let browser;
  let page;
  const baseUrl = 'http://localhost:8000';
  
  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  });
  
  afterAll(async () => {
    await browser.close();
  });
  
  beforeEach(async () => {
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    // Mock console to capture logs
    page.on('console', msg => {
      console.log('Browser console:', msg.text());
    });
    
    // Log any page errors
    page.on('error', err => {
      console.error('Browser error:', err);
    });
  });
  
  afterEach(async () => {
    await page.close();
  });
  
  describe('Page Loading', () => {
    test('should load gallery page successfully', async () => {
      const response = await page.goto(`${baseUrl}/pages/typographic/gallery.html`, {
        waitUntil: 'networkidle2'
      });
      
      expect(response.status()).toBe(200);
      
      // Check page title
      const title = await page.title();
      expect(title).toBe('Gallery - A Lo Cubano Boulder Fest');
    });
    
    test('should have proper meta tags and favicons', async () => {
      await page.goto(`${baseUrl}/pages/typographic/gallery.html`);
      
      // Check viewport meta tag
      const viewport = await page.$eval('meta[name="viewport"]', el => el.content);
      expect(viewport).toBe('width=device-width, initial-scale=1.0');
      
      // Check favicon
      const favicon = await page.$eval('link[rel="icon"]', el => el.href);
      expect(favicon).toContain('favicon');
    });
  });
  
  describe('Hero Section', () => {
    test('should display hero title and subtitle', async () => {
      await page.goto(`${baseUrl}/pages/typographic/gallery.html`, {
        waitUntil: 'networkidle2'
      });
      
      // Check hero title
      const heroTitle = await page.$eval('.hero-title-massive', el => el.textContent.trim());
      expect(heroTitle).toContain('SEE THE');
      expect(heroTitle).toContain('MAGIC');
      
      // Check hero subtitle
      const heroSubtitle = await page.$eval('.hero-subtitle', el => el.textContent.trim());
      expect(heroSubtitle).toContain('Visual stories from our festival journey');
    });
    
    test('should display hero splash image', async () => {
      await page.goto(`${baseUrl}/pages/typographic/gallery.html`, {
        waitUntil: 'networkidle2'
      });
      
      // Wait for hero image
      await page.waitForSelector('#hero-splash-image');
      
      // Check that image has a source
      const heroImageSrc = await page.$eval('#hero-splash-image', el => el.src);
      expect(heroImageSrc).toBeTruthy();
      
      // In dev mode, should be black placeholder
      if (heroImageSrc.includes('localhost')) {
        expect(heroImageSrc).toContain('black-placeholder.svg');
      }
    });
  });
  
  describe('Festival Year Navigation', () => {
    test('should display festival year cards', async () => {
      await page.goto(`${baseUrl}/pages/typographic/gallery.html`, {
        waitUntil: 'networkidle2'
      });
      
      // Check for year cards
      const yearCards = await page.$$('.festival-year-card');
      expect(yearCards.length).toBeGreaterThan(0);
      
      // Check 2025 card specifically
      const card2025 = await page.$('.festival-year-card[data-year="2025"]');
      expect(card2025).toBeTruthy();
      
      const yearText = await page.$eval('.festival-year-card[data-year="2025"] .year-number', el => el.textContent);
      expect(yearText).toBe('2025');
    });
    
    test('should scroll to gallery section when year card is clicked', async () => {
      await page.goto(`${baseUrl}/pages/typographic/gallery.html`, {
        waitUntil: 'networkidle2'
      });
      
      // Get initial scroll position
      const initialScroll = await page.evaluate(() => window.scrollY);
      
      // Click on 2025 year card
      await page.click('.festival-year-card[data-year="2025"]');
      
      // Wait for smooth scroll
      await page.waitForTimeout(1000);
      
      // Check new scroll position
      const newScroll = await page.evaluate(() => window.scrollY);
      expect(newScroll).toBeGreaterThan(initialScroll);
      
      // Check if gallery section is in view
      const gallery2025InView = await page.evaluate(() => {
        const element = document.getElementById('gallery-2025');
        const rect = element.getBoundingClientRect();
        return rect.top >= 0 && rect.top <= window.innerHeight;
      });
      expect(gallery2025InView).toBe(true);
    });
  });
  
  describe('Gallery Grid Display', () => {
    test('should display gallery items in dev mode', async () => {
      await page.goto(`${baseUrl}/pages/typographic/gallery.html`, {
        waitUntil: 'networkidle2'
      });
      
      // Wait for gallery to load
      await page.waitForSelector('#gallery-2025-content', { visible: true });
      
      // Check that loading is hidden
      const loadingDisplay = await page.$eval('#gallery-2025-loading', el => 
        window.getComputedStyle(el).display
      );
      expect(loadingDisplay).toBe('none');
      
      // Check gallery items
      const galleryItems = await page.$$('.gallery-item');
      expect(galleryItems.length).toBe(20); // Dev mode shows 20 items
      
      // Check that items have images
      const firstItemHasImage = await page.$eval('.gallery-item:first-child', el => 
        el.querySelector('img') !== null || el.querySelector('video') !== null
      );
      expect(firstItemHasImage).toBe(true);
    });
    
    test('should display correct item types', async () => {
      await page.goto(`${baseUrl}/pages/typographic/gallery.html`, {
        waitUntil: 'networkidle2'
      });
      
      await page.waitForSelector('.gallery-item');
      
      // Count video items (every 5th item)
      const videoCount = await page.$$eval('.gallery-item-type', elements => 
        elements.filter(el => el.textContent === 'VIDEO').length
      );
      expect(videoCount).toBe(4); // Items 5, 10, 15, 20
      
      // Count photo items
      const photoCount = await page.$$eval('.gallery-item-type', elements => 
        elements.filter(el => el.textContent === 'PHOTO').length
      );
      expect(photoCount).toBe(16);
    });
  });
  
  describe('Lightbox Functionality', () => {
    test('should open lightbox when gallery item is clicked', async () => {
      await page.goto(`${baseUrl}/pages/typographic/gallery.html`, {
        waitUntil: 'networkidle2'
      });
      
      // Wait for gallery items
      await page.waitForSelector('.gallery-item');
      
      // Check lightbox is initially hidden
      const lightboxInitial = await page.$('#gallery-lightbox.active');
      expect(lightboxInitial).toBeNull();
      
      // Click first gallery item
      await page.click('.gallery-item:first-child');
      
      // Wait for lightbox to appear
      await page.waitForSelector('#gallery-lightbox.active');
      
      // Check lightbox is visible
      const lightboxVisible = await page.$eval('#gallery-lightbox', el => 
        el.classList.contains('active')
      );
      expect(lightboxVisible).toBe(true);
      
      // Check that body overflow is hidden
      const bodyOverflow = await page.$eval('body', el => el.style.overflow);
      expect(bodyOverflow).toBe('hidden');
    });
    
    test('should display image and navigation controls in lightbox', async () => {
      await page.goto(`${baseUrl}/pages/typographic/gallery.html`, {
        waitUntil: 'networkidle2'
      });
      
      await page.waitForSelector('.gallery-item');
      await page.click('.gallery-item:first-child');
      await page.waitForSelector('#gallery-lightbox.active');
      
      // Check for navigation buttons
      const closeBtn = await page.$('.lightbox-close');
      const prevBtn = await page.$('.lightbox-prev');
      const nextBtn = await page.$('.lightbox-next');
      
      expect(closeBtn).toBeTruthy();
      expect(prevBtn).toBeTruthy();
      expect(nextBtn).toBeTruthy();
      
      // Check for image
      const lightboxImage = await page.$('.lightbox-image');
      expect(lightboxImage).toBeTruthy();
      
      // Check for title and counter
      const title = await page.$eval('.lightbox-title', el => el.textContent);
      expect(title).toContain('Test Image');
      
      const counter = await page.$eval('.lightbox-counter', el => el.textContent);
      expect(counter).toBe('1 / 20');
    });
    
    test('should navigate between images with arrow buttons', async () => {
      await page.goto(`${baseUrl}/pages/typographic/gallery.html`, {
        waitUntil: 'networkidle2'
      });
      
      await page.waitForSelector('.gallery-item');
      await page.click('.gallery-item:first-child');
      await page.waitForSelector('#gallery-lightbox.active');
      
      // Get initial counter
      const initialCounter = await page.$eval('.lightbox-counter', el => el.textContent);
      expect(initialCounter).toBe('1 / 20');
      
      // Click next button
      await page.click('.lightbox-next');
      await page.waitForTimeout(300); // Wait for transition
      
      // Check updated counter
      const nextCounter = await page.$eval('.lightbox-counter', el => el.textContent);
      expect(nextCounter).toBe('2 / 20');
      
      // Click previous button
      await page.click('.lightbox-prev');
      await page.waitForTimeout(300);
      
      // Should be back to first image
      const prevCounter = await page.$eval('.lightbox-counter', el => el.textContent);
      expect(prevCounter).toBe('1 / 20');
    });
    
    test('should close lightbox with close button', async () => {
      await page.goto(`${baseUrl}/pages/typographic/gallery.html`, {
        waitUntil: 'networkidle2'
      });
      
      await page.waitForSelector('.gallery-item');
      await page.click('.gallery-item:first-child');
      await page.waitForSelector('#gallery-lightbox.active');
      
      // Click close button
      await page.click('.lightbox-close');
      await page.waitForTimeout(300);
      
      // Check lightbox is closed
      const lightboxClosed = await page.$eval('#gallery-lightbox', el => 
        !el.classList.contains('active')
      );
      expect(lightboxClosed).toBe(true);
      
      // Check body overflow is restored
      const bodyOverflow = await page.$eval('body', el => el.style.overflow);
      expect(bodyOverflow).toBe('');
    });
    
    test('should support keyboard navigation', async () => {
      await page.goto(`${baseUrl}/pages/typographic/gallery.html`, {
        waitUntil: 'networkidle2'
      });
      
      await page.waitForSelector('.gallery-item');
      await page.click('.gallery-item:nth-child(2)'); // Start with second item
      await page.waitForSelector('#gallery-lightbox.active');
      
      // Press right arrow
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(300);
      
      let counter = await page.$eval('.lightbox-counter', el => el.textContent);
      expect(counter).toBe('3 / 20');
      
      // Press left arrow
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(300);
      
      counter = await page.$eval('.lightbox-counter', el => el.textContent);
      expect(counter).toBe('2 / 20');
      
      // Press Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      
      const lightboxClosed = await page.$eval('#gallery-lightbox', el => 
        !el.classList.contains('active')
      );
      expect(lightboxClosed).toBe(true);
    });
  });
  
  describe('Responsive Design', () => {
    test('should work on mobile viewport', async () => {
      await page.setViewport({ width: 375, height: 667 }); // iPhone SE
      await page.goto(`${baseUrl}/pages/typographic/gallery.html`, {
        waitUntil: 'networkidle2'
      });
      
      // Check hero title is visible
      const heroVisible = await page.$eval('.hero-title-massive', el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      expect(heroVisible).toBe(true);
      
      // Check gallery grid adjusts
      await page.waitForSelector('.gallery-grid');
      const gridColumns = await page.$eval('.gallery-grid', el => 
        window.getComputedStyle(el).gridTemplateColumns
      );
      expect(gridColumns).toBeTruthy();
    });
    
    test('should work on tablet viewport', async () => {
      await page.setViewport({ width: 768, height: 1024 }); // iPad
      await page.goto(`${baseUrl}/pages/typographic/gallery.html`, {
        waitUntil: 'networkidle2'
      });
      
      const galleryItems = await page.$$('.gallery-item');
      expect(galleryItems.length).toBeGreaterThan(0);
    });
  });
});
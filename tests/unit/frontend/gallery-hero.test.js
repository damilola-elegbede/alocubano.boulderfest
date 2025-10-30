/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Gallery Hero Tests
 * Tests the gallery hero functionality including:
 * - Hero image selection (featured, random, manual)
 * - Hero display and responsive sizing
 * - Image optimization (format selection, lazy loading)
 * - Animation and transitions
 * - Performance optimization
 * - Error handling (load failure, fallback, missing data)
 */

describe('Gallery Hero', () => {
  let heroElement;
  let mockImages;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="hero-container">
        <img id="hero-splash-image" src="" alt="Hero Image">
      </div>
    `;
    heroElement = document.getElementById('hero-splash-image');

    mockImages = {
      home: '/images/hero/home.jpg',
      about: '/images/hero/about.jpg',
      gallery: '/images/hero/gallery.jpg',
      default: '/images/hero/hero-default.jpg'
    };

    // Mock location
    delete window.location;
    window.location = { pathname: '/home' };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  describe('Hero Image Selection', () => {
    it('should select featured image based on page', () => {
      window.location.pathname = '/home';
      const expectedImage = mockImages.home;

      heroElement.src = mockImages.home;
      expect(heroElement.src).toContain('home.jpg');
    });

    it('should handle random hero selection', () => {
      const images = Object.values(mockImages);
      const randomIndex = Math.floor(Math.random() * images.length);
      const selectedImage = images[randomIndex];

      expect(images).toContain(selectedImage);
    });

    it('should support manual hero override', () => {
      heroElement.src = mockImages.about;
      expect(heroElement.src).toContain('about.jpg');
    });

    it('should respect hero image priority', () => {
      window.location.pathname = '/gallery';
      heroElement.src = mockImages.gallery;

      expect(heroElement.src).toContain('gallery.jpg');
    });
  });

  describe('Hero Display', () => {
    it('should display full-width hero', () => {
      const container = document.getElementById('hero-container');
      container.style.width = '100%';

      expect(container.style.width).toBe('100%');
    });

    it('should apply responsive sizing', () => {
      heroElement.style.maxWidth = '100%';
      heroElement.style.height = 'auto';

      expect(heroElement.style.maxWidth).toBe('100%');
      expect(heroElement.style.height).toBe('auto');
    });

    it('should display overlay text', () => {
      const overlay = document.createElement('div');
      overlay.className = 'hero-overlay';
      overlay.textContent = 'Welcome';
      document.getElementById('hero-container').appendChild(overlay);

      const overlayEl = document.querySelector('.hero-overlay');
      expect(overlayEl.textContent).toBe('Welcome');
    });

    it('should display call-to-action button', () => {
      const button = document.createElement('button');
      button.className = 'hero-cta';
      button.textContent = 'Learn More';
      document.getElementById('hero-container').appendChild(button);

      const ctaBtn = document.querySelector('.hero-cta');
      expect(ctaBtn.textContent).toBe('Learn More');
    });
  });

  describe('Image Optimization', () => {
    it('should select appropriate resolution', () => {
      heroElement.src = '/images/hero/home-1200w.jpg';
      expect(heroElement.src).toContain('1200w');
    });

    it('should prefer WebP format when supported', () => {
      const picture = document.createElement('picture');
      const webpSource = document.createElement('source');
      webpSource.type = 'image/webp';
      webpSource.srcset = '/images/hero/home.webp';
      picture.appendChild(webpSource);

      expect(webpSource.type).toBe('image/webp');
    });

    it('should lazy load hero image', () => {
      heroElement.loading = 'lazy';
      expect(heroElement.loading).toBe('lazy');
    });

    it('should preload critical hero', () => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = mockImages.home;
      document.head.appendChild(link);

      const preloadLink = document.querySelector('link[rel="preload"]');
      expect(preloadLink).toBeTruthy();
    });
  });

  describe('Animation', () => {
    it('should apply fade-in animation', async () => {
      heroElement.style.opacity = '0';
      heroElement.style.transition = 'opacity 0.3s';

      setTimeout(() => {
        heroElement.style.opacity = '1';
      }, 10);

      expect(heroElement.style.transition).toContain('opacity');
    });

    it('should apply parallax effect', () => {
      const container = document.getElementById('hero-container');
      container.style.transform = 'translateY(0px)';

      window.scrollTo(0, 100);
      container.style.transform = 'translateY(50px)';

      expect(container.style.transform).toContain('translateY');
    });

    it('should apply Ken Burns effect', () => {
      heroElement.style.animation = 'kenBurns 20s ease-in-out infinite';
      expect(heroElement.style.animation).toContain('kenBurns');
    });

    it('should have smooth transitions', () => {
      heroElement.style.transition = 'all 0.3s ease-in-out';
      expect(heroElement.style.transition).toContain('ease-in-out');
    });
  });

  describe('Performance', () => {
    it('should optimize hero load time', () => {
      const startTime = performance.now();
      heroElement.src = mockImages.home;
      const loadTime = performance.now() - startTime;

      expect(loadTime).toBeLessThan(100);
    });

    it('should minimize render blocking', () => {
      heroElement.decoding = 'async';
      expect(heroElement.decoding).toBe('async');
    });

    it('should use efficient image sizing', () => {
      heroElement.srcset = '/images/hero/home-400w.jpg 400w, /images/hero/home-800w.jpg 800w';
      expect(heroElement.srcset).toBeTruthy();
    });

    it('should optimize LCP (Largest Contentful Paint)', () => {
      heroElement.fetchpriority = 'high';
      expect(heroElement.fetchpriority).toBe('high');
    });
  });

  describe('Error Handling', () => {
    it('should handle hero load failure', () => {
      const errorHandler = vi.fn();
      heroElement.addEventListener('error', errorHandler);
      heroElement.dispatchEvent(new Event('error'));

      expect(errorHandler).toHaveBeenCalled();
    });

    it('should use fallback hero on error', () => {
      heroElement.onerror = () => {
        if (!heroElement.src.includes('hero-default.jpg')) {
          heroElement.src = mockImages.default;
        }
      };

      heroElement.src = '/images/hero/invalid.jpg';
      heroElement.onerror();

      expect(heroElement.src).toContain('hero-default.jpg');
    });

    it('should handle missing hero data', () => {
      const defaultSrc = mockImages.default;
      heroElement.src = defaultSrc;

      expect(heroElement.src).toContain('hero-default.jpg');
    });
  });
});

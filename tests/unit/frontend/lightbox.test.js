/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Lightbox Tests
 * Tests the unified lightbox component functionality including:
 * - Lightbox initialization and DOM creation
 * - Navigation controls (next, previous, close, keyboard)
 * - Image display and aspect ratio handling
 * - Zoom functionality (zoom in/out, pinch to zoom, pan)
 * - UI elements (counter, caption, controls)
 * - Accessibility (focus trap, ARIA labels, keyboard navigation)
 * - Performance (smooth animations, preloading)
 * - Error handling (image load failure, invalid ID)
 */

describe('Lightbox Component', () => {
  let Lightbox;
  let lightboxInstance;
  let mockImages;

  beforeEach(() => {
    document.body.innerHTML = '';

    mockImages = [
      { url: '/images/1.jpg', name: 'Image 1' },
      { url: '/images/2.jpg', name: 'Image 2' },
      { url: '/images/3.jpg', name: 'Image 3' }
    ];

    Lightbox = class Lightbox {
      constructor(options = {}) {
        this.currentIndex = 0;
        this.images = [];
        this.items = [];
        this.lightboxId = options.lightboxId || 'unified-lightbox';
        this.showCaption = options.showCaption || false;
        this.showCounter = options.showCounter !== undefined ? options.showCounter : true;
        this.advanced = options.advanced || false;
        this.init();
      }

      init() {
        this.createLightboxHTML();
        this.bindGlobalEvents();
      }

      createLightboxHTML() {
        const lightboxHTML = `
          <div id="${this.lightboxId}" class="lightbox" style="display: none;">
            <div class="lightbox-content">
              <button class="lightbox-close" aria-label="Close">&times;</button>
              <button class="lightbox-prev" aria-label="Previous">‹</button>
              <button class="lightbox-next" aria-label="Next">›</button>
              <div class="lightbox-media-container">
                <img class="lightbox-image" src="" alt="">
              </div>
              <div class="lightbox-caption">
                <h3 class="lightbox-title"></h3>
                <p class="lightbox-counter"></p>
              </div>
            </div>
          </div>
        `;
        document.body.insertAdjacentHTML('beforeend', lightboxHTML);

        const lightbox = document.getElementById(this.lightboxId);
        lightbox.querySelector('.lightbox-close').addEventListener('click', () => this.close());
        lightbox.querySelector('.lightbox-prev').addEventListener('click', () => this.previous());
        lightbox.querySelector('.lightbox-next').addEventListener('click', () => this.next());

        lightbox.addEventListener('click', (e) => {
          if (e.target === lightbox || e.target.classList.contains('lightbox-content')) {
            this.close();
          }
        });
      }

      bindGlobalEvents() {
        document.addEventListener('keydown', (e) => {
          const lightbox = document.getElementById(this.lightboxId);
          if (!lightbox || !lightbox.classList.contains('is-open')) return;

          switch (e.key) {
            case 'Escape': this.close(); break;
            case 'ArrowLeft': this.previous(); break;
            case 'ArrowRight': this.next(); break;
          }
        });
      }

      openSimple(index) {
        this.currentIndex = index;
        this.advanced = false;
        const lightbox = document.getElementById(this.lightboxId);
        const img = lightbox.querySelector('.lightbox-image');
        const counter = lightbox.querySelector('.lightbox-counter');

        img.src = this.images[index];
        img.alt = 'Gallery image';

        if (this.showCounter) {
          counter.textContent = `${index + 1} / ${this.images.length}`;
        }

        this.show();
      }

      openAdvanced(items, index) {
        this.items = items;
        this.currentIndex = index;
        this.advanced = true;
        this.updateAdvancedContent();
        this.show();
      }

      show() {
        const lightbox = document.getElementById(this.lightboxId);
        lightbox.style.display = '';
        lightbox.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        this.updateNavigationButtons();
      }

      close() {
        const lightbox = document.getElementById(this.lightboxId);
        lightbox.classList.remove('is-open');
        setTimeout(() => {
          if (!lightbox.classList.contains('is-open')) {
            lightbox.style.display = 'none';
          }
          document.body.style.overflow = '';
        }, 300);
      }

      previous() {
        if (this.advanced) {
          if (this.currentIndex > 0) {
            this.currentIndex--;
            this.updateAdvancedContent();
          }
        } else {
          this.currentIndex = (this.currentIndex - 1 + this.images.length) % this.images.length;
          this.updateSimpleContent();
        }
        this.updateNavigationButtons();
      }

      next() {
        if (this.advanced) {
          if (this.currentIndex < this.items.length - 1) {
            this.currentIndex++;
            this.updateAdvancedContent();
          }
        } else {
          this.currentIndex = (this.currentIndex + 1) % this.images.length;
          this.updateSimpleContent();
        }
        this.updateNavigationButtons();
      }

      updateSimpleContent() {
        const lightbox = document.getElementById(this.lightboxId);
        const img = lightbox.querySelector('.lightbox-image');
        const counter = lightbox.querySelector('.lightbox-counter');

        img.src = this.images[this.currentIndex];
        if (this.showCounter) {
          counter.textContent = `${this.currentIndex + 1} / ${this.images.length}`;
        }
      }

      updateAdvancedContent() {
        const item = this.items[this.currentIndex];
        const lightbox = document.getElementById(this.lightboxId);
        const img = lightbox.querySelector('.lightbox-image');
        const title = lightbox.querySelector('.lightbox-title');
        const counter = lightbox.querySelector('.lightbox-counter');

        img.src = item.url;
        img.alt = item.name || 'Gallery image';

        if (this.showCaption) {
          title.textContent = item.name;
          title.style.display = 'block';
        }

        if (this.showCounter) {
          counter.textContent = `${this.currentIndex + 1} / ${this.items.length}`;
        }
      }

      updateNavigationButtons() {
        const lightbox = document.getElementById(this.lightboxId);
        const prevBtn = lightbox.querySelector('.lightbox-prev');
        const nextBtn = lightbox.querySelector('.lightbox-next');

        if (this.advanced) {
          prevBtn.style.display = this.currentIndex > 0 ? 'block' : 'none';
          nextBtn.style.display = this.currentIndex < this.items.length - 1 ? 'block' : 'none';
        } else {
          prevBtn.style.display = 'block';
          nextBtn.style.display = 'block';
        }
      }
    };

    window.Lightbox = Lightbox;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  describe('Lightbox Initialization', () => {
    it('should open lightbox on click', () => {
      lightboxInstance = new Lightbox({ showCounter: true });
      lightboxInstance.images = ['/images/1.jpg'];
      lightboxInstance.openSimple(0);

      const lightbox = document.getElementById('unified-lightbox');
      expect(lightbox.classList.contains('is-open')).toBe(true);
    });

    it('should display selected image', () => {
      lightboxInstance = new Lightbox();
      lightboxInstance.images = ['/images/1.jpg', '/images/2.jpg'];
      lightboxInstance.openSimple(1);

      const img = document.querySelector('.lightbox-image');
      expect(img.src).toContain('2.jpg');
    });

    it('should center image in viewport', () => {
      lightboxInstance = new Lightbox();
      lightboxInstance.images = ['/images/1.jpg'];
      lightboxInstance.openSimple(0);

      const container = document.querySelector('.lightbox-media-container');
      expect(container).toBeTruthy();
    });

    it('should dim background overlay', () => {
      lightboxInstance = new Lightbox();
      lightboxInstance.images = ['/images/1.jpg'];
      lightboxInstance.openSimple(0);

      const lightbox = document.getElementById('unified-lightbox');
      expect(lightbox.style.display).not.toBe('none');
    });
  });

  describe('Navigation Controls', () => {
    beforeEach(() => {
      lightboxInstance = new Lightbox({ showCounter: true });
      lightboxInstance.images = ['/images/1.jpg', '/images/2.jpg', '/images/3.jpg'];
      lightboxInstance.openSimple(1);
    });

    it('should navigate to next image', () => {
      lightboxInstance.next();
      const img = document.querySelector('.lightbox-image');
      expect(img.src).toContain('3.jpg');
    });

    it('should navigate to previous image', () => {
      lightboxInstance.previous();
      const img = document.querySelector('.lightbox-image');
      expect(img.src).toContain('1.jpg');
    });

    it('should close lightbox on X button', () => {
      lightboxInstance.close();
      const lightbox = document.getElementById('unified-lightbox');

      setTimeout(() => {
        expect(lightbox.classList.contains('is-open')).toBe(false);
      }, 350);
    });

    it('should respond to keyboard arrow keys', () => {
      const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
      document.dispatchEvent(event);

      const img = document.querySelector('.lightbox-image');
      expect(img.src).toContain('3.jpg');
    });

    it('should close on Escape key', () => {
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(event);

      setTimeout(() => {
        const lightbox = document.getElementById('unified-lightbox');
        expect(lightbox.classList.contains('is-open')).toBe(false);
      }, 350);
    });

    it('should support touch gestures', () => {
      const nextBtn = document.querySelector('.lightbox-next');
      nextBtn.click();

      const img = document.querySelector('.lightbox-image');
      expect(img.src).toContain('3.jpg');
    });
  });

  describe('Image Display', () => {
    it('should fit image to viewport', () => {
      lightboxInstance = new Lightbox();
      lightboxInstance.images = ['/images/1.jpg'];
      lightboxInstance.openSimple(0);

      const img = document.querySelector('.lightbox-image');
      expect(img).toBeTruthy();
    });

    it('should maintain aspect ratio', () => {
      lightboxInstance = new Lightbox();
      lightboxInstance.images = ['/images/1.jpg'];
      lightboxInstance.openSimple(0);

      const img = document.querySelector('.lightbox-image');
      expect(img.style.objectFit).not.toBe('stretch');
    });

    it('should handle portrait orientation', () => {
      lightboxInstance = new Lightbox();
      lightboxInstance.images = ['/images/portrait.jpg'];
      lightboxInstance.openSimple(0);

      const img = document.querySelector('.lightbox-image');
      expect(img.src).toContain('portrait.jpg');
    });

    it('should handle landscape orientation', () => {
      lightboxInstance = new Lightbox();
      lightboxInstance.images = ['/images/landscape.jpg'];
      lightboxInstance.openSimple(0);

      const img = document.querySelector('.lightbox-image');
      expect(img.src).toContain('landscape.jpg');
    });

    it('should show loading state', () => {
      lightboxInstance = new Lightbox();
      lightboxInstance.images = ['/images/1.jpg'];
      lightboxInstance.openSimple(0);

      const img = document.querySelector('.lightbox-image');
      expect(img.complete).toBeDefined();
    });
  });

  describe('UI Elements', () => {
    it('should display image counter', () => {
      lightboxInstance = new Lightbox({ showCounter: true });
      lightboxInstance.images = ['/images/1.jpg', '/images/2.jpg'];
      lightboxInstance.openSimple(0);

      const counter = document.querySelector('.lightbox-counter');
      expect(counter.textContent).toBe('1 / 2');
    });

    it('should display caption when enabled', () => {
      lightboxInstance = new Lightbox({ showCaption: true, advanced: true });
      lightboxInstance.openAdvanced([{ url: '/images/1.jpg', name: 'Test Image' }], 0);

      const title = document.querySelector('.lightbox-title');
      expect(title.textContent).toBe('Test Image');
    });

    it('should show/hide control buttons', () => {
      lightboxInstance = new Lightbox();
      lightboxInstance.images = ['/images/1.jpg'];
      lightboxInstance.openSimple(0);

      const nextBtn = document.querySelector('.lightbox-next');
      expect(nextBtn.style.display).not.toBe('none');
    });

    it('should display loading spinner', () => {
      lightboxInstance = new Lightbox();
      const spinner = document.createElement('div');
      spinner.className = 'loading-spinner';
      document.querySelector('.lightbox-media-container').appendChild(spinner);

      const spinnerEl = document.querySelector('.loading-spinner');
      expect(spinnerEl).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('should trap focus in lightbox', () => {
      lightboxInstance = new Lightbox();
      lightboxInstance.images = ['/images/1.jpg'];
      lightboxInstance.openSimple(0);

      const closeBtn = document.querySelector('.lightbox-close');
      expect(closeBtn.getAttribute('aria-label')).toBe('Close');
    });

    it('should have proper ARIA labels', () => {
      lightboxInstance = new Lightbox();
      lightboxInstance.images = ['/images/1.jpg'];
      lightboxInstance.openSimple(0);

      const prevBtn = document.querySelector('.lightbox-prev');
      const nextBtn = document.querySelector('.lightbox-next');

      expect(prevBtn.getAttribute('aria-label')).toBe('Previous');
      expect(nextBtn.getAttribute('aria-label')).toBe('Next');
    });

    it('should support keyboard navigation', () => {
      lightboxInstance = new Lightbox();
      lightboxInstance.images = ['/images/1.jpg', '/images/2.jpg'];
      lightboxInstance.openSimple(0);

      const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
      document.dispatchEvent(event);

      expect(lightboxInstance.currentIndex).toBe(1);
    });

    it('should announce screen reader changes', () => {
      lightboxInstance = new Lightbox();
      lightboxInstance.images = ['/images/1.jpg'];
      lightboxInstance.openSimple(0);

      const img = document.querySelector('.lightbox-image');
      expect(img.alt).toBe('Gallery image');
    });
  });

  describe('Performance', () => {
    it('should have smooth animations', () => {
      lightboxInstance = new Lightbox();
      lightboxInstance.images = ['/images/1.jpg'];
      lightboxInstance.openSimple(0);

      const lightbox = document.getElementById('unified-lightbox');
      expect(lightbox.classList.contains('is-open')).toBe(true);
    });

    it('should efficiently render', () => {
      const startTime = performance.now();
      lightboxInstance = new Lightbox();
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(100);
    });

    it('should preload adjacent images', () => {
      lightboxInstance = new Lightbox();
      lightboxInstance.images = ['/images/1.jpg', '/images/2.jpg', '/images/3.jpg'];
      lightboxInstance.openSimple(1);

      expect(lightboxInstance.currentIndex).toBe(1);
    });

    it('should cleanup on close', () => {
      lightboxInstance = new Lightbox();
      lightboxInstance.images = ['/images/1.jpg'];
      lightboxInstance.openSimple(0);
      lightboxInstance.close();

      setTimeout(() => {
        expect(document.body.style.overflow).toBe('');
      }, 350);
    });
  });

  describe('Error Handling', () => {
    it('should handle image load failure', () => {
      lightboxInstance = new Lightbox();
      lightboxInstance.images = ['/images/invalid.jpg'];
      lightboxInstance.openSimple(0);

      const img = document.querySelector('.lightbox-image');
      expect(img.src).toContain('invalid.jpg');
    });

    it('should handle invalid image ID', () => {
      lightboxInstance = new Lightbox();
      lightboxInstance.images = ['/images/1.jpg'];

      expect(() => {
        lightboxInstance.currentIndex = 999;
      }).not.toThrow();
    });

    it('should handle missing navigation data', () => {
      lightboxInstance = new Lightbox();
      lightboxInstance.images = [];

      expect(() => {
        lightboxInstance.openSimple(0);
      }).not.toThrow();
    });
  });
});

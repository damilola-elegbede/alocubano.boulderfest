/**
 * Unified Lazy Loading Component
 * Consolidated from main.js and gallery-detail.js implementations
 * Supports both simple image lazy loading and advanced item loading with placeholders
 */

if (typeof LazyLoader === 'undefined') {
  class LazyLoader {
    constructor(options = {}) {
      this.config = {
        rootMargin: options.rootMargin || '50px 0px',
        threshold: options.threshold || 0.1,
        selector: options.selector || 'img[data-src]',
        advancedSelector: options.advancedSelector || '.lazy-item[data-loaded="false"]',
        loadedClass: options.loadedClass || 'loaded',
        advanced: options.advanced || false
      };
      
      this.observer = null;
      this.init();
    }

    init() {
      // Check for IntersectionObserver support
      if (!('IntersectionObserver' in window)) {
        console.warn('IntersectionObserver not supported, falling back to immediate loading');
        this.fallbackLoad();
        return;
      }

      this.createObserver();
      this.observeElements();
    }

    createObserver() {
      this.observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            if (this.config.advanced) {
              this.loadAdvancedItem(entry.target);
            } else {
              this.loadSimpleImage(entry.target);
            }
            this.observer.unobserve(entry.target);
          }
        });
      }, {
        rootMargin: this.config.rootMargin,
        threshold: this.config.threshold
      });
    }

    observeElements() {
      const selector = this.config.advanced ? this.config.advancedSelector : this.config.selector;
      const elements = document.querySelectorAll(selector);
      
      elements.forEach(element => {
        this.observer.observe(element);
      });
    }

    // Simple image loading (from main.js)
    loadSimpleImage(img) {
      if (img.dataset.src) {
        img.src = img.dataset.src;
        img.classList.add(this.config.loadedClass);
        
        // Optional: Add fade-in effect
        img.style.opacity = '0';
        img.onload = () => {
          img.style.transition = 'opacity 0.3s ease-in-out';
          img.style.opacity = '1';
        };
        
        // Clean up data attribute
        delete img.dataset.src;
      }
    }

    // Advanced item loading (from gallery-detail.js)
    loadAdvancedItem(item) {
      const lazyImage = item.querySelector('.lazy-image');
      const placeholder = item.querySelector('.lazy-placeholder');
      const spinner = item.querySelector('.loading-spinner');

      if (lazyImage) {
        const src = lazyImage.getAttribute('data-src');
        if (src) {
          // Show loading state
          if (spinner) {
            spinner.style.display = 'block';
          }

          lazyImage.onload = () => {
            // Hide placeholder and spinner
            if (placeholder) placeholder.style.display = 'none';
            if (spinner) spinner.style.display = 'none';
            
            // Show image with transition
            lazyImage.style.display = 'block';
            lazyImage.style.opacity = '1';
            
            // Mark as loaded
            item.classList.add(this.config.loadedClass);
            item.setAttribute('data-loaded', 'true');
          };

          lazyImage.onerror = () => {
            // Handle error state
            if (spinner) {
              spinner.textContent = '❌';
              spinner.style.display = 'block';
            }
            if (placeholder) {
              placeholder.style.display = 'block'; // Keep placeholder visible on error
            }
            
            console.warn('Failed to load image:', src);
          };

          // Start loading
          lazyImage.src = src;
          lazyImage.removeAttribute('data-src');
        }
      }
    }

    // Fallback for browsers without IntersectionObserver
    fallbackLoad() {
      if (this.config.advanced) {
        const items = document.querySelectorAll(this.config.advancedSelector);
        items.forEach(item => this.loadAdvancedItem(item));
      } else {
        const images = document.querySelectorAll(this.config.selector);
        images.forEach(img => this.loadSimpleImage(img));
      }
    }

    // Method to observe new elements (useful for dynamic content)
    observeNewElements(elements) {
      if (!this.observer) return;
      
      if (elements) {
        // Observe specific elements
        elements.forEach(element => {
          this.observer.observe(element);
        });
      } else {
        // Re-scan and observe all matching elements
        this.observeElements();
      }
    }

    // Method to load all remaining elements immediately
    loadAll() {
      const selector = this.config.advanced ? this.config.advancedSelector : this.config.selector;
      const elements = document.querySelectorAll(selector);
      
      elements.forEach(element => {
        if (this.config.advanced) {
          this.loadAdvancedItem(element);
        } else {
          this.loadSimpleImage(element);
        }
        
        if (this.observer) {
          this.observer.unobserve(element);
        }
      });
    }

    // Cleanup method
    destroy() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
    }

    // Static factory methods for common use cases
    static createSimple(options = {}) {
      return new LazyLoader({
        ...options,
        advanced: false,
        selector: options.selector || 'img[data-src]'
      });
    }

    static createAdvanced(options = {}) {
      return new LazyLoader({
        ...options,
        advanced: true,
        advancedSelector: options.selector || '.lazy-item[data-loaded="false"]',
        rootMargin: options.rootMargin || '100px 0px'
      });
    }

    // Method to update configuration and reinitialize
    updateConfig(newConfig) {
      this.destroy();
      this.config = { ...this.config, ...newConfig };
      this.init();
    }
  }

  // Export for use in other modules
  window.LazyLoader = LazyLoader;
}
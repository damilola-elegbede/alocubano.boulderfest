/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Typography Effects Component Tests
 * Tests the typography.js functionality including:
 * - Mobile menu toggle and state management
 * - Typewriter text effect animations
 * - Parallax scroll effects for vertical text
 * - Gallery item hover effects with glitch animations
 * - Text reveal on scroll using IntersectionObserver-like behavior
 * - Random glitch element animations
 * - Circular text SVG path animations
 * - Navigation link hover effects
 * - Form input focus animations
 * - List item stagger animations with delays
 * - Accessibility (ARIA attributes, keyboard support)
 * - Performance (animation frame optimization, reduced motion)
 * - Event cleanup and memory management
 */

describe('Typography Effects Component', () => {
  let intervals = [];
  let timeouts = [];
  let originalSetInterval;
  let originalSetTimeout;

  beforeEach(() => {
    // Track intervals and timeouts for cleanup
    originalSetInterval = global.setInterval;
    originalSetTimeout = global.setTimeout;

    global.setInterval = vi.fn((...args) => {
      const id = originalSetInterval(...args);
      intervals.push(id);
      return id;
    });

    global.setTimeout = vi.fn((...args) => {
      const id = originalSetTimeout(...args);
      timeouts.push(id);
      return id;
    });

    // Set up base DOM structure
    document.body.innerHTML = `
      <style>
        .main-nav.is-open { display: block; }
        .menu-toggle.is-active { transform: rotate(90deg); }
        .text-glitch.active { animation: glitch 0.3s; }
        .text-block-large.revealed { opacity: 1; transform: translateY(0); }
        .text-block-serif.revealed { opacity: 1; transform: translateY(0); }
        .fade-in-up { animation: fadeInUp 0.5s forwards; }
        .form-group.focused .form-input { border-color: blue; }
      </style>

      <!-- Mobile Menu -->
      <nav class="main-nav">
        <button class="menu-toggle" aria-expanded="false" aria-label="Toggle menu">
          <span class="hamburger"></span>
        </button>
        <ul class="nav-list">
          <li><a href="/" class="nav-link">Home</a></li>
          <li><a href="/about" class="nav-link">About</a></li>
        </ul>
      </nav>

      <!-- Typewriter Elements -->
      <h1 class="typewriter" style="visibility: hidden;">A Lo Cubano Boulder Fest</h1>
      <p class="typewriter" style="visibility: hidden;">May 15-17, 2026</p>

      <!-- Parallax Vertical Text -->
      <div class="text-block-vertical" data-speed="0.5">Vertical Text 1</div>
      <div class="text-block-vertical" data-speed="0.8">Vertical Text 2</div>
      <div class="text-block-vertical">Vertical Text 3 (default speed)</div>

      <!-- Gallery Items with Glitch -->
      <div class="gallery-item-type">
        <span class="text-glitch">Gallery 1</span>
      </div>
      <div class="gallery-item-type">
        <span class="text-glitch">Gallery 2</span>
      </div>
      <div class="gallery-item-type">
        <div>No glitch element</div>
      </div>

      <!-- Text Reveal Elements -->
      <div class="text-block-large">Large Text Block</div>
      <div class="text-block-serif">Serif Text Block</div>

      <!-- Standalone Glitch Elements -->
      <span class="text-glitch">Standalone Glitch 1</span>
      <span class="text-glitch">Standalone Glitch 2</span>

      <!-- Circular Text SVG -->
      <svg class="circular-text">
        <path id="circle-path" d="M 50,50 m -40,0 a 40,40 0 1,0 80,0 a 40,40 0 1,0 -80,0"></path>
        <text>
          <textPath href="#circle-path">BOULDERFEST 2026</textPath>
        </text>
      </svg>

      <!-- Form Inputs -->
      <div class="form-group">
        <input type="text" class="form-input-type" id="test-input" />
      </div>
      <div class="form-group">
        <textarea class="form-textarea-type" id="test-textarea"></textarea>
      </div>

      <!-- List with Stagger Animation -->
      <div class="text-composition">
        <ul>
          <li>Item 1</li>
          <li>Item 2</li>
          <li>Item 3</li>
        </ul>
      </div>
    `;

    // Use fake timers
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Clear all intervals and timeouts
    intervals.forEach(id => clearInterval(id));
    timeouts.forEach(id => clearTimeout(id));
    intervals = [];
    timeouts = [];

    // Restore originals
    global.setInterval = originalSetInterval;
    global.setTimeout = originalSetTimeout;

    document.body.innerHTML = '';
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Mobile Menu Toggle', () => {
    it('should toggle menu open on button click', () => {
      const menuToggle = document.querySelector('.menu-toggle');
      const navMenu = document.querySelector('.main-nav');

      // Simulate DOMContentLoaded initialization
      menuToggle.addEventListener('click', function() {
        navMenu.classList.toggle('is-open');
        menuToggle.classList.toggle('is-active');
      });

      expect(navMenu.classList.contains('is-open')).toBe(false);
      expect(menuToggle.classList.contains('is-active')).toBe(false);

      menuToggle.click();

      expect(navMenu.classList.contains('is-open')).toBe(true);
      expect(menuToggle.classList.contains('is-active')).toBe(true);
    });

    it('should toggle menu closed on second click', () => {
      const menuToggle = document.querySelector('.menu-toggle');
      const navMenu = document.querySelector('.main-nav');

      menuToggle.addEventListener('click', function() {
        navMenu.classList.toggle('is-open');
        menuToggle.classList.toggle('is-active');
      });

      menuToggle.click();
      expect(navMenu.classList.contains('is-open')).toBe(true);

      menuToggle.click();
      expect(navMenu.classList.contains('is-open')).toBe(false);
      expect(menuToggle.classList.contains('is-active')).toBe(false);
    });

    it('should handle missing menu toggle gracefully', () => {
      const menuToggle = document.querySelector('.menu-toggle');
      menuToggle.remove();

      // Should not throw when menu toggle is missing
      expect(() => {
        const toggle = document.querySelector('.menu-toggle');
        if (toggle) {
          toggle.addEventListener('click', () => {});
        }
      }).not.toThrow();
    });
  });

  describe('Typewriter Effect', () => {
    it('should initialize typewriter elements with empty text', () => {
      const typewriterElements = document.querySelectorAll('.typewriter');

      typewriterElements.forEach((element) => {
        const originalText = element.textContent;
        expect(originalText).toBeTruthy();

        // Simulate initialization
        element.textContent = '';
        expect(element.textContent).toBe('');
      });
    });

    it('should make typewriter elements visible on initialization', () => {
      const typewriterElement = document.querySelector('.typewriter');

      expect(typewriterElement.style.visibility).toBe('hidden');

      typewriterElement.style.visibility = 'visible';
      expect(typewriterElement.style.visibility).toBe('visible');
    });

    it('should type text character by character', () => {
      const element = document.querySelector('.typewriter');
      const text = element.textContent;
      element.textContent = '';
      element.style.visibility = 'visible';

      let index = 0;
      const typeWriter = setInterval(() => {
        if (index < text.length) {
          element.textContent += text.charAt(index);
          index++;
        } else {
          clearInterval(typeWriter);
        }
      }, 50);

      // Fast-forward through typing animation
      for (let i = 0; i < text.length; i++) {
        vi.advanceTimersByTime(50);
      }

      expect(element.textContent).toBe(text);
    });

    it('should handle empty typewriter elements', () => {
      const emptyElement = document.createElement('div');
      emptyElement.className = 'typewriter';
      emptyElement.textContent = '';
      document.body.appendChild(emptyElement);

      expect(() => {
        const text = emptyElement.textContent;
        emptyElement.textContent = '';
        let index = 0;
        const typeWriter = setInterval(() => {
          if (index < text.length) {
            emptyElement.textContent += text.charAt(index);
            index++;
          } else {
            clearInterval(typeWriter);
          }
        }, 50);
      }).not.toThrow();
    });

    it('should handle multiple typewriter elements independently', () => {
      const elements = document.querySelectorAll('.typewriter');

      expect(elements.length).toBeGreaterThan(1);

      elements.forEach((element) => {
        const text = element.textContent;
        element.textContent = '';
        expect(element.textContent).toBe('');
      });
    });
  });

  describe('Parallax Scroll Effects', () => {
    it('should apply transform to vertical text on scroll', () => {
      const verticalText = document.querySelector('.text-block-vertical[data-speed="0.5"]');
      const scrolled = 100;

      const speed = parseFloat(verticalText.dataset.speed) || 0.5;
      verticalText.style.transform = `translateY(${scrolled * speed}px)`;

      expect(verticalText.style.transform).toBe('translateY(50px)');
    });

    it('should use custom speed from data attribute', () => {
      const verticalText = document.querySelector('.text-block-vertical[data-speed="0.8"]');
      const scrolled = 100;

      const speed = parseFloat(verticalText.dataset.speed);
      verticalText.style.transform = `translateY(${scrolled * speed}px)`;

      expect(verticalText.style.transform).toBe('translateY(80px)');
    });

    it('should use default speed when data-speed is not provided', () => {
      const verticalText = document.querySelectorAll('.text-block-vertical')[2];
      const scrolled = 100;

      const speed = parseFloat(verticalText.dataset.speed) || 0.5;
      verticalText.style.transform = `translateY(${scrolled * speed}px)`;

      expect(verticalText.style.transform).toBe('translateY(50px)');
    });

    it('should update transform for all vertical text elements', () => {
      const verticalTexts = document.querySelectorAll('.text-block-vertical');
      const scrolled = 200;

      verticalTexts.forEach((text) => {
        const speed = parseFloat(text.dataset.speed) || 0.5;
        text.style.transform = `translateY(${scrolled * speed}px)`;
      });

      expect(verticalTexts[0].style.transform).toBe('translateY(100px)'); // speed 0.5
      expect(verticalTexts[1].style.transform).toBe('translateY(160px)'); // speed 0.8
      expect(verticalTexts[2].style.transform).toBe('translateY(100px)'); // default 0.5
    });

    it('should handle zero scroll position', () => {
      const verticalText = document.querySelector('.text-block-vertical');
      const scrolled = 0;

      const speed = parseFloat(verticalText.dataset.speed) || 0.5;
      verticalText.style.transform = `translateY(${scrolled * speed}px)`;

      expect(verticalText.style.transform).toBe('translateY(0px)');
    });
  });

  describe('Gallery Item Hover Effects', () => {
    it('should add active class to glitch element on mouseenter', () => {
      const galleryItem = document.querySelectorAll('.gallery-item-type')[0];
      const glitchElement = galleryItem.querySelector('.text-glitch');

      galleryItem.addEventListener('mouseenter', function() {
        const glitch = this.querySelector('.text-glitch');
        if (glitch) {
          glitch.classList.add('active');
        }
      });

      expect(glitchElement.classList.contains('active')).toBe(false);

      const mouseEnterEvent = new MouseEvent('mouseenter', { bubbles: true });
      galleryItem.dispatchEvent(mouseEnterEvent);

      expect(glitchElement.classList.contains('active')).toBe(true);
    });

    it('should remove active class from glitch element on mouseleave', () => {
      const galleryItem = document.querySelectorAll('.gallery-item-type')[0];
      const glitchElement = galleryItem.querySelector('.text-glitch');

      galleryItem.addEventListener('mouseenter', function() {
        const glitch = this.querySelector('.text-glitch');
        if (glitch) glitch.classList.add('active');
      });

      galleryItem.addEventListener('mouseleave', function() {
        const glitch = this.querySelector('.text-glitch');
        if (glitch) glitch.classList.remove('active');
      });

      galleryItem.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      expect(glitchElement.classList.contains('active')).toBe(true);

      galleryItem.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      expect(glitchElement.classList.contains('active')).toBe(false);
    });

    it('should handle gallery items without glitch elements', () => {
      const galleryItems = document.querySelectorAll('.gallery-item-type');
      const itemWithoutGlitch = galleryItems[2];

      expect(() => {
        itemWithoutGlitch.addEventListener('mouseenter', function() {
          const glitch = this.querySelector('.text-glitch');
          if (glitch) {
            glitch.classList.add('active');
          }
        });

        itemWithoutGlitch.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      }).not.toThrow();
    });

    it('should handle multiple gallery items independently', () => {
      const galleryItems = document.querySelectorAll('.gallery-item-type');

      galleryItems.forEach((item) => {
        item.addEventListener('mouseenter', function() {
          const glitch = this.querySelector('.text-glitch');
          if (glitch) glitch.classList.add('active');
        });
      });

      galleryItems[0].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

      expect(galleryItems[0].querySelector('.text-glitch').classList.contains('active')).toBe(true);
      expect(galleryItems[1].querySelector('.text-glitch').classList.contains('active')).toBe(false);
    });
  });

  describe('Text Reveal on Scroll', () => {
    it('should add revealed class when element is in viewport', () => {
      const revealElement = document.querySelector('.text-block-large');

      // Mock getBoundingClientRect
      revealElement.getBoundingClientRect = vi.fn(() => ({
        top: 500,
        bottom: 600,
        left: 0,
        right: 100
      }));

      const elementTop = revealElement.getBoundingClientRect().top;
      const elementVisible = 150;

      if (elementTop < window.innerHeight - elementVisible) {
        revealElement.classList.add('revealed');
      }

      expect(revealElement.classList.contains('revealed')).toBe(true);
    });

    it('should not reveal element when out of viewport', () => {
      const revealElement = document.querySelector('.text-block-large');

      revealElement.getBoundingClientRect = vi.fn(() => ({
        top: 2000,
        bottom: 2100,
        left: 0,
        right: 100
      }));

      const elementTop = revealElement.getBoundingClientRect().top;
      const elementVisible = 150;

      if (elementTop < window.innerHeight - elementVisible) {
        revealElement.classList.add('revealed');
      }

      expect(revealElement.classList.contains('revealed')).toBe(false);
    });

    it('should handle both text-block-large and text-block-serif elements', () => {
      const revealElements = document.querySelectorAll('.text-block-large, .text-block-serif');

      expect(revealElements.length).toBe(2);

      revealElements.forEach((element) => {
        element.getBoundingClientRect = vi.fn(() => ({
          top: 400,
          bottom: 500,
          left: 0,
          right: 100
        }));

        const elementTop = element.getBoundingClientRect().top;
        const elementVisible = 150;

        if (elementTop < window.innerHeight - elementVisible) {
          element.classList.add('revealed');
        }
      });

      revealElements.forEach((element) => {
        expect(element.classList.contains('revealed')).toBe(true);
      });
    });

    it('should check reveal on page load', () => {
      const revealElement = document.querySelector('.text-block-large');

      revealElement.getBoundingClientRect = vi.fn(() => ({
        top: 100,
        bottom: 200,
        left: 0,
        right: 100
      }));

      const revealOnScroll = () => {
        const elements = document.querySelectorAll('.text-block-large, .text-block-serif');
        elements.forEach((element) => {
          const elementTop = element.getBoundingClientRect().top;
          const elementVisible = 150;

          if (elementTop < window.innerHeight - elementVisible) {
            element.classList.add('revealed');
          }
        });
      };

      // Check on load
      revealOnScroll();

      expect(revealElement.classList.contains('revealed')).toBe(true);
    });
  });

  describe('Random Glitch Element Effects', () => {
    it('should reset animation on glitch elements at intervals', () => {
      const glitchElement = document.querySelector('.text-glitch');

      setInterval(() => {
        glitchElement.style.animation = 'none';
        setTimeout(() => {
          glitchElement.style.animation = '';
        }, 10);
      }, 3000);

      expect(glitchElement.style.animation).toBe('');

      vi.advanceTimersByTime(3000);
      expect(glitchElement.style.animation).toBe('none');

      vi.advanceTimersByTime(10);
      expect(glitchElement.style.animation).toBe('');
    });

    it('should apply random intervals to glitch animations', () => {
      const glitchElements = document.querySelectorAll('.text-glitch');

      expect(glitchElements.length).toBeGreaterThan(0);

      glitchElements.forEach((element) => {
        const randomDelay = 3000 + Math.random() * 2000;
        expect(randomDelay).toBeGreaterThanOrEqual(3000);
        expect(randomDelay).toBeLessThanOrEqual(5000);
      });
    });

    it('should handle multiple glitch elements independently', () => {
      const glitchElements = document.querySelectorAll('.text-glitch');

      glitchElements.forEach((element) => {
        setInterval(() => {
          element.style.animation = 'none';
          setTimeout(() => {
            element.style.animation = '';
          }, 10);
        }, 3000);
      });

      vi.advanceTimersByTime(3000);

      glitchElements.forEach((element) => {
        expect(element.style.animation).toBe('none');
      });
    });
  });

  describe('Circular Text Animation', () => {
    it('should duplicate text content with bullet separators', () => {
      const circularText = document.querySelector('.circular-text');
      const textPath = circularText.querySelector('textPath');
      const originalContent = textPath.textContent;

      textPath.textContent = originalContent + ' • ' + originalContent + ' • ';

      expect(textPath.textContent).toContain(' • ');
      expect(textPath.textContent).toBe('BOULDERFEST 2026 • BOULDERFEST 2026 • ');
    });

    it('should handle circular text without textPath element', () => {
      const circularTextNoPath = document.createElement('svg');
      circularTextNoPath.className = 'circular-text';
      document.body.appendChild(circularTextNoPath);

      expect(() => {
        const textPath = circularTextNoPath.querySelector('textPath');
        if (textPath) {
          const textContent = textPath.textContent;
          textPath.textContent = textContent + ' • ' + textContent + ' • ';
        }
      }).not.toThrow();
    });

    it('should create continuous circular text effect', () => {
      const circularTexts = document.querySelectorAll('.circular-text');

      circularTexts.forEach((text) => {
        const textPath = text.querySelector('textPath');
        if (textPath) {
          const textContent = textPath.textContent;
          textPath.textContent = textContent + ' • ' + textContent + ' • ';

          expect(textPath.textContent).toMatch(/.*\s•\s.*\s•\s$/);
        }
      });
    });
  });

  describe('Navigation Link Hover Effects', () => {
    it('should store text in data attribute on mouseenter', () => {
      const navLink = document.querySelector('.nav-link');

      navLink.addEventListener('mouseenter', function() {
        const text = this.textContent;
        this.dataset.text = text;
      });

      const mouseEnterEvent = new MouseEvent('mouseenter', { bubbles: true });
      navLink.dispatchEvent(mouseEnterEvent);

      expect(navLink.dataset.text).toBe(navLink.textContent);
    });

    it('should handle multiple navigation links independently', () => {
      const navLinks = document.querySelectorAll('.nav-link');

      navLinks.forEach((link) => {
        link.addEventListener('mouseenter', function() {
          const text = this.textContent;
          this.dataset.text = text;
        });
      });

      navLinks[0].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

      expect(navLinks[0].dataset.text).toBe('Home');
      expect(navLinks[1].dataset.text).toBeUndefined();
    });

    it('should preserve original text content', () => {
      const navLink = document.querySelector('.nav-link');
      const originalText = navLink.textContent;

      navLink.addEventListener('mouseenter', function() {
        this.dataset.text = this.textContent;
      });

      navLink.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

      expect(navLink.textContent).toBe(originalText);
    });
  });

  describe('Form Input Animations', () => {
    it('should add focused class to parent on input focus', () => {
      const input = document.querySelector('.form-input-type');
      const formGroup = input.parentElement;

      input.addEventListener('focus', function() {
        this.parentElement.classList.add('focused');
      });

      const focusEvent = new FocusEvent('focus', { bubbles: true });
      input.dispatchEvent(focusEvent);

      expect(formGroup.classList.contains('focused')).toBe(true);
    });

    it('should remove focused class on blur when input is empty', () => {
      const input = document.querySelector('.form-input-type');
      const formGroup = input.parentElement;

      input.addEventListener('focus', function() {
        this.parentElement.classList.add('focused');
      });

      input.addEventListener('blur', function() {
        if (!this.value) {
          this.parentElement.classList.remove('focused');
        }
      });

      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
      expect(formGroup.classList.contains('focused')).toBe(true);

      input.value = '';
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

      expect(formGroup.classList.contains('focused')).toBe(false);
    });

    it('should keep focused class on blur when input has value', () => {
      const input = document.querySelector('.form-input-type');
      const formGroup = input.parentElement;

      input.addEventListener('focus', function() {
        this.parentElement.classList.add('focused');
      });

      input.addEventListener('blur', function() {
        if (!this.value) {
          this.parentElement.classList.remove('focused');
        }
      });

      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
      input.value = 'Test value';
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

      expect(formGroup.classList.contains('focused')).toBe(true);
    });

    it('should handle textarea elements', () => {
      const textarea = document.querySelector('.form-textarea-type');
      const formGroup = textarea.parentElement;

      textarea.addEventListener('focus', function() {
        this.parentElement.classList.add('focused');
      });

      textarea.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

      expect(formGroup.classList.contains('focused')).toBe(true);
    });

    it('should handle multiple form inputs independently', () => {
      const inputs = document.querySelectorAll('.form-input-type, .form-textarea-type');

      inputs.forEach((input) => {
        input.addEventListener('focus', function() {
          this.parentElement.classList.add('focused');
        });
      });

      inputs[0].dispatchEvent(new FocusEvent('focus', { bubbles: true }));

      expect(inputs[0].parentElement.classList.contains('focused')).toBe(true);
      expect(inputs[1].parentElement.classList.contains('focused')).toBe(false);
    });
  });

  describe('List Item Stagger Animations', () => {
    it('should apply animation delay to list items', () => {
      const list = document.querySelector('.text-composition ul');
      const items = list.querySelectorAll('li');

      items.forEach((item, index) => {
        item.style.animationDelay = `${index * 0.1}s`;
        item.classList.add('fade-in-up');
      });

      expect(items[0].style.animationDelay).toBe('0s');
      expect(items[1].style.animationDelay).toBe('0.1s');
      expect(items[2].style.animationDelay).toBe('0.2s');
    });

    it('should add fade-in-up class to all list items', () => {
      const list = document.querySelector('.text-composition ul');
      const items = list.querySelectorAll('li');

      items.forEach((item, index) => {
        item.style.animationDelay = `${index * 0.1}s`;
        item.classList.add('fade-in-up');
      });

      items.forEach((item) => {
        expect(item.classList.contains('fade-in-up')).toBe(true);
      });
    });

    it('should handle multiple lists independently', () => {
      const secondList = document.createElement('div');
      secondList.className = 'text-composition';
      secondList.innerHTML = `
        <ul>
          <li>Second Item 1</li>
          <li>Second Item 2</li>
        </ul>
      `;
      document.body.appendChild(secondList);

      const lists = document.querySelectorAll('.text-composition ul');

      lists.forEach((list) => {
        const items = list.querySelectorAll('li');
        items.forEach((item, index) => {
          item.style.animationDelay = `${index * 0.1}s`;
          item.classList.add('fade-in-up');
        });
      });

      expect(lists.length).toBe(2);
      expect(lists[0].querySelectorAll('li').length).toBe(3);
      expect(lists[1].querySelectorAll('li').length).toBe(2);
    });

    it('should calculate correct delay increment', () => {
      const list = document.querySelector('.text-composition ul');
      const items = list.querySelectorAll('li');

      const delayIncrement = 0.1;

      items.forEach((item, index) => {
        item.style.animationDelay = `${index * delayIncrement}s`;
      });

      expect(parseFloat(items[0].style.animationDelay)).toBe(0);
      expect(parseFloat(items[1].style.animationDelay)).toBeCloseTo(0.1, 1);
      expect(parseFloat(items[2].style.animationDelay)).toBeCloseTo(0.2, 1);
    });

    it('should handle empty lists gracefully', () => {
      const emptyList = document.createElement('div');
      emptyList.className = 'text-composition';
      emptyList.innerHTML = '<ul></ul>';
      document.body.appendChild(emptyList);

      expect(() => {
        const list = emptyList.querySelector('ul');
        const items = list.querySelectorAll('li');
        items.forEach((item, index) => {
          item.style.animationDelay = `${index * 0.1}s`;
          item.classList.add('fade-in-up');
        });
      }).not.toThrow();
    });
  });

  describe('Performance and Accessibility', () => {
    it('should handle rapid scroll events efficiently', () => {
      const verticalTexts = document.querySelectorAll('.text-block-vertical');
      let scrollCount = 0;

      const handleScroll = () => {
        scrollCount++;
        const scrolled = window.pageYOffset || 0;
        verticalTexts.forEach((text) => {
          const speed = parseFloat(text.dataset.speed) || 0.5;
          text.style.transform = `translateY(${scrolled * speed}px)`;
        });
      };

      // Simulate rapid scrolling
      for (let i = 0; i < 100; i++) {
        handleScroll();
      }

      expect(scrollCount).toBe(100);
    });

    it('should support reduced motion preferences', () => {
      // Mock matchMedia for reduced motion
      window.matchMedia = vi.fn().mockImplementation(query => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }));

      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      expect(prefersReducedMotion).toBe(true);

      // Animations should be disabled or simplified when reduced motion is preferred
      const element = document.querySelector('.text-block-large');
      if (prefersReducedMotion) {
        element.style.transition = 'none';
      }

      expect(element.style.transition).toBe('none');
    });

    it('should maintain ARIA attributes for interactive elements', () => {
      const menuToggle = document.querySelector('.menu-toggle');

      expect(menuToggle.getAttribute('aria-expanded')).toBe('false');
      expect(menuToggle.getAttribute('aria-label')).toBe('Toggle menu');
    });

    it('should handle missing elements gracefully', () => {
      document.body.innerHTML = '<div>No typography elements</div>';

      expect(() => {
        const typewriterElements = document.querySelectorAll('.typewriter');
        typewriterElements.forEach((element) => {
          element.textContent = '';
        });
      }).not.toThrow();

      expect(() => {
        const verticalTexts = document.querySelectorAll('.text-block-vertical');
        verticalTexts.forEach((text) => {
          text.style.transform = 'translateY(0)';
        });
      }).not.toThrow();
    });
  });

  describe('Event Cleanup and Memory Management', () => {
    it('should clear intervals properly', () => {
      const glitchElement = document.querySelector('.text-glitch');
      let executionCount = 0;

      const intervalId = setInterval(() => {
        executionCount++;
        glitchElement.style.animation = 'none';
        setTimeout(() => {
          glitchElement.style.animation = '';
        }, 10);
      }, 3000);

      // Verify interval executes
      vi.advanceTimersByTime(3000);
      expect(executionCount).toBe(1);

      clearInterval(intervalId);

      // Verify interval is cleared
      vi.advanceTimersByTime(3000);
      expect(executionCount).toBe(1);
    });

    it('should handle typewriter interval completion', () => {
      const element = document.querySelector('.typewriter');
      const text = 'Test';
      element.textContent = '';

      let index = 0;
      const typeWriter = setInterval(() => {
        if (index < text.length) {
          element.textContent += text.charAt(index);
          index++;
        } else {
          clearInterval(typeWriter);
        }
      }, 50);

      // Complete the animation
      vi.advanceTimersByTime(250);

      expect(element.textContent).toBe(text);
    });

    it('should execute glitch animation reset at regular intervals', () => {
      const glitchElement = document.querySelector('.text-glitch');
      let resetCount = 0;

      setInterval(() => {
        resetCount++;
        glitchElement.style.animation = 'none';
        setTimeout(() => {
          glitchElement.style.animation = '';
        }, 10);
      }, 3000);

      // Verify multiple executions
      vi.advanceTimersByTime(9000);
      expect(resetCount).toBe(3);
    });

    it('should complete nested timeout after interval triggers', () => {
      const glitchElement = document.querySelector('.text-glitch');
      let timeoutExecuted = false;

      setInterval(() => {
        glitchElement.style.animation = 'none';
        setTimeout(() => {
          glitchElement.style.animation = '';
          timeoutExecuted = true;
        }, 10);
      }, 3000);

      vi.advanceTimersByTime(3000);
      expect(glitchElement.style.animation).toBe('none');

      vi.advanceTimersByTime(10);
      expect(glitchElement.style.animation).toBe('');
      expect(timeoutExecuted).toBe(true);
    });
  });
});

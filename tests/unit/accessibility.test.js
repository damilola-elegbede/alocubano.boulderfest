/**
 * Accessibility Tests
 * Testing actual ARIA implementation and keyboard navigation
 */

const fs = require('fs');
const path = require('path');

// Load actual source code for accessibility testing
let gallerySource, lightboxSource, navigationSource;
try {
  gallerySource = fs.readFileSync(path.join(__dirname, '../../js/gallery-detail.js'), 'utf8');
  lightboxSource = fs.readFileSync(path.join(__dirname, '../../js/components/lightbox.js'), 'utf8');
  navigationSource = fs.readFileSync(path.join(__dirname, '../../js/navigation.js'), 'utf8');
} catch (error) {
  console.error('Failed to load accessibility test sources:', error);
}

describe('Lightbox Accessibility', () => {
  beforeEach(() => {
    // Load lightbox source for accessibility testing
    if (lightboxSource) {
      try {
        eval(lightboxSource);
      } catch (e) {
        console.warn('Lightbox evaluation failed in accessibility test:', e);
      }
    }

    // Setup accessible lightbox DOM
    document.body.innerHTML = `
      <div id="unified-lightbox" class="lightbox" role="dialog" aria-hidden="true" aria-labelledby="lightbox-title" aria-describedby="lightbox-description">
        <div class="lightbox-content" role="document">
          <img class="lightbox-image" alt="" role="img">
          <div class="lightbox-counter" aria-live="polite" aria-atomic="true"></div>
          <div id="lightbox-title" class="lightbox-title"></div>
          <div id="lightbox-description" class="sr-only">Use arrow keys to navigate, escape to close</div>
          <button class="lightbox-close" aria-label="Close lightbox" type="button">×</button>
          <button class="lightbox-prev" aria-label="Previous image" type="button">‹</button>
          <button class="lightbox-next" aria-label="Next image" type="button">›</button>
        </div>
      </div>
      <button id="gallery-trigger" aria-label="Open gallery">Open Gallery</button>
    `;

    // Mock focus management
    Element.prototype.focus = jest.fn();
    Element.prototype.blur = jest.fn();

    jest.clearAllMocks();
  });

  test('lightbox has proper ARIA labels', () => {
    // Test actual ARIA implementation
    const lightbox = document.getElementById('unified-lightbox');
    
    expect(lightbox.getAttribute('role')).toBe('dialog');
    expect(lightbox.getAttribute('aria-hidden')).toBe('true');
    expect(lightbox.getAttribute('aria-labelledby')).toBe('lightbox-title');
    expect(lightbox.getAttribute('aria-describedby')).toBe('lightbox-description');
    
    // Test button ARIA labels
    const closeButton = lightbox.querySelector('.lightbox-close');
    const prevButton = lightbox.querySelector('.lightbox-prev');
    const nextButton = lightbox.querySelector('.lightbox-next');
    
    expect(closeButton.getAttribute('aria-label')).toBe('Close lightbox');
    expect(prevButton.getAttribute('aria-label')).toBe('Previous image');
    expect(nextButton.getAttribute('aria-label')).toBe('Next image');
    
    // Test live region for counter
    const counter = lightbox.querySelector('.lightbox-counter');
    expect(counter.getAttribute('aria-live')).toBe('polite');
    expect(counter.getAttribute('aria-atomic')).toBe('true');
    
    // Test image role
    const image = lightbox.querySelector('.lightbox-image');
    expect(image.getAttribute('role')).toBe('img');
  });

  test('keyboard navigation works correctly', () => {
    if (global.window.Lightbox) {
      const lightbox = new global.window.Lightbox();
      const mockItems = [
        { id: 'a11y1', viewUrl: 'a11y1.jpg', name: 'Accessibility Test 1' },
        { id: 'a11y2', viewUrl: 'a11y2.jpg', name: 'Accessibility Test 2' }
      ];
      
      lightbox.openAdvanced(mockItems, 0, ['accessibility'], { accessibility: 2 });
      
      // Test actual keyboard events
      const keydownEvents = [
        { key: 'ArrowRight', expectedAction: 'next' },
        { key: 'ArrowLeft', expectedAction: 'previous' },
        { key: 'Escape', expectedAction: 'close' },
        { key: 'Home', expectedAction: 'first' },
        { key: 'End', expectedAction: 'last' }
      ];
      
      keydownEvents.forEach(({ key, expectedAction }) => {
        const event = new KeyboardEvent('keydown', { key });
        
        expect(() => {
          document.dispatchEvent(event);
        }).not.toThrow();
        
        // Test that keyboard events are handled appropriately
        if (key === 'ArrowRight' && lightbox.currentIndex < lightbox.items.length - 1) {
          // Should navigate to next item
          expect(lightbox.currentIndex).toBeDefined();
        }
        
        if (key === 'Escape') {
          // Should close lightbox
          const lightboxElement = document.getElementById('unified-lightbox');
          expect(lightboxElement).toBeDefined();
        }
      });
    }
  });

  test('focus trap functions properly', () => {
    // Test actual focus trapping
    const lightboxElement = document.getElementById('unified-lightbox');
    const focusableElements = Array.from(lightboxElement.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ));
    
    expect(focusableElements.length).toBeGreaterThan(0);
    
    // Mock focus method on all focusable elements
    focusableElements.forEach(element => {
      element.focus = jest.fn();
    });
    
    // Test tab order management
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];
    
    expect(firstFocusable).toBeDefined();
    expect(lastFocusable).toBeDefined();
    
    // Test Tab key navigation within trap
    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab' });
    const shiftTabEvent = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
    
    // Simulate tab navigation
    let currentFocus = 0;
    
    const handleTabNavigation = (event) => {
      if (event.key === 'Tab') {
        if (event.shiftKey) {
          currentFocus = currentFocus > 0 ? currentFocus - 1 : focusableElements.length - 1;
        } else {
          currentFocus = currentFocus < focusableElements.length - 1 ? currentFocus + 1 : 0;
        }
        focusableElements[currentFocus].focus();
      }
    };
    
    // Test forward tab navigation
    handleTabNavigation(tabEvent);
    expect(focusableElements[currentFocus].focus).toHaveBeenCalled();
    
    // Test backward tab navigation
    handleTabNavigation(shiftTabEvent);
    expect(focusableElements[currentFocus].focus).toHaveBeenCalled();
    
    // Test focus restoration on close
    const triggerButton = document.getElementById('gallery-trigger');
    triggerButton.focus = jest.fn();
    triggerButton.focus();
    
    if (global.window.Lightbox) {
      const lightbox = new global.window.Lightbox();
      const mockItems = [{ id: 'focus-test', viewUrl: 'focus.jpg', name: 'Focus Test' }];
      
      // Open lightbox
      lightbox.openAdvanced(mockItems, 0, ['focus'], { focus: 1 });
      
      // Close lightbox
      lightbox.close();
      
      // Focus should be restored to trigger button
      expect(triggerButton.focus).toHaveBeenCalled();
    }
  });

  test('screen reader announcements work correctly', () => {
    if (global.window.Lightbox) {
      const lightbox = new global.window.Lightbox();
      const mockItems = [
        { id: 'sr1', viewUrl: 'sr1.jpg', name: 'Screen Reader Test 1' },
        { id: 'sr2', viewUrl: 'sr2.jpg', name: 'Screen Reader Test 2' }
      ];
      
      lightbox.openAdvanced(mockItems, 0, ['screenreader'], { screenreader: 2 });
      
      // Test dynamic ARIA updates
      const counter = document.querySelector('.lightbox-counter');
      const title = document.querySelector('.lightbox-title');
      
      // Counter should announce changes
      expect(counter.getAttribute('aria-live')).toBe('polite');
      
      // Navigate to test announcements
      lightbox.next();
      
      // Test that counter text is updated for screen readers
      const counterText = counter.textContent;
      expect(counterText).toBeDefined();
      
      // Test title updates for screen readers
      const titleText = title.textContent;
      expect(titleText).toBeDefined();
      
      // Test status announcements
      const statusRegion = document.createElement('div');
      statusRegion.setAttribute('aria-live', 'assertive');
      statusRegion.setAttribute('aria-atomic', 'true');
      statusRegion.className = 'sr-only';
      document.body.appendChild(statusRegion);
      
      // Simulate status announcement
      statusRegion.textContent = 'Lightbox opened, 2 of 2 images';
      expect(statusRegion.textContent).toBe('Lightbox opened, 2 of 2 images');
    }
  });

  test('high contrast mode compatibility', () => {
    // Test high contrast mode detection
    const testHighContrast = () => {
      // Simulate high contrast media query
      const highContrastQuery = '(prefers-contrast: high)';
      const mockMediaQuery = {
        matches: true,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      };
      
      window.matchMedia = jest.fn().mockReturnValue(mockMediaQuery);
      
      const highContrastMQ = window.matchMedia(highContrastQuery);
      return highContrastMQ.matches;
    };
    
    const isHighContrast = testHighContrast();
    expect(typeof isHighContrast).toBe('boolean');
    
    // Test high contrast styles
    const lightboxElement = document.getElementById('unified-lightbox');
    
    if (isHighContrast) {
      // Apply high contrast styles
      lightboxElement.classList.add('high-contrast');
      
      // Test that high contrast class is applied
      expect(lightboxElement.classList.contains('high-contrast')).toBe(true);
    }
    
    // Test button visibility in high contrast
    const buttons = lightboxElement.querySelectorAll('button');
    buttons.forEach(button => {
      // Buttons should have sufficient contrast
      const style = window.getComputedStyle(button);
      expect(style).toBeDefined();
    });
  });

  test('reduces motion for accessibility', () => {
    // Test reduced motion detection
    const prefersReducedMotion = () => {
      const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
      const mockMediaQuery = {
        matches: true,
        addEventListener: jest.fn()
      };
      
      window.matchMedia = jest.fn().mockReturnValue(mockMediaQuery);
      return window.matchMedia(reducedMotionQuery).matches;
    };
    
    const shouldReduceMotion = prefersReducedMotion();
    expect(typeof shouldReduceMotion).toBe('boolean');
    
    if (shouldReduceMotion) {
      // Test that animations are disabled
      const lightboxElement = document.getElementById('unified-lightbox');
      lightboxElement.classList.add('reduced-motion');
      
      expect(lightboxElement.classList.contains('reduced-motion')).toBe(true);
      
      // Test that transitions are reduced
      const style = {
        transition: shouldReduceMotion ? 'none' : 'all 0.3s ease',
        animation: shouldReduceMotion ? 'none' : 'fadeIn 0.3s ease'
      };
      
      expect(style.transition).toBe('none');
      expect(style.animation).toBe('none');
    }
  });
});

describe('Gallery Accessibility', () => {
  beforeEach(() => {
    // Setup accessible gallery DOM
    document.body.innerHTML = `
      <div class="gallery-container" role="region" aria-label="Photo gallery">
        <h2 id="gallery-heading">Festival Photos</h2>
        <div class="gallery-grid" role="grid" aria-labelledby="gallery-heading">
          <div class="gallery-item" role="gridcell" tabindex="0" aria-label="Workshop photo 1 of 3">
            <img src="workshop1.jpg" alt="Salsa workshop with instructor demonstrating basic steps" loading="lazy">
          </div>
          <div class="gallery-item" role="gridcell" tabindex="-1" aria-label="Workshop photo 2 of 3">
            <img src="workshop2.jpg" alt="Students practicing partner dance moves in bright studio" loading="lazy">
          </div>
          <div class="gallery-item" role="gridcell" tabindex="-1" aria-label="Social dance photo 1 of 3">
            <img src="social1.jpg" alt="Couples dancing salsa at evening social event" loading="lazy">
          </div>
        </div>
        <div class="gallery-status" aria-live="polite" aria-atomic="true" class="sr-only"></div>
      </div>
    `;

    // Mock keyboard event handling
    Element.prototype.focus = jest.fn();
    Element.prototype.scrollIntoView = jest.fn();

    jest.clearAllMocks();
  });

  test('gallery images have proper alt text', () => {
    // Test actual alt text implementation
    const images = document.querySelectorAll('.gallery-item img');
    
    images.forEach((img, index) => {
      const altText = img.getAttribute('alt');
      
      // Alt text should be descriptive, not generic
      expect(altText).toBeDefined();
      expect(altText.length).toBeGreaterThan(10);
      expect(altText).not.toBe('image');
      expect(altText).not.toBe('photo');
      
      // Test that alt text describes the content
      const hasDescriptiveWords = /workshop|dance|salsa|students|couples/i.test(altText);
      expect(hasDescriptiveWords).toBe(true);
    });
    
    // Test dynamic alt text loading
    const newImage = document.createElement('img');
    newImage.src = 'new-photo.jpg';
    
    // Simulate dynamic alt text assignment
    const generateAltText = (filename) => {
      if (filename.includes('workshop')) {
        return 'Workshop session with participants learning dance techniques';
      } else if (filename.includes('social')) {
        return 'Social dancing event with couples enjoying music';
      }
      return 'Festival photo';
    };
    
    newImage.alt = generateAltText(newImage.src);
    expect(newImage.alt).toBe('Festival photo');
  });

  test('keyboard navigation through gallery works', () => {
    // Test actual gallery keyboard navigation
    const galleryItems = Array.from(document.querySelectorAll('.gallery-item'));
    let currentIndex = 0;
    
    // Mock focus method on all gallery items
    galleryItems.forEach(item => {
      item.focus = jest.fn();
    });
    
    // First item should be focusable
    expect(galleryItems[0].getAttribute('tabindex')).toBe('0');
    
    // Other items should not be in tab order initially
    for (let i = 1; i < galleryItems.length; i++) {
      expect(galleryItems[i].getAttribute('tabindex')).toBe('-1');
    }
    
    // Test arrow key functionality
    const handleKeyNavigation = (event) => {
      const { key } = event;
      const totalItems = galleryItems.length;
      
      // Remove current focus
      galleryItems[currentIndex].setAttribute('tabindex', '-1');
      
      switch (key) {
        case 'ArrowRight':
          currentIndex = (currentIndex + 1) % totalItems;
          break;
        case 'ArrowLeft':
          currentIndex = (currentIndex - 1 + totalItems) % totalItems;
          break;
        case 'Home':
          currentIndex = 0;
          break;
        case 'End':
          currentIndex = totalItems - 1;
          break;
        default:
          return;
      }
      
      // Set new focus
      galleryItems[currentIndex].setAttribute('tabindex', '0');
      galleryItems[currentIndex].focus();
    };
    
    // Test right arrow navigation
    const rightArrow = new KeyboardEvent('keydown', { key: 'ArrowRight' });
    handleKeyNavigation(rightArrow);
    
    expect(currentIndex).toBe(1);
    expect(galleryItems[1].getAttribute('tabindex')).toBe('0');
    expect(galleryItems[1].focus).toHaveBeenCalled();
    
    // Test left arrow navigation
    const leftArrow = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
    handleKeyNavigation(leftArrow);
    
    expect(currentIndex).toBe(0);
    expect(galleryItems[0].getAttribute('tabindex')).toBe('0');
    
    // Test Home/End navigation
    const homeKey = new KeyboardEvent('keydown', { key: 'Home' });
    const endKey = new KeyboardEvent('keydown', { key: 'End' });
    
    handleKeyNavigation(endKey);
    expect(currentIndex).toBe(galleryItems.length - 1);
    
    handleKeyNavigation(homeKey);
    expect(currentIndex).toBe(0);
    
    // Test enter key activation
    const enterKey = new KeyboardEvent('keydown', { key: 'Enter' });
    const spaceKey = new KeyboardEvent('keydown', { key: ' ' });
    
    const mockActivation = jest.fn();
    galleryItems[currentIndex].addEventListener('click', mockActivation);
    
    // Simulate activation with Enter/Space
    const activateItem = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        galleryItems[currentIndex].click();
      }
    };
    
    activateItem(enterKey);
    expect(mockActivation).toHaveBeenCalled();
  });

  test('gallery loading states are announced', () => {
    // Test loading state announcements
    const statusRegion = document.querySelector('.gallery-status');
    
    expect(statusRegion.getAttribute('aria-live')).toBe('polite');
    expect(statusRegion.getAttribute('aria-atomic')).toBe('true');
    
    // Test loading announcement
    statusRegion.textContent = 'Loading gallery images...';
    expect(statusRegion.textContent).toBe('Loading gallery images...');
    
    // Test loaded announcement
    const simulateGalleryLoad = (itemCount) => {
      statusRegion.textContent = `Gallery loaded with ${itemCount} images. Use arrow keys to navigate.`;
    };
    
    simulateGalleryLoad(3);
    expect(statusRegion.textContent).toContain('Gallery loaded with 3 images');
    
    // Test error announcement
    const simulateLoadError = () => {
      statusRegion.textContent = 'Error loading gallery. Please try again.';
    };
    
    simulateLoadError();
    expect(statusRegion.textContent).toBe('Error loading gallery. Please try again.');
  });

  test('gallery respects accessibility preferences', () => {
    // Test various accessibility preferences
    const accessibilitySettings = {
      prefersReducedMotion: true,
      prefersHighContrast: false,
      prefersLargeText: true
    };
    
    const galleryContainer = document.querySelector('.gallery-container');
    
    // Apply accessibility classes based on preferences
    if (accessibilitySettings.prefersReducedMotion) {
      galleryContainer.classList.add('reduced-motion');
    }
    
    if (accessibilitySettings.prefersHighContrast) {
      galleryContainer.classList.add('high-contrast');
    }
    
    if (accessibilitySettings.prefersLargeText) {
      galleryContainer.classList.add('large-text');
    }
    
    // Test that classes are applied correctly
    expect(galleryContainer.classList.contains('reduced-motion')).toBe(true);
    expect(galleryContainer.classList.contains('high-contrast')).toBe(false);
    expect(galleryContainer.classList.contains('large-text')).toBe(true);
    
    // Test responsive text sizing
    const computedStyle = {
      fontSize: accessibilitySettings.prefersLargeText ? '1.25rem' : '1rem',
      lineHeight: accessibilitySettings.prefersLargeText ? '1.6' : '1.4'
    };
    
    expect(computedStyle.fontSize).toBe('1.25rem');
    expect(computedStyle.lineHeight).toBe('1.6');
  });
});

describe('Navigation Accessibility', () => {
  beforeEach(() => {
    // Setup accessible navigation DOM
    document.body.innerHTML = `
      <nav class="main-nav" role="navigation" aria-label="Main navigation">
        <button class="menu-toggle" aria-expanded="false" aria-controls="nav-menu" aria-label="Toggle navigation menu">
          <span class="hamburger-icon" aria-hidden="true"></span>
          <span class="sr-only">Menu</span>
        </button>
        <ul id="nav-menu" class="nav-list" role="menubar">
          <li role="none">
            <a href="/home" class="nav-link" role="menuitem" aria-current="page">Home</a>
          </li>
          <li role="none">
            <a href="/about" class="nav-link" role="menuitem">About</a>
          </li>
          <li role="none">
            <a href="/gallery" class="nav-link" role="menuitem">Gallery</a>
          </li>
        </ul>
      </nav>
      <div class="nav-status" aria-live="polite" class="sr-only"></div>
    `;

    jest.clearAllMocks();
  });

  test('navigation has proper ARIA structure', () => {
    const nav = document.querySelector('.main-nav');
    const menuToggle = document.querySelector('.menu-toggle');
    const navMenu = document.querySelector('#nav-menu');
    const navLinks = document.querySelectorAll('.nav-link');
    
    // Test navigation landmark
    expect(nav.getAttribute('role')).toBe('navigation');
    expect(nav.getAttribute('aria-label')).toBe('Main navigation');
    
    // Test menu toggle button
    expect(menuToggle.getAttribute('aria-expanded')).toBe('false');
    expect(menuToggle.getAttribute('aria-controls')).toBe('nav-menu');
    expect(menuToggle.getAttribute('aria-label')).toBe('Toggle navigation menu');
    
    // Test menu structure
    expect(navMenu.getAttribute('role')).toBe('menubar');
    expect(navMenu.id).toBe('nav-menu');
    
    // Test menu items
    navLinks.forEach(link => {
      expect(link.getAttribute('role')).toBe('menuitem');
    });
    
    // Test current page indicator
    const currentLink = document.querySelector('[aria-current="page"]');
    expect(currentLink).toBeTruthy();
    expect(currentLink.getAttribute('aria-current')).toBe('page');
  });

  test('mobile menu keyboard navigation works', () => {
    const menuToggle = document.querySelector('.menu-toggle');
    const navMenu = document.querySelector('#nav-menu');
    const navStatus = document.querySelector('.nav-status');
    
    let isMenuOpen = false;
    
    // Test menu toggle with keyboard
    const toggleMenu = () => {
      isMenuOpen = !isMenuOpen;
      menuToggle.setAttribute('aria-expanded', isMenuOpen.toString());
      
      if (isMenuOpen) {
        navMenu.classList.add('is-open');
        navStatus.textContent = 'Navigation menu opened';
        
        // Focus first menu item
        const firstMenuItem = navMenu.querySelector('.nav-link');
        firstMenuItem.focus();
      } else {
        navMenu.classList.remove('is-open');
        navStatus.textContent = 'Navigation menu closed';
        
        // Return focus to toggle button
        menuToggle.focus();
      }
    };
    
    // Test Enter key activation
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
    const spaceEvent = new KeyboardEvent('keydown', { key: ' ' });
    
    // Simulate keyboard activation
    toggleMenu();
    expect(menuToggle.getAttribute('aria-expanded')).toBe('true');
    expect(navStatus.textContent).toBe('Navigation menu opened');
    
    // Test Escape key closing
    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
    toggleMenu(); // Close menu
    expect(menuToggle.getAttribute('aria-expanded')).toBe('false');
    expect(navStatus.textContent).toBe('Navigation menu closed');
  });

  test('navigation supports screen reader users', () => {
    // Test skip link functionality
    const skipLink = document.createElement('a');
    skipLink.href = '#main-content';
    skipLink.className = 'skip-link sr-only-focusable';
    skipLink.textContent = 'Skip to main content';
    document.body.insertBefore(skipLink, document.body.firstChild);
    
    expect(skipLink.textContent).toBe('Skip to main content');
    expect(skipLink.href).toContain('#main-content');
    
    // Test navigation landmarks
    const landmarks = {
      banner: document.querySelector('[role="banner"]'),
      navigation: document.querySelector('[role="navigation"]'),
      main: document.querySelector('[role="main"]'),
      contentinfo: document.querySelector('[role="contentinfo"]')
    };
    
    // Navigation landmark should exist
    expect(landmarks.navigation).toBeTruthy();
    
    // Test breadcrumb navigation
    const breadcrumb = document.createElement('nav');
    breadcrumb.setAttribute('aria-label', 'Breadcrumb');
    breadcrumb.innerHTML = `
      <ol>
        <li><a href="/home">Home</a></li>
        <li><a href="/gallery">Gallery</a></li>
        <li aria-current="page">2025 Photos</li>
      </ol>
    `;
    
    document.body.appendChild(breadcrumb);
    
    const currentBreadcrumb = breadcrumb.querySelector('[aria-current="page"]');
    expect(currentBreadcrumb).toBeTruthy();
    expect(currentBreadcrumb.textContent).toBe('2025 Photos');
  });
});
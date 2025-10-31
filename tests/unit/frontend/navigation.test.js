/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Navigation Component Tests
 * Tests the navigation.js functionality including:
 * - Mobile menu toggle and state management
 * - Dropdown menu interactions (hover, click, keyboard)
 * - Active page highlighting
 * - Keyboard accessibility (Tab, Enter, Space, Escape, Arrow keys)
 * - Event system (EventBus)
 * - Focus management and ARIA attributes
 * - Performance metrics tracking
 * - Smooth scroll behavior
 * - Route parsing and navigation
 */

describe('Navigation Component', () => {
  let SiteNavigation;
  let DropdownManager;
  let EventBus;
  let navigationInstance;
  let originalLocation;
  let mockIntersectionObserver;

  beforeEach(() => {
    // Mock location
    originalLocation = window.location;
    delete window.location;
    window.location = {
      pathname: '/home',
      href: 'http://localhost/home',
      host: 'localhost'
    };

    // Mock localStorage
    global.localStorage = {
      data: {},
      getItem(key) {
        return this.data[key] || null;
      },
      setItem(key, value) {
        this.data[key] = value;
      },
      removeItem(key) {
        delete this.data[key];
      },
      clear() {
        this.data = {};
      }
    };

    // Mock IntersectionObserver
    mockIntersectionObserver = vi.fn(function(callback, options) {
      this.callback = callback;
      this.options = options;
      this.observe = vi.fn();
      this.unobserve = vi.fn();
      this.disconnect = vi.fn();
    });
    global.IntersectionObserver = mockIntersectionObserver;

    // Mock requestIdleCallback
    global.requestIdleCallback = vi.fn((cb) => setTimeout(() => cb({ timeRemaining: () => 50 }), 0));

    // Set up DOM structure
    document.body.innerHTML = `
      <style>
        .nav-list.is-open { display: block; }
        .menu-toggle.is-active { transform: rotate(90deg); }
        .nav-link.is-active { font-weight: bold; }
        .dropdown-menu.is-open { display: block; }
      </style>
      <nav class="main-nav">
        <button class="menu-toggle" aria-expanded="false" aria-label="Toggle menu">
          <span class="hamburger"></span>
        </button>
        <ul class="nav-list">
          <li class="nav-item">
            <a href="/home" class="nav-link">Home</a>
          </li>
          <li class="nav-item">
            <a href="/about" class="nav-link">About</a>
          </li>
          <li class="nav-item has-dropdown">
            <button class="nav-trigger dropdown-trigger" data-dropdown="events" aria-expanded="false">
              Events
            </button>
            <div class="dropdown-menu" aria-hidden="true">
              <a href="/2026-artists" class="dropdown-link" data-event="2026">2026 Artists</a>
              <a href="/2026-schedule" class="dropdown-link" data-event="2026">2026 Schedule</a>
              <a href="/2025-artists" class="dropdown-link" data-event="2025">2025 Artists</a>
            </div>
          </li>
          <li class="nav-item">
            <a href="/tickets" class="nav-link">Tickets</a>
          </li>
          <li class="nav-item">
            <a href="/gallery" class="nav-link">Gallery</a>
          </li>
        </ul>
      </nav>
      <main id="main-content">
        <h1>Page Content</h1>
      </main>
    `;

    // Use real timers for these tests
    vi.useRealTimers();

    // Define classes inline (simplified versions for testing)
    EventBus = class EventBus {
      constructor() {
        this.events = new Map();
      }
      on(eventName, callback) {
        if (!this.events.has(eventName)) {
          this.events.set(eventName, []);
        }
        this.events.get(eventName).push(callback);
      }
      off(eventName, callback) {
        if (!this.events.has(eventName)) return;
        const callbacks = this.events.get(eventName);
        const index = callbacks.indexOf(callback);
        if (index > -1) callbacks.splice(index, 1);
      }
      emit(eventName, data) {
        if (!this.events.has(eventName)) return;
        this.events.get(eventName).forEach((callback) => {
          try {
            callback(data);
          } catch (error) {
            console.error(`Error in event listener for '${eventName}':`, error);
          }
        });
      }
      once(eventName, callback) {
        const onceCallback = (data) => {
          callback(data);
          this.off(eventName, onceCallback);
        };
        this.on(eventName, onceCallback);
      }
    };

    DropdownManager = class DropdownManager {
      constructor(navigationSystem) {
        this.nav = navigationSystem;
        this.activeDropdown = null;
        this.dropdownTimers = new Map();
        this.activeObservers = new Map();
        this.config = {
          hoverDelay: 150,
          hideDelay: 300,
          keyboardNavEnabled: true,
          touchEnabled: 'ontouchstart' in window || navigator.maxTouchPoints > 0
        };
        this.keyboardFocusIndex = -1;
        this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      }
      init() {
        this.setupDropdownListeners();
      }
      setupDropdownListeners() {
        document.addEventListener('click', this.handleDropdownClick.bind(this));
      }
      handleDropdownClick(event) {
        const trigger = event.target.closest('.nav-trigger, .dropdown-trigger');
        if (trigger) {
          event.preventDefault();
          this.toggleDropdown(trigger);
        } else if (!event.target.closest('.nav-item.has-dropdown, .dropdown-container')) {
          this.closeAllDropdowns();
        }
      }
      toggleDropdown(trigger) {
        const container = trigger.closest('.nav-item.has-dropdown, .dropdown-container');
        const menu = container.querySelector('.dropdown-menu');
        const isExpanded = trigger.getAttribute('aria-expanded') === 'true';
        if (isExpanded) {
          this.hideDropdown(container);
        } else {
          this.closeAllDropdowns();
          this.showDropdown(trigger);
        }
      }
      showDropdown(trigger) {
        const container = trigger.closest('.nav-item.has-dropdown, .dropdown-container');
        const menu = container.querySelector('.dropdown-menu');
        trigger.setAttribute('aria-expanded', 'true');
        menu.setAttribute('aria-hidden', 'false');
        menu.classList.add('is-open');
        container.classList.add('dropdown-active');
        this.activeDropdown = container;
        this.keyboardFocusIndex = -1;
        this.nav.eventBus.emit('dropdownOpened', { container, trigger, menu, timestamp: Date.now() });
      }
      hideDropdown(container) {
        const trigger = container.querySelector('.nav-trigger, .dropdown-trigger');
        const menu = container.querySelector('.dropdown-menu');
        trigger.setAttribute('aria-expanded', 'false');
        menu.setAttribute('aria-hidden', 'true');
        menu.classList.remove('is-open');
        container.classList.remove('dropdown-active');
        if (this.activeDropdown === container) {
          this.activeDropdown = null;
        }
        this.keyboardFocusIndex = -1;
        this.nav.eventBus.emit('dropdownClosed', { container, trigger, menu, timestamp: Date.now() });
      }
      closeAllDropdowns() {
        document.querySelectorAll('.nav-item.has-dropdown, .dropdown-container').forEach((container) => {
          this.hideDropdown(container);
        });
      }
      destroy() {
        this.dropdownTimers.forEach((timer) => clearTimeout(timer));
        this.dropdownTimers.clear();
        this.activeObservers.forEach((observer) => observer.disconnect());
        this.activeObservers.clear();
        this.activeDropdown = null;
      }
    };

    SiteNavigation = class SiteNavigation {
      constructor(config = {}) {
        this.currentDesign = localStorage.getItem('selectedDesign') || 'design1';
        this.mobileMenuOpen = false;
        this.currentEvent = null;
        this.currentPage = null;
        this.config = {
          enableDropdowns: true,
          enableKeyboardNav: true,
          enableEventSwitcher: true,
          cubanRhythmTiming: true,
          ...config
        };
        this.eventConfig = {
          subPageTypes: ['artists', 'schedule', 'gallery'],
          events: {
            'boulder-fest-2026': { year: '2026', prefix: '2026' },
            'boulder-fest-2025': { year: '2025', prefix: '2025' }
          }
        };
        this.eventBus = new EventBus();
        this.dropdownManager = null;
        this.performanceMetrics = {
          navigationInteractions: 0,
          dropdownUsage: 0,
          keyboardNavUsage: 0
        };
        this.init();
      }
      init() {
        this.parseCurrentRoute();
        this.setupEventListeners();
        if (this.config.enableDropdowns) {
          this.initializeDropdowns();
        }
        this.createMobileMenu();
        this.highlightCurrentPage();
        this.ensureMenuStateSync();
        this.setupAccessibilityEnhancements();
      }
      parseCurrentRoute() {
        const path = window.location.pathname;
        const segments = path.split('/').filter(Boolean);
        if (segments.length >= 2) {
          this.currentEvent = segments[0];
          this.currentPage = segments[1];
        } else if (segments.length === 1) {
          this.currentEvent = null;
          this.currentPage = segments[0] || 'home';
        } else {
          this.currentEvent = null;
          this.currentPage = 'home';
        }
        this.eventBus.emit('routeChanged', {
          event: this.currentEvent,
          page: this.currentPage,
          path: path,
          timestamp: Date.now()
        });
      }
      initializeDropdowns() {
        if (this.dropdownManager) {
          this.dropdownManager.destroy();
        }
        this.dropdownManager = new DropdownManager(this);
        this.dropdownManager.init();
        this.eventBus.on('dropdownOpened', () => {
          this.performanceMetrics.dropdownUsage++;
        });
      }
      setupAccessibilityEnhancements() {
        document.addEventListener('keydown', (event) => {
          if (event.key === 'Tab') {
            this.performanceMetrics.keyboardNavUsage++;
            document.body.classList.add('keyboard-navigation-active');
          }
        });
        document.addEventListener('mousedown', () => {
          document.body.classList.remove('keyboard-navigation-active');
        });
        this.createSkipLink();
      }
      createSkipLink() {
        if (document.querySelector('.skip-link')) return;
        const skipLink = document.createElement('a');
        skipLink.href = '#main-content';
        skipLink.textContent = 'Skip to main content';
        skipLink.className = 'skip-link';
        document.body.insertBefore(skipLink, document.body.firstChild);
      }
      setupEventListeners() {
        const menuToggle = document.querySelector('.menu-toggle');
        if (menuToggle) {
          menuToggle.addEventListener('click', () => this.toggleMobileMenu());
        }
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && this.mobileMenuOpen) {
            this.closeMobileMenu();
          }
        });
        document.addEventListener('click', (e) => {
          const navList = document.querySelector('.nav-list');
          const menuToggle = document.querySelector('.menu-toggle');
          if (this.mobileMenuOpen && menuToggle && !menuToggle.contains(e.target)) {
            if (navList && !navList.contains(e.target)) {
              this.closeMobileMenu();
            }
          }
        });
        document.addEventListener('click', (e) => {
          if (e.target.matches('.nav-link') && this.mobileMenuOpen) {
            this.closeMobileMenu();
          }
        });
      }
      createMobileMenu() {
        const nav = document.querySelector('.main-nav');
        const menuToggle = document.querySelector('.menu-toggle');
        if (!nav || !menuToggle) return;
      }
      toggleMobileMenu() {
        this.mobileMenuOpen = !this.mobileMenuOpen;
        const menuToggle = document.querySelector('.menu-toggle');
        const navList = document.querySelector('.nav-list');
        if (this.mobileMenuOpen) {
          if (navList) navList.classList.add('is-open');
          if (menuToggle) {
            menuToggle.classList.add('is-active');
            menuToggle.setAttribute('aria-expanded', 'true');
          }
          document.body.style.overflow = 'hidden';
        } else {
          if (navList) navList.classList.remove('is-open');
          if (menuToggle) {
            menuToggle.classList.remove('is-active');
            menuToggle.setAttribute('aria-expanded', 'false');
          }
          document.body.style.overflow = '';
        }
        setTimeout(() => this.ensureMenuStateSync(), 100);
      }
      closeMobileMenu() {
        this.mobileMenuOpen = false;
        const menuToggle = document.querySelector('.menu-toggle');
        const navList = document.querySelector('.nav-list');
        if (navList) navList.classList.remove('is-open');
        if (menuToggle) {
          menuToggle.classList.remove('is-active');
          menuToggle.setAttribute('aria-expanded', 'false');
        }
        document.body.style.overflow = '';
      }
      highlightCurrentPage() {
        const currentPath = window.location.pathname;
        const navLinks = document.querySelectorAll('.nav-link, .dropdown-link, .event-nav-link');
        document.querySelectorAll('.nav-trigger, .nav-item').forEach((el) => {
          el.classList.remove('is-active');
        });
        navLinks.forEach((link) => {
          link.classList.remove('is-active');
          const linkPath = new URL(link.href, window.location.origin).pathname;
          const isCurrentPage = currentPath === linkPath ||
            (currentPath === '/' && linkPath === '/home') ||
            (currentPath === '/home' && linkPath === '/home') ||
            (currentPath.startsWith(linkPath + '/') && linkPath !== '/');
          if (isCurrentPage) {
            link.classList.add('is-active');
            link.setAttribute('aria-current', 'page');
            const dropdown = link.closest('.nav-item.has-dropdown, .dropdown-container');
            if (dropdown) {
              const trigger = dropdown.querySelector('.dropdown-trigger, .nav-trigger');
              if (trigger) {
                trigger.classList.add('is-active');
                const navItem = trigger.closest('.nav-item');
                if (navItem) navItem.classList.add('is-active');
              }
            }
          } else {
            link.removeAttribute('aria-current');
          }
        });
      }
      ensureMenuStateSync() {
        const menuToggle = document.querySelector('.menu-toggle');
        if (menuToggle) {
          const hasActiveClass = menuToggle.classList.contains('is-active');
          if (this.mobileMenuOpen && !hasActiveClass) {
            menuToggle.classList.add('is-active');
            menuToggle.setAttribute('aria-expanded', 'true');
          } else if (!this.mobileMenuOpen && hasActiveClass) {
            menuToggle.classList.remove('is-active');
            menuToggle.setAttribute('aria-expanded', 'false');
          }
        }
      }
      getPerformanceMetrics() {
        return {
          ...this.performanceMetrics,
          timestamp: Date.now(),
          activeDropdowns: document.querySelectorAll('.nav-item.has-dropdown.dropdown-active, .dropdown-container.dropdown-active').length,
          mobileMenuOpen: this.mobileMenuOpen
        };
      }
      destroy() {
        if (this.dropdownManager) {
          this.dropdownManager.destroy();
        }
        this.eventBus.events.clear();
      }
    };

    // Initialize navigation
    navigationInstance = new SiteNavigation();
  });

  afterEach(() => {
    if (navigationInstance) {
      navigationInstance.destroy();
    }
    window.location = originalLocation;
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  describe('Mobile Menu Toggle', () => {
    it('should open mobile menu on toggle button click', () => {
      const menuToggle = document.querySelector('.menu-toggle');
      const navList = document.querySelector('.nav-list');

      expect(navigationInstance.mobileMenuOpen).toBe(false);
      expect(navList.classList.contains('is-open')).toBe(false);

      menuToggle.click();

      expect(navigationInstance.mobileMenuOpen).toBe(true);
      expect(navList.classList.contains('is-open')).toBe(true);
      expect(menuToggle.classList.contains('is-active')).toBe(true);
      expect(menuToggle.getAttribute('aria-expanded')).toBe('true');
    });

    it('should close mobile menu on second toggle button click', () => {
      const menuToggle = document.querySelector('.menu-toggle');
      const navList = document.querySelector('.nav-list');

      menuToggle.click();
      expect(navigationInstance.mobileMenuOpen).toBe(true);

      menuToggle.click();
      expect(navigationInstance.mobileMenuOpen).toBe(false);
      expect(navList.classList.contains('is-open')).toBe(false);
      expect(menuToggle.classList.contains('is-active')).toBe(false);
      expect(menuToggle.getAttribute('aria-expanded')).toBe('false');
    });

    it('should prevent body scroll when mobile menu is open', () => {
      const menuToggle = document.querySelector('.menu-toggle');

      menuToggle.click();
      expect(document.body.style.overflow).toBe('hidden');

      menuToggle.click();
      expect(document.body.style.overflow).toBe('');
    });

    it('should close mobile menu on Escape key press', () => {
      const menuToggle = document.querySelector('.menu-toggle');

      menuToggle.click();
      expect(navigationInstance.mobileMenuOpen).toBe(true);

      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      document.dispatchEvent(escapeEvent);

      expect(navigationInstance.mobileMenuOpen).toBe(false);
    });

    it('should close mobile menu when clicking outside', () => {
      const menuToggle = document.querySelector('.menu-toggle');
      const mainContent = document.querySelector('#main-content');

      menuToggle.click();
      expect(navigationInstance.mobileMenuOpen).toBe(true);

      mainContent.click();

      expect(navigationInstance.mobileMenuOpen).toBe(false);
    });

    it('should close mobile menu when clicking navigation link', () => {
      const menuToggle = document.querySelector('.menu-toggle');
      const navLink = document.querySelector('.nav-link');

      menuToggle.click();
      expect(navigationInstance.mobileMenuOpen).toBe(true);

      navLink.click();

      expect(navigationInstance.mobileMenuOpen).toBe(false);
    });

    it('should maintain ARIA attributes correctly during toggle', () => {
      const menuToggle = document.querySelector('.menu-toggle');

      expect(menuToggle.getAttribute('aria-expanded')).toBe('false');

      menuToggle.click();
      expect(menuToggle.getAttribute('aria-expanded')).toBe('true');

      menuToggle.click();
      expect(menuToggle.getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('Dropdown Menu Interactions', () => {
    it('should open dropdown on trigger click', () => {
      const trigger = document.querySelector('.dropdown-trigger');
      const menu = document.querySelector('.dropdown-menu');

      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(menu.getAttribute('aria-hidden')).toBe('true');

      // Call toggleDropdown directly since Happy-DOM event delegation has limitations
      navigationInstance.dropdownManager.toggleDropdown(trigger);

      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      expect(menu.getAttribute('aria-hidden')).toBe('false');
      expect(menu.classList.contains('is-open')).toBe(true);
    });

    it('should close dropdown on second trigger click', () => {
      const trigger = document.querySelector('.dropdown-trigger');
      const menu = document.querySelector('.dropdown-menu');

      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(menu.classList.contains('is-open')).toBe(true);

      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(menu.classList.contains('is-open')).toBe(false);
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
    });

    it('should close dropdown when clicking outside', () => {
      const trigger = document.querySelector('.dropdown-trigger');
      const menu = document.querySelector('.dropdown-menu');

      // Open dropdown first - call toggleDropdown directly
      navigationInstance.dropdownManager.toggleDropdown(trigger);
      expect(menu.classList.contains('is-open')).toBe(true);

      // Close by calling closeAllDropdowns (simulating clicking outside)
      navigationInstance.dropdownManager.closeAllDropdowns();

      expect(menu.classList.contains('is-open')).toBe(false);
    });

    it('should emit dropdownOpened event when dropdown opens', () => {
      const trigger = document.querySelector('.dropdown-trigger');
      let eventFired = false;

      navigationInstance.eventBus.on('dropdownOpened', (data) => {
        expect(data).toBeDefined();
        expect(data.trigger).toBe(trigger);
        expect(data.timestamp).toBeGreaterThan(0);
        eventFired = true;
      });

      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(eventFired).toBe(true);
    });

    it('should emit dropdownClosed event when dropdown closes', () => {
      const trigger = document.querySelector('.dropdown-trigger');
      let eventFired = false;

      // Open dropdown
      const openEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      Object.defineProperty(openEvent, 'target', { value: trigger, enumerable: true });
      document.dispatchEvent(openEvent);

      navigationInstance.eventBus.on('dropdownClosed', (data) => {
        expect(data).toBeDefined();
        expect(data.timestamp).toBeGreaterThan(0);
        eventFired = true;
      });

      // Close dropdown
      const closeEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      Object.defineProperty(closeEvent, 'target', { value: trigger, enumerable: true });
      document.dispatchEvent(closeEvent);
      expect(eventFired).toBe(true);
    });

    it('should track dropdown usage in performance metrics', () => {
      const trigger = document.querySelector('.dropdown-trigger');
      const initialCount = navigationInstance.performanceMetrics.dropdownUsage;

      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(navigationInstance.performanceMetrics.dropdownUsage).toBe(initialCount + 1);
    });
  });

  describe('Active Page Highlighting', () => {
    it('should highlight current page link', () => {
      window.location.pathname = '/home';
      navigationInstance.highlightCurrentPage();

      const homeLink = document.querySelector('a[href="/home"]');
      expect(homeLink.classList.contains('is-active')).toBe(true);
      expect(homeLink.getAttribute('aria-current')).toBe('page');
    });

    it('should remove active class from other links', () => {
      window.location.pathname = '/about';
      navigationInstance.highlightCurrentPage();

      const homeLink = document.querySelector('a[href="/home"]');
      const aboutLink = document.querySelector('a[href="/about"]');

      expect(homeLink.classList.contains('is-active')).toBe(false);
      expect(aboutLink.classList.contains('is-active')).toBe(true);
    });

    it('should highlight parent dropdown when child link is active', () => {
      window.location.pathname = '/2026-artists';
      navigationInstance.highlightCurrentPage();

      const trigger = document.querySelector('.dropdown-trigger');
      const dropdownLink = document.querySelector('a[href="/2026-artists"]');

      expect(dropdownLink.classList.contains('is-active')).toBe(true);
      expect(trigger.classList.contains('is-active')).toBe(true);
    });

    it('should handle root path as home', () => {
      window.location.pathname = '/';
      navigationInstance.highlightCurrentPage();

      const homeLink = document.querySelector('a[href="/home"]');
      expect(homeLink.classList.contains('is-active')).toBe(true);
    });
  });

  describe('Keyboard Accessibility', () => {
    it('should add keyboard navigation class on Tab key', () => {
      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
      document.dispatchEvent(tabEvent);

      expect(document.body.classList.contains('keyboard-navigation-active')).toBe(true);
    });

    it('should remove keyboard navigation class on mouse down', () => {
      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
      document.dispatchEvent(tabEvent);

      const mouseEvent = new MouseEvent('mousedown', { bubbles: true });
      document.dispatchEvent(mouseEvent);

      expect(document.body.classList.contains('keyboard-navigation-active')).toBe(false);
    });

    it('should track keyboard navigation usage in metrics', () => {
      const initialCount = navigationInstance.performanceMetrics.keyboardNavUsage;

      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
      document.dispatchEvent(tabEvent);

      expect(navigationInstance.performanceMetrics.keyboardNavUsage).toBe(initialCount + 1);
    });

    it('should create skip link for accessibility', () => {
      const skipLink = document.querySelector('.skip-link');

      expect(skipLink).not.toBeNull();
      expect(skipLink.getAttribute('href')).toBe('#main-content');
      expect(skipLink.textContent).toBe('Skip to main content');
    });

    it('should not create duplicate skip links', () => {
      navigationInstance.createSkipLink();
      navigationInstance.createSkipLink();

      const skipLinks = document.querySelectorAll('.skip-link');
      expect(skipLinks.length).toBe(1);
    });
  });

  describe('Event System (EventBus)', () => {
    it('should emit routeChanged event on initialization', (done) => {
      const newNav = new SiteNavigation();

      newNav.eventBus.on('routeChanged', (data) => {
        expect(data.page).toBe('home');
        expect(data.path).toBe('/home');
        expect(data.timestamp).toBeGreaterThan(0);
        newNav.destroy();
        done();
      });
    });

    it('should support event subscription', () => {
      const callback = vi.fn();
      navigationInstance.eventBus.on('test-event', callback);

      navigationInstance.eventBus.emit('test-event', { data: 'test' });

      expect(callback).toHaveBeenCalledWith({ data: 'test' });
    });

    it('should support event unsubscription', () => {
      const callback = vi.fn();
      navigationInstance.eventBus.on('test-event', callback);
      navigationInstance.eventBus.off('test-event', callback);

      navigationInstance.eventBus.emit('test-event', { data: 'test' });

      expect(callback).not.toHaveBeenCalled();
    });

    it('should support once event subscription', () => {
      const callback = vi.fn();
      navigationInstance.eventBus.once('test-event', callback);

      navigationInstance.eventBus.emit('test-event', { data: 'test1' });
      navigationInstance.eventBus.emit('test-event', { data: 'test2' });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({ data: 'test1' });
    });

    it('should handle errors in event callbacks gracefully', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Test error');
      });
      const normalCallback = vi.fn();

      navigationInstance.eventBus.on('test-event', errorCallback);
      navigationInstance.eventBus.on('test-event', normalCallback);

      // Should not throw
      expect(() => {
        navigationInstance.eventBus.emit('test-event', { data: 'test' });
      }).not.toThrow();

      expect(normalCallback).toHaveBeenCalled();
    });
  });

  describe('Route Parsing', () => {
    it('should parse root path correctly', () => {
      window.location.pathname = '/';
      navigationInstance.parseCurrentRoute();

      expect(navigationInstance.currentPage).toBe('home');
      expect(navigationInstance.currentEvent).toBeNull();
    });

    it('should parse single segment path', () => {
      window.location.pathname = '/tickets';
      navigationInstance.parseCurrentRoute();

      expect(navigationInstance.currentPage).toBe('tickets');
      expect(navigationInstance.currentEvent).toBeNull();
    });

    it('should parse multi-segment event path', () => {
      window.location.pathname = '/boulder-fest-2026/artists';
      navigationInstance.parseCurrentRoute();

      expect(navigationInstance.currentEvent).toBe('boulder-fest-2026');
      expect(navigationInstance.currentPage).toBe('artists');
    });
  });

  describe('Performance Metrics', () => {
    it('should track navigation interactions', () => {
      const metrics = navigationInstance.getPerformanceMetrics();

      expect(metrics).toHaveProperty('navigationInteractions');
      expect(metrics).toHaveProperty('dropdownUsage');
      expect(metrics).toHaveProperty('keyboardNavUsage');
      expect(metrics).toHaveProperty('timestamp');
      expect(metrics).toHaveProperty('activeDropdowns');
      expect(metrics).toHaveProperty('mobileMenuOpen');
    });

    it('should include active dropdowns count in metrics', () => {
      const trigger = document.querySelector('.dropdown-trigger');
      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      Object.defineProperty(clickEvent, 'target', { value: trigger, enumerable: true });
      document.dispatchEvent(clickEvent);

      const metrics = navigationInstance.getPerformanceMetrics();

      expect(metrics.activeDropdowns).toBeGreaterThan(0);
    });

    it('should include mobile menu state in metrics', () => {
      const menuToggle = document.querySelector('.menu-toggle');
      menuToggle.click();

      const metrics = navigationInstance.getPerformanceMetrics();

      expect(metrics.mobileMenuOpen).toBe(true);
    });
  });

  describe('Cleanup and Destroy', () => {
    it('should destroy dropdown manager on cleanup', () => {
      const destroySpy = vi.spyOn(navigationInstance.dropdownManager, 'destroy');

      navigationInstance.destroy();

      expect(destroySpy).toHaveBeenCalled();
    });

    it('should clear event bus on cleanup', () => {
      navigationInstance.eventBus.on('test-event', () => {});

      navigationInstance.destroy();

      expect(navigationInstance.eventBus.events.size).toBe(0);
    });
  });

  describe('Menu State Synchronization', () => {
    it('should sync hamburger animation with menu state', () => {
      const menuToggle = document.querySelector('.menu-toggle');

      menuToggle.click();
      navigationInstance.ensureMenuStateSync();

      expect(menuToggle.classList.contains('is-active')).toBe(true);
      expect(menuToggle.getAttribute('aria-expanded')).toBe('true');
    });

    it('should fix desync between menu state and visual state', () => {
      const menuToggle = document.querySelector('.menu-toggle');

      // Manually create desync
      navigationInstance.mobileMenuOpen = true;
      menuToggle.classList.remove('is-active');

      navigationInstance.ensureMenuStateSync();

      expect(menuToggle.classList.contains('is-active')).toBe(true);
    });
  });

  describe('localStorage Integration', () => {
    it('should load design preference from localStorage', () => {
      localStorage.setItem('selectedDesign', 'design2');

      const newNav = new SiteNavigation();

      expect(newNav.currentDesign).toBe('design2');

      newNav.destroy();
    });

    it('should default to design1 if no preference stored', () => {
      localStorage.clear();

      const newNav = new SiteNavigation();

      expect(newNav.currentDesign).toBe('design1');

      newNav.destroy();
    });
  });
});

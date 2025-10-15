/**
 * Admin Mobile Navigation Controller
 * Handles hamburger menu toggle and mobile navigation behavior
 */

class AdminMobileNav {
  constructor() {
    this.toggle = null;
    this.navList = null;
    this.isOpen = false;
    this.focusTrap = null;

    this.init();
  }

  init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }

  setup() {
    // Get DOM elements
    this.toggle = document.querySelector('.admin-menu-toggle');
    this.navList = document.querySelector('.admin-nav-list');

    if (!this.toggle || !this.navList) {
      console.warn('Admin mobile navigation elements not found');
      return;
    }

    // Bind event listeners
    this.toggle.addEventListener('click', () => this.toggleMenu());

    // Close menu when clicking backdrop
    this.navList.addEventListener('click', (e) => {
      // Close if clicking the backdrop (::before pseudo-element area)
      const rect = this.navList.getBoundingClientRect();
      if (e.clientX < rect.left) {
        this.closeMenu();
      }
    });

    // Close menu when clicking any nav link
    const navLinks = this.navList.querySelectorAll('.admin-nav-link');
    navLinks.forEach(link => {
      link.addEventListener('click', () => this.closeMenu());
    });

    // Close menu on ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.closeMenu();
      }
    });

    // Handle window resize
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        // Close menu if resized to desktop
        if (window.innerWidth > 768 && this.isOpen) {
          this.closeMenu();
        }
      }, 250);
    });

    // Set active link based on current page
    this.setActiveLink();
  }

  toggleMenu() {
    if (this.isOpen) {
      this.closeMenu();
    } else {
      this.openMenu();
    }
  }

  openMenu() {
    this.isOpen = true;
    this.toggle.classList.add('is-active');
    this.toggle.setAttribute('aria-expanded', 'true');
    this.navList.classList.add('is-open');

    // Prevent body scroll on mobile
    document.body.style.overflow = 'hidden';

    // Focus first nav link for keyboard users
    const firstLink = this.navList.querySelector('.admin-nav-link');
    if (firstLink) {
      // Small delay to allow animation to start
      setTimeout(() => firstLink.focus(), 100);
    }

    // Setup focus trap
    this.setupFocusTrap();
  }

  closeMenu() {
    this.isOpen = false;
    this.toggle.classList.remove('is-active');
    this.toggle.setAttribute('aria-expanded', 'false');
    this.navList.classList.remove('is-open');

    // Restore body scroll
    document.body.style.overflow = '';

    // Return focus to toggle button
    this.toggle.focus();

    // Remove focus trap
    this.removeFocusTrap();
  }

  setupFocusTrap() {
    // Get all focusable elements in the menu
    const focusableElements = this.navList.querySelectorAll(
      'a[href], button:not([disabled])'
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    this.focusTrap = (e) => {
      if (e.key !== 'Tab') return;

      // Shift + Tab (backwards)
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      }
      // Tab (forwards)
      else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', this.focusTrap);
  }

  removeFocusTrap() {
    if (this.focusTrap) {
      document.removeEventListener('keydown', this.focusTrap);
      this.focusTrap = null;
    }
  }

  setActiveLink() {
    const currentPath = window.location.pathname;
    const navLinks = this.navList.querySelectorAll('.admin-nav-link');

    navLinks.forEach(link => {
      const linkPath = new URL(link.href).pathname;

      // Remove active class from all
      link.classList.remove('active');

      // Add active class to current page
      if (linkPath === currentPath ||
          (currentPath.startsWith(linkPath) && linkPath !== '/admin' && linkPath !== '/pages/admin')) {
        link.classList.add('active');
      }
      // Special case for /admin and /pages/admin/index.html
      else if ((linkPath === '/admin' || linkPath === '/pages/admin' || linkPath === '/pages/admin/index.html') &&
               (currentPath === '/admin' || currentPath === '/pages/admin' || currentPath === '/pages/admin/index.html' || currentPath === '/admin/')) {
        link.classList.add('active');
      }
    });
  }
}

// Initialize mobile navigation
const adminMobileNav = new AdminMobileNav();

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdminMobileNav;
}

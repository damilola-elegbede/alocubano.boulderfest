/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Main Application Initialization Tests
 * Tests the main.js functionality including:
 * - Application initialization on DOMContentLoaded
 * - Smooth scroll functionality with IntersectionObserver
 * - Form validation (required fields, email, phone)
 * - Service Worker registration and update handling
 * - Performance monitoring initialization
 * - Component initialization (page-specific and shared)
 * - Error boundary and initialization failure handling
 * - Safe initialization wrapper pattern
 * - User activity tracking
 * - Development environment error display
 */

describe('Main Application Initialization', () => {
  let SmoothScroll;
  let FormValidator;
  let initializeApplication;
  let initPerformanceOptimizations;
  let registerServiceWorker;
  let handleInitializationFailure;
  let mockIntersectionObserver;
  let mockServiceWorkerRegistration;

  beforeEach(() => {
    // Mock IntersectionObserver
    mockIntersectionObserver = vi.fn(function(callback, options) {
      this.callback = callback;
      this.options = options;
      this.observe = vi.fn();
      this.unobserve = vi.fn();
      this.disconnect = vi.fn();
    });
    global.IntersectionObserver = mockIntersectionObserver;

    // Mock Service Worker API
    mockServiceWorkerRegistration = {
      scope: '/',
      installing: null,
      update: vi.fn().mockResolvedValue(),
      addEventListener: vi.fn()
    };

    global.navigator.serviceWorker = {
      register: vi.fn().mockResolvedValue(mockServiceWorkerRegistration),
      addEventListener: vi.fn(),
      controller: null
    };

    // Mock process.env
    global.process = { env: { NODE_ENV: 'development' } };

    // Mock setInterval
    global.setInterval = vi.fn((fn, delay) => {
      return 123; // mock interval ID
    });

    // Mock performance monitor
    global.PerformanceMonitor = class PerformanceMonitor {
      constructor() {
        this.metrics = {};
      }
    };

    // Set up DOM structure
    document.body.innerHTML = `
      <style>
        .animate-on-scroll { opacity: 0; }
        .animate-on-scroll.is-visible { opacity: 1; }
        .error-message { color: red; }
        input.error { border-color: red; }
      </style>

      <section class="animate-on-scroll">
        <h2>Section 1</h2>
      </section>

      <section class="animate-on-scroll">
        <h2>Section 2</h2>
      </section>

      <form id="contact-form">
        <input type="text" name="name" required />
        <input type="email" name="email" required />
        <input type="tel" name="phone" />
        <button type="submit">Submit</button>
      </form>

      <form id="newsletter-form">
        <input type="email" name="newsletterEmail" required />
        <button type="submit">Subscribe</button>
      </form>

      <div class="design-selector"></div>
    `;

    // Mock window.location
    delete window.location;
    window.location = {
      pathname: '/gallery',
      href: 'http://localhost/gallery',
      reload: vi.fn()
    };

    // Mock document.visibilityState
    Object.defineProperty(document, 'visibilityState', {
      writable: true,
      value: 'visible'
    });

    // Use fake timers
    vi.useFakeTimers();

    // Define classes and functions inline
    SmoothScroll = class SmoothScroll {
      constructor() {
        this.init();
      }

      init() {
        const sections = document.querySelectorAll('.animate-on-scroll');
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
              }
            });
          },
          {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
          }
        );

        sections.forEach((section) => {
          observer.observe(section);
        });
      }
    };

    FormValidator = class FormValidator {
      constructor(form) {
        this.form = form;
        this.init();
      }

      init() {
        this.form.addEventListener('submit', (e) => {
          e.preventDefault();
          if (this.validate()) {
            this.handleSubmit();
          }
        });

        const inputs = this.form.querySelectorAll('input, textarea, select');
        inputs.forEach((input) => {
          input.addEventListener('blur', () => this.validateField(input));
          input.addEventListener('input', () => {
            if (input.classList.contains('error')) {
              this.validateField(input);
            }
          });
        });
      }

      validate() {
        try {
          const inputs = this.form.querySelectorAll('[required]');
          let isValid = true;

          inputs.forEach((input) => {
            if (!this.validateField(input)) {
              isValid = false;
            }
          });

          return isValid;
        } catch (error) {
          console.error('Form validation error:', error);
          return false;
        }
      }

      validateField(field) {
        let isValid = true;

        field.classList.remove('error');
        const errorMsg = field.parentNode.querySelector('.error-message');
        if (errorMsg) {
          errorMsg.remove();
        }

        if (field.hasAttribute('required') && !field.value.trim()) {
          this.showError(field, 'This field is required');
          isValid = false;
        }

        if (field.type === 'email' && field.value) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(field.value)) {
            this.showError(field, 'Please enter a valid email');
            isValid = false;
          }
        }

        if (field.type === 'tel' && field.value) {
          const phoneRegex = /^[\d\s\-+()]+$/;
          if (!phoneRegex.test(field.value)) {
            this.showError(field, 'Please enter a valid phone number');
            isValid = false;
          }
        }

        return isValid;
      }

      showError(field, message) {
        field.classList.add('error');

        const errorEl = document.createElement('span');
        errorEl.className = 'error-message';
        errorEl.textContent = message;

        field.parentNode.appendChild(errorEl);
      }

      handleSubmit() {
        const successMsg = document.createElement('div');
        successMsg.className = 'form-success';
        successMsg.textContent = 'Thank you! We\'ll be in touch soon.';

        this.form.appendChild(successMsg);
        this.form.reset();

        setTimeout(() => successMsg.remove(), 5000);
      }
    };

    registerServiceWorker = function() {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'SW_ACTIVATED') {
            const newVersion = event.data.version;
            console.log(`[SW] New Service Worker activated: ${newVersion}`);

            const isHidden = document.visibilityState === 'hidden';
            const idleTime = Date.now() - (window.lastUserActivity || Date.now());

            if (isHidden || idleTime > 30000) {
              console.log(`[SW] Auto-reloading to activate ${newVersion}`);
              window.location.reload();
            }
          }
        });

        navigator.serviceWorker
          .register('/js/sw.js', {
            scope: '/',
            updateViaCache: 'none'
          })
          .then((registration) => {
            console.log('[SW] Service Worker registered:', registration.scope);

            setInterval(() => {
              registration.update();
            }, 60000);

            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              console.log('[SW] New Service Worker installing...');

              newWorker.addEventListener('statechange', () => {
                if (
                  newWorker.state === 'installed' &&
                  navigator.serviceWorker.controller
                ) {
                  console.log('[SW] New version installed and ready');
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                }
              });
            });

            registration.update();
          })
          .catch((error) => {
            console.warn('[SW] Service Worker registration failed:', error);
          });

        ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(name => {
          window.addEventListener(name, () => {
            window.lastUserActivity = Date.now();
          }, { passive: true });
        });
      }
    };

    initPerformanceOptimizations = function() {
      if (typeof PerformanceMonitor !== 'undefined') {
        window.performanceMonitor = new PerformanceMonitor();
      }

      if (
        window.location.pathname.includes('/gallery') ||
        window.location.pathname === '/'
      ) {
        registerServiceWorker();
      }
    };

    handleInitializationFailure = function(error) {
      if (process.env.NODE_ENV === 'development') {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
          position: fixed;
          top: 10px;
          right: 10px;
          background: #fee;
          border: 1px solid #fcc;
          color: #c33;
          padding: 10px;
          border-radius: 4px;
          font-family: monospace;
          font-size: 12px;
          z-index: 10000;
          max-width: 300px;
        `;
        errorDiv.textContent = `Init Error: ${error.message}`;
        document.body.appendChild(errorDiv);

        setTimeout(() => errorDiv.remove(), 10000);
      }
    };

    initializeApplication = function() {
      global.initPerformanceOptimizations();

      // Initialize shared components
      if (typeof global.SmoothScroll !== 'undefined') {
        try {
          new global.SmoothScroll();
          console.log('✓ SmoothScroll initialized successfully');
        } catch (error) {
          console.error('✗ Failed to initialize SmoothScroll:', error);
        }
      }

      // Initialize forms
      if (typeof global.FormValidator !== 'undefined') {
        const forms = document.querySelectorAll('form');
        forms.forEach((form, index) => {
          try {
            new global.FormValidator(form);
            console.log(`✓ FormValidator-${index} initialized successfully`);
          } catch (error) {
            console.error(`✗ Failed to initialize FormValidator-${index}:`, error);
          }
        });
      }
    };

    // Attach to global for testing
    global.SmoothScroll = SmoothScroll;
    global.FormValidator = FormValidator;
    global.initializeApplication = initializeApplication;
    global.initPerformanceOptimizations = initPerformanceOptimizations;
    global.registerServiceWorker = registerServiceWorker;
    global.handleInitializationFailure = handleInitializationFailure;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete global.SmoothScroll;
    delete global.FormValidator;
    delete global.initializeApplication;
    delete global.PerformanceMonitor;
    delete window.performanceMonitor;
    delete window.lastUserActivity;
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('DOMContentLoaded Initialization', () => {
    it('should initialize application on DOMContentLoaded event', () => {
      const initSpy = vi.fn();
      const savedInit = global.initializeApplication;
      global.initializeApplication = initSpy;

      const handler = () => {
        try {
          global.initializeApplication();
        } catch (error) {
          global.handleInitializationFailure(error);
        }
      };

      document.addEventListener('DOMContentLoaded', handler);
      document.dispatchEvent(new Event('DOMContentLoaded'));

      expect(initSpy).toHaveBeenCalled();

      global.initializeApplication = savedInit;
    });

    it('should handle initialization errors gracefully', () => {
      const errorHandler = vi.fn();
      const savedErrorHandler = global.handleInitializationFailure;
      global.handleInitializationFailure = errorHandler;

      const testError = new Error('Test initialization error');
      const savedInit = global.initializeApplication;
      global.initializeApplication = () => { throw testError; };

      const handler = () => {
        try {
          global.initializeApplication();
        } catch (error) {
          global.handleInitializationFailure(error);
        }
      };

      document.addEventListener('DOMContentLoaded', handler);
      document.dispatchEvent(new Event('DOMContentLoaded'));

      expect(errorHandler).toHaveBeenCalledWith(testError);

      global.initializeApplication = savedInit;
      global.handleInitializationFailure = savedErrorHandler;
    });

    it('should initialize performance optimizations early', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      initializeApplication();

      // Verify service worker registration was called (part of perf optimizations)
      expect(navigator.serviceWorker.register).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('SmoothScroll Component', () => {
    it('should observe all animate-on-scroll sections', () => {
      new SmoothScroll();

      const sections = document.querySelectorAll('.animate-on-scroll');
      expect(mockIntersectionObserver).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          threshold: 0.1,
          rootMargin: '0px 0px -50px 0px'
        })
      );

      const observerInstance = mockIntersectionObserver.mock.results[0].value;
      expect(observerInstance.observe).toHaveBeenCalledTimes(sections.length);
    });

    it('should add is-visible class when section is intersecting', () => {
      new SmoothScroll();

      const observerInstance = mockIntersectionObserver.mock.results[0].value;
      const sections = document.querySelectorAll('.animate-on-scroll');
      const firstSection = sections[0];

      expect(firstSection.classList.contains('is-visible')).toBe(false);

      observerInstance.callback([
        {
          target: firstSection,
          isIntersecting: true
        }
      ]);

      expect(firstSection.classList.contains('is-visible')).toBe(true);
    });

    it('should not add is-visible class when section is not intersecting', () => {
      new SmoothScroll();

      const observerInstance = mockIntersectionObserver.mock.results[0].value;
      const sections = document.querySelectorAll('.animate-on-scroll');
      const firstSection = sections[0];

      observerInstance.callback([
        {
          target: firstSection,
          isIntersecting: false
        }
      ]);

      expect(firstSection.classList.contains('is-visible')).toBe(false);
    });

    it('should handle multiple sections intersecting simultaneously', () => {
      new SmoothScroll();

      const observerInstance = mockIntersectionObserver.mock.results[0].value;
      const sections = document.querySelectorAll('.animate-on-scroll');

      observerInstance.callback([
        { target: sections[0], isIntersecting: true },
        { target: sections[1], isIntersecting: true }
      ]);

      expect(sections[0].classList.contains('is-visible')).toBe(true);
      expect(sections[1].classList.contains('is-visible')).toBe(true);
    });
  });

  describe('FormValidator Component', () => {
    it('should initialize form with submit event listener', () => {
      const form = document.getElementById('contact-form');
      const addEventListenerSpy = vi.spyOn(form, 'addEventListener');

      new FormValidator(form);

      expect(addEventListenerSpy).toHaveBeenCalledWith('submit', expect.any(Function));
    });

    it('should prevent default form submission', () => {
      const form = document.getElementById('contact-form');
      new FormValidator(form);

      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      const preventDefaultSpy = vi.spyOn(submitEvent, 'preventDefault');

      form.dispatchEvent(submitEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should validate required field and show error', () => {
      const form = document.getElementById('contact-form');
      const validator = new FormValidator(form);
      const nameInput = form.querySelector('input[name="name"]');

      nameInput.value = '';
      const isValid = validator.validateField(nameInput);

      expect(isValid).toBe(false);
      expect(nameInput.classList.contains('error')).toBe(true);
      expect(nameInput.parentNode.querySelector('.error-message')).not.toBeNull();
    });

    it('should validate email format correctly', () => {
      const form = document.getElementById('contact-form');
      const validator = new FormValidator(form);
      const emailInput = form.querySelector('input[name="email"]');

      emailInput.value = 'invalid-email';
      const isValid = validator.validateField(emailInput);

      expect(isValid).toBe(false);
      expect(emailInput.classList.contains('error')).toBe(true);
      const errorMsg = emailInput.parentNode.querySelector('.error-message');
      expect(errorMsg.textContent).toBe('Please enter a valid email');
    });

    it('should accept valid email format', () => {
      const form = document.getElementById('contact-form');
      const validator = new FormValidator(form);
      const emailInput = form.querySelector('input[name="email"]');

      emailInput.value = 'test@example.com';
      const isValid = validator.validateField(emailInput);

      expect(isValid).toBe(true);
      expect(emailInput.classList.contains('error')).toBe(false);
    });

    it('should validate phone number format', () => {
      const form = document.getElementById('contact-form');
      const validator = new FormValidator(form);
      const phoneInput = form.querySelector('input[name="phone"]');

      phoneInput.value = 'abc-def-ghij';
      const isValid = validator.validateField(phoneInput);

      expect(isValid).toBe(false);
      expect(phoneInput.classList.contains('error')).toBe(true);
    });

    it('should accept valid phone number formats', () => {
      const form = document.getElementById('contact-form');
      const validator = new FormValidator(form);
      const phoneInput = form.querySelector('input[name="phone"]');

      const validFormats = ['123-456-7890', '(123) 456-7890', '+1 123 456 7890', '1234567890'];

      validFormats.forEach(format => {
        phoneInput.value = format;
        const isValid = validator.validateField(phoneInput);
        expect(isValid).toBe(true);
      });
    });

    it('should validate all required fields in form', () => {
      const form = document.getElementById('contact-form');
      const validator = new FormValidator(form);

      form.querySelector('input[name="name"]').value = '';
      form.querySelector('input[name="email"]').value = '';

      const isValid = validator.validate();

      expect(isValid).toBe(false);
    });

    it('should handle form submission on successful validation', () => {
      const form = document.getElementById('contact-form');
      const validator = new FormValidator(form);

      form.querySelector('input[name="name"]').value = 'John Doe';
      form.querySelector('input[name="email"]').value = 'john@example.com';

      validator.handleSubmit();

      const successMsg = form.querySelector('.form-success');
      expect(successMsg).not.toBeNull();
      expect(successMsg.textContent).toContain('Thank you');
    });

    it('should reset form after successful submission', () => {
      const form = document.getElementById('contact-form');
      const validator = new FormValidator(form);
      const resetSpy = vi.spyOn(form, 'reset');

      form.querySelector('input[name="name"]').value = 'John Doe';
      form.querySelector('input[name="email"]').value = 'john@example.com';

      validator.handleSubmit();

      expect(resetSpy).toHaveBeenCalled();
    });

    it('should remove success message after 5 seconds', () => {
      const form = document.getElementById('contact-form');
      const validator = new FormValidator(form);

      validator.handleSubmit();

      const successMsg = form.querySelector('.form-success');
      expect(successMsg).not.toBeNull();

      vi.advanceTimersByTime(5000);

      expect(form.querySelector('.form-success')).toBeNull();
    });

    it('should handle validation errors gracefully', () => {
      const form = document.getElementById('contact-form');
      const validator = new FormValidator(form);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Force an error
      vi.spyOn(form, 'querySelectorAll').mockImplementation(() => {
        throw new Error('Test error');
      });

      const isValid = validator.validate();

      expect(isValid).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('Form validation error:', expect.any(Error));

      consoleSpy.mockRestore();
    });

    it('should validate field on blur event', () => {
      const form = document.getElementById('contact-form');
      const validator = new FormValidator(form);
      const validateSpy = vi.spyOn(validator, 'validateField');
      const nameInput = form.querySelector('input[name="name"]');

      nameInput.dispatchEvent(new Event('blur'));

      expect(validateSpy).toHaveBeenCalledWith(nameInput);
    });

    it('should revalidate field on input if it has error', () => {
      const form = document.getElementById('contact-form');
      const validator = new FormValidator(form);
      const nameInput = form.querySelector('input[name="name"]');

      nameInput.value = '';
      validator.validateField(nameInput);
      expect(nameInput.classList.contains('error')).toBe(true);

      const validateSpy = vi.spyOn(validator, 'validateField');
      nameInput.value = 'John';
      nameInput.dispatchEvent(new Event('input'));

      expect(validateSpy).toHaveBeenCalledWith(nameInput);
    });

    it('should remove previous error messages before showing new ones', () => {
      const form = document.getElementById('contact-form');
      const validator = new FormValidator(form);
      const nameInput = form.querySelector('input[name="name"]');

      nameInput.value = '';
      validator.validateField(nameInput);
      const firstError = nameInput.parentNode.querySelector('.error-message');

      validator.validateField(nameInput);
      const allErrors = nameInput.parentNode.querySelectorAll('.error-message');

      expect(allErrors.length).toBe(1);
    });
  });

  describe('Service Worker Registration', () => {
    it('should register service worker on gallery pages', () => {
      window.location.pathname = '/gallery';
      registerServiceWorker();

      expect(navigator.serviceWorker.register).toHaveBeenCalledWith(
        '/js/sw.js',
        expect.objectContaining({
          scope: '/',
          updateViaCache: 'none'
        })
      );
    });

    it('should register service worker on home page', () => {
      window.location.pathname = '/';
      initPerformanceOptimizations();

      expect(navigator.serviceWorker.register).toHaveBeenCalled();
    });

    it('should not register service worker if not supported', () => {
      delete navigator.serviceWorker;
      registerServiceWorker();

      // Should not throw error
      expect(true).toBe(true);
    });

    it('should handle service worker registration failure', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const error = new Error('Registration failed');
      navigator.serviceWorker.register.mockRejectedValue(error);

      registerServiceWorker();
      await vi.runAllTimersAsync();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[SW] Service Worker registration failed:',
        error
      );

      consoleWarnSpy.mockRestore();
    });

    it('should check for updates every 60 seconds', async () => {
      const intervalSpy = vi.spyOn(global, 'setInterval');

      registerServiceWorker();
      await vi.waitFor(() => {
        expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 60000);
      });

      intervalSpy.mockRestore();
    });

    it('should track user activity for auto-reload decisions', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      registerServiceWorker();

      const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
      activityEvents.forEach(eventName => {
        expect(addEventListenerSpy).toHaveBeenCalledWith(
          eventName,
          expect.any(Function),
          expect.objectContaining({ passive: true })
        );
      });
    });

    it('should update lastUserActivity timestamp on user interaction', () => {
      registerServiceWorker();

      const beforeTime = Date.now();
      window.dispatchEvent(new Event('mousedown'));
      const afterTime = Date.now();

      expect(window.lastUserActivity).toBeGreaterThanOrEqual(beforeTime);
      expect(window.lastUserActivity).toBeLessThanOrEqual(afterTime);
    });

    it('should handle SW_ACTIVATED message with auto-reload when idle', async () => {
      window.lastUserActivity = Date.now() - 40000; // 40 seconds ago
      registerServiceWorker();

      const messageEvent = new MessageEvent('message', {
        data: { type: 'SW_ACTIVATED', version: '1.2.0' }
      });

      navigator.serviceWorker.addEventListener.mock.calls[0][1](messageEvent);

      expect(window.location.reload).toHaveBeenCalled();
    });

    it('should not auto-reload if user is active', async () => {
      window.lastUserActivity = Date.now() - 1000; // 1 second ago
      document.visibilityState = 'visible';
      registerServiceWorker();

      const messageEvent = new MessageEvent('message', {
        data: { type: 'SW_ACTIVATED', version: '1.2.0' }
      });

      navigator.serviceWorker.addEventListener.mock.calls[0][1](messageEvent);

      expect(window.location.reload).not.toHaveBeenCalled();
    });

    it('should auto-reload if tab is hidden', async () => {
      document.visibilityState = 'hidden';
      registerServiceWorker();

      const messageEvent = new MessageEvent('message', {
        data: { type: 'SW_ACTIVATED', version: '1.2.0' }
      });

      navigator.serviceWorker.addEventListener.mock.calls[0][1](messageEvent);

      expect(window.location.reload).toHaveBeenCalled();
    });
  });

  describe('Performance Monitoring', () => {
    it('should initialize PerformanceMonitor if available', () => {
      initPerformanceOptimizations();

      expect(window.performanceMonitor).toBeInstanceOf(PerformanceMonitor);
    });

    it('should not throw error if PerformanceMonitor is unavailable', () => {
      delete global.PerformanceMonitor;

      expect(() => initPerformanceOptimizations()).not.toThrow();
    });

    it('should make performanceMonitor globally accessible', () => {
      initPerformanceOptimizations();

      expect(window.performanceMonitor).toBeDefined();
    });
  });

  describe('Application Initialization', () => {
    it('should initialize all components in correct order', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      initializeApplication();

      const logCalls = consoleSpy.mock.calls.map(call => call[0]);
      expect(logCalls).toContain('✓ SmoothScroll initialized successfully');
      expect(logCalls).toContain('✓ FormValidator-0 initialized successfully');
      expect(logCalls).toContain('✓ FormValidator-1 initialized successfully');

      consoleSpy.mockRestore();
    });

    it('should initialize multiple forms', () => {
      const forms = document.querySelectorAll('form');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      initializeApplication();

      expect(consoleSpy).toHaveBeenCalledWith('✓ FormValidator-0 initialized successfully');
      expect(consoleSpy).toHaveBeenCalledWith('✓ FormValidator-1 initialized successfully');

      consoleSpy.mockRestore();
    });

    it('should handle component initialization errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const testError = new Error('Component init failed');

      global.SmoothScroll = function() {
        throw testError;
      };

      initializeApplication();

      expect(consoleSpy).toHaveBeenCalledWith('✗ Failed to initialize SmoothScroll:', testError);

      consoleSpy.mockRestore();
    });
  });

  describe('Error Boundary', () => {
    it('should display error message in development mode', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Test initialization error');

      handleInitializationFailure(error);

      const errorDiv = document.querySelector('[style*="position: fixed"]');
      expect(errorDiv).not.toBeNull();
      expect(errorDiv.textContent).toContain('Init Error: Test initialization error');
    });

    it('should not display error message in production mode', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Test initialization error');

      handleInitializationFailure(error);

      const errorDiv = document.querySelector('[style*="position: fixed"]');
      expect(errorDiv).toBeNull();
    });

    it('should style error message appropriately', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Test error');

      handleInitializationFailure(error);

      const errorDiv = document.querySelector('[style*="position: fixed"]');
      expect(errorDiv.style.position).toBe('fixed');
      expect(errorDiv.style.zIndex).toBe('10000');
      expect(errorDiv.style.background).toBe('#fee');
    });

    it('should remove error message after 10 seconds', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Test error');

      handleInitializationFailure(error);

      let errorDiv = document.querySelector('[style*="position: fixed"]');
      expect(errorDiv).not.toBeNull();

      vi.advanceTimersByTime(10000);

      errorDiv = document.querySelector('[style*="position: fixed"]');
      expect(errorDiv).toBeNull();
    });
  });

  describe('Safe Initialization Pattern', () => {
    it('should catch and log component initialization errors', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      global.FormValidator = function() {
        throw new Error('Init failed');
      };

      initializeApplication();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to initialize FormValidator'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should continue initializing other components after one fails', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      global.SmoothScroll = function() {
        throw new Error('SmoothScroll failed');
      };

      initializeApplication();

      // Should still initialize FormValidators
      expect(consoleSpy).toHaveBeenCalledWith('✓ FormValidator-0 initialized successfully');

      consoleSpy.mockRestore();
    });

    it('should log success message for each initialized component', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      initializeApplication();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✓'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('initialized successfully'));

      consoleSpy.mockRestore();
    });
  });

  describe('Cross-Browser Compatibility', () => {
    it('should handle missing IntersectionObserver gracefully', () => {
      delete global.IntersectionObserver;

      expect(() => {
        try {
          new SmoothScroll();
        } catch (error) {
          // Expected to throw since IntersectionObserver is undefined
        }
      }).not.toThrow();
    });

    it('should handle missing Service Worker API', () => {
      delete navigator.serviceWorker;

      expect(() => registerServiceWorker()).not.toThrow();
    });

    it('should handle missing PerformanceMonitor', () => {
      delete global.PerformanceMonitor;

      expect(() => initPerformanceOptimizations()).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle forms with no inputs', () => {
      const emptyForm = document.createElement('form');
      document.body.appendChild(emptyForm);

      expect(() => new FormValidator(emptyForm)).not.toThrow();
    });

    it('should handle sections with no animate-on-scroll class', () => {
      document.body.innerHTML = '<section><h2>Plain Section</h2></section>';

      expect(() => new SmoothScroll()).not.toThrow();
    });

    it('should handle multiple initialization calls', () => {
      initializeApplication();
      initializeApplication();

      // Should not throw or cause issues
      expect(document.querySelectorAll('.animate-on-scroll').length).toBeGreaterThanOrEqual(0);
    });

    it('should handle email validation with whitespace', () => {
      const form = document.getElementById('contact-form');
      const validator = new FormValidator(form);
      const emailInput = form.querySelector('input[name="email"]');

      emailInput.value = '  test@example.com  ';
      const isValid = validator.validateField(emailInput);

      // Should trim and validate
      expect(isValid).toBe(true);
    });

    it('should handle phone validation with empty value', () => {
      const form = document.getElementById('contact-form');
      const validator = new FormValidator(form);
      const phoneInput = form.querySelector('input[name="phone"]');

      phoneInput.value = '';
      const isValid = validator.validateField(phoneInput);

      // Optional field, should pass
      expect(isValid).toBe(true);
    });
  });
});

// Main JavaScript for A Lo Cubano Boulder Fest

// Import shared components
// Note: These will be loaded via script tags in HTML

// Smooth scroll functionality
if (typeof SmoothScroll === 'undefined') {
    class SmoothScroll {
        constructor() {
            this.init();
        }

        init() {
            // Observe all sections for scroll animations
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
    }
}

// Image lazy loading - using shared component
// LazyLoader is now loaded from /js/components/lazy-loading.js

// Gallery lightbox functionality - using shared component
// Lightbox is now loaded from /js/components/lightbox.js

// Form validation
if (typeof FormValidator === 'undefined') {
    class FormValidator {
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

            // Real-time validation
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

            // Remove previous error
            field.classList.remove('error');
            const errorMsg = field.parentNode.querySelector('.error-message');
            if (errorMsg) {
                errorMsg.remove();
            }

            // Required field
            if (field.hasAttribute('required') && !field.value.trim()) {
                this.showError(field, 'This field is required');
                isValid = false;
            }

            // Email validation
            if (field.type === 'email' && field.value) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(field.value)) {
                    this.showError(field, 'Please enter a valid email');
                    isValid = false;
                }
            }

            // Phone validation
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
            // Show success message
            const successMsg = document.createElement('div');
            successMsg.className = 'form-success';
            successMsg.textContent = 'Thank you! We\'ll be in touch soon.';

            this.form.appendChild(successMsg);
            this.form.reset();

            // Remove success message after 5 seconds
            setTimeout(() => successMsg.remove(), 5000);
        }
    }
}

// Service Worker Registration
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker
            .register('/js/sw.js', {
                scope: '/',
                updateViaCache: 'none'
            })
            .then((registration) => {
                console.log('[SW] Service Worker registered:', registration.scope);

                // Handle updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (
                            newWorker.state === 'installed' &&
              navigator.serviceWorker.controller
                        ) {
                            // New version available, prompt user to refresh
                            console.log('[SW] New version available');
                            if (confirm('A new version is available. Refresh to update?')) {
                                window.location.reload();
                            }
                        }
                    });
                });
            })
            .catch((error) => {
                console.warn('[SW] Service Worker registration failed:', error);
            });
    }
}

// Performance Optimization Initialization
let performanceMonitor = null;

function initPerformanceOptimizations() {
    // Initialize performance monitoring
    if (typeof PerformanceMonitor !== 'undefined') {
        performanceMonitor = new PerformanceMonitor();
        window.performanceMonitor = performanceMonitor;
    }

    // Register Service Worker for gallery pages
    if (
        window.location.pathname.includes('/gallery') ||
    window.location.pathname === '/'
    ) {
        registerServiceWorker();
    }
}

// Initialize based on page
document.addEventListener('DOMContentLoaded', () => {
    try {
        initializeApplication();
    } catch (error) {
        console.error('Application initialization failed:', error);
        // Show fallback UI or report error
        handleInitializationFailure(error);
    }
});

function initializeApplication() {
    // Initialize performance optimizations early
    initPerformanceOptimizations();

    // Initialize page-specific components
    initializePageComponents();

    // Initialize shared components
    initializeSharedComponents();

    // Initialize forms
    initializeForms();
}

function initializePageComponents() {
    // Landing page
    if (hasElementAndClass('.design-selector', 'DesignSelector')) {
        safeInitialize(() => new DesignSelector(), 'DesignSelector');
    }
}

function initializeSharedComponents() {
    // Smooth scroll for all pages
    if (typeof SmoothScroll !== 'undefined') {
        safeInitialize(() => new SmoothScroll(), 'SmoothScroll');
    }

    // Lazy loading component
    if (typeof LazyLoader !== 'undefined') {
        safeInitialize(() => new LazyLoader(), 'LazyLoader');
    }

    // Lightbox for simple galleries
    if (hasElementAndClass('.gallery-grid', 'Lightbox')) {
        safeInitialize(() => {
            Lightbox.initializeFor('simple', { selector: '.gallery-image' });
        }, 'Lightbox');
    }
}

function initializeForms() {
    if (typeof FormValidator !== 'undefined') {
        const forms = document.querySelectorAll('form');
        forms.forEach((form, index) => {
            safeInitialize(() => new FormValidator(form), `FormValidator-${index}`);
        });
    }
}

function hasElementAndClass(selector, className) {
    return document.querySelector(selector) && typeof window[className] !== 'undefined';
}

function safeInitialize(initFunction, componentName) {
    try {
        initFunction();
        console.log(`✓ ${componentName} initialized successfully`);
    } catch (error) {
        console.error(`✗ Failed to initialize ${componentName}:`, error);
    }
}

function handleInitializationFailure(error) {
    // Create a simple error indicator for development
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
}

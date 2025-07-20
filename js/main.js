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

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        });

        sections.forEach(section => {
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
        inputs.forEach(input => {
            input.addEventListener('blur', () => this.validateField(input));
            input.addEventListener('input', () => {
                if (input.classList.contains('error')) {
                    this.validateField(input);
                }
            });
        });
    }

    validate() {
        const inputs = this.form.querySelectorAll('[required]');
        let isValid = true;

        inputs.forEach(input => {
            if (!this.validateField(input)) {
                isValid = false;
            }
        });

        return isValid;
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

// Initialize based on page
document.addEventListener('DOMContentLoaded', () => {
    // Landing page
    if (document.querySelector('.design-selector') && typeof DesignSelector !== 'undefined') {
        new DesignSelector();
    }

    // All pages
    if (typeof SmoothScroll !== 'undefined') {
        new SmoothScroll();
    }
    
    // Initialize shared lazy loading component
    if (typeof LazyLoader !== 'undefined') {
        new LazyLoader();
    }

    // Initialize shared lightbox component for simple galleries
    if (document.querySelector('.gallery-grid') && typeof Lightbox !== 'undefined') {
        Lightbox.initializeFor('simple', { selector: '.gallery-image' });
    }

    // Forms
    if (typeof FormValidator !== 'undefined') {
        document.querySelectorAll('form').forEach(form => {
            new FormValidator(form);
        });
    }
});
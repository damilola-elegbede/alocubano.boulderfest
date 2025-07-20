// Main JavaScript for A Lo Cubano Boulder Fest

// Design selection functionality for landing page
if (typeof DesignSelector === 'undefined') {
class DesignSelector {
    constructor() {
        this.designs = [
            { id: 'design1', name: 'Swiss Grid', description: 'Clean, structured, timeless' },
            { id: 'typographic', name: 'Typographic', description: 'Text-forward, artistic, expressive' }
        ];

        this.init();
    }

    init() {
        this.setupDesignPreviews();
        this.setupHoverEffects();
    }

    setupDesignPreviews() {
        const designCards = document.querySelectorAll('.design-card');

        designCards.forEach((card) => {
            card.addEventListener('click', (e) => {
                e.preventDefault();
                const designId = card.getAttribute('data-design');
                this.selectDesign(designId);
            });
        });
    }

    setupHoverEffects() {
        const designCards = document.querySelectorAll('.design-card');

        designCards.forEach(card => {
            card.addEventListener('mouseenter', () => {
                card.style.transform = 'translateY(-10px)';
            });

            card.addEventListener('mouseleave', () => {
                card.style.transform = 'translateY(0)';
            });
        });
    }

    selectDesign(designId) {
    // Store selected design
        localStorage.setItem('selectedDesign', designId);

        // Add exit animation
        document.body.classList.add('transitioning-out');

        // Navigate to the design's home page
        setTimeout(() => {
            window.location.href = `pages/${designId}/home.html`;
        }, 500);
    }
}
}

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

// Image lazy loading
if (typeof LazyLoader === 'undefined') {
class LazyLoader {
    constructor() {
        this.init();
    }

    init() {
        const images = document.querySelectorAll('img[data-src]');

        const imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.classList.add('loaded');
                    imageObserver.unobserve(img);
                }
            });
        }, {
            rootMargin: '50px 0px'
        });

        images.forEach(img => {
            imageObserver.observe(img);
        });
    }
}
}

// Gallery lightbox functionality
if (typeof Lightbox === 'undefined') {
class Lightbox {
    constructor() {
        this.currentIndex = 0;
        this.images = [];
        this.init();
    }

    init() {
        const galleryImages = document.querySelectorAll('.gallery-image');

        galleryImages.forEach((img, index) => {
            this.images.push(img.src);
            img.addEventListener('click', () => {
                this.open(index);
            });
        });

        // Close on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.querySelector('.lightbox')) {
                this.close();
            }
            if (e.key === 'ArrowLeft' && document.querySelector('.lightbox')) {
                this.previous();
            }
            if (e.key === 'ArrowRight' && document.querySelector('.lightbox')) {
                this.next();
            }
        });
    }

    open(index) {
        this.currentIndex = index;

        const lightbox = document.createElement('div');
        lightbox.className = 'lightbox';
        lightbox.innerHTML = `
      <button class="lightbox-close" aria-label="Close">&times;</button>
      <button class="lightbox-prev" aria-label="Previous">‹</button>
      <button class="lightbox-next" aria-label="Next">›</button>
      <img src="${this.images[index]}" alt="Gallery image" class="lightbox-image">
    `;

        document.body.appendChild(lightbox);
        document.body.style.overflow = 'hidden';

        // Add event listeners
        lightbox.querySelector('.lightbox-close').addEventListener('click', () => this.close());
        lightbox.querySelector('.lightbox-prev').addEventListener('click', () => this.previous());
        lightbox.querySelector('.lightbox-next').addEventListener('click', () => this.next());
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) {
                this.close();
            }
        });

        // Fade in
        setTimeout(() => lightbox.classList.add('is-open'), 10);
    }

    close() {
        const lightbox = document.querySelector('.lightbox');
        if (lightbox) {
            lightbox.classList.remove('is-open');
            setTimeout(() => {
                lightbox.remove();
                document.body.style.overflow = '';
            }, 300);
        }
    }

    previous() {
        this.currentIndex = (this.currentIndex - 1 + this.images.length) % this.images.length;
        this.updateImage();
    }

    next() {
        this.currentIndex = (this.currentIndex + 1) % this.images.length;
        this.updateImage();
    }

    updateImage() {
        const img = document.querySelector('.lightbox-image');
        if (img) {
            img.style.opacity = '0';
            setTimeout(() => {
                img.src = this.images[this.currentIndex];
                img.style.opacity = '1';
            }, 200);
        }
    }
}
}

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
    if (typeof LazyLoader !== 'undefined') {
        new LazyLoader();
    }

    // Gallery page
    if (document.querySelector('.gallery-grid') && typeof Lightbox !== 'undefined') {
        new Lightbox();
    }

    // Forms
    if (typeof FormValidator !== 'undefined') {
        document.querySelectorAll('form').forEach(form => {
            new FormValidator(form);
        });
    }
});
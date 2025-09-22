/**
 * Newsletter Signup Handler
 * Manages email list subscription form with Brevo integration
 */

import { createLogger } from './lib/logger.js';

const logger = createLogger('Newsletter');

class NewsletterSignup {
    constructor() {
        this.form = document.getElementById('newsletter-form');
        this.emailInput = document.getElementById('newsletter-email');
        this.submitButton = this.form?.querySelector('.newsletter-submit');
        this.errorElement = document.getElementById('newsletter-error');
        this.successElement = document.getElementById('newsletter-success');
        this.consentCheckbox = this.form?.querySelector('input[name="consent"]');

        this.isSubmitting = false;
        this.init();
    }

    init() {
        if (!this.form) {
            return;
        }

        // Form submission
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));

        // Real-time validation
        this.emailInput.addEventListener('blur', () => this.validateEmail());
        this.emailInput.addEventListener('input', () => {
            this.clearError();
            this.updateButtonState(); // Update button state as user types
        });

        // Checkbox gating for subscribe button
        this.consentCheckbox.addEventListener('change', () =>
            this.updateButtonState()
        );

        // Initialize button state
        this.updateButtonState();

        // Mobile optimizations
        this.setupMobileOptimizations();
    }

    updateButtonState() {
    // Enable/disable subscribe button based on both email validity and checkbox state
        const isEmailValid = this.isEmailValid();
        const isConsentGiven = this.consentCheckbox.checked;

        if (isEmailValid && isConsentGiven) {
            this.submitButton.disabled = false;
            this.submitButton.setAttribute('aria-disabled', 'false');
        } else {
            this.submitButton.disabled = true;
            this.submitButton.setAttribute('aria-disabled', 'true');
        }
    }

    isEmailValid() {
        const email = this.emailInput.value.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return email && emailRegex.test(email);
    }

    setupMobileOptimizations() {
    // Prevent zoom on iOS
        this.emailInput.setAttribute('inputmode', 'email');
        this.emailInput.setAttribute('autocorrect', 'off');
        this.emailInput.setAttribute('autocapitalize', 'off');

        // Handle virtual keyboard
        if ('visualViewport' in window) {
            window.visualViewport.addEventListener('resize', () => {
                this.handleKeyboardResize();
            });
        }
    }

    handleKeyboardResize() {
    // Scroll form into view when keyboard opens
        if (window.visualViewport.height < window.innerHeight * 0.75) {
            this.form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    async handleSubmit(e) {
        e.preventDefault();

        if (this.isSubmitting) {
            return;
        }

        // Clear previous messages
        this.clearError();
        this.hideSuccess();

        // Validate
        if (!this.validateEmail()) {
            return;
        }
        if (!this.validateConsent()) {
            return;
        }

        // Get form data
        const email = this.emailInput.value.trim();

        // Set loading state
        this.setLoadingState(true);

        try {
            const response = await fetch('/api/email/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email,
                    source: 'contact_page',
                    lists: ['newsletter'],
                    consentToMarketing: this.consentCheckbox.checked,
                    attributes: {
                        SIGNUP_PAGE: 'contact',
                        SIGNUP_DATE: new Date().toISOString()
                    }
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.handleSuccess(data);
            } else {
                this.handleError(
                    data.error || 'Subscription failed. Please try again.'
                );
            }
        } catch (error) {
            logger.error('Newsletter signup error:', error);

            // Enhanced error handling for preview environments
            const isPreviewEnvironment = window.location.hostname.includes('vercel.app') ||
                                        window.location.hostname.includes('preview');

            if (isPreviewEnvironment && (error.name === 'TypeError' || error.message.includes('fetch'))) {
                this.handleError(
                    'Preview deployment - newsletter signup simulated. Thank you for testing!'
                );
            } else {
                this.handleError(
                    'Network error. Please check your connection and try again.'
                );
            }
        } finally {
            this.setLoadingState(false);
        }
    }

    validateEmail() {
        const email = this.emailInput.value.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!email) {
            this.showError('Please enter your email address');
            return false;
        }

        if (!emailRegex.test(email)) {
            this.showError('Please enter a valid email address');
            return false;
        }

        return true;
    }

    validateConsent() {
        if (!this.consentCheckbox.checked) {
            this.showError('Please agree to receive marketing emails');
            return false;
        }
        return true;
    }

    setLoadingState(isLoading) {
        this.isSubmitting = isLoading;

        if (isLoading) {
            this.submitButton.setAttribute('aria-busy', 'true');
            this.submitButton.disabled = true;
            this.emailInput.readOnly = true;
            this.consentCheckbox.disabled = true;
        } else {
            this.submitButton.setAttribute('aria-busy', 'false');
            this.emailInput.readOnly = false;
            this.consentCheckbox.disabled = false;
            // Update button state based on checkbox instead of always enabling
            this.updateButtonState();
        }
    }

    handleSuccess() {
    // Clear form
        this.form.reset();

        // Show success message
        this.successElement.setAttribute('aria-hidden', 'false');
        this.successElement.style.display = 'flex';

        // Track event
        if (typeof gtag !== 'undefined') {
            gtag('event', 'newsletter_signup', {
                event_category: 'engagement',
                event_label: 'contact_page'
            });
        }

        // Hide success message after 10 seconds
        setTimeout(() => {
            this.hideSuccess();
        }, 10000);
    }

    handleError(message) {
        this.showError(message);

        // Set invalid state
        this.emailInput.setAttribute('aria-invalid', 'true');
        this.emailInput.parentElement.classList.add('error');
    }

    showError(message) {
        this.errorElement.textContent = message;
        this.errorElement.style.display = 'block';

        // Announce to screen readers
        this.errorElement.setAttribute('aria-live', 'assertive');
    }

    clearError() {
        this.errorElement.textContent = '';
        this.errorElement.style.display = 'none';
        this.emailInput.setAttribute('aria-invalid', 'false');
        this.emailInput.parentElement.classList.remove('error');
    }

    hideSuccess() {
        this.successElement.setAttribute('aria-hidden', 'true');
        this.successElement.style.display = 'none';
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new NewsletterSignup());
} else {
    new NewsletterSignup();
}

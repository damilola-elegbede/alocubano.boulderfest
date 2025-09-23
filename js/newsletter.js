/**
 * Newsletter Signup Handler
 * Manages email list subscription form with Brevo integration
 */

// Simple logger fallback when not using modules
const logger = {
    error: (...args) => console.error('[Newsletter]', ...args),
    info: (...args) => console.info('[Newsletter]', ...args),
    warn: (...args) => console.warn('[Newsletter]', ...args)
};

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

        // Real-time validation - Add null checks for DOM safety
        if (this.emailInput) {
            this.emailInput.addEventListener('blur', () => this.validateEmail());
            this.emailInput.addEventListener('input', () => {
                this.clearError();
                this.updateButtonState(); // Update button state as user types
            });
        }

        // Checkbox gating for subscribe button - Add null checks for DOM safety
        if (this.consentCheckbox) {
            this.consentCheckbox.addEventListener('change', () =>
                this.updateButtonState()
            );
        }

        // Initialize button state
        this.updateButtonState();

        // Mobile optimizations
        this.setupMobileOptimizations();
    }

    updateButtonState() {
    // Enable/disable subscribe button based on both email validity and checkbox state
    // Add DOM safety guards for all elements
        const isEmailValid = this.isEmailValid();
        const isConsentGiven = this.consentCheckbox?.checked;

        if (this.submitButton) {
            if (isEmailValid && isConsentGiven) {
                this.submitButton.disabled = false;
                this.submitButton.setAttribute('aria-disabled', 'false');
            } else {
                this.submitButton.disabled = true;
                this.submitButton.setAttribute('aria-disabled', 'true');
            }
        }
    }

    isEmailValid() {
        if (!this.emailInput) return false;
        const email = this.emailInput.value.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return email && emailRegex.test(email);
    }

    setupMobileOptimizations() {
    // Prevent zoom on iOS - Add DOM safety guard
        if (this.emailInput) {
            this.emailInput.setAttribute('inputmode', 'email');
            this.emailInput.setAttribute('autocorrect', 'off');
            this.emailInput.setAttribute('autocapitalize', 'off');
        }

        // Handle virtual keyboard - Add DOM safety guard
        if ('visualViewport' in window && this.form) {
            window.visualViewport.addEventListener('resize', () => {
                this.handleKeyboardResize();
            });
        }
    }

    handleKeyboardResize() {
    // Scroll form into view when keyboard opens - Add DOM safety guard
        if (this.form && window.visualViewport.height < window.innerHeight * 0.75) {
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
        const email = this.emailInput?.value.trim() || '';

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
                    consentToMarketing: this.consentCheckbox?.checked || false,
                    attributes: {
                        SIGNUP_PAGE: 'contact',
                        SIGNUP_DATE: new Date().toISOString()
                    }
                })
            });

            const data = await response.json();

            if (response.ok) {
                // Check if it's a preview mode response
                if (data.subscriber?.status === 'preview') {
                    this.handleSuccess('🎉 Preview Mode: Subscription simulated successfully!');
                } else {
                    this.handleSuccess();
                }
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
        if (!this.emailInput) return false;
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
        if (!this.consentCheckbox?.checked) {
            this.showError('Please agree to receive marketing emails');
            return false;
        }
        return true;
    }

    setLoadingState(isLoading) {
        this.isSubmitting = isLoading;

        if (isLoading) {
            if (this.submitButton) {
                this.submitButton.setAttribute('aria-busy', 'true');
                this.submitButton.disabled = true;
            }
            if (this.emailInput) {
                this.emailInput.readOnly = true;
            }
            if (this.consentCheckbox) {
                this.consentCheckbox.disabled = true;
            }
        } else {
            if (this.submitButton) {
                this.submitButton.setAttribute('aria-busy', 'false');
            }
            if (this.emailInput) {
                this.emailInput.readOnly = false;
            }
            if (this.consentCheckbox) {
                this.consentCheckbox.disabled = false;
            }
            // Update button state based on checkbox instead of always enabling
            this.updateButtonState();
        }
    }

    handleSuccess(customMessage = null) {
    // Clear form
        if (this.form) {
            this.form.reset();
        }

        // Reset button state after form reset
        this.updateButtonState();

        // Show popup notification
        const message = customMessage || '🎉 Welcome to the A Lo Cubano family! Check your email to confirm your subscription.';
        this.showPopup('success', message);

        // Show inline success message as well
        if (this.successElement) {
            this.successElement.setAttribute('aria-hidden', 'false');
            this.successElement.style.display = 'flex';
        }

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

        // Show popup notification for error
        this.showPopup('error', message);

        // Set invalid state
        if (this.emailInput) {
            this.emailInput.setAttribute('aria-invalid', 'true');
            this.emailInput.parentElement?.classList.add('error');
        }
    }

    showError(message) {
        if (this.errorElement) {
            this.errorElement.textContent = message;
            this.errorElement.style.display = 'block';

            // Announce to screen readers
            this.errorElement.setAttribute('aria-live', 'assertive');
        }
    }

    clearError() {
        if (this.errorElement) {
            this.errorElement.textContent = '';
            this.errorElement.style.display = 'none';
        }
        if (this.emailInput) {
            this.emailInput.setAttribute('aria-invalid', 'false');
            this.emailInput.parentElement?.classList.remove('error');
        }
    }

    hideSuccess() {
        if (this.successElement) {
            this.successElement.setAttribute('aria-hidden', 'true');
            this.successElement.style.display = 'none';
        }
    }

    showPopup(type, message) {
        // Remove any existing popup
        const existingPopup = document.querySelector('.newsletter-popup');
        if (existingPopup) {
            existingPopup.remove();
        }

        // Create popup element
        const popup = document.createElement('div');
        popup.className = `newsletter-popup newsletter-popup--${type}`;
        popup.setAttribute('role', 'alert');
        popup.setAttribute('aria-live', 'polite');

        // Create popup content
        const icon = type === 'success' ? '✓' : '⚠';
        popup.innerHTML = `
            <div class="newsletter-popup__icon">${icon}</div>
            <div class="newsletter-popup__message">${message}</div>
            <button class="newsletter-popup__close" aria-label="Close notification">×</button>
        `;

        // Add to page
        document.body.appendChild(popup);

        // Trigger animation
        requestAnimationFrame(() => {
            popup.classList.add('newsletter-popup--visible');
        });

        // Handle close button
        const closeBtn = popup.querySelector('.newsletter-popup__close');
        closeBtn?.addEventListener('click', () => {
            this.closePopup(popup);
        });

        // Auto-close after 8 seconds
        setTimeout(() => {
            this.closePopup(popup);
        }, 8000);

        // Close on click outside
        popup.addEventListener('click', (e) => {
            if (e.target === popup) {
                this.closePopup(popup);
            }
        });
    }

    closePopup(popup) {
        if (popup) {
            popup.classList.remove('newsletter-popup--visible');
            setTimeout(() => {
                popup.remove();
            }, 300);
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new NewsletterSignup());
} else {
    new NewsletterSignup();
}

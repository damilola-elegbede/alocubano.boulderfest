/**
 * Loading State Manager
 * Manages loading states with accessibility and user feedback
 */

class LoadingStateManager {
    constructor() {
        this.activeLoaders = new Set();
        this.overlayElement = null;
        this.loadingQueue = [];
        this.minDisplayTime = 500; // Minimum time to show loader to prevent flashing
        this.maxDisplayTime = 30000; // Maximum time before auto-hide (30 seconds)

        this.defaultMessages = {
            payment: 'Processing payment...',
            inventory: 'Checking availability...',
            form: 'Validating information...',
            session: 'Creating checkout session...',
            generic: 'Loading...'
        };
    }

    show(message = 'Loading...', type = 'generic', options = {}) {
        const loaderId = this.generateLoaderId();
        const loader = {
            id: loaderId,
            message: message || this.defaultMessages[type] || this.defaultMessages.generic,
            type,
            startTime: Date.now(),
            options: {
                cancellable: false,
                showProgress: false,
                timeout: this.maxDisplayTime,
                ...options
            }
        };

        this.activeLoaders.add(loader);
        this.updateDisplay();

        // Auto-hide after timeout
        setTimeout(() => {
            this.hide(loaderId);
        }, loader.options.timeout);

        return loaderId;
    }

    hide(loaderId) {
        const loader = Array.from(this.activeLoaders).find(l => l.id === loaderId);
        if (!loader) {
            return;
        }

        const displayTime = Date.now() - loader.startTime;

        if (displayTime < this.minDisplayTime) {
            // Wait for minimum display time
            setTimeout(() => {
                this.hideImmediate(loaderId);
            }, this.minDisplayTime - displayTime);
        } else {
            this.hideImmediate(loaderId);
        }
    }

    hideImmediate(loaderId) {
        this.activeLoaders = new Set(
            Array.from(this.activeLoaders).filter(l => l.id !== loaderId)
        );
        this.updateDisplay();
    }

    hideAll() {
        this.activeLoaders.clear();
        this.updateDisplay();
    }

    generateLoaderId() {
        return `loader_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    }

    updateDisplay() {
        if (this.activeLoaders.size === 0) {
            this.hideOverlay();
        } else {
            this.showOverlay();
        }
    }

    showOverlay() {
        if (!this.overlayElement) {
            this.createOverlay();
        }

        const primaryLoader = Array.from(this.activeLoaders)[0]; // Show first/primary loader
        this.updateOverlayContent(primaryLoader);

        if (!this.overlayElement.classList.contains('visible')) {
            this.overlayElement.classList.add('visible');
            document.body.classList.add('loading-active');

            // Announce to screen readers
            this.announceToScreenReader(primaryLoader.message);
        }
    }

    hideOverlay() {
        if (this.overlayElement && this.overlayElement.classList.contains('visible')) {
            this.overlayElement.classList.remove('visible');
            document.body.classList.remove('loading-active');

            // Announce completion to screen readers
            this.announceToScreenReader('Loading complete');

            // Remove overlay after animation
            setTimeout(() => {
                if (this.overlayElement && this.activeLoaders.size === 0) {
                    this.overlayElement.remove();
                    this.overlayElement = null;
                }
            }, 300);
        }
    }

    createOverlay() {
        this.overlayElement = document.createElement('div');
        this.overlayElement.className = 'payment-loading-overlay';
        this.overlayElement.setAttribute('role', 'dialog');
        this.overlayElement.setAttribute('aria-modal', 'true');
        this.overlayElement.setAttribute('aria-labelledby', 'loading-message');

        this.overlayElement.innerHTML = `
      <div class="loading-content">
        <div class="loading-spinner" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" 
                    stroke-width="4" stroke-dasharray="80" stroke-dashoffset="60">
              <animateTransform attributeName="transform" type="rotate" 
                              values="0 20 20;360 20 20" dur="1s" repeatCount="indefinite"/>
            </circle>
          </svg>
        </div>
        
        <div id="loading-message" class="loading-message" aria-live="polite" aria-atomic="true">
          Loading...
        </div>
        
        <div class="loading-progress" style="display: none;">
          <div class="progress-bar">
            <div class="progress-fill"></div>
          </div>
          <div class="progress-text">0%</div>
        </div>
        
        <button type="button" class="loading-cancel" style="display: none;" aria-label="Cancel loading">
          Cancel
        </button>
      </div>
    `;

        document.body.appendChild(this.overlayElement);

        // Handle cancel button
        const cancelBtn = this.overlayElement.querySelector('.loading-cancel');
        cancelBtn.addEventListener('click', () => {
            this.handleCancel();
        });

        // Handle escape key
        this.overlayElement.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.handleCancel();
            }
        });

        // Trap focus within overlay
        this.setupFocusTrap();
    }

    updateOverlayContent(loader) {
        if (!this.overlayElement) {
            return;
        }

        const messageEl = this.overlayElement.querySelector('#loading-message');
        const cancelBtn = this.overlayElement.querySelector('.loading-cancel');
        const progressContainer = this.overlayElement.querySelector('.loading-progress');

        // Update message
        if (messageEl) {
            messageEl.textContent = loader.message;
        }

        // Show/hide cancel button
        if (cancelBtn) {
            cancelBtn.style.display = loader.options.cancellable ? 'block' : 'none';
        }

        // Show/hide progress bar
        if (progressContainer) {
            progressContainer.style.display = loader.options.showProgress ? 'block' : 'none';
        }

        // Update progress if provided
        if (loader.options.progress !== undefined) {
            this.updateProgress(loader.options.progress);
        }
    }

    updateProgress(progress) {
        if (!this.overlayElement) {
            return;
        }

        const progressFill = this.overlayElement.querySelector('.progress-fill');
        const progressText = this.overlayElement.querySelector('.progress-text');

        if (progressFill) {
            progressFill.style.width = `${Math.max(0, Math.min(100, progress))}%`;
        }

        if (progressText) {
            progressText.textContent = `${Math.round(progress)}%`;
        }
    }

    handleCancel() {
        const cancellableLoaders = Array.from(this.activeLoaders)
            .filter(loader => loader.options.cancellable);

        if (cancellableLoaders.length > 0) {
            // Dispatch cancel events
            cancellableLoaders.forEach(loader => {
                document.dispatchEvent(new CustomEvent('loading-cancelled', {
                    detail: { loaderId: loader.id, type: loader.type }
                }));
            });

            // Hide all cancellable loaders
            cancellableLoaders.forEach(loader => {
                this.hideImmediate(loader.id);
            });
        }
    }

    setupFocusTrap() {
        if (!this.overlayElement) {
            return;
        }

        const focusableElements = this.overlayElement.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length === 0) {
            return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        this.overlayElement.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                if (e.shiftKey) {
                    if (document.activeElement === firstElement) {
                        e.preventDefault();
                        lastElement.focus();
                    }
                } else {
                    if (document.activeElement === lastElement) {
                        e.preventDefault();
                        firstElement.focus();
                    }
                }
            }
        });

        // Focus first element
        firstElement.focus();
    }

    announceToScreenReader(message) {
    // Create announcement element
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'assertive');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.className = 'sr-only';
        announcement.textContent = message;

        document.body.appendChild(announcement);

        // Remove after announcement
        setTimeout(() => {
            if (announcement.parentNode) {
                document.body.removeChild(announcement);
            }
        }, 1000);
    }

    // Button-specific loading states
    setButtonLoading(button, isLoading, options = {}) {
        if (!button) {
            return;
        }

        const originalText = button.dataset.originalText || button.textContent;
        const loadingText = options.loadingText || 'Loading...';

        if (isLoading) {
            // Store original state
            button.dataset.originalText = originalText;
            button.dataset.originalDisabled = button.disabled;

            // Set loading state
            button.disabled = true;
            button.classList.add('loading');
            button.setAttribute('aria-busy', 'true');

            // Update text and add spinner
            const spinner = this.createButtonSpinner();
            button.innerHTML = `${spinner} ${loadingText}`;

        } else {
            // Restore original state
            button.disabled = button.dataset.originalDisabled === 'true';
            button.classList.remove('loading');
            button.setAttribute('aria-busy', 'false');
            button.textContent = originalText;

            // Clean up data attributes
            delete button.dataset.originalText;
            delete button.dataset.originalDisabled;
        }
    }

    createButtonSpinner() {
        return `<svg class="button-spinner" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" 
              stroke-width="2" stroke-dasharray="24" stroke-dashoffset="18">
        <animateTransform attributeName="transform" type="rotate" 
                        values="0 8 8;360 8 8" dur="0.8s" repeatCount="indefinite"/>
      </circle>
    </svg>`;
    }

    // Form-specific loading states
    setFormLoading(form, isLoading, options = {}) {
        if (!form) {
            return;
        }

        const submitButton = form.querySelector('[type="submit"]');
        const inputs = form.querySelectorAll('input, select, textarea');

        if (isLoading) {
            form.classList.add('form-loading');
            inputs.forEach(input => {
                input.disabled = true;
            });

            if (submitButton) {
                this.setButtonLoading(submitButton, true, options);
            }

        } else {
            form.classList.remove('form-loading');
            inputs.forEach(input => {
                input.disabled = false;
            });

            if (submitButton) {
                this.setButtonLoading(submitButton, false);
            }
        }
    }

    // Utility methods
    isLoading(loaderId) {
        return Array.from(this.activeLoaders).some(loader => loader.id === loaderId);
    }

    hasActiveLoaders() {
        return this.activeLoaders.size > 0;
    }

    getActiveLoaders() {
        return Array.from(this.activeLoaders);
    }

    // Cleanup
    destroy() {
        this.hideAll();

        if (this.overlayElement) {
            this.overlayElement.remove();
            this.overlayElement = null;
        }

        document.body.classList.remove('loading-active');
    }
}

export { LoadingStateManager };
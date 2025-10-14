/**
 * Error Notification System
 * Provides user-friendly error notifications for network and system errors
 */

class ErrorNotifier {
    constructor() {
        this.container = null;
        this.activeToasts = new Set();
        this.maxToasts = 3;
        // Only setup container in browser environment
        if (typeof document !== 'undefined') {
            this.setupContainer();
        }
    }

    setupContainer() {
        // Create toast container if it doesn't exist
        if (!this.container && typeof document !== 'undefined') {
            this.container = document.createElement('div');
            this.container.id = 'error-toast-container';
            this.container.setAttribute('role', 'region');
            this.container.setAttribute('aria-label', 'Notifications');
            this.container.style.cssText = `
                position: fixed;
                bottom: var(--space-xl, 24px);
                right: var(--space-xl, 24px);
                z-index: 10000;
                display: flex;
                flex-direction: column;
                gap: var(--space-md, 12px);
                max-width: 400px;
                pointer-events: none;
            `;

            // Mobile positioning
            const mobileStyles = document.createElement('style');
            mobileStyles.textContent = `
                @media (max-width: 768px) {
                    #error-toast-container {
                        bottom: var(--space-md, 12px);
                        right: var(--space-md, 12px);
                        left: var(--space-md, 12px);
                        max-width: none;
                    }
                }
            `;
            document.head.appendChild(mobileStyles);

            document.body.appendChild(this.container);
        }
    }

    /**
     * Show error notification
     * @param {string} message - Error message to display
     * @param {Object} options - Configuration options
     * @param {string} options.type - Error type: 'network', 'validation', 'system'
     * @param {number} options.duration - Duration in ms (0 = manual dismiss)
     * @param {boolean} options.dismissible - Whether user can dismiss
     * @param {Function} options.onRetry - Optional retry callback
     */
    show(message, options = {}) {
        // Return early if not in browser environment
        if (typeof document === 'undefined' || !this.container) {
            console.warn('ErrorNotifier: DOM not available, logging message:', message);
            return null;
        }

        const {
            type = 'network',
            duration = 5000,
            dismissible = true,
            onRetry = null
        } = options;

        // Limit number of concurrent toasts
        if (this.activeToasts.size >= this.maxToasts) {
            // Remove oldest toast
            const oldestToast = Array.from(this.activeToasts)[0];
            this.dismiss(oldestToast);
        }

        // Create toast element
        const toast = document.createElement('div');
        toast.className = `error-toast error-toast-${type}`;
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');
        toast.style.cssText = `
            background: var(--color-surface, #ffffff);
            border-left: 4px solid ${this.getColorForType(type)};
            padding: var(--space-md, 12px) var(--space-lg, 16px);
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            display: flex;
            align-items: flex-start;
            gap: var(--space-md, 12px);
            pointer-events: auto;
            animation: slideInRight 0.3s ease-out;
            max-width: 100%;
        `;

        // Icon
        const icon = document.createElement('span');
        icon.setAttribute('aria-hidden', 'true');
        icon.style.cssText = 'font-size: 20px; line-height: 1; flex-shrink: 0;';
        icon.textContent = this.getIconForType(type);
        toast.appendChild(icon);

        // Message
        const messageEl = document.createElement('div');
        messageEl.style.cssText = 'flex: 1; font-size: 14px; line-height: 1.5;';
        messageEl.textContent = message;
        toast.appendChild(messageEl);

        // Actions container
        const actions = document.createElement('div');
        actions.style.cssText = 'display: flex; gap: var(--space-sm, 8px); flex-shrink: 0;';

        // Retry button
        if (onRetry) {
            const retryBtn = document.createElement('button');
            retryBtn.textContent = 'Retry';
            retryBtn.setAttribute('aria-label', 'Retry action');
            retryBtn.style.cssText = `
                background: none;
                border: none;
                color: var(--color-blue, #0066cc);
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                padding: 0;
                text-decoration: underline;
                min-height: 44px;
                min-width: 44px;
            `;
            retryBtn.onclick = () => {
                this.dismiss(toast);
                onRetry();
            };
            actions.appendChild(retryBtn);
        }

        // Dismiss button
        if (dismissible) {
            const dismissBtn = document.createElement('button');
            dismissBtn.textContent = '×';
            dismissBtn.setAttribute('aria-label', 'Dismiss notification');
            dismissBtn.style.cssText = `
                background: none;
                border: none;
                color: var(--color-text-secondary, #666);
                font-size: 24px;
                line-height: 1;
                cursor: pointer;
                padding: 0;
                min-height: 44px;
                min-width: 44px;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            dismissBtn.onclick = () => this.dismiss(toast);
            actions.appendChild(dismissBtn);
        }

        toast.appendChild(actions);

        // Add animation styles
        if (!document.getElementById('error-toast-animations')) {
            const animationStyles = document.createElement('style');
            animationStyles.id = 'error-toast-animations';
            animationStyles.textContent = `
                @keyframes slideInRight {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                @keyframes slideOutRight {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(animationStyles);
        }

        // Add to container
        this.container.appendChild(toast);
        this.activeToasts.add(toast);

        // Auto-dismiss
        if (duration > 0) {
            setTimeout(() => this.dismiss(toast), duration);
        }

        return toast;
    }

    dismiss(toast) {
        if (!toast || !this.activeToasts.has(toast)) {
            return;
        }

        // Animate out
        toast.style.animation = 'slideOutRight 0.3s ease-in';

        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
            this.activeToasts.delete(toast);
        }, 300);
    }

    dismissAll() {
        Array.from(this.activeToasts).forEach(toast => this.dismiss(toast));
    }

    getColorForType(type) {
        const colors = {
            network: '#ff6b6b',
            validation: '#ffa500',
            system: '#ff6b6b',
            success: '#51cf66'
        };
        return colors[type] || colors.system;
    }

    getIconForType(type) {
        const icons = {
            network: '📡',
            validation: '⚠️',
            system: '❌',
            success: '✅'
        };
        return icons[type] || icons.system;
    }

    /**
     * Show network error notification
     */
    showNetworkError(message = 'Network connection lost. Please check your internet connection.', onRetry = null) {
        return this.show(message, {
            type: 'network',
            duration: 0, // Manual dismiss for network errors
            dismissible: true,
            onRetry
        });
    }

    /**
     * Show validation error notification
     */
    showValidationError(message) {
        return this.show(message, {
            type: 'validation',
            duration: 5000,
            dismissible: true
        });
    }

    /**
     * Show success notification
     */
    showSuccess(message) {
        return this.show(message, {
            type: 'success',
            duration: 3000,
            dismissible: true
        });
    }
}

// Create singleton instance lazily (only in browser environment)
let errorNotifierInstance = null;

function getErrorNotifier() {
    if (!errorNotifierInstance && typeof document !== 'undefined') {
        errorNotifierInstance = new ErrorNotifier();
    }
    return errorNotifierInstance;
}

// Export for use in modules
const errorNotifier = new Proxy({}, {
    get(target, prop) {
        const instance = getErrorNotifier();
        if (!instance) {
            // Return no-op function if not in browser
            return typeof target[prop] === 'function' ? () => {} : undefined;
        }
        return typeof instance[prop] === 'function'
            ? instance[prop].bind(instance)
            : instance[prop];
    }
});

export default errorNotifier;

// Also expose globally for non-module scripts (browser only)
if (typeof window !== 'undefined') {
    window.errorNotifier = errorNotifier;
}

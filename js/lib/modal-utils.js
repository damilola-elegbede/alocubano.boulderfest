/**
 * Modal Utilities
 * Provides accessible modal dialogs to replace alert() and confirm() calls
 */

import { createLogger } from './logger.js';

const logger = createLogger('ModalUtils');

/**
 * Modal types
 */
const MODAL_TYPES = {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    SUCCESS: 'success',
    CONFIRM: 'confirm'
};

/**
 * Create modal backdrop
 */
function createModalBackdrop() {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('role', 'presentation');
    backdrop.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: var(--z-modal-backdrop, 1040);
    opacity: 0;
    transition: opacity 0.3s ease;
  `;
    return backdrop;
}

/**
 * Create modal dialog
 */
function createModalDialog(type, title, message, options = {}) {
    const {
        confirmText = 'OK',
        cancelText = 'Cancel',
        showCancel = false,
        className = ''
    } = options;

    const modal = document.createElement('div');
    modal.className = `modal modal--${type} ${className}`;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'modal-title');
    modal.setAttribute('aria-describedby', 'modal-message');
    modal.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0.9);
    background: var(--color-surface-elevated, #ffffff);
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    max-width: 400px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    z-index: var(--z-modal, 1050);
    opacity: 0;
    transition: all 0.3s ease;
    padding: 24px;
    border: 2px solid var(--color-border, #e0e0e0);
  `;

    // Icon for modal type
    const iconMap = {
        [MODAL_TYPES.INFO]: '🛈',
        [MODAL_TYPES.WARNING]: '⚠',
        [MODAL_TYPES.ERROR]: '✕',
        [MODAL_TYPES.SUCCESS]: '✓',
        [MODAL_TYPES.CONFIRM]: '❓'
    };

    const icon = iconMap[type] || iconMap[MODAL_TYPES.INFO];

    modal.innerHTML = `
    <div class="modal-header" style="display: flex; align-items: center; margin-bottom: 16px;">
      <span class="modal-icon" style="font-size: 24px; margin-right: 12px;" aria-hidden="true">${icon}</span>
      <h2 id="modal-title" style="margin: 0; color: var(--color-text-primary, #000000); font-size: 18px; font-weight: 600;">${escapeHtml(title)}</h2>
    </div>
    <div id="modal-message" style="margin-bottom: 24px; color: var(--color-text-secondary, #666666); line-height: 1.5;">
      ${escapeHtml(message).replace(/\n/g, '<br>')}
    </div>
    <div class="modal-actions" style="display: flex; gap: 12px; justify-content: flex-end;">
      ${showCancel ? `<button type="button" class="modal__cancel" style="
        padding: 8px 16px;
        border: 2px solid var(--color-border, #e0e0e0);
        background: transparent;
        color: var(--color-text-primary, #000000);
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s ease;
      ">${escapeHtml(cancelText)}</button>` : ''}
      <button type="button" class="modal__confirm" style="
        padding: 8px 16px;
        border: 2px solid var(--color-primary, #d4af37);
        background: var(--color-primary, #d4af37);
        color: var(--color-white, #ffffff);
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        transition: all 0.2s ease;
      ">${escapeHtml(confirmText)}</button>
    </div>
  `;

    return modal;
}

/**
 * HTML escaping function
 */
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') {
        return '';
    }
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Show modal dialog
 */
function showModal(type, title, message, options = {}) {
    return new Promise((resolve) => {
    // Remove any existing modals
        const existingModals = document.querySelectorAll('.modal-backdrop, .modal');
        existingModals.forEach(modal => modal.remove());

        const backdrop = createModalBackdrop();
        const modal = createModalDialog(type, title, message, options);

        // Add to DOM
        document.body.appendChild(backdrop);
        document.body.appendChild(modal);

        // Focus management
        const previousFocus = document.activeElement;
        const confirmButton = modal.querySelector('.modal__confirm');
        const cancelButton = modal.querySelector('.modal__cancel');

        // Animate in
        requestAnimationFrame(() => {
            backdrop.style.opacity = '1';
            modal.style.opacity = '1';
            modal.style.transform = 'translate(-50%, -50%) scale(1)';
        });

        // Focus the first button
        setTimeout(() => {
            if (cancelButton) {
                cancelButton.focus();
            } else {
                confirmButton.focus();
            }
        }, 100);

        // Handle modal close
        function closeModal(result) {
            backdrop.style.opacity = '0';
            modal.style.opacity = '0';
            modal.style.transform = 'translate(-50%, -50%) scale(0.9)';

            setTimeout(() => {
                backdrop.remove();
                modal.remove();
                // Restore focus
                if (previousFocus && document.body.contains(previousFocus)) {
                    previousFocus.focus();
                }
                resolve(result);
            }, 300);
        }

        // Event listeners
        confirmButton.addEventListener('click', () => closeModal(true));

        if (cancelButton) {
            cancelButton.addEventListener('click', () => closeModal(false));
        }

        // Backdrop click
        backdrop.addEventListener('click', () => closeModal(false));

        // Keyboard navigation
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeModal(false);
            } else if (e.key === 'Tab') {
                // Trap focus within modal
                const focusableElements = modal.querySelectorAll('button');
                const firstElement = focusableElements[0];
                const lastElement = focusableElements[focusableElements.length - 1];

                if (e.shiftKey && document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement.focus();
                } else if (!e.shiftKey && document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement.focus();
                }
            } else if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (document.activeElement === cancelButton) {
                    closeModal(false);
                } else {
                    closeModal(true);
                }
            }
        });

        logger.debug('Modal shown:', { type, title, message });
    });
}

/**
 * Show alert modal (replaces window.alert)
 */
export function showAlert(message, title = 'Information') {
    return showModal(MODAL_TYPES.INFO, title, message, {
        confirmText: 'OK',
        showCancel: false
    });
}

/**
 * Show confirm modal (replaces window.confirm)
 */
export function showConfirm(message, title = 'Confirm') {
    return showModal(MODAL_TYPES.CONFIRM, title, message, {
        confirmText: 'OK',
        cancelText: 'Cancel',
        showCancel: true
    });
}

/**
 * Show warning modal
 */
export function showWarning(message, title = 'Warning') {
    return showModal(MODAL_TYPES.WARNING, title, message, {
        confirmText: 'OK',
        showCancel: false
    });
}

/**
 * Show error modal
 */
export function showError(message, title = 'Error') {
    return showModal(MODAL_TYPES.ERROR, title, message, {
        confirmText: 'OK',
        showCancel: false
    });
}

/**
 * Show success modal
 */
export function showSuccess(message, title = 'Success') {
    return showModal(MODAL_TYPES.SUCCESS, title, message, {
        confirmText: 'OK',
        showCancel: false
    });
}

/**
 * Show custom modal
 */
export function showCustomModal(options) {
    const {
        type = MODAL_TYPES.INFO,
        title = 'Message',
        message = '',
        confirmText = 'OK',
        cancelText = 'Cancel',
        showCancel = false,
        className = ''
    } = options;

    return showModal(type, title, message, {
        confirmText,
        cancelText,
        showCancel,
        className
    });
}

// Export modal types for external use
export { MODAL_TYPES };

export default {
    showAlert,
    showConfirm,
    showWarning,
    showError,
    showSuccess,
    showCustomModal,
    MODAL_TYPES
};

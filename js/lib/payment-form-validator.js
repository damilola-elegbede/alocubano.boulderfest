/**
 * Payment Form Validator
 * Client-side validation for payment forms with accessibility features
 */
export class PaymentFormValidator {
    constructor() {
        this.rules = {
            name: {
                required: true,
                minLength: 2,
                maxLength: 100,
                pattern: /^[a-zA-Z\s\-'\.]+$/,
                message: 'Please enter a valid full name (letters, spaces, hyphens, and periods only)'
            },
            email: {
                required: true,
                maxLength: 254,
                pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: 'Please enter a valid email address'
            },
            phone: {
                required: false,
                pattern: /^[\+]?[1-9][\d]{9,15}$/,
                message: 'Please enter a valid phone number (10-16 digits)'
            },
            firstName: {
                required: true,
                minLength: 1,
                maxLength: 50,
                pattern: /^[a-zA-Z\s\-'\.]+$/,
                message: 'Please enter a valid first name'
            },
            lastName: {
                required: true,
                minLength: 1,
                maxLength: 50,
                pattern: /^[a-zA-Z\s\-'\.]+$/,
                message: 'Please enter a valid last name'
            }
        };

        this.isValidating = false;
    }

    validateField(field) {
        const fieldType = field.dataset.validate || field.name || field.id;
        const value = field.value.trim();
        const rule = this.rules[fieldType];

        if (!rule) {
            return { valid: true };
        }

        const errors = [];

        // Security validation first
        const securityResult = this.performSecurityValidation(fieldType, value);
        if (!securityResult.valid) {
            this.showFieldError(field, securityResult.message);
            return { valid: false, errors: [securityResult.message] };
        }

        // Required check
        if (rule.required && !value) {
            errors.push(`${this.getFieldLabel(field)} is required`);
        }

        if (value) {
            // Pattern check
            if (rule.pattern && !rule.pattern.test(value)) {
                errors.push(rule.message);
            }

            // Length checks
            if (rule.minLength && value.length < rule.minLength) {
                errors.push(`${this.getFieldLabel(field)} must be at least ${rule.minLength} characters`);
            }

            if (rule.maxLength && value.length > rule.maxLength) {
                errors.push(`${this.getFieldLabel(field)} must be no more than ${rule.maxLength} characters`);
            }
        }

        const isValid = errors.length === 0;

        if (isValid) {
            this.clearFieldError(field);
        } else {
            this.showFieldError(field, errors[0]);
        }

        return {
            valid: isValid,
            errors
        };
    }

    validateForm(form) {
        if (this.isValidating) {
            return { valid: false, message: 'Validation in progress' };
        }

        this.isValidating = true;
        const results = [];
        const fields = form.querySelectorAll('[data-validate], input[required], textarea[required]');

        try {
            fields.forEach(field => {
                const result = this.validateField(field);
                results.push({
                    field: field.name || field.id,
                    ...result
                });
            });

            const isFormValid = results.every(result => result.valid);
            const errors = results.filter(result => !result.valid);

            // Focus first invalid field
            if (!isFormValid && errors.length > 0) {
                const fieldName = this.escapeCssIdentifier(errors[0].field);
                const firstErrorField = form.querySelector(`[name="${fieldName}"], #${fieldName}`);
                if (firstErrorField) {
                    firstErrorField.focus();
                }
            }

            return {
                valid: isFormValid,
                errors: errors,
                fieldCount: fields.length,
                validFieldCount: results.filter(r => r.valid).length
            };
        } finally {
            this.isValidating = false;
        }
    }

    showFieldError(field, message) {
        const container = field.closest('.form-field, .field-container') || field.parentNode;
        let errorEl = container.querySelector('.field-error');

        if (!errorEl) {
            errorEl = document.createElement('div');
            errorEl.className = 'field-error';
            errorEl.setAttribute('role', 'alert');
            errorEl.setAttribute('aria-live', 'polite');
            container.appendChild(errorEl);
        }

        errorEl.textContent = message;
        errorEl.style.display = 'block';

        field.classList.add('error');
        field.setAttribute('aria-invalid', 'true');

        // Ensure errorEl has an ID before setting aria-describedby
        if (!errorEl.id) {
            errorEl.id = 'error-' + (field.name || field.id || 'field');
        }

        field.setAttribute('aria-describedby', errorEl.id);
    }

    clearFieldError(field) {
        const container = field.closest('.form-field, .field-container') || field.parentNode;
        const errorEl = container.querySelector('.field-error');

        if (errorEl) {
            errorEl.textContent = '';
            errorEl.style.display = 'none';
        }

        field.classList.remove('error');
        field.setAttribute('aria-invalid', 'false');
        field.removeAttribute('aria-describedby');
    }

    clearFormErrors(form) {
        const fields = form.querySelectorAll('.error');
        fields.forEach(field => this.clearFieldError(field));
    }

    getFieldLabel(field) {
        // Try to find label
        const label = field.closest('.form-field')?.querySelector('label') ||
                     document.querySelector(`label[for="${field.id}"]`) ||
                     field.previousElementSibling?.matches('label') && field.previousElementSibling;

        if (label) {
            return label.textContent.replace('*', '').trim();
        }

        // Fallback to field attributes
        return field.placeholder ||
               field.name?.replace(/([A-Z])/g, ' $1').trim() ||
               field.id?.replace(/([A-Z])/g, ' $1').trim() ||
               'This field';
    }

    // Security validation
    performSecurityValidation(fieldType, value) {
        // Basic XSS prevention patterns
        const xssPatterns = [
            /<script/i,
            /javascript:/i,
            /on\w+\s*=/i,
            /data:text\/html/i,
            /vbscript:/i
        ];

        // Check for suspicious patterns
        if (xssPatterns.some(pattern => pattern.test(value))) {
            return {
                valid: false,
                message: 'Invalid characters detected. Please remove any HTML or script content.'
            };
        }

        // Check for SQL injection patterns (basic)
        const sqlPatterns = [
            /(\bor\b|\band\b).*(=|<|>)/i,
            /union\s+select/i,
            /drop\s+table/i,
            /delete\s+from/i,
            /insert\s+into/i
        ];

        if (sqlPatterns.some(pattern => pattern.test(value))) {
            return {
                valid: false,
                message: 'Invalid input detected. Please enter valid information.'
            };
        }

        // Length-based security check
        if (value.length > 1000) {
            return {
                valid: false,
                message: 'Input is too long. Please enter a shorter value.'
            };
        }

        return { valid: true };
    }

    // Real-time validation setup
    setupRealtimeValidation(form) {
        const fields = form.querySelectorAll('[data-validate], input[required], textarea[required]');

        fields.forEach(field => {
            // Validate on blur
            field.addEventListener('blur', () => {
                this.validateField(field);
            });

            // Clear errors on input (with debounce)
            let timeoutId;
            field.addEventListener('input', () => {
                if (field.classList.contains('error')) {
                    clearTimeout(timeoutId);
                    timeoutId = setTimeout(() => {
                        this.validateField(field);
                    }, 300);
                }
            });
        });

        // Validate form on submit
        form.addEventListener('submit', (event) => {
            const result = this.validateForm(form);
            if (!result.valid) {
                event.preventDefault();
                event.stopPropagation();

                // Show summary error message
                this.showFormSummaryError(form, result);
            }
        });
    }

    showFormSummaryError(form, validationResult) {
        let summaryEl = form.querySelector('.form-error-summary');

        if (!summaryEl) {
            summaryEl = document.createElement('div');
            summaryEl.className = 'form-error-summary';
            summaryEl.setAttribute('role', 'alert');
            summaryEl.setAttribute('aria-live', 'assertive');
            form.insertBefore(summaryEl, form.firstChild);
        }

        const errorCount = validationResult.errors.length;
        summaryEl.innerHTML = `
            <h3>Please correct the following ${errorCount === 1 ? 'error' : 'errors'}:</h3>
            <ul>
                ${validationResult.errors.map(error =>
        `<li>${error.errors?.[0] || 'Please check this field'}</li>`
    ).join('')}
            </ul>
        `;

        summaryEl.style.display = 'block';
        summaryEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Add custom validation rule
    addValidationRule(fieldType, rule) {
        this.rules[fieldType] = { ...this.rules[fieldType], ...rule };
    }

    // Email-specific validation
    validateEmailDomain(email, allowedDomains = null, blockedDomains = null) {
        if (!email || !this.rules.email.pattern.test(email)) {
            return { valid: false, message: 'Invalid email format' };
        }

        const domain = email.split('@')[1]?.toLowerCase();

        if (blockedDomains && blockedDomains.includes(domain)) {
            return { valid: false, message: 'This email domain is not allowed' };
        }

        if (allowedDomains && !allowedDomains.includes(domain)) {
            return { valid: false, message: 'Please use an approved email domain' };
        }

        return { valid: true };
    }

    // CSS identifier escaping utility
    escapeCssIdentifier(identifier) {
        if (!identifier) {
            return '';
        }

        // Escape special CSS characters that could break selectors
        return identifier.replace(/[!"#$%&'()*+,.\/:;<=>?@\[\\\]^`{|}~]/g, '\\$&');
    }
}

// Singleton instance
let validatorInstance = null;

export function getPaymentFormValidator() {
    if (!validatorInstance) {
        validatorInstance = new PaymentFormValidator();
    }
    return validatorInstance;
}

// Utility function for quick form setup
export function setupFormValidation(form) {
    const validator = getPaymentFormValidator();
    validator.setupRealtimeValidation(form);
    return validator;
}
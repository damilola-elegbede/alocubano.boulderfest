/**
 * Payment Form Validator
 * Client-side validation for payment forms with accessibility features
 */

class PaymentFormValidator {
    constructor() {
        this.rules = {
            name: {
                required: true,
                minLength: 2,
                maxLength: 100,
                pattern: /^[a-zA-Z\s\-\'\.]+$/,
                message: 'Please enter a valid full name'
            },
            email: {
                required: true,
                maxLength: 254,
                pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: 'Please enter a valid email address'
            },
            phone: {
                required: false,
                pattern: /^[\+]?[1-9][\d]{0,15}$/,
                message: 'Please enter a valid phone number'
            }
        };

        this.customValidators = new Map();
    }

    initialize() {
        this.bindEvents();
        this.setupAccessibilityFeatures();
    }

    bindEvents() {
    // Real-time validation on blur
        document.addEventListener('blur', (e) => {
            if (e.target.matches('[data-validate]')) {
                this.validateField(e.target);
            }
        }, true);

        // Clear errors on focus
        document.addEventListener('focus', (e) => {
            if (e.target.matches('[data-validate]')) {
                this.clearFieldError(e.target);
            }
        }, true);

        // Input formatting
        document.addEventListener('input', (e) => {
            if (e.target.matches('[data-validate="phone"]')) {
                this.formatPhoneNumber(e.target);
            }
            if (e.target.matches('[data-validate="name"]')) {
                this.formatName(e.target);
            }
        });
    }

    setupAccessibilityFeatures() {
    // Add ARIA attributes to form fields
        document.querySelectorAll('[data-validate]').forEach(field => {
            const errorId = `${field.id}-error`;
            const errorEl = field.parentNode.querySelector('.field-error');

            if (errorEl && !errorEl.id) {
                errorEl.id = errorId;
                field.setAttribute('aria-describedby', errorId);
            }
        });
    }

    validateField(field) {
        const fieldType = field.dataset.validate;
        const value = field.value.trim();
        const rule = this.rules[fieldType];

        if (!rule) {
            console.warn(`No validation rule found for field type: ${fieldType}`);
            return { valid: true };
        }

        const errors = [];

        // Required check
        if (rule.required && !value) {
            errors.push(`${this.getFieldLabel(field)} is required`);
        }

        // Skip other validations if field is empty and not required
        if (!value && !rule.required) {
            this.clearFieldError(field);
            return { valid: true };
        }

        // Length checks
        if (value && rule.minLength && value.length < rule.minLength) {
            errors.push(`${this.getFieldLabel(field)} must be at least ${rule.minLength} characters`);
        }

        if (value && rule.maxLength && value.length > rule.maxLength) {
            errors.push(`${this.getFieldLabel(field)} must be no more than ${rule.maxLength} characters`);
        }

        // Pattern check
        if (value && rule.pattern && !rule.pattern.test(value)) {
            errors.push(rule.message);
        }

        // Custom validators
        if (value && this.customValidators.has(fieldType)) {
            const customResult = this.customValidators.get(fieldType)(value, field);
            if (!customResult.valid) {
                errors.push(customResult.message);
            }
        }

        // Security checks
        const securityCheck = this.performSecurityValidation(fieldType, value);
        if (!securityCheck.valid) {
            errors.push(securityCheck.message);
        }

        const isValid = errors.length === 0;

        if (isValid) {
            this.clearFieldError(field);
        } else {
            this.showFieldError(field, errors[0]);
        }

        return {
            valid: isValid,
            errors: isValid ? [] : errors
        };
    }

    validateCustomerForm(formData) {
        const errors = {};
        let isValid = true;

        // Validate all required fields
        ['name', 'email'].forEach(fieldName => {
            const value = formData.get(fieldName);
            const field = document.querySelector(`[name="${fieldName}"]`);

            if (field) {
                const result = this.validateField(field);
                if (!result.valid) {
                    errors[fieldName] = result.errors[0];
                    isValid = false;
                }
            }
        });

        // Validate optional phone field if provided
        const phoneField = document.querySelector('[name="phone"]');
        if (phoneField && phoneField.value.trim()) {
            const result = this.validateField(phoneField);
            if (!result.valid) {
                errors.phone = result.errors[0];
                isValid = false;
            }
        }

        // Cross-field validation
        const crossValidation = this.performCrossFieldValidation(formData);
        if (!crossValidation.valid) {
            Object.assign(errors, crossValidation.errors);
            isValid = false;
        }

        return {
            valid: isValid,
            errors
        };
    }

    performSecurityValidation(fieldType, value) {
    // Check for potential XSS attempts
        const xssPatterns = [
            /<script/i,
            /javascript:/i,
            /on\w+\s*=/i,
            /<iframe/i,
            /data:text\/html/i
        ];

        if (xssPatterns.some(pattern => pattern.test(value))) {
            return {
                valid: false,
                message: 'Invalid characters detected'
            };
        }

        // Check for SQL injection attempts (basic)
        const sqlPatterns = [
            /union\s+select/i,
            /insert\s+into/i,
            /delete\s+from/i,
            /drop\s+table/i,
            /exec\s*\(/i
        ];

        if (sqlPatterns.some(pattern => pattern.test(value))) {
            return {
                valid: false,
                message: 'Invalid input detected'
            };
        }

        // Field-specific security checks
        if (fieldType === 'email') {
            // Check for email header injection
            if (/[\r\n]/g.test(value)) {
                return {
                    valid: false,
                    message: 'Invalid email format'
                };
            }
        }

        if (fieldType === 'name') {
            // Excessive length or unusual characters
            if (value.length > 100 || /[<>{}[\]\\\/]/.test(value)) {
                return {
                    valid: false,
                    message: 'Name contains invalid characters'
                };
            }
        }

        return { valid: true };
    }

    performCrossFieldValidation(formData) {
        const errors = {};
        let isValid = true;

        const name = formData.get('name')?.trim();
        const email = formData.get('email')?.trim();

        // Check if name and email are suspiciously similar
        if (name && email) {
            const emailLocal = email.split('@')[0];
            if (name.toLowerCase().replace(/\s/g, '') === emailLocal.toLowerCase()) {
                // This might be a bot or lazy input, but don't block it
                console.log('Name and email local part are identical');
            }
        }

        // Check for obvious fake emails
        if (email) {
            const fakeEmailPatterns = [
                /test@test\.com/i,
                /fake@fake\.com/i,
                /example@example\.com/i,
                /admin@admin\.com/i
            ];

            if (fakeEmailPatterns.some(pattern => pattern.test(email))) {
                errors.email = 'Please provide a valid email address';
                isValid = false;
            }
        }

        return {
            valid: isValid,
            errors
        };
    }

    formatPhoneNumber(field) {
        let value = field.value.replace(/\D/g, ''); // Remove non-digits

        // Format US phone numbers
        if (value.length <= 10) {
            if (value.length >= 6) {
                value = value.replace(/(\d{3})(\d{3})(\d+)/, '($1) $2-$3');
            } else if (value.length >= 3) {
                value = value.replace(/(\d{3})(\d+)/, '($1) $2');
            }
        } else if (value.length === 11 && value.startsWith('1')) {
            // Handle 11-digit numbers starting with 1
            value = value.replace(/(\d{1})(\d{3})(\d{3})(\d{4})/, '$1 ($2) $3-$4');
        }

        field.value = value;
    }

    formatName(field) {
    // Capitalize first letter of each word
        const words = field.value.toLowerCase().split(' ');
        const formatted = words.map(word => {
            if (word.length > 0) {
                return word.charAt(0).toUpperCase() + word.slice(1);
            }
            return word;
        }).join(' ');

        field.value = formatted;
    }

    showFieldError(field, message) {
        const errorEl = field.parentNode.querySelector('.field-error');

        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }

        field.classList.add('error');
        field.setAttribute('aria-invalid', 'true');

        // Update field description
        this.updateAriaDescription(field, message);
    }

    clearFieldError(field) {
        const errorEl = field.parentNode.querySelector('.field-error');

        if (errorEl) {
            errorEl.textContent = '';
            errorEl.style.display = 'none';
        }

        field.classList.remove('error');
        field.setAttribute('aria-invalid', 'false');

        // Clear aria description
        this.updateAriaDescription(field, null);
    }

    updateAriaDescription(field, errorMessage) {
        const helpEl = field.parentNode.querySelector('.field-help');
        const errorEl = field.parentNode.querySelector('.field-error');

        const descriptions = [];

        if (helpEl && helpEl.textContent.trim()) {
            descriptions.push(helpEl.id || `${field.id}-help`);
        }

        if (errorMessage && errorEl) {
            descriptions.push(errorEl.id || `${field.id}-error`);
        }

        if (descriptions.length > 0) {
            field.setAttribute('aria-describedby', descriptions.join(' '));
        } else {
            field.removeAttribute('aria-describedby');
        }
    }

    getFieldLabel(field) {
        const label = field.parentNode.querySelector('label');
        if (label) {
            return label.textContent.replace('*', '').trim();
        }

        return field.getAttribute('aria-label') || field.name || 'Field';
    }

    addCustomValidator(fieldType, validator) {
        this.customValidators.set(fieldType, validator);
    }

    // Validate entire form
    validateForm(form) {
        const fields = form.querySelectorAll('[data-validate]');
        let isValid = true;
        const errors = {};

        fields.forEach(field => {
            const result = this.validateField(field);
            if (!result.valid) {
                errors[field.name] = result.errors[0];
                isValid = false;
            }
        });

        return {
            valid: isValid,
            errors
        };
    }

    // Real-time form validation status
    getFormValidationStatus(form) {
        const fields = form.querySelectorAll('[data-validate]');
        const status = {
            total: fields.length,
            valid: 0,
            invalid: 0,
            untouched: 0
        };

        fields.forEach(field => {
            if (field.classList.contains('error')) {
                status.invalid++;
            } else if (field.value.trim()) {
                status.valid++;
            } else {
                status.untouched++;
            }
        });

        return status;
    }

    // Accessibility helpers
    announceError(message) {
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'assertive');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.className = 'sr-only';
        announcement.textContent = message;

        document.body.appendChild(announcement);

        setTimeout(() => {
            document.body.removeChild(announcement);
        }, 1000);
    }

    focusFirstInvalidField(form) {
        const firstInvalid = form.querySelector('.form-input.error');
        if (firstInvalid) {
            firstInvalid.focus();
            firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // Utility methods
    sanitizeInput(value) {
        return value.trim().replace(/[<>]/g, '');
    }

    isEmailValid(email) {
        return this.rules.email.pattern.test(email);
    }

    isPhoneValid(phone) {
        if (!phone) {
            return true;
        } // Optional field
        return this.rules.phone.pattern.test(phone.replace(/\D/g, ''));
    }
}

export { PaymentFormValidator };
import React, { useState, useCallback } from 'react';

// Email validation pattern
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function NewsletterForm() {
    const [email, setEmail] = useState('');
    const [consent, setConsent] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const isValid = email.trim() && EMAIL_PATTERN.test(email) && consent;

    const validateEmail = useCallback((value) => {
        const trimmed = value.trim();
        if (!trimmed) return 'Email is required';
        if (!EMAIL_PATTERN.test(trimmed)) return 'Please enter a valid email address';
        return '';
    }, []);

    const handleEmailChange = (e) => {
        const value = e.target.value;
        setEmail(value);
        if (error) setError('');
        if (success) setSuccess(false);
    };

    const handleConsentChange = (e) => {
        setConsent(e.target.checked);
        if (error) setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validate
        const emailError = validateEmail(email);
        if (emailError) {
            setError(emailError);
            return;
        }

        if (!consent) {
            setError('Please agree to receive marketing emails');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            const response = await fetch('/api/email/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email: email.trim() }),
            });

            const result = await response.json();

            if (response.ok) {
                setSuccess(true);
                setEmail('');
                setConsent(false);
            } else {
                setError(result.error || 'Failed to subscribe. Please try again.');
            }
        } catch (err) {
            console.error('Newsletter subscription error:', err);
            setError('Network error. Please check your connection and try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form
            className="newsletter-form-type"
            id="newsletter-form"
            aria-label="Email newsletter signup"
            onSubmit={handleSubmit}
        >
            <div className="form-group-type">
                <label
                    htmlFor="newsletter-email"
                    className="form-label-type visually-hidden"
                >
                    Email Address
                </label>
                <div className="newsletter-input-wrapper">
                    <input
                        type="email"
                        id="newsletter-email"
                        name="email"
                        className="form-input-type newsletter-input"
                        placeholder="YOUR EMAIL ADDRESS"
                        required
                        aria-required="true"
                        aria-label="Email address for newsletter subscription"
                        aria-describedby="newsletter-error newsletter-success"
                        aria-invalid={error ? 'true' : 'false'}
                        autoComplete="email"
                        inputMode="email"
                        value={email}
                        onChange={handleEmailChange}
                        disabled={isSubmitting}
                    />
                    <button
                        type="submit"
                        className="form-button-type newsletter-submit"
                        aria-label="Subscribe to newsletter"
                        disabled={!isValid || isSubmitting}
                        style={{
                            opacity: (!isValid || isSubmitting) ? '0.5' : '1',
                            cursor: (!isValid || isSubmitting) ? 'not-allowed' : 'pointer'
                        }}
                    >
                        <span className="button-text">
                            {isSubmitting ? 'SUBSCRIBING...' : 'SUBSCRIBE'}
                        </span>
                        <span className="button-icon" aria-hidden="true">→</span>
                    </button>
                </div>
                {error && (
                    <span
                        id="newsletter-error"
                        className="error-message"
                        role="alert"
                        aria-live="polite"
                        style={{ display: 'block', color: '#dc2626', fontSize: '0.875rem', marginTop: '8px' }}
                    >
                        {error}
                    </span>
                )}
                {success && (
                    <div
                        id="newsletter-success"
                        className="newsletter-success"
                        role="status"
                        aria-live="polite"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}
                    >
                        <span className="success-icon">✓</span>
                        <span className="success-text">Welcome to the A Lo Cubano family!</span>
                    </div>
                )}
            </div>
            <div className="newsletter-consent">
                <label className="custom-checkbox">
                    <input
                        type="checkbox"
                        name="consent"
                        required
                        aria-required="true"
                        checked={consent}
                        onChange={handleConsentChange}
                        disabled={isSubmitting}
                    />
                    <span className="checkmark"></span>
                    <span className="checkbox-label">
                        I agree to receive marketing emails about festival updates and events
                    </span>
                </label>
            </div>
        </form>
    );
}

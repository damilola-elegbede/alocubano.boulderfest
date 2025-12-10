/**
 * EmailVerificationForm Component
 *
 * Two-step email verification form for accessing tickets.
 * Step 1: Enter email to receive verification code
 * Step 2: Enter 6-digit verification code
 */

import React, { useState } from 'react';

export default function EmailVerificationForm({
    step,
    email,
    isLoading,
    error,
    expirySeconds,
    resendCooldown,
    onSendCode,
    onVerifyCode,
    onResendCode,
    onChangeEmail
}) {
    const [emailInput, setEmailInput] = useState('');
    const [codeInput, setCodeInput] = useState('');

    // Format time as MM:SS
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Handle email form submit
    const handleEmailSubmit = (e) => {
        e.preventDefault();
        onSendCode(emailInput);
    };

    // Handle code form submit
    const handleCodeSubmit = (e) => {
        e.preventDefault();
        onVerifyCode(codeInput);
    };

    // Handle code input - auto-submit when 6 digits entered
    const handleCodeChange = (e) => {
        const value = e.target.value.replace(/\D/g, '').slice(0, 6);
        setCodeInput(value);
    };

    // Render email input step
    if (step === 'email') {
        return (
            <div className="verification-step">
                <p>
                    Enter your email address to receive a verification code.
                </p>
                <form className="lookup-form" onSubmit={handleEmailSubmit}>
                    <input
                        type="email"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="Enter your email address"
                        required
                        aria-label="Email address"
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={isLoading}
                    >
                        {isLoading ? 'Sending...' : 'Send Code'}
                    </button>
                </form>
                {error && (
                    <div className="message error" role="alert">
                        {error}
                    </div>
                )}
            </div>
        );
    }

    // Render code verification step
    if (step === 'code') {
        return (
            <div className="verification-step">
                <p>
                    <strong>Check your email!</strong> We've sent a 6-digit verification code to{' '}
                    <span className="highlight-email">{email}</span>
                </p>
                <p className="code-expiry-info">
                    Code expires in <span id="expiryTimer">{formatTime(expirySeconds)}</span>
                </p>
                <form className="verification-form" onSubmit={handleCodeSubmit}>
                    <div className="form-group">
                        <label htmlFor="codeInput">Verification Code</label>
                        <input
                            type="text"
                            id="codeInput"
                            value={codeInput}
                            onChange={handleCodeChange}
                            placeholder="000000"
                            required
                            maxLength="6"
                            pattern="[0-9]{6}"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            aria-label="6-digit verification code"
                            disabled={isLoading}
                            style={{
                                fontSize: '24px',
                                letterSpacing: '0.5em',
                                textAlign: 'center',
                                padding: '12px',
                                fontFamily: 'var(--font-mono)'
                            }}
                        />
                    </div>
                    <div className="form-actions" style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={isLoading || codeInput.length !== 6}
                        >
                            {isLoading ? 'Verifying...' : 'Verify Code'}
                        </button>
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={onResendCode}
                            disabled={isLoading || resendCooldown > 0}
                        >
                            {resendCooldown > 0 ? `Resend Code (${resendCooldown}s)` : 'Resend Code'}
                        </button>
                    </div>
                </form>
                {error && (
                    <div className="message error" role="alert">
                        {error}
                    </div>
                )}
                <button
                    type="button"
                    className="btn-link"
                    onClick={() => {
                        setEmailInput('');
                        setCodeInput('');
                        onChangeEmail();
                    }}
                    style={{
                        marginTop: 'var(--space-md)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-primary)',
                        cursor: 'pointer',
                        textDecoration: 'underline'
                    }}
                >
                    Use different email
                </button>
            </div>
        );
    }

    // Step is 'verified' - parent component handles this
    return null;
}

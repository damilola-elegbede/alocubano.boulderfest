/**
 * Admin Login Page
 *
 * Handles admin authentication with password and optional MFA.
 */

import React, { useState, useEffect, useRef } from 'react';
import { AdminProviders } from '../../providers/AdminProviders.jsx';
import { useAdminAuth } from '../../hooks/admin/useAdminAuth.js';
import { AUTH_STATES } from '../../contexts/admin/AdminAuthContext.jsx';

/**
 * Sanitizes return URL to prevent open redirect vulnerabilities
 */
function sanitizeReturnUrl(url) {
    if (!url || typeof url !== 'string' || url.trim() === '') {
        return null;
    }

    const trimmedUrl = url.trim();

    // Must start with '/' (relative path only)
    if (!trimmedUrl.startsWith('/')) {
        return null;
    }

    // Reject protocol-relative URLs
    if (trimmedUrl.startsWith('//')) {
        return null;
    }

    // Reject URLs containing '@'
    if (trimmedUrl.includes('@')) {
        return null;
    }

    // Reject URLs that look like absolute URLs with protocols
    if (trimmedUrl.match(/^\/[a-z]+:\/\//i)) {
        return null;
    }

    return trimmedUrl;
}

/**
 * LoginPageContent - Login form content
 */
function LoginPageContent() {
    const { status, error, login, verifyMfa, isAuthenticated } = useAdminAuth();

    // Form state
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [mfaCode, setMfaCode] = useState('');
    const [formError, setFormError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [attemptsRemaining, setAttemptsRemaining] = useState(null);

    // Refs
    const usernameRef = useRef(null);
    const passwordRef = useRef(null);
    const mfaRef = useRef(null);

    // Check if already authenticated and redirect
    useEffect(() => {
        if (isAuthenticated) {
            const urlParams = new URLSearchParams(window.location.search);
            const returnUrl = urlParams.get('returnUrl');
            const safeReturnUrl = sanitizeReturnUrl(returnUrl);
            window.location.href = safeReturnUrl || '/pages/admin/dashboard.html';
        }
    }, [isAuthenticated]);

    // Focus appropriate field
    useEffect(() => {
        if (status === AUTH_STATES.MFA_REQUIRED && mfaRef.current) {
            mfaRef.current.focus();
        } else if (usernameRef.current) {
            usernameRef.current.focus();
        }
    }, [status]);

    // Handle password login
    const handleLogin = async (e) => {
        e.preventDefault();
        setFormError(null);
        setIsLoading(true);

        try {
            const result = await login(username, password);

            if (!result.success && !result.requiresMfa) {
                setFormError(result.error || 'Login failed');
                setAttemptsRemaining(result.attemptsRemaining);
                setPassword('');
                passwordRef.current?.focus();
            }
        } catch (err) {
            setFormError(err.message || 'Login failed');
        } finally {
            setIsLoading(false);
        }
    };

    // Handle MFA verification
    const handleMfa = async (e) => {
        e.preventDefault();
        setFormError(null);
        setIsLoading(true);

        try {
            const result = await verifyMfa(mfaCode);

            if (!result.success) {
                setFormError(result.error || 'MFA verification failed');
                setAttemptsRemaining(result.attemptsRemaining);
                setMfaCode('');
                mfaRef.current?.focus();
            }
        } catch (err) {
            setFormError(err.message || 'MFA verification failed');
        } finally {
            setIsLoading(false);
        }
    };

    // Display error message
    const displayError = formError || error;

    return (
        <div className="login-container">
            <div className="login-header">
                <h1>Admin Access</h1>
                <p>A Lo Cubano Boulder Fest</p>
            </div>

            {displayError && (
                <div
                    className="error-message"
                    style={{ display: 'block' }}
                    data-testid="login-error"
                >
                    {displayError}
                    {attemptsRemaining !== null && attemptsRemaining !== undefined && (
                        <> ({attemptsRemaining} attempts remaining)</>
                    )}
                </div>
            )}

            {status === AUTH_STATES.MFA_REQUIRED ? (
                // MFA Form
                <form onSubmit={handleMfa} data-testid="mfa-form">
                    <div className="form-group">
                        <label htmlFor="mfaCode">Authentication Code</label>
                        <input
                            ref={mfaRef}
                            type="text"
                            id="mfaCode"
                            name="mfaCode"
                            value={mfaCode}
                            onChange={(e) => setMfaCode(e.target.value)}
                            required
                            autoComplete="one-time-code"
                            placeholder="Enter your 6-digit code"
                            data-testid="mfa-code"
                            maxLength={10}
                        />
                    </div>

                    <button
                        type="submit"
                        className="login-btn"
                        disabled={isLoading}
                        data-testid="mfa-button"
                    >
                        {isLoading ? 'Verifying...' : 'Verify Code'}
                    </button>

                    {isLoading && (
                        <div className="loading" style={{ display: 'block' }}>
                            Verifying...
                        </div>
                    )}
                </form>
            ) : (
                // Login Form
                <form onSubmit={handleLogin} data-testid="login-form">
                    <div className="form-group">
                        <label htmlFor="username">Username</label>
                        <input
                            ref={usernameRef}
                            type="text"
                            id="username"
                            name="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            autoComplete="username"
                            placeholder="Username"
                            data-testid="username"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Admin Password</label>
                        <input
                            ref={passwordRef}
                            type="password"
                            id="password"
                            name="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                            placeholder="Enter admin password"
                            data-testid="password"
                        />
                    </div>

                    <button
                        type="submit"
                        className="login-btn"
                        disabled={isLoading}
                        data-testid="login-button"
                    >
                        {isLoading ? 'Authenticating...' : 'Login'}
                    </button>

                    {isLoading && (
                        <div className="loading" style={{ display: 'block' }}>
                            Authenticating...
                        </div>
                    )}
                </form>
            )}

            <div className="info-message">
                Secure admin access only. All login attempts are logged.
            </div>

            <div
                className="privacy-notice"
                style={{
                    fontSize: '12px',
                    color: 'var(--color-text-muted)',
                    marginTop: '15px',
                    textAlign: 'center',
                    maxWidth: '400px',
                }}
            >
                Security monitoring logs your IP address and login attempts for fraud
                prevention and audit purposes. See our{' '}
                <a
                    href="/privacy-policy"
                    style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}
                >
                    Privacy Policy
                </a>{' '}
                for details.
            </div>
        </div>
    );
}

/**
 * LoginPage - Admin login page with providers
 */
export default function LoginPage() {
    return (
        <AdminProviders>
            <LoginPageContent />
        </AdminProviders>
    );
}

/**
 * useEmailVerification - Custom hook for email verification flow
 *
 * Manages the two-step email verification process:
 * 1. Send verification code to email
 * 2. Verify the 6-digit code
 *
 * Handles timers for code expiry and resend cooldown.
 *
 * Returns:
 *   - step: 'email' | 'code' | 'verified'
 *   - email: current email being verified
 *   - isLoading: boolean for loading state
 *   - error: error message or null
 *   - expirySeconds: seconds until code expires
 *   - resendCooldown: seconds until can resend (0 = can resend)
 *   - sendCode: function to send verification code
 *   - verifyCode: function to verify the code
 *   - resendCode: function to resend verification code
 *   - resetFlow: function to restart verification flow
 *
 * Usage:
 *   function EmailVerificationForm() {
 *     const {
 *       step, email, isLoading, error,
 *       expirySeconds, resendCooldown,
 *       sendCode, verifyCode, resendCode, resetFlow
 *     } = useEmailVerification(onSuccess);
 *
 *     // Render appropriate step
 *   }
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export function useEmailVerification(onVerified) {
    const [step, setStep] = useState('email'); // 'email' | 'code' | 'verified'
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [expirySeconds, setExpirySeconds] = useState(0);
    const [resendCooldown, setResendCooldown] = useState(0);

    const expiryIntervalRef = useRef(null);
    const resendIntervalRef = useRef(null);

    // Cleanup intervals on unmount
    useEffect(() => {
        return () => {
            if (expiryIntervalRef.current) clearInterval(expiryIntervalRef.current);
            if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);
        };
    }, []);

    // Start expiry timer
    const startExpiryTimer = useCallback((seconds) => {
        if (expiryIntervalRef.current) clearInterval(expiryIntervalRef.current);

        setExpirySeconds(seconds);
        expiryIntervalRef.current = setInterval(() => {
            setExpirySeconds(prev => {
                if (prev <= 1) {
                    clearInterval(expiryIntervalRef.current);
                    setError('Verification code expired. Please request a new code.');
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, []);

    // Start resend cooldown timer
    const startResendTimer = useCallback(() => {
        if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);

        setResendCooldown(60);
        resendIntervalRef.current = setInterval(() => {
            setResendCooldown(prev => {
                if (prev <= 1) {
                    clearInterval(resendIntervalRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, []);

    // Send verification code
    const sendCode = useCallback(async (emailAddress) => {
        if (!emailAddress || !emailAddress.trim()) {
            setError('Please enter your email address.');
            return false;
        }

        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/tickets/verify-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: emailAddress.trim() })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to send verification code');
            }

            setEmail(emailAddress.trim());
            setStep('code');
            startExpiryTimer(data.expiresIn || 300);
            startResendTimer();
            return true;
        } catch (err) {
            setError(err.message);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [startExpiryTimer, startResendTimer]);

    // Resend verification code
    const resendCode = useCallback(async () => {
        if (resendCooldown > 0 || !email) return false;
        return sendCode(email);
    }, [email, resendCooldown, sendCode]);

    // Verify code
    const verifyCode = useCallback(async (code) => {
        if (!code || !/^\d{6}$/.test(code)) {
            setError('Please enter a valid 6-digit code.');
            return null;
        }

        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/tickets/verify-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Invalid verification code');
            }

            // Clear timers
            if (expiryIntervalRef.current) clearInterval(expiryIntervalRef.current);
            if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);

            setStep('verified');

            // Call success callback with session data
            if (onVerified) {
                onVerified(data.accessToken, email, data.expiresIn || 3600);
            }

            return data;
        } catch (err) {
            setError(err.message);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [email, onVerified]);

    // Reset to email step
    const resetFlow = useCallback(() => {
        if (expiryIntervalRef.current) clearInterval(expiryIntervalRef.current);
        if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);

        setStep('email');
        setEmail('');
        setError(null);
        setExpirySeconds(0);
        setResendCooldown(0);
    }, []);

    return {
        step,
        email,
        isLoading,
        error,
        expirySeconds,
        resendCooldown,
        sendCode,
        verifyCode,
        resendCode,
        resetFlow,
        setError
    };
}

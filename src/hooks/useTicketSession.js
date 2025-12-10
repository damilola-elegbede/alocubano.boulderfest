/**
 * useTicketSession - Custom hook for managing ticket access session
 *
 * Handles JWT session storage, expiry checking, and authentication state.
 * Sessions are stored in localStorage and validated against expiry time.
 *
 * Returns:
 *   - isAuthenticated: boolean indicating if user has valid session
 *   - email: current authenticated email or null
 *   - accessToken: current JWT token or null
 *   - saveSession: function to save new session data
 *   - clearSession: function to clear session and logout
 *   - sessionTimeRemaining: seconds until session expires (null if not authenticated)
 *
 * Usage:
 *   function MyTicketsPage() {
 *     const { isAuthenticated, email, clearSession } = useTicketSession();
 *
 *     if (!isAuthenticated) {
 *       return <EmailVerificationForm />;
 *     }
 *
 *     return (
 *       <div>
 *         <p>Viewing tickets for {email}</p>
 *         <button onClick={clearSession}>Sign Out</button>
 *       </div>
 *     );
 *   }
 */

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEYS = {
    TOKEN: 'ticketAccessToken',
    EMAIL: 'ticketAccessEmail',
    EXPIRY: 'ticketAccessTokenExpiry'
};

export function useTicketSession() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [email, setEmail] = useState(null);
    const [accessToken, setAccessToken] = useState(null);
    const [sessionTimeRemaining, setSessionTimeRemaining] = useState(null);

    // Check session validity
    const checkSession = useCallback(() => {
        try {
            const storedToken = localStorage.getItem(STORAGE_KEYS.TOKEN);
            const storedEmail = localStorage.getItem(STORAGE_KEYS.EMAIL);
            const tokenExpiry = localStorage.getItem(STORAGE_KEYS.EXPIRY);

            if (storedToken && storedEmail && tokenExpiry) {
                const now = Date.now();
                const expiry = parseInt(tokenExpiry, 10);

                if (now < expiry) {
                    // Session still valid
                    setAccessToken(storedToken);
                    setEmail(storedEmail);
                    setIsAuthenticated(true);
                    setSessionTimeRemaining(Math.floor((expiry - now) / 1000));
                    return true;
                }
            }

            // Session invalid or expired
            clearSessionData();
            return false;
        } catch (error) {
            console.error('Error checking session:', error);
            clearSessionData();
            return false;
        }
    }, []);

    // Clear session state (internal helper)
    const clearSessionData = useCallback(() => {
        setAccessToken(null);
        setEmail(null);
        setIsAuthenticated(false);
        setSessionTimeRemaining(null);
    }, []);

    // Save new session
    const saveSession = useCallback((token, userEmail, expiresInSeconds) => {
        try {
            const expiry = Date.now() + (expiresInSeconds * 1000);
            localStorage.setItem(STORAGE_KEYS.TOKEN, token);
            localStorage.setItem(STORAGE_KEYS.EMAIL, userEmail);
            localStorage.setItem(STORAGE_KEYS.EXPIRY, expiry.toString());

            setAccessToken(token);
            setEmail(userEmail);
            setIsAuthenticated(true);
            setSessionTimeRemaining(expiresInSeconds);
        } catch (error) {
            console.error('Error saving session:', error);
        }
    }, []);

    // Clear session (public method for logout)
    const clearSession = useCallback(() => {
        try {
            localStorage.removeItem(STORAGE_KEYS.TOKEN);
            localStorage.removeItem(STORAGE_KEYS.EMAIL);
            localStorage.removeItem(STORAGE_KEYS.EXPIRY);
        } catch (error) {
            console.error('Error clearing session storage:', error);
        }
        clearSessionData();
    }, [clearSessionData]);

    // Check session on mount
    useEffect(() => {
        checkSession();
    }, [checkSession]);

    // Update remaining time periodically
    useEffect(() => {
        if (!isAuthenticated) return;

        const interval = setInterval(() => {
            const expiry = localStorage.getItem(STORAGE_KEYS.EXPIRY);
            if (expiry) {
                const remaining = Math.floor((parseInt(expiry, 10) - Date.now()) / 1000);
                if (remaining <= 0) {
                    clearSession();
                } else {
                    setSessionTimeRemaining(remaining);
                }
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [isAuthenticated, clearSession]);

    return {
        isAuthenticated,
        email,
        accessToken,
        sessionTimeRemaining,
        saveSession,
        clearSession,
        checkSession
    };
}

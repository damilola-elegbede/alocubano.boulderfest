/**
 * Admin Authentication Context
 *
 * Provides authentication state management for admin pages.
 *
 * Key differences from public AppProviders:
 * 1. NO Cart/Payment providers (admin doesn't shop)
 * 2. ALWAYS dark theme (non-negotiable)
 * 3. Session-based auth with CSRF tokens
 * 4. Cookie handling (HttpOnly, never localStorage)
 */

import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';

export const AdminAuthContext = createContext(null);

/**
 * Authentication states
 */
export const AUTH_STATES = {
    LOADING: 'loading',
    AUTHENTICATED: 'authenticated',
    UNAUTHENTICATED: 'unauthenticated',
    MFA_REQUIRED: 'mfa_required',
    ERROR: 'error',
};

/**
 * Default session configuration
 */
const SESSION_CONFIG = {
    refreshInterval: 50 * 60 * 1000, // 50 minutes (before 1-hour expiry)
    mobileSessionDuration: 72 * 60 * 60 * 1000, // 72 hours for mobile mode
    standardSessionDuration: 60 * 60 * 1000, // 1 hour standard
};

/**
 * AdminAuthProvider - Provides authentication context for admin pages
 */
export function AdminAuthProvider({ children, onAuthStateChange }) {
    // Authentication state
    const [authState, setAuthState] = useState({
        status: AUTH_STATES.LOADING,
        admin: null,
        sessionInfo: null,
        error: null,
    });

    // CSRF token for mutations
    const [csrfToken, setCsrfToken] = useState(null);

    // Temporary token for MFA flow
    const [tempToken, setTempToken] = useState(null);

    // Track if component is mounted
    const isMounted = useRef(true);

    // Session refresh interval
    const refreshIntervalRef = useRef(null);

    /**
     * Safely update state only if mounted
     */
    const safeSetState = useCallback((updates) => {
        if (isMounted.current) {
            setAuthState((prev) => ({ ...prev, ...updates }));
        }
    }, []);

    /**
     * Verify current session with the server
     */
    const verifySession = useCallback(async () => {
        try {
            const response = await fetch('/api/admin/verify-session', {
                method: 'GET',
                credentials: 'include', // Send HttpOnly cookie
                headers: {
                    'Cache-Control': 'no-cache',
                },
            });

            if (!response.ok) {
                // Try dashboard endpoint as fallback
                if (response.status === 500) {
                    const dashboardResponse = await fetch('/api/admin/dashboard', {
                        method: 'GET',
                        credentials: 'include',
                        headers: {
                            'Cache-Control': 'no-cache',
                        },
                    });

                    if (dashboardResponse.ok) {
                        const data = await dashboardResponse.json();
                        return {
                            valid: true,
                            admin: { id: 'admin', role: 'admin' },
                            sessionInfo: data.sessionInfo || null,
                        };
                    }
                }

                return { valid: false, error: 'Session invalid' };
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('[AdminAuth] Session verification failed:', error);
            return { valid: false, error: error.message };
        }
    }, []);

    /**
     * Login with username and password (Step 1)
     */
    const login = useCallback(async (username, password, mode = 'standard') => {
        safeSetState({ status: AUTH_STATES.LOADING, error: null });

        try {
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password, mode }),
            });

            const data = await response.json();

            if (!response.ok) {
                safeSetState({
                    status: AUTH_STATES.UNAUTHENTICATED,
                    error: data.error || 'Login failed',
                });
                return {
                    success: false,
                    error: data.error,
                    attemptsRemaining: data.attemptsRemaining,
                };
            }

            // Check if MFA is required
            if (data.requiresMfa) {
                setTempToken(data.tempToken);
                safeSetState({
                    status: AUTH_STATES.MFA_REQUIRED,
                    error: null,
                });
                return { success: true, requiresMfa: true };
            }

            // Login successful
            safeSetState({
                status: AUTH_STATES.AUTHENTICATED,
                admin: { id: data.adminId || 'admin', role: 'admin' },
                sessionInfo: {
                    expiresIn: data.expiresIn,
                    mfaUsed: data.mfaUsed,
                },
                error: null,
            });

            return { success: true };
        } catch (error) {
            console.error('[AdminAuth] Login error:', error);
            safeSetState({
                status: AUTH_STATES.ERROR,
                error: 'Network error. Please try again.',
            });
            return { success: false, error: error.message };
        }
    }, [safeSetState]);

    /**
     * Complete MFA verification (Step 2)
     */
    const verifyMfa = useCallback(async (mfaCode) => {
        if (!tempToken) {
            return { success: false, error: 'No temporary session' };
        }

        safeSetState({ status: AUTH_STATES.LOADING, error: null });

        try {
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${tempToken}`,
                },
                body: JSON.stringify({ mfaCode, step: 'mfa', tempToken }),
            });

            const data = await response.json();

            if (!response.ok) {
                safeSetState({
                    status: AUTH_STATES.MFA_REQUIRED,
                    error: data.error || 'MFA verification failed',
                });
                return {
                    success: false,
                    error: data.error,
                    attemptsRemaining: data.attemptsRemaining,
                };
            }

            // MFA successful - clear temp token
            setTempToken(null);

            safeSetState({
                status: AUTH_STATES.AUTHENTICATED,
                admin: { id: data.adminId || 'admin', role: 'admin' },
                sessionInfo: {
                    expiresIn: data.expiresIn,
                    mfaUsed: true,
                },
                error: null,
            });

            return { success: true };
        } catch (error) {
            console.error('[AdminAuth] MFA verification error:', error);
            safeSetState({
                status: AUTH_STATES.MFA_REQUIRED,
                error: 'Network error. Please try again.',
            });
            return { success: false, error: error.message };
        }
    }, [tempToken, safeSetState]);

    /**
     * Logout - clear session
     */
    const logout = useCallback(async () => {
        try {
            await fetch('/api/admin/login', {
                method: 'DELETE',
                credentials: 'include',
            });
        } catch (error) {
            console.error('[AdminAuth] Logout error:', error);
        }

        // Clear state regardless of API result
        setTempToken(null);
        setCsrfToken(null);
        safeSetState({
            status: AUTH_STATES.UNAUTHENTICATED,
            admin: null,
            sessionInfo: null,
            error: null,
        });

        // Clear any stored data
        localStorage.removeItem('adminToken');
        sessionStorage.clear();
    }, [safeSetState]);

    /**
     * Refresh session (prevent expiry)
     */
    const refreshSession = useCallback(async () => {
        if (authState.status !== AUTH_STATES.AUTHENTICATED) {
            return;
        }

        const result = await verifySession();
        if (!result.valid) {
            logout();
        }
    }, [authState.status, verifySession, logout]);

    /**
     * Check session on mount
     */
    useEffect(() => {
        let cancelled = false;

        const checkSession = async () => {
            // Skip verification on login page
            if (window.location.pathname.includes('/admin/login')) {
                safeSetState({
                    status: AUTH_STATES.UNAUTHENTICATED,
                    admin: null,
                    sessionInfo: null,
                    error: null,
                });
                return;
            }

            const result = await verifySession();

            if (cancelled) return;

            if (result.valid) {
                safeSetState({
                    status: AUTH_STATES.AUTHENTICATED,
                    admin: result.admin,
                    sessionInfo: result.sessionInfo,
                    error: null,
                });
            } else {
                safeSetState({
                    status: AUTH_STATES.UNAUTHENTICATED,
                    admin: null,
                    sessionInfo: null,
                    error: null,
                });
            }
        };

        checkSession();

        return () => {
            cancelled = true;
        };
    }, [verifySession, safeSetState]);

    /**
     * Set up session refresh interval
     */
    useEffect(() => {
        if (authState.status === AUTH_STATES.AUTHENTICATED) {
            refreshIntervalRef.current = setInterval(
                refreshSession,
                SESSION_CONFIG.refreshInterval
            );
        }

        return () => {
            if (refreshIntervalRef.current) {
                clearInterval(refreshIntervalRef.current);
                refreshIntervalRef.current = null;
            }
        };
    }, [authState.status, refreshSession]);

    /**
     * Notify parent of auth state changes
     */
    useEffect(() => {
        if (onAuthStateChange) {
            onAuthStateChange(authState.status);
        }
    }, [authState.status, onAuthStateChange]);

    /**
     * Cleanup on unmount
     */
    useEffect(() => {
        return () => {
            isMounted.current = false;
            if (refreshIntervalRef.current) {
                clearInterval(refreshIntervalRef.current);
            }
        };
    }, []);

    // Context value
    const value = {
        ...authState,
        csrfToken,
        login,
        logout,
        verifyMfa,
        verifySession,
        refreshSession,
        isAuthenticated: authState.status === AUTH_STATES.AUTHENTICATED,
        isLoading: authState.status === AUTH_STATES.LOADING,
        requiresMfa: authState.status === AUTH_STATES.MFA_REQUIRED,
    };

    return (
        <AdminAuthContext.Provider value={value}>
            {children}
        </AdminAuthContext.Provider>
    );
}

export default AdminAuthContext;

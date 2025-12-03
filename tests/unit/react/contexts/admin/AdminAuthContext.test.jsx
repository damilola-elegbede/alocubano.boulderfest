/**
 * AdminAuthContext Tests
 *
 * Tests for admin authentication context and hooks.
 *
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AdminAuthProvider, AUTH_STATES } from '../../../../../src/contexts/admin/AdminAuthContext.jsx';
import { useAdminAuth } from '../../../../../src/hooks/admin/useAdminAuth.js';

// Helper component to test the hook
function TestConsumer() {
    const auth = useAdminAuth();
    return (
        <div>
            <span data-testid="status">{auth.status}</span>
            <span data-testid="is-authenticated">{auth.isAuthenticated ? 'yes' : 'no'}</span>
            <span data-testid="is-loading">{auth.isLoading ? 'yes' : 'no'}</span>
            <button onClick={() => auth.login('admin', 'test123')}>Login</button>
            <button onClick={auth.logout}>Logout</button>
        </div>
    );
}

describe('AdminAuthContext', () => {
    let originalLocation;
    let originalLocalStorage;
    let originalSessionStorage;

    beforeEach(() => {
        // Reset fetch mock
        global.fetch = vi.fn();

        // Save original location
        originalLocation = window.location;

        // Mock window.location
        delete window.location;
        window.location = {
            pathname: '/admin/dashboard',
            href: '',
            search: '',
            hash: '',
            replace: vi.fn(),
        };

        // Save and mock localStorage
        originalLocalStorage = window.localStorage;
        const storage = {};
        Object.defineProperty(window, 'localStorage', {
            value: {
                getItem: vi.fn((key) => storage[key] || null),
                setItem: vi.fn((key, value) => { storage[key] = value; }),
                removeItem: vi.fn((key) => { delete storage[key]; }),
                clear: vi.fn(() => { Object.keys(storage).forEach(k => delete storage[k]); }),
            },
            writable: true,
        });

        // Save and mock sessionStorage
        originalSessionStorage = window.sessionStorage;
        Object.defineProperty(window, 'sessionStorage', {
            value: {
                clear: vi.fn(),
            },
            writable: true,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        // Restore originals
        window.location = originalLocation;
    });

    describe('Initial State', () => {
        it('starts in loading state', () => {
            global.fetch.mockImplementation(() => new Promise(() => {})); // Never resolves

            render(
                <AdminAuthProvider>
                    <TestConsumer />
                </AdminAuthProvider>
            );

            expect(screen.getByTestId('status').textContent).toBe(AUTH_STATES.LOADING);
            expect(screen.getByTestId('is-loading').textContent).toBe('yes');
        });

        it('checks session on mount', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    valid: true,
                    admin: { id: 'admin', role: 'admin' },
                    sessionInfo: { remainingMs: 3600000 },
                }),
            });

            render(
                <AdminAuthProvider>
                    <TestConsumer />
                </AdminAuthProvider>
            );

            await waitFor(() => {
                expect(screen.getByTestId('status').textContent).toBe(AUTH_STATES.AUTHENTICATED);
            });

            expect(global.fetch).toHaveBeenCalledWith(
                '/api/admin/verify-session',
                expect.objectContaining({
                    method: 'GET',
                    credentials: 'include',
                })
            );
        });

        it('sets unauthenticated state on login page', async () => {
            window.location.pathname = '/admin/login';

            global.fetch.mockResolvedValueOnce({
                ok: false,
            });

            render(
                <AdminAuthProvider>
                    <TestConsumer />
                </AdminAuthProvider>
            );

            await waitFor(() => {
                expect(screen.getByTestId('status').textContent).toBe(AUTH_STATES.UNAUTHENTICATED);
            });
        });
    });

    describe('Session Verification', () => {
        it('authenticates on valid session', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    valid: true,
                    admin: { id: 'admin', role: 'admin' },
                    sessionInfo: { remainingMs: 3600000 },
                }),
            });

            render(
                <AdminAuthProvider>
                    <TestConsumer />
                </AdminAuthProvider>
            );

            await waitFor(() => {
                expect(screen.getByTestId('is-authenticated').textContent).toBe('yes');
            });
        });

        it('falls back to dashboard endpoint on 500 error', async () => {
            global.fetch
                .mockResolvedValueOnce({
                    ok: false,
                    status: 500,
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ stats: {} }),
                });

            render(
                <AdminAuthProvider>
                    <TestConsumer />
                </AdminAuthProvider>
            );

            await waitFor(() => {
                expect(screen.getByTestId('is-authenticated').textContent).toBe('yes');
            });

            expect(global.fetch).toHaveBeenCalledTimes(2);
        });

        it('sets unauthenticated on invalid session', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ valid: false }),
            });

            render(
                <AdminAuthProvider>
                    <TestConsumer />
                </AdminAuthProvider>
            );

            await waitFor(() => {
                expect(screen.getByTestId('status').textContent).toBe(AUTH_STATES.UNAUTHENTICATED);
            });
        });
    });

    describe('useAdminAuth Hook', () => {
        it('throws error when used outside provider', () => {
            // Suppress console.error for this test
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            expect(() => {
                render(<TestConsumer />);
            }).toThrow('useAdminAuth must be used within an AdminAuthProvider');

            consoleSpy.mockRestore();
        });

        it('provides auth methods', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    valid: true,
                    admin: { id: 'admin', role: 'admin' },
                }),
            });

            let authContext;
            function Capture() {
                authContext = useAdminAuth();
                return null;
            }

            render(
                <AdminAuthProvider>
                    <Capture />
                </AdminAuthProvider>
            );

            await waitFor(() => {
                expect(authContext).toBeDefined();
            });

            expect(typeof authContext.login).toBe('function');
            expect(typeof authContext.logout).toBe('function');
            expect(typeof authContext.verifyMfa).toBe('function');
            expect(typeof authContext.verifySession).toBe('function');
        });
    });

    describe('Login Flow', () => {
        it('handles successful login without MFA', async () => {
            // First: session check returns unauthenticated
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
            });

            // Second: login succeeds
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    success: true,
                    adminId: 'admin',
                    expiresIn: 3600000,
                    mfaUsed: false,
                }),
            });

            let authContext;
            function Capture() {
                authContext = useAdminAuth();
                return <span data-testid="status">{authContext.status}</span>;
            }

            render(
                <AdminAuthProvider>
                    <Capture />
                </AdminAuthProvider>
            );

            // Wait for initial session check
            await waitFor(() => {
                expect(authContext.status).toBe(AUTH_STATES.UNAUTHENTICATED);
            });

            // Perform login
            await act(async () => {
                const result = await authContext.login('admin', 'test123');
                expect(result.success).toBe(true);
            });

            expect(screen.getByTestId('status').textContent).toBe(AUTH_STATES.AUTHENTICATED);
        });

        it('handles MFA required response', async () => {
            // First: session check returns unauthenticated
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
            });

            // Second: login requires MFA
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    success: true,
                    requiresMfa: true,
                    tempToken: 'temp-token-123',
                }),
            });

            let authContext;
            function Capture() {
                authContext = useAdminAuth();
                return <span data-testid="status">{authContext.status}</span>;
            }

            render(
                <AdminAuthProvider>
                    <Capture />
                </AdminAuthProvider>
            );

            await waitFor(() => {
                expect(authContext.status).toBe(AUTH_STATES.UNAUTHENTICATED);
            });

            await act(async () => {
                const result = await authContext.login('admin', 'test123');
                expect(result.requiresMfa).toBe(true);
            });

            expect(screen.getByTestId('status').textContent).toBe(AUTH_STATES.MFA_REQUIRED);
        });

        it('handles login failure', async () => {
            // First: session check returns unauthenticated
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
            });

            // Second: login fails
            global.fetch.mockResolvedValueOnce({
                ok: false,
                json: () => Promise.resolve({
                    error: 'Invalid credentials',
                    attemptsRemaining: 4,
                }),
            });

            let authContext;
            function Capture() {
                authContext = useAdminAuth();
                return <span data-testid="status">{authContext.status}</span>;
            }

            render(
                <AdminAuthProvider>
                    <Capture />
                </AdminAuthProvider>
            );

            await waitFor(() => {
                expect(authContext.status).toBe(AUTH_STATES.UNAUTHENTICATED);
            });

            await act(async () => {
                const result = await authContext.login('admin', 'wrongpassword');
                expect(result.success).toBe(false);
                expect(result.error).toBe('Invalid credentials');
                expect(result.attemptsRemaining).toBe(4);
            });
        });
    });

    describe('Logout Flow', () => {
        it('clears auth state on logout', async () => {
            // First: authenticated
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    valid: true,
                    admin: { id: 'admin', role: 'admin' },
                }),
            });

            // Logout API call
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true }),
            });

            let authContext;
            function Capture() {
                authContext = useAdminAuth();
                return <span data-testid="status">{authContext.status}</span>;
            }

            render(
                <AdminAuthProvider>
                    <Capture />
                </AdminAuthProvider>
            );

            await waitFor(() => {
                expect(authContext.isAuthenticated).toBe(true);
            });

            await act(async () => {
                await authContext.logout();
            });

            expect(screen.getByTestId('status').textContent).toBe(AUTH_STATES.UNAUTHENTICATED);
            expect(localStorage.removeItem).toHaveBeenCalledWith('adminToken');
            expect(sessionStorage.clear).toHaveBeenCalled();
        });
    });

    describe('AUTH_STATES', () => {
        it('exports all expected states', () => {
            expect(AUTH_STATES.LOADING).toBe('loading');
            expect(AUTH_STATES.AUTHENTICATED).toBe('authenticated');
            expect(AUTH_STATES.UNAUTHENTICATED).toBe('unauthenticated');
            expect(AUTH_STATES.MFA_REQUIRED).toBe('mfa_required');
            expect(AUTH_STATES.ERROR).toBe('error');
        });
    });
});

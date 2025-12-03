/**
 * useAdminApi Hook
 *
 * Custom hook for making authenticated API calls from admin pages.
 * Automatically includes credentials and CSRF tokens.
 */

import { useCallback, useState } from 'react';
import { useAdminAuth } from './useAdminAuth.js';

/**
 * API request options
 * @typedef {Object} ApiOptions
 * @property {string} [method='GET'] - HTTP method
 * @property {Object} [body] - Request body (will be JSON stringified)
 * @property {Object} [headers] - Additional headers
 * @property {boolean} [skipAuth=false] - Skip authentication check
 */

/**
 * Hook for making authenticated admin API calls
 * @returns {Object} API utilities
 */
export function useAdminApi() {
    const { csrfToken, isAuthenticated, logout } = useAdminAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    /**
     * Make an authenticated API request
     * @param {string} endpoint - API endpoint (e.g., '/api/admin/dashboard')
     * @param {ApiOptions} options - Request options
     * @returns {Promise<Object>} Response data
     */
    const request = useCallback(async (endpoint, options = {}) => {
        const {
            method = 'GET',
            body,
            headers = {},
            skipAuth = false,
        } = options;

        // Check authentication
        if (!skipAuth && !isAuthenticated) {
            throw new Error('Not authenticated');
        }

        setLoading(true);
        setError(null);

        try {
            const requestHeaders = {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
                ...headers,
            };

            // Add CSRF token for mutations
            if (csrfToken && method !== 'GET') {
                requestHeaders['X-CSRF-Token'] = csrfToken;
            }

            const response = await fetch(endpoint, {
                method,
                credentials: 'include', // Always send HttpOnly cookies
                headers: requestHeaders,
                body: body ? JSON.stringify(body) : undefined,
            });

            // Handle 401 - session expired
            if (response.status === 401) {
                logout();
                throw new Error('Session expired. Please log in again.');
            }

            // Handle 429 - rate limited
            if (response.status === 429) {
                const data = await response.json();
                throw new Error(data.error || 'Too many requests. Please try again later.');
            }

            // Handle other errors
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || `Request failed: ${response.status}`);
            }

            // Handle empty or non-JSON responses gracefully
            const text = await response.text();
            const data = text ? JSON.parse(text) : {};
            return data;
        } catch (err) {
            setError(err.message);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [csrfToken, isAuthenticated, logout]);

    /**
     * GET request helper
     */
    const get = useCallback((endpoint, options = {}) => {
        return request(endpoint, { ...options, method: 'GET' });
    }, [request]);

    /**
     * POST request helper
     */
    const post = useCallback((endpoint, body, options = {}) => {
        return request(endpoint, { ...options, method: 'POST', body });
    }, [request]);

    /**
     * PUT request helper
     */
    const put = useCallback((endpoint, body, options = {}) => {
        return request(endpoint, { ...options, method: 'PUT', body });
    }, [request]);

    /**
     * DELETE request helper
     */
    const del = useCallback((endpoint, options = {}) => {
        return request(endpoint, { ...options, method: 'DELETE' });
    }, [request]);

    /**
     * PATCH request helper
     */
    const patch = useCallback((endpoint, body, options = {}) => {
        return request(endpoint, { ...options, method: 'PATCH', body });
    }, [request]);

    return {
        request,
        get,
        post,
        put,
        del,
        patch,
        loading,
        error,
        clearError: () => setError(null),
    };
}

export default useAdminApi;

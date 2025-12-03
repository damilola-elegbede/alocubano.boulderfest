/**
 * AdminProviders Component
 *
 * Wraps admin pages with necessary context providers.
 *
 * Key differences from AppProviders:
 * 1. NO Cart/Payment providers (admin doesn't shop)
 * 2. ALWAYS dark theme (non-negotiable)
 * 3. AdminAuthContext instead of user auth
 */

import React, { useEffect } from 'react';
import { AdminAuthProvider } from '../contexts/admin/AdminAuthContext.jsx';

/**
 * AdminProviders - Provider wrapper for admin pages
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components
 */
export function AdminProviders({ children }) {
    // Enforce dark theme for admin pages
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', 'dark');

        // Prevent theme changes on admin pages
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (
                    mutation.type === 'attributes' &&
                    mutation.attributeName === 'data-theme'
                ) {
                    const currentTheme = document.documentElement.getAttribute('data-theme');
                    if (currentTheme !== 'dark') {
                        document.documentElement.setAttribute('data-theme', 'dark');
                    }
                }
            });
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme'],
        });

        return () => observer.disconnect();
    }, []);

    return (
        <AdminAuthProvider>
            {children}
        </AdminAuthProvider>
    );
}

export default AdminProviders;

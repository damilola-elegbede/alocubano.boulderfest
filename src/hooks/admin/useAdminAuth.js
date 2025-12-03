/**
 * useAdminAuth Hook
 *
 * Custom hook to access the AdminAuthContext.
 * Throws an error if used outside of AdminAuthProvider.
 */

import { useContext } from 'react';
import { AdminAuthContext } from '../../contexts/admin/AdminAuthContext.jsx';

/**
 * Hook to access admin authentication state and methods
 * @returns {Object} Admin auth context value
 * @throws {Error} If used outside AdminAuthProvider
 */
export function useAdminAuth() {
    const context = useContext(AdminAuthContext);

    if (context === null) {
        throw new Error(
            'useAdminAuth must be used within an AdminAuthProvider. ' +
            'Wrap your component tree with <AdminAuthProvider>.'
        );
    }

    return context;
}

export default useAdminAuth;

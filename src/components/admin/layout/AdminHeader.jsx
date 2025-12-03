/**
 * AdminHeader Component
 *
 * Header component for admin pages with title, subtitle, and action buttons.
 */

import React from 'react';
import { useAdminAuth } from '../../../hooks/admin/useAdminAuth.js';

/**
 * AdminHeader - Displays page title, subtitle, and action buttons
 *
 * @param {Object} props
 * @param {string} props.title - Page title
 * @param {string} [props.subtitle] - Optional subtitle
 * @param {React.ReactNode} [props.actions] - Optional action buttons
 */
export default function AdminHeader({ title, subtitle, actions }) {
    const { logout } = useAdminAuth();

    const handleLogout = async () => {
        await logout();
        window.location.href = '/admin/login';
    };

    return (
        <header className="admin-header">
            <div className="admin-header-content">
                <div>
                    <h1 className="admin-header-title">{title}</h1>
                    {subtitle && (
                        <p className="admin-header-subtitle">{subtitle}</p>
                    )}
                </div>
                <div className="admin-header-actions">
                    {actions}
                    <button
                        className="admin-btn admin-btn-primary"
                        onClick={handleLogout}
                        type="button"
                    >
                        <span>Logout</span>
                    </button>
                </div>
            </div>
        </header>
    );
}

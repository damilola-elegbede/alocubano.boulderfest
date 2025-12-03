/**
 * AdminBadge Component
 *
 * Status badge component for admin pages.
 */

import React from 'react';

/**
 * Badge variants
 */
const VARIANTS = {
    default: 'admin-badge',
    primary: 'admin-badge admin-badge-primary',
    success: 'admin-badge admin-badge-success',
    warning: 'admin-badge admin-badge-warning',
    danger: 'admin-badge admin-badge-danger',
    info: 'admin-badge admin-badge-info',
};

/**
 * AdminBadge - Status badge display
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Badge content
 * @param {string} [props.variant='default'] - Badge variant
 * @param {string} [props.className] - Additional CSS classes
 */
export default function AdminBadge({
    children,
    variant = 'default',
    className = '',
}) {
    return (
        <span className={`${VARIANTS[variant] || VARIANTS.default} ${className}`}>
            {children}
        </span>
    );
}

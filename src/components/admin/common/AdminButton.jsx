/**
 * AdminButton Component
 *
 * Styled button component for admin pages.
 */

import React from 'react';

/**
 * Button variants
 */
const VARIANTS = {
    default: 'admin-btn',
    primary: 'admin-btn admin-btn-primary',
    secondary: 'admin-btn admin-btn-secondary',
    success: 'admin-btn admin-btn-success',
    danger: 'admin-btn admin-btn-danger',
    warning: 'admin-btn admin-btn-warning',
};

/**
 * Button sizes
 */
const SIZES = {
    sm: 'admin-btn-sm',
    md: '',
    lg: 'admin-btn-lg',
};

/**
 * AdminButton - Styled button
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Button content
 * @param {string} [props.variant='default'] - Button variant
 * @param {string} [props.size='md'] - Button size
 * @param {boolean} [props.disabled] - Disabled state
 * @param {boolean} [props.loading] - Loading state
 * @param {string} [props.className] - Additional CSS classes
 * @param {string} [props.type='button'] - Button type
 * @param {Function} [props.onClick] - Click handler
 */
export default function AdminButton({
    children,
    variant = 'default',
    size = 'md',
    disabled = false,
    loading = false,
    className = '',
    type = 'button',
    onClick,
    ...rest
}) {
    const variantClass = VARIANTS[variant] || VARIANTS.default;
    const sizeClass = SIZES[size] || '';

    return (
        <button
            type={type}
            className={`${variantClass} ${sizeClass} ${className}`}
            disabled={disabled || loading}
            onClick={onClick}
            {...rest}
        >
            {loading ? (
                <>
                    <span className="admin-btn-spinner" />
                    <span>Loading...</span>
                </>
            ) : (
                <span>{children}</span>
            )}
        </button>
    );
}

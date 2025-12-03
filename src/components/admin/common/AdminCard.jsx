/**
 * AdminCard Component
 *
 * Card container for admin dashboard sections.
 */

import React from 'react';

/**
 * AdminCard - Card container with optional header
 *
 * @param {Object} props
 * @param {string} [props.title] - Card title
 * @param {React.ReactNode} [props.titleIcon] - Icon for title
 * @param {React.ReactNode} [props.actions] - Header action buttons
 * @param {React.ReactNode} props.children - Card content
 * @param {string} [props.className] - Additional CSS classes
 * @param {string} [props.variant] - Card variant (default, danger, warning, success)
 * @param {Object} [props.style] - Inline styles
 */
export default function AdminCard({
    title,
    titleIcon,
    actions,
    children,
    className = '',
    variant,
    style,
    ...rest
}) {
    const variantStyles = {
        danger: {
            background: 'var(--color-danger-bg, #fee)',
            borderLeft: '4px solid var(--color-danger, #e11d48)',
        },
        warning: {
            background: 'var(--color-warning-bg, #fff3cd)',
            borderLeft: '4px solid var(--color-warning, #f59e0b)',
        },
        success: {
            background: 'var(--color-success-bg, #d1fae5)',
            borderLeft: '4px solid var(--color-success, #10b981)',
        },
    };

    return (
        <div
            className={`admin-card ${className}`}
            style={style}
            {...rest}
        >
            {title && (
                <div
                    className="admin-card-header"
                    style={variant ? variantStyles[variant] : undefined}
                >
                    <h2
                        className="admin-card-title"
                        style={variant === 'danger' ? { color: 'var(--color-danger, #e11d48)' } : undefined}
                    >
                        {titleIcon && (
                            <span style={{ fontSize: '1.2em', marginRight: '8px' }}>
                                {titleIcon}
                            </span>
                        )}
                        {title}
                    </h2>
                    {actions && (
                        <div className="admin-card-actions">{actions}</div>
                    )}
                </div>
            )}
            <div className="admin-card-body">{children}</div>
        </div>
    );
}

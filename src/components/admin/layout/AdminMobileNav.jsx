/**
 * AdminMobileNav Component
 *
 * Mobile hamburger menu for admin navigation.
 */

import React, { useEffect, useRef } from 'react';

/**
 * Navigation configuration (same as AdminNavigation)
 */
const NAV_GROUPS = [
    {
        label: 'Core Tools',
        items: [
            { id: 'portal', href: '/admin', icon: '🏠', label: 'Portal' },
            { id: 'dashboard', href: '/admin/dashboard', icon: '📊', label: 'Dashboard' },
            { id: 'checkin', href: '/admin/checkin', icon: '📱', label: 'Check-in Scanner' },
            { id: 'manual-entry', href: '/admin/manual-entry', icon: '✏️', label: 'Manual Entry' },
        ],
    },
    {
        label: 'Data & Analytics',
        items: [
            { id: 'tickets', href: '/admin/tickets', icon: '🎫', label: 'Tickets' },
            { id: 'analytics', href: '/admin/analytics', icon: '📈', label: 'Analytics' },
            { id: 'donations', href: '/admin/donations', icon: '💝', label: 'Donations' },
        ],
    },
    {
        label: 'Utilities',
        items: [
            { id: 'test', href: '/admin/test', icon: '🧪', label: 'Test' },
            { id: 'api-endpoints', href: '/admin/api-endpoints', icon: '🔌', label: 'API Endpoints' },
            { id: 'audit-logs', href: '/admin/audit-logs', icon: '📋', label: 'Audit Logs' },
        ],
    },
];

/**
 * AdminMobileNav - Mobile hamburger menu toggle and overlay
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether menu is open
 * @param {Function} props.onToggle - Toggle handler
 * @param {string} props.currentPage - Current page for highlighting
 */
export default function AdminMobileNav({ isOpen, onToggle, currentPage }) {
    const menuRef = useRef(null);
    const buttonRef = useRef(null);

    // Close menu on outside click
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target) &&
                buttonRef.current &&
                !buttonRef.current.contains(e.target)
            ) {
                onToggle();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onToggle]);

    // Trap focus when menu is open
    useEffect(() => {
        if (!isOpen) return;

        const menuElement = menuRef.current;
        if (!menuElement) return;

        const focusableElements = menuElement.querySelectorAll(
            'a[href], button:not([disabled])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        const handleTabKey = (e) => {
            if (e.key !== 'Tab') return;

            if (e.shiftKey) {
                if (document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement.focus();
                }
            } else {
                if (document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement.focus();
                }
            }
        };

        document.addEventListener('keydown', handleTabKey);
        return () => document.removeEventListener('keydown', handleTabKey);
    }, [isOpen]);

    return (
        <>
            {/* Toggle Button */}
            <button
                ref={buttonRef}
                className={`admin-menu-toggle ${isOpen ? 'is-active' : ''}`}
                aria-label="Toggle navigation menu"
                aria-expanded={isOpen}
                aria-controls="mobile-nav-menu"
                onClick={onToggle}
                type="button"
            >
                <div className="admin-menu-icon">
                    <span />
                    <span />
                    <span />
                </div>
            </button>

            {/* Mobile Menu Overlay */}
            {isOpen && (
                <div
                    className="admin-mobile-overlay"
                    onClick={onToggle}
                    aria-hidden="true"
                />
            )}

            {/* Mobile Menu */}
            <nav
                ref={menuRef}
                id="mobile-nav-menu"
                className={`admin-mobile-nav ${isOpen ? 'is-open' : ''}`}
                aria-label="Mobile navigation"
            >
                <ul className="admin-nav-list">
                    {NAV_GROUPS.map((group, groupIndex) => (
                        <React.Fragment key={group.label}>
                            {groupIndex > 0 && (
                                <li
                                    role="presentation"
                                    aria-hidden="true"
                                    className="admin-nav-separator"
                                />
                            )}
                            <li role="presentation" className="admin-nav-group-header">
                                {group.label}
                            </li>
                            {group.items.map((item) => (
                                <li key={item.id} className="admin-nav-item">
                                    <a
                                        href={item.href}
                                        className={`admin-nav-link ${
                                            currentPage === item.id ? 'active' : ''
                                        }`}
                                        aria-current={
                                            currentPage === item.id ? 'page' : undefined
                                        }
                                        onClick={onToggle}
                                    >
                                        <span className="nav-icon">{item.icon}</span>
                                        <span>{item.label}</span>
                                    </a>
                                </li>
                            ))}
                        </React.Fragment>
                    ))}
                </ul>
            </nav>
        </>
    );
}

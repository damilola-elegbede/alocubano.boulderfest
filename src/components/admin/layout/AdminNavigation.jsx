/**
 * AdminNavigation Component
 *
 * Sidebar navigation for admin pages.
 */

import React from 'react';

/**
 * Navigation configuration
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
 * AdminNavigation - Sidebar navigation for admin pages
 *
 * @param {Object} props
 * @param {string} props.currentPage - Current page identifier for highlighting
 */
export default function AdminNavigation({ currentPage }) {
    return (
        <nav className="admin-navigation">
            <ul className="admin-nav-list">
                {NAV_GROUPS.map((group, groupIndex) => (
                    <React.Fragment key={group.label}>
                        {/* Add separator between groups (except first) */}
                        {groupIndex > 0 && (
                            <li
                                role="presentation"
                                aria-hidden="true"
                                className="admin-nav-separator"
                            />
                        )}

                        {/* Group header */}
                        <li role="presentation" className="admin-nav-group-header">
                            {group.label}
                        </li>

                        {/* Group items */}
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
                                >
                                    <span className="nav-icon">{item.icon}</span>
                                    <span>{item.label}</span>
                                </a>
                            </li>
                        ))}
                    </React.Fragment>
                ))}
            </ul>

            {/* Event Selector placeholder */}
            <div id="event-selector-container" />
        </nav>
    );
}

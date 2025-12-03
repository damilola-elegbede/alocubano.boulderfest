/**
 * Admin Portal Page
 *
 * Central administration hub with quick actions and navigation.
 */

import React, { useState, useCallback } from 'react';
import { AdminProviders } from '../../providers/AdminProviders.jsx';
import { useAdminAuth } from '../../hooks/admin/useAdminAuth.js';
import { useAdminApi } from '../../hooks/admin/useAdminApi.js';
import { AdminLayout } from '../../components/admin/layout/index.js';
import {
    AdminCard,
    AdminButton,
} from '../../components/admin/common/index.js';

/**
 * Status indicator component
 */
function StatusIndicator() {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-sm)',
            }}
        >
            <span
                style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'var(--color-success)',
                    animation: 'pulse 2s infinite',
                }}
            />
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                All Systems Operational
            </span>
        </div>
    );
}

/**
 * Action card component
 */
function ActionCard({ icon, title, description, actions, onClick }) {
    return (
        <div
            onClick={onClick}
            style={{
                background: 'var(--color-surface)',
                border: '2px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-xl)',
                cursor: onClick ? 'pointer' : 'default',
                transition: 'all var(--transition-base)',
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            {/* Top gradient bar */}
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: 'linear-gradient(90deg, var(--color-blue), var(--color-red))',
                }}
            />

            <div style={{ marginBottom: 'var(--space-md)' }}>
                <h2
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-md)',
                        fontFamily: 'var(--font-display)',
                        fontSize: 'var(--font-size-lg)',
                        fontWeight: 700,
                        margin: 0,
                    }}
                >
                    <span
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '36px',
                            height: '36px',
                            background: 'linear-gradient(135deg, var(--color-blue), var(--color-red))',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--color-text-inverse)',
                            fontWeight: 900,
                            fontSize: 'var(--font-size-sm)',
                        }}
                    >
                        {icon}
                    </span>
                    {title}
                </h2>
            </div>

            <p
                style={{
                    color: 'var(--color-text-secondary)',
                    lineHeight: 'var(--line-height-relaxed)',
                    marginBottom: actions ? 'var(--space-lg)' : 0,
                }}
            >
                {description}
            </p>

            {actions && (
                <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                    {actions}
                </div>
            )}
        </div>
    );
}

/**
 * Status badge component
 */
function StatusBadge({ variant, children }) {
    const colors = {
        success: { bg: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-success)' },
        info: { bg: 'rgba(91, 107, 181, 0.1)', color: 'var(--color-blue)' },
        pending: { bg: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' },
    };

    const style = colors[variant] || colors.info;

    return (
        <span
            style={{
                display: 'inline-block',
                padding: 'var(--space-xs) var(--space-sm)',
                background: style.bg,
                color: style.color,
                borderRadius: 'var(--radius-full)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 600,
            }}
        >
            {children}
        </span>
    );
}

/**
 * AdminPortalPageContent - Main content
 */
function AdminPortalPageContent() {
    const { isAuthenticated, csrfToken } = useAdminAuth();
    const { get, post } = useAdminApi();

    const [actionFeedback, setActionFeedback] = useState(null);

    /**
     * Test database health
     */
    const handleTestDatabase = useCallback(async () => {
        setActionFeedback({ type: 'loading', message: 'Testing database...' });

        try {
            const data = await get('/api/test-db');
            setActionFeedback({
                type: 'success',
                message: `Database healthy: ${data.message || 'Connected'}`,
            });
        } catch (error) {
            setActionFeedback({
                type: 'error',
                message: `Database error: ${error.message}`,
            });
        }

        setTimeout(() => setActionFeedback(null), 5000);
    }, [get]);

    /**
     * Clear cache
     */
    const handleClearCache = useCallback(async () => {
        setActionFeedback({ type: 'loading', message: 'Clearing cache...' });

        try {
            await post('/api/cache', { action: 'clear' });
            setActionFeedback({
                type: 'success',
                message: 'Cache cleared successfully',
            });
        } catch (error) {
            setActionFeedback({
                type: 'error',
                message: `Cache error: ${error.message}`,
            });
        }

        setTimeout(() => setActionFeedback(null), 5000);
    }, [post]);

    /**
     * Generate report
     */
    const handleGenerateReport = useCallback(() => {
        window.location.href = '/api/admin/generate-report?format=csv&type=tickets';
    }, []);

    /**
     * View CSRF token
     */
    const handleViewCSRF = useCallback(() => {
        if (csrfToken) {
            alert(`CSRF Token (first 20 chars): ${csrfToken.substring(0, 20)}...`);
        } else {
            alert('CSRF token not available');
        }
    }, [csrfToken]);

    /**
     * Open Google Sheets
     */
    const handleOpenSheets = useCallback(() => {
        window.open(
            'https://docs.google.com/spreadsheets/d/1wJ_KSJJpJtXl9fEqIhJVUDNTXHDCVJKfYKMnJITZyGs',
            '_blank'
        );
    }, []);

    // Header actions
    const headerActions = <StatusIndicator />;

    return (
        <AdminLayout
            title="Admin Portal"
            subtitle="A Lo Cubano Boulder Fest - Central Administration Hub"
            currentPage="portal"
            headerActions={headerActions}
        >
            {/* Action Feedback */}
            {actionFeedback && (
                <div
                    style={{
                        marginBottom: 'var(--space-xl)',
                        padding: 'var(--space-md)',
                        borderRadius: 'var(--radius-md)',
                        background:
                            actionFeedback.type === 'success'
                                ? 'rgba(16, 185, 129, 0.1)'
                                : actionFeedback.type === 'error'
                                    ? 'rgba(239, 68, 68, 0.1)'
                                    : 'rgba(91, 107, 181, 0.1)',
                        border: `1px solid ${actionFeedback.type === 'success'
                                ? 'var(--color-success)'
                                : actionFeedback.type === 'error'
                                    ? 'var(--color-error)'
                                    : 'var(--color-blue)'
                            }`,
                        color:
                            actionFeedback.type === 'success'
                                ? 'var(--color-success)'
                                : actionFeedback.type === 'error'
                                    ? 'var(--color-error)'
                                    : 'var(--color-blue)',
                    }}
                >
                    {actionFeedback.message}
                </div>
            )}

            {/* Quick Actions */}
            <AdminCard className="admin-mb-xl">
                <h2
                    style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 'var(--font-size-lg)',
                        fontWeight: 700,
                        marginBottom: 'var(--space-lg)',
                    }}
                >
                    Quick Actions
                </h2>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                        gap: 'var(--space-md)',
                    }}
                >
                    <AdminButton onClick={handleGenerateReport}>Export</AdminButton>
                    <AdminButton variant="default" onClick={handleTestDatabase}>
                        DB Health
                    </AdminButton>
                    <AdminButton variant="default" onClick={handleClearCache}>
                        Clear Cache
                    </AdminButton>
                </div>
            </AdminCard>

            {/* Admin Sections Grid */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
                    gap: 'var(--space-xl)',
                    marginBottom: 'var(--space-xl)',
                }}
            >
                {/* Dashboards & Analytics */}
                <ActionCard
                    icon="D"
                    title="Dashboards & Analytics"
                    description="Registration management, transactions, and comprehensive analytics with charts and insights. Use the navigation to access specific dashboard or analytics views."
                />

                {/* Authentication & Security */}
                <ActionCard
                    icon="S"
                    title="Authentication & Security"
                    description="Secure admin authentication, mobile auth testing, and CSRF token management"
                    actions={
                        <>
                            <AdminButton
                                size="sm"
                                onClick={() => (window.location.href = '/admin/login')}
                            >
                                Login
                            </AdminButton>
                            <AdminButton size="sm" variant="default" onClick={handleViewCSRF}>
                                CSRF Status
                            </AdminButton>
                        </>
                    }
                />

                {/* Data Management */}
                <ActionCard
                    icon="M"
                    title="Data Management"
                    description="Registration data, transaction history, and Google Sheets integration for comprehensive data access. Access detailed data views through the Dashboard."
                    actions={
                        <AdminButton size="sm" variant="default" onClick={handleOpenSheets}>
                            Open Sheets
                        </AdminButton>
                    }
                />

                {/* Tools & Utilities */}
                <ActionCard
                    icon="T"
                    title="Tools & Utilities"
                    description="Database health checks, cache management, system utilities, and comprehensive documentation. Common utilities are available in Quick Actions above."
                    actions={
                        <AdminButton
                            size="sm"
                            onClick={() =>
                                window.open(
                                    '/api/docs?path=ADMIN_DESIGN_SYSTEM.md',
                                    '_blank',
                                    'noopener,noreferrer'
                                )
                            }
                        >
                            Documentation
                        </AdminButton>
                    }
                />

                {/* Interactive API Portal */}
                <ActionCard
                    icon="A"
                    title="Interactive API Portal"
                    description="Advanced API testing and documentation portal with live endpoint testing, response inspection, search & filtering, and comprehensive interactive features."
                    onClick={() => (window.location.href = '/admin/api-endpoints')}
                    actions={
                        <>
                            <div
                                style={{
                                    display: 'flex',
                                    gap: 'var(--space-sm)',
                                    flexWrap: 'wrap',
                                    marginBottom: 'var(--space-md)',
                                }}
                            >
                                <StatusBadge variant="success">29 Endpoints</StatusBadge>
                                <StatusBadge variant="info">Live Testing</StatusBadge>
                                <StatusBadge variant="pending">Real-time</StatusBadge>
                            </div>
                            <div
                                style={{
                                    width: '100%',
                                    fontSize: 'var(--font-size-sm)',
                                    color: 'var(--color-text-tertiary)',
                                    marginBottom: 'var(--space-md)',
                                }}
                            >
                                Features: Search & Filter, Response Modal, Copy & Download, Toast
                                Notifications
                            </div>
                            <AdminButton
                                size="sm"
                                variant="primary"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    window.location.href = '/admin/api-endpoints';
                                }}
                            >
                                Open Interactive Portal
                            </AdminButton>
                        </>
                    }
                />
            </div>

            {/* Navigation Links */}
            <AdminCard>
                <h2
                    style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 'var(--font-size-lg)',
                        fontWeight: 700,
                        marginBottom: 'var(--space-lg)',
                    }}
                >
                    Quick Navigation
                </h2>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: 'var(--space-md)',
                    }}
                >
                    {[
                        { href: '/admin/dashboard', icon: '📊', label: 'Dashboard' },
                        { href: '/admin/tickets', icon: '🎫', label: 'Tickets' },
                        { href: '/admin/checkin', icon: '📱', label: 'Check-in Scanner' },
                        { href: '/admin/analytics', icon: '📈', label: 'Analytics' },
                        { href: '/admin/donations', icon: '💝', label: 'Donations' },
                        { href: '/admin/manual-entry', icon: '✏️', label: 'Manual Entry' },
                        { href: '/admin/audit-logs', icon: '📋', label: 'Audit Logs' },
                        { href: '/admin/mfa-settings', icon: '🔐', label: 'MFA Settings' },
                        { href: '/admin/test', icon: '🧪', label: 'Test Utilities' },
                        { href: '/admin/api-endpoints', icon: '🔌', label: 'API Endpoints' },
                        { href: '/admin/database-dashboard', icon: '🗄️', label: 'Database Monitor' },
                    ].map((link) => (
                        <a
                            key={link.href}
                            href={link.href}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-sm)',
                                padding: 'var(--space-md)',
                                background: 'var(--color-background-secondary)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-md)',
                                color: 'var(--color-text-primary)',
                                textDecoration: 'none',
                                transition: 'all var(--transition-base)',
                            }}
                        >
                            <span style={{ fontSize: '1.2rem' }}>{link.icon}</span>
                            <span style={{ fontWeight: 500 }}>{link.label}</span>
                        </a>
                    ))}
                </div>
            </AdminCard>
        </AdminLayout>
    );
}

/**
 * AdminPortalPage - Admin portal page with providers
 */
export default function AdminPortalPage() {
    return (
        <AdminProviders>
            <AdminPortalPageContent />
        </AdminProviders>
    );
}

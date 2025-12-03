/**
 * Admin Audit Logs Page
 *
 * Displays security audit logs for admin activity tracking.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AdminProviders } from '../../providers/AdminProviders.jsx';
import { useAdminAuth } from '../../hooks/admin/useAdminAuth.js';
import { useAdminApi } from '../../hooks/admin/useAdminApi.js';
import { AdminLayout } from '../../components/admin/layout/index.js';
import {
    AdminCard,
    AdminTable,
    AdminBadge,
    AdminButton,
    AdminPagination,
} from '../../components/admin/common/index.js';

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(unsafe) {
    if (unsafe == null) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Action badge component
 */
function ActionBadge({ action }) {
    const variants = {
        login: 'success',
        login_with_mfa: 'success',
        logout: 'info',
        view: 'default',
        create: 'primary',
        update: 'warning',
        delete: 'danger',
        export: 'info',
        failed_login: 'danger',
    };

    const actionVariant = Object.keys(variants).find(
        (key) => action?.toLowerCase().includes(key)
    );

    return (
        <AdminBadge variant={variants[actionVariant] || 'default'}>
            {escapeHtml(action || 'unknown')}
        </AdminBadge>
    );
}

/**
 * Success status indicator
 */
function SuccessIndicator({ success }) {
    return success ? (
        <span style={{ color: 'var(--color-success)' }}>✓</span>
    ) : (
        <span style={{ color: 'var(--color-danger)' }}>✗</span>
    );
}

/**
 * AuditLogsPageContent - Main content
 */
function AuditLogsPageContent() {
    const { isAuthenticated } = useAdminAuth();
    const { get } = useAdminApi();

    // State
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [totalCount, setTotalCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize] = useState(50);

    // Filters
    const [actionFilter, setActionFilter] = useState('');
    const [dateFilter, setDateFilter] = useState('7d');
    const [successFilter, setSuccessFilter] = useState('');

    /**
     * Load audit logs
     */
    const loadLogs = useCallback(
        async (page = 1) => {
            if (!isAuthenticated) return;

            setLoading(true);
            try {
                const params = new URLSearchParams();
                params.set('page', page.toString());
                params.set('limit', pageSize.toString());

                if (actionFilter) params.set('action', actionFilter);
                if (dateFilter) params.set('period', dateFilter);
                if (successFilter) params.set('success', successFilter);

                const data = await get(`/api/admin/audit-logs?${params.toString()}`);
                setLogs(data.logs || []);
                setTotalCount(data.total || 0);
                setCurrentPage(page);
            } catch (error) {
                console.error('Failed to load audit logs:', error);
            } finally {
                setLoading(false);
            }
        },
        [isAuthenticated, get, pageSize, actionFilter, dateFilter, successFilter]
    );

    /**
     * Initial load and reload when filters change
     */
    useEffect(() => {
        if (isAuthenticated) {
            loadLogs(1);
        }
    }, [isAuthenticated, loadLogs, actionFilter, dateFilter, successFilter]);

    /**
     * Export logs
     */
    const handleExport = () => {
        const params = new URLSearchParams();
        if (actionFilter) params.set('action', actionFilter);
        if (dateFilter) params.set('period', dateFilter);
        if (successFilter) params.set('success', successFilter);
        params.set('format', 'csv');

        window.location.href = `/api/admin/audit-logs/export?${params.toString()}`;
    };

    /**
     * Table columns
     */
    const columns = [
        {
            key: 'created_at',
            label: 'Timestamp',
            render: (value, row) => (
                <span style={{ fontFamily: 'var(--font-code)', fontSize: '0.85em' }}>
                    {escapeHtml(row.created_at_mt || value || 'N/A')}
                </span>
            ),
        },
        {
            key: 'action',
            label: 'Action',
            render: (value) => <ActionBadge action={value} />,
        },
        {
            key: 'session_token',
            label: 'Session',
            render: (value) => (
                <code
                    style={{
                        background: 'var(--color-background-secondary)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.8em',
                    }}
                >
                    {escapeHtml(value?.slice(0, 8) || 'N/A')}...
                </code>
            ),
        },
        {
            key: 'ip_address',
            label: 'IP Address',
            render: (value) => (
                <span style={{ fontFamily: 'var(--font-code)', fontSize: '0.85em' }}>
                    {escapeHtml(value || 'N/A')}
                </span>
            ),
        },
        {
            key: 'user_agent',
            label: 'User Agent',
            render: (value) => (
                <div
                    style={{
                        maxWidth: '200px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '0.85em',
                    }}
                    title={value || ''}
                >
                    {escapeHtml(value || 'N/A')}
                </div>
            ),
        },
        {
            key: 'success',
            label: 'Status',
            align: 'center',
            render: (value) => <SuccessIndicator success={value} />,
        },
        {
            key: 'request_details',
            label: 'Details',
            render: (value) => {
                if (!value) return '-';
                try {
                    const details = typeof value === 'string' ? JSON.parse(value) : value;
                    return (
                        <button
                            onClick={() => alert(JSON.stringify(details, null, 2))}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--color-blue)',
                                cursor: 'pointer',
                                textDecoration: 'underline',
                            }}
                        >
                            View
                        </button>
                    );
                } catch {
                    return '-';
                }
            },
        },
    ];

    // Header actions
    const headerActions = (
        <AdminButton variant="success" onClick={handleExport}>
            Export Logs
        </AdminButton>
    );

    return (
        <AdminLayout
            title="Audit Logs"
            subtitle="A Lo Cubano Boulder Fest - Security Activity Log"
            currentPage="audit-logs"
            headerActions={headerActions}
        >
            <AdminCard className="admin-mb-xl">
                {/* Filters */}
                <div className="admin-flex admin-flex-wrap admin-gap-md admin-mb-xl">
                    <select
                        className="admin-form-select"
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                        style={{ minWidth: '150px' }}
                    >
                        <option value="1d">Last 24 Hours</option>
                        <option value="7d">Last 7 Days</option>
                        <option value="30d">Last 30 Days</option>
                        <option value="90d">Last 90 Days</option>
                    </select>
                    <select
                        className="admin-form-select"
                        value={actionFilter}
                        onChange={(e) => setActionFilter(e.target.value)}
                        style={{ minWidth: '150px' }}
                    >
                        <option value="">All Actions</option>
                        <option value="login">Login</option>
                        <option value="logout">Logout</option>
                        <option value="view">View</option>
                        <option value="create">Create</option>
                        <option value="update">Update</option>
                        <option value="delete">Delete</option>
                        <option value="export">Export</option>
                    </select>
                    <select
                        className="admin-form-select"
                        value={successFilter}
                        onChange={(e) => setSuccessFilter(e.target.value)}
                        style={{ minWidth: '120px' }}
                    >
                        <option value="">All Status</option>
                        <option value="true">Success</option>
                        <option value="false">Failed</option>
                    </select>
                    <AdminButton onClick={() => loadLogs(1)}>
                        Refresh
                    </AdminButton>
                </div>

                {/* Results count */}
                <div className="admin-mb-md">
                    <span className="admin-text-secondary">
                        {totalCount} log entr{totalCount !== 1 ? 'ies' : 'y'} found
                    </span>
                </div>

                {/* Table */}
                <AdminTable
                    columns={columns}
                    data={logs}
                    loading={loading}
                    emptyMessage="No audit logs found for the selected filters"
                />

                {/* Pagination */}
                <AdminPagination
                    currentPage={currentPage}
                    totalPages={Math.ceil(totalCount / pageSize)}
                    totalItems={totalCount}
                    pageSize={pageSize}
                    onPageChange={loadLogs}
                    className="admin-mt-xl"
                />
            </AdminCard>
        </AdminLayout>
    );
}

/**
 * AuditLogsPage - Admin audit logs page with providers
 */
export default function AuditLogsPage() {
    return (
        <AdminProviders>
            <AuditLogsPageContent />
        </AdminProviders>
    );
}

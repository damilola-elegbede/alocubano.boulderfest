/**
 * Admin Donations Page
 *
 * Manages donation records with filtering and export functionality.
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
    AdminStatsCard,
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
 * Format currency
 */
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(amount || 0);
}

/**
 * Donation status badge
 */
function DonationStatusBadge({ status }) {
    const variants = {
        completed: 'success',
        succeeded: 'success',
        pending: 'warning',
        failed: 'danger',
        refunded: 'info',
    };
    return (
        <AdminBadge variant={variants[status] || 'default'}>
            {escapeHtml(status || 'unknown')}
        </AdminBadge>
    );
}

/**
 * Payment processor icon
 */
function PaymentIcon({ processor }) {
    const icons = {
        stripe: '💳',
        paypal: '🅿️',
        venmo: '📱',
    };
    return (
        <span>
            {icons[processor] || '❓'} {escapeHtml(processor || 'N/A')}
        </span>
    );
}

/**
 * DonationsStatsGrid - Summary statistics
 */
function DonationsStatsGrid({ stats, loading }) {
    if (loading) {
        return (
            <div className="admin-grid auto-fit admin-mb-xl">
                <AdminStatsCard loading />
                <AdminStatsCard loading />
                <AdminStatsCard loading />
                <AdminStatsCard loading />
            </div>
        );
    }

    return (
        <div className="admin-grid auto-fit admin-mb-xl">
            <AdminStatsCard
                icon="💰"
                title="Total Donations"
                value={formatCurrency(stats?.totalAmount || 0)}
                subtitle={`${stats?.totalCount || 0} donations`}
            />
            <AdminStatsCard
                icon="📅"
                title="This Month"
                value={formatCurrency(stats?.monthlyAmount || 0)}
                subtitle={`${stats?.monthlyCount || 0} donations`}
            />
            <AdminStatsCard
                icon="📊"
                title="Average Donation"
                value={formatCurrency(stats?.averageAmount || 0)}
                subtitle="Per donation"
            />
            <AdminStatsCard
                icon="🎯"
                title="Recurring"
                value={stats?.recurringCount || 0}
                subtitle="Active recurring donors"
            />
        </div>
    );
}

/**
 * DonationsPageContent - Main content
 */
function DonationsPageContent() {
    const { isAuthenticated } = useAdminAuth();
    const { get } = useAdminApi();

    // State
    const [donations, setDonations] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [statsLoading, setStatsLoading] = useState(true);
    const [totalCount, setTotalCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize] = useState(25);

    // Filters
    const [statusFilter, setStatusFilter] = useState('');
    const [processorFilter, setProcessorFilter] = useState('');
    const [dateFilter, setDateFilter] = useState('all');
    const [hideTestDonations, setHideTestDonations] = useState(true);

    /**
     * Load donations
     */
    const loadDonations = useCallback(
        async (page = 1) => {
            if (!isAuthenticated) return;

            setLoading(true);
            try {
                const params = new URLSearchParams();
                params.set('page', page.toString());
                params.set('limit', pageSize.toString());

                if (statusFilter) params.set('status', statusFilter);
                if (processorFilter) params.set('processor', processorFilter);
                if (dateFilter && dateFilter !== 'all') params.set('period', dateFilter);
                if (hideTestDonations) params.set('excludeTest', 'true');

                const data = await get(`/api/admin/donations?${params.toString()}`);
                setDonations(data.donations || []);
                setTotalCount(data.total || 0);
                setCurrentPage(page);
            } catch (error) {
                console.error('Failed to load donations:', error);
            } finally {
                setLoading(false);
            }
        },
        [isAuthenticated, get, pageSize, statusFilter, processorFilter, dateFilter, hideTestDonations]
    );

    /**
     * Load statistics
     */
    const loadStats = useCallback(async () => {
        if (!isAuthenticated) return;

        setStatsLoading(true);
        try {
            const data = await get('/api/admin/donations/stats');
            setStats(data);
        } catch (error) {
            console.error('Failed to load donation stats:', error);
        } finally {
            setStatsLoading(false);
        }
    }, [isAuthenticated, get]);

    /**
     * Export to CSV
     */
    const handleExport = () => {
        const params = new URLSearchParams();
        if (statusFilter) params.set('status', statusFilter);
        if (processorFilter) params.set('processor', processorFilter);
        if (dateFilter && dateFilter !== 'all') params.set('period', dateFilter);
        if (hideTestDonations) params.set('excludeTest', 'true');
        params.set('format', 'csv');

        window.location.href = `/api/admin/donations/export?${params.toString()}`;
    };

    /**
     * Initial load
     */
    useEffect(() => {
        if (isAuthenticated) {
            loadDonations(1);
            loadStats();
        }
    }, [isAuthenticated, loadDonations, loadStats]);

    /**
     * Reload when filters change
     */
    useEffect(() => {
        if (isAuthenticated) {
            loadDonations(1);
        }
    }, [statusFilter, processorFilter, dateFilter, hideTestDonations]);

    /**
     * Table columns
     */
    const columns = [
        {
            key: 'donation_id',
            label: 'ID',
            render: (value) => (
                <code
                    style={{
                        background: 'var(--color-background-secondary)',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '0.85em',
                    }}
                >
                    {escapeHtml(value?.slice(0, 8))}...
                </code>
            ),
        },
        {
            key: 'donor_name',
            label: 'Donor',
            render: (value, row) => (
                <div>
                    <div>{escapeHtml(value || 'Anonymous')}</div>
                    <div style={{ fontSize: '0.85em', color: 'var(--color-text-secondary)' }}>
                        {escapeHtml(row.donor_email || '')}
                    </div>
                </div>
            ),
        },
        {
            key: 'amount',
            label: 'Amount',
            align: 'right',
            render: (value, row) => (
                <div>
                    <div style={{ fontWeight: 600 }}>{formatCurrency(value)}</div>
                    {row.is_test && (
                        <AdminBadge variant="warning">TEST</AdminBadge>
                    )}
                </div>
            ),
        },
        {
            key: 'status',
            label: 'Status',
            render: (value) => <DonationStatusBadge status={value} />,
        },
        {
            key: 'payment_processor',
            label: 'Payment',
            render: (value) => <PaymentIcon processor={value} />,
        },
        {
            key: 'message',
            label: 'Message',
            render: (value) => (
                <div
                    style={{
                        maxWidth: '200px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                    title={value || ''}
                >
                    {escapeHtml(value || '-')}
                </div>
            ),
        },
        {
            key: 'created_at',
            label: 'Date',
            render: (value, row) => escapeHtml(row.created_at_mt || value || 'N/A'),
        },
    ];

    // Header actions
    const headerActions = (
        <AdminButton variant="success" onClick={handleExport}>
            Export CSV
        </AdminButton>
    );

    return (
        <AdminLayout
            title="Donations"
            subtitle="A Lo Cubano Boulder Fest - Donation Management"
            currentPage="donations"
            headerActions={headerActions}
        >
            {/* Stats Grid */}
            <DonationsStatsGrid stats={stats} loading={statsLoading} />

            {/* Donations Table */}
            <AdminCard className="admin-mb-xl">
                {/* Filters */}
                <div className="admin-flex admin-flex-wrap admin-gap-md admin-mb-xl">
                    <select
                        className="admin-form-select"
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                        style={{ minWidth: '150px' }}
                    >
                        <option value="all">All Time</option>
                        <option value="today">Today</option>
                        <option value="7d">Last 7 Days</option>
                        <option value="30d">Last 30 Days</option>
                        <option value="90d">Last 90 Days</option>
                    </select>
                    <select
                        className="admin-form-select"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        style={{ minWidth: '120px' }}
                    >
                        <option value="">All Status</option>
                        <option value="completed">Completed</option>
                        <option value="pending">Pending</option>
                        <option value="failed">Failed</option>
                        <option value="refunded">Refunded</option>
                    </select>
                    <select
                        className="admin-form-select"
                        value={processorFilter}
                        onChange={(e) => setProcessorFilter(e.target.value)}
                        style={{ minWidth: '150px' }}
                    >
                        <option value="">All Payment Methods</option>
                        <option value="stripe">Stripe</option>
                        <option value="paypal">PayPal</option>
                        <option value="venmo">Venmo</option>
                    </select>
                    <label
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={hideTestDonations}
                            onChange={(e) => setHideTestDonations(e.target.checked)}
                        />
                        <span>Hide test donations</span>
                    </label>
                </div>

                {/* Results count */}
                <div className="admin-mb-md">
                    <span className="admin-text-secondary">
                        {totalCount} donation{totalCount !== 1 ? 's' : ''} found
                    </span>
                </div>

                {/* Table */}
                <AdminTable
                    columns={columns}
                    data={donations}
                    loading={loading}
                    emptyMessage="No donations found matching your criteria"
                />

                {/* Pagination */}
                <AdminPagination
                    currentPage={currentPage}
                    totalPages={Math.ceil(totalCount / pageSize)}
                    totalItems={totalCount}
                    pageSize={pageSize}
                    onPageChange={loadDonations}
                    className="admin-mt-xl"
                />
            </AdminCard>
        </AdminLayout>
    );
}

/**
 * DonationsPage - Admin donations page with providers
 */
export default function DonationsPage() {
    return (
        <AdminProviders>
            <DonationsPageContent />
        </AdminProviders>
    );
}

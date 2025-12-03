/**
 * Admin Registrations Page
 *
 * Manages festival registrations with search, filter, and export functionality.
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
 * Format currency
 */
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(amount || 0);
}

/**
 * Registration status badge
 */
function StatusBadge({ status }) {
    const variants = {
        valid: 'success',
        active: 'success',
        cancelled: 'danger',
        transferred: 'warning',
        refunded: 'warning',
        pending: 'info',
    };
    return (
        <AdminBadge variant={variants[status] || 'default'}>
            {escapeHtml(status || 'unknown')}
        </AdminBadge>
    );
}

/**
 * Payment method icon and label
 */
function PaymentMethod({ processor }) {
    const icons = {
        stripe: '💳',
        paypal: '🅿️',
        venmo: '📱',
        cash: '💵',
        card_terminal: '💳',
        comp: '🎁',
    };
    return (
        <span>
            {icons[processor] || '❓'} {escapeHtml(processor || 'N/A')}
        </span>
    );
}

/**
 * RegistrationsPageContent - Main content
 */
function RegistrationsPageContent() {
    const { isAuthenticated } = useAdminAuth();
    const { get } = useAdminApi();

    // State
    const [registrations, setRegistrations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [totalCount, setTotalCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize] = useState(50);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [paymentFilter, setPaymentFilter] = useState('');
    const [checkinFilter, setCheckinFilter] = useState('');
    const [eventFilter, setEventFilter] = useState('');

    // Events list for filter dropdown
    const [events, setEvents] = useState([]);

    /**
     * Load registrations
     */
    const loadRegistrations = useCallback(
        async (page = 1) => {
            if (!isAuthenticated) return;

            setLoading(true);
            try {
                const params = new URLSearchParams();
                params.set('page', page.toString());
                params.set('limit', pageSize.toString());

                if (searchTerm) params.set('search', searchTerm);
                if (statusFilter) params.set('status', statusFilter);
                if (paymentFilter) params.set('paymentMethod', paymentFilter);
                if (checkinFilter) params.set('checkedIn', checkinFilter);
                if (eventFilter) params.set('eventId', eventFilter);

                const data = await get(`/api/admin/registrations?${params.toString()}`);
                setRegistrations(data.registrations || []);
                setTotalCount(data.total || 0);
                setCurrentPage(page);
            } catch (error) {
                console.error('Failed to load registrations:', error);
            } finally {
                setLoading(false);
            }
        },
        [isAuthenticated, get, pageSize, searchTerm, statusFilter, paymentFilter, checkinFilter, eventFilter]
    );

    /**
     * Load events for filter dropdown
     */
    const loadEvents = useCallback(async () => {
        if (!isAuthenticated) return;

        try {
            const data = await get('/api/admin/dashboard');
            setEvents(data.events || []);
        } catch (error) {
            console.error('Failed to load events:', error);
        }
    }, [isAuthenticated, get]);

    /**
     * Handle search
     */
    const handleSearch = () => {
        loadRegistrations(1);
    };

    /**
     * Handle filter change
     */
    const handleFilterChange = (setter) => (e) => {
        setter(e.target.value);
    };

    /**
     * Export to CSV
     */
    const handleExport = async () => {
        try {
            const params = new URLSearchParams();
            if (searchTerm) params.set('search', searchTerm);
            if (statusFilter) params.set('status', statusFilter);
            if (paymentFilter) params.set('paymentMethod', paymentFilter);
            if (checkinFilter) params.set('checkedIn', checkinFilter);
            if (eventFilter) params.set('eventId', eventFilter);
            params.set('format', 'csv');

            // Trigger download
            window.location.href = `/api/admin/registrations/export?${params.toString()}`;
        } catch (error) {
            console.error('Failed to export:', error);
            alert('Export failed: ' + error.message);
        }
    };

    /**
     * Initial load
     */
    useEffect(() => {
        if (isAuthenticated) {
            loadRegistrations(1);
            loadEvents();
        }
    }, [isAuthenticated, loadRegistrations, loadEvents]);

    /**
     * Table columns
     */
    const columns = [
        {
            key: 'ticket_id',
            label: 'Ticket ID',
            render: (value) => (
                <a
                    href={`/admin/ticket-detail?ticketId=${escapeHtml(value)}`}
                    style={{ textDecoration: 'none' }}
                >
                    <code
                        style={{
                            background: 'var(--color-background-secondary)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                        }}
                    >
                        {escapeHtml(value?.slice(0, 8))}...
                    </code>
                </a>
            ),
        },
        {
            key: 'full_name',
            label: 'Name',
            render: (value) => escapeHtml(value || 'N/A'),
        },
        {
            key: 'email',
            label: 'Email',
            render: (value) => escapeHtml(value || 'N/A'),
        },
        {
            key: 'ticket_type',
            label: 'Ticket Type',
            render: (value) => escapeHtml(value || 'N/A'),
        },
        {
            key: 'amount_paid',
            label: 'Amount',
            align: 'right',
            render: (value) => formatCurrency(value),
        },
        {
            key: 'status',
            label: 'Status',
            render: (value) => <StatusBadge status={value} />,
        },
        {
            key: 'payment_processor',
            label: 'Payment',
            render: (value) => <PaymentMethod processor={value} />,
        },
        {
            key: 'is_checked_in',
            label: 'Checked In',
            render: (value) =>
                value ? (
                    <AdminBadge variant="success">Yes</AdminBadge>
                ) : (
                    <AdminBadge variant="default">No</AdminBadge>
                ),
        },
        {
            key: 'created_at',
            label: 'Created',
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
            title="Registrations"
            subtitle="A Lo Cubano Boulder Fest - Registration Management"
            currentPage="registrations"
            headerActions={headerActions}
        >
            <AdminCard className="admin-mb-xl">
                {/* Filters */}
                <div className="admin-flex admin-flex-wrap admin-gap-md admin-mb-xl">
                    <input
                        type="text"
                        className="admin-form-input"
                        placeholder="Search by name, email, or ticket ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                        style={{ flex: 1, minWidth: '250px' }}
                    />
                    <select
                        className="admin-form-select"
                        value={eventFilter}
                        onChange={handleFilterChange(setEventFilter)}
                        style={{ minWidth: '150px' }}
                    >
                        <option value="">All Events</option>
                        {events.map((event) => (
                            <option key={event.id} value={event.id}>
                                {escapeHtml(event.name)}
                            </option>
                        ))}
                    </select>
                    <select
                        className="admin-form-select"
                        value={statusFilter}
                        onChange={handleFilterChange(setStatusFilter)}
                        style={{ minWidth: '120px' }}
                    >
                        <option value="">All Status</option>
                        <option value="valid">Valid</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="transferred">Transferred</option>
                        <option value="refunded">Refunded</option>
                    </select>
                    <select
                        className="admin-form-select"
                        value={paymentFilter}
                        onChange={handleFilterChange(setPaymentFilter)}
                        style={{ minWidth: '150px' }}
                    >
                        <option value="">All Payment Methods</option>
                        <option value="stripe">Stripe</option>
                        <option value="paypal">PayPal</option>
                        <option value="venmo">Venmo</option>
                        <option value="cash">Cash</option>
                        <option value="comp">Complimentary</option>
                    </select>
                    <select
                        className="admin-form-select"
                        value={checkinFilter}
                        onChange={handleFilterChange(setCheckinFilter)}
                        style={{ minWidth: '150px' }}
                    >
                        <option value="">All Check-in Status</option>
                        <option value="false">Not Checked In</option>
                        <option value="true">Checked In</option>
                    </select>
                    <AdminButton variant="primary" onClick={handleSearch}>
                        Search
                    </AdminButton>
                </div>

                {/* Results count */}
                <div className="admin-mb-md">
                    <span className="admin-text-secondary">
                        {totalCount} registration{totalCount !== 1 ? 's' : ''} found
                    </span>
                </div>

                {/* Table */}
                <AdminTable
                    columns={columns}
                    data={registrations}
                    loading={loading}
                    emptyMessage="No registrations found matching your criteria"
                />

                {/* Pagination */}
                <AdminPagination
                    currentPage={currentPage}
                    totalPages={Math.ceil(totalCount / pageSize)}
                    totalItems={totalCount}
                    pageSize={pageSize}
                    onPageChange={loadRegistrations}
                    className="admin-mt-xl"
                />
            </AdminCard>
        </AdminLayout>
    );
}

/**
 * RegistrationsPage - Admin registrations page with providers
 */
export default function RegistrationsPage() {
    return (
        <AdminProviders>
            <RegistrationsPageContent />
        </AdminProviders>
    );
}

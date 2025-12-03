/**
 * Admin Dashboard Page
 *
 * Main dashboard with statistics, flagged tickets, and registrations.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AdminProviders } from '../../providers/AdminProviders.jsx';
import { useAdminAuth } from '../../hooks/admin/useAdminAuth.js';
import { useAdminApi } from '../../hooks/admin/useAdminApi.js';
import { AdminLayout } from '../../components/admin/layout/index.js';
import { AdminCard, AdminStatsCard, AdminBadge, AdminButton } from '../../components/admin/common/index.js';

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
 * StatsGrid - Dashboard statistics cards
 */
function StatsGrid({ stats, loading }) {
    if (loading) {
        return (
            <section className="admin-grid auto-fit" role="region" aria-labelledby="stats-heading">
                <h2 id="stats-heading" className="visually-hidden">Dashboard Statistics</h2>
                <div className="admin-loading">Loading statistics...</div>
            </section>
        );
    }

    if (!stats) {
        return null;
    }

    return (
        <section className="admin-grid auto-fit" role="region" aria-labelledby="stats-heading" data-testid="dashboard-stats">
            <h2 id="stats-heading" className="visually-hidden">Dashboard Statistics</h2>

            <AdminStatsCard
                icon="🎫"
                title="Total Tickets"
                value={stats.totalTickets || 0}
                subtitle={`${stats.checkedIn || 0} checked in`}
            />

            <AdminStatsCard
                icon="💰"
                title="Total Revenue"
                value={`$${(stats.totalRevenue || 0).toLocaleString()}`}
                subtitle="All payments"
            />

            <AdminStatsCard
                icon="📧"
                title="Unique Emails"
                value={stats.uniqueEmails || 0}
                subtitle="Registered attendees"
            />

            <AdminStatsCard
                icon="✅"
                title="Check-in Rate"
                value={`${Math.round((stats.checkedIn / (stats.totalTickets || 1)) * 100)}%`}
                subtitle={`${stats.checkedIn || 0} of ${stats.totalTickets || 0}`}
            />
        </section>
    );
}

/**
 * FlaggedTicketsSection - Security alert section
 */
function FlaggedTicketsSection({ tickets, total, onAction, loading }) {
    const [expandedTickets, setExpandedTickets] = useState(new Set());

    const toggleDetails = (ticketId) => {
        setExpandedTickets((prev) => {
            const next = new Set(prev);
            if (next.has(ticketId)) {
                next.delete(ticketId);
            } else {
                next.add(ticketId);
            }
            return next;
        });
    };

    if (loading) {
        return (
            <AdminCard
                title="Flagged Tickets - Security Review Required"
                titleIcon="⚠️"
                variant="danger"
                actions={<AdminBadge variant="danger">Loading...</AdminBadge>}
            >
                <div className="admin-loading">Loading flagged tickets...</div>
            </AdminCard>
        );
    }

    if (!total || total === 0) {
        return null; // Hide section when no flagged tickets
    }

    const getSeverityClass = (severity) => {
        const classes = {
            critical: 'danger',
            high: 'warning',
            medium: 'info',
            low: 'default',
        };
        return classes[severity] || 'default';
    };

    const getSeverityIcon = (severity) => {
        const icons = {
            critical: '🔴',
            high: '🟠',
            medium: '🟡',
            low: '⚪',
        };
        return icons[severity] || '⚪';
    };

    return (
        <AdminCard
            title="Flagged Tickets - Security Review Required"
            titleIcon="⚠️"
            variant="danger"
            actions={<AdminBadge variant="danger">{total} flagged</AdminBadge>}
            className="admin-mb-xl"
        >
            <div
                style={{
                    background: 'var(--color-warning-bg, #fff3cd)',
                    padding: '12px',
                    borderRadius: '4px',
                    marginBottom: '16px',
                }}
            >
                <p style={{ margin: 0, color: 'var(--color-text-primary)' }}>
                    <strong>Security Notice:</strong> These tickets were flagged due to suspicious
                    webhook metadata (price tampering, invalid ticket types, etc.). Review validation
                    errors and take action.
                </p>
            </div>

            <div className="admin-table-responsive">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>Ticket ID</th>
                            <th>Order ID</th>
                            <th>Severity</th>
                            <th>Validation Errors</th>
                            <th>Created</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tickets.map((ticket) => (
                            <tr key={ticket.ticket_id}>
                                <td>
                                    <a
                                        href={`/admin/ticket-detail?ticketId=${escapeHtml(ticket.ticket_id)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ textDecoration: 'none' }}
                                    >
                                        <code
                                            style={{
                                                background: 'var(--color-background-secondary)',
                                                padding: '4px 8px',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {escapeHtml(ticket.ticket_id)}
                                        </code>
                                    </a>
                                </td>
                                <td>{escapeHtml(ticket.order_id || 'N/A')}</td>
                                <td>
                                    <AdminBadge variant={getSeverityClass(ticket.severity)}>
                                        {getSeverityIcon(ticket.severity)}{' '}
                                        {escapeHtml(ticket.severity?.toUpperCase() || 'UNKNOWN')}
                                    </AdminBadge>
                                </td>
                                <td>
                                    <AdminButton
                                        size="sm"
                                        onClick={() => toggleDetails(ticket.ticket_id)}
                                    >
                                        View Details
                                    </AdminButton>
                                    {expandedTickets.has(ticket.ticket_id) && (
                                        <ul
                                            style={{
                                                margin: '8px 0',
                                                paddingLeft: '20px',
                                                fontSize: '0.9em',
                                            }}
                                        >
                                            {(ticket.validation_errors || []).length > 0
                                                ? ticket.validation_errors.map((err, i) => (
                                                      <li key={i}>{escapeHtml(err)}</li>
                                                  ))
                                                : <li>No validation errors recorded</li>}
                                        </ul>
                                    )}
                                </td>
                                <td>
                                    {escapeHtml(ticket.created_at_display || ticket.created_at || 'N/A')}
                                </td>
                                <td>
                                    <AdminButton
                                        size="sm"
                                        variant="success"
                                        onClick={() => onAction(ticket.ticket_id, 'mark_safe')}
                                        style={{ marginRight: '4px' }}
                                    >
                                        Mark Safe
                                    </AdminButton>
                                    <AdminButton
                                        size="sm"
                                        variant="danger"
                                        onClick={() => onAction(ticket.ticket_id, 'cancel_ticket')}
                                    >
                                        Cancel
                                    </AdminButton>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </AdminCard>
    );
}

/**
 * RegistrationsSection - Recent registrations table
 */
function RegistrationsSection({ registrations, loading, onSearch, filters }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [paymentFilter, setPaymentFilter] = useState('');
    const [checkinFilter, setCheckinFilter] = useState('');

    const handleSearch = (overrideSearch, overrideStatus, overridePayment, overrideCheckin) => {
        onSearch({
            search: overrideSearch !== undefined ? overrideSearch : searchTerm,
            status: overrideStatus !== undefined ? overrideStatus : statusFilter,
            paymentMethod: overridePayment !== undefined ? overridePayment : paymentFilter,
            checkedIn: overrideCheckin !== undefined ? overrideCheckin : checkinFilter,
        });
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    return (
        <AdminCard
            title="Registrations"
            actions={
                <AdminButton size="sm" onClick={() => {}}>
                    Export CSV
                </AdminButton>
            }
            className="admin-mb-xl"
        >
            <div className="admin-flex admin-flex-wrap admin-gap-md admin-mb-xl">
                <input
                    type="text"
                    className="admin-form-input"
                    placeholder="Search by name, email, or ticket ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={handleKeyPress}
                    data-testid="search-registrations"
                    style={{ flex: 1, minWidth: '250px' }}
                />
                <select
                    className="admin-form-select"
                    value={statusFilter}
                    onChange={(e) => {
                        const newValue = e.target.value;
                        setStatusFilter(newValue);
                        // Use the new value directly to avoid race condition
                        handleSearch(undefined, newValue);
                    }}
                    data-testid="ticket-type-filter"
                    style={{ minWidth: '120px' }}
                >
                    <option value="">All Status</option>
                    <option value="valid">Valid</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="transferred">Transferred</option>
                </select>
                <select
                    className="admin-form-select"
                    value={paymentFilter}
                    onChange={(e) => {
                        const newValue = e.target.value;
                        setPaymentFilter(newValue);
                        // Use the new value directly to avoid race condition
                        handleSearch(undefined, undefined, newValue);
                    }}
                    style={{ minWidth: '150px' }}
                >
                    <option value="">All Payment Methods</option>
                    <option value="stripe">Stripe</option>
                    <option value="paypal">PayPal</option>
                    <option value="venmo">Venmo</option>
                </select>
                <select
                    className="admin-form-select"
                    value={checkinFilter}
                    onChange={(e) => {
                        const newValue = e.target.value;
                        setCheckinFilter(newValue);
                        // Use the new value directly to avoid race condition
                        handleSearch(undefined, undefined, undefined, newValue);
                    }}
                    style={{ minWidth: '150px' }}
                >
                    <option value="">All Tickets</option>
                    <option value="false">Not Checked In</option>
                    <option value="true">Checked In</option>
                </select>
                <AdminButton variant="primary" onClick={handleSearch} data-testid="search-button">
                    Search
                </AdminButton>
            </div>

            <div data-testid="registrations-table">
                {loading ? (
                    <div className="admin-loading">Loading registrations...</div>
                ) : !registrations || registrations.length === 0 ? (
                    <p className="admin-text-center admin-p-xl">No registrations found</p>
                ) : (
                    <div className="admin-table-responsive">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>Ticket ID</th>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Status</th>
                                    <th>Payment</th>
                                    <th>Check-in</th>
                                </tr>
                            </thead>
                            <tbody>
                                {registrations.map((reg) => (
                                    <tr key={reg.ticket_id}>
                                        <td>
                                            <code
                                                style={{
                                                    background: 'var(--color-background-secondary)',
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                }}
                                            >
                                                {escapeHtml(reg.ticket_id?.slice(0, 8))}...
                                            </code>
                                        </td>
                                        <td>{escapeHtml(reg.full_name || 'N/A')}</td>
                                        <td>{escapeHtml(reg.email || 'N/A')}</td>
                                        <td>
                                            <AdminBadge
                                                variant={
                                                    reg.status === 'valid'
                                                        ? 'success'
                                                        : reg.status === 'cancelled'
                                                        ? 'danger'
                                                        : 'warning'
                                                }
                                            >
                                                {escapeHtml(reg.status || 'unknown')}
                                            </AdminBadge>
                                        </td>
                                        <td>{escapeHtml(reg.payment_processor || 'N/A')}</td>
                                        <td>
                                            {reg.is_checked_in ? (
                                                <AdminBadge variant="success">Yes</AdminBadge>
                                            ) : (
                                                <AdminBadge variant="default">No</AdminBadge>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </AdminCard>
    );
}

/**
 * DashboardPageContent - Dashboard content with data fetching
 */
function DashboardPageContent() {
    const { isAuthenticated } = useAdminAuth();
    const { get, post } = useAdminApi();

    // State
    const [stats, setStats] = useState(null);
    const [flaggedTickets, setFlaggedTickets] = useState([]);
    const [flaggedTotal, setFlaggedTotal] = useState(0);
    const [registrations, setRegistrations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [flaggedLoading, setFlaggedLoading] = useState(true);
    const [registrationsLoading, setRegistrationsLoading] = useState(true);

    // Load dashboard data
    const loadDashboardData = useCallback(async () => {
        if (!isAuthenticated) return;

        setLoading(true);
        try {
            const data = await get('/api/admin/dashboard');
            setStats(data.stats);
        } catch (error) {
            console.error('Failed to load dashboard:', error);
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated, get]);

    // Load flagged tickets
    const loadFlaggedTickets = useCallback(async () => {
        if (!isAuthenticated) return;

        setFlaggedLoading(true);
        try {
            const data = await get('/api/admin/flagged-tickets?limit=50&offset=0');
            setFlaggedTickets(data.flaggedTickets || []);
            setFlaggedTotal(data.total || 0);
        } catch (error) {
            console.error('Failed to load flagged tickets:', error);
        } finally {
            setFlaggedLoading(false);
        }
    }, [isAuthenticated, get]);

    // Load registrations
    const loadRegistrations = useCallback(async (filters = {}) => {
        if (!isAuthenticated) return;

        setRegistrationsLoading(true);
        try {
            const params = new URLSearchParams();
            if (filters.search) params.set('search', filters.search);
            if (filters.status) params.set('status', filters.status);
            if (filters.paymentMethod) params.set('paymentMethod', filters.paymentMethod);
            if (filters.checkedIn) params.set('checkedIn', filters.checkedIn);

            const url = `/api/admin/registrations?${params.toString()}`;
            const data = await get(url);
            setRegistrations(data.registrations || []);
        } catch (error) {
            console.error('Failed to load registrations:', error);
        } finally {
            setRegistrationsLoading(false);
        }
    }, [isAuthenticated, get]);

    // Handle flagged ticket actions
    const handleFlaggedAction = async (ticketId, action) => {
        const actionText =
            action === 'mark_safe' ? 'mark this ticket as safe' : 'cancel this ticket';
        const confirmMessage = `Are you sure you want to ${actionText}?\n\nTicket ID: ${ticketId}`;

        if (!window.confirm(confirmMessage)) {
            return;
        }

        try {
            await post(`/api/admin/flagged-tickets?ticketId=${encodeURIComponent(ticketId)}`, {
                action,
            });
            // Reload flagged tickets
            await loadFlaggedTickets();
        } catch (error) {
            console.error('Failed to perform action on flagged ticket:', error);
            alert(`Failed to ${actionText}: ${error.message}`);
        }
    };

    // Sync to sheets handler
    const handleSyncToSheets = async () => {
        try {
            await post('/api/admin/sync-sheets', {});
            alert('Successfully synced to Google Sheets');
        } catch (error) {
            console.error('Failed to sync to sheets:', error);
            alert(`Failed to sync: ${error.message}`);
        }
    };

    // Initial data load
    useEffect(() => {
        if (isAuthenticated) {
            loadDashboardData();
            loadFlaggedTickets();
            loadRegistrations();
        }
    }, [isAuthenticated, loadDashboardData, loadFlaggedTickets, loadRegistrations]);

    // Header actions
    const headerActions = (
        <AdminButton variant="success" onClick={handleSyncToSheets}>
            Sync to Sheets
        </AdminButton>
    );

    return (
        <AdminLayout
            title="Admin Dashboard"
            subtitle="A Lo Cubano Boulder Fest - Festival Management & Analytics"
            currentPage="dashboard"
            headerActions={headerActions}
        >
            {/* Statistics Grid */}
            <StatsGrid stats={stats} loading={loading} />

            {/* Flagged Tickets Section */}
            <FlaggedTicketsSection
                tickets={flaggedTickets}
                total={flaggedTotal}
                onAction={handleFlaggedAction}
                loading={flaggedLoading}
            />

            {/* Registrations Section */}
            <RegistrationsSection
                registrations={registrations}
                loading={registrationsLoading}
                onSearch={loadRegistrations}
            />
        </AdminLayout>
    );
}

/**
 * DashboardPage - Admin dashboard with providers
 */
export default function DashboardPage() {
    return (
        <AdminProviders>
            <DashboardPageContent />
        </AdminProviders>
    );
}

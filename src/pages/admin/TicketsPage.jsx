/**
 * Admin Tickets Page
 *
 * Comprehensive ticket management with search, filters, detail view, and actions.
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
 * Ticket status badge
 */
function TicketStatusBadge({ status }) {
    const variants = {
        valid: 'success',
        active: 'success',
        cancelled: 'danger',
        transferred: 'warning',
        refunded: 'warning',
        used: 'info',
        pending: 'info',
    };
    return (
        <AdminBadge variant={variants[status] || 'default'}>
            {escapeHtml(status || 'unknown')}
        </AdminBadge>
    );
}

/**
 * Transfer Modal Component
 */
function TransferModal({ ticket, isOpen, onClose, onTransfer }) {
    const [newEmail, setNewEmail] = useState('');
    const [newName, setNewName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Reset form state when modal opens
    React.useEffect(() => {
        if (isOpen) {
            setNewEmail('');
            setNewName('');
            setError(null);
        }
    }, [isOpen]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            await onTransfer(ticket.ticket_id, newEmail, newName);
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay show" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="modal-title">Transfer Ticket</h3>
                    <button className="modal-close" onClick={onClose} type="button">
                        ×
                    </button>
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <strong>Ticket ID:</strong> {escapeHtml(ticket?.ticket_id?.slice(0, 8))}...
                    <br />
                    <strong>Current Owner:</strong> {escapeHtml(ticket?.full_name)} ({escapeHtml(ticket?.email)})
                </div>

                {error && (
                    <div className="alert alert-error" style={{ marginBottom: '16px' }}>
                        {escapeHtml(error)}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '16px' }}>
                        <label
                            htmlFor="newEmail"
                            style={{ display: 'block', marginBottom: '4px', fontWeight: 600 }}
                        >
                            New Owner Email *
                        </label>
                        <input
                            type="email"
                            id="newEmail"
                            className="admin-form-input"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            required
                            placeholder="newemail@example.com"
                            style={{ width: '100%' }}
                        />
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                        <label
                            htmlFor="newName"
                            style={{ display: 'block', marginBottom: '4px', fontWeight: 600 }}
                        >
                            New Owner Name *
                        </label>
                        <input
                            type="text"
                            id="newName"
                            className="admin-form-input"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            required
                            placeholder="John Doe"
                            style={{ width: '100%' }}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                        <AdminButton onClick={onClose} disabled={loading}>
                            Cancel
                        </AdminButton>
                        <AdminButton type="submit" variant="primary" loading={loading}>
                            Transfer Ticket
                        </AdminButton>
                    </div>
                </form>
            </div>
        </div>
    );
}

/**
 * TicketsPageContent - Main content
 */
function TicketsPageContent() {
    const { isAuthenticated } = useAdminAuth();
    const { get, post } = useAdminApi();

    // State
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [totalCount, setTotalCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize] = useState(50);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [eventFilter, setEventFilter] = useState('');

    // Modal state
    const [transferModalOpen, setTransferModalOpen] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState(null);

    // Events and ticket types for filters
    const [events, setEvents] = useState([]);
    const [ticketTypes, setTicketTypes] = useState([]);

    /**
     * Load tickets
     */
    const loadTickets = useCallback(
        async (page = 1) => {
            if (!isAuthenticated) return;

            setLoading(true);
            try {
                const params = new URLSearchParams();
                params.set('page', page.toString());
                params.set('limit', pageSize.toString());

                if (searchTerm) params.set('search', searchTerm);
                if (statusFilter) params.set('status', statusFilter);
                if (typeFilter) params.set('ticketType', typeFilter);
                if (eventFilter) params.set('eventId', eventFilter);

                const data = await get(`/api/admin/tickets?${params.toString()}`);
                setTickets(data.tickets || []);
                setTotalCount(data.total || 0);
                setCurrentPage(page);
            } catch (error) {
                console.error('Failed to load tickets:', error);
            } finally {
                setLoading(false);
            }
        },
        [isAuthenticated, get, pageSize, searchTerm, statusFilter, typeFilter, eventFilter]
    );

    /**
     * Load events and ticket types
     */
    const loadFiltersData = useCallback(async () => {
        if (!isAuthenticated) return;

        try {
            const data = await get('/api/admin/dashboard');
            setEvents(data.events || []);
            setTicketTypes(data.ticketTypes || []);
        } catch (error) {
            console.error('Failed to load filter data:', error);
        }
    }, [isAuthenticated, get]);

    /**
     * Handle search
     */
    const handleSearch = () => {
        loadTickets(1);
    };

    /**
     * Handle ticket transfer
     */
    const handleTransfer = async (ticketId, newEmail, newName) => {
        await post('/api/admin/tickets/transfer', {
            ticketId,
            newEmail,
            newName,
        });
        // Reload tickets
        await loadTickets(currentPage);
    };

    /**
     * Handle ticket cancellation
     */
    const handleCancel = async (ticketId) => {
        if (!window.confirm('Are you sure you want to cancel this ticket? This action cannot be undone.')) {
            return;
        }

        try {
            await post('/api/admin/tickets/cancel', { ticketId });
            await loadTickets(currentPage);
        } catch (error) {
            console.error('Failed to cancel ticket:', error);
            alert('Failed to cancel ticket: ' + error.message);
        }
    };

    /**
     * Open transfer modal
     */
    const openTransferModal = (ticket) => {
        setSelectedTicket(ticket);
        setTransferModalOpen(true);
    };

    /**
     * Initial load
     */
    useEffect(() => {
        if (isAuthenticated) {
            loadTickets(1);
            loadFiltersData();
        }
    }, [isAuthenticated, loadTickets, loadFiltersData]);

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
            label: 'Type',
            render: (value) => escapeHtml(value || 'N/A'),
        },
        {
            key: 'status',
            label: 'Status',
            render: (value) => <TicketStatusBadge status={value} />,
        },
        {
            key: 'scan_count',
            label: 'Scans',
            align: 'center',
            render: (value, row) => (
                <span>
                    {value || 0} / {row.max_scan_count || 3}
                </span>
            ),
        },
        {
            key: 'is_checked_in',
            label: 'Check-in',
            render: (value) =>
                value ? (
                    <AdminBadge variant="success">Yes</AdminBadge>
                ) : (
                    <AdminBadge variant="default">No</AdminBadge>
                ),
        },
        {
            key: 'actions',
            label: 'Actions',
            render: (_, row) => (
                <div style={{ display: 'flex', gap: '4px' }}>
                    <AdminButton
                        size="sm"
                        onClick={() => openTransferModal(row)}
                        disabled={row.status !== 'valid'}
                    >
                        Transfer
                    </AdminButton>
                    <AdminButton
                        size="sm"
                        variant="danger"
                        onClick={() => handleCancel(row.ticket_id)}
                        disabled={row.status === 'cancelled'}
                    >
                        Cancel
                    </AdminButton>
                </div>
            ),
        },
    ];

    return (
        <AdminLayout
            title="Tickets"
            subtitle="A Lo Cubano Boulder Fest - Ticket Management"
            currentPage="tickets"
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
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        style={{ flex: 1, minWidth: '250px' }}
                    />
                    <select
                        className="admin-form-select"
                        value={eventFilter}
                        onChange={(e) => setEventFilter(e.target.value)}
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
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        style={{ minWidth: '150px' }}
                    >
                        <option value="">All Types</option>
                        {ticketTypes.map((type) => (
                            <option key={type.id} value={type.id}>
                                {escapeHtml(type.name)}
                            </option>
                        ))}
                    </select>
                    <select
                        className="admin-form-select"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        style={{ minWidth: '120px' }}
                    >
                        <option value="">All Status</option>
                        <option value="valid">Valid</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="transferred">Transferred</option>
                        <option value="used">Used</option>
                    </select>
                    <AdminButton variant="primary" onClick={handleSearch}>
                        Search
                    </AdminButton>
                </div>

                {/* Results count */}
                <div className="admin-mb-md">
                    <span className="admin-text-secondary">
                        {totalCount} ticket{totalCount !== 1 ? 's' : ''} found
                    </span>
                </div>

                {/* Table */}
                <AdminTable
                    columns={columns}
                    data={tickets}
                    loading={loading}
                    emptyMessage="No tickets found matching your criteria"
                />

                {/* Pagination */}
                <AdminPagination
                    currentPage={currentPage}
                    totalPages={Math.ceil(totalCount / pageSize)}
                    totalItems={totalCount}
                    pageSize={pageSize}
                    onPageChange={loadTickets}
                    className="admin-mt-xl"
                />
            </AdminCard>

            {/* Transfer Modal */}
            <TransferModal
                ticket={selectedTicket}
                isOpen={transferModalOpen}
                onClose={() => {
                    setTransferModalOpen(false);
                    setSelectedTicket(null);
                }}
                onTransfer={handleTransfer}
            />

            {/* Modal styles */}
            <style>{`
                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                }

                .modal-content {
                    background: var(--color-surface);
                    border-radius: var(--radius-lg);
                    padding: var(--space-xl);
                    max-width: 500px;
                    width: 90%;
                }

                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: var(--space-lg);
                }

                .modal-title {
                    font-size: var(--font-size-xl);
                    font-weight: 700;
                }

                .modal-close {
                    background: transparent;
                    border: none;
                    font-size: 24px;
                    cursor: pointer;
                    color: var(--color-text-secondary);
                }

                .alert {
                    padding: var(--space-md);
                    border-radius: var(--radius-md);
                }

                .alert-error {
                    background: rgba(204, 41, 54, 0.1);
                    color: var(--color-danger);
                    border: 1px solid rgba(204, 41, 54, 0.3);
                }
            `}</style>
        </AdminLayout>
    );
}

/**
 * TicketsPage - Admin tickets page with providers
 */
export default function TicketsPage() {
    return (
        <AdminProviders>
            <TicketsPageContent />
        </AdminProviders>
    );
}

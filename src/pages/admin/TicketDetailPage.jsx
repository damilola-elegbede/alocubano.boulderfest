/**
 * Admin Ticket Detail Page
 *
 * Comprehensive ticket information with transfer and QR code functionality.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AdminProviders } from '../../providers/AdminProviders.jsx';
import { useAdminAuth } from '../../hooks/admin/useAdminAuth.js';
import { useAdminApi } from '../../hooks/admin/useAdminApi.js';
import { AdminLayout } from '../../components/admin/layout/index.js';
import {
    AdminCard,
    AdminButton,
    AdminBadge,
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
 * Format ticket type for display
 */
function formatTicketType(type) {
    const typeMap = {
        'vip-pass': 'VIP Pass',
        'weekend-pass': 'Weekend Pass',
        'friday-pass': 'Friday',
        'saturday-pass': 'Saturday',
        'sunday-pass': 'Sunday',
        workshop: 'Workshop',
        'general-admission': 'General',
    };
    return typeMap[type] || type;
}

/**
 * Status indicator component
 */
function StatusIndicator({ status, isCheckedIn }) {
    let statusClass = 'success';
    let statusText = status || 'valid';
    let statusIcon = '✓';

    if (isCheckedIn) {
        statusClass = 'info';
        statusText = 'Checked In';
    } else if (status === 'cancelled') {
        statusClass = 'danger';
        statusText = 'Cancelled';
        statusIcon = '✕';
    }

    return (
        <AdminBadge variant={statusClass}>
            {statusIcon} {statusText.toUpperCase()}
        </AdminBadge>
    );
}

/**
 * Detail item component
 */
function DetailItem({ label, children }) {
    return (
        <div
            style={{
                padding: 'var(--space-md)',
                background: 'var(--color-background-secondary)',
                borderRadius: '4px',
            }}
        >
            <div
                style={{
                    fontFamily: 'var(--font-code)',
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-blue)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: 'var(--space-xs)',
                }}
            >
                {label}
            </div>
            <div
                style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 'var(--font-size-base)',
                    color: 'var(--color-text-primary)',
                    fontWeight: 500,
                }}
            >
                {children}
            </div>
        </div>
    );
}

/**
 * Transfer Modal Component
 */
function TransferModal({ ticket, isOpen, onClose, onTransferComplete, csrfToken }) {
    const [formData, setFormData] = useState({
        newFirstName: '',
        newLastName: '',
        newEmail: '',
        newPhone: '',
        transferReason: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [countdown, setCountdown] = useState(null);

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setFormData({
                newFirstName: '',
                newLastName: '',
                newEmail: '',
                newPhone: '',
                transferReason: '',
            });
            setError(null);
            setSuccess(null);
            setCountdown(null);
        }
    }, [isOpen]);

    // Countdown timer
    useEffect(() => {
        if (countdown !== null && countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        } else if (countdown === 0) {
            onTransferComplete();
        }
    }, [countdown, onTransferComplete]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/admin/transfer-ticket', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken || '',
                },
                credentials: 'include',
                body: JSON.stringify({
                    ticketId: ticket.ticket_id,
                    newEmail: formData.newEmail.trim(),
                    newFirstName: formData.newFirstName.trim(),
                    newLastName: formData.newLastName?.trim() || '',
                    newPhone: formData.newPhone?.trim() || null,
                    transferReason: formData.transferReason?.trim() || null,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to transfer ticket');
            }

            setSuccess(result.transfer);
            setCountdown(20);
        } catch (err) {
            console.error('Transfer error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRefreshNow = () => {
        setCountdown(0);
    };

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: 'var(--color-surface)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--space-xl)',
                    maxWidth: '600px',
                    width: '90%',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 'var(--space-lg)',
                        paddingBottom: 'var(--space-md)',
                        borderBottom: '2px solid var(--color-border)',
                    }}
                >
                    <h2
                        style={{
                            fontSize: 'var(--font-size-xl)',
                            fontWeight: 700,
                            margin: 0,
                        }}
                    >
                        Transfer Ticket
                    </h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-text-secondary)',
                            fontSize: 'var(--font-size-xl)',
                            cursor: 'pointer',
                            padding: 'var(--space-xs)',
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Current Owner Info */}
                <div
                    style={{
                        background: 'rgba(91, 107, 181, 0.1)',
                        border: '1px solid rgba(91, 107, 181, 0.3)',
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--space-md)',
                        marginBottom: 'var(--space-lg)',
                        color: 'var(--color-blue)',
                    }}
                >
                    <strong>Current Owner:</strong>{' '}
                    {ticket.attendee_first_name && ticket.attendee_last_name
                        ? `${ticket.attendee_first_name} ${ticket.attendee_last_name}`
                        : ticket.attendee_first_name || 'Not registered'}{' '}
                    ({ticket.attendee_email || 'No email'})
                </div>

                {/* Success Message */}
                {success && (
                    <div
                        style={{
                            background: 'rgba(34, 197, 94, 0.1)',
                            border: '1px solid rgba(34, 197, 94, 0.3)',
                            borderRadius: 'var(--radius-md)',
                            padding: 'var(--space-md)',
                            marginBottom: 'var(--space-lg)',
                            color: 'var(--color-success)',
                        }}
                    >
                        <strong>Success!</strong> Ticket transferred successfully.
                        <br />
                        From: {escapeHtml(success.from?.email)}
                        <br />
                        To: {escapeHtml(success.to?.email)}
                        <br />
                        <br />
                        <span style={{ fontSize: '0.9em', opacity: 0.9 }}>
                            Refreshing in <strong>{countdown}</strong> seconds...
                        </span>
                        <br />
                        <br />
                        <AdminButton onClick={handleRefreshNow}>Refresh Now</AdminButton>
                    </div>
                )}

                {/* Error Message */}
                {error && (
                    <div
                        style={{
                            background: 'rgba(204, 41, 54, 0.1)',
                            border: '1px solid rgba(204, 41, 54, 0.3)',
                            borderRadius: 'var(--radius-md)',
                            padding: 'var(--space-md)',
                            marginBottom: 'var(--space-lg)',
                            color: 'var(--color-error)',
                        }}
                    >
                        <strong>Error:</strong> {escapeHtml(error)}
                    </div>
                )}

                {/* Transfer Form */}
                {!success && (
                    <form onSubmit={handleSubmit}>
                        <div className="admin-form-group" style={{ marginBottom: 'var(--space-md)' }}>
                            <label className="admin-form-label">
                                New First Name <span style={{ color: 'var(--color-error)' }}>*</span>
                            </label>
                            <input
                                type="text"
                                className="admin-form-input"
                                value={formData.newFirstName}
                                onChange={(e) =>
                                    setFormData({ ...formData, newFirstName: e.target.value })
                                }
                                required
                                maxLength={100}
                                placeholder="John"
                            />
                        </div>

                        <div className="admin-form-group" style={{ marginBottom: 'var(--space-md)' }}>
                            <label className="admin-form-label">New Last Name</label>
                            <input
                                type="text"
                                className="admin-form-input"
                                value={formData.newLastName}
                                onChange={(e) =>
                                    setFormData({ ...formData, newLastName: e.target.value })
                                }
                                maxLength={100}
                                placeholder="Doe"
                            />
                        </div>

                        <div className="admin-form-group" style={{ marginBottom: 'var(--space-md)' }}>
                            <label className="admin-form-label">
                                New Email <span style={{ color: 'var(--color-error)' }}>*</span>
                            </label>
                            <input
                                type="email"
                                className="admin-form-input"
                                value={formData.newEmail}
                                onChange={(e) =>
                                    setFormData({ ...formData, newEmail: e.target.value })
                                }
                                required
                                maxLength={255}
                                placeholder="john@example.com"
                            />
                        </div>

                        <div className="admin-form-group" style={{ marginBottom: 'var(--space-md)' }}>
                            <label className="admin-form-label">New Phone (Optional)</label>
                            <input
                                type="tel"
                                className="admin-form-input"
                                value={formData.newPhone}
                                onChange={(e) =>
                                    setFormData({ ...formData, newPhone: e.target.value })
                                }
                                maxLength={50}
                                placeholder="+1 (303) 555-0123"
                            />
                        </div>

                        <div className="admin-form-group" style={{ marginBottom: 'var(--space-lg)' }}>
                            <label className="admin-form-label">Transfer Reason (Optional)</label>
                            <textarea
                                className="admin-form-input"
                                value={formData.transferReason}
                                onChange={(e) =>
                                    setFormData({ ...formData, transferReason: e.target.value })
                                }
                                maxLength={500}
                                rows={3}
                                placeholder="Reason for transfer (optional)"
                            />
                        </div>

                        {/* Transfer Summary */}
                        <div
                            style={{
                                background: 'var(--color-background-secondary)',
                                borderRadius: 'var(--radius-md)',
                                padding: 'var(--space-md)',
                                marginBottom: 'var(--space-lg)',
                            }}
                        >
                            <h3 style={{ marginBottom: 'var(--space-md)', color: 'var(--color-text-primary)' }}>
                                Transfer Summary
                            </h3>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-sm) 0' }}>
                                <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>Ticket ID:</span>
                                <span style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-code)' }}>
                                    {ticket.ticket_id}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-sm) 0' }}>
                                <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>From:</span>
                                <span style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-code)' }}>
                                    {ticket.attendee_email || 'Not set'}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-sm) 0' }}>
                                <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>To:</span>
                                <span style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-code)' }}>
                                    {formData.newEmail || '-'}
                                </span>
                            </div>
                        </div>

                        {/* Submit Buttons */}
                        <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                            <AdminButton type="submit" variant="primary" disabled={loading} style={{ flex: 1 }}>
                                {loading ? 'Transferring...' : 'Confirm Transfer'}
                            </AdminButton>
                            <AdminButton type="button" variant="default" onClick={onClose} style={{ flex: 1 }}>
                                Cancel
                            </AdminButton>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

/**
 * TicketDetailPageContent - Main content
 */
function TicketDetailPageContent() {
    const { isAuthenticated, csrfToken } = useAdminAuth();
    const { get } = useAdminApi();

    const [ticket, setTicket] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showQR, setShowQR] = useState(false);
    const [showTransferModal, setShowTransferModal] = useState(false);

    // Get ticket ID from URL
    const ticketId = new URLSearchParams(window.location.search).get('ticketId');

    /**
     * Load ticket details
     */
    const loadTicketDetails = useCallback(async () => {
        if (!ticketId) {
            setError('No ticket ID provided');
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const data = await get(`/api/tickets/${encodeURIComponent(ticketId)}`);
            setTicket(data);
            setError(null);
        } catch (err) {
            console.error('Failed to load ticket details:', err);
            setError(err.message || 'Failed to load ticket details');
        } finally {
            setLoading(false);
        }
    }, [ticketId, get]);

    /**
     * Initial load
     */
    useEffect(() => {
        if (isAuthenticated && ticketId) {
            loadTicketDetails();
        }
    }, [isAuthenticated, ticketId, loadTicketDetails]);

    /**
     * Handle transfer complete
     */
    const handleTransferComplete = () => {
        setShowTransferModal(false);
        loadTicketDetails();
    };

    // Header actions
    const headerActions = (
        <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
            <AdminButton variant="default" onClick={() => window.close()}>
                Close
            </AdminButton>
        </div>
    );

    if (loading) {
        return (
            <AdminLayout
                title="Ticket Details"
                subtitle="Loading ticket information..."
                currentPage="tickets"
            >
                <div style={{ textAlign: 'center', padding: '60px' }}>Loading ticket details...</div>
            </AdminLayout>
        );
    }

    if (error) {
        return (
            <AdminLayout
                title="Ticket Details"
                subtitle="Error loading ticket"
                currentPage="tickets"
            >
                <AdminCard>
                    <div
                        style={{
                            textAlign: 'center',
                            padding: '40px',
                            color: 'var(--color-error)',
                        }}
                    >
                        <p>{error}</p>
                        <AdminButton onClick={loadTicketDetails} style={{ marginTop: '20px' }}>
                            Retry
                        </AdminButton>
                    </div>
                </AdminCard>
            </AdminLayout>
        );
    }

    if (!ticket) {
        return (
            <AdminLayout
                title="Ticket Details"
                subtitle="Ticket not found"
                currentPage="tickets"
            >
                <AdminCard>
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                        <p>Ticket not found</p>
                    </div>
                </AdminCard>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout
            title="Ticket Details"
            subtitle="Comprehensive Ticket Information"
            currentPage="tickets"
            headerActions={headerActions}
        >
            {/* Ticket Information */}
            <AdminCard className="admin-mb-xl">
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 'var(--space-lg)',
                    }}
                >
                    <h2 style={{ margin: 0, fontWeight: 700 }}>Ticket Information</h2>
                    <StatusIndicator status={ticket.status} isCheckedIn={ticket.is_checked_in} />
                </div>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                        gap: 'var(--space-lg)',
                    }}
                >
                    <DetailItem label="Ticket ID">
                        <code>{escapeHtml(ticket.ticket_id)}</code>
                    </DetailItem>
                    <DetailItem label="Ticket Type">
                        {escapeHtml(formatTicketType(ticket.ticket_type))}
                    </DetailItem>
                    <DetailItem label="Status">
                        <StatusIndicator status={ticket.status} isCheckedIn={false} />
                    </DetailItem>
                    <DetailItem label="Validation Status">
                        <AdminBadge variant={ticket.validation_status === 'active' ? 'success' : 'danger'}>
                            {(ticket.validation_status || 'N/A').toUpperCase()}
                        </AdminBadge>
                    </DetailItem>
                    <DetailItem label="Price">{escapeHtml(ticket.price_display || 'N/A')}</DetailItem>
                    <DetailItem label="Created">
                        {escapeHtml(ticket.created_at_mt || ticket.created_at)}
                    </DetailItem>
                </div>
            </AdminCard>

            {/* Attendee Information */}
            <AdminCard className="admin-mb-xl">
                <h2 style={{ marginBottom: 'var(--space-lg)', fontWeight: 700 }}>
                    Attendee Information
                </h2>
                {ticket.is_registered && ticket.attendee_first_name ? (
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                            gap: 'var(--space-lg)',
                        }}
                    >
                        <DetailItem label="First Name">
                            {escapeHtml(ticket.attendee_first_name)}
                        </DetailItem>
                        <DetailItem label="Last Name">
                            {escapeHtml(ticket.attendee_last_name)}
                        </DetailItem>
                        <DetailItem label="Email">{escapeHtml(ticket.attendee_email)}</DetailItem>
                        <DetailItem label="Registration Status">
                            {escapeHtml(ticket.registration_status)}
                        </DetailItem>
                        <DetailItem label="Registered At">
                            {escapeHtml(ticket.registered_at_mt || 'N/A')}
                        </DetailItem>
                        <DetailItem label="Registration Deadline">
                            {escapeHtml(ticket.registration_deadline_mt || 'N/A')}
                        </DetailItem>
                    </div>
                ) : (
                    <p style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                        This ticket has not been registered yet.
                    </p>
                )}
            </AdminCard>

            {/* Transfer Ticket Section */}
            <AdminCard className="admin-mb-xl">
                <h2 style={{ marginBottom: 'var(--space-lg)', fontWeight: 700 }}>Transfer Ticket</h2>
                <p style={{ marginBottom: 'var(--space-md)', color: 'var(--color-text-secondary)' }}>
                    Transfer this ticket to a new owner by changing the attendee information.
                </p>
                <AdminButton variant="primary" onClick={() => setShowTransferModal(true)}>
                    Transfer Ticket
                </AdminButton>
            </AdminCard>

            {/* QR Code Section */}
            <AdminCard className="admin-mb-xl">
                <h2 style={{ marginBottom: 'var(--space-lg)', fontWeight: 700 }}>
                    QR Code & Scanning
                </h2>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                        gap: 'var(--space-lg)',
                        marginBottom: 'var(--space-xl)',
                    }}
                >
                    <DetailItem label="QR Access Method">
                        {escapeHtml(ticket.qr_access_method || 'N/A')}
                    </DetailItem>
                    <DetailItem label="Scan Count">
                        {ticket.scan_count || 0} / {ticket.max_scan_count || 3}
                    </DetailItem>
                    <DetailItem label="Scans Remaining">{ticket.scans_remaining || 0}</DetailItem>
                    <DetailItem label="Can Scan">{ticket.can_scan ? '✅ Yes' : '❌ No'}</DetailItem>
                    <DetailItem label="First Scanned">
                        {escapeHtml(ticket.first_scanned_at_mt || 'Never')}
                    </DetailItem>
                    <DetailItem label="Last Scanned">
                        {escapeHtml(ticket.last_scanned_at_mt || 'Never')}
                    </DetailItem>
                </div>

                {/* QR Code Display */}
                <div
                    style={{
                        background: 'var(--color-background-secondary)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '8px',
                        padding: 'var(--space-xl)',
                    }}
                >
                    <AdminButton variant="primary" onClick={() => setShowQR(!showQR)}>
                        {showQR ? 'Hide QR Code' : 'Show QR Code'}
                    </AdminButton>

                    {showQR && (
                        <div style={{ marginTop: 'var(--space-lg)', textAlign: 'center' }}>
                            <div
                                style={{
                                    background: 'rgba(245, 158, 11, 0.1)',
                                    color: '#f59e0b',
                                    padding: 'var(--space-sm)',
                                    borderRadius: '4px',
                                    marginBottom: 'var(--space-md)',
                                    fontWeight: 600,
                                }}
                            >
                                ⚠️ ADMIN ONLY - Do not share this QR code
                            </div>
                            <div
                                style={{
                                    display: 'inline-block',
                                    padding: 'var(--space-md)',
                                    background: 'white',
                                    borderRadius: '8px',
                                }}
                            >
                                <img
                                    src={`/api/tickets/qr-image?ticketId=${encodeURIComponent(ticket.ticket_id)}`}
                                    alt="Ticket QR Code"
                                    style={{ width: '200px', height: '200px' }}
                                />
                            </div>
                            <p
                                style={{
                                    marginTop: 'var(--space-md)',
                                    fontFamily: 'var(--font-code)',
                                    fontSize: 'var(--font-size-sm)',
                                    color: 'var(--color-text-secondary)',
                                }}
                            >
                                QR Token: {escapeHtml(ticket.qr_token || 'N/A')}
                            </p>
                        </div>
                    )}
                </div>
            </AdminCard>

            {/* Check-in Information */}
            <AdminCard className="admin-mb-xl">
                <h2 style={{ marginBottom: 'var(--space-lg)', fontWeight: 700 }}>Check-in Status</h2>
                {ticket.is_checked_in ? (
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                            gap: 'var(--space-lg)',
                        }}
                    >
                        <DetailItem label="Checked In At">
                            {escapeHtml(ticket.checked_in_at_mt || ticket.checked_in_at)}
                        </DetailItem>
                        <DetailItem label="Checked In By">
                            {escapeHtml(ticket.checked_in_by || 'System')}
                        </DetailItem>
                    </div>
                ) : (
                    <p style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                        This ticket has not been checked in yet.
                    </p>
                )}
            </AdminCard>

            {/* Transaction Information */}
            <AdminCard className="admin-mb-xl">
                <h2 style={{ marginBottom: 'var(--space-lg)', fontWeight: 700 }}>
                    Transaction Details
                </h2>
                {ticket.transaction ? (
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                            gap: 'var(--space-lg)',
                        }}
                    >
                        <DetailItem label="Order Number">
                            <code>{escapeHtml(ticket.transaction.order_number || 'N/A')}</code>
                        </DetailItem>
                        <DetailItem label="Transaction Status">
                            {escapeHtml(ticket.transaction.status || 'N/A')}
                        </DetailItem>
                        <DetailItem label="Payment Processor">
                            {escapeHtml(ticket.transaction.payment_processor || 'N/A')}
                        </DetailItem>
                        <DetailItem label="Transaction Amount">
                            ${((ticket.transaction.amount_cents || 0) / 100).toFixed(2)}
                        </DetailItem>
                        <DetailItem label="Purchaser Name">
                            {escapeHtml(ticket.transaction.purchaser_name || 'N/A')}
                        </DetailItem>
                        <DetailItem label="Purchaser Email">
                            {escapeHtml(ticket.transaction.purchaser_email || 'N/A')}
                        </DetailItem>
                        <DetailItem label="Transaction Created">
                            {escapeHtml(
                                ticket.transaction.created_at_mt ||
                                    ticket.transaction.created_at ||
                                    'N/A'
                            )}
                        </DetailItem>
                    </div>
                ) : (
                    <p style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                        No transaction information available.
                    </p>
                )}
            </AdminCard>

            {/* Transfer Modal */}
            <TransferModal
                ticket={ticket}
                isOpen={showTransferModal}
                onClose={() => setShowTransferModal(false)}
                onTransferComplete={handleTransferComplete}
                csrfToken={csrfToken}
            />
        </AdminLayout>
    );
}

/**
 * TicketDetailPage - Admin ticket detail page with providers
 */
export default function TicketDetailPage() {
    return (
        <AdminProviders>
            <TicketDetailPageContent />
        </AdminProviders>
    );
}

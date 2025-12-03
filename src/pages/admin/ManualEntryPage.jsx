/**
 * Admin Manual Entry Page
 *
 * At-door ticket purchase entry system.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AdminProviders } from '../../providers/AdminProviders.jsx';
import { useAdminAuth } from '../../hooks/admin/useAdminAuth.js';
import { useAdminApi } from '../../hooks/admin/useAdminApi.js';
import { AdminLayout } from '../../components/admin/layout/index.js';
import {
    AdminCard,
    AdminButton,
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
function formatCurrency(cents) {
    return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Alert component
 */
function Alert({ type, children, onDismiss }) {
    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ',
    };

    useEffect(() => {
        if (onDismiss) {
            const timer = setTimeout(onDismiss, 8000);
            return () => clearTimeout(timer);
        }
    }, [onDismiss]);

    return (
        <div
            className={`admin-alert ${type}`}
            role="alert"
            style={{ marginBottom: 'var(--space-md)' }}
        >
            {icons[type]} {children}
        </div>
    );
}

/**
 * Loading overlay
 */
function LoadingOverlay({ show }) {
    if (!show) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
            }}
        >
            <div
                style={{
                    background: 'var(--color-surface)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--space-xl)',
                    textAlign: 'center',
                    minWidth: '300px',
                }}
            >
                <div className="admin-loading" style={{ marginBottom: 'var(--space-md)' }} />
                <p>Processing ticket entry...</p>
            </div>
        </div>
    );
}

/**
 * Form Section component
 */
function FormSection({ title, children }) {
    return (
        <div
            style={{
                background: 'var(--color-surface)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-lg)',
                marginBottom: 'var(--space-lg)',
            }}
        >
            <h2
                style={{
                    fontSize: 'var(--font-size-lg)',
                    fontWeight: 600,
                    marginBottom: 'var(--space-md)',
                    color: 'var(--color-text-primary)',
                }}
            >
                {title}
            </h2>
            {children}
        </div>
    );
}

/**
 * ManualEntryPageContent - Main content
 */
function ManualEntryPageContent() {
    const { isAuthenticated } = useAdminAuth();
    const { get, post } = useAdminApi();

    // Form state
    const [customerFirstName, setCustomerFirstName] = useState('');
    const [customerLastName, setCustomerLastName] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('');
    const [cashShiftId, setCashShiftId] = useState('');
    const [ticketTypeId, setTicketTypeId] = useState('');
    const [sameAsPurchaser, setSameAsPurchaser] = useState(false);
    const [attendeeFirstName, setAttendeeFirstName] = useState('');
    const [attendeeLastName, setAttendeeLastName] = useState('');
    const [attendeeEmail, setAttendeeEmail] = useState('');
    const [skipOrderEmail, setSkipOrderEmail] = useState(false);
    const [skipAttendeeEmails, setSkipAttendeeEmails] = useState(false);

    // Data state
    const [ticketTypes, setTicketTypes] = useState([]);
    const [cashShifts, setCashShifts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [alerts, setAlerts] = useState([]);

    /**
     * Add alert
     */
    const addAlert = (type, message) => {
        const id = Date.now();
        setAlerts((prev) => [...prev, { id, type, message }]);
    };

    /**
     * Remove alert
     */
    const removeAlert = (id) => {
        setAlerts((prev) => prev.filter((a) => a.id !== id));
    };

    /**
     * Load ticket types
     */
    const loadTicketTypes = useCallback(async () => {
        try {
            const data = await get('/api/admin/dashboard');
            setTicketTypes(data.ticketTypes || []);
        } catch (error) {
            console.error('Error loading ticket types:', error);
            addAlert('error', 'Failed to load ticket types');
        }
    }, [get]);

    /**
     * Load cash shifts
     */
    const loadCashShifts = useCallback(async () => {
        try {
            const data = await get('/api/admin/cash-shifts');
            setCashShifts(data.cashShifts || []);
        } catch (error) {
            console.error('Error loading cash shifts:', error);
            setCashShifts([]);
            addAlert('warning', 'Failed to load cash shifts. Cash payments may not be available.');
        }
    }, [get]);

    /**
     * Initial load
     */
    useEffect(() => {
        if (isAuthenticated) {
            Promise.all([loadTicketTypes(), loadCashShifts()]).finally(() => {
                setLoading(false);
            });
        }
    }, [isAuthenticated, loadTicketTypes, loadCashShifts]);

    /**
     * Handle same as purchaser checkbox
     */
    useEffect(() => {
        if (sameAsPurchaser) {
            setAttendeeFirstName(customerFirstName);
            setAttendeeLastName(customerLastName);
            setAttendeeEmail(customerEmail);
        }
    }, [sameAsPurchaser, customerFirstName, customerLastName, customerEmail]);

    /**
     * Get selected ticket price
     */
    const getSelectedTicketPrice = () => {
        if (!ticketTypeId) return 0;
        const ticket = ticketTypes.find((t) => String(t.id) === String(ticketTypeId));
        if (!ticket) return 0;
        // Comp tickets are free
        if (paymentMethod === 'comp') return 0;
        return ticket.price_cents || 0;
    };

    /**
     * Group tickets by event
     */
    const getGroupedTickets = () => {
        const available = ticketTypes.filter(
            (tt) => tt.status === 'available' || tt.status === 'test' || tt.status === 'unavailable'
        );
        const grouped = {};

        available.forEach((tt) => {
            const eventName = tt.event_name || 'Unknown Event';
            if (!grouped[eventName]) {
                grouped[eventName] = [];
            }
            grouped[eventName].push(tt);
        });

        return grouped;
    };

    /**
     * Reset form
     */
    const resetForm = () => {
        setCustomerFirstName('');
        setCustomerLastName('');
        setCustomerEmail('');
        setCustomerPhone('');
        setPaymentMethod('');
        setCashShiftId('');
        setTicketTypeId('');
        setSameAsPurchaser(false);
        setAttendeeFirstName('');
        setAttendeeLastName('');
        setAttendeeEmail('');
        setSkipOrderEmail(false);
        setSkipAttendeeEmails(false);
    };

    /**
     * Handle form submission
     */
    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validate
        const trimmedCustomerFirst = customerFirstName.trim();
        const trimmedCustomerLast = customerLastName.trim();
        const trimmedAttendeeFirst = attendeeFirstName.trim();
        const trimmedAttendeeLast = attendeeLastName.trim();
        const trimmedAttendeeEmail = attendeeEmail.trim();

        if (!trimmedCustomerFirst || !trimmedCustomerLast || !customerEmail || !paymentMethod) {
            addAlert('error', 'Please fill in all customer information fields');
            return;
        }

        if (!trimmedAttendeeFirst || !trimmedAttendeeLast || !trimmedAttendeeEmail) {
            addAlert('error', 'Please fill in all attendee information fields');
            return;
        }

        if (!ticketTypeId) {
            addAlert('error', 'Please select a ticket type');
            return;
        }

        if (paymentMethod === 'cash' && !cashShiftId) {
            addAlert('error', 'Please select an active cash shift for cash payments');
            return;
        }

        setProcessing(true);

        try {
            const manualEntryId = crypto.randomUUID();

            const result = await post('/api/admin/manual-ticket-entry', {
                manualEntryId,
                ticketItems: [
                    {
                        ticketTypeId: ticketTypeId,
                        quantity: 1,
                        attendee: {
                            firstName: trimmedAttendeeFirst,
                            lastName: trimmedAttendeeLast,
                            email: trimmedAttendeeEmail,
                        },
                    },
                ],
                paymentMethod,
                customerEmail,
                customerName: `${trimmedCustomerFirst} ${trimmedCustomerLast}`,
                customerFirstName: trimmedCustomerFirst,
                customerLastName: trimmedCustomerLast,
                customerPhone: customerPhone || null,
                cashShiftId: cashShiftId || null,
                isTest: false,
                skipOrderEmail,
                skipAttendeeEmails,
            });

            // Success messages
            addAlert(
                'success',
                `Ticket created for ${trimmedAttendeeFirst} ${trimmedAttendeeLast}.`
            );

            // Email status
            if (result.emailsSkipped?.orderEmail || result.emailsSkipped?.attendeeEmails) {
                const skipped = [];
                if (result.emailsSkipped.orderEmail) skipped.push('order confirmation');
                if (result.emailsSkipped.attendeeEmails) skipped.push('attendee confirmations');
                addAlert('warning', `Email notifications skipped: ${skipped.join(', ')}`);
            } else if (result.emailError) {
                addAlert(
                    'error',
                    `Ticket created BUT emails failed to send! Error: ${result.emailError.message}`
                );
            } else {
                addAlert(
                    'success',
                    `Confirmation emails sent to customer (${customerEmail}) and attendee (${trimmedAttendeeEmail}).`
                );
            }

            // Fraud alert
            if (result.fraudCheck?.alert) {
                addAlert(
                    'warning',
                    `Fraud alert: ${result.fraudCheck.recentTickets} tickets in last 15 minutes. Admin notified.`
                );
            }

            // Reset form
            resetForm();
        } catch (error) {
            console.error('Error processing manual entry:', error);
            addAlert('error', error.message || 'Failed to process ticket entry');
        } finally {
            setProcessing(false);
        }
    };

    // Header actions
    const headerActions = (
        <AdminButton onClick={() => (window.location.href = '/admin')}>
            ← Back
        </AdminButton>
    );

    if (loading) {
        return (
            <AdminLayout
                title="Manual Ticket Entry"
                subtitle="At-Door Purchase Entry System"
                currentPage="manual-entry"
                headerActions={headerActions}
            >
                <div className="admin-loading" style={{ padding: '60px', textAlign: 'center' }}>
                    Loading...
                </div>
            </AdminLayout>
        );
    }

    const groupedTickets = getGroupedTickets();

    return (
        <AdminLayout
            title="Manual Ticket Entry"
            subtitle="At-Door Purchase Entry System"
            currentPage="manual-entry"
            headerActions={headerActions}
        >
            <LoadingOverlay show={processing} />

            {/* Alerts */}
            <div role="status" aria-live="polite" aria-atomic="true">
                {alerts.map((alert) => (
                    <Alert
                        key={alert.id}
                        type={alert.type}
                        onDismiss={() => removeAlert(alert.id)}
                    >
                        {alert.message}
                    </Alert>
                ))}
            </div>

            <AdminCard>
                <form onSubmit={handleSubmit}>
                    {/* Customer Information */}
                    <FormSection title="Customer Information">
                        <div className="admin-form-group">
                            <label htmlFor="customer-first-name" className="admin-form-label">
                                First Name <span style={{ color: 'var(--color-danger)' }}>*</span>
                            </label>
                            <input
                                type="text"
                                id="customer-first-name"
                                className="admin-form-input"
                                value={customerFirstName}
                                onChange={(e) => setCustomerFirstName(e.target.value)}
                                required
                                placeholder="John"
                            />
                        </div>

                        <div className="admin-form-group">
                            <label htmlFor="customer-last-name" className="admin-form-label">
                                Last Name <span style={{ color: 'var(--color-danger)' }}>*</span>
                            </label>
                            <input
                                type="text"
                                id="customer-last-name"
                                className="admin-form-input"
                                value={customerLastName}
                                onChange={(e) => setCustomerLastName(e.target.value)}
                                required
                                placeholder="Doe"
                            />
                        </div>

                        <div className="admin-form-group">
                            <label htmlFor="customer-email" className="admin-form-label">
                                Email Address <span style={{ color: 'var(--color-danger)' }}>*</span>
                            </label>
                            <input
                                type="email"
                                id="customer-email"
                                className="admin-form-input"
                                value={customerEmail}
                                onChange={(e) => setCustomerEmail(e.target.value)}
                                required
                                placeholder="john@example.com"
                            />
                        </div>

                        <div className="admin-form-group">
                            <label htmlFor="customer-phone" className="admin-form-label">
                                Phone Number (Optional)
                            </label>
                            <input
                                type="tel"
                                id="customer-phone"
                                className="admin-form-input"
                                value={customerPhone}
                                onChange={(e) => setCustomerPhone(e.target.value)}
                                placeholder="+1 (303) 555-0123"
                            />
                        </div>
                    </FormSection>

                    {/* Payment Information */}
                    <FormSection title="Payment Information">
                        <div className="admin-form-group">
                            <label htmlFor="payment-method" className="admin-form-label">
                                Payment Method <span style={{ color: 'var(--color-danger)' }}>*</span>
                            </label>
                            <select
                                id="payment-method"
                                className="admin-form-select"
                                value={paymentMethod}
                                onChange={(e) => setPaymentMethod(e.target.value)}
                                required
                            >
                                <option value="">Select payment method...</option>
                                <option value="cash">Cash</option>
                                <option value="card_terminal">Card</option>
                                <option value="paypal">PayPal</option>
                                <option value="venmo">Venmo</option>
                                <option value="comp">Comp (Free)</option>
                            </select>
                        </div>

                        {/* Cash Shift (only for cash) */}
                        {paymentMethod === 'cash' && (
                            <div
                                style={{
                                    background: 'rgba(91, 107, 181, 0.1)',
                                    border: '1px solid rgba(91, 107, 181, 0.3)',
                                    borderRadius: 'var(--radius-md)',
                                    padding: 'var(--space-md)',
                                    marginTop: 'var(--space-sm)',
                                }}
                            >
                                <p style={{ fontWeight: 600, marginBottom: 'var(--space-sm)' }}>
                                    Cash Shift Required
                                </p>
                                <p style={{ fontSize: '0.9em', marginBottom: 'var(--space-md)' }}>
                                    A cash shift must be open to process cash payments.
                                </p>
                                <div className="admin-form-group">
                                    <label htmlFor="cash-shift-id" className="admin-form-label">
                                        Active Cash Shift
                                    </label>
                                    <select
                                        id="cash-shift-id"
                                        className="admin-form-select"
                                        value={cashShiftId}
                                        onChange={(e) => setCashShiftId(e.target.value)}
                                        disabled={cashShifts.length === 0}
                                    >
                                        {cashShifts.length === 0 ? (
                                            <option value="">No open cash shifts available</option>
                                        ) : (
                                            <>
                                                <option value="">Select a cash shift...</option>
                                                {cashShifts.map((shift) => {
                                                    const openedDate = new Date(shift.opened_at);
                                                    const formatted = openedDate.toLocaleString('en-US', {
                                                        month: 'short',
                                                        day: 'numeric',
                                                        hour: 'numeric',
                                                        minute: '2-digit',
                                                        hour12: true,
                                                    });
                                                    let text = `Shift #${shift.id} - Opened ${formatted}`;
                                                    if (shift.event_name) {
                                                        text = `${shift.event_name} - ${text}`;
                                                    }
                                                    return (
                                                        <option key={shift.id} value={shift.id}>
                                                            {text}
                                                        </option>
                                                    );
                                                })}
                                            </>
                                        )}
                                    </select>
                                </div>
                            </div>
                        )}
                    </FormSection>

                    {/* Email Settings */}
                    <FormSection title="Email Settings">
                        <div
                            style={{
                                background: 'rgba(91, 107, 181, 0.1)',
                                border: '1px solid rgba(91, 107, 181, 0.3)',
                                borderRadius: 'var(--radius-md)',
                                padding: 'var(--space-md)',
                            }}
                        >
                            <label style={{ display: 'block', marginBottom: 'var(--space-sm)', fontWeight: 600 }}>
                                Email Notifications
                            </label>

                            <label
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    marginBottom: 'var(--space-sm)',
                                    cursor: 'pointer',
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={skipOrderEmail}
                                    onChange={(e) => setSkipOrderEmail(e.target.checked)}
                                    style={{
                                        width: '20px',
                                        height: '20px',
                                        marginRight: 'var(--space-sm)',
                                        cursor: 'pointer',
                                    }}
                                />
                                <span>Skip order confirmation email (to purchaser)</span>
                            </label>

                            <label
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    marginBottom: 'var(--space-sm)',
                                    cursor: 'pointer',
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={skipAttendeeEmails}
                                    onChange={(e) => setSkipAttendeeEmails(e.target.checked)}
                                    style={{
                                        width: '20px',
                                        height: '20px',
                                        marginRight: 'var(--space-sm)',
                                        cursor: 'pointer',
                                    }}
                                />
                                <span>Skip attendee confirmation emails (to ticket holders)</span>
                            </label>

                            <small style={{ color: 'var(--color-text-secondary)', display: 'block', marginTop: 'var(--space-sm)' }}>
                                By default, both emails are sent. Check boxes to skip specific emails.
                            </small>
                        </div>
                    </FormSection>

                    {/* Ticket & Attendee Information */}
                    <FormSection title="Ticket & Attendee Information">
                        <div className="admin-form-group">
                            <label htmlFor="ticket-type" className="admin-form-label">
                                Ticket Type <span style={{ color: 'var(--color-danger)' }}>*</span>
                            </label>
                            <select
                                id="ticket-type"
                                className="admin-form-select"
                                value={ticketTypeId}
                                onChange={(e) => setTicketTypeId(e.target.value)}
                                required
                            >
                                <option value="">Select ticket type...</option>
                                {Object.keys(groupedTickets)
                                    .sort()
                                    .map((eventName) => (
                                        <optgroup key={eventName} label={eventName}>
                                            {groupedTickets[eventName].map((tt) => {
                                                const maxQ = Number(tt.max_quantity || 0);
                                                const sold = Number(tt.sold_count || 0);
                                                const remaining = maxQ > 0 ? Math.max(0, maxQ - sold) : 0;
                                                const remainingText = maxQ > 0 ? ` (${remaining} remaining)` : '';
                                                const testLabel = tt.status === 'test' ? ' [TEST]' : '';
                                                return (
                                                    <option key={tt.id} value={tt.id}>
                                                        {tt.name} - ${(tt.price_cents / 100).toFixed(2)}
                                                        {remainingText}
                                                        {testLabel}
                                                    </option>
                                                );
                                            })}
                                        </optgroup>
                                    ))}
                            </select>
                        </div>

                        {/* Same as Purchaser */}
                        <div
                            style={{
                                background: 'rgba(91, 107, 181, 0.1)',
                                border: '1px solid rgba(91, 107, 181, 0.3)',
                                borderRadius: 'var(--radius-md)',
                                padding: 'var(--space-md)',
                                marginBottom: 'var(--space-md)',
                            }}
                        >
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={sameAsPurchaser}
                                    onChange={(e) => setSameAsPurchaser(e.target.checked)}
                                    style={{
                                        width: '20px',
                                        height: '20px',
                                        marginRight: 'var(--space-sm)',
                                        cursor: 'pointer',
                                    }}
                                />
                                <span style={{ fontWeight: 500 }}>Attendee is the same as the purchaser</span>
                            </label>
                            <small
                                style={{
                                    color: 'var(--color-text-secondary)',
                                    display: 'block',
                                    marginTop: '8px',
                                    marginLeft: '28px',
                                }}
                            >
                                Check this box to automatically fill attendee information with customer details
                            </small>
                        </div>

                        <div className="admin-form-group">
                            <label htmlFor="attendee-first-name" className="admin-form-label">
                                Attendee First Name <span style={{ color: 'var(--color-danger)' }}>*</span>
                            </label>
                            <input
                                type="text"
                                id="attendee-first-name"
                                className="admin-form-input"
                                value={attendeeFirstName}
                                onChange={(e) => setAttendeeFirstName(e.target.value)}
                                required
                                placeholder="Jane"
                                readOnly={sameAsPurchaser}
                                style={sameAsPurchaser ? { backgroundColor: 'rgba(91, 107, 181, 0.1)', cursor: 'not-allowed' } : {}}
                            />
                        </div>

                        <div className="admin-form-group">
                            <label htmlFor="attendee-last-name" className="admin-form-label">
                                Attendee Last Name <span style={{ color: 'var(--color-danger)' }}>*</span>
                            </label>
                            <input
                                type="text"
                                id="attendee-last-name"
                                className="admin-form-input"
                                value={attendeeLastName}
                                onChange={(e) => setAttendeeLastName(e.target.value)}
                                required
                                placeholder="Smith"
                                readOnly={sameAsPurchaser}
                                style={sameAsPurchaser ? { backgroundColor: 'rgba(91, 107, 181, 0.1)', cursor: 'not-allowed' } : {}}
                            />
                        </div>

                        <div className="admin-form-group">
                            <label htmlFor="attendee-email" className="admin-form-label">
                                Attendee Email Address <span style={{ color: 'var(--color-danger)' }}>*</span>
                            </label>
                            <input
                                type="email"
                                id="attendee-email"
                                className="admin-form-input"
                                value={attendeeEmail}
                                onChange={(e) => setAttendeeEmail(e.target.value)}
                                required
                                placeholder="jane@example.com"
                                readOnly={sameAsPurchaser}
                                style={sameAsPurchaser ? { backgroundColor: 'rgba(91, 107, 181, 0.1)', cursor: 'not-allowed' } : {}}
                            />
                            <small style={{ color: 'var(--color-text-secondary)', display: 'block', marginTop: '4px' }}>
                                Attendee will receive their ticket with QR code at this email
                            </small>
                        </div>
                    </FormSection>

                    {/* Order Summary */}
                    <div
                        style={{
                            background: 'var(--color-surface-elevated)',
                            border: '2px solid var(--color-blue)',
                            borderRadius: 'var(--radius-lg)',
                            padding: 'var(--space-lg)',
                            marginBottom: 'var(--space-lg)',
                        }}
                    >
                        <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: 'var(--space-md)' }}>
                            Order Summary
                        </h2>
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                padding: 'var(--space-sm) 0',
                                fontWeight: 700,
                                fontSize: 'var(--font-size-lg)',
                            }}
                        >
                            <span>Ticket Amount:</span>
                            <span>{formatCurrency(getSelectedTicketPrice())}</span>
                        </div>
                    </div>

                    {/* Submit Button */}
                    <AdminButton
                        type="submit"
                        variant="primary"
                        disabled={processing}
                        style={{ width: '100%' }}
                    >
                        Process Purchase
                    </AdminButton>
                </form>
            </AdminCard>
        </AdminLayout>
    );
}

/**
 * ManualEntryPage - Admin manual entry page with providers
 */
export default function ManualEntryPage() {
    return (
        <AdminProviders>
            <ManualEntryPageContent />
        </AdminProviders>
    );
}

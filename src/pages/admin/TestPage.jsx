/**
 * Admin Test Utilities Page
 *
 * Development and testing tools for admin operations.
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
 * Result display component
 */
function ResultDisplay({ result }) {
    if (!result) return null;

    const className = result.success ? 'admin-alert-success' : 'admin-alert-error';

    return (
        <div
            className={className}
            style={{
                marginTop: 'var(--space-lg)',
                padding: 'var(--space-md)',
                borderRadius: 'var(--radius-md)',
                background: result.success
                    ? 'rgba(16, 185, 129, 0.1)'
                    : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${result.success ? 'var(--color-success)' : 'var(--color-error)'}`,
                color: result.success ? 'var(--color-success)' : 'var(--color-error)',
            }}
            dangerouslySetInnerHTML={{ __html: result.message }}
        />
    );
}

/**
 * TestPageContent - Main content
 */
function TestPageContent() {
    const { isAuthenticated } = useAdminAuth();
    const { post } = useAdminApi();

    const [addTicketsLoading, setAddTicketsLoading] = useState(false);
    const [addTicketsResult, setAddTicketsResult] = useState(null);

    const [createTicketLoading, setCreateTicketLoading] = useState(false);
    const [createTicketResult, setCreateTicketResult] = useState(null);

    const [clearDataLoading, setClearDataLoading] = useState(false);
    const [clearDataResult, setClearDataResult] = useState(null);

    /**
     * Add test tickets to cart
     */
    const handleAddTestTickets = useCallback(() => {
        setAddTicketsLoading(true);
        setAddTicketsResult(null);

        try {
            // Define test tickets based on bootstrap.json
            const testTickets = [
                {
                    ticketType: 'test-vip-pass',
                    eventId: -2,
                    eventName: 'Test Festival',
                    price: 150.0,
                    name: '[TEST] VIP Pass',
                    quantity: 1,
                },
                {
                    ticketType: 'test-weekender-pass',
                    eventId: -1,
                    eventName: 'Test Weekender',
                    price: 75.0,
                    name: '[TEST] Weekender Pass',
                    quantity: 1,
                },
                {
                    ticketType: 'test-saturday-pass',
                    eventId: -2,
                    eventName: 'Test Festival',
                    price: 35.0,
                    name: '[TEST] Saturday Pass',
                    quantity: 1,
                },
            ];

            // Get existing cart or create new one
            let cart;
            try {
                const cartData = localStorage.getItem('alocubano_cart');
                cart = cartData ? JSON.parse(cartData) : null;
            } catch {
                cart = null;
            }

            // Initialize cart structure if needed
            if (!cart || typeof cart !== 'object' || !cart.tickets) {
                cart = {
                    tickets: {},
                    donations: [],
                    metadata: {
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        sessionId: `session_${Date.now()}_${Math.random().toString(36).substring(2)}`,
                        checkoutStartedAt: null,
                        checkoutSessionId: null,
                    },
                };
            }

            // Add tickets to cart
            for (const ticket of testTickets) {
                cart.tickets[ticket.ticketType] = {
                    ticketType: ticket.ticketType,
                    quantity: ticket.quantity,
                    price: Math.round(ticket.price * 100),
                    name: ticket.name,
                    eventId: ticket.eventId,
                    eventName: ticket.eventName,
                };
            }

            // Update metadata
            cart.metadata.updatedAt = Date.now();

            // Save to localStorage
            localStorage.setItem('alocubano_cart', JSON.stringify(cart));

            setAddTicketsResult({
                success: true,
                message: `
                    <strong>✅ Success!</strong> Added 3 test tickets to cart:
                    <ul style="margin-top: 0.5rem; margin-left: 1.5rem;">
                        <li>1× [TEST] VIP Pass ($150.00)</li>
                        <li>1× [TEST] Weekender Pass ($75.00)</li>
                        <li>1× [TEST] Saturday Pass ($35.00)</li>
                    </ul>
                    <p style="margin-top: 0.5rem;">Total: $260.00</p>
                    <p style="margin-top: 0.5rem;"><strong>Click "View Cart" to see the items on /tickets page</strong></p>
                `,
            });
        } catch (error) {
            console.error('Failed to add test tickets:', error);
            setAddTicketsResult({
                success: false,
                message: `<strong>❌ Error:</strong> ${escapeHtml(error.message)}`,
            });
        } finally {
            setAddTicketsLoading(false);
        }
    }, []);

    /**
     * Create unregistered test ticket
     */
    const handleCreateTestTicket = useCallback(async () => {
        if (!isAuthenticated) return;

        setCreateTicketLoading(true);
        setCreateTicketResult(null);

        try {
            const data = await post('/api/admin/test-data/create-ticket', {});

            const ticketData = data.data;

            setCreateTicketResult({
                success: true,
                message: `
                    <strong>✅ Success!</strong> Test ticket created successfully:
                    <ul style="margin-top: 0.5rem; margin-left: 1.5rem;">
                        <li><strong>Ticket ID:</strong> <a href="/admin/tickets?search=${escapeHtml(ticketData.ticket_id)}" style="color: var(--color-blue); text-decoration: underline;">${escapeHtml(ticketData.ticket_id)}</a></li>
                        <li><strong>Order Number:</strong> ${escapeHtml(ticketData.order_number)}</li>
                        <li><strong>Attendee:</strong> ${escapeHtml(ticketData.attendee.first_name)} ${escapeHtml(ticketData.attendee.last_name)}</li>
                        <li><strong>Email:</strong> ${escapeHtml(ticketData.attendee.email)}</li>
                        <li><strong>Registration Deadline:</strong> ${escapeHtml(ticketData.registration_deadline_mt)}</li>
                        <li><strong>Reminders Scheduled:</strong> ${ticketData.reminders_scheduled} (every 5 minutes)</li>
                    </ul>
                    <p style="margin-top: 0.75rem; padding: 0.5rem; background: rgba(59, 130, 246, 0.1); border: 1px solid var(--color-blue); border-radius: 4px;">
                        <strong>📧 Next Steps:</strong> Check ${escapeHtml(ticketData.attendee.email)} for reminder emails starting in 5 minutes.
                        <br/>
                        <strong>🔗 Registration Link:</strong> <a href="/registration/${escapeHtml(ticketData.registration_token)}" style="color: var(--color-blue); text-decoration: underline;" target="_blank">Open Registration Page</a>
                    </p>
                `,
            });
        } catch (error) {
            console.error('Failed to create test ticket:', error);
            setCreateTicketResult({
                success: false,
                message: `<strong>❌ Error:</strong> ${escapeHtml(error.message)}`,
            });
        } finally {
            setCreateTicketLoading(false);
        }
    }, [isAuthenticated, post]);

    /**
     * Clear test data
     */
    const handleClearTestData = useCallback(async () => {
        if (!isAuthenticated) return;

        // Confirm action
        if (
            !window.confirm(
                '⚠️ Are you sure you want to clear ALL test tickets from the database? This action cannot be undone.'
            )
        ) {
            return;
        }

        setClearDataLoading(true);
        setClearDataResult(null);

        try {
            const data = await post('/api/admin/test-data/clear', {});

            setClearDataResult({
                success: true,
                message: `
                    <strong>✅ Success!</strong> Test data cleared successfully:
                    <ul style="margin-top: 0.5rem; margin-left: 1.5rem;">
                        <li>Tickets deleted: ${data.data.tickets_deleted}</li>
                        <li>Transactions deleted: ${data.data.transactions_deleted}</li>
                        <li>Total records deleted: ${data.data.total_records_deleted}</li>
                    </ul>
                    <p style="margin-top: 0.5rem; font-size: 0.875rem; opacity: 0.8;">
                        Completed in ${data.data.duration_ms}ms
                    </p>
                `,
            });
        } catch (error) {
            console.error('Failed to clear test data:', error);
            setClearDataResult({
                success: false,
                message: `<strong>❌ Error:</strong> ${escapeHtml(error.message)}`,
            });
        } finally {
            setClearDataLoading(false);
        }
    }, [isAuthenticated, post]);

    /**
     * View cart
     */
    const handleViewCart = () => {
        window.location.href = '/tickets';
    };

    return (
        <AdminLayout
            title="Test Utilities"
            subtitle="Development & Testing Tools"
            currentPage="test"
        >
            {/* Warning Banner */}
            <div
                style={{
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '2px solid var(--color-warning)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-lg)',
                    marginBottom: 'var(--space-2xl)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 'var(--space-md)',
                }}
            >
                <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>⚠️</span>
                <div>
                    <div
                        style={{
                            fontWeight: 700,
                            color: 'var(--color-warning)',
                            marginBottom: 'var(--space-xs)',
                        }}
                    >
                        Development Environment Only
                    </div>
                    <div
                        style={{
                            color: 'var(--color-text-secondary)',
                            lineHeight: 'var(--line-height-relaxed)',
                        }}
                    >
                        These utilities are for testing purposes only. Test tickets will have
                        event IDs of -1 (Test Weekender) or -2 (Test Festival) and will be
                        clearly marked throughout the system.
                    </div>
                </div>
            </div>

            {/* Add Test Tickets Card */}
            <AdminCard className="admin-mb-xl">
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-md)',
                        marginBottom: 'var(--space-lg)',
                    }}
                >
                    <span style={{ fontSize: '2rem' }}>🎫</span>
                    <h2
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 'var(--font-size-xl)',
                            fontWeight: 700,
                            margin: 0,
                        }}
                    >
                        Add Test Tickets to Cart
                    </h2>
                </div>
                <p
                    style={{
                        color: 'var(--color-text-secondary)',
                        marginBottom: 'var(--space-xl)',
                        lineHeight: 'var(--line-height-relaxed)',
                    }}
                >
                    Quickly add test tickets to your cart for testing the checkout flow. This
                    will add one of each test ticket type:{' '}
                    <strong>VIP Pass ($150)</strong>, <strong>Weekender Pass ($75)</strong>,
                    and <strong>Saturday Pass ($35)</strong>.
                </p>
                <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
                    <AdminButton
                        variant="primary"
                        onClick={handleAddTestTickets}
                        disabled={addTicketsLoading}
                    >
                        {addTicketsLoading ? '⏳ Adding tickets...' : '➕ Add Test Tickets'}
                    </AdminButton>
                    <AdminButton variant="danger" onClick={handleViewCart}>
                        View Cart
                    </AdminButton>
                </div>
                <ResultDisplay result={addTicketsResult} />
            </AdminCard>

            {/* Create Unregistered Test Ticket Card */}
            <AdminCard className="admin-mb-xl">
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-md)',
                        marginBottom: 'var(--space-lg)',
                    }}
                >
                    <span style={{ fontSize: '2rem' }}>📝</span>
                    <h2
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 'var(--font-size-xl)',
                            fontWeight: 700,
                            margin: 0,
                        }}
                    >
                        Create Unregistered Test Ticket
                    </h2>
                </div>
                <p
                    style={{
                        color: 'var(--color-text-secondary)',
                        marginBottom: 'var(--space-xl)',
                        lineHeight: 'var(--line-height-relaxed)',
                    }}
                >
                    Create a single test ticket with pending registration status to test the
                    registration deadline and reminder system. The ticket will have a
                    registration deadline of <strong>7 days from creation</strong>, and test
                    reminders will be sent <strong>every 5 minutes</strong> (6 total reminders
                    over 30 minutes).
                </p>
                <AdminButton
                    variant="success"
                    onClick={handleCreateTestTicket}
                    disabled={createTicketLoading}
                >
                    {createTicketLoading ? '⏳ Creating test ticket...' : '➕ Create Test Ticket'}
                </AdminButton>
                <ResultDisplay result={createTicketResult} />
            </AdminCard>

            {/* Clear Test Data Card */}
            <AdminCard className="admin-mb-xl">
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-md)',
                        marginBottom: 'var(--space-lg)',
                    }}
                >
                    <span style={{ fontSize: '2rem' }}>🗑️</span>
                    <h2
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 'var(--font-size-xl)',
                            fontWeight: 700,
                            margin: 0,
                        }}
                    >
                        Clear Test Tickets
                    </h2>
                </div>
                <p
                    style={{
                        color: 'var(--color-text-secondary)',
                        marginBottom: 'var(--space-xl)',
                        lineHeight: 'var(--line-height-relaxed)',
                    }}
                >
                    Remove all test tickets from the database. This will permanently delete
                    all tickets with event IDs -1 or -2, including transactions,
                    registrations, and related data.{' '}
                    <strong>This action cannot be undone.</strong>
                </p>
                <AdminButton
                    variant="danger"
                    onClick={handleClearTestData}
                    disabled={clearDataLoading}
                >
                    {clearDataLoading ? '⏳ Clearing test data...' : '🗑️ Clear All Test Tickets'}
                </AdminButton>
                <ResultDisplay result={clearDataResult} />
            </AdminCard>
        </AdminLayout>
    );
}

/**
 * TestPage - Admin test utilities page with providers
 */
export default function TestPage() {
    return (
        <AdminProviders>
            <TestPageContent />
        </AdminProviders>
    );
}

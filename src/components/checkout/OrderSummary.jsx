/**
 * OrderSummary - React component for displaying cart contents
 *
 * Displays tickets and donations from the cart context with totals.
 * Now includes inline attendee registration forms for each ticket.
 * Styled to match the floating cart visual appearance.
 *
 * @module src/components/checkout/OrderSummary
 */

import React from 'react';
import TicketAttendeeForm from './TicketAttendeeForm';
import { generateTicketKey } from '../../utils/attendee-validation';

// Styles matching floating cart CSS
const styles = {
    container: {
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
        overflow: 'hidden',
    },
    header: {
        padding: 'var(--space-lg)',
        borderBottom: '1px solid var(--color-border)',
    },
    headerTitle: {
        margin: 0,
        fontSize: 'var(--font-size-2xl)',
        fontWeight: 900,
        fontFamily: 'var(--font-display)',
        color: 'var(--color-text-primary)',
        letterSpacing: 'var(--letter-spacing-wider)',
        textTransform: 'uppercase',
    },
    content: {
        padding: '20px',
    },
    emptyMessage: {
        textAlign: 'center',
        padding: '60px 20px',
        color: 'var(--color-text-muted)',
    },
    category: {
        marginBottom: 'var(--space-lg)',
    },
    categoryHeader: {
        fontFamily: 'var(--font-display)',
        fontSize: 'var(--font-size-lg)',
        fontWeight: 900,
        letterSpacing: 'var(--letter-spacing-widest)',
        textTransform: 'uppercase',
        marginBottom: 'var(--space-sm)',
        paddingBottom: 'var(--space-xs)',
        borderBottom: '1px solid var(--color-border)',
    },
    categoryHeaderTickets: {
        color: 'var(--color-blue)',
    },
    categoryHeaderDonations: {
        color: 'var(--color-red)',
    },
    item: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 0',
        borderBottom: '1px solid var(--color-border)',
    },
    itemLast: {
        borderBottom: 'none',
    },
    itemInfo: {
        flex: 1,
        marginRight: '16px',
    },
    itemName: {
        margin: '0 0 4px 0',
        fontSize: 'var(--font-size-base)',
        fontWeight: 700,
        fontFamily: 'var(--font-display)',
        color: 'var(--color-text-primary)',
        letterSpacing: 'var(--letter-spacing-wide)',
        textTransform: 'uppercase',
    },
    itemPrice: {
        color: 'var(--color-text-muted)',
        fontSize: 'var(--font-size-sm)',
        fontFamily: 'var(--font-code)',
        margin: 0,
    },
    itemActions: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexShrink: 0,
    },
    qtyDisplay: {
        minWidth: '24px',
        textAlign: 'center',
        fontWeight: 700,
        fontSize: '16px',
        fontFamily: 'var(--font-code)',
        color: 'var(--color-text-primary)',
    },
    itemTotal: {
        fontWeight: 700,
        fontSize: 'var(--font-size-base)',
        fontFamily: 'var(--font-code)',
        color: 'var(--color-text-primary)',
        minWidth: '80px',
        textAlign: 'right',
    },
    footer: {
        padding: 'var(--space-lg)',
        borderTop: '1px solid var(--color-border)',
        background: 'transparent',
    },
    total: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 'var(--font-size-lg)',
        fontWeight: 700,
        fontFamily: 'var(--font-display)',
        color: 'var(--color-text-primary)',
        letterSpacing: 'var(--letter-spacing-wide)',
        textTransform: 'uppercase',
    },
    totalAmount: {
        color: 'var(--color-red)',
        fontFamily: 'var(--font-code)',
        fontWeight: 700,
        fontSize: 'var(--font-size-xl)',
    },
};

/**
 * Group tickets by event ID for display
 * Matches the floating cart grouping behavior
 */
const groupTicketsByEvent = (ticketEntries) => {
    const grouped = {};
    for (const [ticketType, item] of ticketEntries) {
        const eventId = item.eventId || 'default';
        if (!grouped[eventId]) {
            grouped[eventId] = {
                eventName: item.eventName || 'Tickets',
                tickets: [],
            };
        }
        grouped[eventId].tickets.push([ticketType, item]);
    }
    return grouped;
};

/**
 * OrderSummary component
 *
 * @param {Object} props
 * @param {Object} props.cart - Cart state from useCart hook
 * @param {boolean} props.isLoading - Whether cart is still loading
 * @param {Object} props.attendeeData - Attendee data keyed by ticket identifier
 * @param {Object} props.attendeeErrors - Validation errors keyed by ticket identifier
 * @param {Function} props.onAttendeeChange - Callback for attendee data changes
 * @param {Function} props.onCopyToAll - Callback for "Copy to all" action
 * @param {number} props.ticketCount - Total number of tickets in cart
 * @param {boolean} props.disabled - Whether forms are disabled
 */
export default function OrderSummary({
    cart,
    isLoading = false,
    attendeeData = {},
    attendeeErrors = {},
    onAttendeeChange,
    onCopyToAll,
    ticketCount = 0,
    disabled = false,
}) {
    // Loading state
    if (isLoading) {
        return (
            <div className="order-summary" data-testid="order-summary" style={styles.container}>
                <div style={styles.header}>
                    <h3 style={styles.headerTitle}>Order Summary</h3>
                </div>
                <div style={styles.content}>
                    <div style={styles.emptyMessage}>
                        <p style={{ fontSize: '18px', marginBottom: '8px', fontWeight: 500 }}>
                            Loading cart...
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Extract cart data
    const tickets = cart?.tickets || {};
    const donations = cart?.donations || [];
    const totals = cart?.totals || {};

    const ticketEntries = Object.entries(tickets);
    const isEmpty = ticketEntries.length === 0 && donations.length === 0;

    // Empty cart state
    if (isEmpty) {
        return (
            <div className="order-summary" data-testid="order-summary" style={styles.container}>
                <div style={styles.header}>
                    <h3 style={styles.headerTitle}>Order Summary</h3>
                </div>
                <div style={styles.content}>
                    <div style={styles.emptyMessage}>
                        <p style={{ fontSize: '18px', marginBottom: '8px', fontWeight: 500 }}>
                            Your cart is empty
                        </p>
                        <p style={{ fontSize: '14px', marginTop: '8px' }}>
                            Add tickets or donations to continue
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Calculate item totals
    // Tickets are stored in cents, donations in dollars
    const formatPrice = (priceInCents) => {
        return (priceInCents / 100).toFixed(2);
    };

    const calculateTicketTotal = (priceInCents, quantity) => {
        return ((priceInCents || 0) * (quantity || 1) / 100).toFixed(2);
    };

    // Get grand total from cart totals or calculate
    // Use nullish coalescing (??) to preserve valid zero values for free tickets
    // Grand total is in cents for tickets, need to convert to dollars
    const grandTotalCents = totals.grandTotal ?? totals.total ?? 0;
    const grandTotalDollars = grandTotalCents / 100;

    return (
        <div className="order-summary" data-testid="order-summary" style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <h3 style={styles.headerTitle}>Order Summary</h3>
            </div>

            {/* Content */}
            <div style={styles.content}>
                {/* Tickets grouped by Event - each ticket listed separately with attendee form */}
                {ticketEntries.length > 0 && (() => {
                    const eventGroups = groupTicketsByEvent(ticketEntries);
                    let globalTicketIndex = 0; // Track overall ticket index for "Copy to all"

                    return Object.entries(eventGroups).map(([eventId, group]) => {
                        // Expand tickets: create individual rows for each quantity
                        const expandedTickets = [];
                        group.tickets.forEach(([ticketType, item]) => {
                            const qty = item.quantity || 1;
                            for (let i = 0; i < qty; i++) {
                                // Ensure item has ticketType for key generation
                                // (ticketType comes from the cart key, may not be on item itself)
                                const itemWithType = { ...item, ticketType: item.ticketType || ticketType };
                                // Generate consistent ticket key using the utility function
                                const ticketKey = generateTicketKey(itemWithType, i);
                                expandedTickets.push({
                                    ticketType,
                                    item: itemWithType,
                                    index: i,
                                    key: ticketKey,
                                    globalIndex: globalTicketIndex++,
                                });
                            }
                        });

                        return (
                            <div key={eventId} style={styles.category}>
                                <div style={{ ...styles.categoryHeader, ...styles.categoryHeaderTickets }}>
                                    {group.eventName}
                                </div>
                                {expandedTickets.map((ticket, idx) => (
                                    <div key={ticket.key}>
                                        <div
                                            className="order-item"
                                            data-testid={`order-item-${ticket.key}`}
                                            style={{
                                                ...styles.item,
                                                borderBottom: '1px solid var(--color-border)',
                                            }}
                                        >
                                            <div style={styles.itemInfo}>
                                                <h4 style={styles.itemName}>
                                                    {ticket.item.name || ticket.ticketType}
                                                </h4>
                                                <p style={styles.itemPrice}>
                                                    Ticket {ticket.index + 1} of {ticket.item.quantity}
                                                </p>
                                            </div>
                                            <div style={styles.itemActions}>
                                                <span style={styles.itemTotal}>
                                                    ${formatPrice(ticket.item.price)}
                                                </span>
                                            </div>
                                        </div>
                                        {/* Attendee form for this ticket */}
                                        {onAttendeeChange && (
                                            <TicketAttendeeForm
                                                ticketKey={ticket.key}
                                                ticketIndex={ticket.globalIndex + 1}
                                                ticketName={ticket.item.name || ticket.ticketType}
                                                attendee={attendeeData[ticket.key] || {}}
                                                errors={attendeeErrors[ticket.key] || {}}
                                                onChange={onAttendeeChange}
                                                disabled={disabled}
                                                showCopyAll={ticket.globalIndex === 0 && ticketCount > 1}
                                                onCopyToAll={onCopyToAll}
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        );
                    });
                })()}

                {/* Donations Category */}
                {donations.length > 0 && (
                    <div style={{ ...styles.category, marginBottom: 0 }}>
                        <div style={{ ...styles.categoryHeader, ...styles.categoryHeaderDonations }}>
                            Donations
                        </div>
                        {donations.map((donation, index) => (
                            <div
                                key={`donation-${donation.id || index}`}
                                className="order-item"
                                data-testid={`order-item-donation-${index}`}
                                style={{
                                    ...styles.item,
                                    ...(index === donations.length - 1 ? styles.itemLast : {}),
                                }}
                            >
                                <div style={styles.itemInfo}>
                                    <h4 style={styles.itemName}>
                                        {donation.name || 'A Lo Cubano Donation'}
                                    </h4>
                                    <p style={styles.itemPrice}>
                                        One-time contribution
                                    </p>
                                </div>
                                <div style={styles.itemActions}>
                                    <span style={styles.itemTotal}>
                                        ${(donation.amount || 0).toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer with Total */}
            <div style={styles.footer}>
                <div style={styles.total}>
                    <span>Total</span>
                    <span data-testid="order-total" style={styles.totalAmount}>
                        ${grandTotalDollars.toFixed(2)}
                    </span>
                </div>
            </div>
        </div>
    );
}

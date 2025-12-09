/**
 * OrderSummary - React component for displaying cart contents
 *
 * Displays tickets and donations from the cart context with totals.
 * Now includes inline attendee registration forms for each ticket.
 * Simplified design with no container boxes - just line separators.
 *
 * @module src/components/checkout/OrderSummary
 */

import React from 'react';
import TicketAttendeeForm from './TicketAttendeeForm';
import { generateTicketKey, EMAIL_REGEX } from '../../utils/attendee-validation';

// Simplified styles - no container boxes, line separators only
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
    // Ticket item - no box, just line separator
    ticketItem: {
        padding: '16px 0',
        borderBottom: '1px solid var(--color-border)',
    },
    ticketItemLast: {
        borderBottom: 'none',
    },
    // Ticket header with 20px text
    ticketHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    ticketName: {
        fontFamily: 'var(--font-display)',
        fontSize: '20px',
        fontWeight: 700,
        color: 'var(--color-text-primary)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    },
    ticketPrice: {
        fontFamily: 'var(--font-code)',
        fontSize: '20px',
        fontWeight: 700,
        color: 'var(--color-text-primary)',
    },
    // Donation items
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
    itemTotal: {
        fontWeight: 700,
        fontSize: 'var(--font-size-base)',
        fontFamily: 'var(--font-code)',
        color: 'var(--color-text-primary)',
        minWidth: '80px',
        textAlign: 'right',
    },
    // Status line at bottom
    statusLine: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 0',
        marginTop: '16px',
        borderTop: '1px solid var(--color-border)',
    },
    statusText: {
        fontFamily: 'var(--font-sans)',
        fontSize: '14px',
        color: 'var(--color-text-secondary)',
    },
    statusCount: {
        fontFamily: 'var(--font-sans)',
        fontSize: '14px',
        fontWeight: 600,
        color: 'var(--color-text-primary)',
    },
    statusComplete: {
        color: 'var(--color-success, #22c55e)',
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
 * @param {Function} props.onClearCopied - Callback for clearing copied attendee data
 * @param {boolean} props.copyAllChecked - Whether "Copy to all" is currently checked
 * @param {number} props.ticketCount - Total number of tickets in cart
 * @param {boolean} props.disabled - Whether forms are disabled
 * @param {number} props.completedCount - Number of registered tickets (optional)
 */
export default function OrderSummary({
    cart,
    isLoading = false,
    attendeeData = {},
    attendeeErrors = {},
    onAttendeeChange,
    onCopyToAll,
    onClearCopied,
    copyAllChecked = false,
    ticketCount = 0,
    disabled = false,
    completedCount,
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

    // Get grand total from cart totals or calculate
    // Use nullish coalescing (??) to preserve valid zero values for free tickets
    // Grand total is in cents for tickets, need to convert to dollars
    const grandTotalCents = totals.grandTotal ?? totals.total ?? 0;
    const grandTotalDollars = grandTotalCents / 100;

    // Calculate completed count if not provided
    // Only count attendees for tickets that are currently in the cart (not removed tickets)
    let calculatedCompletedCount = 0;
    if (completedCount === undefined) {
        // Build set of valid ticket keys from current cart
        const validTicketKeys = new Set();
        ticketEntries.forEach(([ticketType, item]) => {
            const qty = item.quantity || 1;
            for (let i = 0; i < qty; i++) {
                const itemWithType = { ...item, ticketType: item.ticketType || ticketType };
                validTicketKeys.add(generateTicketKey(itemWithType, i));
            }
        });

        // Count only attendees whose tickets are still in the cart
        Object.entries(attendeeData).forEach(([ticketKey, attendee]) => {
            if (!validTicketKeys.has(ticketKey)) return; // Skip removed tickets
            const hasValidEmail = attendee.email && EMAIL_REGEX.test(attendee.email.trim());
            if (attendee.firstName && attendee.lastName && hasValidEmail) {
                calculatedCompletedCount++;
            }
        });
    } else {
        calculatedCompletedCount = completedCount;
    }

    const hasTickets = ticketEntries.length > 0;
    const allComplete = hasTickets && calculatedCompletedCount === ticketCount;

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
                                {/* Tickets with line separators only - no boxes */}
                                {expandedTickets.map((ticket, idx) => (
                                    <div
                                        key={ticket.key}
                                        data-testid={`order-item-${ticket.key}`}
                                        style={{
                                            ...styles.ticketItem,
                                            ...(idx === expandedTickets.length - 1 ? styles.ticketItemLast : {}),
                                        }}
                                    >
                                        {/* Ticket header - 20px text */}
                                        <div style={styles.ticketHeader}>
                                            <span style={styles.ticketName}>
                                                {ticket.item.name || ticket.ticketType}
                                            </span>
                                            <span style={styles.ticketPrice}>
                                                ${formatPrice(ticket.item.price)}
                                            </span>
                                        </div>
                                        {/* Attendee form */}
                                        {onAttendeeChange && (
                                            <TicketAttendeeForm
                                                ticketKey={ticket.key}
                                                ticketIndex={ticket.globalIndex + 1}
                                                ticketName={null}
                                                attendee={attendeeData[ticket.key] || {}}
                                                errors={attendeeErrors[ticket.key] || {}}
                                                onChange={onAttendeeChange}
                                                disabled={disabled}
                                                showCopyAll={ticket.globalIndex === 0 && ticketCount > 1}
                                                onCopyToAll={onCopyToAll}
                                                onClearCopied={onClearCopied}
                                                copyAllChecked={copyAllChecked}
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
                                <div>
                                    <span style={styles.itemTotal}>
                                        ${((donation.amount || 0) / 100).toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Status Line - at bottom of content, before total */}
                {hasTickets && ticketCount > 0 && (
                    <div style={styles.statusLine}>
                        <span style={styles.statusText}>Attendee Registration</span>
                        <span style={{
                            ...styles.statusCount,
                            ...(allComplete ? styles.statusComplete : {}),
                        }}>
                            {calculatedCompletedCount} of {ticketCount} completed
                        </span>
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

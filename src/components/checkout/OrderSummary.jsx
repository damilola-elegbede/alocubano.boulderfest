/**
 * OrderSummary - React component for displaying cart contents
 *
 * Displays tickets and donations from the cart context with totals.
 * Read-only component for checkout flow.
 * Styled to match the floating cart visual appearance.
 *
 * @module src/components/checkout/OrderSummary
 */

import React from 'react';

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
 * OrderSummary component
 *
 * @param {Object} props
 * @param {Object} props.cart - Cart state from useCart hook
 * @param {boolean} props.isLoading - Whether cart is still loading
 */
export default function OrderSummary({ cart, isLoading = false }) {
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
                {/* Tickets Category */}
                {ticketEntries.length > 0 && (
                    <div style={styles.category}>
                        <div style={{ ...styles.categoryHeader, ...styles.categoryHeaderTickets }}>
                            Tickets
                        </div>
                        {ticketEntries.map(([ticketType, item], index) => (
                            <div
                                key={ticketType}
                                className="order-item"
                                data-testid={`order-item-${ticketType}`}
                                style={{
                                    ...styles.item,
                                    ...(index === ticketEntries.length - 1 ? styles.itemLast : {}),
                                }}
                            >
                                <div style={styles.itemInfo}>
                                    <h4 style={styles.itemName}>
                                        {item.name || ticketType}
                                    </h4>
                                    <p style={styles.itemPrice}>
                                        ${formatPrice(item.price)} each
                                    </p>
                                </div>
                                <div style={styles.itemActions}>
                                    <span style={styles.qtyDisplay}>x{item.quantity || 1}</span>
                                    <span style={styles.itemTotal}>
                                        ${calculateTicketTotal(item.price, item.quantity)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

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
                                    <span style={styles.qtyDisplay}>x1</span>
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

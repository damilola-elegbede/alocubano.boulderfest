/**
 * OrderSummary - React component for displaying cart contents
 *
 * Displays tickets and donations from the cart context with totals.
 * Read-only component for checkout flow.
 *
 * @module src/components/checkout/OrderSummary
 */

import React from 'react';

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
            <div className="order-summary" data-testid="order-summary">
                <h3
                    style={{
                        color: 'var(--color-text-primary)',
                        fontFamily: 'var(--font-display)',
                        fontSize: 'var(--font-size-xl)',
                        textTransform: 'uppercase',
                        marginBottom: 'var(--space-md)',
                    }}
                >
                    Order Summary
                </h3>
                <p style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>
                    Loading cart...
                </p>
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
            <div className="order-summary" data-testid="order-summary">
                <h3
                    style={{
                        color: 'var(--color-text-primary)',
                        fontFamily: 'var(--font-display)',
                        fontSize: 'var(--font-size-xl)',
                        textTransform: 'uppercase',
                        marginBottom: 'var(--space-md)',
                    }}
                >
                    Order Summary
                </h3>
                <p
                    style={{
                        color: 'var(--color-text-muted)',
                        textAlign: 'center',
                        padding: 'var(--space-lg) 0',
                    }}
                >
                    Your cart is empty
                </p>
            </div>
        );
    }

    // Calculate item totals
    const calculateItemTotal = (price, quantity) => {
        return ((price || 0) * (quantity || 0)).toFixed(2);
    };

    // Get grand total from cart totals or calculate
    // Use nullish coalescing (??) to preserve valid zero values for free tickets
    const grandTotal = totals.grandTotal ?? totals.total ?? 0;

    return (
        <div className="order-summary" data-testid="order-summary">
            <h3
                style={{
                    color: 'var(--color-text-primary)',
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--font-size-xl)',
                    textTransform: 'uppercase',
                    marginBottom: 'var(--space-md)',
                }}
            >
                Order Summary
            </h3>

            <div className="order-items" style={{ marginBottom: 'var(--space-md)' }}>
                {/* Ticket Items */}
                {ticketEntries.map(([ticketType, item]) => (
                    <div
                        key={ticketType}
                        className="order-item"
                        data-testid={`order-item-${ticketType}`}
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: 'var(--space-sm) 0',
                            borderBottom: '1px solid var(--color-border)',
                        }}
                    >
                        <span
                            className="item-name"
                            style={{
                                flex: 1,
                                color: 'var(--color-text-primary)',
                            }}
                        >
                            {/* React auto-escapes text content - no manual escaping needed */}
                            {item.name || ticketType}
                        </span>
                        <span
                            className="item-quantity"
                            style={{
                                color: 'var(--color-text-secondary)',
                                marginRight: 'var(--space-md)',
                            }}
                        >
                            x{item.quantity || 1}
                        </span>
                        <span
                            className="item-total"
                            style={{
                                fontWeight: 'bold',
                                color: 'var(--color-text-primary)',
                            }}
                        >
                            ${calculateItemTotal(item.price, item.quantity)}
                        </span>
                    </div>
                ))}

                {/* Donation Items */}
                {donations.map((donation, index) => (
                    <div
                        key={`donation-${donation.id || index}`}
                        className="order-item"
                        data-testid={`order-item-donation-${index}`}
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: 'var(--space-sm) 0',
                            borderBottom: '1px solid var(--color-border)',
                        }}
                    >
                        <span
                            className="item-name"
                            style={{
                                flex: 1,
                                color: 'var(--color-text-primary)',
                            }}
                        >
                            Donation
                        </span>
                        <span
                            className="item-quantity"
                            style={{
                                color: 'var(--color-text-secondary)',
                                marginRight: 'var(--space-md)',
                            }}
                        >
                            x1
                        </span>
                        <span
                            className="item-total"
                            style={{
                                fontWeight: 'bold',
                                color: 'var(--color-text-primary)',
                            }}
                        >
                            ${(donation.amount || 0).toFixed(2)}
                        </span>
                    </div>
                ))}
            </div>

            {/* Grand Total */}
            <div
                className="order-total"
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: 'var(--space-md)',
                    borderTop: '2px solid var(--color-border)',
                    marginTop: 'var(--space-sm)',
                }}
            >
                <span
                    style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 'var(--font-size-lg)',
                        textTransform: 'uppercase',
                        color: 'var(--color-text-primary)',
                    }}
                >
                    Total
                </span>
                <span
                    data-testid="order-total"
                    style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 'var(--font-size-xl)',
                        fontWeight: 'bold',
                        color: 'var(--color-primary)',
                    }}
                >
                    ${grandTotal.toFixed(2)}
                </span>
            </div>
        </div>
    );
}

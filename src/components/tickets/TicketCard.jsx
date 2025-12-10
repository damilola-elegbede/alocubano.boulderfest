/**
 * TicketCard Component
 *
 * Displays a single ticket with:
 * - Ticket type and ID
 * - Attendee information
 * - QR code for entry
 * - Wallet buttons (Apple/Google)
 * - Transfer button
 */

import React from 'react';
import { useTimeManager } from '../../hooks/useTimeManager';

// Ticket type display names
const TICKET_TYPE_LABELS = {
    'vip-pass': 'VIP Pass',
    'weekend-pass': 'Weekend Pass',
    'friday-pass': 'Friday Pass',
    'saturday-pass': 'Saturday Pass',
    'sunday-pass': 'Sunday Pass',
    'workshop-beginner': 'Beginner Workshop',
    'workshop-intermediate': 'Intermediate Workshop',
    'workshop-advanced': 'Advanced Workshop',
    'workshop': 'Workshop',
    'social-dance': 'Social Dance',
    'general-admission': 'General Admission'
};

function formatTicketType(type) {
    return TICKET_TYPE_LABELS[type] || type;
}

export default function TicketCard({ ticket, onTransfer, showTransfer = false }) {
    const { formatDate } = useTimeManager();

    const {
        ticket_id,
        ticket_type,
        formatted_type,
        status,
        attendee_first_name,
        attendee_last_name,
        attendee_email,
        event_date,
        formatted_date,
        color_rgb,
        scan_count = 0,
        scans_remaining
    } = ticket;

    const ticketType = formatted_type || formatTicketType(ticket_type || '');
    const displayDate = formatted_date || formatDate(event_date, true) || '';
    const remainingScans = scans_remaining !== undefined ? scans_remaining : (3 - scan_count);

    // Status badge colors
    const getStatusBadgeStyle = () => {
        switch (status) {
            case 'valid':
                return {
                    background: 'var(--color-success-light)',
                    color: 'var(--color-success-700)',
                    border: '1px solid var(--color-success)'
                };
            case 'used':
                return {
                    background: 'var(--color-info-light)',
                    color: 'var(--color-info-700)',
                    border: '1px solid var(--color-info)'
                };
            default:
                return {
                    background: 'var(--color-warning-light)',
                    color: 'var(--color-warning-700)',
                    border: '1px solid var(--color-warning)'
                };
        }
    };

    const statusLabel = status === 'valid' ? 'Valid' : status === 'used' ? 'Used' : status;

    return (
        <div
            className="ticket-card"
            id={`ticket-${ticket_id}`}
            data-ticket-id={ticket_id}
            style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '12px',
                padding: 'var(--space-xl)',
                marginBottom: 'var(--space-xl)',
                position: 'relative',
                borderLeft: '4px solid var(--color-primary)'
            }}
        >
            {/* Header Row: Type/ID | Color Circle | Status */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto 1fr',
                alignItems: 'center',
                gap: 'var(--space-lg)',
                marginBottom: 'var(--space-lg)'
            }}>
                {/* Left: Ticket Type and ID */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', alignItems: 'flex-start' }}>
                    <div>
                        <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 'var(--text-xs)',
                            color: 'var(--color-primary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            display: 'block',
                            marginBottom: 'var(--space-xs)'
                        }}>
                            TICKET TYPE
                        </span>
                        <span style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 'var(--text-2xl)',
                            color: 'var(--color-text-primary)'
                        }}>
                            {ticketType}
                        </span>
                    </div>
                    <div>
                        <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 'var(--text-xs)',
                            color: 'var(--color-primary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            display: 'block',
                            marginBottom: 'var(--space-xs)'
                        }}>
                            TICKET ID
                        </span>
                        <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 'var(--text-xs)',
                            color: 'var(--color-text-secondary)'
                        }}>
                            {ticket_id}
                        </span>
                    </div>
                </div>

                {/* Center: Color Circle */}
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    {color_rgb && (
                        <span
                            aria-hidden="true"
                            style={{
                                display: 'inline-block',
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                background: color_rgb
                            }}
                        />
                    )}
                </div>

                {/* Right: Status Badge */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start' }}>
                    <span style={{
                        padding: 'var(--space-xs) var(--space-md)',
                        borderRadius: '20px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        ...getStatusBadgeStyle()
                    }}>
                        {status === 'valid' && '✓ '}{statusLabel}
                    </span>
                </div>
            </div>

            {/* Attendee Info: Name | Email | Date */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 'var(--space-lg)',
                marginBottom: 'var(--space-xl)'
            }}>
                <div>
                    <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-primary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        display: 'block',
                        marginBottom: 'var(--space-xs)'
                    }}>
                        Attendee Name
                    </span>
                    <span style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 'var(--text-base)',
                        color: 'var(--color-text-primary)',
                        fontWeight: 500
                    }}>
                        {attendee_first_name} {attendee_last_name}
                    </span>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-primary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        display: 'block',
                        marginBottom: 'var(--space-xs)'
                    }}>
                        Email
                    </span>
                    <span style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 'var(--text-base)',
                        color: 'var(--color-text-primary)',
                        fontWeight: 500
                    }}>
                        {attendee_email}
                    </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-primary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        display: 'block',
                        marginBottom: 'var(--space-xs)'
                    }}>
                        Event Date
                    </span>
                    <span style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 'var(--text-base)',
                        color: 'var(--color-text-primary)',
                        fontWeight: 500
                    }}>
                        {displayDate}
                    </span>
                </div>
            </div>

            {/* QR Code Section */}
            <div style={{
                margin: 'var(--space-xl) 0',
                padding: 'var(--space-lg)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                textAlign: 'center'
            }}>
                <h3 style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--text-lg)',
                    marginBottom: 'var(--space-md)',
                    color: 'var(--color-text-primary)'
                }}>
                    Your Entry QR Code
                </h3>
                <div style={{
                    padding: 'var(--space-md)',
                    background: 'white',
                    borderRadius: '8px',
                    display: 'inline-block'
                }}>
                    <img
                        src={`/api/tickets/qr-image?ticketId=${encodeURIComponent(ticket_id)}`}
                        alt={`Ticket QR Code for ${ticket_id}`}
                        style={{ width: '200px', height: '200px', display: 'block' }}
                        onError={(e) => {
                            console.error('Failed to load QR code image');
                            e.target.style.display = 'none';
                        }}
                    />
                </div>
                <p style={{
                    marginTop: 'var(--space-md)',
                    fontFamily: 'var(--font-body)',
                    color: 'var(--color-text-secondary)',
                    fontSize: 'var(--text-sm)'
                }}>
                    Screenshot this QR code or scan at entry
                </p>
                <div style={{
                    marginTop: 'var(--space-sm)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-secondary)'
                }}>
                    Scans remaining: {remainingScans}
                </div>
            </div>

            {/* Wallet Buttons */}
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-md)',
                paddingTop: 'var(--space-lg)',
                justifyContent: 'center'
            }}>
                <p style={{
                    textAlign: 'center',
                    width: '100%',
                    marginBottom: 'var(--space-md)',
                    fontFamily: 'var(--font-body)',
                    color: 'var(--color-text-secondary)'
                }}>
                    Or add to your mobile wallet:
                </p>
                <a
                    href={`/api/tickets/apple-wallet/${ticket_id}`}
                    className="wallet-button"
                    aria-label={`Add ticket ${ticket_id} to Apple Wallet`}
                    style={{ display: 'inline-block', textDecoration: 'none', transition: 'opacity 0.2s ease' }}
                >
                    <img
                        src="/images/add-to-wallet-apple.svg"
                        alt="Add to Apple Wallet"
                        style={{ height: '40px', width: 'auto' }}
                    />
                </a>
                <a
                    href={`/api/tickets/google-wallet/${ticket_id}`}
                    className="wallet-button"
                    aria-label={`Add ticket ${ticket_id} to Google Wallet`}
                    style={{ display: 'inline-block', textDecoration: 'none', transition: 'opacity 0.2s ease' }}
                >
                    <img
                        src="/images/add-to-wallet-google.png"
                        alt="Add to Google Wallet"
                        style={{ height: '40px', width: 'auto' }}
                    />
                </a>
            </div>

            {/* Transfer Button */}
            {showTransfer && (
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    marginTop: 'var(--space-lg)',
                    paddingTop: 'var(--space-lg)'
                }}>
                    <button
                        className="btn-small btn-primary"
                        onClick={() => onTransfer(ticket_id)}
                        style={{
                            padding: '6px 12px',
                            border: 'none',
                            borderRadius: '4px',
                            background: 'var(--color-primary)',
                            color: 'var(--color-text-on-primary)',
                            fontSize: '12px',
                            cursor: 'pointer'
                        }}
                    >
                        Transfer Ticket
                    </button>
                </div>
            )}
        </div>
    );
}

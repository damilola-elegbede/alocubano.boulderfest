/**
 * TicketCard Component
 *
 * Displays a single ticket with:
 * - Ticket type and ID
 * - Attendee information
 * - QR code for entry
 * - Wallet buttons (Apple/Google)
 * - Transfer button
 *
 * Mobile: Collapsible accordion pattern for compact display
 * Desktop: Full expanded view
 */

import React, { useState } from 'react';
import { useTimeManager } from '../../hooks/useTimeManager';
import { formatTicketType } from '../../../lib/ticket-config.js';

export default function TicketCard({ ticket, onTransfer, showTransfer = false }) {
    const { formatDate } = useTimeManager();
    const [isExpanded, setIsExpanded] = useState(false);

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
    const attendeeName = `${attendee_first_name} ${attendee_last_name}`;

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

    const handleToggle = () => {
        setIsExpanded(!isExpanded);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
        }
    };

    // Prevent clicks on action buttons from triggering expand/collapse
    const handleActionClick = (e, action) => {
        e.stopPropagation();
        action();
    };

    return (
        <div
            className={`ticket-card ticket-card-mobile ${isExpanded ? 'ticket-card-expanded' : ''}`}
            id={`ticket-${ticket_id}`}
            data-ticket-id={ticket_id}
            role="button"
            tabIndex={0}
            aria-expanded={isExpanded}
            aria-label={`Ticket for ${attendeeName}, ${ticketType}, ${statusLabel}. Tap to ${isExpanded ? 'collapse' : 'expand'} details.`}
            onClick={handleToggle}
            onKeyDown={handleKeyDown}
            style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '12px',
                padding: 'var(--space-md)',
                marginBottom: 'var(--space-sm)',
                position: 'relative',
                cursor: 'pointer',
                borderLeft: '4px solid',
                borderImage: 'linear-gradient(180deg, #5b6bb5, #cc2936) 1'
            }}
        >
            {/* Collapsed Header - Always Visible */}
            <div className="ticket-card-header">
                {/* Row 1: Color dot + Type + Status */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 'var(--space-sm)',
                    marginBottom: 'var(--space-xs)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flex: 1, minWidth: 0 }}>
                        {color_rgb && (
                            <span
                                className="ticket-color-dot"
                                aria-hidden="true"
                                style={{
                                    display: 'inline-block',
                                    width: '24px',
                                    height: '24px',
                                    minWidth: '24px',
                                    borderRadius: '50%',
                                    background: color_rgb
                                }}
                            />
                        )}
                        <span style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 'var(--text-xl)',
                            color: 'var(--color-text-primary)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>
                            {ticketType}
                        </span>
                    </div>
                    <span style={{
                        padding: 'var(--space-xs) var(--space-sm)',
                        borderRadius: '20px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                        ...getStatusBadgeStyle()
                    }}>
                        {status === 'valid' && '✓ '}{statusLabel}
                    </span>
                </div>

                {/* Row 2: Name + ID + Chevron */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 'var(--space-sm)'
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-sm)',
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden'
                    }}>
                        <span style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: 'var(--text-sm)',
                            color: 'var(--color-text-primary)',
                            fontWeight: 500,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>
                            {attendeeName}
                        </span>
                        <span style={{
                            color: 'var(--color-text-secondary)',
                            fontSize: 'var(--text-xs)'
                        }}>•</span>
                        <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 'var(--text-xs)',
                            color: 'var(--color-text-secondary)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>
                            {ticket_id}
                        </span>
                    </div>
                    <span
                        className="ticket-chevron"
                        aria-hidden="true"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '24px',
                            height: '24px',
                            color: 'var(--color-text-secondary)',
                            transition: 'transform 0.3s ease',
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </span>
                </div>
            </div>

            {/* Expandable Content */}
            {isExpanded && (
                <div
                    className="ticket-card-content"
                    style={{
                        marginTop: 'var(--space-md)',
                        paddingTop: 'var(--space-md)',
                        borderTop: '1px solid var(--color-border)',
                        animation: 'ticketSlideDown 0.3s ease'
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Attendee Info - Stacked Vertically */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-sm)',
                        marginBottom: 'var(--space-md)'
                    }}>
                        <div>
                            <span style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '10px',
                                color: 'var(--color-primary)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                display: 'block',
                                marginBottom: '2px'
                            }}>
                                Attendee
                            </span>
                            <span style={{
                                fontFamily: 'var(--font-body)',
                                fontSize: 'var(--text-sm)',
                                color: 'var(--color-text-primary)',
                                fontWeight: 500
                            }}>
                                {attendeeName}
                            </span>
                        </div>
                        <div>
                            <span style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '10px',
                                color: 'var(--color-primary)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                display: 'block',
                                marginBottom: '2px'
                            }}>
                                Email
                            </span>
                            <span style={{
                                fontFamily: 'var(--font-body)',
                                fontSize: 'var(--text-sm)',
                                color: 'var(--color-text-primary)',
                                fontWeight: 500,
                                wordBreak: 'break-all'
                            }}>
                                {attendee_email}
                            </span>
                        </div>
                        <div>
                            <span style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '10px',
                                color: 'var(--color-primary)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                display: 'block',
                                marginBottom: '2px'
                            }}>
                                Event Date
                            </span>
                            <span style={{
                                fontFamily: 'var(--font-body)',
                                fontSize: 'var(--text-sm)',
                                color: 'var(--color-text-primary)',
                                fontWeight: 500
                            }}>
                                {displayDate}
                            </span>
                        </div>
                    </div>

                    {/* QR Code Section */}
                    <div style={{
                        padding: 'var(--space-md)',
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '8px',
                        textAlign: 'center',
                        marginBottom: 'var(--space-md)'
                    }}>
                        <h3 style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 'var(--text-base)',
                            marginBottom: 'var(--space-sm)',
                            color: 'var(--color-text-primary)'
                        }}>
                            Your Entry QR Code
                        </h3>
                        <div style={{
                            padding: 'var(--space-sm)',
                            background: 'white',
                            borderRadius: '8px',
                            display: 'inline-block'
                        }}>
                            <img
                                src={`/api/tickets/qr-image?ticketId=${encodeURIComponent(ticket_id)}`}
                                alt={`Ticket QR Code for ${ticket_id}`}
                                className="ticket-qr-code"
                                style={{ width: '150px', height: '150px', display: 'block' }}
                                onError={(e) => {
                                    console.error('Failed to load QR code image');
                                    e.target.style.display = 'none';
                                }}
                            />
                        </div>
                        <p style={{
                            marginTop: 'var(--space-sm)',
                            fontFamily: 'var(--font-body)',
                            color: 'var(--color-text-secondary)',
                            fontSize: 'var(--text-xs)'
                        }}>
                            Screenshot or scan at entry
                        </p>
                        <div style={{
                            marginTop: 'var(--space-xs)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11px',
                            color: 'var(--color-text-secondary)'
                        }}>
                            Scans remaining: {remainingScans}
                        </div>
                    </div>

                    {/* Wallet Buttons */}
                    <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 'var(--space-sm)',
                        justifyContent: 'center',
                        marginBottom: showTransfer ? 'var(--space-md)' : 0
                    }}>
                        <p style={{
                            textAlign: 'center',
                            width: '100%',
                            marginBottom: 'var(--space-xs)',
                            fontFamily: 'var(--font-body)',
                            color: 'var(--color-text-secondary)',
                            fontSize: 'var(--text-xs)'
                        }}>
                            Add to mobile wallet:
                        </p>
                        <a
                            href={`/api/tickets/apple-wallet/${ticket_id}`}
                            className="wallet-button"
                            aria-label={`Add ticket ${ticket_id} to Apple Wallet`}
                            onClick={(e) => e.stopPropagation()}
                            style={{ display: 'inline-block', textDecoration: 'none', transition: 'opacity 0.2s ease' }}
                        >
                            <img
                                src="/images/add-to-wallet-apple.svg"
                                alt="Add to Apple Wallet"
                                style={{ height: '36px', width: 'auto' }}
                            />
                        </a>
                        <a
                            href={`/api/tickets/google-wallet/${ticket_id}`}
                            className="wallet-button"
                            aria-label={`Add ticket ${ticket_id} to Google Wallet`}
                            onClick={(e) => e.stopPropagation()}
                            style={{ display: 'inline-block', textDecoration: 'none', transition: 'opacity 0.2s ease' }}
                        >
                            <img
                                src="/images/add-to-wallet-google.png"
                                alt="Add to Google Wallet"
                                style={{ height: '36px', width: 'auto' }}
                            />
                        </a>
                    </div>

                    {/* Transfer Button */}
                    {showTransfer && (
                        <div style={{
                            display: 'flex',
                            justifyContent: 'center'
                        }}>
                            <button
                                className="btn-small btn-primary"
                                onClick={(e) => handleActionClick(e, () => onTransfer(ticket_id))}
                                style={{
                                    padding: 'var(--space-sm) var(--space-md)',
                                    border: 'none',
                                    borderRadius: '4px',
                                    background: 'var(--color-primary)',
                                    color: 'var(--color-text-on-primary)',
                                    fontSize: 'var(--text-sm)',
                                    cursor: 'pointer',
                                    minHeight: '44px',
                                    minWidth: '140px'
                                }}
                            >
                                Transfer Ticket
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * MyTicketsPage Component
 *
 * React migration of pages/core/my-tickets.html
 *
 * Features:
 * - Email verification flow (6-digit code)
 * - JWT session management with expiry
 * - Ticket display with QR codes
 * - Apple/Google Wallet integration
 * - Ticket transfer functionality
 */

import React, { useState, useCallback, useEffect } from 'react';
import { AppProviders } from '../providers/AppProviders';
import { useTicketSession } from '../hooks/useTicketSession';
import { useEmailVerification } from '../hooks/useEmailVerification';
import EmailVerificationForm from '../components/tickets/EmailVerificationForm';
import TicketCard from '../components/tickets/TicketCard';
import TransferModal from '../components/tickets/TransferModal';

function MyTicketsPageContent() {
    // Session management
    const {
        isAuthenticated,
        email,
        accessToken,
        saveSession,
        clearSession
    } = useTicketSession();

    // Verification flow
    const {
        step,
        email: verificationEmail,
        isLoading: verificationLoading,
        error: verificationError,
        expirySeconds,
        resendCooldown,
        sendCode,
        verifyCode,
        resendCode,
        resetFlow,
        setError: setVerificationError
    } = useEmailVerification(saveSession);

    // Tickets state
    const [tickets, setTickets] = useState([]);
    const [isLoadingTickets, setIsLoadingTickets] = useState(false);
    const [ticketsError, setTicketsError] = useState(null);
    const [message, setMessage] = useState(null);

    // Transfer modal state
    const [transferModalOpen, setTransferModalOpen] = useState(false);
    const [selectedTicketId, setSelectedTicketId] = useState(null);

    // Load tickets when authenticated
    const loadTickets = useCallback(async () => {
        if (!isAuthenticated || !email || !accessToken) return;

        setIsLoadingTickets(true);
        setTicketsError(null);

        try {
            const response = await fetch(`/api/tickets?email=${encodeURIComponent(email)}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 401) {
                    // Token expired
                    clearSession();
                    resetFlow();
                    setMessage({ type: 'warning', text: 'Your session has expired. Please sign in again.' });
                    return;
                }
                throw new Error(data.error || 'Failed to load tickets');
            }

            // Filter tickets to only show those belonging to the verified email
            const filteredTickets = (data.tickets || []).filter(
                ticket => ticket.attendee_email === email
            );

            setTickets(filteredTickets);
        } catch (err) {
            console.error('Error loading tickets:', err);
            setTicketsError(err.message);
        } finally {
            setIsLoadingTickets(false);
        }
    }, [isAuthenticated, email, accessToken, clearSession, resetFlow]);

    // Load tickets on authentication
    useEffect(() => {
        if (isAuthenticated) {
            loadTickets();
        }
    }, [isAuthenticated, loadTickets]);

    // Handle verification success
    const handleVerificationSuccess = useCallback(async () => {
        setMessage({ type: 'success', text: 'Verification successful! Loading your tickets...' });
        // Tickets will load automatically via useEffect
    }, []);

    // Clear message after delay
    useEffect(() => {
        if (message) {
            const timer = setTimeout(() => setMessage(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [message]);

    // Handle transfer button click
    const handleTransferClick = (ticketId) => {
        setSelectedTicketId(ticketId);
        setTransferModalOpen(true);
    };

    // Handle transfer complete
    const handleTransferComplete = () => {
        setMessage({ type: 'success', text: 'Ticket transferred successfully!' });
        loadTickets(); // Reload tickets
    };

    // Handle logout
    const handleLogout = () => {
        clearSession();
        resetFlow();
        setTickets([]);
        setMessage({ type: 'info', text: 'You have been signed out.' });
    };

    return (
        <main>
            {/* Hero Splash Image */}
            <section className="gallery-hero-splash">
                <div className="hero-image-container">
                    <img
                        id="hero-splash-image"
                        src="/images/hero/tickets.jpg"
                        alt="Excited festival attendees enjoying A Lo Cubano Boulder Fest events"
                        className="hero-splash-img"
                        style={{ objectPosition: 'top center' }}
                    />
                </div>
            </section>

            <section className="section-typographic">
                <div
                    className="ticket-lookup"
                    style={{ maxWidth: '960px', margin: '0 auto', padding: '0 var(--space-lg)' }}
                >
                    <h1>My Tickets</h1>

                    {/* Message Display */}
                    {message && (
                        <div
                            className={`message ${message.type}`}
                            role="alert"
                            style={{
                                padding: '15px',
                                borderRadius: '5px',
                                margin: '20px 0',
                                background: message.type === 'error' ? 'var(--color-danger-light)' :
                                    message.type === 'success' ? 'var(--color-success-light)' :
                                        message.type === 'warning' ? 'var(--color-warning-light)' :
                                            'var(--color-info-lighter)',
                                color: message.type === 'error' ? 'var(--color-danger-dark)' :
                                    message.type === 'success' ? 'var(--color-success-dark)' :
                                        message.type === 'warning' ? 'var(--color-warning-dark)' :
                                            'var(--color-info-darker)'
                            }}
                        >
                            {message.text}
                        </div>
                    )}

                    {/* Not Authenticated: Show verification flow */}
                    {!isAuthenticated && (
                        <EmailVerificationForm
                            step={step}
                            email={verificationEmail}
                            isLoading={verificationLoading}
                            error={verificationError}
                            expirySeconds={expirySeconds}
                            resendCooldown={resendCooldown}
                            onSendCode={sendCode}
                            onVerifyCode={async (code) => {
                                const result = await verifyCode(code);
                                if (result) {
                                    handleVerificationSuccess();
                                }
                            }}
                            onResendCode={resendCode}
                            onChangeEmail={resetFlow}
                        />
                    )}

                    {/* Authenticated: Show session info and tickets */}
                    {isAuthenticated && (
                        <>
                            {/* Session Info */}
                            <div
                                className="session-info"
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: 'var(--space-xl)',
                                    padding: 'var(--space-md)',
                                    background: 'var(--color-surface)',
                                    borderRadius: '8px',
                                    flexWrap: 'wrap',
                                    gap: 'var(--space-md)'
                                }}
                            >
                                <p style={{ margin: 0 }}>
                                    Viewing tickets for{' '}
                                    <span
                                        className="highlight-email"
                                        style={{ fontWeight: 600, color: 'var(--color-primary)' }}
                                    >
                                        {email}
                                    </span>
                                </p>
                                <button
                                    type="button"
                                    className="btn-link"
                                    onClick={handleLogout}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--color-primary)',
                                        cursor: 'pointer',
                                        textDecoration: 'underline'
                                    }}
                                >
                                    Sign out
                                </button>
                            </div>

                            {/* Loading State */}
                            {isLoadingTickets && (
                                <div
                                    className="loading"
                                    style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-secondary)' }}
                                >
                                    Loading your tickets...
                                </div>
                            )}

                            {/* Error State */}
                            {ticketsError && (
                                <div
                                    className="message error"
                                    role="alert"
                                    style={{
                                        padding: '15px',
                                        borderRadius: '5px',
                                        margin: '20px 0',
                                        background: 'var(--color-danger-light)',
                                        color: 'var(--color-danger-dark)'
                                    }}
                                >
                                    {ticketsError}
                                </div>
                            )}

                            {/* No Tickets */}
                            {!isLoadingTickets && !ticketsError && tickets.length === 0 && (
                                <p className="no-tickets" style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                                    No tickets found for this email.
                                </p>
                            )}

                            {/* Ticket List */}
                            {!isLoadingTickets && tickets.length > 0 && (
                                <div className="ticket-list" style={{ marginTop: 'var(--space-xl)' }}>
                                    <h2 style={{ marginBottom: 'var(--space-xl)' }}>
                                        You have {tickets.length} ticket{tickets.length === 1 ? '' : 's'}
                                    </h2>
                                    {tickets.map((ticket, index) => (
                                        <React.Fragment key={ticket.ticket_id}>
                                            <TicketCard
                                                ticket={ticket}
                                                onTransfer={handleTransferClick}
                                                showTransfer={true}
                                            />
                                            {index < tickets.length - 1 && (
                                                <div
                                                    style={{
                                                        margin: 'var(--space-xl) 0',
                                                        borderTop: '1px solid var(--color-border)'
                                                    }}
                                                />
                                            )}
                                        </React.Fragment>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </section>

            {/* Transfer Modal */}
            <TransferModal
                isOpen={transferModalOpen}
                ticketId={selectedTicketId}
                currentEmail={email}
                onClose={() => {
                    setTransferModalOpen(false);
                    setSelectedTicketId(null);
                }}
                onTransferComplete={handleTransferComplete}
            />
        </main>
    );
}

export default function MyTicketsPage() {
    return (
        <AppProviders>
            <MyTicketsPageContent />
        </AppProviders>
    );
}

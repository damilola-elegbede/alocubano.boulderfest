/**
 * TransferModal Component
 *
 * Modal dialog for transferring a ticket to another attendee.
 * Collects new attendee information and handles the transfer API call.
 */

import React, { useState, useEffect, useRef } from 'react';

export default function TransferModal({
    isOpen,
    ticketId,
    currentEmail,
    onClose,
    onTransferComplete
}) {
    const [formData, setFormData] = useState({
        email: '',
        firstName: '',
        lastName: '',
        phone: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const modalRef = useRef(null);
    const emailInputRef = useRef(null);

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setFormData({ email: '', firstName: '', lastName: '', phone: '' });
            setError(null);
            // Focus email input when modal opens
            setTimeout(() => emailInputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Handle escape key to close modal
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Handle click outside modal to close
    const handleBackdropClick = (e) => {
        if (e.target === modalRef.current) {
            onClose();
        }
    };

    // Handle form input changes
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // Handle form submission
    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            // Validate required fields
            if (!formData.email || !formData.firstName) {
                throw new Error('Email and first name are required');
            }

            if (!currentEmail) {
                throw new Error('Unable to determine current user. Please refresh the page and try again.');
            }

            // First get action token
            const tokenResponse = await fetch('/api/tickets/action-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'transfer',
                    targetId: ticketId,
                    email: currentEmail
                })
            });

            const tokenData = await tokenResponse.json();
            if (!tokenResponse.ok) {
                throw new Error(tokenData.error || 'Failed to get action token');
            }

            // Perform transfer
            const transferResponse = await fetch('/api/tickets/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticketId,
                    actionToken: tokenData.actionToken,
                    newAttendee: {
                        email: formData.email,
                        firstName: formData.firstName,
                        lastName: formData.lastName,
                        phone: formData.phone
                    }
                })
            });

            const transferData = await transferResponse.json();
            if (!transferResponse.ok) {
                throw new Error(transferData.error || 'Transfer failed');
            }

            // Success!
            onTransferComplete();
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            ref={modalRef}
            className="modal show"
            role="dialog"
            aria-labelledby="transferModalTitle"
            aria-modal="true"
            onClick={handleBackdropClick}
            style={{
                display: 'block',
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                background: 'rgba(0, 0, 0, 0.5)',
                zIndex: 1000,
                overflow: 'auto'
            }}
        >
            <div
                className="modal-content"
                style={{
                    backgroundColor: 'var(--color-surface-elevated)',
                    margin: '5% auto',
                    padding: '30px',
                    borderRadius: '10px',
                    maxWidth: '600px',
                    width: '90%',
                    position: 'relative'
                }}
            >
                <div
                    className="modal-header"
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingBottom: 'var(--space-md)',
                        borderBottom: '1px solid var(--color-border)',
                        marginBottom: 'var(--space-lg)'
                    }}
                >
                    <h2
                        id="transferModalTitle"
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 'var(--text-xl)',
                            color: 'var(--color-text-primary)',
                            margin: 0
                        }}
                    >
                        Transfer Ticket
                    </h2>
                    <button
                        className="close"
                        onClick={onClose}
                        aria-label="Close transfer modal"
                        style={{
                            color: 'var(--color-text-secondary)',
                            fontSize: '28px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            background: 'none',
                            border: 'none',
                            lineHeight: 1,
                            padding: 0
                        }}
                    >
                        &times;
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <p style={{
                        margin: '0 0 var(--space-lg)',
                        color: 'var(--color-text-secondary)',
                        fontSize: '14px',
                        lineHeight: 1.5
                    }}>
                        Transfer this ticket to another attendee. Both parties will receive email notifications.
                    </p>

                    {error && (
                        <div
                            className="message error"
                            role="alert"
                            style={{
                                padding: '15px',
                                borderRadius: '5px',
                                marginBottom: 'var(--space-lg)',
                                background: 'var(--color-danger-light)',
                                color: 'var(--color-danger-dark)'
                            }}
                        >
                            {error}
                        </div>
                    )}

                    <div className="form-group" style={{ marginBottom: 'var(--space-md)' }}>
                        <label
                            htmlFor="transferEmail"
                            style={{
                                display: 'block',
                                marginBottom: '8px',
                                fontWeight: 500,
                                color: 'var(--color-text-primary)',
                                fontSize: '14px'
                            }}
                        >
                            New Attendee Email *
                        </label>
                        <input
                            ref={emailInputRef}
                            type="email"
                            id="transferEmail"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            required
                            aria-required="true"
                            autoComplete="email"
                            disabled={isLoading}
                            style={{
                                width: '100%',
                                padding: '12px',
                                border: '1px solid var(--color-border)',
                                borderRadius: '4px',
                                background: 'var(--color-surface)',
                                color: 'var(--color-text-primary)',
                                fontSize: '16px'
                            }}
                        />
                    </div>

                    <div className="form-group" style={{ marginBottom: 'var(--space-md)' }}>
                        <label
                            htmlFor="transferFirstName"
                            style={{
                                display: 'block',
                                marginBottom: '8px',
                                fontWeight: 500,
                                color: 'var(--color-text-primary)',
                                fontSize: '14px'
                            }}
                        >
                            First Name *
                        </label>
                        <input
                            type="text"
                            id="transferFirstName"
                            name="firstName"
                            value={formData.firstName}
                            onChange={handleChange}
                            required
                            aria-required="true"
                            autoComplete="given-name"
                            disabled={isLoading}
                            style={{
                                width: '100%',
                                padding: '12px',
                                border: '1px solid var(--color-border)',
                                borderRadius: '4px',
                                background: 'var(--color-surface)',
                                color: 'var(--color-text-primary)',
                                fontSize: '16px'
                            }}
                        />
                    </div>

                    <div className="form-group" style={{ marginBottom: 'var(--space-md)' }}>
                        <label
                            htmlFor="transferLastName"
                            style={{
                                display: 'block',
                                marginBottom: '8px',
                                fontWeight: 500,
                                color: 'var(--color-text-primary)',
                                fontSize: '14px'
                            }}
                        >
                            Last Name
                        </label>
                        <input
                            type="text"
                            id="transferLastName"
                            name="lastName"
                            value={formData.lastName}
                            onChange={handleChange}
                            autoComplete="family-name"
                            disabled={isLoading}
                            style={{
                                width: '100%',
                                padding: '12px',
                                border: '1px solid var(--color-border)',
                                borderRadius: '4px',
                                background: 'var(--color-surface)',
                                color: 'var(--color-text-primary)',
                                fontSize: '16px'
                            }}
                        />
                    </div>

                    <div className="form-group" style={{ marginBottom: 'var(--space-md)' }}>
                        <label
                            htmlFor="transferPhone"
                            style={{
                                display: 'block',
                                marginBottom: '8px',
                                fontWeight: 500,
                                color: 'var(--color-text-primary)',
                                fontSize: '14px'
                            }}
                        >
                            Phone
                        </label>
                        <input
                            type="tel"
                            id="transferPhone"
                            name="phone"
                            value={formData.phone}
                            onChange={handleChange}
                            autoComplete="tel"
                            disabled={isLoading}
                            style={{
                                width: '100%',
                                padding: '12px',
                                border: '1px solid var(--color-border)',
                                borderRadius: '4px',
                                background: 'var(--color-surface)',
                                color: 'var(--color-text-primary)',
                                fontSize: '16px'
                            }}
                        />
                    </div>

                    <div
                        className="modal-actions"
                        style={{
                            display: 'flex',
                            gap: 'var(--space-md)',
                            justifyContent: 'flex-end',
                            marginTop: 'var(--space-lg)'
                        }}
                    >
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={onClose}
                            disabled={isLoading}
                            style={{
                                padding: '12px 24px',
                                borderRadius: '4px',
                                fontWeight: 500,
                                cursor: 'pointer',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-background-secondary)',
                                color: 'var(--color-text-primary)',
                                fontSize: '14px',
                                minHeight: '44px'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={isLoading}
                            style={{
                                padding: '12px 24px',
                                borderRadius: '4px',
                                fontWeight: 500,
                                cursor: 'pointer',
                                border: 'none',
                                background: 'var(--color-primary)',
                                color: 'var(--color-white)',
                                fontSize: '14px',
                                minHeight: '44px'
                            }}
                        >
                            {isLoading ? 'Transferring...' : 'Transfer Ticket'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

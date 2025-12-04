/**
 * TicketAttendeeForm - React component for inline ticket attendee registration
 *
 * Collects attendee information (firstName, lastName, email) for each ticket
 * during checkout instead of in a separate post-purchase registration step.
 *
 * Features:
 * - Mobile-friendly with 44px touch targets
 * - Inline validation errors
 * - "Copy to all tickets" option for first ticket
 * - Accessible with proper labels and ARIA attributes
 * - Yellow "Register Ticket" button for unregistered, green "Registered" for complete
 *
 * @module src/components/checkout/TicketAttendeeForm
 */

import React from 'react';

// Styles for mobile-friendly attendee form
const styles = {
  container: {
    padding: 'var(--space-md) 0',
  },
  // Yellow "Register Ticket" button for unregistered tickets
  registerButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    background: '#eab308',
    color: '#000',
    padding: '6px 14px',
    borderRadius: '4px',
    fontFamily: 'var(--font-sans)',
    fontSize: '13px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    border: 'none',
    cursor: 'default',
    marginBottom: '12px',
  },
  // Green "Registered" status display
  registeredStatus: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    color: 'var(--color-success, #22c55e)',
    fontFamily: 'var(--font-sans)',
    fontSize: '13px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '8px',
  },
  // Form row for side-by-side fields
  formRow: {
    display: 'flex',
    gap: '12px',
    marginBottom: '8px',
  },
  field: {
    flex: 1,
  },
  fieldFullWidth: {
    width: '100%',
    marginBottom: '8px',
  },
  input: {
    width: '100%',
    minHeight: '40px',
    padding: '8px 12px',
    fontSize: '14px',
    fontFamily: 'var(--font-sans)',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    background: 'var(--color-background)',
    color: 'var(--color-text-primary)',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
  },
  inputError: {
    borderColor: 'var(--color-red)',
    boxShadow: '0 0 0 2px rgba(204, 41, 54, 0.1)',
  },
  inputDisabled: {
    background: 'var(--color-gray-light, #f5f5f5)',
    color: 'var(--color-text-secondary)',
    cursor: 'not-allowed',
  },
  errorText: {
    fontFamily: 'var(--font-sans)',
    fontSize: '12px',
    color: 'var(--color-red)',
    marginTop: '4px',
  },
  // Attendee display for registered tickets
  attendeeDisplay: {
    fontFamily: 'var(--font-sans)',
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
  },
  attendeeName: {
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  attendeeEmail: {
    color: 'var(--color-text-muted)',
  },
  copyAllContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '8px',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    minWidth: '18px',
    cursor: 'pointer',
    accentColor: 'var(--color-blue)',
  },
  checkboxLabel: {
    fontFamily: 'var(--font-sans)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    userSelect: 'none',
  },
};

/**
 * TicketAttendeeForm Component
 *
 * @param {Object} props
 * @param {string} props.ticketKey - Unique identifier for this ticket
 * @param {number} props.ticketIndex - Display index (1-based) for the ticket
 * @param {string} props.ticketName - Name/type of the ticket for display (unused in new design)
 * @param {Object} props.attendee - Current attendee data { firstName, lastName, email }
 * @param {Object} props.errors - Validation errors { firstName?, lastName?, email? }
 * @param {Function} props.onChange - Callback when attendee data changes (ticketKey, field, value)
 * @param {boolean} props.disabled - Whether the form is disabled
 * @param {boolean} props.showCopyAll - Whether to show the "Copy to all" checkbox
 * @param {Function} props.onCopyToAll - Callback when "Copy to all" is clicked
 */
export function TicketAttendeeForm({
  ticketKey,
  ticketIndex,
  ticketName,
  attendee = {},
  errors = {},
  onChange,
  disabled = false,
  showCopyAll = false,
  onCopyToAll,
}) {
  // Email validation regex (same as attendee-validation.js)
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Calculate completion status - requires valid email format, not just any text
  const hasValidEmail = attendee.email && EMAIL_REGEX.test(attendee.email.trim());
  const isComplete = attendee.firstName && attendee.lastName &&
                     hasValidEmail && !errors.firstName &&
                     !errors.lastName && !errors.email;

  const handleChange = (field) => (e) => {
    onChange(ticketKey, field, e.target.value);
  };

  const handleCopyToAll = (e) => {
    if (e.target.checked && onCopyToAll) {
      onCopyToAll(ticketKey);
    }
  };

  const getInputStyle = (hasError) => ({
    ...styles.input,
    ...(hasError ? styles.inputError : {}),
    ...(disabled ? styles.inputDisabled : {}),
  });

  return (
    <div style={styles.container} data-testid={`attendee-form-${ticketKey}`}>
      {/* Show "Register Ticket" button or "Registered" status */}
      {isComplete ? (
        <>
          <div style={styles.registeredStatus}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
            Registered
          </div>
          <div style={styles.attendeeDisplay}>
            <span style={styles.attendeeName}>{attendee.firstName} {attendee.lastName}</span>
            <br />
            <span style={styles.attendeeEmail}>{attendee.email}</span>
          </div>
        </>
      ) : (
        <>
          <div style={styles.registerButton}>
            Register Ticket
          </div>

          {/* Form: First Name + Last Name side by side */}
          <div style={styles.formRow}>
            <div style={styles.field}>
              <input
                id={`${ticketKey}-firstName`}
                type="text"
                value={attendee.firstName || ''}
                onChange={handleChange('firstName')}
                disabled={disabled}
                placeholder="First Name"
                autoComplete="given-name"
                style={getInputStyle(!!errors.firstName)}
                aria-invalid={!!errors.firstName}
                aria-describedby={errors.firstName ? `${ticketKey}-firstName-error` : undefined}
                aria-label="First Name"
              />
              {errors.firstName && (
                <div id={`${ticketKey}-firstName-error`} style={styles.errorText} role="alert">
                  {errors.firstName}
                </div>
              )}
            </div>
            <div style={styles.field}>
              <input
                id={`${ticketKey}-lastName`}
                type="text"
                value={attendee.lastName || ''}
                onChange={handleChange('lastName')}
                disabled={disabled}
                placeholder="Last Name"
                autoComplete="family-name"
                style={getInputStyle(!!errors.lastName)}
                aria-invalid={!!errors.lastName}
                aria-describedby={errors.lastName ? `${ticketKey}-lastName-error` : undefined}
                aria-label="Last Name"
              />
              {errors.lastName && (
                <div id={`${ticketKey}-lastName-error`} style={styles.errorText} role="alert">
                  {errors.lastName}
                </div>
              )}
            </div>
          </div>

          {/* Email on its own row */}
          <div style={styles.fieldFullWidth}>
            <input
              id={`${ticketKey}-email`}
              type="email"
              value={attendee.email || ''}
              onChange={handleChange('email')}
              disabled={disabled}
              placeholder="Email Address"
              autoComplete="email"
              style={getInputStyle(!!errors.email)}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? `${ticketKey}-email-error` : undefined}
              aria-label="Email Address"
            />
            {errors.email && (
              <div id={`${ticketKey}-email-error`} style={styles.errorText} role="alert">
                {errors.email}
              </div>
            )}
          </div>

          {showCopyAll && (
            <label style={styles.copyAllContainer}>
              <input
                id={`${ticketKey}-copyAll`}
                type="checkbox"
                onChange={handleCopyToAll}
                disabled={disabled}
                style={styles.checkbox}
              />
              <span style={styles.checkboxLabel}>Use this info for all tickets</span>
            </label>
          )}
        </>
      )}
    </div>
  );
}

export default TicketAttendeeForm;

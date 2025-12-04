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
 *
 * @module src/components/checkout/TicketAttendeeForm
 */

import React from 'react';

// Styles for mobile-friendly attendee form
const styles = {
  container: {
    padding: 'var(--space-md)',
    marginTop: 'var(--space-sm)',
    background: 'var(--color-surface)',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: 'var(--letter-spacing-wider)',
    marginBottom: 'var(--space-md)',
  },
  field: {
    marginBottom: 'var(--space-md)',
  },
  label: {
    display: 'block',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    marginBottom: 'var(--space-xs)',
  },
  input: {
    width: '100%',
    minHeight: '44px', // Mobile touch target
    padding: 'var(--space-sm) var(--space-md)',
    fontSize: '16px', // Prevents iOS zoom on focus
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
    boxShadow: '0 0 0 2px rgba(var(--color-red-rgb), 0.1)',
  },
  inputDisabled: {
    background: 'var(--color-gray-light, #f5f5f5)',
    color: 'var(--color-text-secondary)',
    cursor: 'not-allowed',
  },
  errorText: {
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-red)',
    marginTop: 'var(--space-xs)',
  },
  copyAllContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
    marginTop: 'var(--space-md)',
    padding: 'var(--space-sm) var(--space-md)',
    background: 'var(--color-surface-elevated, #f8f9fa)',
    borderRadius: '4px',
  },
  checkbox: {
    width: '24px',
    height: '24px',
    minWidth: '24px',
    cursor: 'pointer',
    accentColor: 'var(--color-primary)',
  },
  checkboxLabel: {
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-primary)',
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
 * @param {string} props.ticketName - Name/type of the ticket for display
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
      <div style={styles.title}>
        Attendee {ticketIndex} {ticketName && `- ${ticketName}`}
      </div>

      <div style={styles.field}>
        <label htmlFor={`${ticketKey}-firstName`} style={styles.label}>
          First Name *
        </label>
        <input
          id={`${ticketKey}-firstName`}
          type="text"
          value={attendee.firstName || ''}
          onChange={handleChange('firstName')}
          disabled={disabled}
          placeholder="Enter first name"
          autoComplete="given-name"
          style={getInputStyle(!!errors.firstName)}
          aria-invalid={!!errors.firstName}
          aria-describedby={errors.firstName ? `${ticketKey}-firstName-error` : undefined}
        />
        {errors.firstName && (
          <div id={`${ticketKey}-firstName-error`} style={styles.errorText} role="alert">
            {errors.firstName}
          </div>
        )}
      </div>

      <div style={styles.field}>
        <label htmlFor={`${ticketKey}-lastName`} style={styles.label}>
          Last Name *
        </label>
        <input
          id={`${ticketKey}-lastName`}
          type="text"
          value={attendee.lastName || ''}
          onChange={handleChange('lastName')}
          disabled={disabled}
          placeholder="Enter last name"
          autoComplete="family-name"
          style={getInputStyle(!!errors.lastName)}
          aria-invalid={!!errors.lastName}
          aria-describedby={errors.lastName ? `${ticketKey}-lastName-error` : undefined}
        />
        {errors.lastName && (
          <div id={`${ticketKey}-lastName-error`} style={styles.errorText} role="alert">
            {errors.lastName}
          </div>
        )}
      </div>

      <div style={styles.field}>
        <label htmlFor={`${ticketKey}-email`} style={styles.label}>
          Email Address *
        </label>
        <input
          id={`${ticketKey}-email`}
          type="email"
          value={attendee.email || ''}
          onChange={handleChange('email')}
          disabled={disabled}
          placeholder="Enter email address"
          autoComplete="email"
          style={getInputStyle(!!errors.email)}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? `${ticketKey}-email-error` : undefined}
        />
        {errors.email && (
          <div id={`${ticketKey}-email-error`} style={styles.errorText} role="alert">
            {errors.email}
          </div>
        )}
      </div>

      {showCopyAll && (
        <div style={styles.copyAllContainer}>
          <input
            id={`${ticketKey}-copyAll`}
            type="checkbox"
            onChange={handleCopyToAll}
            disabled={disabled}
            style={styles.checkbox}
          />
          <label htmlFor={`${ticketKey}-copyAll`} style={styles.checkboxLabel}>
            Use this info for all tickets
          </label>
        </div>
      )}
    </div>
  );
}

export default TicketAttendeeForm;

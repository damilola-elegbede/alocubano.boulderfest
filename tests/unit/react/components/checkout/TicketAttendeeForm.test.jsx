/**
 * @vitest-environment jsdom
 */

/**
 * Tests for TicketAttendeeForm component
 *
 * Tests inline attendee registration form for checkout.
 * Updated for simplified UI: yellow "Register Ticket" button, green "Registered" status.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TicketAttendeeForm from '../../../../../src/components/checkout/TicketAttendeeForm.jsx';

describe('TicketAttendeeForm', () => {
  const defaultProps = {
    ticketKey: 'general-1-0',
    ticketIndex: 1,
    ticketName: 'General Admission',
    attendee: {},
    errors: {},
    onChange: vi.fn(),
    disabled: false,
    showCopyAll: false,
    onCopyToAll: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering - Unregistered State', () => {
    it('should render form with all required fields', () => {
      render(<TicketAttendeeForm {...defaultProps} />);

      expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });

    it('should display "Register Ticket" button when form is incomplete', () => {
      render(<TicketAttendeeForm {...defaultProps} />);

      expect(screen.getByText(/register ticket/i)).toBeInTheDocument();
    });

    it('should show validation errors', () => {
      const errors = {
        firstName: 'First name is required',
        email: 'Please enter a valid email',
      };
      render(<TicketAttendeeForm {...defaultProps} errors={errors} />);

      expect(screen.getByText('First name is required')).toBeInTheDocument();
      expect(screen.getByText('Please enter a valid email')).toBeInTheDocument();
    });

    it('should not show copy to all checkbox by default', () => {
      render(<TicketAttendeeForm {...defaultProps} />);

      expect(screen.queryByText(/use this info for all tickets/i)).not.toBeInTheDocument();
    });

    it('should show copy to all checkbox when showCopyAll is true', () => {
      render(<TicketAttendeeForm {...defaultProps} showCopyAll={true} />);

      expect(screen.getByText(/use this info for all tickets/i)).toBeInTheDocument();
    });
  });

  describe('Rendering - Registered State', () => {
    const completeAttendee = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
    };

    it('should show "Registered" status when form is complete', () => {
      render(<TicketAttendeeForm {...defaultProps} attendee={completeAttendee} />);

      expect(screen.getByText(/registered/i)).toBeInTheDocument();
      expect(screen.queryByText(/register ticket/i)).not.toBeInTheDocument();
    });

    it('should display attendee name and email when complete', () => {
      render(<TicketAttendeeForm {...defaultProps} attendee={completeAttendee} />);

      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john@example.com')).toBeInTheDocument();
    });

    it('should not show form fields when complete', () => {
      render(<TicketAttendeeForm {...defaultProps} attendee={completeAttendee} />);

      expect(screen.queryByLabelText(/first name/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/last name/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    });

    it('should show green checkmark icon when registered', () => {
      render(<TicketAttendeeForm {...defaultProps} attendee={completeAttendee} />);

      // Check for SVG checkmark presence (the checkmark icon)
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should call onChange when first name is typed', () => {
      const onChange = vi.fn();
      render(<TicketAttendeeForm {...defaultProps} onChange={onChange} />);

      const input = screen.getByLabelText(/first name/i);
      fireEvent.change(input, { target: { value: 'John' } });

      expect(onChange).toHaveBeenCalledWith('general-1-0', 'firstName', 'John');
    });

    it('should call onChange when last name is typed', () => {
      const onChange = vi.fn();
      render(<TicketAttendeeForm {...defaultProps} onChange={onChange} />);

      const input = screen.getByLabelText(/last name/i);
      fireEvent.change(input, { target: { value: 'Doe' } });

      expect(onChange).toHaveBeenCalledWith('general-1-0', 'lastName', 'Doe');
    });

    it('should call onChange when email is typed', () => {
      const onChange = vi.fn();
      render(<TicketAttendeeForm {...defaultProps} onChange={onChange} />);

      const input = screen.getByLabelText(/email/i);
      fireEvent.change(input, { target: { value: 'john@example.com' } });

      expect(onChange).toHaveBeenCalledWith('general-1-0', 'email', 'john@example.com');
    });

    it('should call onCopyToAll when checkbox is checked', () => {
      const onCopyToAll = vi.fn();
      render(
        <TicketAttendeeForm
          {...defaultProps}
          showCopyAll={true}
          onCopyToAll={onCopyToAll}
        />
      );

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      expect(onCopyToAll).toHaveBeenCalledWith('general-1-0');
    });
  });

  describe('Disabled State', () => {
    it('should disable all inputs when disabled prop is true', () => {
      render(<TicketAttendeeForm {...defaultProps} disabled={true} />);

      expect(screen.getByLabelText(/first name/i)).toBeDisabled();
      expect(screen.getByLabelText(/last name/i)).toBeDisabled();
      expect(screen.getByLabelText(/email/i)).toBeDisabled();
    });

    it('should disable copy to all checkbox when disabled', () => {
      render(
        <TicketAttendeeForm {...defaultProps} disabled={true} showCopyAll={true} />
      );

      expect(screen.getByRole('checkbox')).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper aria-invalid attributes for errors', () => {
      const errors = { firstName: 'Required' };
      render(<TicketAttendeeForm {...defaultProps} errors={errors} />);

      expect(screen.getByLabelText(/first name/i)).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByLabelText(/last name/i)).toHaveAttribute('aria-invalid', 'false');
    });

    it('should have role="alert" on error messages', () => {
      const errors = { firstName: 'Required' };
      render(<TicketAttendeeForm {...defaultProps} errors={errors} />);

      expect(screen.getByRole('alert')).toHaveTextContent('Required');
    });

    it('should have proper autocomplete attributes', () => {
      render(<TicketAttendeeForm {...defaultProps} />);

      expect(screen.getByLabelText(/first name/i)).toHaveAttribute('autocomplete', 'given-name');
      expect(screen.getByLabelText(/last name/i)).toHaveAttribute('autocomplete', 'family-name');
      expect(screen.getByLabelText(/email/i)).toHaveAttribute('autocomplete', 'email');
    });
  });

  describe('Form Completion Logic', () => {
    it('should not be complete with only first name', () => {
      render(<TicketAttendeeForm {...defaultProps} attendee={{ firstName: 'John' }} />);

      expect(screen.getByText(/register ticket/i)).toBeInTheDocument();
      expect(screen.queryByText(/registered/i)).not.toBeInTheDocument();
    });

    it('should not be complete with invalid email', () => {
      render(
        <TicketAttendeeForm
          {...defaultProps}
          attendee={{ firstName: 'John', lastName: 'Doe', email: 'invalid' }}
        />
      );

      expect(screen.getByText(/register ticket/i)).toBeInTheDocument();
      expect(screen.queryByText(/registered/i)).not.toBeInTheDocument();
    });

    it('should not be complete when there are errors', () => {
      render(
        <TicketAttendeeForm
          {...defaultProps}
          attendee={{ firstName: 'John', lastName: 'Doe', email: 'john@example.com' }}
          errors={{ firstName: 'Name too short' }}
        />
      );

      // With errors present, form should not show as complete
      expect(screen.getByText(/register ticket/i)).toBeInTheDocument();
    });
  });
});

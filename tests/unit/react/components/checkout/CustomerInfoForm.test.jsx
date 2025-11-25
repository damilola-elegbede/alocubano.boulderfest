/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import CustomerInfoForm from '../../../../../src/components/checkout/CustomerInfoForm';

describe('CustomerInfoForm', () => {
    beforeEach(() => {
        // Reset any mocks
        vi.clearAllMocks();
    });

    describe('Component Rendering', () => {
        it('should render the customer info form', () => {
            render(<CustomerInfoForm />);
            expect(screen.getByTestId('customer-info-form')).toBeInTheDocument();
        });

        it('should render Customer Information title', () => {
            render(<CustomerInfoForm />);
            expect(screen.getByText('Customer Information')).toBeInTheDocument();
        });

        it('should render all form fields', () => {
            render(<CustomerInfoForm />);
            expect(screen.getByLabelText(/FIRST NAME/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/LAST NAME/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/EMAIL/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/PHONE/i)).toBeInTheDocument();
        });

        it('should render required asterisks for required fields', () => {
            render(<CustomerInfoForm />);
            expect(screen.getByText(/FIRST NAME \*/)).toBeInTheDocument();
            expect(screen.getByText(/LAST NAME \*/)).toBeInTheDocument();
            expect(screen.getByText(/EMAIL \*/)).toBeInTheDocument();
        });

        it('should not show asterisk for optional phone field', () => {
            render(<CustomerInfoForm />);
            const phoneLabel = screen.getByText('PHONE');
            expect(phoneLabel).toBeInTheDocument();
            expect(phoneLabel.textContent).not.toContain('*');
        });
    });

    describe('Form Validation - First Name', () => {
        it('should show error when first name is empty on blur', async () => {
            const user = userEvent.setup();
            render(<CustomerInfoForm />);

            const firstNameInput = screen.getByLabelText(/FIRST NAME/i);
            await user.click(firstNameInput);
            await user.tab();

            await waitFor(() => {
                expect(screen.getByText(/First name is required/i)).toBeInTheDocument();
            });
        });

        it('should show error when first name is too short', async () => {
            const user = userEvent.setup();
            render(<CustomerInfoForm />);

            const firstNameInput = screen.getByLabelText(/FIRST NAME/i);
            await user.type(firstNameInput, 'a');
            await user.tab();

            await waitFor(() => {
                expect(screen.getByText(/First name must be at least 2 characters/i)).toBeInTheDocument();
            });
        });

        it('should clear error when valid first name is entered', async () => {
            const user = userEvent.setup();
            render(<CustomerInfoForm />);

            const firstNameInput = screen.getByLabelText(/FIRST NAME/i);

            // Trigger error
            await user.type(firstNameInput, 'a');
            await user.tab();

            await waitFor(() => {
                expect(screen.getByText(/First name must be at least 2 characters/i)).toBeInTheDocument();
            });

            // Fix error
            await user.clear(firstNameInput);
            await user.type(firstNameInput, 'John');
            await user.tab();

            await waitFor(() => {
                expect(screen.queryByText(/First name must be at least 2 characters/i)).not.toBeInTheDocument();
            });
        });
    });

    describe('Form Validation - Last Name', () => {
        it('should show error when last name is empty on blur', async () => {
            const user = userEvent.setup();
            render(<CustomerInfoForm />);

            const lastNameInput = screen.getByLabelText(/LAST NAME/i);
            await user.click(lastNameInput);
            await user.tab();

            await waitFor(() => {
                expect(screen.getByText(/Last name is required/i)).toBeInTheDocument();
            });
        });

        it('should show error when last name is too short', async () => {
            const user = userEvent.setup();
            render(<CustomerInfoForm />);

            const lastNameInput = screen.getByLabelText(/LAST NAME/i);
            await user.type(lastNameInput, 'a');
            await user.tab();

            await waitFor(() => {
                expect(screen.getByText(/Last name must be at least 2 characters/i)).toBeInTheDocument();
            });
        });
    });

    describe('Form Validation - Email', () => {
        it('should show error when email is empty on blur', async () => {
            const user = userEvent.setup();
            render(<CustomerInfoForm />);

            const emailInput = screen.getByLabelText(/EMAIL/i);
            await user.click(emailInput);
            await user.tab();

            await waitFor(() => {
                expect(screen.getByText(/Email is required/i)).toBeInTheDocument();
            });
        });

        it('should show error for invalid email format', async () => {
            const user = userEvent.setup();
            render(<CustomerInfoForm />);

            const emailInput = screen.getByLabelText(/EMAIL/i);
            await user.type(emailInput, 'invalid-email');
            await user.tab();

            await waitFor(() => {
                expect(screen.getByText(/Please enter a valid email address/i)).toBeInTheDocument();
            });
        });

        it('should accept valid email', async () => {
            const user = userEvent.setup();
            render(<CustomerInfoForm />);

            const emailInput = screen.getByLabelText(/EMAIL/i);
            await user.type(emailInput, 'john@example.com');
            await user.tab();

            await waitFor(() => {
                expect(screen.queryByText(/Please enter a valid email address/i)).not.toBeInTheDocument();
            });
        });
    });

    describe('Form Validation - Phone', () => {
        it('should not require phone number', async () => {
            const user = userEvent.setup();
            render(<CustomerInfoForm />);

            const phoneInput = screen.getByLabelText(/PHONE/i);
            await user.click(phoneInput);
            await user.tab();

            // No error should appear for empty phone
            await waitFor(() => {
                expect(screen.queryByTestId('phone-error')).not.toBeInTheDocument();
            });
        });

        it('should accept valid phone number', async () => {
            const user = userEvent.setup();
            render(<CustomerInfoForm />);

            const phoneInput = screen.getByLabelText(/PHONE/i);
            await user.type(phoneInput, '(303) 555-0123');
            await user.tab();

            await waitFor(() => {
                expect(screen.queryByTestId('phone-error')).not.toBeInTheDocument();
            });
        });
    });

    describe('Form Submission', () => {
        it('should call onValidSubmit with correct data when form is valid', async () => {
            const mockOnValidSubmit = vi.fn();
            const user = userEvent.setup();
            render(<CustomerInfoForm onValidSubmit={mockOnValidSubmit} />);

            await user.type(screen.getByLabelText(/FIRST NAME/i), 'John');
            await user.type(screen.getByLabelText(/LAST NAME/i), 'Doe');
            await user.type(screen.getByLabelText(/EMAIL/i), 'john@example.com');
            await user.type(screen.getByLabelText(/PHONE/i), '555-1234');

            // Submit the form by submitting the form element
            const form = screen.getByTestId('customer-info-form').querySelector('form');
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

            await waitFor(() => {
                expect(mockOnValidSubmit).toHaveBeenCalledWith({
                    firstName: 'John',
                    lastName: 'Doe',
                    email: 'john@example.com',
                    phone: '555-1234',
                });
            });
        });

        it('should trim whitespace from values', async () => {
            const mockOnValidSubmit = vi.fn();
            const user = userEvent.setup();
            render(<CustomerInfoForm onValidSubmit={mockOnValidSubmit} />);

            await user.type(screen.getByLabelText(/FIRST NAME/i), '  John  ');
            await user.type(screen.getByLabelText(/LAST NAME/i), '  Doe  ');
            await user.type(screen.getByLabelText(/EMAIL/i), '  john@example.com  ');

            const form = screen.getByTestId('customer-info-form').querySelector('form');
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

            await waitFor(() => {
                expect(mockOnValidSubmit).toHaveBeenCalledWith({
                    firstName: 'John',
                    lastName: 'Doe',
                    email: 'john@example.com',
                    phone: '',
                });
            });
        });
    });

    describe('Disabled State', () => {
        it('should disable all inputs when disabled prop is true', () => {
            render(<CustomerInfoForm disabled={true} />);

            expect(screen.getByLabelText(/FIRST NAME/i)).toBeDisabled();
            expect(screen.getByLabelText(/LAST NAME/i)).toBeDisabled();
            expect(screen.getByLabelText(/EMAIL/i)).toBeDisabled();
            expect(screen.getByLabelText(/PHONE/i)).toBeDisabled();
        });

        it('should enable all inputs when disabled prop is false', () => {
            render(<CustomerInfoForm disabled={false} />);

            expect(screen.getByLabelText(/FIRST NAME/i)).not.toBeDisabled();
            expect(screen.getByLabelText(/LAST NAME/i)).not.toBeDisabled();
            expect(screen.getByLabelText(/EMAIL/i)).not.toBeDisabled();
            expect(screen.getByLabelText(/PHONE/i)).not.toBeDisabled();
        });
    });

    describe('Default Values', () => {
        it('should populate fields with default values', () => {
            render(
                <CustomerInfoForm
                    defaultValues={{
                        firstName: 'Jane',
                        lastName: 'Smith',
                        email: 'jane@example.com',
                        phone: '555-9999',
                    }}
                />
            );

            expect(screen.getByLabelText(/FIRST NAME/i)).toHaveValue('Jane');
            expect(screen.getByLabelText(/LAST NAME/i)).toHaveValue('Smith');
            expect(screen.getByLabelText(/EMAIL/i)).toHaveValue('jane@example.com');
            expect(screen.getByLabelText(/PHONE/i)).toHaveValue('555-9999');
        });
    });

    describe('Accessibility', () => {
        it('should have proper ARIA labels on required fields', () => {
            render(<CustomerInfoForm />);

            const firstNameInput = screen.getByLabelText(/FIRST NAME/i);
            const lastNameInput = screen.getByLabelText(/LAST NAME/i);
            const emailInput = screen.getByLabelText(/EMAIL/i);

            expect(firstNameInput).toHaveAttribute('aria-required', 'true');
            expect(lastNameInput).toHaveAttribute('aria-required', 'true');
            expect(emailInput).toHaveAttribute('aria-required', 'true');
        });

        it('should have aria-describedby linking to error messages', () => {
            render(<CustomerInfoForm />);

            const firstNameInput = screen.getByLabelText(/FIRST NAME/i);
            expect(firstNameInput).toHaveAttribute('aria-describedby', 'firstName-error');
        });

        it('should set aria-invalid to true when field has error', async () => {
            const user = userEvent.setup();
            render(<CustomerInfoForm />);

            const firstNameInput = screen.getByLabelText(/FIRST NAME/i);

            // Initially false
            expect(firstNameInput).toHaveAttribute('aria-invalid', 'false');

            // Trigger error
            await user.click(firstNameInput);
            await user.tab();

            await waitFor(() => {
                expect(firstNameInput).toHaveAttribute('aria-invalid', 'true');
            });
        });

        it('should have proper autocomplete attributes', () => {
            render(<CustomerInfoForm />);

            expect(screen.getByLabelText(/FIRST NAME/i)).toHaveAttribute('autocomplete', 'given-name');
            expect(screen.getByLabelText(/LAST NAME/i)).toHaveAttribute('autocomplete', 'family-name');
            expect(screen.getByLabelText(/EMAIL/i)).toHaveAttribute('autocomplete', 'email');
            expect(screen.getByLabelText(/PHONE/i)).toHaveAttribute('autocomplete', 'tel');
        });
    });
});

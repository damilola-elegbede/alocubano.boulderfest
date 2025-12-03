/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import NewsletterForm from '../../../../../src/components/contact/NewsletterForm';

describe('NewsletterForm', () => {
    beforeEach(() => {
        // Mock fetch
        global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Component Rendering', () => {
        it('should render the form', () => {
            render(<NewsletterForm />);
            const form = screen.getByRole('form', { name: /newsletter/i });
            expect(form).toBeInTheDocument();
        });

        it('should render email input', () => {
            render(<NewsletterForm />);
            const emailInput = screen.getByPlaceholderText(/YOUR EMAIL ADDRESS/i);
            expect(emailInput).toBeInTheDocument();
            expect(emailInput).toHaveAttribute('type', 'email');
        });

        it('should render subscribe button', () => {
            render(<NewsletterForm />);
            const button = screen.getByRole('button', { name: /Subscribe to newsletter/i });
            expect(button).toBeInTheDocument();
        });

        it('should render consent checkbox', () => {
            render(<NewsletterForm />);
            const checkbox = screen.getByRole('checkbox');
            expect(checkbox).toBeInTheDocument();
        });

        it('should render consent label', () => {
            render(<NewsletterForm />);
            expect(screen.getByText(/I agree to receive marketing emails/i)).toBeInTheDocument();
        });
    });

    describe('Initial State', () => {
        it('should have empty email input', () => {
            render(<NewsletterForm />);
            const emailInput = screen.getByPlaceholderText(/YOUR EMAIL ADDRESS/i);
            expect(emailInput.value).toBe('');
        });

        it('should have unchecked consent checkbox', () => {
            render(<NewsletterForm />);
            const checkbox = screen.getByRole('checkbox');
            expect(checkbox).not.toBeChecked();
        });

        it('should have disabled submit button initially', () => {
            render(<NewsletterForm />);
            const button = screen.getByRole('button', { name: /Subscribe to newsletter/i });
            expect(button).toBeDisabled();
        });
    });

    describe('Form Validation', () => {
        it('should enable button when email and consent are provided', async () => {
            const user = userEvent.setup();
            render(<NewsletterForm />);

            const emailInput = screen.getByPlaceholderText(/YOUR EMAIL ADDRESS/i);
            const checkbox = screen.getByRole('checkbox');
            const button = screen.getByRole('button', { name: /Subscribe to newsletter/i });

            await user.type(emailInput, 'test@example.com');
            await user.click(checkbox);

            expect(button).not.toBeDisabled();
        });

        it('should keep button disabled with invalid email', async () => {
            const user = userEvent.setup();
            render(<NewsletterForm />);

            const emailInput = screen.getByPlaceholderText(/YOUR EMAIL ADDRESS/i);
            const checkbox = screen.getByRole('checkbox');
            const button = screen.getByRole('button', { name: /Subscribe to newsletter/i });

            await user.type(emailInput, 'invalid-email');
            await user.click(checkbox);

            expect(button).toBeDisabled();
        });

        it('should keep button disabled without consent', async () => {
            const user = userEvent.setup();
            render(<NewsletterForm />);

            const emailInput = screen.getByPlaceholderText(/YOUR EMAIL ADDRESS/i);
            const button = screen.getByRole('button', { name: /Subscribe to newsletter/i });

            await user.type(emailInput, 'test@example.com');

            expect(button).toBeDisabled();
        });

        it('should validate email format', async () => {
            const user = userEvent.setup();
            render(<NewsletterForm />);

            const emailInput = screen.getByPlaceholderText(/YOUR EMAIL ADDRESS/i);
            const checkbox = screen.getByRole('checkbox');

            await user.type(emailInput, 'test@example.com');
            expect(emailInput).toHaveAttribute('aria-invalid', 'false');

            await user.click(checkbox);

            // Button should be enabled with valid email
            const button = screen.getByRole('button', { name: /Subscribe to newsletter/i });
            expect(button).not.toBeDisabled();
        });
    });

    describe('Form Submission', () => {
        it('should call API on successful submission', async () => {
            const user = userEvent.setup();
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true }),
            });

            render(<NewsletterForm />);

            const emailInput = screen.getByPlaceholderText(/YOUR EMAIL ADDRESS/i);
            const checkbox = screen.getByRole('checkbox');
            const button = screen.getByRole('button', { name: /Subscribe to newsletter/i });

            await user.type(emailInput, 'test@example.com');
            await user.click(checkbox);
            await user.click(button);

            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalledWith('/api/email/subscribe', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email: 'test@example.com' }),
                });
            });
        });

        it('should show success message on successful submission', async () => {
            const user = userEvent.setup();
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true }),
            });

            render(<NewsletterForm />);

            const emailInput = screen.getByPlaceholderText(/YOUR EMAIL ADDRESS/i);
            const checkbox = screen.getByRole('checkbox');
            const button = screen.getByRole('button', { name: /Subscribe to newsletter/i });

            await user.type(emailInput, 'test@example.com');
            await user.click(checkbox);
            await user.click(button);

            await waitFor(() => {
                expect(screen.getByText(/Welcome to the A Lo Cubano family/i)).toBeInTheDocument();
            });
        });

        it('should clear form on successful submission', async () => {
            const user = userEvent.setup();
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true }),
            });

            render(<NewsletterForm />);

            const emailInput = screen.getByPlaceholderText(/YOUR EMAIL ADDRESS/i);
            const checkbox = screen.getByRole('checkbox');
            const button = screen.getByRole('button', { name: /Subscribe to newsletter/i });

            await user.type(emailInput, 'test@example.com');
            await user.click(checkbox);
            await user.click(button);

            await waitFor(() => {
                expect(emailInput.value).toBe('');
                expect(checkbox).not.toBeChecked();
            });
        });

        it('should show error message on failed submission', async () => {
            const user = userEvent.setup();
            global.fetch.mockResolvedValueOnce({
                ok: false,
                json: () => Promise.resolve({ error: 'Email already subscribed' }),
            });

            render(<NewsletterForm />);

            const emailInput = screen.getByPlaceholderText(/YOUR EMAIL ADDRESS/i);
            const checkbox = screen.getByRole('checkbox');
            const button = screen.getByRole('button', { name: /Subscribe to newsletter/i });

            await user.type(emailInput, 'test@example.com');
            await user.click(checkbox);
            await user.click(button);

            await waitFor(() => {
                expect(screen.getByText(/Email already subscribed/i)).toBeInTheDocument();
            });
        });

        it('should show network error on fetch failure', async () => {
            const user = userEvent.setup();
            global.fetch.mockRejectedValueOnce(new Error('Network error'));

            render(<NewsletterForm />);

            const emailInput = screen.getByPlaceholderText(/YOUR EMAIL ADDRESS/i);
            const checkbox = screen.getByRole('checkbox');
            const button = screen.getByRole('button', { name: /Subscribe to newsletter/i });

            await user.type(emailInput, 'test@example.com');
            await user.click(checkbox);
            await user.click(button);

            await waitFor(() => {
                expect(screen.getByText(/Network error/i)).toBeInTheDocument();
            });
        });

        it('should show SUBSCRIBING text during submission', async () => {
            const user = userEvent.setup();
            // Create a promise that we can resolve later
            let resolvePromise;
            global.fetch.mockImplementationOnce(() => new Promise(resolve => {
                resolvePromise = resolve;
            }));

            render(<NewsletterForm />);

            const emailInput = screen.getByPlaceholderText(/YOUR EMAIL ADDRESS/i);
            const checkbox = screen.getByRole('checkbox');
            const button = screen.getByRole('button', { name: /Subscribe to newsletter/i });

            await user.type(emailInput, 'test@example.com');
            await user.click(checkbox);
            await user.click(button);

            expect(screen.getByText(/SUBSCRIBING/i)).toBeInTheDocument();

            // Resolve the promise to complete the test
            resolvePromise({
                ok: true,
                json: () => Promise.resolve({ success: true }),
            });
        });

        it('should disable inputs during submission', async () => {
            const user = userEvent.setup();
            let resolvePromise;
            global.fetch.mockImplementationOnce(() => new Promise(resolve => {
                resolvePromise = resolve;
            }));

            render(<NewsletterForm />);

            const emailInput = screen.getByPlaceholderText(/YOUR EMAIL ADDRESS/i);
            const checkbox = screen.getByRole('checkbox');
            const button = screen.getByRole('button', { name: /Subscribe to newsletter/i });

            await user.type(emailInput, 'test@example.com');
            await user.click(checkbox);
            await user.click(button);

            expect(emailInput).toBeDisabled();
            expect(checkbox).toBeDisabled();
            expect(button).toBeDisabled();

            resolvePromise({
                ok: true,
                json: () => Promise.resolve({ success: true }),
            });
        });
    });

    describe('Error Clearing', () => {
        it('should clear error when typing in email', async () => {
            const user = userEvent.setup();
            global.fetch.mockResolvedValueOnce({
                ok: false,
                json: () => Promise.resolve({ error: 'Subscription failed' }),
            });

            render(<NewsletterForm />);

            const emailInput = screen.getByPlaceholderText(/YOUR EMAIL ADDRESS/i);
            const checkbox = screen.getByRole('checkbox');
            const button = screen.getByRole('button', { name: /Subscribe to newsletter/i });

            await user.type(emailInput, 'test@example.com');
            await user.click(checkbox);
            await user.click(button);

            await waitFor(() => {
                expect(screen.getByText(/Subscription failed/i)).toBeInTheDocument();
            });

            await user.type(emailInput, 'a');

            expect(screen.queryByText(/Subscription failed/i)).not.toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('should have aria-label on form', () => {
            render(<NewsletterForm />);
            const form = screen.getByRole('form', { name: /newsletter/i });
            expect(form).toHaveAttribute('aria-label', 'Email newsletter signup');
        });

        it('should have aria-required on email input', () => {
            render(<NewsletterForm />);
            const emailInput = screen.getByPlaceholderText(/YOUR EMAIL ADDRESS/i);
            expect(emailInput).toHaveAttribute('aria-required', 'true');
        });

        it('should have aria-required on consent checkbox', () => {
            render(<NewsletterForm />);
            const checkbox = screen.getByRole('checkbox');
            expect(checkbox).toHaveAttribute('aria-required', 'true');
        });

        it('should have aria-invalid attribute on email input', () => {
            render(<NewsletterForm />);
            const emailInput = screen.getByPlaceholderText(/YOUR EMAIL ADDRESS/i);
            expect(emailInput).toHaveAttribute('aria-invalid', 'false');
        });

        it('should have role alert on error message', async () => {
            const user = userEvent.setup();
            global.fetch.mockResolvedValueOnce({
                ok: false,
                json: () => Promise.resolve({ error: 'Error occurred' }),
            });

            render(<NewsletterForm />);

            const emailInput = screen.getByPlaceholderText(/YOUR EMAIL ADDRESS/i);
            const checkbox = screen.getByRole('checkbox');
            const button = screen.getByRole('button', { name: /Subscribe to newsletter/i });

            await user.type(emailInput, 'test@example.com');
            await user.click(checkbox);
            await user.click(button);

            await waitFor(() => {
                const errorElement = screen.getByRole('alert');
                expect(errorElement).toBeInTheDocument();
            });
        });

        it('should have role status on success message', async () => {
            const user = userEvent.setup();
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true }),
            });

            render(<NewsletterForm />);

            const emailInput = screen.getByPlaceholderText(/YOUR EMAIL ADDRESS/i);
            const checkbox = screen.getByRole('checkbox');
            const button = screen.getByRole('button', { name: /Subscribe to newsletter/i });

            await user.type(emailInput, 'test@example.com');
            await user.click(checkbox);
            await user.click(button);

            await waitFor(() => {
                const successElement = screen.getByRole('status');
                expect(successElement).toBeInTheDocument();
            });
        });
    });
});

/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import DonationSelector from '../../../../../src/components/donations/DonationSelector';

// Mock useCart hook
const mockAddDonation = vi.fn();
vi.mock('../../../../../src/hooks/useCart', () => ({
    useCart: () => ({
        addDonation: mockAddDonation,
    }),
}));

describe('DonationSelector', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Mock localStorage for theme
        const localStorageMock = {
            getItem: vi.fn(),
            setItem: vi.fn(),
            clear: vi.fn(),
        };
        global.localStorage = localStorageMock;

        // Mock matchMedia for theme system
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi.fn().mockImplementation(query => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Component Rendering', () => {
        it('should render the donation form title', () => {
            render(<DonationSelector />);
            expect(screen.getByText('MAKE A DONATION')).toBeInTheDocument();
        });

        it('should render SELECT AMOUNT label', () => {
            render(<DonationSelector />);
            expect(screen.getByText('SELECT AMOUNT')).toBeInTheDocument();
        });

        it('should render all preset amount cards', () => {
            render(<DonationSelector />);
            expect(screen.getByText('$20')).toBeInTheDocument();
            expect(screen.getByText('$50')).toBeInTheDocument();
            expect(screen.getByText('$100')).toBeInTheDocument();
        });

        it('should render custom amount option', () => {
            render(<DonationSelector />);
            expect(screen.getByText('CUSTOM')).toBeInTheDocument();
        });

        it('should render donate button', () => {
            render(<DonationSelector />);
            const button = screen.getByRole('button', { name: /ADD TO CART/i });
            expect(button).toBeInTheDocument();
        });

        it('should render donation form', () => {
            render(<DonationSelector />);
            const form = screen.getByRole('form');
            expect(form).toBeInTheDocument();
        });
    });

    describe('Initial State', () => {
        it('should have disabled submit button initially', () => {
            render(<DonationSelector />);
            const button = screen.getByRole('button', { name: /ADD TO CART/i });
            expect(button).toBeDisabled();
        });

        it('should have no preset amounts selected initially', () => {
            render(<DonationSelector />);
            const cards = screen.getAllByRole('button', { name: /\$?\d+|CUSTOM/i }).filter(
                el => el.classList.contains('donation-card') || el.closest('.donation-card')
            );
            cards.forEach(card => {
                expect(card).toHaveAttribute('aria-pressed', 'false');
            });
        });
    });

    describe('Preset Amount Selection', () => {
        it('should select $20 when clicked', async () => {
            const user = userEvent.setup();
            render(<DonationSelector />);

            const card20 = screen.getByText('$20').closest('.donation-card');
            await user.click(card20);

            expect(card20).toHaveClass('selected');
            expect(card20).toHaveAttribute('aria-pressed', 'true');
        });

        it('should select $50 when clicked', async () => {
            const user = userEvent.setup();
            render(<DonationSelector />);

            const card50 = screen.getByText('$50').closest('.donation-card');
            await user.click(card50);

            expect(card50).toHaveClass('selected');
        });

        it('should select $100 when clicked', async () => {
            const user = userEvent.setup();
            render(<DonationSelector />);

            const card100 = screen.getByText('$100').closest('.donation-card');
            await user.click(card100);

            expect(card100).toHaveClass('selected');
        });

        it('should toggle off when same card is clicked again', async () => {
            const user = userEvent.setup();
            render(<DonationSelector />);

            const card20 = screen.getByText('$20').closest('.donation-card');
            await user.click(card20);
            expect(card20).toHaveClass('selected');

            await user.click(card20);
            expect(card20).not.toHaveClass('selected');
        });

        it('should deselect previous card when new card is selected', async () => {
            const user = userEvent.setup();
            render(<DonationSelector />);

            const card20 = screen.getByText('$20').closest('.donation-card');
            const card50 = screen.getByText('$50').closest('.donation-card');

            await user.click(card20);
            expect(card20).toHaveClass('selected');

            await user.click(card50);
            expect(card20).not.toHaveClass('selected');
            expect(card50).toHaveClass('selected');
        });

        it('should enable button when preset amount is selected', async () => {
            const user = userEvent.setup();
            render(<DonationSelector />);

            const card50 = screen.getByText('$50').closest('.donation-card');
            const button = screen.getByRole('button', { name: /ADD TO CART/i });

            await user.click(card50);
            expect(button).not.toBeDisabled();
        });

        it('should update button text with selected amount', async () => {
            const user = userEvent.setup();
            render(<DonationSelector />);

            const card100 = screen.getByText('$100').closest('.donation-card');
            await user.click(card100);

            const button = screen.getByRole('button', { name: /ADD TO CART - \$100/i });
            expect(button).toBeInTheDocument();
        });
    });

    describe('Custom Amount', () => {
        it('should show input field when CUSTOM is clicked', async () => {
            const user = userEvent.setup();
            render(<DonationSelector />);

            const customCard = screen.getByText('CUSTOM').closest('.donation-card');
            await user.click(customCard);

            const input = screen.getByRole('spinbutton');
            expect(input).toBeInTheDocument();
        });

        it('should enable button with valid custom amount', async () => {
            const user = userEvent.setup();
            render(<DonationSelector />);

            const customCard = screen.getByText('CUSTOM').closest('.donation-card');
            await user.click(customCard);

            const input = screen.getByRole('spinbutton');
            await user.type(input, '75');

            const button = screen.getByRole('button', { name: /ADD TO CART - \$75/i });
            expect(button).not.toBeDisabled();
        });

        it('should update button text with custom amount', async () => {
            const user = userEvent.setup();
            render(<DonationSelector />);

            const customCard = screen.getByText('CUSTOM').closest('.donation-card');
            await user.click(customCard);

            const input = screen.getByRole('spinbutton');
            await user.type(input, '150');

            expect(screen.getByRole('button', { name: /ADD TO CART - \$150/i })).toBeInTheDocument();
        });

        it('should keep button disabled with empty custom amount', async () => {
            const user = userEvent.setup();
            render(<DonationSelector />);

            const customCard = screen.getByText('CUSTOM').closest('.donation-card');
            await user.click(customCard);

            const button = screen.getByRole('button', { name: /ADD TO CART/i });
            expect(button).toBeDisabled();
        });
    });

    describe('Form Submission', () => {
        it('should call addDonation with preset amount', async () => {
            const user = userEvent.setup();
            render(<DonationSelector />);

            const card50 = screen.getByText('$50').closest('.donation-card');
            await user.click(card50);

            const button = screen.getByRole('button', { name: /ADD TO CART/i });
            await user.click(button);

            expect(mockAddDonation).toHaveBeenCalledWith(50, false);
        });

        it('should call addDonation with custom amount', async () => {
            const user = userEvent.setup();
            render(<DonationSelector />);

            const customCard = screen.getByText('CUSTOM').closest('.donation-card');
            await user.click(customCard);

            const input = screen.getByRole('spinbutton');
            await user.type(input, '200');

            const button = screen.getByRole('button', { name: /ADD TO CART/i });
            await user.click(button);

            expect(mockAddDonation).toHaveBeenCalledWith(200, false);
        });

        it('should reset form after successful submission', async () => {
            const user = userEvent.setup();
            render(<DonationSelector />);

            const card50 = screen.getByText('$50').closest('.donation-card');
            await user.click(card50);

            const button = screen.getByRole('button', { name: /ADD TO CART - \$50/i });
            await user.click(button);

            await waitFor(() => {
                expect(card50).not.toHaveClass('selected');
                expect(screen.getByRole('button', { name: /^ADD TO CART$/i })).toBeDisabled();
            });
        });

        it('should show celebration message after submission', async () => {
            const user = userEvent.setup();
            render(<DonationSelector />);

            const card20 = screen.getByText('$20').closest('.donation-card');
            await user.click(card20);

            const button = screen.getByRole('button', { name: /ADD TO CART/i });
            await user.click(button);

            await waitFor(() => {
                expect(screen.getByText(/Thank You!/i)).toBeInTheDocument();
                expect(screen.getByText(/\$20 added to cart/i)).toBeInTheDocument();
            });
        });

        it('should not submit when button is disabled', async () => {
            render(<DonationSelector />);

            const button = screen.getByRole('button', { name: /ADD TO CART/i });
            expect(button).toBeDisabled();

            // Even if we try to submit the form
            const form = screen.getByRole('form');
            form.dispatchEvent(new Event('submit', { bubbles: true }));

            expect(mockAddDonation).not.toHaveBeenCalled();
        });
    });

    describe('Keyboard Accessibility', () => {
        it('should select card on Enter key', async () => {
            const user = userEvent.setup();
            render(<DonationSelector />);

            const card50 = screen.getByText('$50').closest('.donation-card');
            card50.focus();
            await user.keyboard('{Enter}');

            expect(card50).toHaveClass('selected');
        });

        it('should select card on Space key', async () => {
            const user = userEvent.setup();
            render(<DonationSelector />);

            const card100 = screen.getByText('$100').closest('.donation-card');
            card100.focus();
            await user.keyboard(' ');

            expect(card100).toHaveClass('selected');
        });

        it('should have tabindex on donation cards', () => {
            render(<DonationSelector />);

            const card20 = screen.getByText('$20').closest('.donation-card');
            expect(card20).toHaveAttribute('tabindex', '0');
        });

        it('should have role button on donation cards', () => {
            render(<DonationSelector />);

            const card20 = screen.getByText('$20').closest('.donation-card');
            expect(card20).toHaveAttribute('role', 'button');
        });
    });

    describe('Accessibility', () => {
        it('should have aria-labelledby on donation selection', () => {
            render(<DonationSelector />);
            const section = screen.getByRole('group', { name: /Donation amount options/i });
            expect(section).toBeInTheDocument();
        });

        it('should have aria-pressed on donation cards', () => {
            render(<DonationSelector />);
            const card20 = screen.getByText('$20').closest('.donation-card');
            expect(card20).toHaveAttribute('aria-pressed');
        });

        it('should have aria-label on custom input', async () => {
            const user = userEvent.setup();
            render(<DonationSelector />);

            const customCard = screen.getByText('CUSTOM').closest('.donation-card');
            await user.click(customCard);

            const input = screen.getByLabelText(/Custom donation amount/i);
            expect(input).toBeInTheDocument();
        });

        it('should have role status on celebration message', async () => {
            const user = userEvent.setup();
            render(<DonationSelector />);

            const card20 = screen.getByText('$20').closest('.donation-card');
            await user.click(card20);

            const button = screen.getByRole('button', { name: /ADD TO CART/i });
            await user.click(button);

            await waitFor(() => {
                const celebrationMessage = screen.getByRole('status');
                expect(celebrationMessage).toBeInTheDocument();
            });
        });
    });
});

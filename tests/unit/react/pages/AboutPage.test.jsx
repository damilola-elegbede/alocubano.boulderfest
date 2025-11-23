/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import AboutPage from '../../../../src/pages/AboutPage';

describe('AboutPage', () => {
    beforeEach(() => {
        // Mock window.globalCartManager
        window.globalCartManager = {
            getState: vi.fn(() => ({ tickets: [], donations: [] })),
            addTicket: vi.fn(),
            removeTicket: vi.fn(),
            updateTicketQuantity: vi.fn(),
            addDonation: vi.fn(),
            removeDonation: vi.fn(),
            clear: vi.fn(),
        };

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

    describe('Component Rendering', () => {
        it('should render the About page', () => {
            render(<AboutPage />);
            expect(screen.getByText('THE BEGINNING')).toBeInTheDocument();
        });

        it('should render hero image', () => {
            render(<AboutPage />);
            const heroImage = screen.getByAltText(/Behind-the-scenes moments/i);
            expect(heroImage).toBeInTheDocument();
            expect(heroImage).toHaveAttribute('src', '/images/hero/about.jpg');
        });

        it('should render navigation sections', () => {
            render(<AboutPage />);
            expect(screen.getByText('The Beginning')).toBeInTheDocument();
            expect(screen.getByText('The Team')).toBeInTheDocument();
            expect(screen.getByText('Join Our Team')).toBeInTheDocument();
        });
    });

    describe('Content Sections', () => {
        it('should render timeline section with all years', () => {
            render(<AboutPage />);
            expect(screen.getByText('2023')).toBeInTheDocument();
            expect(screen.getByText('THE BIRTH')).toBeInTheDocument();
            expect(screen.getByText('2025')).toBeInTheDocument();
            expect(screen.getByText('THE GROWTH')).toBeInTheDocument();
            expect(screen.getByText('2026')).toBeInTheDocument();
            expect(screen.getByText('THE FUTURE')).toBeInTheDocument();
        });

        it('should render mission statement', () => {
            render(<AboutPage />);
            expect(screen.getByText(/We bring Cuban salsa to Boulder/i)).toBeInTheDocument();
        });

        it('should render all four values', () => {
            render(<AboutPage />);
            expect(screen.getByText('AUTHENTICITY')).toBeInTheDocument();
            expect(screen.getByText('INCLUSIVITY')).toBeInTheDocument();
            expect(screen.getByText('EXCELLENCE')).toBeInTheDocument();
            expect(screen.getByText('COMMUNITY')).toBeInTheDocument();
        });

        it('should render team members', () => {
            render(<AboutPage />);
            expect(screen.getByText('MARCELA LAY')).toBeInTheDocument();
            expect(screen.getByText('DAMILOLA ELEGBEDE')).toBeInTheDocument();
            expect(screen.getByText('YOLANDA MEILER')).toBeInTheDocument();
            expect(screen.getByText('ANALIS LEDESMA')).toBeInTheDocument();
            expect(screen.getByText('DONAL SOLICK')).toBeInTheDocument();
        });

        it('should render team member photos', () => {
            render(<AboutPage />);
            const marcelaPhoto = screen.getByAltText('Marcela Lay');
            expect(marcelaPhoto).toBeInTheDocument();
            expect(marcelaPhoto).toHaveAttribute('src', '/images/team/marcela.jpg');
        });

        it('should render impact statistics', () => {
            render(<AboutPage />);
            expect(screen.getByText('CUBAN ARTISTS SUPPORTED')).toBeInTheDocument();
            expect(screen.getByText('PEOPLE REACHED')).toBeInTheDocument();
            expect(screen.getByText('INVESTED IN COMMUNITY')).toBeInTheDocument();
        });
    });

    describe('Volunteer Form', () => {
        it('should render volunteer form', () => {
            render(<AboutPage />);
            expect(screen.getByText('VOLUNTEER APPLICATION')).toBeInTheDocument();
            expect(screen.getByLabelText(/FIRST NAME/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/LAST NAME/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/EMAIL/i)).toBeInTheDocument();
        });

        it('should have submit button disabled initially', () => {
            render(<AboutPage />);
            const submitButton = screen.getByRole('button', { name: /SUBMIT APPLICATION/i });
            expect(submitButton).toBeDisabled();
        });

        it('should enable submit button when all required fields are filled', async () => {
            const user = userEvent.setup();
            render(<AboutPage />);

            const firstNameInput = screen.getByLabelText(/FIRST NAME/i);
            const lastNameInput = screen.getByLabelText(/LAST NAME/i);
            const emailInput = screen.getByLabelText(/EMAIL/i);
            const submitButton = screen.getByRole('button', { name: /SUBMIT APPLICATION/i });

            expect(submitButton).toBeDisabled();

            await user.type(firstNameInput, 'John');
            await user.type(lastNameInput, 'Doe');
            await user.type(emailInput, 'john@example.com');

            await waitFor(() => {
                expect(submitButton).not.toBeDisabled();
            });
        });

        it('should render all checkbox options for areas of interest', () => {
            render(<AboutPage />);
            expect(screen.getByText('Event Setup/Breakdown')).toBeInTheDocument();
            expect(screen.getByText('Registration Desk')).toBeInTheDocument();
            expect(screen.getByText('Artist Support')).toBeInTheDocument();
            expect(screen.getByText('Merchandise Sales')).toBeInTheDocument();
            expect(screen.getByText('Information Booth')).toBeInTheDocument();
            expect(screen.getByText('Social Media Team')).toBeInTheDocument();
        });

        it('should render availability checkboxes', () => {
            render(<AboutPage />);
            expect(screen.getByText('Friday, May 15')).toBeInTheDocument();
            expect(screen.getByText('Saturday, May 16')).toBeInTheDocument();
            expect(screen.getByText('Sunday, May 17')).toBeInTheDocument();
        });

        it('should render volunteer benefits', () => {
            render(<AboutPage />);
            expect(screen.getByText('FREE FESTIVAL ACCESS')).toBeInTheDocument();
            expect(screen.getByText('EXCLUSIVE T-SHIRT')).toBeInTheDocument();
            expect(screen.getByText('MEET THE ARTISTS')).toBeInTheDocument();
            expect(screen.getByText('FREE WORKSHOPS')).toBeInTheDocument();
        });

        it('should validate first name field', async () => {
            const user = userEvent.setup();
            render(<AboutPage />);

            const firstNameInput = screen.getByLabelText(/FIRST NAME/i);

            await user.type(firstNameInput, 'a');
            await user.tab();

            await waitFor(() => {
                expect(screen.getByText(/First name must be at least 2 characters/i)).toBeInTheDocument();
            });
        });

        it('should validate email field', async () => {
            const user = userEvent.setup();
            render(<AboutPage />);

            const emailInput = screen.getByLabelText(/EMAIL/i);

            await user.type(emailInput, 'invalid-email');
            await user.tab();

            await waitFor(() => {
                expect(screen.getByText(/Please enter a valid email address/i)).toBeInTheDocument();
            });
        });

        it('should clear errors when user starts typing', async () => {
            const user = userEvent.setup();
            render(<AboutPage />);

            const firstNameInput = screen.getByLabelText(/FIRST NAME/i);

            await user.type(firstNameInput, 'a');
            await user.tab();

            await waitFor(() => {
                expect(screen.getByText(/First name must be at least 2 characters/i)).toBeInTheDocument();
            });

            await user.clear(firstNameInput);
            await user.type(firstNameInput, 'John');

            await waitFor(() => {
                expect(screen.queryByText(/First name must be at least 2 characters/i)).not.toBeInTheDocument();
            });
        });
    });

    describe('Accessibility', () => {
        it('should have proper ARIA labels on form inputs', () => {
            render(<AboutPage />);

            const firstNameInput = screen.getByLabelText(/FIRST NAME/i);
            const lastNameInput = screen.getByLabelText(/LAST NAME/i);
            const emailInput = screen.getByLabelText(/EMAIL/i);

            expect(firstNameInput).toHaveAttribute('aria-required', 'true');
            expect(lastNameInput).toHaveAttribute('aria-required', 'true');
            expect(emailInput).toHaveAttribute('aria-required', 'true');
        });

        it('should have navigation landmarks', () => {
            render(<AboutPage />);
            const nav = screen.getByRole('navigation', { name: /About Navigation/i });
            expect(nav).toBeInTheDocument();
        });

        it('should have alt text on images', () => {
            render(<AboutPage />);
            const heroImage = screen.getByAltText(/Behind-the-scenes moments/i);
            const marcelaPhoto = screen.getByAltText('Marcela Lay');

            expect(heroImage).toBeInTheDocument();
            expect(marcelaPhoto).toBeInTheDocument();
        });
    });
});

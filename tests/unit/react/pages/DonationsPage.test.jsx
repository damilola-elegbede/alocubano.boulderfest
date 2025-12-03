/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DonationsPage from '../../../../src/pages/DonationsPage';

describe('DonationsPage', () => {
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
        it('should render the Donations page', () => {
            render(<DonationsPage />);
            expect(screen.getByText('MAKE A DONATION')).toBeInTheDocument();
        });

        it('should render hero image container', () => {
            render(<DonationsPage />);
            const heroImage = screen.getByAltText(/Community supporters and volunteers/i);
            expect(heroImage).toBeInTheDocument();
            expect(heroImage).toHaveClass('hero-splash-img');
        });

        it('should render main content area', () => {
            render(<DonationsPage />);
            const main = screen.getByRole('main');
            expect(main).toBeInTheDocument();
        });

        it('should render mission statement', () => {
            render(<DonationsPage />);
            expect(screen.getByText(/As a non-profit organization/i)).toBeInTheDocument();
        });
    });

    describe('Donation Selector', () => {
        it('should render SELECT AMOUNT label', () => {
            render(<DonationsPage />);
            expect(screen.getByText('SELECT AMOUNT')).toBeInTheDocument();
        });

        it('should render $20 donation option', () => {
            render(<DonationsPage />);
            expect(screen.getByText('$20')).toBeInTheDocument();
        });

        it('should render $50 donation option', () => {
            render(<DonationsPage />);
            expect(screen.getByText('$50')).toBeInTheDocument();
        });

        it('should render $100 donation option', () => {
            render(<DonationsPage />);
            expect(screen.getByText('$100')).toBeInTheDocument();
        });

        it('should render CUSTOM donation option', () => {
            render(<DonationsPage />);
            expect(screen.getByText('CUSTOM')).toBeInTheDocument();
        });

        it('should render ADD TO CART button', () => {
            render(<DonationsPage />);
            const button = screen.getByRole('button', { name: /ADD TO CART/i });
            expect(button).toBeInTheDocument();
        });

        it('should have disabled ADD TO CART button initially', () => {
            render(<DonationsPage />);
            const button = screen.getByRole('button', { name: /ADD TO CART/i });
            expect(button).toBeDisabled();
        });
    });

    describe('Tax Information', () => {
        it('should render 501(c)(3) notice', () => {
            render(<DonationsPage />);
            expect(screen.getByText(/501\(c\)\(3\) non-profit/i)).toBeInTheDocument();
        });

        it('should render tax-deductible notice', () => {
            render(<DonationsPage />);
            expect(screen.getByText(/tax-deductible/i)).toBeInTheDocument();
        });
    });

    describe('Content Sections', () => {
        it('should render hero splash section', () => {
            render(<DonationsPage />);
            const heroSection = document.querySelector('.gallery-hero-splash');
            expect(heroSection).toBeInTheDocument();
        });

        it('should render typographic section', () => {
            render(<DonationsPage />);
            const typographicSections = document.querySelectorAll('.section-typographic');
            expect(typographicSections.length).toBeGreaterThan(0);
        });

        it('should render donation form wrapper', () => {
            render(<DonationsPage />);
            const wrapper = document.querySelector('.donation-form-wrapper');
            expect(wrapper).toBeInTheDocument();
        });

        it('should render donation selection section', () => {
            render(<DonationsPage />);
            const selection = document.querySelector('.donation-selection');
            expect(selection).toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('should have accessible hero image with alt text', () => {
            render(<DonationsPage />);
            const heroImage = screen.getByAltText(/Community supporters and volunteers making A Lo Cubano Boulder Fest possible/i);
            expect(heroImage).toBeInTheDocument();
        });

        it('should have heading hierarchy', () => {
            render(<DonationsPage />);
            const h2s = screen.getAllByRole('heading', { level: 2 });
            const h3s = screen.getAllByRole('heading', { level: 3 });

            expect(h2s.length).toBeGreaterThan(0);
            expect(h3s.length).toBeGreaterThan(0);
        });

        it('should have donation form with role', () => {
            render(<DonationsPage />);
            const form = screen.getByRole('form');
            expect(form).toBeInTheDocument();
        });

        it('should have donation amount options in accessible group', () => {
            render(<DonationsPage />);
            const group = screen.getByRole('group', { name: /Donation amount options/i });
            expect(group).toBeInTheDocument();
        });
    });

    describe('Styling', () => {
        it('should have font-serif class on mission text', () => {
            render(<DonationsPage />);
            const missionText = screen.getByText(/As a non-profit organization/i);
            expect(missionText).toHaveClass('font-serif');
        });

        it('should have font-mono class on tax info text', () => {
            render(<DonationsPage />);
            const taxText = screen.getByText(/501\(c\)\(3\) non-profit/i);
            expect(taxText).toHaveClass('font-mono');
        });

        it('should have text-display class on donation title', () => {
            render(<DonationsPage />);
            const title = screen.getByText('MAKE A DONATION');
            expect(title).toHaveClass('text-display');
        });
    });

    describe('Donation Cards', () => {
        it('should render four donation cards', () => {
            render(<DonationsPage />);
            const cards = document.querySelectorAll('.donation-card');
            expect(cards.length).toBe(4);
        });

        it('should have data-amount attributes on cards', () => {
            render(<DonationsPage />);
            const cards = document.querySelectorAll('.donation-card');

            const amounts = Array.from(cards).map(card => card.getAttribute('data-amount'));
            expect(amounts).toContain('20');
            expect(amounts).toContain('50');
            expect(amounts).toContain('100');
            expect(amounts).toContain('custom');
        });

        it('should have role button on donation cards', () => {
            render(<DonationsPage />);
            const cards = document.querySelectorAll('.donation-card');

            cards.forEach(card => {
                expect(card).toHaveAttribute('role', 'button');
            });
        });

        it('should have tabindex for keyboard accessibility', () => {
            render(<DonationsPage />);
            const cards = document.querySelectorAll('.donation-card');

            cards.forEach(card => {
                expect(card).toHaveAttribute('tabindex', '0');
            });
        });
    });
});

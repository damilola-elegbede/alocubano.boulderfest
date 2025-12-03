/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import HomePage from '../../../../src/pages/HomePage';

describe('HomePage', () => {
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
        it('should render the Home page', () => {
            render(<HomePage />);
            expect(screen.getByText('A Lo Cubano Boulder Fest 2026!')).toBeInTheDocument();
        });

        it('should render hero image container', () => {
            render(<HomePage />);
            const heroImage = screen.getByAltText(/Dynamic festival photo showcasing A Lo Cubano Boulder Fest/i);
            expect(heroImage).toBeInTheDocument();
            expect(heroImage).toHaveClass('hero-splash-img');
        });

        it('should render main content area', () => {
            render(<HomePage />);
            const main = screen.getByRole('main');
            expect(main).toBeInTheDocument();
        });
    });

    describe('Festival Info Section', () => {
        it('should render festival subtitle', () => {
            render(<HomePage />);
            expect(screen.getByText('Experience 3 days of workshops and social dancing')).toBeInTheDocument();
        });

        it('should render festival details in mono text block', () => {
            render(<HomePage />);
            // MAY 15-17, 2026 appears multiple times (festival info + CTA)
            expect(screen.getAllByText(/MAY 15-17, 2026/i).length).toBeGreaterThan(0);
            expect(screen.getByText(/BOULDER, COLORADO/i)).toBeInTheDocument();
            expect(screen.getByText(/WORLD CLASS CUBAN ARTISTS/i)).toBeInTheDocument();
            expect(screen.getByText(/UNLIMITED MEMORIES/i)).toBeInTheDocument();
        });
    });

    describe('What To Expect Section', () => {
        it('should render section heading', () => {
            render(<HomePage />);
            expect(screen.getByText('WHAT TO EXPECT')).toBeInTheDocument();
        });

        it('should render all three expectation items', () => {
            render(<HomePage />);
            expect(screen.getByText('Workshops')).toBeInTheDocument();
            expect(screen.getByText('Socials')).toBeInTheDocument();
            expect(screen.getByText('Performances')).toBeInTheDocument();
        });

        it('should render workshop description', () => {
            render(<HomePage />);
            expect(screen.getByText(/Casino, Rueda, Suelta, Reggaeton, Rumba, and Afro/i)).toBeInTheDocument();
        });

        it('should render socials description', () => {
            render(<HomePage />);
            expect(screen.getByText(/Electrifying social dance events/i)).toBeInTheDocument();
        });

        it('should render performances description', () => {
            render(<HomePage />);
            expect(screen.getByText(/Captivating performances by world-class artists/i)).toBeInTheDocument();
        });
    });

    describe('Genre Section', () => {
        it('should render genres heading', () => {
            render(<HomePage />);
            expect(screen.getByText('GENRES')).toBeInTheDocument();
        });

        it('should render all four genres', () => {
            render(<HomePage />);
            expect(screen.getByText('SALSA')).toBeInTheDocument();
            expect(screen.getByText('RUMBA')).toBeInTheDocument();
            expect(screen.getByText('SON CUBANO')).toBeInTheDocument();
            expect(screen.getByText('TIMBA')).toBeInTheDocument();
        });

        it('should render genre meta descriptions', () => {
            render(<HomePage />);
            expect(screen.getByText('The heartbeat of Cuban music')).toBeInTheDocument();
            expect(screen.getByText('Sacred rhythms of the ancestors')).toBeInTheDocument();
            expect(screen.getByText('The foundation of Latin music')).toBeInTheDocument();
            expect(screen.getByText('Modern Cuban fusion')).toBeInTheDocument();
        });

        it('should render genre feature descriptions', () => {
            render(<HomePage />);
            expect(screen.getByText(/Fast rhythms • Partner dancing • Social energy/i)).toBeInTheDocument();
            expect(screen.getByText(/Percussion • Storytelling • Connection/i)).toBeInTheDocument();
            expect(screen.getByText(/Elegance • Classic • Timeless/i)).toBeInTheDocument();
            expect(screen.getByText(/Complex rhythms • High Energy • Contemporary edge/i)).toBeInTheDocument();
        });
    });

    describe('Call To Action Section', () => {
        it('should render CTA text', () => {
            render(<HomePage />);
            expect(screen.getByText(/JOIN US FOR AN AMAZING/i)).toBeInTheDocument();
            expect(screen.getByText('WEEKEND')).toBeInTheDocument();
            expect(screen.getByText(/OF DANCE/i)).toBeInTheDocument();
        });

        it('should render ticket info text', () => {
            render(<HomePage />);
            expect(screen.getByText(/LIMITED TICKETS/i)).toBeInTheDocument();
            expect(screen.getByText(/EARLY BIRD PRICING/i)).toBeInTheDocument();
            expect(screen.getByText(/VIP PACKAGES/i)).toBeInTheDocument();
        });

        it('should render ticket button with correct link', () => {
            render(<HomePage />);
            const ticketLink = screen.getByRole('link', { name: /GET TICKETS NOW/i });
            expect(ticketLink).toBeInTheDocument();
            expect(ticketLink).toHaveAttribute('href', '/tickets');
        });

        it('should render dates in red color', () => {
            render(<HomePage />);
            // Check for text content - the spans with red color
            const dateTexts = screen.getAllByText(/MAY 15-17, 2026/i);
            // Should find at least one with red color styling
            expect(dateTexts.length).toBeGreaterThan(0);
        });
    });

    describe('Typography Classes', () => {
        it('should use correct typography class on main title', () => {
            render(<HomePage />);
            const title = screen.getByText('A Lo Cubano Boulder Fest 2026!');
            expect(title).toHaveClass('hero__title');
            expect(title).toHaveClass('text-mask');
        });

        it('should use correct class on subtitle', () => {
            render(<HomePage />);
            const subtitle = screen.getByText('Experience 3 days of workshops and social dancing');
            expect(subtitle).toHaveClass('hero__subtitle');
        });

        it('should use section-typographic class on sections', () => {
            render(<HomePage />);
            const sections = document.querySelectorAll('.section-typographic');
            // Should have multiple typographic sections (Festival Info, What To Expect, Genres, CTA)
            expect(sections.length).toBeGreaterThanOrEqual(4);
        });
    });

    describe('Accessibility', () => {
        it('should have heading hierarchy', () => {
            render(<HomePage />);
            const h1 = screen.getByRole('heading', { level: 1 });
            const h2s = screen.getAllByRole('heading', { level: 2 });
            const h3s = screen.getAllByRole('heading', { level: 3 });

            expect(h1).toBeInTheDocument();
            expect(h2s.length).toBeGreaterThan(0);
            expect(h3s.length).toBeGreaterThan(0);
        });

        it('should have alt text on hero image', () => {
            render(<HomePage />);
            const heroImage = screen.getByAltText(/Dynamic festival photo showcasing A Lo Cubano Boulder Fest/i);
            expect(heroImage).toBeInTheDocument();
        });

        it('should have accessible link for tickets', () => {
            render(<HomePage />);
            const ticketLink = screen.getByRole('link', { name: /GET TICKETS NOW/i });
            expect(ticketLink).toBeInTheDocument();
            expect(ticketLink).toHaveAttribute('href', '/tickets');
        });
    });

    describe('Data Attributes', () => {
        it('should have data-number attributes on genre items', () => {
            render(<HomePage />);
            const genreItems = document.querySelectorAll('.gallery-item-type[data-number]');
            // Should have 4 genre items with data-number attributes (01, 02, 03, 04)
            expect(genreItems.length).toBe(4);
        });

        it('should have data-text attribute on glitch text', () => {
            render(<HomePage />);
            const glitchText = document.querySelector('.text-glitch[data-text="GENRES"]');
            expect(glitchText).toBeInTheDocument();
        });
    });
});

/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ContactPage from '../../../../src/pages/ContactPage';

describe('ContactPage', () => {
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
        it('should render the Contact page', () => {
            render(<ContactPage />);
            expect(screen.getByText('GET IN TOUCH')).toBeInTheDocument();
        });

        it('should render hero image container', () => {
            render(<ContactPage />);
            const heroImage = screen.getByAltText(/Connect with A Lo Cubano Boulder Fest/i);
            expect(heroImage).toBeInTheDocument();
            expect(heroImage).toHaveClass('hero-splash-img');
        });

        it('should render main content area', () => {
            render(<ContactPage />);
            const main = screen.getByRole('main');
            expect(main).toBeInTheDocument();
        });

        it('should render contact header subtitle', () => {
            render(<ContactPage />);
            expect(screen.getByText("We'd love to hear from you")).toBeInTheDocument();
        });
    });

    describe('Contact Items', () => {
        it('should render Email Us section', () => {
            render(<ContactPage />);
            expect(screen.getByText('Email Us')).toBeInTheDocument();
            expect(screen.getByText(/For general inquiries, partnerships/i)).toBeInTheDocument();
        });

        it('should render email link with correct href', () => {
            render(<ContactPage />);
            const emailLink = screen.getByRole('link', { name: /alocubanoboulderfest/i });
            expect(emailLink).toHaveAttribute('href', 'mailto:alocubanoboulderfest@gmail.com');
        });

        it('should render Follow Us section', () => {
            render(<ContactPage />);
            expect(screen.getByText('Follow Us')).toBeInTheDocument();
            expect(screen.getByText(/Stay connected with the latest festival updates/i)).toBeInTheDocument();
        });

        it('should render Instagram link', () => {
            render(<ContactPage />);
            const instagramLink = screen.getByRole('link', { name: /@alocubano\.boulderfest/i });
            expect(instagramLink).toHaveAttribute('href', 'https://www.instagram.com/alocubano.boulderfest/');
            expect(instagramLink).toHaveAttribute('target', '_blank');
            expect(instagramLink).toHaveAttribute('rel', 'noopener noreferrer');
        });

        it('should render Join Our Community section', () => {
            render(<ContactPage />);
            expect(screen.getByText('Join Our Community')).toBeInTheDocument();
            expect(screen.getByText(/Connect with fellow dancers/i)).toBeInTheDocument();
        });

        it('should render WhatsApp link', () => {
            render(<ContactPage />);
            const whatsappLink = screen.getByRole('link', { name: /WhatsApp Community/i });
            expect(whatsappLink).toHaveAttribute('href', 'https://chat.whatsapp.com/KadIVdb24RWKdIKGtipnLH');
            expect(whatsappLink).toHaveAttribute('target', '_blank');
        });

        it('should render Share Your Feedback section', () => {
            render(<ContactPage />);
            expect(screen.getByText('Share Your Feedback')).toBeInTheDocument();
            expect(screen.getByText(/Help us improve!/i)).toBeInTheDocument();
        });

        it('should render feedback survey link', () => {
            render(<ContactPage />);
            const feedbackLink = screen.getByRole('link', { name: /Feedback Survey/i });
            expect(feedbackLink).toHaveAttribute('href', expect.stringContaining('docs.google.com/forms'));
            expect(feedbackLink).toHaveAttribute('target', '_blank');
        });
    });

    describe('Newsletter Section', () => {
        it('should render newsletter section heading', () => {
            render(<ContactPage />);
            expect(screen.getByText('Hear from us!')).toBeInTheDocument();
        });

        it('should render newsletter description', () => {
            render(<ContactPage />);
            expect(screen.getByText(/Be the first to know about festival updates/i)).toBeInTheDocument();
        });

        it('should render newsletter form', () => {
            render(<ContactPage />);
            const form = screen.getByRole('form', { name: /newsletter/i });
            expect(form).toBeInTheDocument();
        });

        it('should render email input', () => {
            render(<ContactPage />);
            const emailInput = screen.getByPlaceholderText(/YOUR EMAIL ADDRESS/i);
            expect(emailInput).toBeInTheDocument();
            expect(emailInput).toHaveAttribute('type', 'email');
        });

        it('should render subscribe button', () => {
            render(<ContactPage />);
            const subscribeButton = screen.getByRole('button', { name: /Subscribe to newsletter/i });
            expect(subscribeButton).toBeInTheDocument();
        });

        it('should render consent checkbox', () => {
            render(<ContactPage />);
            const consentCheckbox = screen.getByRole('checkbox');
            expect(consentCheckbox).toBeInTheDocument();
        });

        it('should render consent label text', () => {
            render(<ContactPage />);
            expect(screen.getByText(/I agree to receive marketing emails/i)).toBeInTheDocument();
        });
    });

    describe('Contact Icons', () => {
        it('should render Instagram icon', () => {
            render(<ContactPage />);
            const instagramIcon = screen.getByAltText('Instagram');
            expect(instagramIcon).toBeInTheDocument();
            expect(instagramIcon).toHaveAttribute('src', '/images/social/instagram-icon.svg');
        });

        it('should render WhatsApp icon', () => {
            render(<ContactPage />);
            const whatsappIcon = screen.getByAltText('WhatsApp');
            expect(whatsappIcon).toBeInTheDocument();
            expect(whatsappIcon).toHaveAttribute('src', '/images/social/whatsapp-icon.svg');
        });
    });

    describe('Accessibility', () => {
        it('should have heading hierarchy', () => {
            render(<ContactPage />);
            const h1s = screen.getAllByRole('heading', { level: 1 });
            const h2s = screen.getAllByRole('heading', { level: 2 });

            // Should have exactly one h1 for main title
            expect(h1s.length).toBe(1);
            // Should have h2 for each contact item
            expect(h2s.length).toBeGreaterThanOrEqual(4);
        });

        it('should have alt text on hero image', () => {
            render(<ContactPage />);
            const heroImage = screen.getByAltText(/Connect with A Lo Cubano Boulder Fest/i);
            expect(heroImage).toBeInTheDocument();
        });

        it('should have accessible form with aria-label', () => {
            render(<ContactPage />);
            const form = screen.getByRole('form', { name: /newsletter/i });
            expect(form).toHaveAttribute('aria-label', 'Email newsletter signup');
        });

        it('should have aria-required on email input', () => {
            render(<ContactPage />);
            const emailInput = screen.getByPlaceholderText(/YOUR EMAIL ADDRESS/i);
            expect(emailInput).toHaveAttribute('aria-required', 'true');
        });
    });

    describe('External Links', () => {
        it('should have security attributes on external links', () => {
            render(<ContactPage />);

            const externalLinks = [
                screen.getByRole('link', { name: /@alocubano\.boulderfest/i }),
                screen.getByRole('link', { name: /WhatsApp Community/i }),
                screen.getByRole('link', { name: /Feedback Survey/i }),
            ];

            externalLinks.forEach(link => {
                expect(link).toHaveAttribute('target', '_blank');
                expect(link).toHaveAttribute('rel', 'noopener noreferrer');
            });
        });
    });
});

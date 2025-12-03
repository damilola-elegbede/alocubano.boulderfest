/**
 * EventFooter - Footer for event pages
 *
 * Displays event-specific footer with:
 * - Event credits line
 * - Email contact link
 * - Social media links (Instagram, WhatsApp)
 * - Theme toggle
 *
 * Usage:
 *   import EventFooter from './EventFooter';
 *
 *   function EventPage() {
 *     return (
 *       <EventProvider eventId="boulder-fest-2025">
 *         <EventFooter />
 *       </EventProvider>
 *     );
 *   }
 */

import React, { useEffect, useRef } from 'react';
import { useEvent } from '../../hooks/useEvent.js';

export default function EventFooter() {
    const { title, year, socialLinks } = useEvent();
    const themeToggleRef = useRef(null);

    // Initialize theme toggle on mount
    useEffect(() => {
        // Dynamic import to avoid SSR issues
        async function initThemeToggle() {
            try {
                const { initializeThemeToggle } = await import('/js/theme-toggle.js');
                if (themeToggleRef.current) {
                    initializeThemeToggle('#theme-toggle-container');
                }
            } catch (error) {
                console.warn('Failed to initialize theme toggle:', error);
            }
        }

        initThemeToggle();
    }, []);

    // Format title for footer (e.g., "BOULDER FEST 2025")
    const footerTitle = title
        ? title.toUpperCase().replace(/\s+/g, ' ')
        : `EVENT ${year}`;

    return (
        <footer className="footer-typographic">
            <div className="container">
                <p className="footer-credits">
                    {footerTitle} •{' '}
                    <a
                        href="mailto:alocubanoboulderfest@gmail.com?subject=A Lo Cubano Boulder Fest Inquiry"
                        style={{ color: 'inherit', textDecoration: 'underline' }}
                    >
                        alocubanoboulderfest@gmail.com
                    </a>
                </p>

                <div className="footer-social">
                    {socialLinks?.instagram && (
                        <a
                            href={socialLinks.instagram}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="social-link-type"
                            aria-label="Follow us on Instagram"
                        >
                            <svg
                                width="32"
                                height="32"
                                viewBox="0 0 24 24"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                            </svg>
                        </a>
                    )}

                    {socialLinks?.whatsapp && (
                        <a
                            href={socialLinks.whatsapp}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="social-link-type"
                            aria-label="Join us on WhatsApp"
                        >
                            <svg
                                width="32"
                                height="32"
                                viewBox="0 0 24 24"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                            </svg>
                        </a>
                    )}
                </div>

                <div
                    id="theme-toggle-container"
                    ref={themeToggleRef}
                    className="footer-theme-toggle"
                />
            </div>
        </footer>
    );
}

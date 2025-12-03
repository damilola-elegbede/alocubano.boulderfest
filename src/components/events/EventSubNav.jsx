/**
 * EventSubNav - Sub-navigation for event pages
 *
 * Displays navigation links for event sub-pages:
 * Overview | Artists | Schedule | Gallery
 *
 * Automatically highlights the current page based on EventContext.
 *
 * Usage:
 *   import EventSubNav from './EventSubNav';
 *
 *   function EventPage() {
 *     return (
 *       <EventProvider eventId="boulder-fest-2025" currentPage="artists">
 *         <EventSubNav />
 *       </EventProvider>
 *     );
 *   }
 */

import React from 'react';
import { useEvent } from '../../hooks/useEvent.js';

/**
 * Navigation item configuration
 */
const NAV_ITEMS = [
    { key: 'overview', label: 'Overview', pathSuffix: '' },
    { key: 'artists', label: 'Artists', pathSuffix: '/artists' },
    { key: 'schedule', label: 'Schedule', pathSuffix: '/schedule' },
    { key: 'gallery', label: 'Gallery', pathSuffix: '/gallery' },
];

export default function EventSubNav() {
    const { basePath, currentPage, title } = useEvent();

    return (
        <section className="event-subnav">
            <div className="container">
                <nav
                    className="event-nav"
                    aria-label={`${title} Navigation`}
                >
                    <ul className="event-nav-list">
                        {NAV_ITEMS.map(item => {
                            const isActive = currentPage === item.key;
                            const href = `${basePath}${item.pathSuffix}`;

                            return (
                                <li key={item.key}>
                                    <a
                                        href={href}
                                        className={`event-nav-link${isActive ? ' active' : ''}`}
                                        data-text={item.label}
                                        aria-current={isActive ? 'page' : undefined}
                                    >
                                        {item.label}
                                    </a>
                                </li>
                            );
                        })}
                    </ul>
                </nav>
            </div>
        </section>
    );
}

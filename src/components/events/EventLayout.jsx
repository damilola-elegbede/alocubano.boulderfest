/**
 * EventLayout - Shared layout wrapper for event sub-site pages
 *
 * Provides consistent structure across all event pages:
 * - Hero splash image
 * - Event sub-navigation
 * - Page content slot
 * - Event footer
 *
 * Usage:
 *   import { EventLayout } from '../components/events/EventLayout';
 *
 *   function ArtistsPageContent() {
 *     return (
 *       <EventLayout>
 *         <section className="section-typographic">
 *           ...page content...
 *         </section>
 *       </EventLayout>
 *     );
 *   }
 */

import React from 'react';
import { useEvent } from '../../hooks/useEvent.js';
import EventHeroSplash from './EventHeroSplash.jsx';
import EventSubNav from './EventSubNav.jsx';
import EventFooter from './EventFooter.jsx';

export default function EventLayout({ children, className = '' }) {
    const event = useEvent();

    return (
        <>
            {/* Hero Splash Image */}
            <EventHeroSplash />

            {/* Main Content */}
            <main className={className}>
                {/* Event Sub Navigation */}
                <EventSubNav />

                {/* Page Content */}
                {children}
            </main>

            {/* Event Footer */}
            <EventFooter />
        </>
    );
}

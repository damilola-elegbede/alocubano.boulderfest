/**
 * Boulder Fest 2026 Artists Page
 *
 * Coming soon page for Boulder Fest 2026 artists.
 */

import React from 'react';
import { AppProviders } from '../../../providers/AppProviders.jsx';
import { EventProvider } from '../../../contexts/EventContext.jsx';
import { useEvent } from '../../../hooks/useEvent.js';
import EventLayout from '../../../components/events/EventLayout.jsx';
import ComingSoon from '../../../components/events/ComingSoon.jsx';

function ArtistsPageContent() {
    const { comingSoon, newsletter } = useEvent();

    return (
        <EventLayout>
            {/* Page Title */}
            <section className="section-typographic">
                <div className="container">
                    <h1 className="text-mask">2026 Artists</h1>
                </div>
            </section>

            {/* Coming Soon Message */}
            <ComingSoon
                title={comingSoon?.artists?.title || 'Artists Coming Soon'}
                message={comingSoon?.artists?.message || 'Our 2026 lineup is being finalized. Sign up for our newsletter to be the first to know!'}
                showNewsletter={newsletter?.enabled ?? true}
            />
        </EventLayout>
    );
}

export default function BoulderFest2026ArtistsPage() {
    return (
        <AppProviders>
            <EventProvider eventId="boulder-fest-2026" currentPage="artists">
                <ArtistsPageContent />
            </EventProvider>
        </AppProviders>
    );
}

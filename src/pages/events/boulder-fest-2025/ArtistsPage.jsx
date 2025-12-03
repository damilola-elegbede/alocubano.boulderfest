/**
 * Boulder Fest 2025 Artists Page
 *
 * Displays all artists and DJs for Boulder Fest 2025.
 */

import React from 'react';
import { AppProviders } from '../../../providers/AppProviders.jsx';
import { EventProvider } from '../../../contexts/EventContext.jsx';
import { useEvent } from '../../../hooks/useEvent.js';
import EventLayout from '../../../components/events/EventLayout.jsx';
import ArtistCard from '../../../components/events/ArtistCard.jsx';
import DJCard from '../../../components/events/DJCard.jsx';

function ArtistsPageContent() {
    const { artists, djs } = useEvent();

    return (
        <EventLayout>
            {/* Artists Grid */}
            <section className="section-typographic">
                <div className="container">
                    <h1 className="text-mask">2025 Festival</h1>
                    <div className="gallery-typographic">
                        {artists.map((artist) => (
                            <ArtistCard key={artist.id} artist={artist} />
                        ))}
                    </div>
                </div>
            </section>

            {/* DJs Section */}
            {djs.length > 0 && (
                <section className="section-typographic">
                    <div className="container">
                        <h3 className="text-gradient">AMAZING DJ'S</h3>
                        <div className="gallery-typographic">
                            {djs.map((dj) => (
                                <DJCard key={dj.id} dj={dj} />
                            ))}
                        </div>
                    </div>
                </section>
            )}
        </EventLayout>
    );
}

export default function BoulderFest2025ArtistsPage() {
    return (
        <AppProviders>
            <EventProvider eventId="boulder-fest-2025" currentPage="artists">
                <ArtistsPageContent />
            </EventProvider>
        </AppProviders>
    );
}

/**
 * Boulder Fest 2025 Overview Page
 *
 * Main landing page for the Boulder Fest 2025 event.
 * Displays event highlights and navigation to sub-pages.
 */

import React from 'react';
import { AppProviders } from '../../../providers/AppProviders.jsx';
import { EventProvider } from '../../../contexts/EventContext.jsx';
import { useEvent } from '../../../hooks/useEvent.js';
import EventLayout from '../../../components/events/EventLayout.jsx';

function OverviewPageContent() {
    const { title, subtitle, overview, venue } = useEvent();

    return (
        <EventLayout>
            {/* Festival Title Section */}
            <section className="section-typographic">
                <div className="container">
                    <h1 className="text-mask">2025 Festival</h1>
                    <p
                        className="font-serif"
                        style={{
                            fontSize: 'var(--font-size-xl)',
                            fontStyle: 'italic',
                            marginTop: 'var(--space-md)',
                        }}
                    >
                        {subtitle}
                    </p>
                </div>
            </section>

            {/* What Happened Section */}
            <section className="section-typographic">
                <div className="container">
                    <h2 className="text-gradient">{overview?.tagline || 'What Happened'}</h2>
                    <div
                        className="gallery-typographic"
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                            gap: 'var(--space-lg)',
                            marginTop: 'var(--space-xl)',
                        }}
                    >
                        {overview?.highlights?.map((highlight, index) => (
                            <div
                                key={index}
                                className="gallery-item-type"
                                data-number={String(index + 1).padStart(2, '0')}
                            >
                                <h3 className="gallery-type-title font-display">
                                    {highlight.title}
                                </h3>
                                <p className="gallery-type-description font-serif">
                                    {highlight.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Venue Information */}
            {venue && (
                <section className="section-typographic">
                    <div className="container">
                        <h2 className="text-gradient">Venue</h2>
                        <div style={{ marginTop: 'var(--space-lg)' }}>
                            <p
                                className="font-display"
                                style={{ fontSize: 'var(--font-size-xl)' }}
                            >
                                {venue.name}
                            </p>
                            <p
                                className="font-mono"
                                style={{
                                    fontSize: 'var(--font-size-sm)',
                                    color: 'var(--color-gray-500)',
                                    marginTop: 'var(--space-sm)',
                                }}
                            >
                                {venue.address}
                            </p>
                        </div>
                    </div>
                </section>
            )}

            {/* Navigation Cards */}
            <section className="section-typographic">
                <div className="container">
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: 'var(--space-lg)',
                            marginTop: 'var(--space-xl)',
                        }}
                    >
                        <a href="/boulder-fest-2025/artists" className="nav-card">
                            <h3 className="font-display">Artists</h3>
                            <p className="font-mono" style={{ fontSize: 'var(--font-size-sm)' }}>
                                Meet our instructors
                            </p>
                        </a>
                        <a href="/boulder-fest-2025/schedule" className="nav-card">
                            <h3 className="font-display">Schedule</h3>
                            <p className="font-mono" style={{ fontSize: 'var(--font-size-sm)' }}>
                                View the full program
                            </p>
                        </a>
                        <a href="/boulder-fest-2025/gallery" className="nav-card">
                            <h3 className="font-display">Gallery</h3>
                            <p className="font-mono" style={{ fontSize: 'var(--font-size-sm)' }}>
                                Photos from the event
                            </p>
                        </a>
                    </div>
                </div>
            </section>
        </EventLayout>
    );
}

export default function BoulderFest2025OverviewPage() {
    return (
        <AppProviders>
            <EventProvider eventId="boulder-fest-2025" currentPage="overview">
                <OverviewPageContent />
            </EventProvider>
        </AppProviders>
    );
}

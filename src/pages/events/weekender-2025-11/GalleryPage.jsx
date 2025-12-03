/**
 * Weekender November 2025 Gallery Page
 *
 * Gallery page for the weekender event (coming soon for upcoming events).
 */

import React from 'react';
import { AppProviders } from '../../../providers/AppProviders.jsx';
import { EventProvider } from '../../../contexts/EventContext.jsx';
import { useEvent } from '../../../hooks/useEvent.js';
import EventLayout from '../../../components/events/EventLayout.jsx';
import ComingSoon from '../../../components/events/ComingSoon.jsx';

function GalleryPageContent() {
    const { status, hasGallery } = useEvent();

    // If event hasn't happened yet, show coming soon
    if (status === 'upcoming' || !hasGallery) {
        return (
            <EventLayout>
                {/* Page Title */}
                <section className="section-typographic">
                    <div className="container">
                        <h1 className="text-mask">Event Gallery</h1>
                    </div>
                </section>

                {/* Coming Soon Message */}
                <ComingSoon
                    title="Gallery Coming Soon"
                    message="Photos from this event will be available after November 15, 2025."
                    showNewsletter={false}
                />

                {/* Link to other galleries */}
                <section className="section-typographic">
                    <div className="container" style={{ textAlign: 'center' }}>
                        <p
                            className="font-serif"
                            style={{
                                fontStyle: 'italic',
                                marginBottom: 'var(--space-md)',
                            }}
                        >
                            Check out photos from our other events!
                        </p>
                        <a
                            href="/boulder-fest-2025/gallery"
                            className="btn btn-secondary"
                            style={{
                                display: 'inline-block',
                                padding: 'var(--space-md) var(--space-lg)',
                            }}
                        >
                            View Boulder Fest 2025 Gallery
                        </a>
                    </div>
                </section>
            </EventLayout>
        );
    }

    // If event has happened and has gallery content
    return (
        <EventLayout>
            {/* Page Title */}
            <section className="section-typographic">
                <div className="container">
                    <h1 className="text-mask">Event Gallery</h1>
                    <p
                        className="font-serif"
                        style={{
                            fontSize: 'var(--font-size-lg)',
                            fontStyle: 'italic',
                            marginTop: 'var(--space-md)',
                            color: 'var(--color-gray-500)',
                        }}
                    >
                        Memories from November 2025
                    </p>
                </div>
            </section>

            {/* Gallery content would go here when available */}
            <section className="section-typographic">
                <div className="container">
                    <p className="font-mono" style={{ textAlign: 'center' }}>
                        Gallery content loading...
                    </p>
                </div>
            </section>
        </EventLayout>
    );
}

export default function Weekender202511GalleryPage() {
    return (
        <AppProviders>
            <EventProvider eventId="weekender-2025-11" currentPage="gallery">
                <GalleryPageContent />
            </EventProvider>
        </AppProviders>
    );
}

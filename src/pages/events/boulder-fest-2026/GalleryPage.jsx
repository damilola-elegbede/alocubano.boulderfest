/**
 * Boulder Fest 2026 Gallery Page
 *
 * Coming soon page for Boulder Fest 2026 gallery.
 */

import React from 'react';
import { AppProviders } from '../../../providers/AppProviders.jsx';
import { EventProvider } from '../../../contexts/EventContext.jsx';
import { useEvent } from '../../../hooks/useEvent.js';
import EventLayout from '../../../components/events/EventLayout.jsx';
import ComingSoon from '../../../components/events/ComingSoon.jsx';

function GalleryPageContent() {
    const { comingSoon } = useEvent();

    return (
        <EventLayout>
            {/* Page Title */}
            <section className="section-typographic">
                <div className="container">
                    <h1 className="text-mask">2026 Gallery</h1>
                </div>
            </section>

            {/* Coming Soon Message */}
            <ComingSoon
                title={comingSoon?.gallery?.title || 'Gallery Coming Soon'}
                message={comingSoon?.gallery?.message || 'Photos from Boulder Fest 2026 will be available after the event.'}
                showNewsletter={false}
            />

            {/* Link to 2025 Gallery */}
            <section className="section-typographic">
                <div className="container" style={{ textAlign: 'center' }}>
                    <p
                        className="font-serif"
                        style={{
                            fontStyle: 'italic',
                            marginBottom: 'var(--space-md)',
                        }}
                    >
                        In the meantime, check out photos from last year!
                    </p>
                    <a
                        href="/boulder-fest-2025/gallery"
                        className="btn btn-secondary"
                        style={{
                            display: 'inline-block',
                            padding: 'var(--space-md) var(--space-lg)',
                        }}
                    >
                        View 2025 Gallery
                    </a>
                </div>
            </section>
        </EventLayout>
    );
}

export default function BoulderFest2026GalleryPage() {
    return (
        <AppProviders>
            <EventProvider eventId="boulder-fest-2026" currentPage="gallery">
                <GalleryPageContent />
            </EventProvider>
        </AppProviders>
    );
}

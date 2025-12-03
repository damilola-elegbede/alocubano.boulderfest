/**
 * Boulder Fest 2025 Gallery Page
 *
 * Displays photos from Boulder Fest 2025 with API integration.
 */

import React, { useState } from 'react';
import { AppProviders } from '../../../providers/AppProviders.jsx';
import { EventProvider } from '../../../contexts/EventContext.jsx';
import { useEvent } from '../../../hooks/useEvent.js';
import { useGalleryData } from '../../../hooks/useGalleryData.js';
import EventLayout from '../../../components/events/EventLayout.jsx';

function GalleryStats({ stats }) {
    const items = [
        { value: '150+', label: 'Attendees' },
        { value: '3', label: 'Days' },
        { value: '10', label: 'Workshops' },
        { value: '∞', label: 'Memories' },
    ];

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: 'var(--space-lg)',
                textAlign: 'center',
                marginBottom: 'var(--space-xl)',
            }}
        >
            {items.map((item, index) => (
                <div key={index}>
                    <span
                        className="font-display"
                        style={{
                            fontSize: 'var(--font-size-3xl)',
                            color: 'var(--color-red)',
                        }}
                    >
                        {item.value}
                    </span>
                    <p
                        className="font-mono"
                        style={{
                            fontSize: 'var(--font-size-sm)',
                            color: 'var(--color-gray-500)',
                        }}
                    >
                        {item.label}
                    </p>
                </div>
            ))}
        </div>
    );
}

function GallerySection({ title, photos, loading, error }) {
    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
                <p className="font-mono">Loading {title.toLowerCase()}...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
                <p className="font-mono" style={{ color: 'var(--color-red)' }}>
                    Failed to load {title.toLowerCase()}
                </p>
            </div>
        );
    }

    if (!photos || photos.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
                <p className="font-serif" style={{ fontStyle: 'italic', color: 'var(--color-gray-500)' }}>
                    No photos available yet
                </p>
            </div>
        );
    }

    return (
        <div
            className="gallery-grid"
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                gap: 'var(--space-md)',
            }}
        >
            {photos.map((photo) => (
                <div
                    key={photo.id}
                    className="gallery-item"
                    style={{
                        position: 'relative',
                        paddingBottom: '75%',
                        overflow: 'hidden',
                        borderRadius: 'var(--radius-md)',
                    }}
                >
                    <img
                        src={photo.thumbnail || photo.src}
                        alt={photo.alt}
                        loading="lazy"
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                        }}
                    />
                </div>
            ))}
        </div>
    );
}

function GalleryPageContent() {
    const { galleryConfig } = useEvent();
    const [activeCategory, setActiveCategory] = useState('workshops');

    const { data: workshopsData, loading: workshopsLoading, error: workshopsError } = useGalleryData({
        year: galleryConfig?.year || '2025',
        category: 'workshops',
    });

    const { data: socialsData, loading: socialsLoading, error: socialsError } = useGalleryData({
        year: galleryConfig?.year || '2025',
        category: 'socials',
    });

    return (
        <EventLayout>
            {/* Gallery Header */}
            <section className="section-typographic">
                <div className="container">
                    <h1 className="text-mask">2025 Gallery</h1>
                    <p
                        className="font-serif"
                        style={{
                            fontSize: 'var(--font-size-lg)',
                            fontStyle: 'italic',
                            marginTop: 'var(--space-md)',
                            color: 'var(--color-gray-500)',
                        }}
                    >
                        Relive the magic of Boulder Fest 2025
                    </p>
                </div>
            </section>

            {/* Stats Grid */}
            <section className="section-typographic">
                <div className="container">
                    <GalleryStats />
                </div>
            </section>

            {/* Category Tabs */}
            <section className="section-typographic">
                <div className="container">
                    <div
                        style={{
                            display: 'flex',
                            gap: 'var(--space-md)',
                            marginBottom: 'var(--space-xl)',
                            borderBottom: '2px solid var(--color-gray-200)',
                        }}
                    >
                        <button
                            onClick={() => setActiveCategory('workshops')}
                            className={`font-display ${activeCategory === 'workshops' ? 'active' : ''}`}
                            style={{
                                padding: 'var(--space-md) var(--space-lg)',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: 'var(--font-size-lg)',
                                color: activeCategory === 'workshops' ? 'var(--color-red)' : 'var(--color-gray-500)',
                                borderBottom: activeCategory === 'workshops' ? '3px solid var(--color-red)' : 'none',
                                marginBottom: '-2px',
                            }}
                        >
                            Workshops
                        </button>
                        <button
                            onClick={() => setActiveCategory('socials')}
                            className={`font-display ${activeCategory === 'socials' ? 'active' : ''}`}
                            style={{
                                padding: 'var(--space-md) var(--space-lg)',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: 'var(--font-size-lg)',
                                color: activeCategory === 'socials' ? 'var(--color-red)' : 'var(--color-gray-500)',
                                borderBottom: activeCategory === 'socials' ? '3px solid var(--color-red)' : 'none',
                                marginBottom: '-2px',
                            }}
                        >
                            Socials
                        </button>
                    </div>

                    {/* Gallery Content */}
                    {activeCategory === 'workshops' && (
                        <GallerySection
                            title="Workshops"
                            photos={workshopsData?.photos}
                            loading={workshopsLoading}
                            error={workshopsError}
                        />
                    )}

                    {activeCategory === 'socials' && (
                        <GallerySection
                            title="Socials"
                            photos={socialsData?.photos}
                            loading={socialsLoading}
                            error={socialsError}
                        />
                    )}
                </div>
            </section>
        </EventLayout>
    );
}

export default function BoulderFest2025GalleryPage() {
    return (
        <AppProviders>
            <EventProvider eventId="boulder-fest-2025" currentPage="gallery">
                <GalleryPageContent />
            </EventProvider>
        </AppProviders>
    );
}

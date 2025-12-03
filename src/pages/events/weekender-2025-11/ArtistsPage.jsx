/**
 * Weekender November 2025 Artists Page
 *
 * Displays the featured artist for the weekender event.
 */

import React from 'react';
import { AppProviders } from '../../../providers/AppProviders.jsx';
import { EventProvider } from '../../../contexts/EventContext.jsx';
import { useEvent } from '../../../hooks/useEvent.js';
import EventLayout from '../../../components/events/EventLayout.jsx';
import ArtistCard from '../../../components/events/ArtistCard.jsx';

function ArtistsPageContent() {
    const { artists, featuredArtist } = useEvent();

    return (
        <EventLayout>
            {/* Page Title */}
            <section className="section-typographic">
                <div className="container">
                    <h1 className="text-mask">Featured Artist</h1>
                </div>
            </section>

            {/* Featured Artist Detail */}
            {featuredArtist && (
                <section className="section-typographic">
                    <div className="container">
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                                gap: 'var(--space-xl)',
                                alignItems: 'start',
                            }}
                        >
                            {featuredArtist.image && (
                                <div>
                                    <img
                                        src={featuredArtist.image}
                                        alt={featuredArtist.name}
                                        style={{
                                            width: '100%',
                                            borderRadius: 'var(--radius-lg)',
                                        }}
                                    />
                                </div>
                            )}
                            <div>
                                <h2
                                    className="font-display"
                                    style={{
                                        fontSize: 'var(--font-size-3xl)',
                                        color: 'var(--color-red)',
                                    }}
                                >
                                    {featuredArtist.name}
                                </h2>

                                {featuredArtist.title && (
                                    <p
                                        className="font-serif"
                                        style={{
                                            fontStyle: 'italic',
                                            fontSize: 'var(--font-size-lg)',
                                            marginTop: 'var(--space-sm)',
                                        }}
                                    >
                                        {featuredArtist.title}
                                    </p>
                                )}

                                {featuredArtist.bio && (
                                    <p
                                        style={{
                                            marginTop: 'var(--space-lg)',
                                            lineHeight: 1.8,
                                            whiteSpace: 'pre-line',
                                        }}
                                    >
                                        {featuredArtist.bio}
                                    </p>
                                )}

                                {featuredArtist.styles && featuredArtist.styles.length > 0 && (
                                    <div style={{ marginTop: 'var(--space-xl)' }}>
                                        <h3
                                            className="font-display"
                                            style={{
                                                fontSize: 'var(--font-size-lg)',
                                                marginBottom: 'var(--space-md)',
                                            }}
                                        >
                                            Dance Styles
                                        </h3>
                                        <div
                                            style={{
                                                display: 'flex',
                                                flexWrap: 'wrap',
                                                gap: 'var(--space-sm)',
                                            }}
                                        >
                                            {featuredArtist.styles.map((style, index) => (
                                                <span
                                                    key={index}
                                                    className="font-mono"
                                                    style={{
                                                        padding: 'var(--space-xs) var(--space-md)',
                                                        background: 'var(--color-surface)',
                                                        borderRadius: 'var(--radius-sm)',
                                                        fontSize: 'var(--font-size-sm)',
                                                    }}
                                                >
                                                    {style}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {featuredArtist.specialties && featuredArtist.specialties.length > 0 && (
                                    <div style={{ marginTop: 'var(--space-xl)' }}>
                                        <h3
                                            className="font-display"
                                            style={{
                                                fontSize: 'var(--font-size-lg)',
                                                marginBottom: 'var(--space-md)',
                                            }}
                                        >
                                            Teaching Focus
                                        </h3>
                                        <ul
                                            style={{
                                                listStyle: 'none',
                                                padding: 0,
                                                margin: 0,
                                            }}
                                        >
                                            {featuredArtist.specialties.map((specialty, index) => (
                                                <li
                                                    key={index}
                                                    className="font-mono"
                                                    style={{
                                                        fontSize: 'var(--font-size-sm)',
                                                        padding: 'var(--space-xs) 0',
                                                        color: 'var(--color-gray-600)',
                                                    }}
                                                >
                                                    {specialty}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* Additional Artists Grid (if any) */}
            {artists.length > 0 && !artists[0].isFeatured && (
                <section className="section-typographic">
                    <div className="container">
                        <h2 className="text-gradient">All Artists</h2>
                        <div className="gallery-typographic">
                            {artists.map((artist) => (
                                <ArtistCard key={artist.id} artist={artist} />
                            ))}
                        </div>
                    </div>
                </section>
            )}
        </EventLayout>
    );
}

export default function Weekender202511ArtistsPage() {
    return (
        <AppProviders>
            <EventProvider eventId="weekender-2025-11" currentPage="artists">
                <ArtistsPageContent />
            </EventProvider>
        </AppProviders>
    );
}

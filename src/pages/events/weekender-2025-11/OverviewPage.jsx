/**
 * Weekender November 2025 Overview Page
 *
 * Landing page for the November 2025 Weekender featuring Steven Messina.
 */

import React from 'react';
import { AppProviders } from '../../../providers/AppProviders.jsx';
import { EventProvider } from '../../../contexts/EventContext.jsx';
import { useEvent } from '../../../hooks/useEvent.js';
import EventLayout from '../../../components/events/EventLayout.jsx';

function OverviewPageContent() {
    const { title, subtitle, overview, venue, featuredArtist, socialLinks } = useEvent();

    return (
        <EventLayout>
            {/* Festival Title Section */}
            <section className="section-typographic">
                <div className="container">
                    <h1 className="text-mask">November Weekender</h1>
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

            {/* CTA Button */}
            <section className="section-typographic">
                <div className="container" style={{ textAlign: 'center' }}>
                    <a
                        href={overview?.cta?.href || '/tickets'}
                        className="btn btn-primary"
                        style={{
                            display: 'inline-block',
                            padding: 'var(--space-lg) var(--space-2xl)',
                            fontSize: 'var(--font-size-xl)',
                        }}
                    >
                        {overview?.cta?.text || 'GET TICKETS NOW'}
                    </a>
                </div>
            </section>

            {/* Featured Artist Section */}
            {featuredArtist && (
                <section className="section-typographic">
                    <div className="container">
                        <h2 className="text-gradient">Featured Artist</h2>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                                gap: 'var(--space-xl)',
                                marginTop: 'var(--space-xl)',
                                alignItems: 'center',
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
                                <h3
                                    className="font-display"
                                    style={{ fontSize: 'var(--font-size-2xl)' }}
                                >
                                    {featuredArtist.name}
                                </h3>
                                {featuredArtist.title && (
                                    <p
                                        className="font-serif"
                                        style={{
                                            fontStyle: 'italic',
                                            color: 'var(--color-gray-500)',
                                            marginTop: 'var(--space-sm)',
                                        }}
                                    >
                                        {featuredArtist.title}
                                    </p>
                                )}
                                {featuredArtist.bio && (
                                    <p
                                        style={{
                                            marginTop: 'var(--space-md)',
                                            lineHeight: 1.6,
                                        }}
                                    >
                                        {featuredArtist.bio}
                                    </p>
                                )}
                                {featuredArtist.styles && featuredArtist.styles.length > 0 && (
                                    <div style={{ marginTop: 'var(--space-md)' }}>
                                        <span
                                            className="font-mono"
                                            style={{
                                                fontSize: 'var(--font-size-sm)',
                                                color: 'var(--color-blue)',
                                            }}
                                        >
                                            Teaching: {featuredArtist.styles.join(' • ')}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* When and Where Section */}
            {overview?.whenAndWhere && (
                <section className="section-typographic">
                    <div className="container">
                        <h2 className="text-gradient">When & Where</h2>
                        <div
                            style={{
                                marginTop: 'var(--space-lg)',
                                padding: 'var(--space-lg)',
                                background: 'var(--color-surface)',
                                borderRadius: 'var(--radius-lg)',
                            }}
                        >
                            <p className="font-display" style={{ fontSize: 'var(--font-size-lg)' }}>
                                {overview.whenAndWhere.date}
                            </p>
                            <p
                                className="font-mono"
                                style={{
                                    fontSize: 'var(--font-size-sm)',
                                    marginTop: 'var(--space-sm)',
                                }}
                            >
                                {overview.whenAndWhere.time}
                            </p>
                            <hr style={{ margin: 'var(--space-md) 0', opacity: 0.2 }} />
                            <p className="font-display" style={{ fontSize: 'var(--font-size-lg)' }}>
                                {overview.whenAndWhere.venue}
                            </p>
                            <p
                                className="font-mono"
                                style={{
                                    fontSize: 'var(--font-size-sm)',
                                    color: 'var(--color-gray-500)',
                                    marginTop: 'var(--space-sm)',
                                }}
                            >
                                {overview.whenAndWhere.address}
                            </p>
                        </div>
                    </div>
                </section>
            )}

            {/* Highlights Section */}
            {overview?.highlights && (
                <section className="section-typographic">
                    <div className="container">
                        <div
                            className="gallery-typographic"
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                gap: 'var(--space-lg)',
                            }}
                        >
                            {overview.highlights.map((highlight, index) => (
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
            )}

            {/* Social Links */}
            {socialLinks && (
                <section className="section-typographic">
                    <div className="container" style={{ textAlign: 'center' }}>
                        <p
                            className="font-serif"
                            style={{ fontStyle: 'italic', marginBottom: 'var(--space-md)' }}
                        >
                            Connect with us
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-lg)' }}>
                            {socialLinks.instagram && (
                                <a
                                    href={socialLinks.instagram}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="Follow us on Instagram"
                                >
                                    Instagram
                                </a>
                            )}
                            {socialLinks.whatsapp && (
                                <a
                                    href={socialLinks.whatsapp}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="Join us on WhatsApp"
                                >
                                    WhatsApp
                                </a>
                            )}
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
                        }}
                    >
                        <a href="/weekender-2025-11/artists" className="nav-card">
                            <h3 className="font-display">Artists</h3>
                            <p className="font-mono" style={{ fontSize: 'var(--font-size-sm)' }}>
                                Meet our instructors
                            </p>
                        </a>
                        <a href="/weekender-2025-11/schedule" className="nav-card">
                            <h3 className="font-display">Schedule</h3>
                            <p className="font-mono" style={{ fontSize: 'var(--font-size-sm)' }}>
                                View the program
                            </p>
                        </a>
                        <a href="/weekender-2025-11/gallery" className="nav-card">
                            <h3 className="font-display">Gallery</h3>
                            <p className="font-mono" style={{ fontSize: 'var(--font-size-sm)' }}>
                                Event photos
                            </p>
                        </a>
                    </div>
                </div>
            </section>
        </EventLayout>
    );
}

export default function Weekender202511OverviewPage() {
    return (
        <AppProviders>
            <EventProvider eventId="weekender-2025-11" currentPage="overview">
                <OverviewPageContent />
            </EventProvider>
        </AppProviders>
    );
}

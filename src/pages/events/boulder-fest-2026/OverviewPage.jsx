/**
 * Boulder Fest 2026 Overview Page
 *
 * Coming soon landing page for Boulder Fest 2026.
 */

import React from 'react';
import { AppProviders } from '../../../providers/AppProviders.jsx';
import { EventProvider } from '../../../contexts/EventContext.jsx';
import { useEvent } from '../../../hooks/useEvent.js';
import EventLayout from '../../../components/events/EventLayout.jsx';

function CountdownTimer() {
    const { dates } = useEvent();
    const [timeLeft, setTimeLeft] = React.useState(null);

    React.useEffect(() => {
        if (!dates?.start) return;

        const targetDate = new Date(dates.start);

        const calculateTimeLeft = () => {
            const now = new Date();
            const diff = targetDate - now;

            if (diff <= 0) {
                return { days: 0, hours: 0, minutes: 0, seconds: 0 };
            }

            return {
                days: Math.floor(diff / (1000 * 60 * 60 * 24)),
                hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
                minutes: Math.floor((diff / (1000 * 60)) % 60),
                seconds: Math.floor((diff / 1000) % 60),
            };
        };

        setTimeLeft(calculateTimeLeft());

        const timer = setInterval(() => {
            setTimeLeft(calculateTimeLeft());
        }, 1000);

        return () => clearInterval(timer);
    }, [dates?.start]);

    if (!timeLeft) return null;

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 'var(--space-lg)',
                maxWidth: '500px',
                margin: '0 auto var(--space-xl)',
                textAlign: 'center',
            }}
        >
            {[
                { value: timeLeft.days, label: 'Days' },
                { value: timeLeft.hours, label: 'Hours' },
                { value: timeLeft.minutes, label: 'Minutes' },
                { value: timeLeft.seconds, label: 'Seconds' },
            ].map((item, index) => (
                <div key={index}>
                    <span
                        className="font-display"
                        style={{
                            fontSize: 'var(--font-size-3xl)',
                            color: 'var(--color-red)',
                        }}
                    >
                        {String(item.value).padStart(2, '0')}
                    </span>
                    <p
                        className="font-mono"
                        style={{
                            fontSize: 'var(--font-size-xs)',
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

function OverviewPageContent() {
    const { title, subtitle, overview, venue } = useEvent();

    return (
        <EventLayout>
            {/* Festival Title Section */}
            <section className="section-typographic">
                <div className="container">
                    <h1 className="text-mask">2026 Festival</h1>
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

            {/* Countdown Timer */}
            <section className="section-typographic">
                <div className="container">
                    <h2
                        className="text-gradient"
                        style={{ textAlign: 'center', marginBottom: 'var(--space-lg)' }}
                    >
                        Countdown to the Festival
                    </h2>
                    <CountdownTimer />
                </div>
            </section>

            {/* What to Expect Section */}
            <section className="section-typographic">
                <div className="container">
                    <h2 className="text-gradient">{overview?.tagline || 'What to Expect'}</h2>
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
                        {overview?.navigationCards?.map((card, index) => (
                            <a
                                key={index}
                                href={card.href}
                                className="nav-card"
                                style={{
                                    opacity: card.status === 'coming-soon' ? 0.7 : 1,
                                }}
                            >
                                <h3 className="font-display">{card.title}</h3>
                                <p className="font-mono" style={{ fontSize: 'var(--font-size-sm)' }}>
                                    {card.description}
                                </p>
                                {card.status === 'coming-soon' && (
                                    <span
                                        className="font-mono"
                                        style={{
                                            fontSize: 'var(--font-size-xs)',
                                            color: 'var(--color-gray-500)',
                                            display: 'block',
                                            marginTop: 'var(--space-xs)',
                                        }}
                                    >
                                        Coming Soon
                                    </span>
                                )}
                            </a>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA - Get Tickets */}
            <section className="section-typographic">
                <div className="container" style={{ textAlign: 'center' }}>
                    <a
                        href="/tickets"
                        className="btn btn-primary"
                        style={{
                            display: 'inline-block',
                            padding: 'var(--space-md) var(--space-xl)',
                            fontSize: 'var(--font-size-lg)',
                        }}
                    >
                        GET TICKETS NOW
                    </a>
                </div>
            </section>
        </EventLayout>
    );
}

export default function BoulderFest2026OverviewPage() {
    return (
        <AppProviders>
            <EventProvider eventId="boulder-fest-2026" currentPage="overview">
                <OverviewPageContent />
            </EventProvider>
        </AppProviders>
    );
}

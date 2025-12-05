import React from 'react';
import { AppProviders } from '../providers/AppProviders';
import DonationSelector from '../components/donations/DonationSelector';

/**
 * DonationsPage Component
 *
 * React migration of pages/core/donations.html
 * Displays donation options with preset amounts and custom input.
 * Integrates with cart system for checkout.
 */

function DonationsPageContent() {
    return (
        <main>
            {/* Hero Splash Image */}
            <section className="gallery-hero-splash">
                <div className="hero-image-container">
                    <img
                        id="hero-splash-image"
                        src="/images/hero/donations.jpg"
                        alt="Community supporters and volunteers making A Lo Cubano Boulder Fest possible, showing the impact of donations"
                        className="hero-splash-img"
                        style={{ objectPosition: 'top center' }}
                    />
                </div>
            </section>

            {/* Donation Content */}
            <section className="section-typographic">
                <div className="container">
                    {/* Mission Text */}
                    <div
                        style={{
                            maxWidth: '700px',
                            margin: '0 auto var(--space-4xl) auto',
                            textAlign: 'center'
                        }}
                    >
                        <p
                            className="font-serif"
                            style={{ fontSize: 'var(--font-size-lg)', lineHeight: 1.8 }}
                        >
                            As a non-profit organization, we run and are able to create this
                            festival through ticket sales and the generous donations from our
                            community. Your support helps us bring world-class Cuban artists
                            to Boulder and keep this cultural celebration accessible to all.
                        </p>
                    </div>

                    {/* Donation Form */}
                    <DonationSelector />

                    {/* Tax Info */}
                    <div
                        style={{
                            marginTop: 'var(--space-4xl)',
                            textAlign: 'center',
                            padding: 'var(--space-2xl)',
                            background: 'var(--color-gray-50)'
                        }}
                    >
                        <p
                            className="font-mono"
                            style={{
                                fontSize: 'var(--font-size-sm)',
                                color: 'var(--color-gray-600)'
                            }}
                        >
                            A Lo Cubano Boulder Fest is a registered 501(c)(3) non-profit
                            organization.<br />
                            All donations are tax-deductible to the extent allowed by law.
                        </p>
                    </div>
                </div>
            </section>
        </main>
    );
}

export default function DonationsPage() {
    return (
        <AppProviders>
            <DonationsPageContent />
        </AppProviders>
    );
}

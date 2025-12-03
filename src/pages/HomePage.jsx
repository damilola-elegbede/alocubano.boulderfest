import React from 'react';
import { AppProviders } from '../providers/AppProviders';

function HomePageContent() {
    return (
        <main>
            {/* Hero Splash Image */}
            <section className="gallery-hero-splash">
                <div className="hero-image-container">
                    <img
                        id="hero-splash-image"
                        src=""
                        alt="Dynamic festival photo showcasing A Lo Cubano Boulder Fest celebration with dancers, musicians, and Cuban culture"
                        className="hero-splash-img"
                        style={{ objectPosition: 'top center' }}
                    />
                </div>
            </section>

            {/* Typographic Festival Info */}
            <section className="section-typographic" style={{ padding: 'var(--space-xl) 0' }}>
                <div className="container">
                    <div className="text-composition">
                        <div className="text-block-large">
                            <h1 className="hero__title text-mask">
                                A Lo Cubano Boulder Fest 2026!
                            </h1>
                            <h2 className="hero__subtitle">
                                Experience 3 days of workshops and social dancing
                            </h2>
                        </div>
                        <div className="text-block-mono">
                            <span>// MAY 15-17, 2026</span><br />
                            <span>// BOULDER, COLORADO</span><br />
                            <span>// WORLD CLASS CUBAN ARTISTS</span><br />
                            <span>// UNLIMITED MEMORIES</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* What To Expect Typography */}
            <section className="section-typographic" style={{ padding: 'var(--space-xl) 0' }}>
                <div className="container">
                    <h2 className="text-mask">WHAT TO EXPECT</h2>
                    <div className="expectations">
                        <div className="expectations__item">
                            <h3 className="expectations__item-title">Workshops</h3>
                            <p className="expectations__item-description">
                                Casino, Rueda, Suelta, Reggaeton, Rumba, and Afro
                            </p>
                        </div>

                        <div className="expectations__item">
                            <h3 className="expectations__item-title">Socials</h3>
                            <p className="expectations__item-description">
                                Electrifying social dance events where the community comes
                                together to celebrate Cuban rhythms, connect with fellow
                                dancers, and experience the joy of salsa in a vibrant,
                                welcoming atmosphere.
                            </p>
                        </div>

                        <div className="expectations__item">
                            <h3 className="expectations__item-title">Performances</h3>
                            <p className="expectations__item-description">
                                Captivating performances by world-class artists and talented
                                dancers showcasing the beauty and passion of Cuban
                                dance styles.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Genre Typography Section */}
            <section className="section-typographic" style={{ padding: 'var(--space-xl) 0' }}>
                <div className="container">
                    <h2 className="text-glitch" data-text="GENRES">GENRES</h2>
                    <div className="gallery-typographic">
                        <div className="gallery-item-type" data-number="01">
                            <h3 className="gallery-type-title">SALSA</h3>
                            <p className="gallery-type-meta">The heartbeat of Cuban music</p>
                            <p className="gallery-type-description">
                                Fast rhythms • Partner dancing • Social energy
                            </p>
                        </div>
                        <div className="gallery-item-type" data-number="02">
                            <h3 className="gallery-type-title">RUMBA</h3>
                            <p className="gallery-type-meta">Sacred rhythms of the ancestors</p>
                            <p className="gallery-type-description">
                                Percussion • Storytelling • Connection
                            </p>
                        </div>
                        <div className="gallery-item-type" data-number="03">
                            <h3 className="gallery-type-title">SON CUBANO</h3>
                            <p className="gallery-type-meta">The foundation of Latin music</p>
                            <p className="gallery-type-description">
                                Elegance • Classic • Timeless
                            </p>
                        </div>
                        <div className="gallery-item-type" data-number="04">
                            <h3 className="gallery-type-title">TIMBA</h3>
                            <p className="gallery-type-meta">Modern Cuban fusion</p>
                            <p className="gallery-type-description">
                                Complex rhythms • High Energy • Contemporary edge
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Typography-driven Call to Action */}
            <section
                className="section-typographic"
                style={{ padding: 'var(--space-xl) 0', paddingBottom: '50px' }}
            >
                <div className="container">
                    <div className="text-composition">
                        <div className="text-block-large">
                            JOIN US FOR AN AMAZING<br />
                            <span>WEEKEND</span><br />
                            OF DANCE
                        </div>
                        <div className="text-block-mono">
                            LIMITED TICKETS • EARLY BIRD PRICING • VIP PACKAGES<br />
                            <span style={{ color: 'var(--color-red)' }}>// MAY 15-17, 2026</span><br />
                            <span style={{ color: 'var(--color-red)' }}>// TICKETS COMING SOON</span>
                        </div>
                    </div>
                    <div style={{ textAlign: 'center', marginTop: 'var(--space-3xl)' }}>
                        <a href="/tickets" className="form-button-type">GET TICKETS NOW</a>
                    </div>
                </div>
            </section>
        </main>
    );
}

export default function HomePage() {
    return (
        <AppProviders>
            <HomePageContent />
        </AppProviders>
    );
}

import React from 'react';
import { AppProviders } from '../providers/AppProviders';
import NewsletterForm from '../components/contact/NewsletterForm';

function ContactPageContent() {
    return (
        <main>
            {/* Hero Splash Image */}
            <section className="gallery-hero-splash">
                <div className="hero-image-container">
                    <img
                        id="hero-splash-image"
                        src=""
                        alt="Connect with A Lo Cubano Boulder Fest team and community through various contact channels"
                        className="hero-splash-img"
                        style={{ objectPosition: 'top center' }}
                    />
                </div>
            </section>

            {/* Contact Content */}
            <section className="section-typographic">
                <div className="container">
                    {/* Contact Header */}
                    <div
                        className="contact-header"
                        style={{ textAlign: 'center', marginBottom: 'var(--space-4xl)' }}
                    >
                        <h1 className="text-display text-mask">GET IN TOUCH</h1>
                        <p
                            className="font-serif"
                            style={{
                                fontSize: 'var(--font-size-lg)',
                                marginTop: 'var(--space-lg)',
                            }}
                        >
                            We'd love to hear from you
                        </p>
                    </div>

                    {/* Contact Information Section */}
                    <section className="contact-info">
                        <div className="contact-grid">
                            {/* Email Contact */}
                            <div
                                className="contact-item"
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <div>
                                    <h2>Email Us</h2>
                                    <p>
                                        For general inquiries, partnerships, artist applications, or
                                        any questions about the festival:
                                    </p>
                                </div>
                                <a
                                    href="mailto:alocubanoboulderfest@gmail.com"
                                    className="contact-link email-link"
                                    style={{ marginTop: 'auto' }}
                                >
                                    <span className="contact-icon">✉</span>
                                    alocubanoboulderfest@
                                </a>
                            </div>

                            {/* Social Media */}
                            <div
                                className="contact-item"
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <div>
                                    <h2>Follow Us</h2>
                                    <p>
                                        Stay connected with the latest festival updates,
                                        behind-the-scenes content, and community highlights:
                                    </p>
                                </div>
                                <a
                                    href="https://www.instagram.com/alocubano.boulderfest/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="contact-link social-link"
                                    style={{ marginTop: 'auto' }}
                                >
                                    <img
                                        src="/images/social/instagram-icon.svg"
                                        alt="Instagram"
                                        className="social-icon"
                                    />
                                    @alocubano.boulderfest
                                </a>
                            </div>

                            {/* WhatsApp Community */}
                            <div
                                className="contact-item"
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <div>
                                    <h2>Join Our Community</h2>
                                    <p>
                                        Connect with fellow dancers, get real-time updates, and be
                                        part of our vibrant community:
                                    </p>
                                </div>
                                <a
                                    href="https://chat.whatsapp.com/KadIVdb24RWKdIKGtipnLH"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="contact-link whatsapp-link"
                                    style={{ marginTop: 'auto' }}
                                >
                                    <img
                                        src="/images/social/whatsapp-icon.svg"
                                        alt="WhatsApp"
                                        className="social-icon"
                                    />
                                    WhatsApp Community
                                </a>
                            </div>

                            {/* Feedback Survey */}
                            <div
                                className="contact-item contact-item-feedback"
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <div>
                                    <h2>Share Your Feedback</h2>
                                    <p>
                                        Help us improve! Take our comprehensive survey to share your
                                        thoughts, suggestions, and experiences:
                                    </p>
                                </div>
                                <a
                                    href="https://docs.google.com/forms/d/e/1FAIpQLSerSHrEqY7jMZVfzj59XtAbBIYEbElsmHkhzynecGbrLilI7g/viewform?usp=header"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="contact-link"
                                    style={{ marginTop: 'auto' }}
                                >
                                    <span className="contact-icon">📝</span>
                                    Feedback Survey
                                </a>
                            </div>

                            {/* Newsletter Signup */}
                            <div
                                className="contact-item contact-newsletter"
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <div>
                                    <h1>Hear from us!</h1>
                                    <p>
                                        Be the first to know about festival updates, artist
                                        announcements, and exclusive pre-sale ticket access.
                                    </p>
                                </div>

                                <NewsletterForm />
                            </div>
                        </div>
                    </section>
                </div>
            </section>
        </main>
    );
}

export default function ContactPage() {
    return (
        <AppProviders>
            <ContactPageContent />
        </AppProviders>
    );
}

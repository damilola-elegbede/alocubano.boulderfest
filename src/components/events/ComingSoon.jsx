/**
 * ComingSoon - Placeholder for upcoming event content
 *
 * Displays a "coming soon" message for sections that don't have content yet.
 * Optionally includes a newsletter signup prompt.
 *
 * Usage:
 *   import ComingSoon from './ComingSoon';
 *
 *   <ComingSoon
 *     title="Artists Coming Soon"
 *     message="Our 2026 lineup is being finalized."
 *     showNewsletter={true}
 *   />
 */

import React from 'react';

export default function ComingSoon({
    title = 'Coming Soon',
    message = 'Check back later for updates.',
    showNewsletter = false,
}) {
    return (
        <section className="section-typographic">
            <div className="container">
                <div
                    style={{
                        textAlign: 'center',
                        padding: 'var(--space-xl) 0',
                    }}
                >
                    <h2
                        className="text-gradient"
                        style={{
                            fontSize: 'var(--font-size-3xl)',
                            marginBottom: 'var(--space-lg)',
                        }}
                    >
                        {title}
                    </h2>

                    <p
                        style={{
                            fontFamily: 'var(--font-serif)',
                            fontSize: 'var(--font-size-lg)',
                            fontStyle: 'italic',
                            color: 'var(--color-gray-500)',
                            maxWidth: '600px',
                            margin: '0 auto var(--space-xl)',
                        }}
                    >
                        {message}
                    </p>

                    {showNewsletter && (
                        <div
                            style={{
                                marginTop: 'var(--space-xl)',
                                padding: 'var(--space-lg)',
                                background: 'var(--color-surface)',
                                borderRadius: 'var(--radius-md)',
                                maxWidth: '500px',
                                margin: '0 auto',
                            }}
                        >
                            <h3
                                style={{
                                    fontFamily: 'var(--font-display)',
                                    fontSize: 'var(--font-size-lg)',
                                    marginBottom: 'var(--space-md)',
                                }}
                            >
                                Stay Updated
                            </h3>
                            <p
                                style={{
                                    fontSize: 'var(--font-size-sm)',
                                    marginBottom: 'var(--space-md)',
                                }}
                            >
                                Sign up for our newsletter to be the first to know!
                            </p>
                            <a
                                href="/contact#newsletter"
                                className="btn btn-primary"
                                style={{
                                    display: 'inline-block',
                                    padding: 'var(--space-md) var(--space-lg)',
                                }}
                            >
                                Subscribe
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}

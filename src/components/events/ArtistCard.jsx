/**
 * ArtistCard - Individual artist display card
 *
 * Displays artist information in the typographic gallery style:
 * - Number badge
 * - Artist name
 * - Dance styles
 * - Quote
 * - Description bullets
 * - Tags (blue/red)
 *
 * Usage:
 *   import ArtistCard from './ArtistCard';
 *
 *   <ArtistCard
 *     artist={{
 *       name: 'Laroye',
 *       number: '01',
 *       styles: ['Orishas', 'Rumba'],
 *       quote: 'Master of traditions',
 *       description: ['Teaching Orishas', 'Rumba fundamentals'],
 *       tags: [{ text: 'AMBASSADOR', color: 'blue' }]
 *     }}
 *   />
 */

import React from 'react';

export default function ArtistCard({ artist }) {
    const {
        name,
        number,
        styles = [],
        quote,
        description = [],
        tags = [],
    } = artist;

    // Format name for multi-line display (split on & or 'and')
    const formatName = (artistName) => {
        if (!artistName) return '';

        // Check for partner names
        if (artistName.includes(' & ') || artistName.includes(' and ')) {
            const parts = artistName.split(/\s+(?:&|and)\s+/i);
            return parts.map((part, i) => (
                <React.Fragment key={i}>
                    {part.toUpperCase()}
                    {i < parts.length - 1 && (
                        <>
                            <br />& {' '}
                        </>
                    )}
                </React.Fragment>
            ));
        }

        // Check for first + last name (split on space for display)
        const nameParts = artistName.split(' ');
        if (nameParts.length === 2) {
            return (
                <>
                    {nameParts[0].toUpperCase()}
                    <br />
                    {nameParts[1].toUpperCase()}
                </>
            );
        }

        return artistName.toUpperCase();
    };

    return (
        <article className="gallery-item-type" data-number={number}>
            <h3 className="gallery-type-title font-display">
                {formatName(name)}
            </h3>

            {styles.length > 0 && (
                <p className="gallery-type-meta">
                    {styles.join(' • ').toUpperCase()}
                </p>
            )}

            {quote && (
                <p className="gallery-type-description font-serif">
                    "{quote}"
                </p>
            )}

            {description.length > 0 && (
                <div
                    className="text-block-mono"
                    style={{
                        marginTop: 'var(--space-md)',
                        fontSize: 'var(--font-size-xs)',
                    }}
                >
                    {description.map((line, index) => (
                        <React.Fragment key={index}>
                            {line}
                            {index < description.length - 1 && <br />}
                        </React.Fragment>
                    ))}
                </div>
            )}

            {tags.length > 0 && (
                <div style={{ marginTop: 'var(--space-lg)' }}>
                    {tags.map((tag, index) => (
                        <React.Fragment key={index}>
                            <span
                                className="text-split font-mono"
                                style={{
                                    fontSize: 'var(--font-size-xs)',
                                    color: tag.color === 'blue'
                                        ? 'var(--color-blue)'
                                        : 'var(--color-red)',
                                }}
                            >
                                {tag.text}
                            </span>
                            {index < tags.length - 1 && <br />}
                        </React.Fragment>
                    ))}
                </div>
            )}
        </article>
    );
}

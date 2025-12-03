/**
 * DJCard - Individual DJ display card
 *
 * Displays DJ information in the typographic gallery style with glitch effect:
 * - DJ badge
 * - DJ name with glitch effect
 * - Description
 *
 * Usage:
 *   import DJCard from './DJCard';
 *
 *   <DJCard
 *     dj={{
 *       name: 'DJ Byron',
 *       description: 'The authentic sound master'
 *     }}
 *   />
 */

import React from 'react';

export default function DJCard({ dj }) {
    const { name, description } = dj;

    return (
        <div className="gallery-item-type" data-number="DJ">
            <h3
                className="gallery-type-title text-glitch"
                data-text={name}
            >
                {name}
            </h3>
            {description && (
                <p className="gallery-type-description">
                    {description}
                </p>
            )}
        </div>
    );
}

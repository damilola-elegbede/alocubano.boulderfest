/**
 * EventHeroSplash - Hero image section for event pages
 *
 * Displays the full-width hero splash image for the current event.
 * Supports optimized image variants (AVIF, WebP, JPEG) with responsive sizes.
 *
 * Usage:
 *   import EventHeroSplash from './EventHeroSplash';
 *
 *   function EventPage() {
 *     return (
 *       <EventProvider eventId="boulder-fest-2025" currentPage="overview">
 *         <EventHeroSplash />
 *       </EventProvider>
 *     );
 *   }
 */

import React, { useMemo } from 'react';
import { useEvent } from '../../hooks/useEvent.js';

export default function EventHeroSplash() {
    const { heroImage, heroAlt, eventId } = useEvent();

    // Generate optimized image paths
    const imagePaths = useMemo(() => {
        if (!heroImage) return null;

        // Extract the base name from the hero image path
        // e.g., '/images/hero/boulder-fest-2025-hero.jpg' -> 'boulder-fest-2025-hero'
        const baseName = heroImage
            .split('/')
            .pop()
            .replace(/\.(jpg|jpeg|png|webp|avif)$/i, '');

        return {
            original: heroImage,
            desktop: {
                avif: `/images/hero-optimized/desktop/${baseName}.avif`,
                webp: `/images/hero-optimized/desktop/${baseName}.webp`,
                jpg: `/images/hero-optimized/desktop/${baseName}.jpg`,
            },
            mobile: {
                avif: `/images/hero-optimized/mobile/${baseName}.avif`,
                webp: `/images/hero-optimized/mobile/${baseName}.webp`,
                jpg: `/images/hero-optimized/mobile/${baseName}.jpg`,
            },
        };
    }, [heroImage]);

    if (!heroImage) {
        return null;
    }

    return (
        <section className="gallery-hero-splash">
            <div className="hero-image-container">
                <picture>
                    {/* Mobile AVIF */}
                    <source
                        media="(max-width: 768px)"
                        srcSet={imagePaths.mobile.avif}
                        type="image/avif"
                    />
                    {/* Mobile WebP */}
                    <source
                        media="(max-width: 768px)"
                        srcSet={imagePaths.mobile.webp}
                        type="image/webp"
                    />
                    {/* Mobile JPEG */}
                    <source
                        media="(max-width: 768px)"
                        srcSet={imagePaths.mobile.jpg}
                        type="image/jpeg"
                    />
                    {/* Desktop AVIF */}
                    <source
                        srcSet={imagePaths.desktop.avif}
                        type="image/avif"
                    />
                    {/* Desktop WebP */}
                    <source
                        srcSet={imagePaths.desktop.webp}
                        type="image/webp"
                    />
                    {/* Desktop JPEG */}
                    <source
                        srcSet={imagePaths.desktop.jpg}
                        type="image/jpeg"
                    />
                    {/* Fallback to original */}
                    <img
                        src={heroImage}
                        alt={heroAlt}
                        className="hero-splash-img"
                        style={{ objectPosition: 'top center' }}
                        loading="eager"
                        fetchpriority="high"
                    />
                </picture>
            </div>
        </section>
    );
}

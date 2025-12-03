/**
 * EventContext - Context provider for event-specific data
 *
 * Provides event metadata, navigation state, and configuration
 * for event sub-site pages (Boulder Fest, Weekenders, etc.)
 *
 * Usage:
 *   import { EventProvider } from './contexts/EventContext';
 *   import { useEvent } from './hooks/useEvent';
 *
 *   // In page component
 *   function BoulderFest2025ArtistsPage() {
 *     return (
 *       <AppProviders>
 *         <EventProvider eventId="boulder-fest-2025" currentPage="artists">
 *           <ArtistsPageContent />
 *         </EventProvider>
 *       </AppProviders>
 *     );
 *   }
 *
 *   // In child component
 *   function ArtistsPageContent() {
 *     const { title, basePath, currentPage } = useEvent();
 *     // ...
 *   }
 */

import React, { createContext, useMemo } from 'react';

// Event data imports
import { boulderFest2025 } from '../data/events/boulder-fest-2025.js';
import { boulderFest2026 } from '../data/events/boulder-fest-2026.js';
import { weekender202511 } from '../data/events/weekender-2025-11.js';

export const EventContext = createContext(null);

/**
 * Event data registry
 * Maps eventId to static event configuration
 */
const eventRegistry = {
    'boulder-fest-2025': boulderFest2025,
    'boulder-fest-2026': boulderFest2026,
    'weekender-2025-11': weekender202511,
};

/**
 * Compute event status based on dates
 * @param {Object} dates - { start: string, end: string }
 * @returns {'upcoming' | 'current' | 'past'}
 */
function computeEventStatus(dates) {
    if (!dates || !dates.start || !dates.end) {
        return 'upcoming';
    }

    const now = new Date();
    const start = new Date(dates.start);
    const end = new Date(dates.end);

    // Set end to end of day
    end.setHours(23, 59, 59, 999);

    if (now < start) {
        return 'upcoming';
    } else if (now <= end) {
        return 'current';
    } else {
        return 'past';
    }
}

/**
 * Get base path for an event
 * @param {string} eventId
 * @returns {string}
 */
function getBasePath(eventId) {
    // Map eventId to URL path
    const pathMap = {
        'boulder-fest-2025': '/boulder-fest-2025',
        'boulder-fest-2026': '/boulder-fest-2026',
        'weekender-2025-11': '/weekender-2025-11',
    };
    return pathMap[eventId] || `/${eventId}`;
}

/**
 * EventProvider component
 *
 * @param {Object} props
 * @param {string} props.eventId - Event identifier (e.g., 'boulder-fest-2025')
 * @param {string} props.currentPage - Current page within event ('overview' | 'artists' | 'schedule' | 'gallery')
 * @param {React.ReactNode} props.children
 */
export function EventProvider({ eventId, currentPage, children }) {
    const event = useMemo(() => {
        const data = eventRegistry[eventId];

        if (!data) {
            console.warn(`EventProvider: Unknown eventId "${eventId}"`);
            return {
                eventId,
                eventType: 'unknown',
                year: '',
                title: 'Unknown Event',
                subtitle: '',
                dates: { start: '', end: '' },
                status: 'upcoming',
                basePath: `/${eventId}`,
                pages: ['overview', 'artists', 'schedule', 'gallery'],
                currentPage: currentPage || 'overview',
                heroImage: '',
                heroAlt: '',
                venue: null,
                hasGallery: false,
                hasSchedule: false,
                isComingSoon: true,
            };
        }

        const status = computeEventStatus(data.dates);
        const basePath = getBasePath(eventId);

        return {
            // Identity
            eventId,
            eventType: data.eventType,
            year: data.year,

            // Display
            title: data.title,
            subtitle: data.subtitle,

            // Dates
            dates: data.dates,
            status,

            // Navigation
            basePath,
            pages: data.pages || ['overview', 'artists', 'schedule', 'gallery'],
            currentPage: currentPage || 'overview',

            // Hero
            heroImage: data.heroImage,
            heroAlt: data.heroAlt,

            // Venue
            venue: data.venue,

            // Feature flags
            hasGallery: data.hasGallery ?? false,
            hasSchedule: data.hasSchedule ?? false,
            isComingSoon: data.isComingSoon ?? (status === 'upcoming'),

            // Additional data for page components
            artists: data.artists || [],
            djs: data.djs || [],
            schedule: data.schedule || [],
            featuredArtist: data.featuredArtist || null,

            // Social/Links
            socialLinks: data.socialLinks || {},
            externalLinks: data.externalLinks || {},
        };
    }, [eventId, currentPage]);

    return (
        <EventContext.Provider value={event}>
            {children}
        </EventContext.Provider>
    );
}

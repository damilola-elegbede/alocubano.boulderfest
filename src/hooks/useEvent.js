/**
 * useEvent - Hook to access EventContext
 *
 * Provides event-specific data for event sub-site pages.
 * Must be used within an EventProvider.
 *
 * Usage:
 *   import { useEvent } from '../hooks/useEvent';
 *
 *   function ArtistsPageContent() {
 *     const {
 *       eventId,
 *       eventType,
 *       title,
 *       basePath,
 *       currentPage,
 *       artists,
 *       djs,
 *       isComingSoon
 *     } = useEvent();
 *
 *     return (
 *       <div>
 *         <h1>{title} - Artists</h1>
 *         {isComingSoon ? (
 *           <p>Coming Soon!</p>
 *         ) : (
 *           <ArtistGrid artists={artists} />
 *         )}
 *       </div>
 *     );
 *   }
 *
 * @returns {Object} Event context value containing:
 *   - eventId: string - Event identifier
 *   - eventType: 'boulder-fest' | 'weekender' - Type of event
 *   - year: string - Event year
 *   - title: string - Display title
 *   - subtitle: string - Date/subtitle text
 *   - dates: { start: string, end: string } - Event dates
 *   - status: 'upcoming' | 'current' | 'past' - Computed status
 *   - basePath: string - URL base path
 *   - pages: string[] - Available sub-pages
 *   - currentPage: string - Current active page
 *   - heroImage: string - Hero image path
 *   - heroAlt: string - Hero image alt text
 *   - venue: { name: string, address: string } | null - Venue info
 *   - hasGallery: boolean - Has gallery content
 *   - hasSchedule: boolean - Has schedule content
 *   - isComingSoon: boolean - Show coming soon placeholders
 *   - artists: Array - Artist data
 *   - djs: Array - DJ data
 *   - schedule: Array - Schedule data
 *   - featuredArtist: Object | null - Featured artist (weekenders)
 *   - socialLinks: Object - Social media links
 *   - externalLinks: Object - External links
 */

import { useContext } from 'react';
import { EventContext } from '../contexts/EventContext.jsx';

export function useEvent() {
    const context = useContext(EventContext);

    if (context === null) {
        throw new Error('useEvent must be used within an EventProvider');
    }

    return context;
}

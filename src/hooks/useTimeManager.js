/**
 * useTimeManager - Custom hook for accessing time utilities
 *
 * Provides convenient access to Mountain Time formatting utilities.
 * Must be used within a TimeProvider.
 *
 * Returns:
 *   - timeManager: The complete timeManager singleton
 *   - formatEventTime: Format dates/times flexibly
 *   - toMountainTime: Full datetime with timezone
 *   - formatDate: Date only formatting
 *   - formatDateTime: Date + time + timezone
 *   - formatDuration: Human-readable duration
 *   - getCurrentTime: Current time in Mountain Time
 *   - getTimezoneInfo: Timezone details (abbr, DST, offset)
 *   - isExpired: Check if date has passed
 *   - getRegistrationDeadline: Deadline N hours from now
 *   - getCountdownTargetDate: For countdown timers
 *
 * Usage:
 *   function EventCard({ eventDate }) {
 *     const { formatDateTime, isExpired } = useTimeManager();
 *
 *     return (
 *       <div>
 *         <p>{formatDateTime(eventDate)}</p>
 *         {isExpired(eventDate) && <span>Event has ended</span>}
 *       </div>
 *     );
 *   }
 */

import { useContext } from 'react';
import { TimeContext } from '../contexts/TimeContext.jsx';

export function useTimeManager() {
    const context = useContext(TimeContext);

    if (context === null) {
        throw new Error('useTimeManager must be used within a TimeProvider');
    }

    return context;
}

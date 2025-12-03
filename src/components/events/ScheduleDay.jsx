/**
 * ScheduleDay - Single day schedule display
 *
 * Displays all schedule items for a single day:
 * - Day header (e.g., "Friday")
 * - Date subheader (e.g., "May 15, 2025")
 * - List of ScheduleItem components
 *
 * Usage:
 *   import ScheduleDay from './ScheduleDay';
 *
 *   <ScheduleDay
 *     day={{
 *       day: 'Friday',
 *       date: 'May 15, 2025',
 *       items: [{ time: '7:00 PM', title: 'Opening Workshop', ... }]
 *     }}
 *   />
 */

import React from 'react';
import ScheduleItem from './ScheduleItem.jsx';

export default function ScheduleDay({ day }) {
    const { day: dayName, date, items = [] } = day;

    return (
        <div className="schedule-day">
            <h3>{dayName}</h3>
            <p style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-gray-500)',
                marginBottom: 'var(--space-md)',
            }}>
                {date}
            </p>

            {items.map((item, index) => (
                <ScheduleItem key={index} item={item} />
            ))}
        </div>
    );
}

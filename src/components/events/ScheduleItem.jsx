/**
 * ScheduleItem - Individual schedule entry
 *
 * Displays a single schedule item:
 * - Time slot
 * - Title (with gradient for social events)
 * - Description
 * - Instructor (if applicable)
 * - Venue
 * - Level (if applicable)
 *
 * Usage:
 *   import ScheduleItem from './ScheduleItem';
 *
 *   <ScheduleItem
 *     item={{
 *       time: '10:00 AM - 11:30 AM',
 *       title: 'Timba Suelta',
 *       instructor: 'Malena & Adriel',
 *       description: 'Partner work and Timba styling',
 *       venue: 'Room A',
 *       level: 'Intermediate',
 *       isSocial: false
 *     }}
 *   />
 */

import React from 'react';

export default function ScheduleItem({ item }) {
    const {
        time,
        title,
        description,
        instructor,
        venue,
        level,
        isSocial = false,
    } = item;

    return (
        <div className="schedule-item">
            <span className="schedule-time">{time}</span>
            <div className="schedule-content">
                <h4 className={isSocial ? 'schedule-social' : ''}>
                    {title}
                </h4>

                {description && (
                    <p style={{
                        margin: 'var(--space-xs) 0 0',
                        fontSize: 'var(--font-size-sm)',
                    }}>
                        {description}
                    </p>
                )}

                {instructor && (
                    <p className="instructor">
                        with {instructor}
                    </p>
                )}

                {venue && (
                    <p className="venue">
                        {venue}
                        {level && ` • ${level}`}
                    </p>
                )}
            </div>
        </div>
    );
}
